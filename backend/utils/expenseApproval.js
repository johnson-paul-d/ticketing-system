// =====================================================
// Expense approval: who may approve, and the signed record
// =====================================================

const crypto = require('crypto');
const { isSuperAdmin, isAdmin, getUserTeam } = require('./roles');

/**
 * May `user` approve `claim`?
 *
 * Two rules, and the second is the one that matters. A team admin is themselves
 * a member of that team, so "admins approve their own team" would otherwise let
 * them sign off their own reimbursement. Nobody approves their own claim,
 * whatever their role — an admin's claim escalates to a Super Admin, and a
 * Super Admin's claim needs a different Super Admin.
 */
const canApproveClaim = (user, claim) => {
  if (!user || !claim) return false;
  if (claim.claimant_id === user.id) return false;
  if (isSuperAdmin(user)) return true;
  if (!isAdmin(user)) return false;
  return claim.team === getUserTeam(user);
};

// Explains a refusal, so the client can say something better than "denied".
const approvalRefusalReason = (user, claim) => {
  if (claim.claimant_id === user.id) {
    return 'You cannot approve your own claim. It has to be approved by a Super Admin.';
  }
  if (!isAdmin(user)) return 'Only an admin can approve expense claims';
  if (!isSuperAdmin(user) && claim.team !== getUserTeam(user)) {
    return 'You can only approve claims from your own team';
  }
  return 'You cannot approve this claim';
};

/**
 * The bytes an approval attests to.
 *
 * Receipt hashes are included deliberately. Covering only the amounts would let
 * someone swap the underlying bill after approval while the printed
 * verification code still validated — the printout would read "verified" over a
 * different receipt. Sorting makes the digest independent of row order.
 */
const canonicalPayload = (claim, lines, receipts, approver, approvedAt) =>
  JSON.stringify({
    claim_id: claim.id,
    claimant_id: claim.claimant_id,
    team: claim.team,
    currency: claim.currency,
    revision: claim.revision,
    total_amount: Number(claim.total_amount).toFixed(2),
    lines: [...lines]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((l) => ({
        expense_date: l.expense_date,
        category: l.category,
        amount: Number(l.amount).toFixed(2),
        tax_amount: Number(l.tax_amount || 0).toFixed(2),
      })),
    receipts: [...receipts].map((r) => r.file_sha256).sort(),
    approver_id: approver.id,
    approved_at: approvedAt,
  });

const approvalHash = (...args) =>
  crypto.createHash('sha256').update(canonicalPayload(...args)).digest('hex');

// Printed on the PDF, so it has to be transcribable by hand: uppercase, and no
// characters that blur together in a scanned document.
const AMBIGUOUS = /[01IOU]/g;
const verifyCodeFrom = (hash) =>
  hash.toUpperCase().replace(AMBIGUOUS, '').slice(0, 10);

module.exports = {
  canApproveClaim,
  approvalRefusalReason,
  canonicalPayload,
  approvalHash,
  verifyCodeFrom,
};
