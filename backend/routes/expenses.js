const express = require('express');
const multer = require('multer');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');
const { TEAM, isAdmin, isSuperAdmin, getUserTeam, teamFromRole } = require('../utils/roles');
const { expenseCategoriesForTeam, isValidExpenseCategory } = require('../utils/expenseCategories');
const { detectFileType, safeFileName, validateFileStructure } = require('../utils/fileType');
const { probePdf } = require('../utils/pdfProbe');
const { isValidDivision } = require('../utils/divisions');
const fileStore = require('../services/fileStore');
const { notifyAdmins, notifyUser } = require('../services/notificationService');
const {
  canApproveClaim,
  approvalRefusalReason,
  lineApprovalHash,
  rollupStatus,
  verifyCodeFrom,
  isLinePaid,
  isLinePayable,
  lineStatus,
} = require('../utils/expenseApproval');

router.use(auth);

// Receipts are photos of bills. The client downsamples before upload, so this
// cap is a backstop against a caller that skips that, not the expected size.
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const MAX_RECEIPTS_PER_LINE = 5;
const MAX_RECEIPTS_PER_CLAIM = 25;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_RECEIPT_BYTES, files: 1 },
});

// =====================================================
// SCHEMA GUARD
// =====================================================
// Migration not run yet → say so instead of a generic 500.
const isMissingSchema = (error) =>
  error && ['PGRST205', '42P01', '42703'].includes(error.code);

// One specific column is missing, as opposed to the whole table. PostgREST
// answers PGRST204 from its schema cache and Postgres 42703 directly, and only
// the latter names the column, so an unnamed PGRST204 is taken at face value.
const isMissingColumn = (error, column) =>
  !!error &&
  (error.code === 'PGRST204' || error.code === '42703') &&
  (!error.message || error.message.includes(column));

const migrationResponse = (res) =>
  res.status(503).json({
    message:
      'Expenses are not set up yet. Run backend/database/expenses-migration.sql in Supabase.',
    code: 'EXPENSES_MIGRATION_REQUIRED',
  });

// =====================================================
// ACCESS
// =====================================================
// A claim belongs to the team it was raised in, and the team shares it: anyone
// on that team can see it, whoever filed it. Super Admins see everything. The
// team boundary is the only wall — an expense is the team's business, but not
// the other team's.
const canAccessClaim = (user, claim) => {
  if (isSuperAdmin(user)) return true;
  return claim.team === getUserTeam(user);
};

// The team also works on it together: anyone on the team can add a line, attach
// a bill and send it for approval, not only whoever opened the claim. What
// nobody can do is change a line after it has been decided — that is enforced
// per line, and it is what keeps a signed document honest.
//
// Note the reimbursement still goes to the claim's claimant, not to whoever
// added the line, so a teammate filing on someone's behalf is filing FOR them.
const canEditClaim = (user, claim) => canAccessClaim(user, claim);

// Deleting is not shared. Removing someone else's claim outright is destructive
// in a way that adding to it is not, so it stays with the person who opened it
// (and an admin over that team).
const canDeleteClaim = (user, claim) =>
  claim.claimant_id === user.id || isSuperAdmin(user) ||
  (isAdmin(user) && claim.team === getUserTeam(user));

// A claim is never closed. Its lines keep arriving — an approved claim can grow
// a new expense the following week — so the freeze is per LINE, not per claim.
//
// Only APPROVAL freezes a line. Its figures are then covered by an approval hash
// and printed on a signed document, so changing them would leave the paper
// attesting to something the record no longer says.
//
// A rejection is not a freeze, it is feedback. The claimant fixes what was wrong
// — often an unreadable bill — and sends the same line back, rather than filing
// a fresh one and losing the thread of what was asked for.
const isLineEditable = (line) => (line.approval_status || 'Pending') !== 'Approved';

const isLineRejected = (line) => line.approval_status === 'Rejected';

// Deleting the whole claim stays a draft-only act: once anything inside it has
// been decided, that decision is part of the audit trail.
const claimIsUndecided = (lines) =>
  lines.every((l) => (l.approval_status || 'Pending') === 'Pending');

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

// Supabase REST caps a response at 1000 rows and reports no error when it
// truncates, so a report built on an unpaged select would quietly under-count.
const PAGE_SIZE = 1000;

const fetchAllPages = async (query, orderColumn) => {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await query
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
  }
};

// PostgREST puts .in() lists in the URL, so claim ids are chunked.
const fetchLinesForClaims = async (claimIds, { from, to } = {}) => {
  const out = [];
  for (let i = 0; i < claimIds.length; i += 200) {
    let q = supabase
      .from('expense_lines')
      .select('*')
      .in('claim_id', claimIds.slice(i, i + 200));
    if (from) q = q.gte('expense_date', from);
    if (to) q = q.lte('expense_date', to);

    const { data, error } = await q.order('expense_date', { ascending: false });
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
};

// =====================================================
// Totals
// =====================================================
// Every bucket carries three figures, because "the total" means two different
// numbers to two different people in the same room:
//
//   net    the bills before tax — what the spend actually was
//   tax    the GST on top
//   gross  net + tax — what was paid out, and what a claimant is owed
//
// `amount` stays as an alias of gross. It is what every existing caller reads,
// and renaming it would have broken the report page and the MCP tools for the
// sake of tidiness.
//
// paid and unpaid are SUBSETS OF approved, not siblings of it. Approved says
// the money is owed; paid says it has gone. Adding paid to approved would
// double-count, and it is unpaid — approved but still owed — that is the
// number worth looking at.
const BUCKETS = ['approved', 'paid', 'unpaid', 'pending', 'rejected', 'all'];

const emptyBucket = () => ({ count: 0, net: 0, tax: 0, gross: 0, amount: 0 });

const emptyTotals = () => Object.fromEntries(BUCKETS.map((b) => [b, emptyBucket()]));

const totalsFor = (rows) => {
  const t = emptyTotals();

  const add = (bucket, r) => {
    const net = Number(r.amount) || 0;
    const tax = Number(r.tax_amount) || 0;
    t[bucket].count += 1;
    t[bucket].net += net;
    t[bucket].tax += tax;
    t[bucket].gross += net + tax;
  };

  for (const r of rows) {
    const bucket = r.approval_status === 'Approved' ? 'approved'
      : r.approval_status === 'Rejected' ? 'rejected' : 'pending';
    add(bucket, r);
    // Only an approved line can be in either payment bucket. A pending or
    // rejected one is in neither — it is not owed, so it cannot be outstanding.
    if (bucket === 'approved') add(isLinePaid(r) ? 'paid' : 'unpaid', r);
    add('all', r);
  }

  const round = (v) => Math.round(v * 100) / 100;
  for (const k of BUCKETS) {
    t[k].net = round(t[k].net);
    t[k].tax = round(t[k].tax);
    t[k].gross = round(t[k].gross);
    t[k].amount = t[k].gross;
  }
  return t;
};

const fetchReceipts = async (claimId) => {
  const { data, error } = await supabase
    .from('expense_receipts')
    .select('*')
    .eq('claim_id', claimId)
    .order('created_at', { ascending: true })
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

// Owner gate shared by every write path. Deliberately says nothing about the
// claim's status: a claim stays open for new lines however its existing ones
// were decided. What is frozen is decided lines, and that is checked per line.
const loadEditableClaim = async (req, res) => {
  const claim = await loadClaim(req, res);
  if (!claim) return null;

  if (!canEditClaim(req.user, claim)) {
    res.status(403).json({ message: 'Only the claimant can change this claim' });
    return null;
  }
  return claim;
};

// Loads a line the claimant may still change, refusing one already decided.
const loadEditableLine = async (req, res, claim) => {
  const { data: line } = await supabase
    .from('expense_lines')
    .select('*')
    .eq('id', req.params.lineId)
    .single();

  // Check the parent too — a line id from another claim must not be reachable
  // through this claim's URL.
  if (!line || line.claim_id !== claim.id) {
    res.status(404).json({ message: 'Line item not found' });
    return null;
  }
  if (!isLineEditable(line)) {
    res.status(400).json({
      message: `That line has been approved and can no longer be changed`,
    });
    return null;
  }
  return line;
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
// REPORT
// =====================================================
// Line-level, because that is where the decisions now live: a claim can be part
// approved, so counting claims would misstate what was actually authorised.
// Scoped exactly like the list — a member sees only their own.
router.get('/report', async (req, res) => {
  try {
    const from = (req.query.from || '').trim() || null;
    const to = (req.query.to || '').trim() || null;

    // The team shares its expenses, so the only scope is the team itself.
    let claimQuery = supabase.from('expense_claims').select('*');
    if (!isSuperAdmin(req.user)) {
      claimQuery = claimQuery.eq('team', getUserTeam(req.user));
    }

    const claims = await fetchAllPages(claimQuery, 'id');

    if (!claims.length) {
      return res.json({ claims: [], lines: [], totals: emptyTotals() });
    }

    const byId = new Map(claims.map((c) => [c.id, c]));
    const lines = await fetchLinesForClaims([...byId.keys()], { from, to });

    // Flattened into what a report actually reads: the line, plus who claimed it.
    const rows = lines.map((l) => {
      const claim = byId.get(l.claim_id) || {};
      return {
        line_id: l.id,
        claim_id: l.claim_id,
        claim_number: claim.claim_number || null,
        line_no: l.line_no,
        title: claim.title || null,
        claimant_name: claim.claimant_name || null,
        team: claim.team || null,
        division: claim.division || null,
        currency: claim.currency || 'INR',
        expense_date: l.expense_date,
        category: l.category,
        description: l.description,
        amount: Number(l.amount || 0),
        tax_amount: Number(l.tax_amount || 0),
        total: Number(l.amount || 0) + Number(l.tax_amount || 0),
        approval_status: l.approval_status || 'Pending',
        // The label, with payment taking precedence over approval because it is
        // the later fact. approval_status is kept beside it so a report can
        // still ask "was this ever approved" of a paid line.
        status: lineStatus(l),
        paid: isLinePaid(l),
        paid_at: l.paid_at || null,
        paid_by_name: l.paid_by_name || null,
        approved_by_name: l.approved_by_name,
        approved_at: l.approved_at,
        rejection_reason: l.rejection_reason,
      };
    });

    res.json({ lines: rows, totals: totalsFor(rows) });
  } catch (err) {
    if (isMissingSchema(err)) return migrationResponse(res);
    console.error('EXPENSE REPORT ERROR:', err);
    res.status(500).json({ message: 'Failed to build expense report' });
  }
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
    // The team shares its expenses, so the team is the whole scope.
    if (!isSuperAdmin(req.user)) {
      query = query.eq('team', getUserTeam(req.user));
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

    const { currency, division } = req.body;
    if (!isValidDivision(division)) {
      return res.status(400).json({ message: `"${division}" is not a valid division` });
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
      division: division || null,
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

    let { data, error } = await supabase
      .from('expense_claims')
      .insert([insertRow])
      .select()
      .single();

    // expenses-division-migration.sql may not have run yet. Retry without the
    // column rather than refusing to create the claim: a division is useful,
    // but not worth blocking every claim until someone runs some SQL.
    if (error && isMissingColumn(error, 'division')) {
      const { division: _dropped, ...withoutDivision } = insertRow;
      ({ data, error } = await supabase
        .from('expense_claims')
        .insert([withoutDivision])
        .select()
        .single());
    }

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

    const lines = await fetchLines(claim.id);
    const receipts = await fetchReceipts(claim.id);
    const owned = canEditClaim(req.user, claim);
    // Whoever may decide a line may also record that it was paid — the same
    // finance role, and there is nobody else it could belong to.
    const decider = claim.status !== 'Draft' && canApproveClaim(req.user, claim);
    const withReceipt = new Set(receipts.map((r) => r.line_id).filter(Boolean));

    res.json({
      ...claim,
      // Each line answers for itself, since a claim now holds a mixture: an
      // approved line is frozen while the one added beside it yesterday is not.
      lines: lines.map((l) => ({
        ...l,
        // The label to show. approval_status is still there underneath — this
        // does not replace it, it says which of the two facts is the later one.
        status: lineStatus(l),
        paid: isLinePaid(l),
        can_edit: owned && isLineEditable(l),
        has_receipt: withReceipt.has(l.id),
        // A rejected line goes back for approval once it has been fixed and
        // still carries a bill.
        can_resubmit: owned && isLineRejected(l) && withReceipt.has(l.id),
        can_pay: decider && isLinePayable(l),
        can_unpay: decider && isLinePaid(l),
        // Approval can be taken back while the money has not gone out, so a
        // wrong figure (a mistyped tax amount, say) can be corrected and the
        // line approved again. Once paid, the payment has to be undone first.
        can_unapprove: decider && l.approval_status === 'Approved' && !isLinePaid(l),
      })),
      receipts,
      // Anyone on the team may add another expense — a claim is never closed,
      // and the team works on it together.
      can_add_lines: owned,
      // Kept for the header fields (title, currency); the currency itself is
      // refused separately once a line has been decided.
      can_edit: owned,
      // Deleting is narrower than editing: the person who opened the claim, or
      // an admin over the team.
      can_delete: canDeleteClaim(req.user, claim) && claimIsUndecided(lines),
      // Whether this viewer may decide lines at all. Which lines are still open
      // is answered per line by its own approval_status.
      can_approve: decider,
      // How many lines a single "approve everything" would actually take.
      approvable_count: lines.filter(
        (l) => isLineEditable(l) && withReceipt.has(l.id)
      ).length,
      // And how many a single "mark paid" would settle: approved, still owed.
      payable_count: lines.filter(isLinePayable).length,
    });
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
    if (req.body.division !== undefined) {
      if (!isValidDivision(req.body.division)) {
        return res.status(400).json({ message: `"${req.body.division}" is not a valid division` });
      }
      updateData.division = req.body.division || null;
    }

    if (req.body.currency !== undefined) {
      const currency = String(req.body.currency || 'INR').toUpperCase().slice(0, 3);
      // The currency is part of what each approval was computed over, so once a
      // line has been approved it cannot move without invalidating that line's
      // hash and the document already printed from it.
      if (currency !== claim.currency) {
        const decided = (await fetchLines(claim.id)).some((l) => !isLineEditable(l));
        if (decided) {
          return res.status(400).json({
            message: 'The currency cannot change once a line on this claim has been decided',
          });
        }
      }
      updateData.currency = currency;
    }

    let { data, error } = await supabase
      .from('expense_claims')
      .update(updateData)
      .eq('id', claim.id)
      .select()
      .single();

    // Same fallback as the create path, for the window before the division
    // migration runs.
    if (error && isMissingColumn(error, 'division')) {
      const { division: _dropped, ...withoutDivision } = updateData;
      ({ data, error } = await supabase
        .from('expense_claims')
        .update(withoutDivision)
        .eq('id', claim.id)
        .select()
        .single());
    }

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

    // Narrower than editing: a teammate may add to a claim but not remove it.
    if (!canDeleteClaim(req.user, claim)) {
      return res.status(403).json({
        message: 'Only the person who raised this claim, or an admin, can delete it',
      });
    }

    // A decision is part of the audit trail, so a claim stops being deletable
    // the moment anything inside it has been approved or rejected.
    if (!claimIsUndecided(await fetchLines(claim.id))) {
      return res.status(400).json({
        message: 'This claim has decided lines and can no longer be deleted',
      });
    }

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

    const existing = await fetchLines(claim.id);

    // A line added after the claim was submitted is numbered straight away, and
    // always appended. Renumbering to keep date order would move a reference
    // already printed on somebody's signed document.
    const alreadySubmitted = claim.status !== 'Draft';
    const nextNo = existing.reduce((max, l) => Math.max(max, l.line_no || 0), 0) + 1;

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
          approval_status: 'Pending',
          line_no: alreadySubmitted ? nextNo : null,
          created_at: getISTTime(),
        },
      ])
      .select()
      .single();
    if (error) throw error;

    const { total, lines } = await recalcTotal(claim.id);

    // A new line reopens the claim: it was Approved, now something is pending
    // again. Told to the approvers too, since nothing else would surface it.
    let updatedClaim = null;
    if (alreadySubmitted) {
      updatedClaim = await syncClaimStatus(claim, lines, req.user.name, null);
      await notifyAdmins(
        'Expense Line Added',
        `${req.user.name} added ${data.category} (${claim.currency} ${Number(data.amount).toFixed(2)}) to "${claim.title}"`,
        null,
        claim.team
      );
    }

    res.status(201).json({ line: data, total_amount: total, claim: updatedClaim });
  } catch (err) {
    console.error('EXPENSE LINE CREATE ERROR:', err);
    res.status(500).json({ message: 'Failed to add line item' });
  }
});

router.put('/:id/lines/:lineId', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    const existing = await loadEditableLine(req, res, claim);
    if (!existing) return;

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

    const existing = await loadEditableLine(req, res, claim);
    if (!existing) return;

    const { error } = await supabase.from('expense_lines').delete().eq('id', existing.id);
    if (error) throw error;

    const { total } = await recalcTotal(claim.id);
    res.json({ message: 'Line item deleted', total_amount: total });
  } catch (err) {
    console.error('EXPENSE LINE DELETE ERROR:', err);
    res.status(500).json({ message: 'Failed to delete line item' });
  }
});

// =====================================================
// RECEIPTS
// =====================================================
router.post('/:id/receipts', upload.single('file'), async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    if (!req.file?.buffer?.length) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const type = detectFileType(req.file.buffer);
    if (!type) {
      return res.status(400).json({
        message: 'Only JPEG, PNG or PDF receipts are accepted',
      });
    }

    // Reject a structurally broken image here, where the claimant can simply
    // retake the photo. Storing one would defer the failure to PDF generation,
    // and a truncated image stalls the decoder synchronously — taking the whole
    // process with it.
    const defect = validateFileStructure(req.file.buffer, type.ext);
    if (defect) {
      return res.status(400).json({
        message: `That file looks incomplete — ${defect}. Try uploading it again.`,
      });
    }

    // A PDF bill is copied page-for-page into the printed claim, so it has to be
    // readable now. Caught later it becomes a blank page in an approved
    // document, long after the claimant still has the bill.
    if (type.ext === 'pdf') {
      const pdfDefect = await probePdf(req.file.buffer);
      if (pdfDefect) {
        return res.status(400).json({
          message:
            `That PDF cannot be attached because ${pdfDefect}. ` +
            'Print it to a new PDF without protection, or photograph the bill instead.',
        });
      }
    }

    // A receipt may hang off a specific line, or off the claim while the
    // claimant is still deciding. Submit only counts the line-attached ones.
    let lineId = req.body.line_id || null;
    if (lineId) {
      const { data: line } = await supabase
        .from('expense_lines')
        .select('id, claim_id, approval_status')
        .eq('id', lineId)
        .single();
      // The bills behind a decided line are covered by its approval hash, so
      // adding one afterwards would leave the signed document short of a page
      // it claims to account for.
      if (line && line.claim_id === claim.id && !isLineEditable(line)) {
        return res.status(400).json({
          message: `That line has been approved; its receipts cannot change`,
        });
      }
      if (!line || line.claim_id !== claim.id) {
        return res.status(400).json({ message: 'That line item does not belong to this claim' });
      }
    }

    const existing = await fetchReceipts(claim.id);
    if (existing.length >= MAX_RECEIPTS_PER_CLAIM) {
      return res.status(400).json({
        message: `A claim can hold at most ${MAX_RECEIPTS_PER_CLAIM} receipts`,
      });
    }
    if (lineId && existing.filter((r) => r.line_id === lineId).length >= MAX_RECEIPTS_PER_LINE) {
      return res.status(400).json({
        message: `A line item can hold at most ${MAX_RECEIPTS_PER_LINE} receipts`,
      });
    }

    const stored = await fileStore.put(req.file.buffer, {
      fileName: safeFileName(req.file.originalname, `receipt.${type.ext}`),
      mimeType: type.mime,
      folderPath: `claims/${claim.id}`,
    });

    // The same bill appearing on two claims is worth surfacing, not blocking:
    // a shared invoice can legitimately be split across claimants.
    const { data: dupes } = await supabase
      .from('expense_receipts')
      .select('id, claim_id')
      .eq('file_sha256', stored.sha256)
      .neq('claim_id', claim.id);

    const { data, error } = await supabase
      .from('expense_receipts')
      .insert([
        {
          claim_id: claim.id,
          line_id: lineId,
          storage_path: stored.id,
          file_name: safeFileName(req.file.originalname, `receipt.${type.ext}`),
          mime_type: type.mime,
          byte_size: stored.byteSize,
          file_sha256: stored.sha256,
          uploaded_by: req.user.id,
          created_at: getISTTime(),
        },
      ])
      .select()
      .single();

    if (error) {
      // Don't leave the uploaded blob orphaned in Drive if the row failed.
      await fileStore.remove(stored.id).catch(() => {});
      throw error;
    }

    res.status(201).json({
      receipt: data,
      duplicate_of: dupes?.length ? dupes.map((d) => d.claim_id) : null,
    });
  } catch (err) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: 'Receipt must be 5 MB or smaller' });
    }
    console.error('RECEIPT UPLOAD ERROR:', err);
    res.status(500).json({ message: 'Failed to upload receipt' });
  }
});

// Streamed through the API rather than linked directly: Drive has no
// signed-URL equivalent, and proxying means every view passes canAccessClaim.
router.get('/:id/receipts/:receiptId', async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;

    const { data: receipt } = await supabase
      .from('expense_receipts')
      .select('*')
      .eq('id', req.params.receiptId)
      .single();

    if (!receipt || receipt.claim_id !== claim.id) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    const file = await fileStore.get(receipt.storage_path);
    res.setHeader('Content-Type', receipt.mime_type || file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${safeFileName(receipt.file_name)}"`);
    // A receipt is somebody's personal data; keep it out of shared caches.
    res.setHeader('Cache-Control', 'private, max-age=300');

    file.stream.on('error', (err) => {
      console.error('RECEIPT STREAM ERROR:', err);
      if (!res.headersSent) res.status(502).json({ message: 'Failed to read receipt' });
      else res.destroy();
    });
    file.stream.pipe(res);
  } catch (err) {
    console.error('RECEIPT READ ERROR:', err);
    if (!res.headersSent) res.status(500).json({ message: 'Failed to fetch receipt' });
  }
});

router.delete('/:id/receipts/:receiptId', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    const { data: receipt } = await supabase
      .from('expense_receipts')
      .select('*')
      .eq('id', req.params.receiptId)
      .single();

    if (!receipt || receipt.claim_id !== claim.id) {
      return res.status(404).json({ message: 'Receipt not found' });
    }

    // Same rule as adding one: a decided line's bills are part of what was
    // signed and printed, so they stop moving with it.
    if (receipt.line_id) {
      const { data: line } = await supabase
        .from('expense_lines')
        .select('approval_status')
        .eq('id', receipt.line_id)
        .single();
      if (line && !isLineEditable(line)) {
        return res.status(400).json({
          message: `That line has been approved; its receipts cannot change`,
        });
      }
    }

    const { error } = await supabase.from('expense_receipts').delete().eq('id', receipt.id);
    if (error) throw error;

    // Row first, blob second: an orphaned Drive file is recoverable waste, a
    // row pointing at a deleted file is a broken claim.
    await fileStore.remove(receipt.storage_path).catch((e) =>
      console.error('Receipt blob delete failed (row already removed):', e.message)
    );

    res.json({ message: 'Receipt deleted' });
  } catch (err) {
    console.error('RECEIPT DELETE ERROR:', err);
    res.status(500).json({ message: 'Failed to delete receipt' });
  }
});

// =====================================================
// SUBMIT
// =====================================================
router.post('/:id/submit', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    // Submit is only the first hand-off. Lines added afterwards go straight to
    // the approvers as Pending, so there is nothing to submit a second time.
    if (claim.status !== 'Draft') {
      return res.status(400).json({
        message: 'This claim has already been submitted. New lines go to the approvers automatically.',
      });
    }

    const lines = await fetchLines(claim.id);
    if (!lines.length) {
      return res.status(400).json({ message: 'Add at least one line item before submitting' });
    }

    // The receipt gate. Enforced here rather than as a table constraint because
    // it only applies at this transition — a draft is allowed to be incomplete.
    const receipts = await fetchReceipts(claim.id);
    const withReceipt = new Set(receipts.map((r) => r.line_id).filter(Boolean));
    const missing = lines.filter((l) => !withReceipt.has(l.id));

    if (missing.length) {
      const one = missing.length === 1;
      return res.status(400).json({
        message: `${missing.length} line item${one ? '' : 's'} still ${one ? 'needs' : 'need'} a receipt`,
        missing_line_ids: missing.map((l) => l.id),
      });
    }

    const now = getISTTime();

    // Number the lines now. They freeze at submit, so a position taken here is
    // stable, and it is what each line's printed reference (EXP-2026-0042-02)
    // is built from.
    for (let i = 0; i < lines.length; i += 1) {
      const { error: numberError } = await supabase
        .from('expense_lines')
        .update({ line_no: i + 1 })
        .eq('id', lines[i].id);
      if (numberError) throw numberError;
    }

    const { data, error } = await supabase
      .from('expense_claims')
      .update({
        status: 'Submitted',
        submitted_at: now,
        updated_at: now,
        timeline: appendTimeline(claim, {
          type: 'submitted',
          action: `Submitted for approval — ${claim.currency} ${Number(claim.total_amount).toFixed(2)}`,
          user: req.user.name,
        }),
      })
      .eq('id', claim.id)
      .eq('status', 'Draft')
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(409).json({ message: 'Claim is no longer a draft' });

    await notifyAdmins(
      'Expense Claim Submitted',
      `${req.user.name} submitted "${claim.title}" for ${claim.currency} ${Number(claim.total_amount).toFixed(2)}`,
      null,
      claim.team
    );

    res.json({ ...data, lines, receipts });
  } catch (err) {
    console.error('EXPENSE SUBMIT ERROR:', err);
    res.status(500).json({ message: 'Failed to submit claim' });
  }
});

// =====================================================
// LINE APPROVAL
// =====================================================
// Approval belongs to the individual line, not the claim. An approver signs off
// each expense separately, and each approved line yields its own document
// carrying that line and its own bill. The claim's status is a rollup of what
// its lines decided, never a decision in its own right.

const nextClaimNumber = async () => {
  const year = new Date().getFullYear();
  const prefix = `EXP-${year}-`;

  const { data } = await supabase
    .from('expense_claims')
    .select('claim_number')
    .like('claim_number', `${prefix}%`)
    .order('claim_number', { ascending: false })
    .limit(1);

  const last = data?.[0]?.claim_number;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// Recomputes the claim's status from its lines and writes it back.
const syncClaimStatus = async (claim, lines, actorName, note) => {
  const status = rollupStatus(lines);
  const update = { status, updated_at: getISTTime() };

  if (note) {
    update.timeline = appendTimeline(claim, { type: 'decision', action: note, user: actorName });
  }

  const { data, error } = await supabase
    .from('expense_claims')
    .update(update)
    .eq('id', claim.id)
    .select()
    .single();
  if (error) throw error;
  return data;
};

// Shared preamble for a decision on one line.
const loadDecidableLine = async (req, res) => {
  const claim = await loadClaim(req, res);
  if (!claim) return null;

  if (!canApproveClaim(req.user, claim)) {
    res.status(403).json({ message: approvalRefusalReason(req.user, claim) });
    return null;
  }

  const { data: line } = await supabase
    .from('expense_lines')
    .select('*')
    .eq('id', req.params.lineId)
    .single();

  // Check the parent as well — a line id from another claim must not be
  // decidable through this claim's URL.
  if (!line || line.claim_id !== claim.id) {
    res.status(404).json({ message: 'Line item not found' });
    return null;
  }

  if (claim.status === 'Draft') {
    res.status(400).json({ message: 'This claim has not been submitted yet' });
    return null;
  }
  if (line.approval_status !== 'Pending') {
    res.status(400).json({
      message: `That line was already ${line.approval_status.toLowerCase()}`,
    });
    return null;
  }

  return { claim, line };
};

// Approves ONE line. Both the single-line endpoint and "approve everything"
// go through here, so the two can never drift into deciding lines differently:
// each approved line gets its own hash over its own receipts and its own
// verification code, whether it was approved alone or alongside ten others.
//
// Returns { line } on success, or { skipped: reason } when the line cannot be
// approved. Throws only on a genuine failure.
const approveOneLine = async (claim, line, approver, receiptsByLine) => {
  const lineReceipts = receiptsByLine.get(line.id) || [];

  // No bill, no approval. Submit checks this for the lines present at the
  // time, but a line added to an already-submitted claim never passes through
  // that gate — this is the one place every line must go through.
  if (!lineReceipts.length) return { skipped: 'no receipt attached' };
  if (line.approval_status !== 'Pending') {
    return { skipped: `already ${line.approval_status.toLowerCase()}` };
  }

  const now = getISTTime();
  const hash = lineApprovalHash(claim, line, lineReceipts, approver, now);

  let verifyCode = verifyCodeFrom(hash);
  let withDesignation = hasDesignation;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const patch = {
      approval_status: 'Approved',
      approved_by: approver.id,
      approved_by_name: approver.name,
      approved_by_role: approver.role,
      approved_at: now,
      approval_hash: hash,
      verify_code: verifyCode,
      rejection_reason: null,
    };
    // Frozen at approval, like the role: a later promotion must not rewrite
    // what an already-printed document says the signer was.
    if (withDesignation) patch.approved_by_designation = approver.designation || null;

    const result = await supabase
      .from('expense_lines')
      .update(patch)
      .eq('id', line.id)
      .eq('approval_status', 'Pending')
      .select()
      .single();

    if (!result.error) return { line: result.data };

    // designation-migration.sql may not have run. Drop the column and retry
    // rather than refusing the approval — a missing job title on the document
    // is a smaller problem than an expense nobody can approve.
    if (withDesignation && isMissingColumn(result.error, 'approved_by_designation')) {
      withDesignation = false;
      hasDesignation = false; // spare every later approval the same wasted round-trip
      continue;
    }
    // 23505 = unique violation on verify_code.
    if (result.error.code !== '23505') throw result.error;
    verifyCode = verifyCodeFrom(hash + attempt);
  }
  return { skipped: 'could not allocate a verification code' };
};

// The claim number is only minted once a claim has its first decision, so an
// abandoned draft never consumes one.
const ensureClaimNumber = async (claim) => {
  if (claim.claim_number) return claim.claim_number;
  const claimNumber = await nextClaimNumber();
  await supabase
    .from('expense_claims')
    .update({ claim_number: claimNumber })
    .eq('id', claim.id)
    .is('claim_number', null);
  return claimNumber;
};

// The approver's signature is the point of the exercise — refuse rather than
// produce a document with an empty stamp where one is supposed to be.
// designation arrives with designation-migration.sql. Naming a column that is
// not there yet fails the whole query, and a null approver here reads as "no
// signature" — which would refuse every approval in the system. So it is asked
// for once and dropped for good on the first miss.
let hasDesignation = true;
const loadApprover = async (userId) => {
  const run = () =>
    supabase
      .from('users')
      .select(`id, name, role, ${hasDesignation ? 'designation, ' : ''}signature_path`)
      .eq('id', userId)
      .single();

  let { data, error } = await run();
  if (hasDesignation && isMissingColumn(error, 'designation')) {
    hasDesignation = false;
    ({ data, error } = await run());
  }
  return data;
};

router.post('/:id/lines/:lineId/approve', async (req, res) => {
  try {
    const loaded = await loadDecidableLine(req, res);
    if (!loaded) return;
    const { claim, line } = loaded;

    const approver = await loadApprover(req.user.id);
    if (!approver?.signature_path) {
      return res.status(400).json({
        message: 'Upload your signature before approving expenses',
        code: 'SIGNATURE_REQUIRED',
      });
    }

    const allReceipts = await fetchReceipts(claim.id);
    const receiptsByLine = new Map();
    for (const r of allReceipts) {
      if (!r.line_id) continue;
      if (!receiptsByLine.has(r.line_id)) receiptsByLine.set(r.line_id, []);
      receiptsByLine.get(r.line_id).push(r);
    }

    await ensureClaimNumber(claim);
    const outcome = await approveOneLine(claim, line, approver, receiptsByLine);

    if (outcome.skipped) {
      const receiptGap = outcome.skipped === 'no receipt attached';
      return res.status(receiptGap ? 400 : 409).json({
        message: receiptGap
          ? 'That line has no receipt attached, so it cannot be approved'
          : `That line was ${outcome.skipped}`,
        ...(receiptGap ? { code: 'RECEIPT_REQUIRED' } : {}),
      });
    }

    const updatedLine = outcome.line;
    const lines = await fetchLines(claim.id);
    const updatedClaim = await syncClaimStatus(
      claim,
      lines,
      approver.name,
      `Approved line ${line.line_no ?? ''} — ${line.category} ${claim.currency} ${Number(line.amount).toFixed(2)}`.replace(/\s+/g, ' ')
    );

    await notifyUser(
      claim.claimant_name,
      'Expense Line Approved',
      `${approver.name} approved ${line.category} (${claim.currency} ${Number(line.amount).toFixed(2)}) on "${claim.title}"`,
      null
    );

    res.json({ line: updatedLine, claim: updatedClaim });
  } catch (err) {
    console.error('EXPENSE LINE APPROVE ERROR:', err);
    res.status(500).json({ message: 'Failed to approve line item' });
  }
});

// =====================================================
// APPROVE EVERYTHING STILL PENDING
// =====================================================
// A convenience over the per-line decision, not a different kind of approval:
// every line still gets its own hash, its own verification code and its own
// signed document. Nothing is approved here that could not be approved singly.
router.post('/:id/approve-all', async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;

    if (!canApproveClaim(req.user, claim)) {
      return res.status(403).json({ message: approvalRefusalReason(req.user, claim) });
    }
    if (claim.status === 'Draft') {
      return res.status(400).json({ message: 'This claim has not been submitted yet' });
    }

    const approver = await loadApprover(req.user.id);
    if (!approver?.signature_path) {
      return res.status(400).json({
        message: 'Upload your signature before approving expenses',
        code: 'SIGNATURE_REQUIRED',
      });
    }

    const pending = (await fetchLines(claim.id)).filter((l) => l.approval_status === 'Pending');
    if (!pending.length) {
      return res.status(400).json({ message: 'There is nothing left to approve on this claim' });
    }

    const allReceipts = await fetchReceipts(claim.id);
    const receiptsByLine = new Map();
    for (const r of allReceipts) {
      if (!r.line_id) continue;
      if (!receiptsByLine.has(r.line_id)) receiptsByLine.set(r.line_id, []);
      receiptsByLine.get(r.line_id).push(r);
    }

    await ensureClaimNumber(claim);

    // A line with no bill is skipped rather than failing the batch. Refusing
    // everything because one line is short a receipt would be worse: the
    // approver would have no way to make progress and no idea which line.
    const approved = [];
    const skipped = [];
    for (const line of pending) {
      const outcome = await approveOneLine(claim, line, approver, receiptsByLine);
      if (outcome.line) approved.push(outcome.line);
      else skipped.push({ line_id: line.id, line_no: line.line_no, reason: outcome.skipped });
    }

    const lines = await fetchLines(claim.id);
    const updatedClaim = await syncClaimStatus(
      claim,
      lines,
      approver.name,
      `Approved ${approved.length} line${approved.length === 1 ? '' : 's'} in one action`
    );

    if (approved.length) {
      const total = approved.reduce(
        (sum, l) => sum + Number(l.amount || 0) + Number(l.tax_amount || 0),
        0
      );
      await notifyUser(
        claim.claimant_name,
        'Expense Lines Approved',
        `${approver.name} approved ${approved.length} line${approved.length === 1 ? '' : 's'} ` +
          `on "${claim.title}" — ${claim.currency} ${total.toFixed(2)}`,
        null
      );
    }

    res.json({
      approved_count: approved.length,
      skipped,
      lines,
      claim: updatedClaim,
    });
  } catch (err) {
    console.error('EXPENSE APPROVE ALL ERROR:', err);
    res.status(500).json({ message: 'Failed to approve the claim' });
  }
});

// =====================================================
// SEND A REJECTED LINE BACK FOR APPROVAL
// =====================================================
// The rework loop. A rejection is feedback, not a verdict on the expense, so
// the claimant fixes what was wrong and returns the SAME line — the reason and
// the correction stay on one thread instead of being scattered across a fresh
// line nobody can connect to the original.
router.post('/:id/lines/:lineId/resubmit', async (req, res) => {
  try {
    const claim = await loadEditableClaim(req, res);
    if (!claim) return;

    const { data: line } = await supabase
      .from('expense_lines')
      .select('*')
      .eq('id', req.params.lineId)
      .single();

    if (!line || line.claim_id !== claim.id) {
      return res.status(404).json({ message: 'Line item not found' });
    }
    if (!isLineRejected(line)) {
      return res.status(400).json({
        message:
          line.approval_status === 'Approved'
            ? 'That line is already approved'
            : 'That line is already waiting for approval',
      });
    }

    // The same gate every line meets before an approver sees it.
    const receipts = (await fetchReceipts(claim.id)).filter((r) => r.line_id === line.id);
    if (!receipts.length) {
      return res.status(400).json({
        message: 'Attach a receipt before sending this line back for approval',
        code: 'RECEIPT_REQUIRED',
      });
    }

    const { data: updatedLine, error } = await supabase
      .from('expense_lines')
      .update({
        approval_status: 'Pending',
        // The reason has served its purpose and is preserved in the claim
        // timeline; leaving it on the line would show a rejection notice above
        // a line that is now waiting on a fresh decision.
        rejection_reason: null,
        approved_by: null,
        approved_by_name: null,
        approved_by_role: null,
        approved_at: null,
        approval_hash: null,
        verify_code: null,
      })
      .eq('id', line.id)
      .eq('approval_status', 'Rejected')
      .select()
      .single();

    if (error) throw error;
    if (!updatedLine) {
      return res.status(409).json({ message: 'That line changed while you were working on it' });
    }

    const lines = await fetchLines(claim.id);
    const updatedClaim = await syncClaimStatus(
      claim,
      lines,
      req.user.name,
      `Line ${line.line_no ?? ''} reworked and sent back for approval`.replace(/\s+/g, ' ')
    );

    await notifyAdmins(
      'Expense Line Resubmitted',
      `${req.user.name} reworked ${line.category} (${claim.currency} ${Number(updatedLine.amount).toFixed(2)}) ` +
        `on "${claim.title}" and sent it back for approval`,
      null,
      claim.team
    );

    res.json({ line: updatedLine, claim: updatedClaim });
  } catch (err) {
    console.error('EXPENSE LINE RESUBMIT ERROR:', err);
    res.status(500).json({ message: 'Failed to resubmit line item' });
  }
});

// =====================================================
// REVERSE AN APPROVAL
// =====================================================
// An approver's own undo. Approval freezes a line, and the only route around a
// figure approved in error used to be deleting the line and re-raising it,
// which threw away its receipts and its place in the numbering. Reversing puts
// the line back to Pending so the claimant can correct it and it can be
// approved afresh.
//
// The approval record is cleared rather than kept: the hash and verification
// code attested to figures that are about to change, so a printout carrying
// that code must stop verifying from this moment. The event itself is kept in
// the claim timeline, with who reversed it and why.
//
// A paid line cannot be reversed. Payment says the money went out against the
// approved figure; undo the payment first so the two facts stay in order.
router.post('/:id/lines/:lineId/unapprove', async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;

    if (!canApproveClaim(req.user, claim)) {
      return res.status(403).json({ message: approvalRefusalReason(req.user, claim) });
    }

    const { data: line } = await supabase
      .from('expense_lines')
      .select('*')
      .eq('id', req.params.lineId)
      .single();

    if (!line || line.claim_id !== claim.id) {
      return res.status(404).json({ message: 'Line item not found' });
    }
    if (line.approval_status !== 'Approved') {
      return res.status(400).json({
        message: `That line is ${(line.approval_status || 'Pending').toLowerCase()}, so there is no approval to reverse`,
      });
    }
    if (isLinePaid(line)) {
      return res.status(400).json({
        message: 'That line has been marked paid. Undo the payment before reversing the approval.',
        code: 'PAID_LINE',
      });
    }

    const reason = String(req.body?.reason || '').trim();

    const basePatch = {
      approval_status: 'Pending',
      approved_by: null,
      approved_by_name: null,
      approved_by_role: null,
      approved_at: null,
      approval_hash: null,
      verify_code: null,
      rejection_reason: null,
    };

    // approved_by_designation arrives with designation-migration.sql; cleared
    // when present, skipped when the column is not there yet.
    let updatedLine = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const withDesignation = hasDesignation && attempt === 0;
      const result = await supabase
        .from('expense_lines')
        .update(withDesignation ? { ...basePatch, approved_by_designation: null } : basePatch)
        .eq('id', line.id)
        .eq('approval_status', 'Approved')
        .select()
        .single();

      if (!result.error) {
        updatedLine = result.data;
        break;
      }
      if (withDesignation && isMissingColumn(result.error, 'approved_by_designation')) {
        hasDesignation = false;
        continue;
      }
      throw result.error;
    }

    if (!updatedLine) {
      return res.status(409).json({ message: 'That line changed while you were working on it' });
    }

    const lines = await fetchLines(claim.id);
    const updatedClaim = await syncClaimStatus(
      claim,
      lines,
      req.user.name,
      `Approval reversed on line ${line.line_no ?? ''} — ${line.category} ${claim.currency} ${Number(line.amount).toFixed(2)}${reason ? ` (${reason})` : ''}`.replace(/\s+/g, ' ')
    );

    await notifyUser(
      claim.claimant_name,
      'Expense Approval Reversed',
      `${req.user.name} reversed the approval of ${line.category} (${claim.currency} ${Number(line.amount).toFixed(2)}) on "${claim.title}"${reason ? `: ${reason}` : ''}. The line can be corrected and approved again.`,
      null
    );

    res.json({ line: { ...updatedLine, status: lineStatus(updatedLine) }, claim: updatedClaim });
  } catch (err) {
    console.error('EXPENSE LINE UNAPPROVE ERROR:', err);
    res.status(500).json({ message: 'Failed to reverse the approval' });
  }
});

router.post('/:id/lines/:lineId/reject', async (req, res) => {
  try {
    const loaded = await loadDecidableLine(req, res);
    if (!loaded) return;
    const { claim, line } = loaded;

    const reason = (req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ message: 'A reason is required so the claimant knows why' });
    }

    const { data: updatedLine, error } = await supabase
      .from('expense_lines')
      .update({
        approval_status: 'Rejected',
        rejection_reason: reason,
        approved_by: req.user.id,
        approved_by_name: req.user.name,
        approved_by_role: req.user.role,
        approved_at: getISTTime(),
        // A rejected line has nothing to verify, so it carries no code.
        approval_hash: null,
        verify_code: null,
      })
      .eq('id', line.id)
      .eq('approval_status', 'Pending')
      .select()
      .single();

    if (error) throw error;
    if (!updatedLine) {
      return res.status(409).json({ message: 'That line was decided by someone else' });
    }

    const lines = await fetchLines(claim.id);
    const updatedClaim = await syncClaimStatus(
      claim,
      lines,
      req.user.name,
      `Rejected line ${line.line_no ?? ''} — ${reason}`.replace(/\s+/g, ' ')
    );

    await notifyUser(
      claim.claimant_name,
      'Expense Line Rejected',
      `${req.user.name} rejected ${line.category} on "${claim.title}": ${reason}`,
      null
    );

    res.json({ line: updatedLine, claim: updatedClaim });
  } catch (err) {
    console.error('EXPENSE LINE REJECT ERROR:', err);
    res.status(500).json({ message: 'Failed to reject line item' });
  }
});

// =====================================================
// PAYMENT
// =====================================================
// Recording that the money went out. A separate act from approving it, done by
// the same people — an admin over the claim's team — because it is the same
// finance role, and there is nobody else it could sensibly belong to.
//
// Only an approved line can be paid. Paying a pending line would be paying
// something nobody agreed to, and a rejected one something that was refused.

// expenses-paid-migration.sql may not have run. Rather than refuse the whole
// feature, the columns are treated as optional in exactly the way
// approved_by_designation already is: try, and on "no such column" say so
// clearly instead of failing with a Postgres error nobody can act on.
let hasPaidColumns = true;

const paidMigrationRequired = (res) =>
  res.status(501).json({
    message: 'Marking expenses paid is not enabled yet — run database/expenses-paid-migration.sql',
    code: 'PAID_MIGRATION_REQUIRED',
  });

const setPaid = async (req, res, { paid }) => {
  const claim = await loadClaim(req, res);
  if (!claim) return;

  if (!canApproveClaim(req.user, claim)) {
    return res.status(403).json({ message: approvalRefusalReason(req.user, claim) });
  }

  const { data: line } = await supabase
    .from('expense_lines')
    .select('*')
    .eq('id', req.params.lineId)
    .single();

  // The parent is checked too — a line id from another claim must not be
  // reachable through this claim's URL.
  if (!line || line.claim_id !== claim.id) {
    return res.status(404).json({ message: 'Line item not found' });
  }

  if (paid) {
    if (line.approval_status !== 'Approved') {
      return res.status(400).json({
        message:
          line.approval_status === 'Rejected'
            ? 'That line was rejected, so there is nothing to pay'
            : 'That line has not been approved yet',
      });
    }
    if (isLinePaid(line)) {
      return res.status(400).json({ message: 'That line is already marked paid' });
    }
  } else if (!isLinePaid(line)) {
    return res.status(400).json({ message: 'That line is not marked paid' });
  }

  const patch = paid
    ? { paid_at: getISTTime(), paid_by: req.user.id, paid_by_name: req.user.name }
    : { paid_at: null, paid_by: null, paid_by_name: null };

  const { data: updated, error } = await supabase
    .from('expense_lines')
    .update(patch)
    .eq('id', line.id)
    .select()
    .single();

  if (error) {
    if (isMissingColumn(error, 'paid_at')) {
      hasPaidColumns = false;
      return paidMigrationRequired(res);
    }
    throw error;
  }

  // The claim's status is derived from its lines, so it has to be re-rolled
  // whenever one of them changes — otherwise the header goes on saying Approved
  // after the last outstanding line has been settled.
  const after = await syncClaimStatus(
    claim,
    await fetchLines(claim.id),
    req.user.name,
    paid
      ? `Line ${updated.line_no ?? ''} marked paid`.replace(/\s+/g, ' ').trim()
      : `Payment reversed on line ${updated.line_no ?? ''}`.replace(/\s+/g, ' ').trim()
  );

  res.json({
    line: { ...updated, status: lineStatus(updated) },
    claim_status: after?.status,
    message: paid ? 'Marked paid' : 'Payment reversed',
  });
};

router.post('/:id/lines/:lineId/pay', async (req, res) => {
  try {
    if (!hasPaidColumns) return paidMigrationRequired(res);
    await setPaid(req, res, { paid: true });
  } catch (err) {
    if (isMissingSchema(err)) return migrationResponse(res);
    console.error('EXPENSE PAY ERROR:', err);
    res.status(500).json({ message: 'Failed to mark the line paid' });
  }
});

// Reversing a payment recorded by mistake. Deliberately available: without it
// the only fix for a mistyped click is a database edit, and the alternative
// people reach for is deleting and re-raising the bill, which loses the
// approval and the signed document with it.
router.post('/:id/lines/:lineId/unpay', async (req, res) => {
  try {
    if (!hasPaidColumns) return paidMigrationRequired(res);
    await setPaid(req, res, { paid: false });
  } catch (err) {
    if (isMissingSchema(err)) return migrationResponse(res);
    console.error('EXPENSE UNPAY ERROR:', err);
    res.status(500).json({ message: 'Failed to reverse the payment' });
  }
});

// Everything approved and outstanding on this claim, in one go — the shape a
// payment run actually takes. Lines it cannot pay are reported rather than
// silently skipped, the same way approve-all does it.
router.post('/:id/pay-all', async (req, res) => {
  try {
    if (!hasPaidColumns) return paidMigrationRequired(res);

    const claim = await loadClaim(req, res);
    if (!claim) return;

    if (!canApproveClaim(req.user, claim)) {
      return res.status(403).json({ message: approvalRefusalReason(req.user, claim) });
    }

    const lines = await fetchLines(claim.id);
    const payable = lines.filter(isLinePayable);

    if (!payable.length) {
      const alreadyPaid = lines.filter(isLinePaid).length;
      return res.status(400).json({
        message: alreadyPaid
          ? 'Everything approved on this claim is already paid'
          : 'Nothing on this claim is approved and waiting to be paid',
      });
    }

    const now = getISTTime();
    const { error } = await supabase
      .from('expense_lines')
      .update({ paid_at: now, paid_by: req.user.id, paid_by_name: req.user.name })
      .in('id', payable.map((l) => l.id))
      // Guards the gap between reading and writing: a line approved-and-unpaid
      // a moment ago may have been paid by someone else since.
      .is('paid_at', null);

    if (error) {
      if (isMissingColumn(error, 'paid_at')) {
        hasPaidColumns = false;
        return paidMigrationRequired(res);
      }
      throw error;
    }

    const after = await fetchLines(claim.id);
    const claimAfter = await syncClaimStatus(
      claim,
      after,
      req.user.name,
      `Marked ${payable.length} line${payable.length === 1 ? '' : 's'} paid`
    );
    const skipped = lines.length - payable.length;

    res.json({
      paid: payable.length,
      skipped,
      status: claimAfter?.status,
      message:
        `Marked ${payable.length} line${payable.length === 1 ? '' : 's'} paid` +
        (skipped ? `, leaving ${skipped} not approved or already paid` : ''),
    });
  } catch (err) {
    if (isMissingSchema(err)) return migrationResponse(res);
    console.error('EXPENSE PAY-ALL ERROR:', err);
    res.status(500).json({ message: 'Failed to mark the claim paid' });
  }
});

// =====================================================
// LINE PDF
// =====================================================
router.get('/:id/lines/:lineId/pdf', async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;

    const { buildLinePdf } = require('../services/expensePdf');
    const pdf = await buildLinePdf(claim.id, req.params.lineId);

    const { data: line } = await supabase
      .from('expense_lines')
      .select('line_no')
      .eq('id', req.params.lineId)
      .single();

    const base = claim.claim_number || `expense-${claim.id.slice(0, 8)}`;
    const name = line?.line_no ? `${base}-${String(line.line_no).padStart(2, '0')}` : base;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } catch (err) {
    if (err.code === 'LINE_NOT_FOUND') {
      return res.status(404).json({ message: 'Line item not found' });
    }
    if (err.code === 'LINE_NOT_APPROVED') {
      return res.status(400).json({ message: 'That line has not been approved yet' });
    }
    console.error('EXPENSE LINE PDF ERROR:', err);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
});


router.get('/:id/pdf', async (req, res) => {
  try {
    const claim = await loadClaim(req, res);
    if (!claim) return;

    const { buildClaimPdf } = require('../services/expensePdf');
    const pdf = await buildClaimPdf(claim.id);

    const name = claim.claim_number || `expense-${claim.id.slice(0, 8)}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  } catch (err) {
    console.error('EXPENSE PDF ERROR:', err);
    res.status(500).json({ message: 'Failed to generate PDF' });
  }
});

module.exports = router;
