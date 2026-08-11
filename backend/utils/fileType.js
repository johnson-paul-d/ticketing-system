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

module.exports = { detectFileType, safeFileName, SIGNATURES };
