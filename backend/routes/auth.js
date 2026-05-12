const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();

const supabase = require('../config/supabase');

// LOGIN
router.post('/login', async (req, res) => {
  try {

    const { email, password } = req.body;

    // FETCH USER
    const {
      data: users,
      error
    } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (error) {
      console.error(
        'SUPABASE ERROR:',
        error
      );

      throw error;
    }

    // USER NOT FOUND
    if (!users || users.length === 0) {

      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    const user = users[0];

    // DISABLED USER
    if (!user.active) {

      return res.status(403).json({
        message: 'Account disabled'
      });
    }

    // PASSWORD CHECK
    const validPassword =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!validPassword) {

      return res.status(401).json({
        message: 'Invalid credentials'
      });
    }

    // JWT TOKEN
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET,
      {
        expiresIn: '7d'
      }
    );

    // SAFE USER OBJECT
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      division: user.division,
      active: user.active
    };

    // SUCCESS RESPONSE
    res.json({
      success: true,
      token,
      user: safeUser
    });

  } catch (error) {

    console.error(
      'LOGIN ERROR:',
      error
    );

    res.status(500).json({
      success: false,
      message: 'Login failed',
      error:
        process.env.NODE_ENV ===
        'development'
          ? error.message
          : undefined
    });
  }
});

// GET TEAM MEMBERS
router.get(
  '/team-members',
  async (req, res) => {

    try {

      const {
        data,
        error
      } = await supabase
        .from('users')
        .select(
          'id,name,email,role,division'
        )
        .eq(
          'role',
          'Team Member'
        )
        .eq(
          'active',
          true
        );

      if (error) {

        console.error(
          'TEAM MEMBERS ERROR:',
          error
        );

        throw error;
      }

      res.json(data);

    } catch (error) {

      console.error(
        'FETCH TEAM MEMBERS ERROR:',
        error
      );

      res.status(500).json({
        message:
          'Failed to fetch team members'
      });
    }
  }
);

module.exports = router;