// =====================================================
// PDF upload probe
// =====================================================
// A receipt PDF is copied page-for-page into the printed claim, so it has to be
// readable at upload time — otherwise the failure surfaces days later as a
// blank page in an approved document, when the claimant no longer has the bill
// to hand.
//
// Encryption is the case that matters. pdf-lib loads an encrypted file happily
// when told to ignore encryption, but never decrypts its streams: the copied
// pages then contain encrypted bytes and render blank. Copy shops and invoice
// generators apply owner-password protection as a default, so this is common.

const { PDFDocument } = require('pdf-lib');

const isEncryptedError = (err) =>
  /encrypt/i.test(err?.message || '') || err?.name === 'EncryptedPDFError';

/**
 * @returns {Promise<string|null>} a claimant-facing reason, or null when usable.
 */
const probePdf = async (buffer) => {
  let doc;
  try {
    doc = await PDFDocument.load(buffer, { ignoreEncryption: false, updateMetadata: false });
  } catch (err) {
    if (isEncryptedError(err)) {
      return 'it is password-protected, so its contents cannot be copied into the claim';
    }
    return 'it could not be read as a PDF';
  }

  if (doc.getPageCount() === 0) return 'it contains no pages';
  return null;
};

module.exports = { probePdf };
