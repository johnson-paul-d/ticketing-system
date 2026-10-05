// =====================================================
// Bring stored ticket categories onto the canonical lists
// =====================================================
// The per-team category lists (utils/categories.js) have been enforced on new
// tickets since August 2026. Tickets raised before that still carry whatever
// was typed: "ANIMATION VIDEO", "graphic design", "Graphic Design", "Expo",
// "Other". Every dashboard and report groups on the stored string, so each of
// those shows up as a category of its own, and a recurring ticket copies its
// legacy name into every new occurrence.
//
// This renames them, once. It runs at start-up and is safe to run again: a
// ticket already on its team's list is not touched, so after the first pass
// there is nothing left to do. What it changes:
//
//   - a legacy or differently cased name that maps to a canonical one for the
//     ticket's team is replaced by the canonical name;
//   - an empty string is stored as "no category" (null), the one representation.
//
// What it leaves alone, and logs: a name this team has no category for (for
// instance another team's category left behind by a reassignment). Guessing
// there would be inventing data. Tickets with no category stay uncategorised.
//
// Every rename is written into the ticket's own timeline, so the old name is
// never lost and a change can be traced or put back by hand.

const supabase = require('../config/supabase');
const { TEAM, teamFromRole } = require('../utils/roles');
const { standardStored } = require('../utils/categories');
const getISTTime = require('../utils/time');

const PAGE = 1000;

// One exception to the table: "Digital Marketing" held both search-engine work
// and ad campaigns. The team files SEO under Website and campaigns under
// Campaign, so the title decides.
const refine = (ticket, team, target) => {
  if (team !== TEAM.SERVICE && /^\s*digital marketing\s*$/i.test(ticket.category || '') && /\bseo\b/i.test(ticket.title || '')) {
    return 'Website';
  }
  return target;
};

const fetchAll = async (table, columns, build = (q) => q) => {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(supabase.from(table).select(columns)).order('id', { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message || error.code || `could not read ${table}`);
    out.push(...(data || []));
    if (!data || data.length < PAGE) return out;
  }
};

/**
 * Works out what would change, without changing anything.
 * @returns {{ changes: Array, unknown: Array, checked: number }}
 */
const plan = async () => {
  const [tickets, users] = await Promise.all([
    fetchAll('tickets', 'id, title, category, assigned_to, created_by', (q) => q.not('category', 'is', null)),
    fetchAll('users', 'id, role'),
  ]);
  const roleOf = new Map(users.map((u) => [u.id, u.role]));
  // The same rule as utils/ticketTeam.js: the assignee's team, else the
  // creator's, else Marketing. Where Marketing is only that default, a name on
  // the Service list is left alone rather than read as a Marketing legacy name.
  const knownTeam = (t) => teamFromRole(roleOf.get(t.assigned_to)) || teamFromRole(roleOf.get(t.created_by)) || null;

  const changes = [];
  const unknown = [];
  for (const t of tickets) {
    const known = knownTeam(t);
    const team = known || TEAM.MARKETING;
    const std = standardStored(team, t.category, Boolean(known));
    if (!std.ok) {
      unknown.push({ id: t.id, title: t.title, team, category: t.category });
      continue;
    }
    const target = refine(t, team, std.value);
    if (target !== t.category) changes.push({ id: t.id, title: t.title, team, from: t.category, to: target });
  }
  return { changes, unknown, checked: tickets.length };
};

/**
 * Applies the plan. Each ticket is updated on the condition that its category
 * is still the one the plan saw, so an edit made in between is not overwritten.
 */
const apply = async (changes) => {
  let done = 0;
  for (const c of changes) {
    const { data: row, error: readErr } = await supabase.from('tickets').select('id, category, timeline').eq('id', c.id).maybeSingle();
    if (readErr || !row || row.category !== c.from) continue;
    const timeline = Array.isArray(row.timeline) ? [...row.timeline] : [];
    // An empty string becoming "no category" is housekeeping, not a rename.
    if (c.from) {
      timeline.push({
        type: 'category',
        action: `Category standardised from "${c.from}" to "${c.to ?? 'none'}"`,
        user: 'System',
        created_at: getISTTime(),
      });
    }
    const { data: updated, error } = await supabase
      .from('tickets')
      .update({ category: c.to, timeline })
      .eq('id', c.id)
      .eq('category', c.from)
      .select('id');
    if (error) {
      console.error(`Category standardise: ticket ${c.id} not updated:`, error.message || error.code);
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
  if (String(process.env.CATEGORY_STANDARDISE || '').toLowerCase() === 'off') return;
  try {
    const r = await run({ write: true });
    if (r.changes.length) {
      console.log(
        `Ticket categories: standardised ${r.applied} of ${r.changes.length} ticket(s): ` +
          summarise(r.changes.filter((c) => c.from), (c) => `"${c.from}" -> "${c.to}"`)
      );
    }
    if (r.unknown.length) {
      console.log(
        `Ticket categories: ${r.unknown.length} ticket(s) carry a name their team has no category for, left as they are: ` +
          summarise(r.unknown, (u) => `"${u.category}" on ${u.team}`)
      );
    }
  } catch (err) {
    console.error('Ticket categories: could not standardise stored values:', err.message || err);
  }
};

module.exports = { plan, apply, run, standardiseOnBoot };
