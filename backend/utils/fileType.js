// =====================================================
// Upload validation by content, not by claim
// =====================================================
// A browser-supplied mimetype and a filename extension are both attacker
// controlled. These read the actual leading bytes instead.

const SIGNATURES = [
  { mime: 'image/jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'application/pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] }, // %PDF
];

const startsWith = (buffer, magic) =>
  buffer.length >= magic.length && magic.every((byte, i) => buffer[i] === byte);

/** The real type of `buffer`, or null when it is not one we accept. */
const detectFileType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return null;
  return SIGNATURES.find((sig) => startsWith(buffer, sig.magic)) || null;
};

// Never reuse the client's filename on disk or in a URL. This keeps something
// human-readable for the PDF appendix and download headers without letting a
// path separator or control character through.
const safeFileName = (name, fallback = 'receipt') => {
  const base = String(name || '')
    .split(/[\\/]/)
    .pop()
    .replace(/[^\w.\- ]+/g, '')
    .trim()
    .slice(0, 120);
  return base || fallback;
};

// =====================================================
// Structural validation
// =====================================================
// detectFileType only reads the first few bytes, so a photo truncated by a
// dropped mobile upload passes it: correct header, missing tail. pdf-lib does
// not reject such an image — its decoder stalls SYNCHRONOUSLY and never
// returns, which blocks the entire Node process, not just that request. A
// timeout cannot rescue it because the event loop never gets a turn. So the
// structure is checked here, before those bytes reach a decoder.

const crc32 = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return (buf) => {
    let c = -1;
    for (let i = 0; i < buf.length; i += 1) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
})();

// Walks the chunk list, checking every declared length and CRC, and requires a
// terminating IEND — the chunk a truncated file is missing.
const validatePng = (buf) => {
  let offset = 8;
  let sawIhdr = false;

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('latin1', offset + 4, offset + 8);
    const dataEnd = offset + 8 + length;

    if (length > buf.length) return 'image data is truncated or corrupt';
    if (dataEnd + 4 > buf.length) return 'image data is truncated';
    if (crc32(buf.subarray(offset + 4, dataEnd)) !== buf.readUInt32BE(dataEnd)) {
      return 'image data is corrupt (checksum mismatch)';
    }

    if (type === 'IHDR') sawIhdr = true;
    if (type === 'IEND') return sawIhdr ? null : 'image is missing its header';

    offset = dataEnd + 4;
  }
  return 'image is incomplete';
};

// JPEG carries no per-segment checksum, so this walks the marker chain and
// requires the end-of-image marker rather than trusting the header alone.
const validateJpeg = (buf) => {
  if (buf.length < 4) return 'image is too small to be valid';
  const tail = buf.subarray(buf.length - 2);
  if (tail[0] !== 0xff || tail[1] !== 0xd9) return 'image data is truncated';

  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return 'image data is corrupt';
    const marker = buf[offset + 1];
    // Start of scan: entropy-coded data runs to the end marker, already checked.
    if (marker === 0xda) return null;
    if (marker === 0xd9) return null;
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buf.length) return 'image data is truncated';
    offset += 2 + length;
  }
  return 'image data is truncated';
};

/**
 * Structural check for an already type-detected buffer.
 * @returns {string|null} a human-readable reason, or null when the file is sound.
 */
const validateFileStructure = (buffer, ext) => {
  if (!Buffer.isBuffer(buffer) || !buffer.length) return 'file is empty';
  if (ext === 'png') return validatePng(buffer);
  if (ext === 'jpg') return validateJpeg(buffer);
  // A malformed PDF is handled by pdf-lib's own parser, which throws rather
  // than stalling, and lands on the placeholder page.
  return null;
};

module.exports = { detectFileType, safeFileName, validateFileStructure, SIGNATURES };
