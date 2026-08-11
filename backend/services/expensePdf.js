const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');

const supabase = require('../config/supabase');
const fileStore = require('./fileStore');
const { detectFileType, safeFileName } = require('../utils/fileType');

// =====================================================
// Expense claim PDF
// =====================================================
// A rendering of the stored claim, never a source of truth: nothing here writes
// back, so the same claim always produces the same document and a lost PDF is
// simply regenerated.
//
// Two rules the layout exists to enforce:
//   1. An unapproved claim must never look approved — no signature, and a
//      watermark on every page this file draws.
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
  { key: 'date', label: 'Date', width: 62 },
  { key: 'category', label: 'Category', width: 92 },
  { key: 'description', label: 'Description', width: 173 },
  { key: 'amount', label: 'Amount', width: 58, right: true },
  { key: 'tax', label: 'Tax', width: 50, right: true },
  { key: 'total', label: 'Line total', width: 64, right: true },
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');

// Read in UTC because that is what utils/time.js writes. A `date` column arrives
// as YYYY-MM-DD and parses to UTC midnight, so the day never slips backwards on
// a server west of Greenwich.
const fmtDate = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${pad2(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const fmtStamp = (value) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return `${fmtDate(value)}, ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
};

const fmtPeriod = (claim) => {
  if (!claim.period_from && !claim.period_to) return '-';
  return `${fmtDate(claim.period_from)}  to  ${fmtDate(claim.period_to)}`;
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

const loadReceipts = async (claimId) => {
  const { data, error } = await supabase
    .from('expense_receipts')
    .select('*')
    .eq('claim_id', claimId)
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

const fetchFile = async (storagePath) => {
  const file = await fileStore.get(storagePath);
  return { bytes: await streamToBuffer(file.stream), mimeType: file.mimeType };
};

// Drive reports whatever mime type was set at upload and hands back
// application/octet-stream often enough that the bytes decide instead. Sharing
// the upload path's signature table means anything accepted on upload is
// recognised here, and anything else lands on a placeholder rather than being
// guessed at.
const sniff = (bytes) => detectFileType(bytes)?.ext || null;

// The signature graphic is the only thing read from the users table: the printed
// name and role come from the claim row, which froze them at approval, so a
// later promotion cannot rewrite what an old claim says was signed.
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
    if (kind === 'png') return pdf.embedPng(bytes);
    if (kind === 'jpg') return pdf.embedJpg(bytes);
    return null;
  } catch (err) {
    console.error('EXPENSE PDF: signature unavailable:', err.message);
    return null;
  }
};

// =====================================================
// SUMMARY PAGE
// =====================================================
const drawSummary = (pdf, fonts, { claim, lines, signature, receiptCount }) => {
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

  const cell = (label, value, x, top) => {
    text(page, label.toUpperCase(), { x, y: top, font: fonts.bold, size: 7.5, color: MUTED });
    text(page, fitText(safe(value), fonts.regular, 10.5, cellW), {
      x,
      y: top - 13,
      font: fonts.regular,
      size: 10.5,
    });
  };

  const metaRows = [
    ['Claimant', claim.claimant_name || '-', 'Team', claim.team || '-'],
    ['Period', fmtPeriod(claim), 'Currency', currency],
    ['Submitted', fmtStamp(claim.submitted_at), 'Approved', approved ? fmtStamp(claim.approved_at) : '-'],
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
    const descCol = COLUMN_X[2];
    const desc = wrapText(line.description || '-', fonts.regular, ROW_SIZE, descCol.width - 8, 2);
    const rowH = Math.max(1, desc.length) * LINE_H + 6;

    // The table is allowed to run past one page; the total and approval block
    // then land on the last one rather than being pushed off the sheet.
    if (y - rowH < BODY_BOTTOM + 140) {
      newPage();
      drawTableHeader();
    }

    const top = y - 10;
    const cells = [
      { col: COLUMN_X[0], value: fmtDate(line.expense_date) },
      { col: COLUMN_X[1], value: fitText(safe(line.category || '-'), fonts.regular, ROW_SIZE, COLUMN_X[1].width - 8) },
      { col: COLUMN_X[3], value: money(line.amount) },
      { col: COLUMN_X[4], value: money(line.tax_amount) },
      { col: COLUMN_X[5], value: money(Number(line.amount || 0) + Number(line.tax_amount || 0)) },
    ];

    for (const { col, value } of cells) {
      if (col.right) {
        textRight(page, value, { end: col.end - 4, y: top, font: fonts.regular, size: ROW_SIZE });
      } else {
        text(page, value, { x: col.x + 4, y: top, font: fonts.regular, size: ROW_SIZE });
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
  text(page, `TOTAL (${currency})`, { x: PAGE.width - MARGIN - 240, y, font: fonts.bold, size: 11 });
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

  // Approval block, or a banner saying plainly that there isn't one. The
  // reserve covers the verification lines too — the code must never be orphaned
  // onto a page away from the signature it belongs to.
  const BLOCK_H = approved ? 200 : 130;
  if (y - BLOCK_H < BODY_BOTTOM) newPage();

  if (approved) {
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
    text(page, claim.approved_by_name || 'Unknown approver', {
      x: MARGIN,
      y,
      font: fonts.bold,
      size: 11,
    });
    y -= 13;
    text(page, claim.approved_by_role || '-', { x: MARGIN, y, font: fonts.regular, size: 9.5, color: MUTED });
    y -= 13;
    text(page, `Approved ${fmtStamp(claim.approved_at)}`, {
      x: MARGIN,
      y,
      font: fonts.regular,
      size: 9.5,
      color: MUTED,
    });
    y -= 24;
  } else {
    const label = claim.status === 'Submitted' ? 'PENDING APPROVAL' : 'DRAFT - NOT APPROVED';
    page.drawRectangle({ x: MARGIN, y: y - 34, width: CONTENT_W, height: 38, color: ALERT });
    text(page, label, { x: MARGIN + 14, y: y - 22, font: fonts.bold, size: 15, color: PAPER });
    y -= 48;
    text(page, `This claim is in "${claim.status}" status. No approver has signed it and this document is not evidence of approval.`, {
      x: MARGIN,
      y,
      font: fonts.regular,
      size: 9.5,
      color: ALERT,
    });
    y -= 26;
  }

  // Verification
  const url = verifyUrl(claim.verify_code);
  text(page, 'VERIFICATION CODE', { x: MARGIN, y, font: fonts.bold, size: 7.5, color: MUTED });
  y -= 15;
  text(page, claim.verify_code || 'not issued', { x: MARGIN, y, font: fonts.bold, size: 13 });
  y -= 14;
  text(page, url ? `Verify at ${url}` : 'Verify this claim in the expense system using the code above.', {
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
// Caption band across the top of a page we own. Returns the y below which the
// receipt itself may be drawn — nothing above that line belongs to the bill,
// and nothing below it belongs to us.
const drawReceiptHeader = (page, fonts, { claim, receipt, line, index, count, note }) => {
  const approved = claim.status === 'Approved';
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
        Number(line.amount || 0) + Number(line.tax_amount || 0)
      )}`
    : 'Not linked to a line item';
  text(page, lineSummary, { x: MARGIN, y, font: fonts.regular, size: 10, color: INK });
  y -= 14;

  text(
    page,
    approved
      ? `Approved by ${claim.approved_by_name || 'unknown'}, ${claim.approved_by_role || '-'} - ${fmtStamp(claim.approved_at)}`
      : `NOT APPROVED - claim status "${claim.status}"`,
    { x: MARGIN, y, font: fonts.regular, size: 9, color: approved ? MUTED : ALERT }
  );
  y -= 12;

  text(
    page,
    `Claim ${claim.claim_number || '-'} | File hash ${shortHash(receipt.file_sha256)} | Verify ${claim.verify_code || '-'}`,
    { x: MARGIN, y, font: fonts.regular, size: 8, color: MUTED }
  );
  y -= 10;

  if (note) {
    text(page, note, { x: MARGIN, y, font: fonts.regular, size: 8.5, color: MUTED });
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
  const image = kind === 'png' ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
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
  const source = await PDFDocument.load(bytes, { ignoreEncryption: true });
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
const finishPages = (pdf, fonts, claim, verbatim) => {
  const approved = claim.status === 'Approved';
  const all = pdf.getPages();

  all.forEach((page, i) => {
    if (verbatim.has(page)) return;

    if (!approved) {
      const mark = claim.status === 'Submitted' ? 'PENDING APPROVAL' : 'NOT APPROVED';
      page.drawText(mark, {
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
    text(page, `${claim.claim_number || 'Expense claim'} | Verify ${claim.verify_code || '-'}`, {
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

  // Only fetched for an approved claim: an unapproved PDF must not carry the
  // signature anywhere, not even embedded and unused.
  const signature = claim.status === 'Approved' ? await loadSignatureImage(pdf, claim.approved_by) : null;

  drawSummary(pdf, fonts, { claim, lines, signature, receiptCount: receipts.length });

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
      },
      verbatim
    );
  }

  finishPages(pdf, fonts, claim, verbatim);

  return Buffer.from(await pdf.save());
};

module.exports = { buildClaimPdf };
