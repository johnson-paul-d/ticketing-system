const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const supabase = require('../config/supabase');

// LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('Login attempt:', email);

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ message: 'Database error' });
    }

    if (!users || users.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const user = users[0];

    if (!user.active) {
      return res.status(403).json({ message: 'Account disabled' });
    }

    const validPassword = await bcrypt.compare(password.trim(), user.password.trim());
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

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

// TEMPORARY: Create first admin (remove after first use)
router.post('/setup-admin', async (req, res) => {
  try {
    const email = 'ramenaathan@siegerglobal.net';
    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    const { error } = await supabase.from('users').insert([{
      name: 'Admin',
      email,
      password: hashedPassword,
      role: 'Admin',
      division: 'CPS',
      active: true,
    }]);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ message: 'Admin created. Login with admin123' });
  } catch (err) {
    console.error('Setup error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET team members
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