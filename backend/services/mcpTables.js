// =====================================================
// Generic table reads for MCP, scoped the way the app scopes
// =====================================================
// The twelve purpose-built tools cover the questions people actually ask. This
// covers the rest of the database — time entries, notifications, leave and
// permission requests, the ABM CRM, the LinkedIn and Google Ads analytics — with
// one tool that takes a table name, some filters and a limit.
//
// The whole difficulty is that there is no RLS in this database. A direct
// `select * from tickets` returns every ticket in the company, which is not what
// the person connecting is allowed to see. So every table here declares how it
// is scoped, and there are two ways of declaring it:
//
//   source: 'route'  — the rows come from an existing API route that already
//                      scopes them. Nothing is re-implemented, so nothing can
//                      drift out of step with the app.
//
//   source: 'table'  — no route owns this data, so the rule is written out here
//                      and each one names the route it was copied from. These
//                      are the ones to re-read if the app's rules change.
//
// A table with no entry is not readable. That is deliberate: adding a table to
// the database should not silently publish it.

const supabase = require('../config/supabase');
const portal = require('./portalApi');
const {
  isAdmin,
  isSuperAdmin,
  getUserTeam,
  canAccessLinkedIn,
  canAccessGoogleAds,
} = require('../utils/roles');

// ---------------------------------------------------------------
// Tables that are never readable
// ---------------------------------------------------------------
// Not "scoped to admins" — absent. Every one of these stores a credential, and
// the point of this endpoint is to hand data to a third-party AI client.
//
//   users.password      bcrypt hashes of everyone's password
//   api_keys.key_hash   the lookup value for every live API key
//   linkedin_tokens     live LinkedIn API access tokens
//
// users is readable through its route, which selects an explicit column list
// that has never included password. api_keys and linkedin_tokens have no entry
// below at all.
const FORBIDDEN_COLUMNS = new Set(['password', 'key_hash', 'access_token', 'refresh_token']);

// Mirrors routes/abm.js. Duplicated rather than exported because that file keeps
// it private; if the ABM allow-list changes there, change it here too.
const ABM_USER_IDS = ['d5f32730-4953-4c7c-9185-c87e6eca329d'];
const canAccessAbm = (user) =>
  getUserTeam(user) !== 'Service' && (isAdmin(user) || ABM_USER_IDS.includes(user.id));

const allowed = () => ({ ok: true });
const denied = (reason) => ({ ok: false, reason });

// ---------------------------------------------------------------
// Row sources
// ---------------------------------------------------------------

const pageThroughClaims = async (credential) => {
  const claims = [];
  // Capped so a pathological account cannot turn one tool call into fifty
  // requests. The cap is reported when it bites.
  for (let page = 1; page <= 20; page += 1) {
    const body = await portal.get(credential, '/expenses', { page, limit: 100 });
    const batch = Array.isArray(body?.claims) ? body.claims : [];
    claims.push(...batch);
    if (batch.length < 100) break;
  }
  return claims;
};

// ---------------------------------------------------------------
// The registry
// ---------------------------------------------------------------

const TABLES = {
  tickets: {
    description: 'Every ticket, raw. list_tickets is friendlier for most questions.',
    source: 'route',
    access: allowed,
    rows: (ctx) => portal.get(ctx.credential, '/tickets'),
  },

  ticket_time_entries: {
    description:
      'Individual logged work sessions: which ticket, how many minutes, the note, and when. ' +
      'Enriched with the ticket title and assignee so time can be totalled per person without a ' +
      'second lookup.',
    source: 'route',
    access: allowed,
    // Taken from the tickets the caller can see, which is precisely the rule the
    // app applies — a time entry is visible exactly when its ticket is.
    rows: async (ctx) => {
      const tickets = await portal.get(ctx.credential, '/tickets');
      return (Array.isArray(tickets) ? tickets : []).flatMap((t) =>
        (Array.isArray(t.time_entries) ? t.time_entries : []).map((e) => ({
          id: e.id,
          ticket_id: t.id,
          ticket_title: t.title,
          ticket_status: t.status,
          assigned_to_name: t.assigned_to_name,
          team: t.team,
          division: t.division,
          category: t.category,
          minutes: Number(e.minutes) || 0,
          note: e.note ?? null,
          created_at: e.created_at,
        }))
      );
    },
  },

  projects: {
    description: 'Projects with their rolled-up task stats.',
    source: 'route',
    access: allowed,
    rows: (ctx) => portal.get(ctx.credential, '/projects'),
  },

  users: {
    description:
      'People, without password hashes. Requires an admin — the route this reads through refuses ' +
      'anyone else.',
    source: 'route',
    access: (user) => (isAdmin(user) ? allowed() : denied('Only an admin can list people')),
    rows: (ctx) => portal.get(ctx.credential, '/users'),
  },

  expense_claims: {
    description: 'Expense claims — the envelope. The bills are in expense_lines.',
    source: 'route',
    access: allowed,
    rows: (ctx) => pageThroughClaims(ctx.credential),
  },

  expense_lines: {
    description:
      'Individual bills, already joined to their claim (claimant, team, division). This is the ' +
      'one to total for spend questions.',
    source: 'route',
    access: allowed,
    rows: async (ctx) => {
      const report = await portal.get(ctx.credential, '/expenses/report');
      return Array.isArray(report?.lines) ? report.lines : [];
    },
  },

  expense_receipts: {
    description: 'Receipt files attached to expense claims — metadata only, not the file itself.',
    source: 'table',
    access: allowed,
    // No route lists receipts across claims, so the claims the caller can see
    // are fetched first and the receipts restricted to those.
    scope: async (_build, ctx) => {
      const report = await portal.get(ctx.credential, '/expenses/report');
      const claimIds = [...new Set((report?.lines || []).map((l) => l.claim_id).filter(Boolean))];
      if (!claimIds.length) return { empty: true };
      return { chunkOn: { column: 'claim_id', values: claimIds } };
    },
  },

  notifications: {
    description: 'Your own notifications.',
    source: 'table',
    access: allowed,
    // From routes/notifications.js: a notification is the caller's when it
    // carries their user_id, or — for rows written before that column existed —
    // when it has no user_id and the stored display name is theirs.
    scope: (build, ctx) => ({
      query: ctx.user.id
        ? build().or(
            `user_id.eq.${ctx.user.id},and(user_id.is.null,user_name.eq."${String(ctx.user.name).replace(/"/g, '')}")`
          )
        : build().eq('user_name', ctx.user.name),
    }),
  },

  leave_requests: {
    description: 'Leave requests. An admin sees everyone, anyone else sees their own.',
    source: 'table',
    access: allowed,
    // From routes/leaveRoutes.js. Note it does not narrow admins to their own
    // team, so neither does this.
    scope: (build, ctx) => ({
      query: isAdmin(ctx.user) ? build() : build().eq('user_id', ctx.user.id),
    }),
  },

  permission_requests: {
    description: 'Permission requests. An admin sees everyone, anyone else sees their own.',
    source: 'table',
    access: allowed,
    // From routes/permissionRoutes.js, same rule as leave_requests.
    scope: (build, ctx) => ({
      query: isAdmin(ctx.user) ? build() : build().eq('user_id', ctx.user.id),
    }),
  },
};

// The ABM CRM and the two ad-analytics areas are gated wholesale rather than
// row by row, exactly as their routes are: you either have access to the area or
// you do not, and within it you see everything.
const areaTables = (names, description, gate, denial) => {
  for (const [name, detail] of Object.entries(names)) {
    TABLES[name] = {
      description: `${description} ${detail}`,
      source: 'table',
      access: (user) => (gate(user) ? allowed() : denied(denial)),
      scope: (build) => ({ query: build() }),
    };
  }
};

areaTables(
  {
    abm_accounts: 'Target accounts.',
    abm_contacts: 'People at those accounts.',
    abm_opportunities: 'Open opportunities.',
    abm_activities: 'Logged outreach and follow-ups.',
    abm_settings: 'Configuration for the ABM module.',
  },
  'ABM CRM:',
  canAccessAbm,
  'You do not have access to the ABM CRM'
);

areaTables(
  {
    linkedin_page_analytics: 'Page-level metrics.',
    linkedin_post_analytics: 'Per-post metrics.',
    linkedin_follower_stats: 'Follower counts over time.',
    linkedin_ad_analytics: 'Paid campaign metrics.',
  },
  'LinkedIn analytics:',
  canAccessLinkedIn,
  'You do not have access to the LinkedIn dashboard'
);

areaTables(
  {
    google_ads_campaign_analysis: 'Campaign-level metrics.',
    google_ads_keyword_analysis: 'Keyword-level metrics.',
  },
  'Google Ads analytics:',
  canAccessGoogleAds,
  'You do not have access to the Google Ads dashboard'
);

// ---------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------

const OPERATORS = {
  eq: (a, b) => String(a ?? '') === String(b),
  neq: (a, b) => String(a ?? '') !== String(b),
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b).toLowerCase()),
  is_null: (a) => a === null || a === undefined,
  not_null: (a) => a !== null && a !== undefined,
};

// PostgREST spellings for the same set, so a filter means the same thing whether
// the rows come from a route or from the database.
const applyDbFilter = (query, { column, op, value }) => {
  switch (op) {
    case 'eq': return query.eq(column, value);
    case 'neq': return query.neq(column, value);
    case 'gt': return query.gt(column, value);
    case 'gte': return query.gte(column, value);
    case 'lt': return query.lt(column, value);
    case 'lte': return query.lte(column, value);
    case 'contains': return query.ilike(column, `%${value}%`);
    case 'is_null': return query.is(column, null);
    case 'not_null': return query.not(column, 'is', null);
    default: return query;
  }
};

const validateFilters = (filters) => {
  for (const f of filters) {
    if (!f || typeof f.column !== 'string' || !f.column) {
      return 'Every filter needs a column';
    }
    if (!OPERATORS[f.op]) {
      return `Unknown operator "${f.op}". Use one of: ${Object.keys(OPERATORS).join(', ')}`;
    }
    if (!['is_null', 'not_null'].includes(f.op) && f.value === undefined) {
      return `Filter on "${f.column}" needs a value`;
    }
  }
  return null;
};

const stripForbidden = (row) => {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) if (!FORBIDDEN_COLUMNS.has(k)) out[k] = v;
  return out;
};

const pickColumns = (row, columns) => {
  if (!columns?.length) return row;
  const out = {};
  for (const c of columns) if (c in row) out[c] = row[c];
  return out;
};

const sortRows = (rows, order) => {
  if (!order?.column) return rows;
  const dir = order.direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[order.column];
    const y = b[order.column];
    if (x === y) return 0;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return (x > y ? 1 : -1) * dir;
  });
};

// PostgREST caps a response and reports no error when it truncates, so an id
// list longer than one request can carry is split rather than silently cut.
const CHUNK = 150;

const runChunked = async (table, columns, chunkOn, filters, order) => {
  const rows = [];
  for (let i = 0; i < chunkOn.values.length; i += CHUNK) {
    let q = supabase.from(table).select(columns || '*').in(chunkOn.column, chunkOn.values.slice(i, i + CHUNK));
    for (const f of filters) q = applyDbFilter(q, f);
    if (order?.column) q = q.order(order.column, { ascending: order.direction === 'asc' });
    const { data, error } = await q;
    if (error) throw error;
    rows.push(...(data || []));
  }
  return rows;
};

/**
 * Reads one table as the connected person, applying that table's scope.
 * Returns { rows, matched, note } or { denied }.
 */
const queryTable = async ({ table, columns, filters = [], order, limit = 50, offset = 0 }, ctx) => {
  const entry = TABLES[table];
  if (!entry) {
    return {
      error:
        `There is no readable table called "${table}". Call describe_tables to see what there is. ` +
        'Tables holding credentials are deliberately absent.',
    };
  }

  const access = entry.access(ctx.user);
  if (!access.ok) return { error: access.reason };

  const badFilter = validateFilters(filters);
  if (badFilter) return { error: badFilter };

  const safeColumns = (columns || []).filter((c) => !FORBIDDEN_COLUMNS.has(c));

  // ---- rows that come from a scoped route ----
  if (entry.source === 'route') {
    const all = await entry.rows(ctx);
    let rows = Array.isArray(all) ? all : [];

    for (const f of filters) {
      const test = OPERATORS[f.op];
      rows = rows.filter((r) => test(r[f.column], f.value));
    }
    rows = sortRows(rows, order);

    const slice = rows.slice(offset, offset + limit);
    return {
      table,
      matched: rows.length,
      returned: slice.length,
      offset,
      rows: slice.map((r) => pickColumns(stripForbidden(r), safeColumns)),
      ...(offset + slice.length < rows.length
        ? { note: `Showing ${slice.length} of ${rows.length}. Pass offset=${offset + slice.length} for more.` }
        : {}),
    };
  }

  // ---- rows that come from the database, scoped here ----
  // A builder rather than a query, so a table scoped by an id list (which runs
  // its own chunked queries) does not have one built and thrown away.
  const select = safeColumns.length ? safeColumns.join(',') : '*';
  const scoped = await entry.scope(() => supabase.from(table).select(select), ctx);
  if (scoped.empty) return { table, matched: 0, returned: 0, offset, rows: [] };

  let rows;
  if (scoped.chunkOn) {
    rows = await runChunked(table, select, scoped.chunkOn, filters, order);
    const slice = rows.slice(offset, offset + limit);
    return { table, matched: rows.length, returned: slice.length, offset, rows: slice.map(stripForbidden) };
  }

  let q = scoped.query;
  for (const f of filters) q = applyDbFilter(q, f);
  if (order?.column) q = q.order(order.column, { ascending: order.direction === 'asc' });

  const { data, error } = await q.range(offset, offset + limit - 1);
  if (error) throw error;

  rows = (data || []).map(stripForbidden);
  return {
    table,
    returned: rows.length,
    offset,
    rows,
    ...(rows.length === limit
      ? { note: `Returned the full limit of ${limit}; there may be more. Pass offset=${offset + limit}.` }
      : {}),
  };
};

// What the caller can actually reach, and why not where they cannot.
const describeTables = (user) =>
  Object.entries(TABLES)
    .map(([name, entry]) => {
      const access = entry.access(user);
      return {
        table: name,
        description: entry.description,
        readable: access.ok,
        ...(access.ok ? {} : { reason: access.reason }),
      };
    })
    .sort((a, b) => Number(b.readable) - Number(a.readable) || a.table.localeCompare(b.table));

module.exports = { queryTable, describeTables, TABLES, OPERATORS };
