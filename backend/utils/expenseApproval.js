// =====================================================
// Expense approval: who may approve, and the signed record
// =====================================================

const crypto = require('crypto');
const { isSuperAdmin, isAdmin, getUserTeam } = require('./roles');

/**
 * May `user` approve `claim`?
 *
 * Two rules: you must be an admin, and the claim must be on your team. A Super
 * Admin spans every team.
 *
 * There used to be a third — nobody approves their own claim, an admin's
 * escalating to a Super Admin — and its removal was a deliberate decision by the
 * business rather than an oversight. It was removed for two reasons, and the
 * second is the one that actually mattered.
 *
 * The rule only ever looked at the claim's claimant, and anyone on a team may
 * add a line to a teammate's claim (see canEditClaim). So an admin could add a
 * bill to someone else's claim and approve it, because they were not the
 * claimant — the control read as segregation of duties while leaving that route
 * open, and expense_lines records no author, so nothing showed who had added
 * the line. A rule that stops the honest case and not the quiet one is worse
 * than no rule, because it is trusted.
 *
 * And the escalation it forced did not exist in practice: an admin's own claim
 * waited on a Super Admin who may be one person, or the same person.
 *
 * What carries the weight instead is the record, not the gate. Every approval
 * stores approved_by, approved_by_name, approved_by_role and approved_at, and is
 * covered by an approval hash printed over the approver's signature — so an
 * admin approving their own reimbursement is permitted, attributable, and
 * plainly visible as such on the claim and in the expense report. If separation
 * is wanted back, put it here and record who adds each line, or the same gap
 * reopens through a teammate's claim.
 */
const canApproveClaim = (user, claim) => {
  if (!user || !claim) return false;
  if (isSuperAdmin(user)) return true;
  if (!isAdmin(user)) return false;
  return claim.team === getUserTeam(user);
};

// Explains a refusal, so the client can say something better than "denied".
const approvalRefusalReason = (user, claim) => {
  if (!isAdmin(user)) return 'Only an admin can approve expense claims';
  if (!isSuperAdmin(user) && claim.team !== getUserTeam(user)) {
    return 'You can only approve claims from your own team';
  }
  return 'You cannot approve this claim';
};

/**
 * The bytes a line's approval attests to.
 *
 * Receipt hashes are included deliberately. Covering only the amount would let
 * someone swap the underlying bill after approval while the printed
 * verification code still validated — the printout would read "verified" over a
 * different receipt. Sorting makes the digest independent of row order.
 *
 * Only the receipts belonging to this line are covered, because the document a
 * line produces contains only those. Another line's bill changing has no
 * bearing on what this approver signed.
 */
const canonicalLinePayload = (claim, line, receipts, approver, approvedAt) =>
  JSON.stringify({
    claim_id: claim.id,
    line_id: line.id,
    claimant_id: claim.claimant_id,
    team: claim.team,
    currency: claim.currency,
    expense_date: line.expense_date,
    category: line.category,
    amount: Number(line.amount).toFixed(2),
    tax_amount: Number(line.tax_amount || 0).toFixed(2),
    receipts: [...receipts].map((r) => r.file_sha256).sort(),
    approver_id: approver.id,
    approved_at: approvedAt,
  });

const lineApprovalHash = (...args) =>
  crypto.createHash('sha256').update(canonicalLinePayload(...args)).digest('hex');

// Printed on the PDF, so it has to be transcribable by hand: uppercase, and no
// characters that blur together in a scanned document.
const AMBIGUOUS = /[01IOU]/g;
const verifyCodeFrom = (hash) =>
  hash.toUpperCase().replace(AMBIGUOUS, '').slice(0, 10);

// A claim's status is whatever its lines add up to. Derived rather than stored
// as a separate decision, so the envelope can never disagree with its contents.
const rollupStatus = (lines) => {
  if (!lines.length) return 'Submitted';
  const approved = lines.filter((l) => l.approval_status === 'Approved').length;
  const rejected = lines.filter((l) => l.approval_status === 'Rejected').length;

  if (approved === lines.length) return 'Approved';
  if (rejected === lines.length) return 'Rejected';
  if (approved + rejected === lines.length) return 'Partially Approved';
  // Something is still undecided.
  return approved || rejected ? 'Partially Approved' : 'Submitted';
};

module.exports = {
  canApproveClaim,
  approvalRefusalReason,
  canonicalLinePayload,
  lineApprovalHash,
  verifyCodeFrom,
  rollupStatus,
};
