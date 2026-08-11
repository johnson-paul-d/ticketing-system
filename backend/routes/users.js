const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const fileStore = require('../services/fileStore');
const getISTTime = require('../utils/time');
const { detectFileType, safeFileName } = require('../utils/fileType');
const { isSuperAdmin, teamFromRole, getUserTeam } = require('../utils/roles');

// Every query names its columns so the password hash can never leak to a client.
// signature_path is deliberately absent: it is a per-user secret handle and has
// no business being broadcast in the admin user list. The signature routes
// select it explicitly, for the caller's own row only.
const USER_COLUMNS = 'id, name, email, role, division, active, created_at';

// The only columns an admin may write. Anything else in the body (id,
// created_at, columns added later) is dropped instead of reaching Supabase.
const EDITABLE_FIELDS = ['name', 'email', 'role', 'division', 'active', 'password'];

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

// Visibility and management are deliberately different rules.
//
// A team admin may only *write* to users on their own team. sameTeam() is not
// used here: it treats a null team as "matches everyone", which would let a
// Marketing admin edit a Super Admin.
const canManage = (actor, targetRole) =>
  isSuperAdmin(actor) || teamFromRole(targetRole) === getUserTeam(actor);

// ...but they must still *see* Super Admins. This list also populates the
// assignee dropdown on a ticket, and a Super Admin spans every team, so
// filtering them out here would make the org's most senior account
// unassignable and invisible in the admin panel.
//
// The Super Admin test is explicit rather than `teamFromRole(role) === null`,
// which is also true for a blank or unrecognised role — that would quietly
// expose every malformed account to both teams.
const canView = (actor, targetRole) =>
  canManage(actor, targetRole) || isSuperAdmin({ role: targetRole });

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
    res.json((data || []).filter((u) => canView(req.user, u.role)));
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
    // Only an actual change is rejected: a client that echoes the whole user
    // object back would otherwise 403 on an unrelated edit.
    if ('role' in req.body && req.body.role !== target.role && !isSuperAdmin(req.user)) {
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

// =====================================================
// APPROVAL SIGNATURES
// =====================================================
// A signature is the image stamped onto an expense claim the owner approves, so
// it is only worth anything if nobody else can put it there.
//
// Every route below is scoped to req.user.id and takes no user id from the
// client. There is deliberately NO admin-facing variant — not even for a Super
// Admin — because an admin who could upload on someone else's behalf could
// manufacture their approval, and the stamp on a printed claim would prove
// nothing. Keep it that way when extending this file.
//
// `auth` only, no `admin`: any user may hold a signature. Whether it is ever
// used depends on whether they approve anything.

// Signatures are small transparent crops. This cap is a backstop against a
// caller that uploads a full camera frame, not the expected size.
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

// A drawn signature stamped onto a PDF has to be raster with a transparent or
// flat background — PDFs and SVGs are not renderable by the claim builder.
const SIGNATURE_MIME_TYPES = ['image/png', 'image/jpeg'];

const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIGNATURE_BYTES, files: 1 },
});

// Multer rejects an oversized file by calling next(err); without this the
// client gets an opaque 500 instead of being told the file is too large.
const receiveSignature = (req, res, next) =>
  signatureUpload.single('file')(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        message:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Signature image must be 2 MB or smaller'
            : 'Signature upload failed',
      });
    }
    next();
  });

const isMissingSignatureSchema = (error) =>
  error && ['PGRST204', 'PGRST205', '42P01', '42703'].includes(error.code);

const signatureSchemaResponse = (res) =>
  res.status(503).json({
    message:
      'Signatures are not set up yet. Run backend/database/expenses-migration.sql in Supabase.',
    code: 'EXPENSES_MIGRATION_REQUIRED',
  });

// The caller's own signature handle. Reads by req.user.id only — never by a
// route or body parameter.
const loadOwnSignature = async (userId) => {
  const { data, error } = await supabase
    .from('users')
    .select('signature_path, signature_updated_at')
    .eq('id', userId)
    .limit(1);
  if (error) throw error;
  return data && data[0] ? data[0] : null;
};

// UPLOAD / REPLACE own signature
router.post('/me/signature', auth, receiveSignature, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // The declared mimetype and the extension are both client-controlled, so
    // the leading bytes are what decides. detectFileType also matches PDF, which
    // is why the result is checked against the allow-list rather than just
    // being non-null.
    const type = detectFileType(req.file.buffer);
    if (!type || !SIGNATURE_MIME_TYPES.includes(type.mime)) {
      return res.status(400).json({ message: 'Signature must be a PNG or JPEG image' });
    }

    const current = await loadOwnSignature(req.user.id);
    if (current === null) {
      return res.status(404).json({ message: 'User not found' });
    }

    const stored = await fileStore.put(req.file.buffer, {
      fileName: safeFileName(req.file.originalname, `signature.${type.ext}`),
      mimeType: type.mime,
      folderPath: 'signatures',
    });

    const signatureUpdatedAt = getISTTime();
    const { error } = await supabase
      .from('users')
      .update({ signature_path: stored.id, signature_updated_at: signatureUpdatedAt })
      .eq('id', req.user.id);

    if (error) {
      // Don't leave the upload orphaned in Drive if the row never took it.
      await fileStore.remove(stored.id).catch(() => {});
      if (isMissingSignatureSchema(error)) return signatureSchemaResponse(res);
      throw error;
    }

    // Replacement, not first upload. A stale orphan in Drive is cheap; a failed
    // save because the old blob would not delete is not.
    if (current.signature_path && current.signature_path !== stored.id) {
      await fileStore
        .remove(current.signature_path)
        .catch((e) => console.error('Old signature blob delete failed:', e.message));
    }

    res.json({
      message: 'Signature saved',
      signature_updated_at: signatureUpdatedAt,
      mime_type: type.mime,
      byte_size: stored.byteSize,
    });
  } catch (err) {
    if (isMissingSignatureSchema(err)) return signatureSchemaResponse(res);
    console.error('SIGNATURE UPLOAD ERROR:', err);
    res.status(500).json({ message: err.message || 'Failed to save signature' });
  }
});

// STREAM own signature
router.get('/me/signature', auth, async (req, res) => {
  try {
    const current = await loadOwnSignature(req.user.id);
    if (!current || !current.signature_path) {
      return res.status(404).json({ message: 'No signature on file' });
    }

    const file = await fileStore.get(current.signature_path);
    res.setHeader('Content-Type', file.mimeType || 'image/png');
    res.setHeader('Content-Disposition', 'inline; filename="signature"');
    // Someone's handwritten signature; keep it out of shared caches.
    res.setHeader('Cache-Control', 'private, no-store');

    file.stream.on('error', (err) => {
      console.error('SIGNATURE STREAM ERROR:', err);
      if (!res.headersSent) res.status(502).json({ message: 'Failed to read signature' });
      else res.destroy();
    });
    file.stream.pipe(res);
  } catch (err) {
    if (isMissingSignatureSchema(err)) return signatureSchemaResponse(res);
    console.error('SIGNATURE FETCH ERROR:', err);
    res.status(500).json({ message: 'Failed to fetch signature' });
  }
});

// DELETE own signature
router.delete('/me/signature', auth, async (req, res) => {
  try {
    const current = await loadOwnSignature(req.user.id);
    if (!current || !current.signature_path) {
      return res.status(404).json({ message: 'No signature on file' });
    }

    const { error } = await supabase
      .from('users')
      .update({ signature_path: null, signature_updated_at: null })
      .eq('id', req.user.id);
    if (error) {
      if (isMissingSignatureSchema(error)) return signatureSchemaResponse(res);
      throw error;
    }

    // Row first, blob second: an orphaned blob is recoverable waste, a row
    // pointing at a deleted file is a broken stamp.
    await fileStore
      .remove(current.signature_path)
      .catch((e) => console.error('Signature blob delete failed (row already cleared):', e.message));

    res.json({ message: 'Signature removed' });
  } catch (err) {
    if (isMissingSignatureSchema(err)) return signatureSchemaResponse(res);
    console.error('SIGNATURE DELETE ERROR:', err);
    res.status(500).json({ message: 'Failed to remove signature' });
  }
});

module.exports = router;
