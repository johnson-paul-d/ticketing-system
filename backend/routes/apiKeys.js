const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { isSuperAdmin, teamFromRole, getUserTeam } = require('../utils/roles');
const { rateLimit } = require('../utils/rateLimit');
const { generateKey, hashKey, keyPrefix, revokeCached } = require('../utils/apiKeys');

// The same rule the admin panel uses for editing a user, and for the same
// reason. An admin can already create a user on their own team and set their
// password, so minting a key that acts as one of them grants nothing they did
// not already have. A Super Admin is nobody's teammate, so only another Super
// Admin can mint a key that acts as one.
const canManage = (actor, targetRole) =>
  isSuperAdmin(actor) || teamFromRole(targetRole) === getUserTeam(actor);

const isMissingTable = (error) =>
  !!error && (error.code === '42P01' || error.code === 'PGRST205');

const migrationRequired = (res) =>
  res.status(501).json({
    message: 'API keys are not enabled yet - run database/api-keys-migration.sql',
  });

// Never the hash, and never anything from which a key could be reconstructed.
const KEY_COLUMNS =
  'id, name, key_prefix, user_id, created_by, created_by_name, read_only, created_at, expires_at, revoked_at, last_used_at';

const shape = (row, userById) => {
  const owner = userById.get(row.user_id);
  return {
    id: row.id,
    name: row.name,
    key_prefix: row.key_prefix,
    read_only: row.read_only === true,
    acts_as: owner ? { id: owner.id, name: owner.name, email: owner.email, role: owner.role } : null,
    created_by_name: row.created_by_name,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked_at: row.revoked_at,
    last_used_at: row.last_used_at,
    // Derived rather than stored, so a key that has simply run out of time is
    // not left looking live in the list.
    status: row.revoked_at
      ? 'Revoked'
      : row.expires_at && new Date(row.expires_at) <= new Date()
        ? 'Expired'
        : 'Active',
  };
};

// =====================================================
// An API key may not administer API keys.
// =====================================================
// Without this, a key with write access could mint more keys — including ones
// that outlive its own revocation — and there would be no way to be sure that
// revoking a key had actually ended the access it was granted. Minting is a
// thing a person does.
const humansOnly = (req, res, next) => {
  if (req.apiKey) {
    return res.status(403).json({
      message: 'API keys cannot manage API keys. Sign in to mint or revoke one.',
    });
  }
  next();
};

router.use(auth, humansOnly, admin);

// Loads the users an actor is allowed to see keys for, as a lookup.
const manageableUsers = async (actor) => {
  const { data, error } = await supabase.from('users').select('id, name, email, role, active');
  if (error) throw error;
  const map = new Map();
  for (const u of data || []) if (canManage(actor, u.role)) map.set(u.id, u);
  return map;
};

// =====================================================
// LIST
// =====================================================
router.get('/', async (req, res) => {
  try {
    const userById = await manageableUsers(req.user);

    const { data, error } = await supabase
      .from('api_keys')
      .select(KEY_COLUMNS)
      .order('created_at', { ascending: false });

    if (error) {
      if (isMissingTable(error)) return migrationRequired(res);
      throw error;
    }

    // A key acting as someone on another team is none of this admin's business,
    // including the fact that it exists.
    res.json((data || []).filter((k) => userById.has(k.user_id)).map((k) => shape(k, userById)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch API keys' });
  }
});

// =====================================================
// CREATE
// =====================================================
// Rate-limited because this is the one route that hands out a credential, and a
// loop here would quietly fill the table with live keys.
router.post('/', rateLimit({ name: 'api-key-create', windowMs: 60 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const { name, user_id: userId, read_only: readOnly, expires_in_days: expiresInDays } = req.body;

    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ message: 'Give the key a name so it can be told apart later' });
    }
    if (!userId) {
      return res.status(400).json({ message: 'Choose the user this key should act as' });
    }

    const { data: target, error: targetError } = await supabase
      .from('users')
      .select('id, name, email, role, active')
      .eq('id', userId)
      .maybeSingle();
    if (targetError) throw targetError;

    if (!target) return res.status(404).json({ message: 'User not found' });
    if (!canManage(req.user, target.role)) {
      return res.status(403).json({ message: 'You can only create keys for users on your own team' });
    }
    // A key for a disabled account is dead on arrival — resolveApiKey refuses
    // it — so it is refused here instead of shipped as a credential that has
    // never worked.
    if (!target.active) {
      return res.status(400).json({ message: `${target.name} is disabled, so a key for them would not work` });
    }

    let expiresAt = null;
    if (expiresInDays !== undefined && expiresInDays !== null && expiresInDays !== '') {
      const days = Number(expiresInDays);
      if (!Number.isFinite(days) || days <= 0 || days > 3650) {
        return res.status(400).json({ message: 'Expiry must be between 1 and 3650 days' });
      }
      expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
    }

    const key = generateKey();

    const { data, error } = await supabase
      .from('api_keys')
      .insert([
        {
          name: name.trim(),
          key_hash: hashKey(key),
          key_prefix: keyPrefix(key),
          user_id: target.id,
          created_by: req.user.id,
          created_by_name: req.user.name,
          read_only: readOnly === true,
          expires_at: expiresAt,
        },
      ])
      .select(KEY_COLUMNS)
      .single();

    if (error) {
      if (isMissingTable(error)) return migrationRequired(res);
      throw error;
    }

    const userById = new Map([[target.id, target]]);

    // The only time the secret exists outside the caller's own machine. It is
    // not stored anywhere in a form that can be read back, so if this response
    // is lost the key is gone and a new one has to be minted.
    res.json({
      key,
      warning: 'Copy this key now. It cannot be shown again.',
      api_key: shape(data, userById),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create API key' });
  }
});

// =====================================================
// REVOKE
// =====================================================
// The row survives, so "this key was revoked, by whom, and when it was last
// used" stays answerable. A deleted row answers none of that.
router.delete('/:id', async (req, res) => {
  try {
    const { data: key, error: findError } = await supabase
      .from('api_keys')
      .select('id, user_id, key_hash, revoked_at')
      .eq('id', req.params.id)
      .maybeSingle();

    if (findError) {
      if (isMissingTable(findError)) return migrationRequired(res);
      throw findError;
    }
    if (!key) return res.status(404).json({ message: 'API key not found' });

    const { data: owner, error: ownerError } = await supabase
      .from('users')
      .select('role')
      .eq('id', key.user_id)
      .maybeSingle();
    if (ownerError) throw ownerError;

    // A key whose user is gone belongs to nobody, so only a Super Admin can
    // clear it — otherwise it would be unrevokable by anyone.
    if (!canManage(req.user, owner?.role) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'You can only revoke keys for users on your own team' });
    }

    if (key.revoked_at) return res.json({ message: 'That key was already revoked' });

    const { error } = await supabase
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', key.id);
    if (error) throw error;

    // Otherwise the key keeps working for up to the cache TTL after an admin
    // has been told it is dead.
    revokeCached(key.key_hash);

    res.json({ message: 'API key revoked' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to revoke API key' });
  }
});

module.exports = router;
