const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// GET all users (admin only)
router.get('/', auth, admin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    const cleaned = data.map(({ password, ...rest }) => rest);
    res.json(cleaned);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// CREATE user
router.post('/', auth, admin, async (req, res) => {
  try {
    const { name, email, password, role, division } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('users')
      .insert([{ name, email, password: hashedPassword, role, division, active: true }])
      .select();
    if (error) throw error;
    const { password: _, ...safeUser } = data[0];
    res.json(safeUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create user' });
  }
});

// UPDATE user (admin only) – supports password update
router.put('/:id', auth, admin, async (req, res) => {
  try {
    let updateData = { ...req.body };
    if (updateData.password) {
      updateData.password = await bcrypt.hash(updateData.password, 10);
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