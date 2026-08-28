// =====================================================
// MCP tool surface over the ticketing portal
// =====================================================
// Twelve read tools, described for a model rather than for a developer.
//
// Three things shape everything below.
//
// First, the underlying API takes almost no filters: GET /tickets returns every
// visible ticket in one response, each with its full description and every
// logged work session. Handing that to a model verbatim burns its context on
// rows it did not ask for and often overflows the tool-result limit outright.
// So the filtering and the summarising happen here, and list tools report how
// much they left out.
//
// Second, aggregate questions ("how many open per person", "what did we spend
// on exhibitions") are the common case and are terrible to answer by shipping
// raw rows. ticket_stats and expense_report do the arithmetic here and return a
// table small enough to reason over.
//
// Third, ChatGPT's deep research mode only accepts a connector exposing tools
// literally named `search` and `fetch`, with a fixed result shape. Those two
// are that contract; the other ten are the ones worth using in conversation.

const portal = require('./portalApi');
const tables = require('./mcpTables');
const writes = require('./mcpWrites');
const { todayIST } = require('../utils/time');

const APP_URL = (process.env.FRONTEND_URL || 'https://mktg-ticketing-system.vercel.app').replace(
  /\/$/,
  ''
);

// Statuses that mean the work has stopped. Everything else is live, including
// "Waiting For Approval", which the backend sets on its own.
const DONE_STATUSES = new Set(['completed', 'closed']);

const lc = (v) => String(v ?? '').trim().toLowerCase();
const isDone = (t) => DONE_STATUSES.has(lc(t.status));

// Filters match loosely on purpose: a model asked for "the marketing admin's
// open tickets" will send an assignee of "Ramenaathan" or an email address, and
// refusing both because neither is an exact user id helps nobody.
const loose = (value, filter) => {
  if (filter === undefined || filter === null || filter === '') return true;
  return lc(value).includes(lc(filter));
};
const exact = (value, filter) => {
  if (filter === undefined || filter === null || filter === '') return true;
  return lc(value) === lc(filter);
};

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const round2 = (v) => Math.round(num(v) * 100) / 100;

const clampLimit = (value, fallback, max) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
};

// Descriptions are the largest thing in a ticket row and are almost never what
// a list answer needs. Cut here, available in full from get_ticket.
const snippet = (text, max = 220) => {
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

const loggedMinutes = (t) => {
  const entries = Array.isArray(t.time_entries) ? t.time_entries : null;
  if (entries) return entries.reduce((sum, e) => sum + num(e.minutes), 0);
  return num(t.time_spent_minutes || t.consumed_minutes);
};

const ticketUrl = (id) => `${APP_URL}/tickets/${id}`;
const projectUrl = (id) => `${APP_URL}/projects/${id}`;
const claimUrl = (id) => `${APP_URL}/expenses/${id}`;

// ---------------------------------------------------------------
// Row shapes
// ---------------------------------------------------------------

const ticketRow = (t) => ({
  id: t.id,
  title: t.title,
  status: t.status,
  priority: t.priority,
  category: t.category,
  division: t.division,
  team: t.team,
  assigned_to_name: t.assigned_to_name,
  created_by_name: t.created_by_name,
  due_date: t.due_date,
  completed_date: t.completed_date,
  allotted_minutes: num(t.allotted_minutes) || null,
  logged_minutes: loggedMinutes(t) || null,
  overdue: !isDone(t) && !!t.due_date && t.due_date < todayIST(),
  project_id: t.project_id || null,
  approval_status: t.approval_status || null,
  url: ticketUrl(t.id),
});

const ticketDetail = (t) => ({
  ...ticketRow(t),
  description: t.description || null,
  given_by: t.given_by || null,
  approval_required: t.approval_required === true,
  is_recurring: t.is_recurring === true,
  created_at: t.created_at,
  updated_at: t.updated_at,
  time_entries: (Array.isArray(t.time_entries) ? t.time_entries : []).map((e) => ({
    minutes: num(e.minutes),
    note: e.note || null,
    logged_at: e.created_at,
  })),
});

const projectRow = (p) => ({
  id: p.id,
  name: p.name,
  status: p.status,
  division: p.division,
  target_date: p.target_date,
  created_by_name: p.created_by_name,
  member_count: Array.isArray(p.members) ? p.members.length : null,
  // stats.complete, not target_date vs today: a project that landed after its
  // target is late, but it is not overdue — the work is done.
  tasks_total: num(p.stats?.total),
  tasks_done: num(p.stats?.done),
  tasks_overdue: num(p.stats?.overdue),
  progress_percent: num(p.stats?.progress),
  complete: p.stats?.complete === true,
  completed_on: p.stats?.completed_on || null,
  days_late: p.stats?.days_late ?? null,
  url: projectUrl(p.id),
});

const claimRow = (c) => ({
  id: c.id,
  claim_number: c.claim_number,
  title: c.title,
  claimant_name: c.claimant_name,
  team: c.team,
  division: c.division,
  currency: c.currency || 'INR',
  total_amount: round2(c.total_amount),
  status: c.status,
  submitted_at: c.submitted_at,
  approved_at: c.approved_at,
  url: claimUrl(c.id),
});

const userRow = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  designation: u.designation,
  division: u.division,
  active: u.active !== false,
});

// ---------------------------------------------------------------
// Shared ticket filtering
// ---------------------------------------------------------------

const TICKET_FILTER_SCHEMA = {
  status: {
    type: 'string',
    description:
      'Exact status: Open, In Progress, Waiting For Sources, Waiting For Approval, Completed or Closed.',
  },
  state: {
    type: 'string',
    enum: ['open', 'done', 'overdue', 'unassigned', 'any'],
    description:
      'Coarser than status and usually what you want. "open" is anything not Completed or Closed; ' +
      '"overdue" is open and past its due date; "done" is Completed or Closed.',
  },
  assignee: { type: 'string', description: 'Assignee name or part of one. Case-insensitive.' },
  created_by: { type: 'string', description: 'Name of whoever raised it, or part of one.' },
  division: { type: 'string', description: 'ASTOR, CPS, TMD or All User.' },
  team: { type: 'string', enum: ['Marketing', 'Service'], description: 'Which team owns the work.' },
  category: { type: 'string', description: 'Work type, e.g. Campaign or Breakdown Support.' },
  priority: { type: 'string', description: 'Low, Medium, High or Urgent.' },
  project_id: { type: 'string', description: 'Only tickets belonging to this project.' },
  due_from: { type: 'string', description: 'Only tickets due on or after this date (YYYY-MM-DD).' },
  due_to: { type: 'string', description: 'Only tickets due on or before this date (YYYY-MM-DD).' },
  query: {
    type: 'string',
    description: 'Free text matched against the title, description and category.',
  },
};

const applyTicketFilters = (tickets, a = {}) => {
  const today = todayIST();
  return tickets.filter((t) => {
    if (!exact(t.status, a.status)) return false;
    if (!loose(t.assigned_to_name, a.assignee)) return false;
    if (!loose(t.created_by_name, a.created_by)) return false;
    if (!exact(t.division, a.division)) return false;
    if (!exact(t.team, a.team)) return false;
    if (!loose(t.category, a.category)) return false;
    if (!exact(t.priority, a.priority)) return false;
    if (a.project_id && String(t.project_id || '') !== String(a.project_id)) return false;
    if (a.due_from && (!t.due_date || t.due_date < a.due_from)) return false;
    if (a.due_to && (!t.due_date || t.due_date > a.due_to)) return false;

    switch (lc(a.state)) {
      case 'open':
        if (isDone(t)) return false;
        break;
      case 'done':
        if (!isDone(t)) return false;
        break;
      case 'overdue':
        if (isDone(t) || !t.due_date || t.due_date >= today) return false;
        break;
      case 'unassigned':
        if (t.assigned_to) return false;
        break;
      default:
        break;
    }

    if (a.query) {
      const hay = `${t.title || ''} ${t.description || ''} ${t.category || ''}`;
      if (!lc(hay).includes(lc(a.query))) return false;
    }
    return true;
  });
};

// Every list tool reports what it dropped. A model told "50 of 312" asks a
// narrower question; a model handed 50 rows with no count assumes it has them
// all and reports a wrong total.
const page = (rows, { limit, offset = 0 }) => {
  const start = Math.max(0, Number(offset) || 0);
  const slice = rows.slice(start, start + limit);
  const out = { matched: rows.length, returned: slice.length, offset: start };
  if (start + slice.length < rows.length) {
    out.note =
      `Showing ${slice.length} of ${rows.length} matches. Narrow the filters, ` +
      `raise limit, or pass offset=${start + slice.length} for the next page.`;
  }
  return out;
};

const groupCounts = (rows, keyOf, valueOf) => {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row) || 'Unspecified';
    const current = map.get(key) || { key, count: 0, value: 0 };
    current.count += 1;
    current.value += valueOf ? num(valueOf(row)) : 0;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.value - a.value || b.count - a.count);
};

// ---------------------------------------------------------------
// Tools
// ---------------------------------------------------------------

const tools = [
  {
    name: 'whoami',
    title: 'Who this connection acts as',
    description:
      'The person this connection acts as, and therefore the limit of what every other tool can ' +
      'see. Worth calling first when a result looks narrower than expected: a key acting as a team ' +
      'member only ever sees their own work, and no tool here can widen that.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => ({
      acting_as: ctx.user
        ? { name: ctx.user.name, email: ctx.user.email, role: ctx.user.role }
        : 'unknown',
      key_name: ctx.key?.name || null,
      can_write: ctx.canWrite === true,
      today: todayIST(),
      note: ctx.canWrite
        ? 'This connection can raise and change tickets, log time, and approve or reject work — ' +
          'all recorded as the person above. It cannot delete anything, approve expense claims, ' +
          'or manage user accounts.'
        : 'This connection is read-only. Nothing here changes anything in the portal.',
    }),
  },

  {
    name: 'list_tickets',
    title: 'List tickets',
    description:
      'Tickets visible to this connection, filtered and trimmed. Returns a summary row per ticket ' +
      'without the description or the individual work sessions — use get_ticket for those. For ' +
      'counts or totals rather than rows, use ticket_stats instead; it is far cheaper than reading ' +
      'a list and counting it yourself.',
    inputSchema: {
      type: 'object',
      properties: {
        ...TICKET_FILTER_SCHEMA,
        sort: {
          type: 'string',
          enum: ['due_date', 'created_at', 'updated_at', 'priority'],
          description: 'Ordering. Defaults to due date, soonest first.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Rows to return. Default 50.',
        },
        offset: { type: 'integer', minimum: 0, description: 'Rows to skip, for paging.' },
      },
    },
    handler: async (args, ctx) => {
      const all = await portal.get(ctx.credential, '/tickets');
      const filtered = applyTicketFilters(Array.isArray(all) ? all : [], args);

      const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };
      const sorters = {
        due_date: (a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')),
        created_at: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
        updated_at: (a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
        priority: (a, b) =>
          (PRIORITY_ORDER[lc(a.priority)] ?? 9) - (PRIORITY_ORDER[lc(b.priority)] ?? 9),
      };
      filtered.sort(sorters[args.sort] || sorters.due_date);

      const limit = clampLimit(args.limit, 50, 200);
      const meta = page(filtered, { limit, offset: args.offset });
      return {
        ...meta,
        tickets: filtered.slice(meta.offset, meta.offset + limit).map(ticketRow),
      };
    },
  },

  {
    name: 'ticket_stats',
    title: 'Count and total tickets',
    description:
      'Aggregate answer to "how many" and "how long" questions — per person, status, division, ' +
      'category, priority, team or month. Accepts the same filters as list_tickets and returns one ' +
      'row per group with its ticket count, how many are overdue, and minutes budgeted versus ' +
      'logged. Reach for this before listing tickets in order to count them.',
    inputSchema: {
      type: 'object',
      properties: {
        group_by: {
          type: 'string',
          enum: ['assignee', 'status', 'division', 'category', 'priority', 'team', 'month'],
          description: 'What to break the numbers down by. "month" uses the due date.',
        },
        ...TICKET_FILTER_SCHEMA,
      },
      required: ['group_by'],
    },
    handler: async (args, ctx) => {
      const all = await portal.get(ctx.credential, '/tickets');
      const rows = applyTicketFilters(Array.isArray(all) ? all : [], args);
      const today = todayIST();

      const keyOf = {
        assignee: (t) => t.assigned_to_name || 'Unassigned',
        status: (t) => t.status,
        division: (t) => t.division,
        category: (t) => t.category,
        priority: (t) => t.priority,
        team: (t) => t.team,
        month: (t) => (t.due_date ? String(t.due_date).slice(0, 7) : 'No due date'),
      }[args.group_by];

      if (!keyOf) {
        throw new portal.PortalError(400, `Cannot group tickets by "${args.group_by}".`);
      }

      const map = new Map();
      for (const t of rows) {
        const key = keyOf(t) || 'Unspecified';
        const g = map.get(key) || {
          group: key,
          tickets: 0,
          open: 0,
          done: 0,
          overdue: 0,
          allotted_minutes: 0,
          logged_minutes: 0,
        };
        g.tickets += 1;
        if (isDone(t)) g.done += 1;
        else {
          g.open += 1;
          if (t.due_date && t.due_date < today) g.overdue += 1;
        }
        g.allotted_minutes += num(t.allotted_minutes);
        g.logged_minutes += loggedMinutes(t);
        map.set(key, g);
      }

      const groups = [...map.values()].sort((a, b) => b.tickets - a.tickets);
      const totals = groups.reduce(
        (acc, g) => ({
          tickets: acc.tickets + g.tickets,
          open: acc.open + g.open,
          done: acc.done + g.done,
          overdue: acc.overdue + g.overdue,
          allotted_minutes: acc.allotted_minutes + g.allotted_minutes,
          logged_minutes: acc.logged_minutes + g.logged_minutes,
        }),
        { tickets: 0, open: 0, done: 0, overdue: 0, allotted_minutes: 0, logged_minutes: 0 }
      );

      return { grouped_by: args.group_by, as_of: today, totals, groups };
    },
  },

  {
    name: 'get_ticket',
    title: 'Get one ticket',
    description:
      'Everything about a single ticket: the full description including any closure note, the ' +
      'approval state, and every logged work session with its note.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The ticket id.' } },
      required: ['id'],
    },
    handler: async (args, ctx) =>
      ticketDetail(await portal.get(ctx.credential, `/tickets/${encodeURIComponent(args.id)}`)),
  },

  {
    name: 'list_projects',
    title: 'List projects',
    description:
      'Projects with their rolled-up task progress. Judge lateness with `complete` and `days_late`, ' +
      'not by comparing target_date to today — a project that finished after its target is late, ' +
      'but it is not overdue, because the work is done.',
    inputSchema: {
      type: 'object',
      properties: {
        state: {
          type: 'string',
          enum: ['active', 'complete', 'overdue', 'any'],
          description: '"overdue" means unfinished with tasks past their due date.',
        },
        status: { type: 'string', description: 'Exact project status.' },
        division: { type: 'string', description: 'ASTOR, CPS, TMD or All User.' },
        query: {
          type: 'string',
          description: 'Free text matched against the name and description.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Rows to return. Default 50.',
        },
        offset: { type: 'integer', minimum: 0, description: 'Rows to skip, for paging.' },
      },
    },
    handler: async (args, ctx) => {
      const all = await portal.get(ctx.credential, '/projects');
      const rows = (Array.isArray(all) ? all : []).filter((p) => {
        if (!exact(p.status, args.status)) return false;
        if (!exact(p.division, args.division)) return false;
        if (args.query && !lc(`${p.name || ''} ${p.description || ''}`).includes(lc(args.query))) {
          return false;
        }
        switch (lc(args.state)) {
          case 'complete':
            return p.stats?.complete === true;
          case 'active':
            return p.stats?.complete !== true;
          case 'overdue':
            return p.stats?.complete !== true && num(p.stats?.overdue) > 0;
          default:
            return true;
        }
      });

      const limit = clampLimit(args.limit, 50, 200);
      const meta = page(rows, { limit, offset: args.offset });
      return { ...meta, projects: rows.slice(meta.offset, meta.offset + limit).map(projectRow) };
    },
  },

  {
    name: 'get_project',
    title: 'Get one project',
    description: 'A single project with its progress stats and the tickets that make it up.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The project id.' } },
      required: ['id'],
    },
    handler: async (args, ctx) => {
      const p = await portal.get(ctx.credential, `/projects/${encodeURIComponent(args.id)}`);
      const tasks = Array.isArray(p.tasks) ? p.tasks : Array.isArray(p.tickets) ? p.tickets : [];
      return {
        ...projectRow(p),
        description: p.description || null,
        created_at: p.created_at,
        tasks: tasks.map(ticketRow),
      };
    },
  },

  {
    name: 'expense_report',
    title: 'Analyse spend',
    description:
      'The right tool for any question about money. Reads one row per individual bill — not per ' +
      'claim — and returns totals split by approval status plus a breakdown by whatever you group ' +
      'on. Amounts are net plus tax. Each bill is approved or refused on its own, so a claim can be ' +
      'part approved: `approved` is the only total that represents committed spend.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Only bills spent on or after this date (YYYY-MM-DD).' },
        to: { type: 'string', description: 'Only bills spent on or before this date (YYYY-MM-DD).' },
        group_by: {
          type: 'string',
          enum: ['category', 'division', 'claimant', 'month', 'approval_status', 'team', 'none'],
          description: 'How to break the spend down. Defaults to category.',
        },
        approval_status: {
          type: 'string',
          description: 'Narrow to Pending, Approved or Rejected bills only.',
        },
        category: { type: 'string', description: 'Expense category, or part of one.' },
        division: { type: 'string', description: 'ASTOR, CPS, TMD or All User.' },
        claimant: { type: 'string', description: 'Claimant name, or part of one.' },
        include_lines: {
          type: 'boolean',
          description: 'Also return the individual bills, largest first. Off by default.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 200,
          description: 'Bills to return when include_lines is true. Default 25.',
        },
      },
    },
    handler: async (args, ctx) => {
      const report = await portal.get(ctx.credential, '/expenses/report', {
        from: args.from,
        to: args.to,
      });

      const lines = (Array.isArray(report?.lines) ? report.lines : []).filter(
        (l) =>
          exact(l.approval_status, args.approval_status) &&
          loose(l.category, args.category) &&
          exact(l.division, args.division) &&
          loose(l.claimant_name, args.claimant)
      );

      const totals = { approved: 0, pending: 0, rejected: 0, all: 0 };
      for (const l of lines) {
        const bucket = lc(l.approval_status) || 'pending';
        if (bucket in totals) totals[bucket] += num(l.total);
        totals.all += num(l.total);
      }
      for (const k of Object.keys(totals)) totals[k] = round2(totals[k]);

      const groupBy = args.group_by || 'category';
      const keyOf = {
        category: (l) => l.category,
        division: (l) => l.division,
        claimant: (l) => l.claimant_name,
        month: (l) => (l.expense_date ? String(l.expense_date).slice(0, 7) : 'No date'),
        approval_status: (l) => l.approval_status,
        team: (l) => l.team,
      }[groupBy];

      const out = {
        period: { from: args.from || 'all time', to: args.to || 'today' },
        currency: lines[0]?.currency || 'INR',
        bill_count: lines.length,
        totals,
      };

      if (keyOf) {
        out.grouped_by = groupBy;
        out.groups = groupCounts(lines, keyOf, (l) => l.total).map((g) => ({
          group: g.key,
          bills: g.count,
          total: round2(g.value),
        }));
      }

      if (args.include_lines) {
        const limit = clampLimit(args.limit, 25, 200);
        const sorted = [...lines].sort((a, b) => num(b.total) - num(a.total));
        out.lines = sorted.slice(0, limit).map((l) => ({
          claim_number: l.claim_number,
          claim_id: l.claim_id,
          expense_date: l.expense_date,
          category: l.category,
          description: snippet(l.description, 160),
          claimant_name: l.claimant_name,
          division: l.division,
          amount: round2(l.amount),
          tax_amount: round2(l.tax_amount),
          total: round2(l.total),
          approval_status: l.approval_status,
          url: claimUrl(l.claim_id),
        }));
        if (sorted.length > limit) {
          out.lines_note = `Showing the ${limit} largest of ${sorted.length} bills.`;
        }
      }

      return out;
    },
  },

  {
    name: 'list_expense_claims',
    title: 'List expense claims',
    description:
      'Claims are the envelope; the bills are lines inside them. Use this to find a specific claim ' +
      'or to see where claims are sitting in approval. For anything about amounts across many ' +
      'claims, use expense_report instead.',
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Exact claim status: Draft, Submitted, Partially Approved, Approved or Rejected.',
        },
        search: {
          type: 'string',
          description: 'Free text matched against the claim title and number.',
        },
        page: { type: 'integer', minimum: 1, description: 'Page number, starting at 1.' },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          description: 'Claims per page. Default 25.',
        },
      },
    },
    handler: async (args, ctx) => {
      const body = await portal.get(ctx.credential, '/expenses', {
        status: args.status,
        search: args.search,
        page: args.page,
        limit: clampLimit(args.limit, 25, 100),
      });
      return {
        matched: num(body?.total),
        page: num(body?.page) || 1,
        limit: num(body?.limit) || 25,
        claims: (Array.isArray(body?.claims) ? body.claims : []).map(claimRow),
      };
    },
  },

  {
    name: 'get_expense_claim',
    title: 'Get one expense claim',
    description:
      "A single claim with every bill on it and each bill's own approval decision, including who " +
      'decided and why anything was refused.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The claim id.' } },
      required: ['id'],
    },
    handler: async (args, ctx) => {
      const c = await portal.get(ctx.credential, `/expenses/${encodeURIComponent(args.id)}`);
      const lines = Array.isArray(c.lines) ? c.lines : [];
      return {
        ...claimRow(c),
        rejection_reason: c.rejection_reason || null,
        approved_by_name: c.approved_by_name || null,
        created_at: c.created_at,
        lines: lines.map((l) => ({
          line_no: l.line_no,
          expense_date: l.expense_date,
          category: l.category,
          description: l.description,
          amount: round2(l.amount),
          tax_amount: round2(l.tax_amount),
          total: round2(num(l.amount) + num(l.tax_amount)),
          approval_status: l.approval_status || 'Pending',
          approved_by_name: l.approved_by_name || null,
          rejection_reason: l.rejection_reason || null,
        })),
        receipt_count: Array.isArray(c.receipts) ? c.receipts.length : 0,
      };
    },
  },

  {
    name: 'list_users',
    title: 'List people',
    description:
      'People visible to this connection, for turning an id into a name or answering who is on a ' +
      'team. Needs a connection acting as an admin; anything less gets a permission error, which is ' +
      'not a fault worth retrying.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Matched against name, email, role and designation.' },
        team: {
          type: 'string',
          enum: ['Marketing', 'Service'],
          description: 'Filter by team.',
        },
        active: { type: 'boolean', description: 'Pass false to see only disabled accounts.' },
      },
    },
    handler: async (args, ctx) => {
      const all = await portal.get(ctx.credential, '/users');
      const rows = (Array.isArray(all) ? all : []).map(userRow).filter((u) => {
        if (args.active !== undefined && u.active !== args.active) return false;
        // The team lives in the role label — "Admin - Service", "Team Member -
        // MKTG" — and a Super Admin belongs to every team.
        if (args.team) {
          const isService = /service/i.test(u.role || '');
          const isSuper = lc(u.role) === 'super admin';
          if (!isSuper && isService !== (lc(args.team) === 'service')) return false;
        }
        if (args.query) {
          const hay = `${u.name || ''} ${u.email || ''} ${u.role || ''} ${u.designation || ''}`;
          if (!lc(hay).includes(lc(args.query))) return false;
        }
        return true;
      });
      return { matched: rows.length, users: rows };
    },
  },

  // ---------------------------------------------------------------
  // Everything else in the database
  // ---------------------------------------------------------------
  {
    name: 'describe_tables',
    title: 'What else can be read',
    description:
      'Lists every table this connection can read, what each one holds, and — where it cannot be ' +
      'read — why. Call this before query_table rather than guessing a table name. Tables that ' +
      'hold credentials are not listed at all.',
    inputSchema: { type: 'object', properties: {} },
    handler: async (_args, ctx) => ({
      tables: tables.describeTables(ctx.user),
      note:
        'Read with query_table. Rows are scoped the same way the app scopes them: you see what you ' +
        'would see signed in, no more.',
    }),
  },

  {
    name: 'query_table',
    title: 'Read any table',
    description:
      'Reads one table directly — time entries, notifications, leave and permission requests, the ' +
      'ABM CRM, the LinkedIn and Google Ads analytics, and the tables behind the tools above. ' +
      'Rows are already scoped to what this connection may see. Use the purpose-built tools where ' +
      'one exists (ticket_stats, expense_report); this is for everything they do not cover.',
    inputSchema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'Table name, as listed by describe_tables.' },
        columns: {
          type: 'array',
          items: { type: 'string' },
          description: 'Columns to return. Omit for all of them.',
        },
        filters: {
          type: 'array',
          description: 'Conditions, all of which must hold.',
          items: {
            type: 'object',
            properties: {
              column: { type: 'string', description: 'Column to test.' },
              op: {
                type: 'string',
                enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'is_null', 'not_null'],
                description: '"contains" is a case-insensitive substring match.',
              },
              value: { description: 'Value to compare against. Not needed for is_null/not_null.' },
            },
            required: ['column', 'op'],
          },
        },
        order: {
          type: 'object',
          description: 'Sort order.',
          properties: {
            column: { type: 'string' },
            direction: { type: 'string', enum: ['asc', 'desc'] },
          },
        },
        limit: { type: 'integer', minimum: 1, maximum: 500, description: 'Rows to return. Default 50.' },
        offset: { type: 'integer', minimum: 0, description: 'Rows to skip, for paging.' },
      },
      required: ['table'],
    },
    handler: async (args, ctx) => {
      const result = await tables.queryTable(
        {
          table: String(args.table || ''),
          columns: args.columns,
          filters: Array.isArray(args.filters) ? args.filters : [],
          order: args.order,
          limit: clampLimit(args.limit, 50, 500),
          offset: Math.max(0, Number(args.offset) || 0),
        },
        ctx
      );
      // A refusal is an answer — this connection may not read that — so it comes
      // back as a tool error the model can relay rather than retry.
      if (result.error) throw new portal.PortalError(403, result.error);
      return result;
    },
  },

  // ---------------------------------------------------------------
  // The deep-research contract
  // ---------------------------------------------------------------
  // ChatGPT's research mode looks for exactly these two names and this exact
  // result shape: search returns {results:[{id,title,url}]} and fetch takes one
  // of those ids back. The ids are namespaced so fetch knows which record it is
  // being asked for without a second lookup.
  {
    name: 'search',
    title: 'Search everything',
    description:
      'Free-text search across tickets, projects, expense claims and people in one pass. Returns ' +
      'lightweight hits with an id to hand to fetch. Prefer the specific list tools when you ' +
      'already know what kind of record you want — they filter properly, where this only matches ' +
      'text.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for.' },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['ticket', 'project', 'expense', 'user'] },
          description: 'Restrict to certain record types. Defaults to all four.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Hits to return. Default 20.',
        },
      },
      required: ['query'],
    },
    handler: async (args, ctx) => {
      const q = lc(args.query);
      const wanted = new Set(
        Array.isArray(args.types) && args.types.length
          ? args.types.map(lc)
          : ['ticket', 'project', 'expense', 'user']
      );
      const limit = clampLimit(args.limit, 20, 50);
      const results = [];

      // Each source is optional: a key that cannot read users should still get
      // ticket hits rather than one 403 that fails the whole search.
      const safely = async (fn) => {
        try {
          return await fn();
        } catch {
          return null;
        }
      };

      if (wanted.has('ticket')) {
        const all = await safely(() => portal.get(ctx.credential, '/tickets'));
        for (const t of Array.isArray(all) ? all : []) {
          const hay = `${t.title || ''} ${t.description || ''} ${t.category || ''} ${
            t.assigned_to_name || ''
          }`;
          if (lc(hay).includes(q)) {
            results.push({
              id: `ticket:${t.id}`,
              title: `[Ticket] ${t.title}`,
              url: ticketUrl(t.id),
              snippet: snippet(
                `${t.status} · ${t.assigned_to_name || 'Unassigned'} · due ${
                  t.due_date || 'n/a'
                } — ${t.description || ''}`
              ),
            });
          }
        }
      }

      if (wanted.has('project')) {
        const all = await safely(() => portal.get(ctx.credential, '/projects'));
        for (const p of Array.isArray(all) ? all : []) {
          if (lc(`${p.name || ''} ${p.description || ''}`).includes(q)) {
            results.push({
              id: `project:${p.id}`,
              title: `[Project] ${p.name}`,
              url: projectUrl(p.id),
              snippet: snippet(
                `${num(p.stats?.done)}/${num(p.stats?.total)} tasks done · target ${
                  p.target_date || 'n/a'
                } — ${p.description || ''}`
              ),
            });
          }
        }
      }

      if (wanted.has('expense')) {
        const body = await safely(() =>
          portal.get(ctx.credential, '/expenses', { search: args.query, limit: 100 })
        );
        for (const c of Array.isArray(body?.claims) ? body.claims : []) {
          results.push({
            id: `expense:${c.id}`,
            title: `[Expense] ${c.claim_number} — ${c.title}`,
            url: claimUrl(c.id),
            snippet: snippet(
              `${c.status} · ${c.claimant_name} · ${c.currency || 'INR'} ${round2(
                c.total_amount
              )}`
            ),
          });
        }
      }

      if (wanted.has('user')) {
        const all = await safely(() => portal.get(ctx.credential, '/users'));
        for (const u of Array.isArray(all) ? all : []) {
          if (lc(`${u.name || ''} ${u.email || ''} ${u.designation || ''}`).includes(q)) {
            results.push({
              id: `user:${u.id}`,
              title: `[Person] ${u.name}`,
              url: `${APP_URL}/admin`,
              snippet: snippet(`${u.designation || u.role} · ${u.email}`),
            });
          }
        }
      }

      return {
        results: results.slice(0, limit),
        matched: results.length,
        ...(results.length > limit ? { note: `Showing ${limit} of ${results.length} matches.` } : {}),
      };
    },
  },

  {
    name: 'fetch',
    title: 'Fetch a search result',
    description:
      'Full detail for one id returned by search. Ids look like "ticket:123", "project:8", ' +
      '"expense:44" or "user:5".',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'A namespaced id from search.' } },
      required: ['id'],
    },
    handler: async (args, ctx) => {
      const raw = String(args.id || '');
      const sep = raw.indexOf(':');
      const type = sep === -1 ? '' : lc(raw.slice(0, sep));
      const id = sep === -1 ? raw : raw.slice(sep + 1);

      if (type === 'ticket') {
        const t = await portal.get(ctx.credential, `/tickets/${encodeURIComponent(id)}`);
        return { id: raw, title: t.title, url: ticketUrl(id), metadata: ticketDetail(t) };
      }
      if (type === 'project') {
        const p = await portal.get(ctx.credential, `/projects/${encodeURIComponent(id)}`);
        return { id: raw, title: p.name, url: projectUrl(id), metadata: projectRow(p) };
      }
      if (type === 'expense') {
        const c = await portal.get(ctx.credential, `/expenses/${encodeURIComponent(id)}`);
        return {
          id: raw,
          title: `${c.claim_number} — ${c.title}`,
          url: claimUrl(id),
          metadata: claimRow(c),
        };
      }
      if (type === 'user') {
        const all = await portal.get(ctx.credential, '/users');
        const u = (Array.isArray(all) ? all : []).find((x) => String(x.id) === String(id));
        if (!u) throw new portal.PortalError(404, `No person with id ${id}`);
        return { id: raw, title: u.name, url: `${APP_URL}/admin`, metadata: userRow(u) };
      }

      throw new portal.PortalError(
        400,
        `Unrecognised id "${raw}". Ids from search look like "ticket:123" or "expense:44".`
      );
    },
  },
];

// The write tools live in their own file because they are a different kind of
// thing: everything above answers a question, everything appended here changes
// something and needs the connection to have been granted that.
tools.push(...writes.tools);

const byName = new Map(tools.map((t) => [t.name, t]));

// What tools/list returns: the handler is ours, the rest is the wire format.
//
// The annotations matter more than they look. A client reads readOnlyHint to
// decide whether a call needs confirming with the person first, so a write tool
// that failed to declare itself would be run silently. Everything above is a
// read and says so by omission; only mcpWrites.js sets them explicitly.
const listTools = () =>
  tools.map(({ name, title, description, inputSchema, annotations }) => ({
    name,
    title,
    description,
    inputSchema,
    annotations: annotations || { readOnlyHint: true },
  }));

module.exports = { tools, byName, listTools };
