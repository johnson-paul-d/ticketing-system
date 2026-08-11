const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const { rateLimit } = require('../utils/rateLimit');

// =====================================================
// PUBLIC CLAIM VERIFICATION
// =====================================================
// Mounted at /api/verify with no auth middleware, deliberately: this is reached
// from a printed PDF by a bank, an auditor or a vendor who has no account here.
//
// The response is the smallest thing that answers "is this document genuine?".
// No ids, no line items, no descriptions, no receipts — the code is short enough
// to be guessed at, so a lucky guess must be worth as little as possible.

const isMissingSchema = (error) =>
  error && ['PGRST205', '42P01', '42703'].includes(error.code);

// An unknown code and a real-but-unapproved claim answer identically, so the
// endpoint cannot be used to confirm which codes exist.
const invalid = (res) => res.status(404).json({ valid: false });

router.get(
  '/:code',
  rateLimit({ name: 'verify', windowMs: 60 * 1000, max: 30 }),
  async (req, res) => {
    try {
      const code = String(req.params.code || '').trim();
      if (!code || code.length > 64) return invalid(res);

      const { data, error } = await supabase
        .from('expense_claims')
        .select(
          'claim_number, claimant_name, team, currency, total_amount, status, approved_by_name, approved_by_role, approved_at'
        )
        .eq('verify_code', code)
        .maybeSingle();

      if (error) {
        if (isMissingSchema(error)) {
          return res.status(503).json({
            message:
              'Expenses are not set up yet. Run backend/database/expenses-migration.sql in Supabase.',
            code: 'EXPENSES_MIGRATION_REQUIRED',
          });
        }
        throw error;
      }

      if (!data || data.status !== 'Approved') return invalid(res);

      // Field list written out rather than spread: `status` is needed for the
      // check above but is not part of what this endpoint publishes, and a
      // spread would leak whatever columns are added to the table later.
      res.json({
        valid: true,
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
