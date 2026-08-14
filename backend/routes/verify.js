const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const { rateLimit } = require('../utils/rateLimit');

// =====================================================
// PUBLIC APPROVAL VERIFICATION
// =====================================================
// Mounted at /api/verify with no auth middleware, deliberately: this is reached
// from a printed PDF by a bank, an auditor or a vendor who has no account here.
//
// A code identifies ONE approved expense line — the thing an approver actually
// signs. Claim-level codes are only what earlier printouts carry, and are still
// resolved so that paper already in circulation keeps working.
//
// The response is the smallest thing that answers "is this document genuine?".
// No ids, no sibling lines, no descriptions, no receipts — the code is short
// enough to be guessed at, so a lucky guess must be worth as little as possible.

const isMissingSchema = (error) =>
  error && ['PGRST205', '42P01', '42703'].includes(error.code);

// An unknown code and a real-but-unapproved line answer identically, so the
// endpoint cannot be used to confirm which codes exist.
const invalid = (res) => res.status(404).json({ valid: false });

const migrationRequired = (res) =>
  res.status(503).json({
    message:
      'Expenses are not set up yet. Run backend/database/expenses-migration.sql in Supabase.',
    code: 'EXPENSES_MIGRATION_REQUIRED',
  });

// Must match the reference printed by services/expensePdf.js — the code and the
// paper it came from have to name the same thing. A line from before line_no
// existed has no position to show, so it falls back to the claim's number.
const lineReference = (claimNumber, lineNo) => {
  const base = claimNumber || 'UNNUMBERED';
  return lineNo == null ? base : `${base}-${String(lineNo).padStart(2, '0')}`;
};

// Money arrives from Postgres numeric as a string; adding tax in JS floats can
// leave 118.29000000000002 on an otherwise exact figure.
const withTax = (amount, tax) =>
  Number((Number(amount || 0) + Number(tax || 0)).toFixed(2));

const lookupLine = async (code) => {
  const { data, error } = await supabase
    .from('expense_lines')
    .select(
      'claim_id, line_no, amount, tax_amount, category, expense_date, approval_status, approved_by_name, approved_by_role, approved_at'
    )
    .eq('verify_code', code)
    .maybeSingle();

  // Before the line-approval migration these columns do not exist and the query
  // fails outright. That is not an error worth showing: every code in print at
  // that point is a claim code, so the caller falls through to the claim lookup
  // and the endpoint keeps answering.
  if (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
  return data;
};

router.get(
  '/:code',
  rateLimit({ name: 'verify', windowMs: 60 * 1000, max: 30 }),
  async (req, res) => {
    try {
      const code = String(req.params.code || '').trim();
      if (!code || code.length > 64) return invalid(res);

      const line = await lookupLine(code);

      if (line) {
        if (line.approval_status !== 'Approved') return invalid(res);

        const { data: claim, error } = await supabase
          .from('expense_claims')
          .select('claim_number, claimant_name, team, currency')
          .eq('id', line.claim_id)
          .maybeSingle();

        if (error) {
          if (isMissingSchema(error)) return migrationRequired(res);
          throw error;
        }
        // The line's parent is gone, so there is nothing left to attest to.
        if (!claim) return invalid(res);

        return res.json({
          valid: true,
          reference: lineReference(claim.claim_number, line.line_no),
          claimant_name: claim.claimant_name,
          team: claim.team,
          currency: claim.currency,
          amount: withTax(line.amount, line.tax_amount),
          category: line.category,
          expense_date: line.expense_date,
          approved_by_name: line.approved_by_name,
          approved_by_role: line.approved_by_role,
          approved_at: line.approved_at,
        });
      }

      // Compatibility: codes printed on claim-level PDFs issued before approval
      // moved to the line. Nothing writes these any more.
      const { data, error } = await supabase
        .from('expense_claims')
        .select(
          'claim_number, claimant_name, team, currency, total_amount, status, approved_by_name, approved_by_role, approved_at'
        )
        .eq('verify_code', code)
        .maybeSingle();

      if (error) {
        if (isMissingSchema(error)) return migrationRequired(res);
        throw error;
      }

      if (!data || data.status !== 'Approved') return invalid(res);

      // Field list written out rather than spread: `status` is needed for the
      // check above but is not part of what this endpoint publishes, and a
      // spread would leak whatever columns are added to the table later.
      res.json({
        valid: true,
        reference: data.claim_number,
        claim_number: data.claim_number,
        claimant_name: data.claimant_name,
        team: data.team,
        currency: data.currency,
        total_amount: data.total_amount,
        approved_by_name: data.approved_by_name,
        approved_by_role: data.approved_by_role,
        approved_at: data.approved_at,
      });
    } catch (err) {
      console.error('VERIFY ERROR:', err);
      res.status(500).json({ message: 'Verification failed' });
    }
  }
);

module.exports = router;
