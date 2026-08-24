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
//
// The visual system, in one paragraph: a slim Signal Red rule across the top of
// every page this file draws, a cream masthead carrying the document type, the
// reference and — as the largest thing on the sheet — the amount; meta as small
// letter-spaced labels over their values; one table with a cream header, a red
// underscore, an alternating wash light enough to survive a photocopier, and a
// footed total row; approval set as a signature block over a rule with the
// verification code in its own bordered panel. Everything is measured against
// the margins with fitText / fitSize / wrapText, because a document that
// overflows its margin is a document that was never proofed.

const PAGE = { width: 595.28, height: 841.89 }; // A4
const MARGIN = 48;
const CONTENT_W = PAGE.width - MARGIN * 2;
const BODY_BOTTOM = 62; // floor for drawn content, leaving the footer band clear
const FOOTER_Y = 28;
const TOP_BAR_H = 5; // the red rule that marks a page as ours
const MASTHEAD_H = 108;

// =====================================================
// PALETTE
// =====================================================
// Sieger: Signal Red, cream, black. Red is kept scarce on purpose — it marks the
// page, the amount, and anything that is not approved, and nothing else, so that
// a red mark on the sheet always means "look here".
const RED = rgb(0.608, 0.141, 0.137);
const CREAM = rgb(0.953, 0.925, 0.878);
const CREAM_DEEP = rgb(0.898, 0.855, 0.788);
const INK = rgb(0.09, 0.09, 0.09);
const MUTED = rgb(0.42, 0.42, 0.42);
const FAINT = rgb(0.58, 0.58, 0.58);
const RULE = rgb(0.78, 0.78, 0.78);
const HAIR = rgb(0.9, 0.9, 0.9);
// Deliberately barely there: these documents get photocopied, and a row wash
// heavy enough to look good on screen turns into grey mud on the third copy.
const ROW_WASH = rgb(0.973, 0.969, 0.961);
const ALERT = RED;
const PAPER = rgb(1, 1, 1);

// Status pills. Tints rather than solids, so the text inside stays readable in
// black and white and the row does not turn into a colour block.
const PILL_STYLES = {
  Approved: { fill: rgb(0.898, 0.937, 0.898), ink: rgb(0.11, 0.36, 0.17), border: rgb(0.71, 0.83, 0.72) },
  Rejected: { fill: rgb(0.973, 0.906, 0.902), ink: RED, border: rgb(0.87, 0.74, 0.73) },
  Default: { fill: rgb(0.933, 0.933, 0.933), ink: rgb(0.34, 0.34, 0.34), border: rgb(0.84, 0.84, 0.84) },
};

const pillStyle = (status) => PILL_STYLES[status] || PILL_STYLES.Default;

// Money columns are fixed width and right-aligned: Helvetica has no tabular
// figures, so a '1' is narrower than a '7' and only a shared right edge makes
// the decimal points line up down the column.
const COLUMNS = [
  { key: 'date', label: 'Date', width: 70 },
  { key: 'category', label: 'Category', width: 74 },
  { key: 'description', label: 'Description', width: 116 },
  { key: 'amount', label: 'Amount', width: 62, right: true },
  { key: 'tax', label: 'Tax', width: 50, right: true },
  { key: 'total', label: 'Line total', width: 68, right: true },
  { key: 'status', label: 'Status', width: 59.28 },
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
  ' ': ' ',
  '₹': 'INR ',
};

const safe = (value) =>
  String(value ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[‘’“”–—… ₹]/g, (ch) => TRANSLIT[ch])
    .replace(/[^\x20-\x7E¡-ÿ]/g, '?');

const fitText = (text, font, size, maxWidth) => {
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
};

// For strings that must not be truncated — an amount, a verification code — the
// type shrinks instead. A cut-off total is a wrong total.
const fitSize = (text, font, maxWidth, size, min = 7) => {
  let out = size;
  while (out > min && font.widthOfTextAtSize(text, out) > maxWidth) out -= 0.5;
  return out;
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

// pdf-lib's drawText has no character-spacing option, so the small uppercase
// labels are set one glyph at a time. Tracking is what makes a 6pt label read as
// a label rather than as shrunken body copy.
// Measured glyph by glyph, exactly as textTracked draws it: widthOfTextAtSize
// kerns the pairs in a whole string, so measuring the string and then drawing
// the characters separately leaves the run a point or two wider than measured —
// enough to push a right-aligned label past the margin.
const trackedWidth = (value, font, size, tracking = 0) => {
  const rendered = safe(value);
  if (!rendered.length) return 0;
  let width = 0;
  for (const ch of rendered) width += font.widthOfTextAtSize(ch, size);
  return width + tracking * (rendered.length - 1);
};

const fitTrackedSize = (value, font, maxWidth, size, tracking, min = 6) => {
  let out = size;
  while (out > min && trackedWidth(value, font, out, tracking) > maxWidth) out -= 0.5;
  return out;
};

const textTracked = (page, value, { x, y, font, size, color = MUTED, tracking = 1 }) => {
  const rendered = safe(value);
  let cursor = x;
  for (const ch of rendered) {
    if (ch !== ' ') page.drawText(ch, { x: cursor, y, size, font, color });
    cursor += font.widthOfTextAtSize(ch, size) + tracking;
  }
  return rendered.length ? cursor - x - tracking : 0;
};

const textTrackedRight = (page, value, options) =>
  textTracked(page, value, {
    ...options,
    x: options.end - trackedWidth(value, options.font, options.size, options.tracking ?? 1),
  });

const textTrackedCenter = (page, value, options) =>
  textTracked(page, value, {
    ...options,
    x: options.center - trackedWidth(value, options.font, options.size, options.tracking ?? 1) / 2,
  });

const hairline = (page, y, { from = MARGIN, to = PAGE.width - MARGIN, color = RULE, thickness = 0.6 } = {}) =>
  page.drawLine({ start: { x: from, y }, end: { x: to, y }, thickness, color });

/**
 * A status pill. Anchored either by its left edge (`x`) or its right edge
 * (`end`); returns the width it took so a caller can set another one beside it.
 */
const drawPill = (page, fonts, label, { x, end, y, status, size = 6.5, maxWidth = 160 }) => {
  const style = pillStyle(status);
  const pad = 6;
  const inner = Math.max(12, maxWidth - pad * 2);
  const upper = safe(label).toUpperCase();
  const fitted = fitSize(upper, fonts.bold, inner, size, 5);
  const rendered = fitText(upper, fonts.bold, fitted, inner);
  const width = fonts.bold.widthOfTextAtSize(rendered, fitted) + pad * 2;
  const left = x != null ? x : end - width;

  page.drawRectangle({
    x: left,
    y: y - 3.5,
    width,
    height: fitted + 5.5,
    color: style.fill,
    borderColor: style.border,
    borderWidth: 0.5,
  });
  page.drawText(rendered, { x: left + pad, y, size: fitted, font: fonts.bold, color: style.ink });
  return width;
};

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
// PAGE HEADS
// =====================================================
/**
 * The masthead: a cream band carrying the document type, the reference and the
 * amount. The amount is set largest because it is the one thing every reader —
 * claimant, approver, accounts, vendor — looks for first.
 *
 * Returns the y at which body content may begin.
 */
const drawMasthead = (page, fonts, { docType, reference, amountLabel, amount, title, pill }) => {
  const top = PAGE.height - TOP_BAR_H;
  const bottom = top - MASTHEAD_H;

  page.drawRectangle({ x: 0, y: bottom, width: PAGE.width, height: MASTHEAD_H, color: CREAM });
  page.drawLine({ start: { x: 0, y: bottom }, end: { x: PAGE.width, y: bottom }, thickness: 0.8, color: CREAM_DEEP });

  textTracked(page, 'SIEGER', { x: MARGIN, y: top - 24, font: fonts.bold, size: 10, color: INK, tracking: 2.6 });
  textTrackedRight(page, 'PARTNERING PROGRESS', {
    end: PAGE.width - MARGIN,
    y: top - 24,
    font: fonts.regular,
    size: 6.6,
    color: MUTED,
    tracking: 1.5,
  });

  const typeSize = fitTrackedSize(docType, fonts.bold, 250, 19, 1.2, 11);
  textTracked(page, docType, { x: MARGIN, y: top - 58, font: fonts.bold, size: typeSize, color: INK, tracking: 1.2 });

  // Reference, label over value. A pill (only the line document has one to show)
  // sits beside it, which is why the reference gets a narrower box in that case.
  textTracked(page, 'REFERENCE', { x: MARGIN, y: top - 76, font: fonts.bold, size: 6.2, color: MUTED, tracking: 1.2 });
  const refWidth = pill ? 138 : 235;
  text(page, fitText(safe(reference || '-'), fonts.bold, 12, refWidth), {
    x: MARGIN,
    y: top - 92,
    font: fonts.bold,
    size: 12,
  });
  if (pill) {
    drawPill(page, fonts, pill, { x: MARGIN + refWidth + 12, y: top - 92, status: pill, size: 7.5, maxWidth: 92 });
  }

  // The amount. Right-aligned against the margin and shrunk rather than clipped,
  // so a crore-scale figure still lands inside the sheet.
  textTrackedRight(page, amountLabel, {
    end: PAGE.width - MARGIN,
    y: top - 58,
    font: fonts.bold,
    size: 6.6,
    color: MUTED,
    tracking: 1.3,
  });
  const figure = safe(amount);
  const amountBox = PAGE.width - MARGIN - (MARGIN + 252);
  textRight(page, figure, {
    end: PAGE.width - MARGIN,
    y: top - 92,
    font: fonts.bold,
    size: fitSize(figure, fonts.bold, amountBox, 30, 12),
    color: RED,
  });

  let y = bottom - 24;
  const heading = safe(title || '');
  if (heading) {
    text(page, fitText(heading, fonts.regular, 11.5, CONTENT_W), {
      x: MARGIN,
      y,
      font: fonts.regular,
      size: 11.5,
      color: INK,
    });
    y -= 24;
  }
  return y;
};

// Second and later pages of a document: no masthead, just enough to say what
// this sheet belongs to if it is separated from page 1.
const drawContinuation = (page, fonts, { docType, reference }) => {
  const top = PAGE.height - TOP_BAR_H;
  textTracked(page, `${docType} (CONTINUED)`, {
    x: MARGIN,
    y: top - 26,
    font: fonts.bold,
    size: 8,
    color: MUTED,
    tracking: 1.2,
  });
  textRight(page, fitText(safe(reference || '-'), fonts.bold, 9, 200), {
    end: PAGE.width - MARGIN,
    y: top - 26,
    font: fonts.bold,
    size: 9,
    color: INK,
  });
  hairline(page, top - 38, { from: 0, to: PAGE.width, color: CREAM_DEEP, thickness: 0.8 });
  return top - 62;
};

// =====================================================
// META GRID
// =====================================================
// Small letter-spaced label, value beneath it, generous air between rows. Rows
// are laid out on a 38pt pitch from `top`.
const META_PITCH = 38;

const metaLabel = (page, fonts, label, x, top) =>
  textTracked(page, label.toUpperCase(), { x, y: top, font: fonts.bold, size: 6.4, color: MUTED, tracking: 1.15 });

const metaCell = (page, fonts, label, value, x, top, width) => {
  metaLabel(page, fonts, label, x, top);
  text(page, fitText(safe(value), fonts.regular, 10.5, width), {
    x,
    y: top - 15,
    font: fonts.regular,
    size: 10.5,
  });
};

const metaPill = (page, fonts, label, status, x, top, width) => {
  metaLabel(page, fonts, label, x, top);
  drawPill(page, fonts, status || 'Pending', { x, y: top - 13, status, size: 7.5, maxWidth: width });
};

// Three columns across the content width, with a gutter that keeps a long name
// from crowding the value next to it.
const GRID = (() => {
  const step = CONTENT_W / 3;
  return { step, width: step - 18, x: [MARGIN, MARGIN + step, MARGIN + step * 2] };
})();

// =====================================================
// SUMMARY PAGE
// =====================================================
/**
 * The approval block on a claim every line of which was approved.
 *
 * Mirrors the line document's signature block, because it is making the same
 * statement — this was signed off — and the two should not look like different
 * kinds of document. It is only ever reached when nothing on the claim is
 * pending or refused.
 */
const drawClaimApproval = (
  page,
  fonts,
  { y, approvers, signature, approvedTotal, currency, lineCount }
) => {
  let cursor = y;

  metaLabel(page, fonts, 'Approved by', MARGIN, cursor);
  cursor -= 10;

  const SIG_AREA_H = 60;
  const sigRule = cursor - SIG_AREA_H;

  if (signature) {
    const box = signature.scaleToFit(200, SIG_AREA_H - 8);
    page.drawImage(signature, { x: MARGIN + 4, y: sigRule + 5, width: box.width, height: box.height });
  } else if (approvers.length > 1) {
    // Several people signed different lines. Drawing one signature here would
    // say something none of them said.
    text(page, 'Signed line by line - see each line document', {
      x: MARGIN + 4,
      y: sigRule + 10,
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    });
  } else {
    text(page, '(signature image unavailable)', {
      x: MARGIN + 4,
      y: sigRule + 10,
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    });
  }
  hairline(page, sigRule, { to: MARGIN + 230, thickness: 0.9, color: INK });

  cursor = sigRule - 15;
  const primary = approvers[0];
  text(page, fitText(safe(primary.name || 'Unknown approver'), fonts.bold, 11.5, 230), {
    x: MARGIN,
    y: cursor,
    font: fonts.bold,
    size: 11.5,
  });
  cursor -= 13;
  text(page, fitText(safe(primary.role || '-'), fonts.regular, 9.5, 230), {
    x: MARGIN,
    y: cursor,
    font: fonts.regular,
    size: 9.5,
    color: MUTED,
  });
  cursor -= 13;
  text(page, `Approved ${fmtStamp(primary.at)}`, {
    x: MARGIN,
    y: cursor,
    font: fonts.regular,
    size: 8.5,
    color: MUTED,
  });

  if (approvers.length > 1) {
    cursor -= 12;
    const rest = approvers.slice(1).map((a) => `${a.name}${a.role ? ` (${a.role})` : ''}`).join('; ');
    wrapText(`Also approved by ${rest}`, fonts.regular, 8, 240, 2).forEach((part, i) => {
      text(page, part, { x: MARGIN, y: cursor - i * 10, font: fonts.regular, size: 8, color: MUTED });
    });
    cursor -= 10;
  }

  // The figure, right-aligned opposite the signature.
  textTrackedRight(page, `APPROVED TOTAL (${currency})`, {
    end: PAGE.width - MARGIN,
    y: sigRule - 15,
    font: fonts.bold,
    size: 6.4,
    color: MUTED,
    tracking: 1.15,
  });
  const figure = money(approvedTotal);
  textRight(page, figure, {
    end: PAGE.width - MARGIN,
    y: sigRule - 40,
    font: fonts.bold,
    size: fitSize(figure, fonts.bold, 220, 18, 10),
  });
  textTrackedRight(page, `ALL ${lineCount} LINE${lineCount === 1 ? '' : 'S'} APPROVED`, {
    end: PAGE.width - MARGIN,
    y: sigRule - 54,
    font: fonts.regular,
    size: 6.4,
    color: MUTED,
    tracking: 1.1,
  });

  cursor -= 22;
  wrapText(
    'Each line was approved separately and has its own signed document carrying a verification code. This sheet summarises those approvals.',
    fonts.regular,
    7.8,
    CONTENT_W,
    2
  ).forEach((part, i) => {
    text(page, part, { x: MARGIN, y: cursor - i * 11, font: fonts.regular, size: 7.8, color: MUTED });
  });

  return cursor - 24;
};

// Async because a wholly-approved claim fetches the approver's signature.
const drawSummary = async (pdf, fonts, { claim, lines, receiptCount }) => {
  const approved = claim.status === 'Approved';
  const currency = claim.currency || 'INR';
  const docType = 'EXPENSE CLAIM';
  const reference = claim.claim_number || 'UNNUMBERED';

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = drawMasthead(page, fonts, {
    docType,
    reference,
    amountLabel: `CLAIMED TOTAL (${currency})`,
    amount: money(claim.total_amount),
    title: claim.title || '',
  });

  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = drawContinuation(page, fonts, { docType, reference });
    return page;
  };

  // Meta grid
  const metaRows = [
    [
      ['Claimant', claim.claimant_name || '-'],
      ['Team', claim.team || '-'],
      ['Submitted', fmtStamp(claim.submitted_at)],
    ],
    [
      ['Currency', currency],
      ['Revision', String(claim.revision ?? 1)],
      ['Status', claim.status || 'Pending', 'pill'],
    ],
  ];
  for (const row of metaRows) {
    row.forEach(([label, value, kind], i) => {
      if (kind === 'pill') metaPill(page, fonts, label, value, GRID.x[i], y, GRID.width);
      else metaCell(page, fonts, label, value, GRID.x[i], y, GRID.width);
    });
    y -= META_PITCH;
  }

  y -= 6;

  // ---------------------------------------------------
  // Line item table
  // ---------------------------------------------------
  const HEADER_H = 20;
  const ROW_SIZE = 9;
  const LINE_H = 11.5;

  const drawTableHeader = () => {
    page.drawRectangle({ x: MARGIN, y: y - HEADER_H, width: CONTENT_W, height: HEADER_H, color: CREAM });
    page.drawLine({
      start: { x: MARGIN, y: y - HEADER_H },
      end: { x: PAGE.width - MARGIN, y: y - HEADER_H },
      thickness: 1,
      color: RED,
    });
    for (const col of COLUMN_X) {
      const opts = { y: y - HEADER_H + 7, font: fonts.bold, size: 6.6, color: INK, tracking: 1 };
      if (col.right) textTrackedRight(page, col.label.toUpperCase(), { end: col.end - 5, ...opts });
      else textTracked(page, col.label.toUpperCase(), { x: col.x + 5, ...opts });
    }
    y -= HEADER_H + 2;
  };

  drawTableHeader();

  if (!lines.length) {
    text(page, 'No line items on this claim.', {
      x: MARGIN + 5,
      y: y - 14,
      font: fonts.regular,
      size: ROW_SIZE,
      color: MUTED,
    });
    y -= 26;
  }

  let totals = { amount: 0, tax: 0, total: 0 };
  lines.forEach((line, index) => {
    const descCol = COL.description;
    const desc = wrapText(line.description || '-', fonts.regular, ROW_SIZE, descCol.width - 10, 2);
    const rowH = Math.max(1, desc.length) * LINE_H + 10;

    // The table is allowed to run past one page; the total and the approval
    // rollup then land on the last one rather than being pushed off the sheet.
    if (y - rowH < BODY_BOTTOM + 150) {
      newPage();
      drawTableHeader();
    }

    if (index % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowH, width: CONTENT_W, height: rowH, color: ROW_WASH });
    }

    const top = y - 13;
    const status = lineStatus(line);
    totals = {
      amount: totals.amount + Number(line.amount || 0),
      tax: totals.tax + Number(line.tax_amount || 0),
      total: totals.total + lineTotal(line),
    };

    text(page, fitText(safe(fmtDate(line.expense_date)), fonts.regular, ROW_SIZE, COL.date.width - 10), {
      x: COL.date.x + 5,
      y: top,
      font: fonts.regular,
      size: ROW_SIZE,
    });
    text(page, fitText(safe(line.category || '-'), fonts.regular, ROW_SIZE, COL.category.width - 10), {
      x: COL.category.x + 5,
      y: top,
      font: fonts.regular,
      size: ROW_SIZE,
    });

    // Right-aligned to a fixed column edge, and shrunk rather than clipped: the
    // decimal points have to stack down the column whatever the magnitudes are.
    for (const [col, value, font] of [
      [COL.amount, line.amount, fonts.regular],
      [COL.tax, line.tax_amount, fonts.regular],
      [COL.total, lineTotal(line), fonts.bold],
    ]) {
      const figure = money(value);
      textRight(page, figure, {
        end: col.end - 5,
        y: top,
        font,
        size: fitSize(figure, font, col.width - 10, ROW_SIZE, 6.5),
      });
    }

    drawPill(page, fonts, status, {
      x: COL.status.x + 5,
      y: top,
      status,
      size: 6.3,
      maxWidth: COL.status.width - 10,
    });

    desc.forEach((part, i) => {
      text(page, part, {
        x: descCol.x + 5,
        y: top - i * LINE_H,
        font: fonts.regular,
        size: ROW_SIZE,
        color: i === 0 ? INK : MUTED,
      });
    });

    y -= rowH;
    hairline(page, y, { color: HAIR, thickness: 0.3 });
  });

  // ---------------------------------------------------
  // Total row — foots the columns printed directly above it
  // ---------------------------------------------------
  const TOTAL_H = 26;
  if (y - TOTAL_H < BODY_BOTTOM) newPage();

  page.drawRectangle({ x: MARGIN, y: y - TOTAL_H, width: CONTENT_W, height: TOTAL_H, color: CREAM });
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE.width - MARGIN, y },
    thickness: 1,
    color: RED,
  });
  const totalY = y - 17;
  textTracked(page, `TOTAL (${currency})`, {
    x: COL.date.x + 5,
    y: totalY,
    font: fonts.bold,
    size: 7.5,
    color: INK,
    tracking: 1.2,
  });
  for (const [col, value, size] of [
    [COL.amount, totals.amount, 9],
    [COL.tax, totals.tax, 9],
    [COL.total, totals.total, 10.5],
  ]) {
    const figure = money(value);
    textRight(page, figure, {
      end: col.end - 5,
      y: totalY,
      font: fonts.bold,
      size: fitSize(figure, fonts.bold, col.width - 10, size, 6.5),
    });
  }
  y -= TOTAL_H + 12;

  text(
    page,
    `${lines.length} line item${lines.length === 1 ? '' : 's'}  |  ${receiptCount} receipt${
      receiptCount === 1 ? '' : 's'
    } attached  |  claimed total of record ${currency} ${money(claim.total_amount)}`,
    { x: MARGIN, y, font: fonts.regular, size: 8, color: MUTED }
  );
  y -= 26;

  // ---------------------------------------------------
  // No signature and no verification code on this sheet: nobody signs a claim.
  // What the claim can honestly report is the tally of its lines, so a reader
  // holding only this page can see that some of it may have been refused.
  // ---------------------------------------------------
  if (y - (approved ? 110 : 190) < BODY_BOTTOM) newPage();

  if (!approved) {
    const BANNER_H = 34;
    page.drawRectangle({ x: MARGIN, y: y - BANNER_H, width: CONTENT_W, height: BANNER_H, color: ALERT });
    textTracked(page, bannerLabel(claim.status), {
      x: MARGIN + 14,
      y: y - 22,
      font: fonts.bold,
      size: fitTrackedSize(bannerLabel(claim.status), fonts.bold, CONTENT_W - 28, 13, 1.4, 8),
      color: CREAM,
      tracking: 1.4,
    });
    y -= BANNER_H + 14;

    const explanation = wrapText(
      `This claim is in "${claim.status}" status. Only the lines marked Approved above were signed off, each on its own document; this summary is not evidence of approval.`,
      fonts.regular,
      9,
      CONTENT_W,
      2
    );
    explanation.forEach((part, i) => {
      text(page, part, { x: MARGIN, y: y - i * 12, font: fonts.regular, size: 9, color: ALERT });
    });
    y -= explanation.length * 12 + 14;
  }

  const tally = { Approved: 0, Rejected: 0, Pending: 0 };
  let approvedTotal = 0;
  for (const line of lines) {
    const status = lineStatus(line);
    tally[status] = (tally[status] || 0) + 1;
    if (status === 'Approved') approvedTotal += lineTotal(line);
  }

  // ---------------------------------------------------
  // A claim whose every line was approved is, in substance, an approved claim,
  // and the sheet says so with the approver's signature. The rule it must not
  // break is the other direction: a claim with anything still pending or
  // refused gets the rollup below and no signature, so a summary can never
  // stand in for an approval that was not given.
  //
  // Several people may have signed different lines. Only a sole approver's
  // signature is drawn — a graphic beside a list of names would suggest one
  // person signed for all of them.
  // ---------------------------------------------------
  const everyLineApproved = lines.length > 0 && tally.Approved === lines.length;
  const approvers = [];
  for (const line of lines) {
    if (!line.approved_by_name) continue;
    const seen = approvers.find((a) => a.name === line.approved_by_name);
    if (!seen) {
      approvers.push({
        name: line.approved_by_name,
        role: line.approved_by_role || '',
        id: line.approved_by,
        at: line.approved_at,
      });
    } else if (line.approved_at && (!seen.at || line.approved_at > seen.at)) {
      seen.at = line.approved_at;
    }
  }

  if (everyLineApproved && approvers.length) {
    const signature =
      approvers.length === 1 ? await loadSignatureImage(pdf, approvers[0].id) : null;
    y = drawClaimApproval(page, fonts, {
      y,
      claim,
      approvers,
      signature,
      approvedTotal,
      currency,
      lineCount: lines.length,
    });
    return; // the rollup panel below is for a claim that is not wholly approved
  }

  const PANEL_H = 86;
  if (y - PANEL_H < BODY_BOTTOM) newPage();
  page.drawRectangle({
    x: MARGIN,
    y: y - PANEL_H,
    width: CONTENT_W,
    height: PANEL_H,
    color: PAPER,
    borderColor: CREAM_DEEP,
    borderWidth: 0.8,
  });
  page.drawRectangle({ x: MARGIN, y: y - PANEL_H, width: 3, height: PANEL_H, color: RED });

  textTracked(page, 'APPROVAL', { x: MARGIN + 16, y: y - 18, font: fonts.bold, size: 6.4, color: MUTED, tracking: 1.15 });
  textTrackedRight(page, `APPROVED TOTAL (${currency})`, {
    end: PAGE.width - MARGIN - 16,
    y: y - 18,
    font: fonts.bold,
    size: 6.4,
    color: MUTED,
    tracking: 1.15,
  });
  textRight(page, money(approvedTotal), {
    end: PAGE.width - MARGIN - 16,
    y: y - 40,
    font: fonts.bold,
    size: 15,
  });

  let cursor = MARGIN + 16;
  for (const [status, count] of [
    ['Approved', tally.Approved],
    ['Rejected', tally.Rejected],
    ['Pending', tally.Pending],
  ]) {
    cursor += drawPill(page, fonts, `${count} ${status}`, {
      x: cursor,
      y: y - 40,
      status,
      size: 7.5,
      maxWidth: 92,
    }) + 8;
  }

  wrapText(
    'Each line is approved on its own. An approved line has a separate signed document carrying the approver and a verification code; this summary carries neither.',
    fonts.regular,
    7.8,
    CONTENT_W - 32,
    2
  ).forEach((part, i) => {
    text(page, part, { x: MARGIN + 16, y: y - 62 - i * 11, font: fonts.regular, size: 7.8, color: MUTED });
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
  const docType = 'APPROVED EXPENSE';

  let page = pdf.addPage([PAGE.width, PAGE.height]);
  let y = drawMasthead(page, fonts, {
    docType,
    reference,
    amountLabel: `APPROVED AMOUNT (${currency})`,
    amount: money(lineTotal(line)),
    title: claim.title || '',
    // buildLinePdf refuses to render anything but an approved line, so this pill
    // can only ever read Approved — it is never a claim about a pending expense.
    pill: 'Approved',
  });

  const newPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    y = drawContinuation(page, fonts, { docType, reference });
    return page;
  };

  const metaRows = [
    [
      ['Claimant', claim.claimant_name || '-'],
      ['Team', claim.team || '-'],
      ['Expense date', fmtDate(line.expense_date)],
    ],
    [
      ['Category', line.category || '-'],
      [`Amount (${currency})`, money(line.amount)],
      [`Tax (${currency})`, money(line.tax_amount)],
    ],
  ];
  for (const row of metaRows) {
    row.forEach(([label, value], i) => metaCell(page, fonts, label, value, GRID.x[i], y, GRID.width));
    y -= META_PITCH;
  }

  metaLabel(page, fonts, 'Description', MARGIN, y);
  y -= 16;
  const description = wrapText(line.description || '-', fonts.regular, 10.5, CONTENT_W, 6);
  (description.length ? description : ['-']).forEach((part, i) => {
    text(page, part, { x: MARGIN, y: y - i * 14, font: fonts.regular, size: 10.5 });
  });
  y -= Math.max(1, description.length) * 14 + 14;

  // Amount band: the same figure as the masthead, footed where an invoice foots
  // its total, so the sheet reads correctly from either end.
  const BAND_H = 30;
  if (y - BAND_H < BODY_BOTTOM) newPage();
  page.drawRectangle({ x: MARGIN, y: y - BAND_H, width: CONTENT_W, height: BAND_H, color: CREAM });
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE.width - MARGIN, y }, thickness: 1, color: RED });
  textTracked(page, `LINE TOTAL (${currency})`, {
    x: MARGIN + 14,
    y: y - 19,
    font: fonts.bold,
    size: 7.5,
    color: INK,
    tracking: 1.2,
  });
  const bandFigure = money(lineTotal(line));
  textRight(page, bandFigure, {
    end: PAGE.width - MARGIN - 14,
    y: y - 21,
    font: fonts.bold,
    size: fitSize(bandFigure, fonts.bold, 240, 15, 9),
  });
  y -= BAND_H + 12;

  text(page, `${receiptCount} receipt${receiptCount === 1 ? '' : 's'} attached`, {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 8,
    color: MUTED,
  });
  y -= 30;

  // ---------------------------------------------------
  // Signature block. The reserve covers the verification panel too — the code
  // must never be orphaned onto a page away from the signature it belongs to.
  // ---------------------------------------------------
  if (y - 210 < BODY_BOTTOM) newPage();

  metaLabel(page, fonts, 'Approved by', MARGIN, y);
  y -= 10;

  const SIG_AREA_H = 60;
  const sigRule = y - SIG_AREA_H;
  if (signature) {
    const box = signature.scaleToFit(200, SIG_AREA_H - 8);
    page.drawImage(signature, { x: MARGIN + 4, y: sigRule + 5, width: box.width, height: box.height });
  } else {
    text(page, '(signature image unavailable)', {
      x: MARGIN + 4,
      y: sigRule + 10,
      font: fonts.regular,
      size: 8.5,
      color: MUTED,
    });
  }
  hairline(page, sigRule, { to: MARGIN + 230, thickness: 0.9, color: INK });

  y = sigRule - 15;
  text(page, fitText(safe(line.approved_by_name || 'Unknown approver'), fonts.bold, 11.5, 230), {
    x: MARGIN,
    y,
    font: fonts.bold,
    size: 11.5,
  });
  y -= 13;
  text(page, fitText(safe(line.approved_by_role || '-'), fonts.regular, 9.5, 230), {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 9.5,
    color: MUTED,
  });
  y -= 13;
  text(page, `Approved ${fmtStamp(line.approved_at)}`, {
    x: MARGIN,
    y,
    font: fonts.regular,
    size: 9.5,
    color: MUTED,
  });
  y -= 26;

  const BOX_H = 62;
  page.drawRectangle({
    x: MARGIN,
    y: y - BOX_H,
    width: CONTENT_W,
    height: BOX_H,
    color: PAPER,
    borderColor: RULE,
    borderWidth: 0.8,
  });
  page.drawRectangle({ x: MARGIN, y: y - BOX_H, width: 3, height: BOX_H, color: RED });

  textTracked(page, 'VERIFICATION CODE', {
    x: MARGIN + 16,
    y: y - 18,
    font: fonts.bold,
    size: 6.3,
    color: MUTED,
    tracking: 1.2,
  });
  const code = safe(line.verify_code || 'not issued');
  text(page, code, {
    x: MARGIN + 16,
    y: y - 38,
    font: fonts.bold,
    size: fitSize(code, fonts.bold, CONTENT_W - 32, 15, 8),
  });

  const url = verifyUrl(line.verify_code);
  const verifyLine = url
    ? `Verify at ${url}`
    : 'Verify this approval in the expense system using the code above.';
  const verifySize = fitSize(safe(verifyLine), fonts.regular, CONTENT_W - 32, 8.5, 6.5);
  text(page, fitText(safe(verifyLine), fonts.regular, verifySize, CONTENT_W - 32), {
    x: MARGIN + 16,
    y: y - 53,
    font: fonts.regular,
    size: verifySize,
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
        status: 'Approved',
        label: `Approved by ${line.approved_by_name || 'unknown'}, ${line.approved_by_role || '-'} - ${fmtStamp(line.approved_at)}`,
      };
    }
    return {
      approved: false,
      status: lineStatus(line),
      label: `NOT APPROVED - line status "${lineStatus(line)}"`,
    };
  }
  if (claim.status === 'Approved') {
    return {
      approved: true,
      status: 'Approved',
      label: `Approved by ${claim.approved_by_name || 'unknown'}, ${claim.approved_by_role || '-'} - ${fmtStamp(claim.approved_at)}`,
    };
  }
  return {
    approved: false,
    status: claim.status || 'Pending',
    label: `NOT APPROVED - claim status "${claim.status}"`,
  };
};

// Caption band across the top of a page we own: one cream header block, not a
// stack of loose lines. Returns the y below which the receipt itself may be
// drawn — nothing above that line belongs to the bill, and nothing below it
// belongs to us.
const drawReceiptHeader = (page, fonts, { claim, receipt, line, index, count, note, reference, verifyCode }) => {
  const stamp = approvalStamp(claim, line);
  const top = PAGE.height - TOP_BAR_H;
  const bandH = note ? 92 : 78;
  const bottom = top - bandH;

  page.drawRectangle({ x: 0, y: bottom, width: PAGE.width, height: bandH, color: CREAM });
  page.drawLine({ start: { x: 0, y: bottom }, end: { x: PAGE.width, y: bottom }, thickness: 0.8, color: CREAM_DEEP });

  textTracked(page, `RECEIPT ${index} OF ${count}`, {
    x: MARGIN,
    y: top - 22,
    font: fonts.bold,
    size: 9,
    color: INK,
    tracking: 1.4,
  });
  textRight(page, fitText(safe(safeFileName(receipt.file_name, 'unnamed file')), fonts.regular, 8.5, 210), {
    end: PAGE.width - MARGIN,
    y: top - 22,
    font: fonts.regular,
    size: 8.5,
    color: MUTED,
  });

  const lineSummary = line
    ? `${fmtDate(line.expense_date)}  |  ${line.category || '-'}  |  ${claim.currency || 'INR'} ${money(
        lineTotal(line)
      )}`
    : 'Not linked to a line item';
  text(page, fitText(safe(lineSummary), fonts.regular, 9.5, CONTENT_W - 120), {
    x: MARGIN,
    y: top - 42,
    font: fonts.regular,
    size: 9.5,
    color: INK,
  });
  // The pill is the loudest thing in the band on purpose: on a receipt page it
  // is doing the work the watermark is not allowed to do across the bill below.
  drawPill(page, fonts, stamp.status, {
    end: PAGE.width - MARGIN,
    y: top - 42,
    status: stamp.status,
    size: 7,
    maxWidth: 104,
  });

  text(page, fitText(safe(stamp.label), fonts.regular, 8.5, CONTENT_W), {
    x: MARGIN,
    y: top - 58,
    font: fonts.regular,
    size: 8.5,
    color: stamp.approved ? MUTED : ALERT,
  });

  // A verification code appears only where it belongs to what is being printed:
  // the claim document has none to show.
  const provenance = [
    `Ref ${reference || claim.claim_number || '-'}`,
    `File hash ${shortHash(receipt.file_sha256)}`,
    verifyCode ? `Verify ${verifyCode}` : null,
  ]
    .filter(Boolean)
    .join('  |  ');
  text(page, fitText(safe(provenance), fonts.regular, 7.5, CONTENT_W), {
    x: MARGIN,
    y: top - 70,
    font: fonts.regular,
    size: 7.5,
    color: MUTED,
  });

  if (note) {
    text(page, fitText(safe(note), fonts.regular, 8, CONTENT_W), {
      x: MARGIN,
      y: top - 84,
      font: fonts.regular,
      size: 8,
      color: MUTED,
    });
  }

  return bottom - 14;
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

  let y = top - 64;
  textTracked(page, 'RECEIPT FILE NOT INCLUDED', {
    x: MARGIN + 22,
    y,
    font: fonts.bold,
    size: 11,
    color: ALERT,
    tracking: 1.3,
  });
  y -= 12;
  hairline(page, y, { from: MARGIN + 22, to: MARGIN + 222, thickness: 0.8, color: ALERT });
  y -= 22;

  for (const [label, value] of [
    ['File', safeFileName(receipt.file_name, 'unnamed')],
    ['Type', receipt.mime_type || 'unknown'],
    ['SHA-256', receipt.file_sha256 || 'unknown'],
    ['Reason', reason],
  ]) {
    textTracked(page, label.toUpperCase(), {
      x: MARGIN + 22,
      y,
      font: fonts.bold,
      size: 6.3,
      color: MUTED,
      tracking: 1.1,
    });
    text(page, fitText(safe(value), fonts.regular, 9.5, CONTENT_W - 128), {
      x: MARGIN + 96,
      y,
      font: fonts.regular,
      size: 9.5,
      color: INK,
    });
    y -= 17;
  }

  y -= 8;
  text(page, 'The receipt record still stands; only the stored file could not be read at render time.', {
    x: MARGIN + 22,
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
const appendPdfReceipt = async (pdf, fonts, context, bytes, guard) => {
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
    y: top - 24,
    font: fonts.regular,
    size: 10,
    color: MUTED,
  });

  const copied = await pdf.copyPages(source, indices);
  for (const copiedPage of copied) {
    pdf.addPage(copiedPage);
    guard.verbatim.add(copiedPage);
  }
};

const appendReceipt = async (pdf, fonts, context, guard) => {
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
    if (kind === 'pdf') await appendPdfReceipt(pdf, fonts, context, bytes, guard);
    else if (kind === 'png' || kind === 'jpg') {
      guard.evidence.add(await drawImageReceipt(pdf, fonts, context, bytes, kind));
    } else {
      drawPlaceholder(pdf, fonts, context, `unsupported file type "${receipt.mime_type || mimeType || 'unknown'}"`);
    }
  } catch (err) {
    drawPlaceholder(pdf, fonts, context, err.message || 'the file could not be embedded');
  }
};

// =====================================================
// PAGE FURNITURE
// =====================================================
// Runs last, when the page count is finally known. Copied receipt pages are
// skipped entirely: a footer over someone's invoice is still ink on the
// evidence.
//
// `guard.evidence` holds the pages where we embedded a receipt image ourselves.
// Those keep the red rule and the footer — both sit outside the image box — but
// not the diagonal watermark, which would run straight across the bill. The
// caption band on those pages already carries the status pill and, when the
// expense is not approved, a red NOT APPROVED stamp, so nothing there can read
// as approved when it is not.
const finishPages = (pdf, fonts, guard, { footer, watermark }) => {
  const all = pdf.getPages();

  all.forEach((page, i) => {
    if (guard.verbatim.has(page)) return;

    page.drawRectangle({
      x: 0,
      y: PAGE.height - TOP_BAR_H,
      width: PAGE.width,
      height: TOP_BAR_H,
      color: RED,
    });

    if (watermark && !guard.evidence.has(page)) {
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

    hairline(page, FOOTER_Y + 13, { color: HAIR, thickness: 0.5 });
    text(page, fitText(safe(footer), fonts.regular, 7.5, 185), {
      x: MARGIN,
      y: FOOTER_Y,
      font: fonts.regular,
      size: 7.5,
      color: MUTED,
    });
    textTrackedCenter(page, 'PARTNERING PROGRESS', {
      center: PAGE.width / 2,
      y: FOOTER_Y,
      font: fonts.regular,
      size: 6.2,
      color: FAINT,
      tracking: 1.2,
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

const newGuard = () => ({ verbatim: new Set(), evidence: new Set() });

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
  await drawSummary(pdf, fonts, { claim, lines, receiptCount: receipts.length });

  const linesById = new Map(lines.map((line) => [line.id, line]));
  const guard = newGuard();

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
      guard
    );
  }

  finishPages(pdf, fonts, guard, {
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

  const guard = newGuard();
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
      guard
    );
  }

  finishPages(pdf, fonts, guard, {
    footer: `${reference} | Verify ${line.verify_code || '-'}`,
    watermark: null,
  });

  return Buffer.from(await pdf.save());
};

module.exports = { buildClaimPdf, buildLinePdf };
