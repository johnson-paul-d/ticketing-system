// Copies every receipt and signature out of Google Drive onto local disk and
// repoints the database rows at the local copies.
//
//   node scripts/migrate-files-to-local.js --dry-run     list what would move
//   node scripts/migrate-files-to-local.js               do it
//
// Run it with backend/.env pointing at the database you are going to KEEP
// (POSTGREST_URL for the self-hosted one) and with the Google Drive variables
// still present, since that is where the files are read from. FILE_STORE_DIR
// decides where they land; FILE_STORE itself is ignored here because the
// script names both stores explicitly.
//
// Safe to re-run: rows whose storage_path already points at a local file are
// skipped, and nothing is deleted from Drive. Each receipt's bytes are checked
// against the sha256 the database already holds — an approval hash covers that
// digest, so a receipt that came back different would silently invalidate a
// signed document. Such a row is reported and left on Drive.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const crypto = require('crypto');
const supabase = require('../config/supabase');
const driveStore = require('../services/driveStore');
const localStore = require('../services/localStore');

const DRY_RUN = process.argv.includes('--dry-run');

const streamToBuffer = (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const PAGE = 1000;
const allRows = async (table, select) => {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message || error.code}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
};

const moveOne = async ({ label, id, fileName, mimeType, folderPath, expectedSha }) => {
  const file = await driveStore.get(id);
  const bytes = await streamToBuffer(file.stream);
  if (expectedSha && sha256(bytes) !== expectedSha) {
    throw new Error(`${label}: bytes from Drive do not match the stored sha256 — left on Drive`);
  }
  const stored = await localStore.put(bytes, {
    fileName,
    mimeType: mimeType || file.mimeType,
    folderPath,
  });
  return stored.id;
};

(async () => {
  if (!driveStore.isConfigured()) {
    console.error('Google Drive is not configured in backend/.env — nothing to read from.');
    process.exit(1);
  }
  if (!localStore.isConfigured()) {
    console.error(`Cannot write to ${localStore.rootDir()} — set FILE_STORE_DIR to a writable folder.`);
    process.exit(1);
  }
  console.log(`Database: ${supabase.isSelfHosted ? process.env.POSTGREST_URL : process.env.SUPABASE_URL}`);
  console.log(`Local store: ${localStore.rootDir()}${DRY_RUN ? '   (dry run, nothing written)' : ''}\n`);

  let moved = 0;
  let skipped = 0;
  let failed = 0;

  // ---- receipts ----
  const receipts = await allRows(
    'expense_receipts',
    'id, claim_id, line_id, storage_path, file_name, mime_type, file_sha256'
  );
  for (const r of receipts) {
    if (!r.storage_path || localStore.ownsId(r.storage_path)) {
      skipped += 1;
      continue;
    }
    const label = `receipt ${r.id} (${r.file_name || 'unnamed'})`;
    if (DRY_RUN) {
      console.log(`would move ${label}`);
      moved += 1;
      continue;
    }
    try {
      const newId = await moveOne({
        label,
        id: r.storage_path,
        fileName: r.file_name || 'receipt',
        mimeType: r.mime_type,
        folderPath: `claims/${r.claim_id}`,
        expectedSha: r.file_sha256,
      });
      const { error } = await supabase
        .from('expense_receipts')
        .update({ storage_path: newId })
        .eq('id', r.id);
      if (error) throw new Error(`${label}: row update failed: ${error.message || error.code}`);
      console.log(`moved ${label} -> ${newId}`);
      moved += 1;
    } catch (err) {
      console.error(`FAILED ${err.message}`);
      failed += 1;
    }
  }

  // ---- signatures ----
  const users = await allRows('users', 'id, name, signature_path');
  for (const u of users) {
    if (!u.signature_path || localStore.ownsId(u.signature_path)) {
      if (u.signature_path) skipped += 1;
      continue;
    }
    const label = `signature of ${u.name} (${u.id})`;
    if (DRY_RUN) {
      console.log(`would move ${label}`);
      moved += 1;
      continue;
    }
    try {
      const newId = await moveOne({
        label,
        id: u.signature_path,
        fileName: 'signature',
        mimeType: null,
        folderPath: 'signatures',
        expectedSha: null,
      });
      const { error } = await supabase
        .from('users')
        .update({ signature_path: newId })
        .eq('id', u.id);
      if (error) throw new Error(`${label}: row update failed: ${error.message || error.code}`);
      console.log(`moved ${label} -> ${newId}`);
      moved += 1;
    } catch (err) {
      console.error(`FAILED ${err.message}`);
      failed += 1;
    }
  }

  console.log(
    `\n${DRY_RUN ? 'Would move' : 'Moved'} ${moved}, already local ${skipped}, failed ${failed}.`
  );
  if (!DRY_RUN && !failed) {
    console.log('Set FILE_STORE=local in backend/.env and restart the app. Drive files were left in place.');
  }
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
