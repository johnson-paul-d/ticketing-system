const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const router = express.Router();
const supabase = require('../config/supabase');
const requireAuth = require('../middleware/auth');
const { isAdmin, isSuperAdmin, teamFromRole, getUserTeam } = require('../utils/roles');
const { sendMail } = require('../services/mailService');
const { rateLimit } = require('../utils/rateLimit');

// =====================================================
// PASSWORD RESET — OTP (in-memory, short-lived)
// Codes live for 10 minutes; a server restart simply invalidates any pending
// reset and the user requests a new code. No schema change required.
// =====================================================
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_MAX_ATTEMPTS = 5;
const otpStore = new Map(); // email -> { hash, expires, attempts, userId }

// Codes must be unguessable: Math.random() exposes V8's PRNG state, so an
// attacker who samples codes from their own account can predict someone else's.
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Reset traffic is limited per IP and again per target address, so one attacker
// can't cycle through accounts and can't flood a single victim's inbox.
const forgotIpLimit = rateLimit({ name: 'forgot-ip', windowMs: 15 * 60 * 1000, max: 10 });
const forgotEmailLimit = rateLimit({
  name: 'forgot-email',
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyOn: (req) => String(req.body?.email || '').trim().toLowerCase(),
});
const resetLimit = rateLimit({ name: 'reset', windowMs: 15 * 60 * 1000, max: 15 });

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of otpStore) if (val.expires < now) otpStore.delete(key);
}, 5 * 60 * 1000).unref();

// Emails the OTP via the shared mailer (SMTP → Resend). Returns { ok, error }.
const sendOtpEmail = async (to, name, otp) =>
  sendMail({
    to,
    subject: 'Your Sieger password reset code',
    html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;">
          <h2 style="color:#9b2423;margin-bottom:4px;">Password Reset</h2>
          <p>Hi ${name || 'there'}, use the code below to reset your Sieger account password:</p>
          <div style="font-size:32px;font-weight:700;letter-spacing:8px;color:#111;background:#f3ece0;padding:16px;border-radius:12px;text-align:center;margin:16px 0;">${otp}</div>
          <p style="color:#666;font-size:14px;">This code expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email.</p>
        </div>
      `,
  });

// LOGIN
router.post('/login', rateLimit({ name: 'login', windowMs: 15 * 60 * 1000, max: 20 }), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

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

    // A row with a null password (creatable through the admin panel) would
    // throw on .trim() and surface as an opaque 500, locking the account out.
    if (!user.password) {
      return res.status(401).json({ message: 'Invalid credentials' });
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

// NOTE: the bootstrap POST /setup-admin route was removed. It was public and
// created a Super Admin with a hardcoded password. Seed the first admin with a
// one-off INSERT in the Supabase SQL editor instead.

// GET team members
router.get('/team-members', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id,name,role,division')
      .like('role', 'Team Member%')
      .eq('active', true);
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch team members' });
  }
});

// =====================================================
// FORGOT PASSWORD — send an OTP to the account email
// =====================================================
router.post('/forgot-password', forgotIpLimit, forgotEmailLimit, async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    // Respond the same way whether or not the email exists, so this endpoint
    // can't be used to discover which emails have accounts.
    const generic = { message: 'If an account exists for that email, a reset code has been sent.' };

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, active')
      .eq('email', email)
      .limit(1);
    if (error) {
      console.error('forgot-password lookup error:', error);
      return res.status(500).json({ message: 'Failed to send reset code' });
    }

    const user = users?.[0];
    if (!user || !user.active) return res.json(generic);

    const otp = generateOtp();
    const hash = await bcrypt.hash(otp, 10);
    otpStore.set(email, { hash, expires: Date.now() + OTP_TTL_MS, attempts: 0, userId: user.id });

    // Send in the background so a slow/blocked email provider never hangs the
    // response (the generic reply doesn't depend on delivery anyway).
    sendOtpEmail(user.email, user.name, otp).then((r) => {
      if (!r.ok) console.error('OTP send failed:', r.error);
    });
    return res.json(generic);
  } catch (err) {
    console.error('forgot-password error:', err);
    res.status(500).json({ message: 'Failed to send reset code' });
  }
});

// =====================================================
// RESET PASSWORD — verify the OTP and set a new password
// =====================================================
router.post('/reset-password', resetLimit, async (req, res) => {
  try {
    const email = (req.body.email || '').trim();
    const otp = (req.body.otp || '').trim();
    const newPassword = req.body.newPassword || '';

    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: 'Email, code and new password are required' });
    if (newPassword.length < 6)
      return res.status(400).json({ message: 'Password must be at least 6 characters' });

    const entry = otpStore.get(email);
    if (!entry || entry.expires < Date.now()) {
      otpStore.delete(email);
      return res.status(400).json({ message: 'Your reset code has expired. Please request a new one.' });
    }
    if (entry.attempts >= OTP_MAX_ATTEMPTS) {
      otpStore.delete(email);
      return res.status(400).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }

    const match = await bcrypt.compare(otp, entry.hash);
    if (!match) {
      entry.attempts += 1;
      return res.status(400).json({ message: 'Incorrect reset code.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase.from('users').update({ password: hashedPassword }).eq('id', entry.userId);
    if (error) {
      console.error('reset-password update error:', error);
      return res.status(500).json({ message: 'Failed to update password' });
    }

    otpStore.delete(email);
    return res.json({ message: 'Password reset successful. You can now sign in.' });
  } catch (err) {
    console.error('reset-password error:', err);
    res.status(500).json({ message: 'Failed to reset password' });
  }
});

// =====================================================
// ADMIN: trigger a reset code for a user (from the Admin Panel)
// Emails the user an OTP; the admin never sees it. The user then completes
// the reset on the login page ("Forgot password?" → "Already have a code?").
// =====================================================
router.post('/admin-send-reset', requireAuth, async (req, res) => {
  try {
    if (!isAdmin(req.user)) return res.status(403).json({ message: 'Admin access required' });

    const email = (req.body.email || '').trim();
    if (!email) return res.status(400).json({ message: 'Email is required' });

    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, active, role')
      .eq('email', email)
      .limit(1);
    if (error) {
      console.error('admin-send-reset lookup error:', error);
      return res.status(500).json({ message: 'Lookup failed' });
    }

    const user = users?.[0];
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.active) return res.status(400).json({ message: 'User is disabled' });

    // Triggering a reset writes a live OTP for that account, so it needs the
    // same scoping as editing the user. Without it any team admin could rotate
    // a reset code for the Super Admin, or flood their inbox.
    if (!isSuperAdmin(req.user) && teamFromRole(user.role) !== getUserTeam(req.user)) {
      return res.status(403).json({ message: 'You can only reset users on your own team' });
    }

    const otp = generateOtp();
    const hash = await bcrypt.hash(otp, 10);
    otpStore.set(email, { hash, expires: Date.now() + OTP_TTL_MS, attempts: 0, userId: user.id });

    const sent = await sendOtpEmail(user.email, user.name, otp);
    if (!sent.ok) return res.status(500).json({ message: sent.error || 'Failed to send email' });

    return res.json({ message: `Reset code sent to ${user.email}` });
  } catch (err) {
    console.error('admin-send-reset error:', err);
    res.status(500).json({ message: 'Failed to send reset code' });
  }
});

module.exports = router;