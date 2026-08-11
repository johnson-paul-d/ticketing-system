const crypto = require('crypto');
const driveStore = require('./driveStore');

// =====================================================
// File store — the interface the expense module codes against
// =====================================================
//   put(buffer, { fileName, mimeType, folderPath }) → { id, sha256, byteSize }
//   get(id)        → { stream, mimeType, byteSize }
//   remove(id)     → void
//   isConfigured() → boolean
//
// `id` is opaque to the caller and is what goes in
// expense_receipts.storage_path. Nothing may parse it: for Drive it is a file
// id, for another store it would be a bucket key.
//
// The backing store is chosen by FILE_STORE so it can be swapped without
// touching the expense routes.

const notImplemented = (method) => () => {
  throw new Error(
    `fileStore: the 'supabase' backing store is not implemented (${method}) — set FILE_STORE=drive`
  );
};

// STUB — Supabase Storage backing store.
// The buckets exist (see database/expenses-migration.sql §5) but nothing writes
// to them. To implement: upload to the private 'expense-receipts' bucket and
// return the object path as `id`; get() should stream a download rather than
// hand back a signed URL, so the route layer stays the only place that decides
// who may read a receipt.
const supabaseStore = {
  put: notImplemented('put'),
  get: notImplemented('get'),
  remove: notImplemented('remove'),
  isConfigured: () => false,
};

const STORES = {
  drive: driveStore,
  supabase: supabaseStore,
};

// Read per call rather than at module load so the choice does not depend on
// this file being required after dotenv.
const storeName = () => (process.env.FILE_STORE || 'drive').toLowerCase();

const selectStore = () => {
  const name = storeName();
  const store = STORES[name];
  if (!store) {
    throw new Error(
      `fileStore: unknown FILE_STORE '${name}' — expected one of ${Object.keys(STORES).join(', ')}`
    );
  }
  return store;
};

const isConfigured = () => {
  const store = STORES[storeName()];
  return Boolean(store && store.isConfigured());
};

// Hashed here, over the bytes exactly as received, for every backing store. The
// approval hash of a claim covers its receipt digests, so a store must never be
// able to influence the digest by rewriting or re-encoding what it was given.
const put = async (buffer, options = {}) => {
  if (!Buffer.isBuffer(buffer)) throw new TypeError('fileStore.put expects a Buffer');
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const { id } = await selectStore().put(buffer, options);
  return { id, sha256, byteSize: buffer.length };
};

const get = async (id) => selectStore().get(id);

const remove = async (id) => {
  await selectStore().remove(id);
};

module.exports = { put, get, remove, isConfigured };
