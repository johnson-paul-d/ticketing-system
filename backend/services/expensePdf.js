const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

const supabase = require('../config/supabase');
const fileStore = require('./fileStore');
const { detectFileType, safeFileName, validateFileStructure } = require('../utils/fileType');
const { formatIST } = require('../utils/time');

// =====================================================
// Expense PDFs
// =====================================================
// A rendering of the stored claim, never a source of truth: nothing here writes
// back, so the same claim always produces the same document and a lost PDF is
// simply regenerated.
//
// Two documents come out of this file. Approval belongs to the individual line,
// so the signed document is the LINE document (buildLinePdf) — one approver, one
// expense, one bill. The claim document (buildClaimPdf) is only the envelope: it
// lists the lines and how each was decided, and deliberately carries no
// signature and no verification code, because there is no such thing as an
// approval of the claim as a whole.
//
// Two rules the layout exists to enforce:
//   1. An unapproved line must never look approved — no signature is fetched or
//      drawn for one, and the claim sheet gets a watermark unless every line on
//      it was approved.
//   2. Nothing is ever stamped on top of a receipt. The bill is evidence; a
//      caption belongs above it, not across it.

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 48;
const CONTENT_W = PAGE.width - MARGIN * 2;
const BODY_BOTTOM = 62; // floor for drawn content, leaving the footer band clear
const FOOTER_Y = 28;

const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.42, 0.42, 0.42);
const RULE = rgb(0.78, 0.78, 0.78);
const WASH = rgb(0.95, 0.95, 0.95);
const ALERT = rgb(0.61, 0.14, 0.14);
const PAPER = rgb(1, 1, 1);

const COLUMNS = [
  { key: 'date', label: 'Date', width: 58 },
  { key: 'category', label: 'Category', width: 82 },
  { key: 'description', label: 'Description', width: 137 },
  { key: 'amount', label: 'Amount', width: 58, right: true },
  { key: 'tax', label: 'Tax', width: 46, right: true },
  { key: 'total', label: 'Line total', width: 62, right: true },
  { key: 'status', label: 'Status', width: 56 },
];

// Left edge of each column, and (for right-aligned money) its right edge.
const COLUMN_X = (() => {
  let x = MARGIN;
  return COLUMNS.map((col) => {
    const box = { ...col, x, end: x + col.width };
    x += col.width;
    return box;
  });
})();

const COL = Object.fromEntries(COLUMN_X.map((col) => [col.key, col]));

// =====================================================
// TEXT
// =====================================================
// The 14 standard PDF fonts are WinAnsi-encoded and pdf-lib throws on any code
// point it cannot map, so a rupee sign or a name in Devanagari would otherwise
// fail the whole render rather than one character.
const TRANSLIT = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  ' ': ' ',
  '₹': 'INR ',
};

const safe = (value) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[‘’“”–—… ₹]/g, (ch) => TRANSLIT[ch])
    .replace(/[^\x20-\x7E¡-ÿ]/g, '?');

const fitText = (text, font, size, maxWidth) => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
};

const wrapText = (text, font, size, maxWidth, maxLines) => {
  const words = safe(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]} ...`;
    return kept.map((line) => fitText(line, font, size, maxWidth));
  }
  return lines.map((line) => fitText(line, font, size, maxWidth));
};

const text = (page, value, { x, y, font, size, color = INK, opacity }) =>
  page.drawText(safe(value), { x, y, size, font, color, ...(opacity != null ? { opacity } : {}) });

const textRight = (page, value, { end, y, font, size, color = INK }) => {
  const rendered = safe(value);
  page.drawText(rendered, {
    x: end - font.widthOfTextAtSize(rendered, size),
    y,
    size,
    font,
    color,
  });
};

const hairline = (page, y, { from = MARGIN, to = PAGE.width - MARGIN, color = RULE, thickness = 0.6 } = {}) =>
  page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color });

// =====================================================
// FORMATTING
// =====================================================
// Indian digit grouping (12,34,567.89) is hand-rolled rather than taken from
// Intl: a Node build without full ICU silently falls back to en-US grouping,
// and a printed total must not depend on how the runtime was compiled.
const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0.00';
  const [whole, cents] = Math.abs(n).toFixed(2).split('.');
  const last3 = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${n < 0 ? '-' : ''}${grouped}.${cents}`;
};

// Rendered in IST. Instants are stored in UTC, which is correct, but this is a
// document read by people in India — a UTC stamp on an approval reads as the
// wrong time of day, and on a late-evening approval as the wrong date entirely.
// A date-only column is already the intended calendar date and is never
// shifted, so an expense cannot slide onto the previous day.
const fmtDate = (value) => formatIST(value) || '-';

const fmtStamp = (value) => formatIST(value, { withTime: true }) || '-';

const lineStatus = (line) => line.approval_status || 'Pending';

const lineTotal = (line) => Number(line.amount || 0) + Number(line.tax_amount || 0);

/**
 * The printed reference for one line, e.g. EXP-2026-0042-02.
 *
 * routes/verify.js builds the same string when it resolves a line's code; the
 * two must agree, or the paper and the page it points at name different things.
 * A line numbered before line_no existed has no position to print, so it falls
 * back to the claim's own number rather than inventing one.
 */
const lineReference = (claim, line) => {
  const base = claim.claim_number || 'UNNUMBERED';
  return line.line_no == null ? base : `${base}-${String(line.line_no).padStart(2, '0')}`;
};

// Named for what it is rather than lumped under "not approved": a claim whose
// lines were partly signed off is not a draft, and saying so on the banner is
// the difference between a document that under-states itself and one that lies.
const bannerLabel = (status) => {
  if (status === 'Submitted') return 'PENDING APPROVAL';
  if (status === 'Partially Approved') return 'PARTIALLY APPROVED';
  if (status === 'Rejected') return 'REJECTED';
  if (status === 'Paid') return 'PAID - APPROVAL IS PER LINE';
  return 'DRAFT - NOT APPROVED';
};

// The same idea at 50pt across the diagonal, where anything much longer than
// "PENDING APPROVAL" runs off the sheet — hence the shorter wording.
const watermarkLabel = (status) => {
  if (status === 'Approved') return null;
  if (status === 'Submitted') return 'PENDING APPROVAL';
  if (status === 'Partially Approved') return 'PARTLY APPROVED';
  if (status === 'Paid') return 'PAID';
  return 'NOT APPROVED';
};

const verifyUrl = (code) => {
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  return base && code ? `${base}/verify/${encodeURIComponent(code)}` : null;
};

const shortHash = (value) => (value ? String(value).slice(0, 16) : 'unknown');

// =====================================================
// DATA
// =====================================================
const isMissingSchema = (error) => error && ['PGRST205', '42P01', '42703'].includes(error.code);

const loadClaim = async (claimId) => {
  const { data, error } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', claimId)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) {
      const err = new Error('Expenses schema is missing — run backend/database/expenses-migration.sql');
      err.code = 'EXPENSES_MIGRATION_REQUIRED';
      throw err;
    }
    throw error;
  }
  if (!data) {
    const err = new Error(`Expense claim ${claimId} not found`);
    err.code = 'CLAIM_NOT_FOUND';
    throw err;
  }
  return data;
};

const loadLines = async (claimId) => {
  const { data, error } = await supabase
    .from('expense_lines')
    .select('*')
    .eq('claim_id', claimId)
    .order('expense_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    if (isMissingSchema(error)) return [];
    throw error;
  }
  return data || [];
};

// Scoped by claim as well as by id: a line id from another claim must read as
// "no such line", not as a document belonging to whoever asked for it.
const loadLine = async (claimId, lineId) => {
  const { data, error } = await supabase
    .from('expense_lines')
    .select('*')
    .eq('id', lineId)
    .eq('claim_id', claimId)
    .maybeSingle();

  // 22P02 is Postgres rejecting the id as malformed uuid. From the caller's side
  // that is the same answer as no such row, and it must not become a 500.
  if (error && error.code !== '22P02') {
    if (isMissingSchema(error)) {
      const err = new Error('Expenses schema is missing — run backend/database/expenses-migration.sql');
      err.code = 'EXPENSES_MIGRATION_REQUIRED';
      throw err;
    }
    throw error;
  }
  if (!data) {
    const err = new Error(`Expense line ${lineId} not found on claim ${claimId}`);
    err.code = 'LINE_NOT_FOUND';
    throw err;
  }
  return data;
};

const loadReceipts = async (claimId, lineId = null) => {
  let query = supabase.from('expense_receipts').select('*');
  query = lineId ? query.eq('line_id', lineId) : query.eq('claim_id', claimId);

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });
  if (error) {
    if (isMissingSchema(error)) return [];
    throw error;
  }
  return data || [];
};

const streamToBuffer = (stream) => {
  if (Buffer.isBuffer(stream)) return Promise.resolve(stream);
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
};

// A remote read that stalls without erroring would otherwise hang the whole
// render, and an HTTP request that never answers is worse than one that fails:
// the placeholder path below can report a timeout, but only if it gets one.
const FILE_FETCH_TIMEOUT_MS = 20000;

const withTimeout = (promise, ms, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)),
      ms
    );
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });

const fetchFile = async (storagePath) => {
  const file = await withTimeout(
    fileStore.get(storagePath),
    FILE_FETCH_TIMEOUT_MS,
    'reading the stored file'
  );
  const bytes = await withTimeout(
    streamToBuffer(file.stream),
    FILE_FETCH_TIMEOUT_MS,
    'downloading the stored file'
  );
  // Nothing else consumes this stream; leaving it open would hold the socket.
  if (typeof file.stream?.destroy === 'function') file.stream.destroy();
  return { bytes, mimeType: file.mimeType };
};

// Drive reports whatever mime type was set at upload and hands back
// application/octet-stream often enough that the bytes decide instead. Sharing
// the upload path's signature table means anything accepted on upload is
// recognised here, and anything else lands on a placeholder rather than being
// guessed at.
const sniff = (bytes) => detectFileType(bytes)?.ext || null;

// The magic-byte check at upload only inspects the first few bytes, so a photo
// truncated by a dropped mobile connection passes it and lands here intact at
// the front and corrupt at the back. pdf-lib does not reject such an image — it
// stalls inside the decoder and never settles, which would hang the HTTP
// request rather than fail it. Time-box the decode so a bad file becomes a
// placeholder page like any other unreadable receipt.
// Uploads are validated before storage, but files predating that check — or
// anything altered in Drive since — must not be trusted either. A timeout is no
// use here: the stall never yields to the event loop, so the structure is
// verified up front and a bad file throws, landing on the placeholder page.
const embedImage = async (pdf, bytes, kind) => {
  const defect = validateFileStructure(bytes, kind);
  if (defect) throw new Error(defect);
  return kind === 'png' ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
};

// The signature graphic is the only thing read from the users table: the printed
// name and role come from the line row, which froze them at approval, so a
// later promotion cannot rewrite what an old approval says was signed.
const loadSignatureImage = async (pdf, userId) => {
  if (!userId) return null;
  try {
    const { data, error } = await supabase
      .from('users')
      .select('signature_path')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data?.signature_path) return null;

    const { bytes } = await fetchFile(data.signature_path);
    const kind = sniff(bytes);
    if (kind === 'png' || kind === 'jpg') return await embedImage(pdf, bytes, kind);
    return null;
  } catch (err) {
    console.error('EXPENSE PDF: signature unavailable:', err.message);
    return null;
  }
};

// =====================================================
// SUMMARY PAGE
// =====================================================
// Label / value pair in a two-column grid, drawn from `top` downwards.
const metaCell = (page, fonts, label, value, x, top, width) => {
  text(page, label.toUpperCase(), { x, y: top, font: fonts.bold, size: 7.5, color: MUTED });
  text(page, fitText(safe(value), fonts.regular, 10.5, width), {
    x,
    y: top - 13,
    font: fonts.regular,
    size: 10.5,
  });
};

const drawSummary = (pdf, fonts, { claim, lines, receiptCount }) => {
  const approved = claim.status === 'Approved';
  const currency = claim.currency || 'INR';

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    return page;
  };

  // Header
  text(page, 'EXPENSE CLAIM', { x: MARGIN, y: y - 20, font: fonts.bold, size: 22 });
  textRight(page, claim.claim_number || 'UNNUMBERED', {
    end: PAGE.width - MARGIN,
    y: y - 16,
    font: fonts.bold,
    size: 13,
  });
  y -= 30;
  text(page, claim.title || '', {
    x: MARGIN,
    y: y - 12,
    font: fonts.regular,
    size: 12,
    color: MUTED,
  });
  y -= 26;
  hairline(page, y, { thickness: 1, color: INK });
  y -= 24;

  // Meta grid
  const colL = MARGIN;
  const colR = MARGIN + CONTENT_W / 2;
  const cellW = CONTENT_W / 2 - 12;

  const cell = (label, value, x, top) => metaCell(page, fonts, label, value, x, top, cellW);

  const metaRows = [
    ['Claimant', claim.claimant_name || '-', 'Team', claim.team || '-'],
    ['Submitted', fmtStamp(claim.submitted_at), 'Currency', currency],
    ['Status', claim.status || '-', 'Revision', String(claim.revision ?? 1)],
  ];
  for (const [l1, v1, l2, v2] of metaRows) {
    cell(l1, v1, colL, y);
    cell(l2, v2, colR, y);
    y -= 34;
  }

  y -= 4;

  // Line item table
  const HEADER_H = 18;
  const drawTableHeader = () => {
    page.drawRectangle({
      x: MARGIN,
      y: y - HEADER_H + 4,
      width: CONTENT_W,
      height: HEADER_H,
      color: WASH,
    });
    for (const col of COLUMN_X) {
      const opts = { y: y - HEADER_H + 10, font: fonts.bold, size: 8, color: MUTED };
      if (col.right) textRight(page, col.label.toUpperCase(), { end: col.end - 4, ...opts });
      else text(page, col.label.toUpperCase(), { x: col.x + 4, ...opts });
    }
    y -= HEADER_H + 6;
  };

  drawTableHeader();

  const ROW_SIZE = 9.5;
  const LINE_H = 12;

  if (!lines.length) {
    text(page, 'No line items on this claim.', {
      x: MARGIN + 4,
      y: y - 10,
      font: fonts.regular,
      size: ROW_SIZE,
      color: MUTED,
    });
    y -= 24;
  }

  for (const line of lines) {
    const descCol = COL.description;
    const desc = wrapText(line.description || '-', fonts.regular, ROW_SIZE, descCol.width - 8, 2);
    const rowH = Math.max(1, desc.length) * LINE_H + 6;

    // The table is allowed to run past one page; the total and approval block
    // then land on the last one rather than being pushed off the sheet.
    if (y - rowH < BODY_BOTTOM + 140) {
      newPage();
      drawTableHeader();
    }

    const top = y - 10;
    const status = lineStatus(line);
    const cells = [
      { col: COL.date, value: fmtDate(line.expense_date) },
      { col: COL.category, value: fitText(safe(line.category || '-'), fonts.regular, ROW_SIZE, COL.category.width - 8) },
      { col: COL.amount, value: money(line.amount) },
      { col: COL.tax, value: money(line.tax_amount) },
      { col: COL.total, value: money(lineTotal(line)) },
      {
        col: COL.status,
        value: fitText(safe(status), fonts.regular, ROW_SIZE, COL.status.width - 8),
        color: status === 'Rejected' ? ALERT : status === 'Approved' ? INK : MUTED,
      },
    ];

    for (const { col, value, color = INK } of cells) {
      if (col.right) {
        textRight(page, value, { end: col.end - 4, y: top, font: fonts.regular, size: ROW_SIZE, color });
      } else {
        text(page, value, { x: col.x + 4, y: top, font: fonts.regular, size: ROW_SIZE, color });
      }
    }
    desc.forEach((part, i) => {
      text(page, part, {
        x: descCol.x + 4,
        y: top - i * LINE_H,
        font: fonts.regular,
        size: ROW_SIZE,
        color: i === 0 ? INK : MUTED,
      });
    });

    y -= rowH;
    hairline(page, y + 2, { color: rgb(0.9, 0.9, 0.9), thickness: 0.4 });
  }

  // Grand total
  if (y - 60 < BODY_BOTTOM) newPage();
  y -= 10;
  hairline(page, y, { from: PAGE.width - MARGIN - 240, thickness: 1, color: INK });
  y -= 22;
  // "Claimed", not "total": rejected lines are still counted here, and the
  // figure that was actually approved is the one in the rollup below.
  text(page, `CLAIMED TOTAL (${currency})`, { x: PAGE.width - MARGIN - 240, y, font: fonts.bold, size: 11 });
  textRight(page, money(claim.total_amount), {
    end: PAGE.width - MARGIN,
    y: y - 4,
    font: fonts.bold,
    size: 18,
  });
  y -= 20;
  text(page, `${lines.length} line item${lines.length === 1 ? '' : 's'} | ${receiptCount} receipt${receiptCount === 1 ? '' : 's'} attached`, {
    x: PAGE.width - MARGIN - 240,
    y,
    font: fonts.regular,
    size: 8.5,
    color: MUTED,
  });
  y -= 30;

  // No signature and no verification code on this sheet: nobody signs a claim.
  // What the claim can honestly report is the tally of its lines, so a reader
  // holding only this page can see that some of it may have been refused.
  if (y - (approved ? 110 : 190) < BODY_BOTTOM) newPage();

  if (!approved) {
    page.drawRectangle({ x: MARGIN, y: y - 34, width: CONTENT_W, height: 38, color: ALERT });
    text(page, bannerLabel(claim.status), {
      x: MARGIN + 14,
      y: y - 22,
      font: fonts.bold,
      size: 15,
      color: PAPER,
    });
    y -= 48;
    const explanation = wrapText(
      `This claim is in "${claim.status}" status. Only the lines marked Approved above were signed off, each on its own document; this summary is not evidence of approval.`,
      fonts.regular,
      9.5,
      CONTENT_W,
      2
    );
    explanation.forEach((part, i) => {
      text(page, part, { x: MARGIN, y: y - i * 13, font: fonts.regular, size: 9.5, color: ALERT });
    });
    y -= explanation.length * 13 + 16;
  }

  const tally = { Approved: 0, Rejected: 0, Pending: 0 };
  let approvedTotal = 0;
  for (const line of lines) {
    const status = lineStatus(line);
    tally[status] = (tally[status] || 0) + 1;
    if (status === 'Approved') approvedTotal += lineTotal(line);
  }

  text(page, 'APPROVAL', { x: MARGIN, y, font: fonts.bold, size: 7.5, color: MUTED });
  y -= 16;
  text(
    page,
    `${tally.Approved} approved  |  ${tally.Rejected} rejected  |  ${tally.Pending} pending`,
    { x: MARGIN, y, font: fonts.bold, size: 12 }
  );
  y -= 17;
  text(page, `Approved total (${currency}) ${money(approvedTotal)}`, {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 10.5,
  });
  y -= 16;
  wrapText(
    'Each line is approved on its own. An approved line has a separate signed document carrying the approver and a verification code; this summary carries neither.',
    fonts.regular,
    8.5,
    CONTENT_W,
    2
  ).forEach((part, i) => {
    text(page, part, { x: MARGIN, y: y - i * 11, font: fonts.regular, size: 8.5, color: MUTED });
  });
};

// =====================================================
// LINE DOCUMENT
// =====================================================
// One approved expense on one sheet, followed by its own bills. This is the
// document that carries an approval, so everything on it — signature, name,
// role, timestamp, code — describes the line and nothing wider.
const drawLineDocument = (pdf, fonts, { claim, line, reference, signature, receiptCount }) => {
  const currency = claim.currency || 'INR';

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = PAGE.height - MARGIN;

  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = PAGE.height - MARGIN;
    return page;
  };

  text(page, 'APPROVED EXPENSE', { x: MARGIN, y: y - 20, font: fonts.bold, size: 22 });
  textRight(page, reference, { end: PAGE.width - MARGIN, y: y - 16, font: fonts.bold, size: 13 });
  y -= 30;
  text(page, claim.title || '', { x: MARGIN, y: y - 12, font: fonts.regular, size: 12, color: MUTED });
  y -= 26;
  hairline(page, y, { thickness: 1, color: INK });
  y -= 24;

  const colL = MARGIN;
  const colR = MARGIN + CONTENT_W / 2;
  const cellW = CONTENT_W / 2 - 12;

  const metaRows = [
    ['Claimant', claim.claimant_name || '-', 'Team', claim.team || '-'],
    ['Expense date', fmtDate(line.expense_date), 'Category', line.category || '-'],
    [`Amount (${currency})`, money(line.amount), `Tax (${currency})`, money(line.tax_amount)],
  ];
  for (const [l1, v1, l2, v2] of metaRows) {
    metaCell(page, fonts, l1, v1, colL, y, cellW);
    metaCell(page, fonts, l2, v2, colR, y, cellW);
    y -= 34;
  }

  text(page, 'DESCRIPTION', { x: MARGIN, y, font: fonts.bold, size: 7.5, color: MUTED });
  y -= 14;
  const description = wrapText(line.description || '-', fonts.regular, 10.5, CONTENT_W, 6);
  (description.length ? description : ['-']).forEach((part, i) => {
    text(page, part, { x: MARGIN, y: y - i * 14, font: fonts.regular, size: 10.5 });
  });
  y -= Math.max(1, description.length) * 14 + 16;

  hairline(page, y, { from: PAGE.width - MARGIN - 240, thickness: 1, color: INK });
  y -= 22;
  text(page, `LINE TOTAL (${currency})`, { x: PAGE.width - MARGIN - 240, y, font: fonts.bold, size: 11 });
  textRight(page, money(lineTotal(line)), {
    end: PAGE.width - MARGIN,
    y: y - 4,
    font: fonts.bold,
    size: 18,
  });
  y -= 20;
  text(page, `${receiptCount} receipt${receiptCount === 1 ? '' : 's'} attached`, {
    x: PAGE.width - MARGIN - 240,
    y,
    font: fonts.regular,
    size: 8.5,
    color: MUTED,
  });
  y -= 34;

  // The reserve covers the verification lines too — the code must never be
  // orphaned onto a page away from the signature it belongs to.
  if (y - 200 < BODY_BOTTOM) newPage();

  text(page, 'APPROVED BY', { x: MARGIN, y, font: fonts.bold, size: 7.5, color: MUTED });
  y -= 12;

  if (signature) {
    const box = signature.scaleToFit(190, 58);
    page.drawImage(signature, { x: MARGIN, y: y - box.height, width: box.width, height: box.height });
    y -= box.height + 6;
  } else {
    y -= 12;
    text(page, '(signature image unavailable)', {
      x: MARGIN,
      y,
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    });
    y -= 18;
  }

  hairline(page, y, { to: MARGIN + 210, thickness: 0.8, color: INK });
  y -= 14;
  text(page, line.approved_by_name || 'Unknown approver', { x: MARGIN, y, font: fonts.bold, size: 11 });
  y -= 13;
  text(page, line.approved_by_role || '-', { x: MARGIN, y, font: fonts.regular, size: 9.5, color: MUTED });
  y -= 13;
  text(page, `Approved ${fmtStamp(line.approved_at)}`, {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 9.5,
    color: MUTED,
  });
  y -= 26;

  const url = verifyUrl(line.verify_code);
  text(page, 'VERIFICATION CODE', { x: MARGIN, y, font: fonts.bold, size: 7.5, color: MUTED });
  y -= 15;
  text(page, line.verify_code || 'not issued', { x: MARGIN, y, font: fonts.bold, size: 13 });
  y -= 14;
  const verifyLine = url
    ? `Verify at ${url}`
    : 'Verify this approval in the expense system using the code above.';
  text(page, fitText(safe(verifyLine), fonts.regular, 9, CONTENT_W), {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 9,
    color: MUTED,
  });
};

// =====================================================
// RECEIPT PAGES
// =====================================================
// What the caption may say about the bill below it. The line owns the approval,
// so the line is asked first; only a receipt attached to no line at all falls
// back to the claim's legacy approval fields.
const approvalStamp = (claim, line) => {
  if (line) {
    if (lineStatus(line) === 'Approved') {
      return {
        approved: true,
        label: `Approved by ${line.approved_by_name || 'unknown'}, ${line.approved_by_role || '-'} - ${fmtStamp(line.approved_at)}`,
      };
    }
    return { approved: false, label: `NOT APPROVED - line status "${lineStatus(line)}"` };
  }
  if (claim.status === 'Approved') {
    return {
      approved: true,
      label: `Approved by ${claim.approved_by_name || 'unknown'}, ${claim.approved_by_role || '-'} - ${fmtStamp(claim.approved_at)}`,
    };
  }
  return { approved: false, label: `NOT APPROVED - claim status "${claim.status}"` };
};

// Caption band across the top of a page we own. Returns the y below which the
// receipt itself may be drawn — nothing above that line belongs to the bill,
// and nothing below it belongs to us.
const drawReceiptHeader = (page, fonts, { claim, receipt, line, index, count, note, reference, verifyCode }) => {
  const stamp = approvalStamp(claim, line);
  let y = PAGE.height - MARGIN;

  text(page, `RECEIPT ${index} OF ${count}`, { x: MARGIN, y: y - 10, font: fonts.bold, size: 11 });
  textRight(page, fitText(safe(safeFileName(receipt.file_name, 'unnamed file')), fonts.regular, 9, 230), {
    end: PAGE.width - MARGIN,
    y: y - 10,
    font: fonts.regular,
    size: 9,
    color: MUTED,
  });
  y -= 26;

  const lineSummary = line
    ? `${fmtDate(line.expense_date)} | ${line.category || '-'} | ${claim.currency || 'INR'} ${money(
        lineTotal(line)
      )}`
    : 'Not linked to a line item';
  text(page, fitText(safe(lineSummary), fonts.regular, 10, CONTENT_W), {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 10,
    color: INK,
  });
  y -= 14;

  text(page, fitText(safe(stamp.label), fonts.regular, 9, CONTENT_W), {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 9,
    color: stamp.approved ? MUTED : ALERT,
  });
  y -= 12;

  // A verification code appears only where it belongs to what is being printed:
  // the claim document has none to show.
  const provenance = [
    `Ref ${reference || claim.claim_number || '-'}`,
    `File hash ${shortHash(receipt.file_sha256)}`,
    verifyCode ? `Verify ${verifyCode}` : null,
  ]
    .filter(Boolean)
    .join(' | ');
  text(page, fitText(safe(provenance), fonts.regular, 8, CONTENT_W), {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 8,
    color: MUTED,
  });
  y -= 10;

  if (note) {
    text(page, fitText(safe(note), fonts.regular, 8.5, CONTENT_W), {
      x: MARGIN,
      y,
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    });
    y -= 12;
  }

  hairline(page, y);
  return y - 12;
};

const drawPlaceholder = (pdf, fonts, context, reason) => {
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const top = drawReceiptHeader(page, fonts, context);
  const { receipt } = context;

  page.drawRectangle({
    x: MARGIN,
    y: BODY_BOTTOM,
    width: CONTENT_W,
    height: top - BODY_BOTTOM,
    borderColor: RULE,
    borderWidth: 0.8,
    borderDashArray: [4, 4],
  });

  let y = top - 60;
  text(page, 'RECEIPT FILE NOT INCLUDED', { x: MARGIN + 20, y, font: fonts.bold, size: 13, color: ALERT });
  y -= 22;
  for (const row of [
    `File: ${safeFileName(receipt.file_name, 'unnamed')}`,
    `Type: ${receipt.mime_type || 'unknown'}`,
    `SHA-256: ${receipt.file_sha256 || 'unknown'}`,
    `Reason: ${reason}`,
  ]) {
    text(page, fitText(safe(row), fonts.regular, 9.5, CONTENT_W - 40), {
      x: MARGIN + 20,
      y,
      font: fonts.regular,
      size: 9.5,
      color: INK,
    });
    y -= 15;
  }
  y -= 6;
  text(page, 'The receipt record still stands; only the stored file could not be read at render time.', {
    x: MARGIN + 20,
    y,
    font: fonts.regular,
    size: 8.5,
    color: MUTED,
  });

  return page;
};

const drawImageReceipt = async (pdf, fonts, context, bytes, kind) => {
  const image = await embedImage(pdf, bytes, kind);
  const page = pdf.addPage([PAGE.width, PAGE.height]);
  const top = drawReceiptHeader(page, fonts, context);

  const boxH = top - BODY_BOTTOM;
  const box = image.scaleToFit(CONTENT_W, boxH);
  page.drawImage(image, {
    x: MARGIN + (CONTENT_W - box.width) / 2,
    y: BODY_BOTTOM + (boxH - box.height) / 2,
    width: box.width,
    height: box.height,
  });
  return page;
};

// A PDF bill is copied in page for page rather than rasterised, so what reaches
// the reader is the original document. That leaves nowhere safe to print the
// caption, so it goes on a divider page ahead of the copied pages and the pages
// themselves are left untouched.
const appendPdfReceipt = async (pdf, fonts, context, bytes, verbatim) => {
  // Encryption has to be rejected, not ignored. Loading with
  // ignoreEncryption:true succeeds but leaves every stream encrypted, so the
  // copied pages carry undecodable bytes and render BLANK — a bill that looks
  // attached and shows nothing. Print shops and invoice generators apply
  // owner-password protection routinely, so this is the common case, not an
  // edge one.
  const source = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const indices = source.getPageIndices();
  if (!indices.length) throw new Error('the PDF contains no pages');

  const divider = pdf.addPage([PAGE.width, PAGE.height]);
  const top = drawReceiptHeader(divider, fonts, {
    ...context,
    note: `Original PDF receipt - ${indices.length} page${indices.length === 1 ? '' : 's'} follow${
      indices.length === 1 ? 's' : ''
    }, included unmodified.`,
  });
  text(divider, 'The pages that follow are the receipt exactly as it was uploaded.', {
    x: MARGIN,
    y: top - 30,
    font: fonts.regular,
    size: 10,
    color: MUTED,
  });

  const copied = await pdf.copyPages(source, indices);
  for (const copiedPage of copied) {
    pdf.addPage(copiedPage);
    verbatim.add(copiedPage);
  }
};

const appendReceipt = async (pdf, fonts, context, verbatim) => {
  const { receipt } = context;
  let bytes;
  let mimeType;

  try {
    ({ bytes, mimeType } = await fetchFile(receipt.storage_path));
  } catch (err) {
    // One unreadable file must not make the claim unprintable — the page below
    // records what was expected so the gap is auditable.
    drawPlaceholder(pdf, fonts, context, err.message || 'the stored file could not be fetched');
    return;
  }

  const kind = sniff(bytes);
  try {
    if (kind === 'pdf') await appendPdfReceipt(pdf, fonts, context, bytes, verbatim);
    else if (kind === 'png' || kind === 'jpg') await drawImageReceipt(pdf, fonts, context, bytes, kind);
    else drawPlaceholder(pdf, fonts, context, `unsupported file type "${receipt.mime_type || mimeType || 'unknown'}"`);
  } catch (err) {
    drawPlaceholder(pdf, fonts, context, err.message || 'the file could not be embedded');
  }
};

// =====================================================
// PAGE FURNITURE
// =====================================================
// Runs last, when the page count is finally known. Copied receipt pages are
// skipped: a footer over someone's invoice is still ink on the evidence.
const finishPages = (pdf, fonts, verbatim, { footer, watermark }) => {
  const all = pdf.getPages();

  all.forEach((page, i) => {
    if (verbatim.has(page)) return;

    if (watermark) {
      page.drawText(watermark, {
        x: 72,
        y: 215,
        size: 50,
        font: fonts.bold,
        color: ALERT,
        opacity: 0.11,
        rotate: degrees(38),
      });
    }

    hairline(page, FOOTER_Y + 14, { color: rgb(0.88, 0.88, 0.88), thickness: 0.4 });
    text(page, footer, {
      x: MARGIN,
      y: FOOTER_Y,
      font: fonts.regular,
      size: 7.5,
      color: MUTED,
    });
    textRight(page, `Page ${i + 1} of ${all.length}`, {
      end: PAGE.width - MARGIN,
      y: FOOTER_Y,
      font: fonts.regular,
      size: 7.5,
      color: MUTED,
    });
  });
};

// =====================================================
// ENTRY POINT
// =====================================================
const buildClaimPdf = async (claimId) => {
  const claim = await loadClaim(claimId);
  const [lines, receipts] = await Promise.all([loadLines(claim.id), loadReceipts(claim.id)]);

  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  pdf.setTitle(`${claim.claim_number || 'Expense claim'} - ${claim.title || ''}`.trim());
  pdf.setSubject(`Expense claim for ${claim.claimant_name || 'unknown claimant'}`);
  pdf.setProducer('Ticketing System');

  // No signature is fetched at all: the claim document has nowhere honest to put
  // one, since the approvals it summarises belong to individual lines.
  drawSummary(pdf, fonts, { claim, lines, receiptCount: receipts.length });

  const linesById = new Map(lines.map((line) => [line.id, line]));
  const verbatim = new Set();

  for (let i = 0; i < receipts.length; i += 1) {
    const receipt = receipts[i];
    await appendReceipt(
      pdf,
      fonts,
      {
        claim,
        receipt,
        line: receipt.line_id ? linesById.get(receipt.line_id) || null : null,
        index: i + 1,
        count: receipts.length,
        reference: claim.claim_number || '-',
        verifyCode: null,
      },
      verbatim
    );
  }

  finishPages(pdf, fonts, verbatim, {
    footer: claim.claim_number || 'Expense claim',
    watermark: watermarkLabel(claim.status),
  });

  return Buffer.from(await pdf.save());
};

/**
 * The document for ONE approved line: its details, the approver's signature,
 * its verification code, and only its own receipts.
 *
 * Throws with `.code` set to LINE_NOT_FOUND or LINE_NOT_APPROVED so the route
 * can answer 404 / 400. A pending or rejected line produces nothing at all —
 * this layout draws a signature, and a signature on an undecided expense is a
 * forgery whatever the covering text says.
 */
const buildLinePdf = async (claimId, lineId) => {
  const claim = await loadClaim(claimId);
  const line = await loadLine(claim.id, lineId);

  if (lineStatus(line) !== 'Approved') {
    const err = new Error(`Expense line ${lineId} is not approved`);
    err.code = 'LINE_NOT_APPROVED';
    throw err;
  }

  const receipts = await loadReceipts(claim.id, line.id);
  const reference = lineReference(claim, line);

  const pdf = await PDFDocument.create();
  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
  };

  pdf.setTitle(`${reference} - ${line.category || 'Expense'}`.trim());
  pdf.setSubject(`Approved expense for ${claim.claimant_name || 'unknown claimant'}`);
  pdf.setProducer('Ticketing System');

  const signature = await loadSignatureImage(pdf, line.approved_by);

  drawLineDocument(pdf, fonts, {
    claim,
    line,
    reference,
    signature,
    receiptCount: receipts.length,
  });

  const verbatim = new Set();
  for (let i = 0; i < receipts.length; i += 1) {
    await appendReceipt(
      pdf,
      fonts,
      {
        claim,
        receipt: receipts[i],
        line,
        index: i + 1,
        count: receipts.length,
        reference,
        verifyCode: line.verify_code,
      },
      verbatim
    );
  }

  finishPages(pdf, fonts, verbatim, {
    footer: `${reference} | Verify ${line.verify_code || '-'}`,
    watermark: null,
  });

  return Buffer.from(await pdf.save());
};

module.exports = { buildClaimPdf, buildLinePdf };
