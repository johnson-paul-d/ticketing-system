const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const { isSuperAdmin, teamFromRole, getUserTeam } = require('../utils/roles');

// Every query names its columns so the password hash can never leak to a client.
const USER_COLUMNS = 'id, name, email, role, division, active, created_at';

// The only columns an admin may write. Anything else in the body (id,
// created_at, columns added later) is dropped instead of reaching Supabase.
const EDITABLE_FIELDS = ['name', 'email', 'role', 'division', 'active', 'password'];

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

// A team admin may only act on users whose role resolves to their own team.
// sameTeam() is deliberately not used here: it treats a null team as "matches
// everyone", which would let a Marketing admin manage a Super Admin.
const canManage = (actor, targetRole) =>
  isSuperAdmin(actor) || teamFromRole(targetRole) === getUserTeam(actor);

// Supabase runs with the service-role key and no RLS, so the target has to be
// read back before a write to know which team it belongs to.
const findUser = async (id) => {
  const { data, error } = await supabase
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', id)
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
};

// GET all users (admin only) – team admins see only their own team
router.get('/', auth, admin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select(USER_COLUMNS)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json((data || []).filter((u) => canManage(req.user, u.role)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// CREATE user
router.post('/', auth, admin, async (req, res) => {
  try {
    const { name, email, password, role, division } = req.body;

    // A row with a null/blank password can never be logged into and fails with
    // an opaque error, so reject it up front.
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Without this a team admin could mint a Super Admin account they control
    // and escalate that way.
    if (!canManage(req.user, role)) {
      return res.status(403).json({ message: 'You can only create users on your own team' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert([{ name, email, password: hashedPassword, role, division, active: true }])
      .select(USER_COLUMNS);
    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// UPDATE user (admin only) – supports password update
router.put('/:id', auth, admin, async (req, res) => {
  try {
    // Deactivating yourself is how an org locks itself out of the admin panel.
    if (String(req.user.id) === String(req.params.id) && 'active' in req.body && !req.body.active) {
      return res.status(400).json({ message: 'You cannot deactivate your own account' });
    }

    const target = await findUser(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!canManage(req.user, target.role)) {
      return res.status(403).json({ message: 'You can only manage users on your own team' });
    }

    // The role string carries both the privilege level and the team, so an
    // admin who could write it could promote themselves to Super Admin. This
    // has to be an error rather than a silent drop — the admin panel would
    // otherwise show the change as saved.
    if ('role' in req.body && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only a Super Admin can change a user role' });
    }

    const updateData = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in req.body) updateData[field] = req.body[field];
    }

    if ('password' in updateData) {
      if (!isNonEmptyString(updateData.password)) {
        return res.status(400).json({ message: 'Password cannot be empty' });
      }
      updateData.password = await bcrypt.hash(updateData.password, 10);
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'No updatable fields provided' });
    }

    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'User updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update user' });
  }
});

// DELETE user (admin only)
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    if (String(req.user.id) === String(req.params.id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const target = await findUser(req.params.id);
    if (!target) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!canManage(req.user, target.role)) {
      return res.status(403).json({ message: 'You can only manage users on your own team' });
    }

    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ message: 'User deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Delete failed' });
  }
});

module.exports = router;
