const { Readable } = require('stream');

// =====================================================
// Google Drive backing store (OAuth2, personal Gmail account)
// =====================================================
// The Drive account is a personal Gmail account, not Google Workspace, so there
// are no Shared Drives and a service account is not an option: a service
// account has no Drive storage quota of its own and every upload would be
// rejected. The app therefore acts AS the Gmail user through a stored refresh
// token.
//
// The scope is drive.file — per-file access to what this app creates — not full
// drive. drive.file is a non-sensitive scope, so the OAuth consent screen can be
// published to Production without going through Google's verification review,
// and that is what stops the refresh token expiring every 7 days (the cap
// applied to apps left in Testing).
//
// Returns the Drive file id as the opaque handle. It is stable across renames
// and moves made by hand in the Drive UI, so a tidy-up in Drive cannot orphan a
// receipt row.

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const REQUIRED_ENV = [
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REFRESH_TOKEN',
  'GOOGLE_DRIVE_ROOT_FOLDER_ID',
];

const missingEnv = () => REQUIRED_ENV.filter((name) => !process.env[name]);

const isConfigured = () => missingEnv().length === 0;

let client = null;

// @googleapis/drive, not the umbrella `googleapis` package. The latter bundles
// every Google API: 202 MB on disk and ~57s to require on a cold process, which
// on a host that sleeps when idle turns the first receipt upload after a
// wake-up into a minute-long hang. This one carries Drive alone.
//
// The require stays inside the function rather than at module load so an
// unconfigured deployment still boots, and a missing dependency surfaces on
// first use instead of taking the whole server down at startup.
const getDrive = () => {
  const missing = missingEnv();
  if (missing.length) {
    throw new Error(
      `Google Drive storage is not configured — set ${missing.join(', ')} in the backend environment`
    );
  }
  if (client) return client;

  const { drive, auth: googleAuth } = require('@googleapis/drive');
  const oauth = new googleAuth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  // Only the refresh token is stored; the client exchanges it for an access
  // token on demand and caches that in memory.
  oauth.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    scope: SCOPES.join(' '),
  });

  client = drive({ version: 'v3', auth: oauth });
  return client;
};

const httpStatus = (err) => {
  const raw = err?.response?.status ?? err?.status ?? err?.code;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
};

// A revoked or expired refresh token is the most likely real-world failure and
// is invisible in a generic 500, so it gets its own message.
const isInvalidGrant = (err) => {
  const data = err?.response?.data;
  const code = typeof data?.error === 'string' ? data.error : data?.error?.status;
  return code === 'invalid_grant' || /invalid_grant/.test(err?.message || '');
};

const driveError = (err, action) => {
  if (isInvalidGrant(err)) {
    return new Error(
      'Google Drive refresh token has been revoked or has expired — re-run the OAuth consent flow ' +
        'for the Drive account and update GOOGLE_REFRESH_TOKEN'
    );
  }
  const data = err?.response?.data;
  const detail = data?.error?.message || data?.error_description || err?.message || 'unknown error';
  const status = httpStatus(err);
  return new Error(`Google Drive ${action} failed${status ? ` (${status})` : ''}: ${detail}`);
};

// Drive query strings are single-quoted, so a quote or backslash in a folder
// name would otherwise break out of the literal.
const escapeQueryValue = (value) => String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Keyed by parent id + name, not name alone: two claims can hold a folder of
// the same name under different parents.
const folderCache = new Map();

const findOrCreateFolder = async (name, parentId) => {
  const cacheKey = `${parentId}/${name}`;
  if (folderCache.has(cacheKey)) return folderCache.get(cacheKey);

  const drive = getDrive();
  const query = [
    `name = '${escapeQueryValue(name)}'`,
    `'${escapeQueryValue(parentId)}' in parents`,
    "mimeType = 'application/vnd.google-apps.folder'",
    'trashed = false',
  ].join(' and ');

  const { data } = await drive.files.list({
    q: query,
    fields: 'files(id)',
    pageSize: 1,
    spaces: 'drive',
  });

  let id = data.files?.[0]?.id;
  if (!id) {
    const created = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId],
      },
      fields: 'id',
    });
    id = created.data.id;
  }

  folderCache.set(cacheKey, id);
  return id;
};

// 'expenses/2026/EXP-2026-0042' → the id of the deepest folder, creating each
// missing segment under GOOGLE_DRIVE_ROOT_FOLDER_ID on the way down.
const resolveFolderId = async (folderPath) => {
  let parentId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const segments = String(folderPath || '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (const segment of segments) {
    parentId = await findOrCreateFolder(segment, parentId);
  }
  return parentId;
};

const put = async (buffer, { fileName, mimeType, folderPath } = {}) => {
  const drive = getDrive();
  try {
    const parentId = await resolveFolderId(folderPath);
    const { data } = await drive.files.create({
      requestBody: {
        name: fileName || `upload-${Date.now()}`,
        parents: [parentId],
      },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: Readable.from(buffer),
      },
      fields: 'id',
    });
    return { id: data.id, byteSize: buffer.length };
  } catch (err) {
    throw driveError(err, 'upload');
  }
};

const get = async (id) => {
  if (!id) throw new Error('driveStore.get requires a Drive file id');
  const drive = getDrive();
  try {
    const meta = await drive.files.get({ fileId: id, fields: 'mimeType, size' });
    const file = await drive.files.get({ fileId: id, alt: 'media' }, { responseType: 'stream' });
    return {
      stream: file.data,
      mimeType: meta.data.mimeType || 'application/octet-stream',
      byteSize: meta.data.size != null ? Number(meta.data.size) : null,
    };
  } catch (err) {
    throw driveError(err, 'download');
  }
};

const remove = async (id) => {
  if (!id) return;
  const drive = getDrive();
  try {
    await drive.files.delete({ fileId: id });
  } catch (err) {
    // Already gone is the outcome the caller asked for.
    if (httpStatus(err) === 404) return;
    throw driveError(err, 'delete');
  }
};

module.exports = { put, get, remove, isConfigured, SCOPES, REQUIRED_ENV };
