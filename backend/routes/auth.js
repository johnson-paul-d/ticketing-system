const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const supabase = require('../config/supabase');

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);
    if (error) throw error;
    if (!users || users.length === 0)
      return res.status(401).json({ message: 'Invalid credentials' });

    const user = users[0];
    if (!user.active) return res.status(403).json({ message: 'Account disabled' });

    const validPassword = await bcrypt.compare(password.trim(), user.password.trim());
    if (!validPassword) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      division: user.division,
      active: user.active,
    };
    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    console.error('LOGIN ERROR:', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// GET team members (for assignment)
router.get('/team-members', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,name,email,role,division')
      .eq('role', 'Team Member')
      .eq('active', true);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch team members' });
  }
});

module.exports = router;