const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');
const { TEAM, isAdmin, isSuperAdmin, getUserTeam, teamFromRole } = require('../utils/roles');
const { expenseCategoriesForTeam, isValidExpenseCategory } = require('../utils/expenseCategories');

router.use(auth);

// =====================================================
// SCHEMA GUARD
// =====================================================
// Migration not run yet → say so instead of a generic 500.
const isMissingSchema = (error) =>
  error && ['PGRST205', '42P01', '42703'].includes(error.code);

const migrationResponse = (res) =>
  res.status(503).json({
    message:
      'Expenses are not set up yet. Run backend/database/expenses-migration.sql in Supabase.',
    code: 'EXPENSES_MIGRATION_REQUIRED',
  });

// =====================================================
// ACCESS
// =====================================================
// A claim belongs to the team it was raised in. Team admins see their own
// team's claims, Super Admins see everything, and everyone else sees only what
// they filed. Mirrors canAccessTicket in routes/tickets.js.
const canAccessClaim = (user, claim) => {
  if (isSuperAdmin(user)) return true;
  if (isAdmin(user)) return claim.team === getUserTeam(user);
  return claim.claimant_id === user.id;
};

// Only the claimant may edit their own draft. An admin can see a claim in order
// to approve it, but editing someone else's claim would let them alter what
// they are about to sign off.
const canEditClaim = (user, claim) => claim.claimant_id === user.id;

// Nothing is editable once it leaves Draft — otherwise the approved record and
// the printed PDF would drift apart.
const isEditable = (claim) => claim.status === 'Draft';

// =====================================================
// HELPERS
// =====================================================
const PAGE_MAX = 100;

const claimTeamFor = (user) => getUserTeam(user) || TEAM.MARKETING;

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};

const fetchLines = async (claimId) => {
  const { data, error } = await supabase
    .from('expense_lines')
    .select('*')
    .eq('claim_id', claimId)
    .order('expense_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw error;
  return data || [];
};

// The client never sets a total. Recompute from the stored lines after every
// mutation so the header can't disagree with what it sums.
const recalcTotal = async (claimId) => {
  const lines = await fetchLines(claimId);
  const total = lines.reduce(
    (sum, l) => sum + Number(l.amount || 0) + Number(l.tax_amount || 0),
    0
  );
  const rounded = Math.round(total * 100) / 100;

  const { error } = await supabase
    .from('expense_claims')
    .update({ total_amount: rounded, updated_at: getISTTime() })
    .eq('id', claimId);
  if (error) throw error;

  return { lines, total: rounded };
};

const appendTimeline = (claim, entry) => {
  const timeline = Array.isArray(claim.timeline) ? claim.timeline : [];
  return [...timeline, { ...entry, created_at: getISTTime() }];
};

// Loads the claim and applies the read check. Returns null after responding.
const loadClaim = async (req, res) => {
  const { data: claim, error } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error && isMissingSchema(error)) {
    migrationResponse(res);
    return null;
  }
  if (!claim) {
    res.status(404).json({ message: 'Claim not found' });
    return null;
  }
  if (!canAccessClaim(req.user, claim)) {
    res.status(403).json({ message: 'Access denied' });
    return null;
  }
  return claim;
};

// Draft-and-owner gate shared by every write path.
const loadEditableClaim = async (req, res) => {
  const claim = await loadClaim(req, res);
  if (!claim) return null;

  if (!canEditClaim(req.user, claim)) {
    res.status(403).json({ message: 'Only the claimant can edit this claim' });
    return null;
  }
  if (!isEditable(claim)) {
    res.status(400).json({ message: `A ${claim.status.toLowerCase()} claim cannot be edited` });
    return null;
  }
  return claim;
};

const validateLine = (body, team) => {
  const { expense_date, category, amount, tax_amount } = body;

  if (!expense_date) return 'Expense date is required';
  if (Number.isNaN(Date.parse(expense_date))) return 'Expense date is not a valid date';
  if (!category) return 'Category is required';
  if (!isValidExpenseCategory(team, category)) {
    return `"${category}" is not a valid category for the ${team} team`;
  }

  const value = money(amount);
  if (!Number.isFinite(value) || value <= 0) return 'Amount must be greater than zero';

  if (tax_amount !== undefined && tax_amount !== null && tax_amount !== '') {
    const tax = money(tax_amount);
    if (!Number.isFinite(tax) || tax < 0) return 'Tax amount cannot be negative';
  }

  return null;
};

// =====================================================
// CATEGORIES
// =====================================================
router.get('/meta/categories', (req, res) => {
  const team = claimTeamFor(req.user);
  res.json({ team, categories: expenseCategoriesForTeam(team) });
});

// =====================================================
// LIST
// =====================================================
router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(PAGE_MAX, Math.max(1, Number(req.query.limit) || 25));
    const from = (page - 1) * limit;

    let query = supabase
      .from('expense_claims')
      .select('*', { count: 'exact' });

    // Scope in the database rather than filtering after the fact — a post-hoc
    // filter would silently lose rows once the table passes the REST row cap.
    if (!isSuperAdmin(req.user)) {
      if (isAdmin(req.user)) query = query.eq('team', getUserTeam(req.user));
      else query = query.eq('claimant_id', req.user.id);
    }

    if (req.query.status) query = query.eq('status', req.query.status);

    const search = (req.query.search || '').trim();
    if (search) {
      // Escape the PostgREST filter separators so a comma or paren in the
      // search box can't inject extra predicates.
      const safe = search.replace(/[,()\\]/g, ' ');
      query = query.or(`title.ilike.%${safe}%,claim_number.ilike.%${safe}%`);
    }

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + limit - 1);

    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }

    res.json({ claims: data || [], total: count ?? (data || []).length, page, limit });
  } catch (err) {
    console.error('EXPENSE LIST ERROR:', err);
    res.status(500).json({ message: 'Failed to fetch expense claims' });
  }
});

// =====================================================
// CREATE
// =====================================================
router.post('/', async (req, res) => {
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.status(400).json({ message: 'Title is required' });

    const { period_from, period_to, currency } = req.body;
    if (period_from && period_to && period_from > period_to) {
      return res.status(400).json({ message: 'Period start cannot be after period end' });
    }

    const now = getISTTime();

    // Team is stamped from the claimant's role at creation and never taken from
    // the client, so a later role change can't move an existing claim between
    // teams' books.
    const insertRow = {
      claimant_id: req.user.id,
      claimant_name: req.user.name,
      team: claimTeamFor(req.user),
      title,
      period_from: period_from || null,
      period_to: period_to || null,
      currency: (currency || 'INR').toUpperCase().slice(0, 3),
      total_amount: 0,
      status: 'Draft',
      created_at: now,
      updated_at: now,
      timeline: [
        {
          type: 'created',
          action: 'Claim created',
          user: req.user.name,
          created_at: now,
        },
      ],
    };

    const { data, error } = await supabase
      .from('expense_claims')
      .insert([insertRow])
      .select()
      .single();

    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }

    res.status(201).json({ ...data, lines: [] });
  } catch (err) {
    console.error('EXPENSE CREATE ERROR:', err);
    res.status(500).json({ message: 'Failed to create expense claim' });
  }
});

// =====================================================
// READ ONE
// =====================================================
router.get('/:id', async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;

    res.json({ ...claim, lines: await fetchLines(claim.id) });
  } catch (err) {
    console.error('EXPENSE READ ERROR:', err);
    res.status(500).json({ message: 'Failed to fetch expense claim' });
  }
});

// =====================================================
// UPDATE HEADER
// =====================================================
router.put('/:id', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    const updateData = { updated_at: getISTTime() };

    if (req.body.title !== undefined) {
      const title = String(req.body.title).trim();
      if (!title) return res.status(400).json({ message: 'Title is required' });
      updateData.title = title;
    }
    if (req.body.period_from !== undefined) updateData.period_from = req.body.period_from || null;
    if (req.body.period_to !== undefined) updateData.period_to = req.body.period_to || null;
    if (req.body.currency !== undefined) {
      updateData.currency = String(req.body.currency || 'INR').toUpperCase().slice(0, 3);
    }

    const periodFrom = updateData.period_from ?? claim.period_from;
    const periodTo = updateData.period_to ?? claim.period_to;
    if (periodFrom && periodTo && periodFrom > periodTo) {
      return res.status(400).json({ message: 'Period start cannot be after period end' });
    }

    const { data, error } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', claim.id)
      .select()
      .single();
    if (error) throw error;

    res.json({ ...data, lines: await fetchLines(claim.id) });
  } catch (err) {
    console.error('EXPENSE UPDATE ERROR:', err);
    res.status(500).json({ message: 'Failed to update expense claim' });
  }
});

// =====================================================
// DELETE
// =====================================================
router.delete('/:id', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    // expense_lines cascades on the foreign key.
    const { error } = await supabase.from('expense_claims').delete().eq('id', claim.id);
    if (error) throw error;

    res.json({ message: 'Claim deleted' });
  } catch (err) {
    console.error('EXPENSE DELETE ERROR:', err);
    res.status(500).json({ message: 'Failed to delete expense claim' });
  }
});

// =====================================================
// LINES
// =====================================================
router.post('/:id/lines', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    // Categories follow the claim's team, not the caller's — they are the same
    // person here, but the claim is the durable reference.
    const problem = validateLine(req.body, claim.team);
    if (problem) return res.status(400).json({ message: problem });

    const { data, error } = await supabase
      .from('expense_lines')
      .insert([
        {
          claim_id: claim.id,
          expense_date: req.body.expense_date,
          category: req.body.category,
          description: (req.body.description || '').trim() || null,
          amount: money(req.body.amount),
          tax_amount: money(req.body.tax_amount) || 0,
          created_at: getISTTime(),
        },
      ])
      .select()
      .single();
    if (error) throw error;

    const { total } = await recalcTotal(claim.id);
    res.status(201).json({ line: data, total_amount: total });
  } catch (err) {
    console.error('EXPENSE LINE CREATE ERROR:', err);
    res.status(500).json({ message: 'Failed to add line item' });
  }
});

router.put('/:id/lines/:lineId', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    const { data: existing } = await supabase
      .from('expense_lines')
      .select('*')
      .eq('id', req.params.lineId)
      .single();

    // Check the parent too — a line id from another claim must not be editable
    // through this claim's URL.
    if (!existing || existing.claim_id !== claim.id) {
      return res.status(404).json({ message: 'Line item not found' });
    }

    const merged = { ...existing, ...req.body };
    const problem = validateLine(merged, claim.team);
    if (problem) return res.status(400).json({ message: problem });

    const { data, error } = await supabase
      .from('expense_lines')
      .update({
        expense_date: merged.expense_date,
        category: merged.category,
        description: (merged.description || '').trim() || null,
        amount: money(merged.amount),
        tax_amount: money(merged.tax_amount) || 0,
      })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;

    const { total } = await recalcTotal(claim.id);
    res.json({ line: data, total_amount: total });
  } catch (err) {
    console.error('EXPENSE LINE UPDATE ERROR:', err);
    res.status(500).json({ message: 'Failed to update line item' });
  }
});

router.delete('/:id/lines/:lineId', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    const { data: existing } = await supabase
      .from('expense_lines')
      .select('id, claim_id')
      .eq('id', req.params.lineId)
      .single();

    if (!existing || existing.claim_id !== claim.id) {
      return res.status(404).json({ message: 'Line item not found' });
    }

    const { error } = await supabase.from('expense_lines').delete().eq('id', existing.id);
    if (error) throw error;

    const { total } = await recalcTotal(claim.id);
    res.json({ message: 'Line item deleted', total_amount: total });
  } catch (err) {
    console.error('EXPENSE LINE DELETE ERROR:', err);
    res.status(500).json({ message: 'Failed to delete line item' });
  }
});

module.exports = router;
