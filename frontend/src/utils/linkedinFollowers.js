// Follower and page-view series for the LinkedIn dashboard.
//
// linkedin_follower_stats holds one row per page per day, but only on the days
// something wrote it: somebody pressing Sync, the daily auto-sync, or an import
// of LinkedIn's follower export. Pages also start being tracked on different
// days. Adding rows up date by date therefore gives a sawtooth whenever one
// page has a row and another does not, and "last row minus first row" mixes
// pages. Everything here works per page on a full calendar first, and only
// then adds the pages together.
//
// Row kinds, told apart by their columns:
//   sync row    total_followers = the page's follower count that day,
//               organic_followers = total, paid_followers = 0 (LinkedIn's API
//               gives no organic/paid split of the total).
//   import row  total_followers = anchored running total, organic_followers and
//               paid_followers = running sums of new followers since the start
//               of the export. Their day-to-day differences are the real
//               organic / sponsored gains LinkedIn reported.

const DAY_MS = 86_400_000;

export function localISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}

const dayNum = (isoDate) => Math.round(Date.UTC(+isoDate.slice(0, 4), +isoDate.slice(5, 7) - 1, +isoDate.slice(8, 10)) / DAY_MS);
const numDay = (n) => new Date(n * DAY_MS).toISOString().slice(0, 10);

export function isImportRow(r) {
  const total = r.total_followers || 0;
  const organic = r.organic_followers || 0;
  return total > 0 && organic > 0 && organic < total * 0.8;
}

// One sorted list of points per page; duplicates on a date keep the higher total.
function groupByOrg(rows) {
  const orgs = new Map();
  for (const r of rows || []) {
    if (!r?.date || !r.org_id) continue;
    if (!orgs.has(r.org_id)) orgs.set(r.org_id, new Map());
    const byDate = orgs.get(r.org_id);
    const cur = byDate.get(r.date);
    if (!cur || (r.total_followers || 0) > (cur.total_followers || 0)) byDate.set(r.date, r);
  }
  const out = new Map();
  for (const [orgId, byDate] of orgs) {
    const pts = [...byDate.values()]
      .map((r) => ({
        n: dayNum(r.date),
        total: r.total_followers || 0,
        organic: isImportRow(r) ? r.organic_followers || 0 : null,
        paid: isImportRow(r) ? r.paid_followers || 0 : null,
      }))
      .sort((a, b) => a.n - b.n);
    out.set(orgId, pts);
  }
  return out;
}

// Value of `field` on day n: linear between the neighbouring points, carried
// forward after the last point, null before the first. Points with a null
// field are ignored. `cursor` is advanced by the caller so a sweep is linear.
function valueAt(pts, field, n, carryForward) {
  let before = null;
  let after = null;
  for (const p of pts) {
    if (p[field] === null || p[field] === undefined) continue;
    if (p.n <= n) before = p;
    if (p.n >= n) { after = p; break; }
  }
  if (!before && !after) return null;
  if (!before) return null;
  if (!after) return carryForward ? before[field] : null;
  if (after.n === before.n) return before[field];
  const t = (n - before.n) / (after.n - before.n);
  return Math.round(before[field] + t * (after[field] - before[field]));
}

/**
 * Daily series across the given pages.
 * @param rows   raw linkedin_follower_stats rows (any number of pages)
 * @param opts   { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } inclusive; defaults to
 *               the earliest row and today.
 * @returns [{ date, total, newFollowers, organic, paid, isSynced, pages }]
 *   total         followers across pages that have data that day (null if none)
 *   newFollowers  followers gained that day (sum of per-page day-to-day change;
 *                 a page's first day of data does not count as a gain)
 *   organic/paid  gains that day from imported LinkedIn exports, null if the
 *                 day is outside every page's imported range
 *   isSynced      at least one page has a real row that day (not estimated)
 */
export function followerSeries(rows, { from, to } = {}) {
  const orgs = groupByOrg(rows);
  if (!orgs.size) return [];
  let first = Infinity;
  for (const pts of orgs.values()) first = Math.min(first, pts[0].n);
  const start = from ? dayNum(from) : first;
  const end = to ? dayNum(to) : dayNum(localISO());
  if (end < start) return [];

  // Per page, values from the day before `start` so the first day has a delta.
  const perOrg = [];
  for (const pts of orgs.values()) {
    const real = new Set(pts.map((p) => p.n));
    const totals = [];
    const organic = [];
    const paid = [];
    for (let n = start - 1; n <= end; n++) {
      totals.push(valueAt(pts, "total", n, true));
      organic.push(valueAt(pts, "organic", n, false));
      paid.push(valueAt(pts, "paid", n, false));
    }
    perOrg.push({ totals, organic, paid, real });
  }

  const out = [];
  for (let n = start, i = 1; n <= end; n++, i++) {
    let total = null;
    let gained = 0;
    let org = null;
    let pd = null;
    let pages = 0;
    let synced = false;
    for (const o of perOrg) {
      const t = o.totals[i];
      if (t !== null) {
        total = (total || 0) + t;
        pages++;
        const prev = o.totals[i - 1];
        if (prev !== null) gained += t - prev;
      }
      if (o.organic[i] !== null && o.organic[i - 1] !== null) org = (org || 0) + Math.max(0, o.organic[i] - o.organic[i - 1]);
      if (o.paid[i] !== null && o.paid[i - 1] !== null) pd = (pd || 0) + Math.max(0, o.paid[i] - o.paid[i - 1]);
      if (o.real.has(n)) synced = true;
    }
    out.push({ date: numDay(n), total, newFollowers: gained, organic: org, paid: pd, isSynced: synced, pages });
  }
  return out;
}

export function sumNew(series) {
  return (series || []).reduce((s, d) => s + (d.newFollowers || 0), 0);
}

export function lastTotal(series) {
  for (let i = (series || []).length - 1; i >= 0; i--) if (series[i].total !== null) return series[i].total;
  return 0;
}

// Net gain and closing total per calendar month.
export function monthlyNet(series) {
  const months = new Map();
  for (const d of series || []) {
    const m = d.date.slice(0, 7);
    if (!months.has(m)) months.set(m, { month: m, net: 0, end: null });
    const row = months.get(m);
    row.net += d.newFollowers || 0;
    if (d.total !== null) row.end = d.total;
  }
  return [...months.values()];
}

/**
 * Page views per day, estimated from the page-view counter LinkedIn reports at
 * each sync. The counter is a running total, so the views between two syncs
 * are the difference, spread evenly over the days in between. LinkedIn's
 * counter covers a rolling window and can tick down; a negative difference
 * counts as zero.
 * @returns [{ date, pageViews, asOf }]  pageViews null before the first sync
 *          or after the last one; asOf = the counter as last reported
 */
export function pageViewSeries(rows, { from, to } = {}) {
  const orgs = new Map();
  for (const r of rows || []) {
    if (!r?.date || !r.org_id) continue;
    if (!orgs.has(r.org_id)) orgs.set(r.org_id, new Map());
    orgs.get(r.org_id).set(r.date, r.page_views || 0);
  }
  if (!orgs.size) return [];
  let first = Infinity;
  const perOrg = [];
  for (const byDate of orgs.values()) {
    const pts = [...byDate.entries()].map(([d, v]) => ({ n: dayNum(d), v })).sort((a, b) => a.n - b.n);
    first = Math.min(first, pts[0].n);
    perOrg.push(pts);
  }
  const start = from ? dayNum(from) : first;
  const end = to ? dayNum(to) : dayNum(localISO());
  if (end < start) return [];

  const out = [];
  for (let n = start; n <= end; n++) {
    let views = null;
    let asOf = null;
    for (const pts of perOrg) {
      let before = null;
      let after = null;
      for (const p of pts) {
        if (p.n < n) before = p;
        if (p.n >= n) { after = p; break; }
      }
      const last = after && after.n === n ? after : before;
      if (last) asOf = (asOf || 0) + last.v;
      if (before && after) {
        const gap = after.n - before.n;
        views = (views || 0) + Math.max(0, after.v - before.v) / gap;
      }
    }
    out.push({ date: numDay(n), pageViews: views === null ? null : Math.round(views * 100) / 100, asOf });
  }
  return out;
}

export function sumPageViews(series) {
  return Math.round((series || []).reduce((s, d) => s + (d.pageViews || 0), 0));
}
