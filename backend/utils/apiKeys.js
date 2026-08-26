// =====================================================
// API key minting, hashing and lookup
// =====================================================
// A key is a standing grant of one user's permissions to a machine. Everything
// here exists to keep that grant narrow, attributable and revocable.

const crypto = require('crypto');
const supabase = require('../config/supabase');

// Identifiable on sight, so a leaked key can be recognised in a log, a paste or
// a commit diff without anyone having to test it against the API.
const PREFIX = 'stk_';

// 32 bytes of CSPRNG output. At that size the secret cannot be brute-forced,
// which is what lets the digest below be a plain SHA-256 instead of bcrypt.
const SECRET_BYTES = 32;

// Enough of the secret to tell two keys apart in a list, and far too little to
// narrow down the rest.
const VISIBLE_CHARS = PREFIX.length + 6;

const generateKey = () => `${PREFIX}${crypto.randomBytes(SECRET_BYTES).toString('base64url')}`;

const hashKey = (key) => crypto.createHash('sha256').update(key, 'utf8').digest('hex');

const keyPrefix = (key) => String(key).slice(0, VISIBLE_CHARS);

// Cheap enough to run on every request, and it means a malformed Authorization
// header never reaches the database.
const looksLikeApiKey = (value) => typeof value === 'string' && value.startsWith(PREFIX);

// ---------------------------------------------------------------
// Lookup cache
// ---------------------------------------------------------------
// Without this, every authenticated request an agent makes costs a round trip
// to Supabase before it does any work of its own.
//
// The entry is short-lived because it is the only thing standing between
// revoking a key and the key actually stopping. Thirty seconds is the window in
// which a revoked key still works; revokeCached() closes it immediately for the
// instance that processed the revocation, which is the only instance there is
// today. If this ever runs on more than one Render instance, this window is the
// thing to shorten or move to Redis.
const CACHE_TTL_MS = 30 * 1000;
const cache = new Map(); // hash -> { expiresAt, principal }

setInterval(() => {
  const now = Date.now();
  for (const [hash, entry] of cache) if (entry.expiresAt < now) cache.delete(hash);
}, 60 * 1000).unref();

const revokeCached = (hash) => cache.delete(hash);
const clearCache = () => cache.clear();

// last_used_at is worth having — it is how you find the key nobody needs any
// more — but not worth a write on every request. One write per cache miss is
// close enough to answer "is this key still in use", and it never blocks the
// request: a failure here must not fail an otherwise valid call.
const touch = (id) => {
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', id)
    .then(
      () => {},
      () => {}
    );
};

/**
 * Resolves a raw API key to the user it acts as.
 *
 * Returns { user, key } on success, or { error } with a reason meant for the
 * caller. The reasons are deliberately specific — an agent that has been
 * revoked should be told so rather than left retrying a 401 forever — and
 * deliberately harmless: none of them confirm that some *other* key exists.
 */
const resolveApiKey = async (rawKey) => {
  const hash = hashKey(rawKey);
  const now = Date.now();

  const cached = cache.get(hash);
  if (cached && cached.expiresAt > now) {
    return cached.principal.error ? cached.principal : { ...cached.principal };
  }

  const { data: key, error } = await supabase
    .from('api_keys')
    .select('id, name, user_id, read_only, expires_at, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle();

  // A schema error is the unrun migration, not a bad key. It has to be
  // distinguishable, or the first person to try a key before running the SQL
  // spends the afternoon convinced they mistyped it.
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { error: 'API keys are not enabled on this server', status: 501 };
    }
    throw error;
  }

  // Not cached: an unknown key is exactly what an attacker probes with, and
  // caching those lets them fill the map for free.
  if (!key) return { error: 'Invalid API key', status: 401 };

  const reject = (message) => {
    const principal = { error: message, status: 401 };
    cache.set(hash, { expiresAt: now + CACHE_TTL_MS, principal });
    return principal;
  };

  if (key.revoked_at) return reject('This API key has been revoked');
  if (key.expires_at && new Date(key.expires_at).getTime() <= now) {
    return reject('This API key has expired');
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, name, email, role, active')
    .eq('id', key.user_id)
    .maybeSingle();
  if (userError) throw userError;

  // The key carries a user's permissions, so it cannot outlive their access.
  // Disabling the account is the fastest way to stop every key it owns at once.
  if (!user) return reject('The account behind this API key no longer exists');
  if (!user.active) return reject('The account behind this API key is disabled');

  const principal = {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    key: { id: key.id, name: key.name, readOnly: key.read_only === true },
  };

  cache.set(hash, { expiresAt: now + CACHE_TTL_MS, principal });
  touch(key.id);

  return { ...principal };
};

module.exports = {
  PREFIX,
  generateKey,
  hashKey,
  keyPrefix,
  looksLikeApiKey,
  resolveApiKey,
  revokeCached,
  clearCache,
};
