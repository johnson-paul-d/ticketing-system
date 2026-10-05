// =====================================================
// Bring stored divisions onto the list
// =====================================================
// Tickets took a division as free text until the list (utils/divisions.js) was
// enforced, so the column still holds what the first ticket form wrote: "ALL"
// where the list says "All User". Every report groups on the stored string,
// so "ALL" and "All User" show up as two divisions. And a project's tasks are
// meant to carry the project's division, but tasks added before the project
// was given one have none.
//
// This puts both right, once. It runs at start-up and is safe to run again: a
// record already on the list is not touched, so after the first pass there is
// nothing left to do. What it changes:
//
//   - a division spelt differently from the list (letter case, spacing, or an
//     old spelling the list knows) is replaced by the list's spelling, on
//     tickets, projects and users;
//   - an empty string is stored as "no division" (null);
//   - a ticket with no division that belongs to a project takes the project's.
//
// What it leaves alone, and logs: a value that is not a division at all.
// Guessing there would be inventing data. A ticket with no division and no
// project stays as it is. Expense claims are not touched: their division has
// been validated since the column was added.
//
// Every change to a ticket is written into its timeline, so the old value is
// never lost and a change can be traced or put back by hand.

const supabase = require('../config/supabase');
const { standardDivision } = require('../utils/divisions');
const getISTTime = require('../utils/time');

const PAGE = 1000;

const fetchAll = async (table, columns) => {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(columns).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message || error.code || `could not read ${table}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
};

const none = (value) => value === null || value === undefined;

/**
 * Works out what would change, without changing anything.
 * @returns {{ changes: Array, unknown: Array, checked: number }}
 *   changes: { table, id, label, from, to, inherited }
 */
const plan = async () => {
  const [tickets, projects, users] = await Promise.all([
    fetchAll('tickets', 'id, title, division, project_id'),
    fetchAll('projects', 'id, name, division'),
    fetchAll('users', 'id, name, division'),
  ]);

  const changes = [];
  const unknown = [];

  // The list's spelling for a stored value: undefined when it is not a division.
  const listed = (table, row, label) => {
    const std = standardDivision(row.division);
    if (!std.ok) {
      unknown.push({ table, id: row.id, label, division: row.division });
      return undefined;
    }
    if (std.value !== row.division && !(none(std.value) && none(row.division))) {
      changes.push({ table, id: row.id, label, from: row.division, to: std.value, inherited: false });
    }
    return std.value;
  };

  const projectDivision = new Map();
  for (const p of projects) projectDivision.set(p.id, listed('projects', p, p.name));
  for (const u of users) listed('users', u, u.name);

  for (const t of tickets) {
    const own = listed('tickets', t, t.title);
    if (own !== null || !t.project_id) continue;
    // No division of its own: a task carries its project's.
    const fromProject = projectDivision.get(t.project_id);
    if (!fromProject) continue;
    const pending = changes.find((c) => c.table === 'tickets' && c.id === t.id);
    if (pending) Object.assign(pending, { to: fromProject, inherited: true });
    else changes.push({ table: 'tickets', id: t.id, label: t.title, from: t.division, to: fromProject, inherited: true });
  }

  return { changes, unknown, checked: tickets.length + projects.length + users.length };
};

// The row is updated on the condition that its division is still the one the
// plan saw, so an edit made in between is not overwritten.
const stillAt = (query, from) => (none(from) ? query.is('division', null) : query.eq('division', from));

/**
 * Applies the plan.
 */
const apply = async (changes) => {
  let done = 0;
  for (const c of changes) {
    const patch = { division: c.to };
    if (c.table === 'tickets') {
      const { data: row, error: readErr } = await supabase.from('tickets').select('id, division, timeline').eq('id', c.id).maybeSingle();
      if (readErr || !row || (row.division ?? null) !== (c.from ?? null)) continue;
      // An empty string becoming "no division" is housekeeping, not a change.
      if (c.to) {
        patch.timeline = [
          ...(Array.isArray(row.timeline) ? row.timeline : []),
          {
            type: 'division',
            action: c.inherited
              ? `Division set to "${c.to}", the division of its project`
              : `Division standardised from "${c.from}" to "${c.to}"`,
            user: 'System',
            created_at: getISTTime(),
          },
        ];
      }
    }
    const { data: updated, error } = await stillAt(supabase.from(c.table).update(patch).eq('id', c.id), c.from).select('id');
    if (error) {
      console.error(`Division standardise: ${c.table} ${c.id} not updated:`, error.message || error.code);
      continue;
    }
    if (updated?.length) done += 1;
  }
  return done;
};

const summarise = (rows, key) => {
  const counts = new Map();
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) || 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${k} (${n})`).join(', ');
};

const run = async ({ write = false } = {}) => {
  const p = await plan();
  const applied = write && p.changes.length ? await apply(p.changes) : 0;
  return { ...p, applied };
};

// Start-up hook. Never throws: a failure here must not stop the server.
const standardiseOnBoot = async () => {
  if (String(process.env.DIVISION_STANDARDISE || '').toLowerCase() === 'off') return;
  try {
    const r = await run({ write: true });
    const visible = r.changes.filter((c) => c.to);
    if (r.changes.length) {
      console.log(
        `Divisions: standardised ${r.applied} of ${r.changes.length} record(s)` +
          (visible.length
            ? ': ' +
              summarise(visible, (c) =>
                c.inherited ? `${c.table} given their project's "${c.to}"` : `${c.table} "${c.from}" -> "${c.to}"`
              )
            : '')
      );
    }
    if (r.unknown.length) {
      console.log(
        `Divisions: ${r.unknown.length} record(s) carry a value that is not a division, left as they are: ` +
          summarise(r.unknown, (u) => `"${u.division}" on ${u.table}`)
      );
    }
  } catch (err) {
    console.error('Divisions: could not standardise stored values:', err.message || err);
  }
};

module.exports = { plan, apply, run, standardiseOnBoot };
