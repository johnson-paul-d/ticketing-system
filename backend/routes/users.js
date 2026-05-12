const express = require('express');
const bcrypt = require('bcryptjs');

const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

router.get('/', auth, admin, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', {
        ascending: false
      });

    if (error) throw error;

    const cleaned = data.map((u) => ({
      ...u,
      password: undefined
    }));

    res.json(cleaned);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to fetch users'
    });
  }
});

router.post('/', auth, admin, async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      role,
      division
    } = req.body;

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          name,
          email,
          password: hashedPassword,
          role,
          division,
          active: true
        }
      ])
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to create user'
    });
  }
});

router.put('/:id', auth, admin, async (req, res) => {
  try {
    const { error } = await supabase
      .from('users')
      .update(req.body)
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({
      message: 'User updated'
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: 'Failed to update user'
    });
  }
});

module.exports = router;