// =====================================================
// The work record behind a report
// =====================================================
// One place that decides what "work done in this period" means, so the personal
// deck and the team deck can never disagree about a number.

const supabase = require('../config/supabase');
const { isSuperAdmin, isAdmin, getUserTeam, teamFromRole } = require('../utils/roles');

// PostgREST caps a response at 1000 rows without saying so. Every listing pages
// by a stable key rather than trusting one call to have returned everything.
const allRows = async (build, key = 'id') => {
  const out = [];
  let last = null;
  for (;;) {
    let q = build();
    if (last) q = q.gt(key, last);
    const { data, error } = await q.order(key, { ascending: true }).limit(1000);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < 1000) break;
    last = data[data.length - 1][key];
  }
  return out;
};

const chunked = async (build, ids, size = 150) => {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await build(ids.slice(i, i + size));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
};

// The table holds "medium", "MID", "HIGH" and blanks side by side. Reporting
// those as distinct priorities would invent a distinction nobody made.
const normalisePriority = (value) => {
  const p = String(value || '').trim().toLowerCase();
  if (!p) return 'Unset';
  if (p.startsWith('crit')) return 'Critical';
  if (p.startsWith('h')) return 'High';
  if (p.startsWith('l')) return 'Low';
  if (p.startsWith('m')) return 'Medium';
  return 'Unset';
};

const isDone = (status) => /^(completed|closed)$/i.test(String(status || '').trim());
const dayOf = (value) => (value ? String(value).slice(0, 10) : null);

const tally = (rows, pick) => {
  const m = new Map();
  for (const r of rows) {
    const k = pick(r);
    if (k == null || k === '') continue;
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([label, count]) => ({ label, count }));
};

const round1 = (n) => Math.round(n * 10) / 10;
const hours = (minutes) => round1(Number(minutes || 0) / 60);

/**
 * Which date a ticket is filtered on.
 *
 * "created" answers "what landed on them in this period"; "due" answers "what
 * was supposed to be finished in it". They give materially different reports on
 * the same week, which is why the caller has to choose rather than inherit a
 * default silently.
 */
const DATE_FIELDS = {
  created: { column: 'created_at', label: 'Created date' },
  due: { column: 'due_date', label: 'Due date' },
};

const inWindow = (ticket, field, from, to) => {
  const value = dayOf(ticket[DATE_FIELDS[field].column]);
  if (!value) return false; // a ticket with no due date cannot fall in a due-date window
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
};

/**
 * Everything one person's report needs, for one window.
 *
 * `reference` is the day the report is run — passed in rather than read from the
 * clock here so every person in a team deck is measured against the same today.
 */
const buildPersonRecord = (person, tickets, entriesByTicket, projects, reference) => {
  const done = tickets.filter((t) => isDone(t.status));
  const open = tickets.filter((t) => !isDone(t.status));

  // Timeliness is only meaningful where both dates exist. Anything else is
  // excluded rather than quietly counted as a miss.
  const judged = done.filter((t) => t.due_date && t.completed_date);
  const onTime = judged.filter((t) => dayOf(t.completed_date) <= dayOf(t.due_date));
  const overdueOpen = open.filter((t) => t.due_date && dayOf(t.due_date) < reference);

  const minutesLogged = tickets.reduce(
    (n, t) => n + (entriesByTicket.get(t.id) || []).reduce((m, e) => m + Number(e.duration_minutes || 0), 0),
    0
  );
  const minutesPlanned = tickets.reduce((n, t) => n + Number(t.allotted_minutes || 0), 0);
  const withPlan = tickets.filter((t) => Number(t.allotted_minutes) > 0);
  const ticketsWithTime = tickets.filter((t) => (entriesByTicket.get(t.id) || []).length > 0);

  // Planned vs actual, restricted to the tickets that carry both a budget and
  // logged time. Comparing across tickets that have only one of the two would
  // report a shortfall that is really a recording gap.
  const comparable = tickets.filter(
    (t) => Number(t.allotted_minutes) > 0 && (entriesByTicket.get(t.id) || []).length > 0
  );
  const comparablePlanned = comparable.reduce((n, t) => n + Number(t.allotted_minutes || 0), 0);
  const comparableActual = comparable.reduce(
    (n, t) => n + (entriesByTicket.get(t.id) || []).reduce((m, e) => m + Number(e.duration_minutes || 0), 0),
    0
  );

  // Per-ticket planned vs actual, biggest first — the rows worth talking about
  // in a review.
  const plannedVsActual = comparable
    .map((t) => ({
      title: t.title || '(untitled)',
      plannedHours: hours(t.allotted_minutes),
      actualHours: hours(
        (entriesByTicket.get(t.id) || []).reduce((m, e) => m + Number(e.duration_minutes || 0), 0)
      ),
      status: t.status || 'Unset',
    }))
    .sort((a, b) => b.plannedHours + b.actualHours - (a.plannedHours + a.actualHours))
    .slice(0, 8);

  const completedRecent = done
    .filter((t) => t.title)
    .sort((a, b) => String(b.completed_date || '').localeCompare(String(a.completed_date || '')))
    .slice(0, 8)
    .map((t) => ({
      title: t.title,
      division: t.division || null,
      priority: normalisePriority(t.priority),
      completedDate: dayOf(t.completed_date),
      dueDate: dayOf(t.due_date),
      onTime: t.due_date && t.completed_date ? dayOf(t.completed_date) <= dayOf(t.due_date) : null,
    }));

  const memberProjects = projects.filter(
    (p) => p.owner === person.id || (Array.isArray(p.members) && p.members.includes(person.id))
  );

  return {
    person: {
      id: person.id,
      name: person.name,
      role: person.role,
      designation: person.designation || null,
      division: person.division || null,
    },
    totals: {
      assigned: tickets.length,
      completed: done.length,
      open: open.length,
      inProgress: tickets.filter((t) => /in progress/i.test(String(t.status || ''))).length,
      overdueOpen: overdueOpen.length,
      completionRate: tickets.length ? Math.round((done.length / tickets.length) * 100) : 0,
      onTime: onTime.length,
      judged: judged.length,
      onTimeRate: judged.length ? Math.round((onTime.length / judged.length) * 100) : null,
      hoursLogged: hours(minutesLogged),
      hoursPlanned: hours(minutesPlanned),
      ticketsWithPlan: withPlan.length,
      ticketsWithTime: ticketsWithTime.length,
      // Coverage for both cuts. Neither can be assumed better than the other —
      // in real data division is often as patchy as category, and a chart
      // captioned "the more reliable cut" without checking would be a lie.
      categorised: tickets.filter((t) => t.category).length,
      divisioned: tickets.filter((t) => t.division).length,
      comparableCount: comparable.length,
      comparablePlannedHours: hours(comparablePlanned),
      comparableActualHours: hours(comparableActual),
    },
    byStatus: tally(tickets, (t) => String(t.status || '').trim() || 'Unset'),
    byCategory: tally(tickets, (t) => t.category),
    byDivision: tally(tickets, (t) => t.division),
    byPriority: tally(tickets, (t) => normalisePriority(t.priority)),
    plannedVsActual,
    completedRecent,
    projects: memberProjects.map((p) => ({
      name: p.name,
      status: p.status,
      division: p.division,
      targetDate: dayOf(p.target_date),
      owner: p.owner === person.id,
    })),
  };
};

/**
 * Work still ahead of this person.
 *
 * Deliberately NOT filtered by the report window: a report on last week that
 * silently hid next week's commitments would be answering a question nobody
 * asked. This is always "open, due from the reference day onward".
 */
const buildUpcoming = (tickets, reference) =>
  tickets
    .filter((t) => !isDone(t.status) && t.due_date && dayOf(t.due_date) >= reference)
    .sort((a, b) => dayOf(a.due_date).localeCompare(dayOf(b.due_date)))
    .slice(0, 10)
    .map((t) => ({
      title: t.title || '(untitled)',
      dueDate: dayOf(t.due_date),
      status: t.status || 'Unset',
      priority: normalisePriority(t.priority),
      division: t.division || null,
      plannedHours: Number(t.allotted_minutes) > 0 ? hours(t.allotted_minutes) : null,
      daysAway: Math.round(
        (new Date(`${dayOf(t.due_date)}T00:00:00Z`) - new Date(`${reference}T00:00:00Z`)) / 86400000
      ),
    }));

/**
 * Assembles a report for one person, or for a whole team.
 *
 * @param {object} viewer      the authenticated caller
 * @param {object} opts
 * @param {'me'|'person'|'team'} opts.scope
 * @param {string} [opts.userId]  required when scope is 'person'
 * @param {string} [opts.from]    YYYY-MM-DD, inclusive
 * @param {string} [opts.to]      YYYY-MM-DD, inclusive
 * @param {'created'|'due'} [opts.dateField]
 * @param {string} opts.reference today, as YYYY-MM-DD
 */
const buildReport = async (viewer, opts) => {
  const { scope, userId, from, to, reference } = opts;
  const dateField = DATE_FIELDS[opts.dateField] ? opts.dateField : 'created';

  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, name, email, role, division, designation, active');
  if (userError) throw userError;

  // Who this report is allowed to cover. A plain user only ever gets
  // themselves — the route checks this too, but the data layer must not be
  // capable of assembling something the caller may not see.
  let subjects;
  if (scope === 'team') {
    if (!isAdmin(viewer)) {
      const err = new Error('Only an admin can run a team report');
      err.status = 403;
      throw err;
    }
    subjects = users.filter(
      (u) => u.active && (isSuperAdmin(viewer) || teamFromRole(u.role) === getUserTeam(viewer))
    );
  } else if (scope === 'person') {
    const target = users.find((u) => u.id === userId);
    if (!target) {
      const err = new Error('User not found');
      err.status = 404;
      throw err;
    }
    const mayView =
      target.id === viewer.id ||
      isSuperAdmin(viewer) ||
      (isAdmin(viewer) && teamFromRole(target.role) === getUserTeam(viewer));
    if (!mayView) {
      const err = new Error("You can only report on people on your own team");
      err.status = 403;
      throw err;
    }
    subjects = [target];
  } else {
    const me = users.find((u) => u.id === viewer.id);
    if (!me) {
      const err = new Error('Your account could not be found');
      err.status = 404;
      throw err;
    }
    subjects = [me];
  }

  const ids = subjects.map((u) => u.id);
  const tickets = (
    await chunked((chunk) => supabase.from('tickets').select('*').in('assigned_to', chunk), ids)
  ).filter((t) => !t.deleted);

  const windowed = tickets.filter((t) => inWindow(t, dateField, from, to));

  const entries = windowed.length
    ? await chunked(
        (chunk) =>
          supabase
            .from('ticket_time_entries')
            .select('ticket_id, duration_minutes, work_date')
            .in('ticket_id', chunk),
        windowed.map((t) => t.id)
      )
    : [];
  const entriesByTicket = new Map();
  for (const e of entries) {
    if (!entriesByTicket.has(e.ticket_id)) entriesByTicket.set(e.ticket_id, []);
    entriesByTicket.get(e.ticket_id).push(e);
  }

  const projects = await allRows(() =>
    supabase.from('projects').select('id, name, status, target_date, division, members, owner')
  );

  const people = subjects
    .map((u) => {
      const mine = windowed.filter((t) => t.assigned_to === u.id);
      const record = buildPersonRecord(u, mine, entriesByTicket, projects, reference);
      // Upcoming comes from the unwindowed set on purpose — see buildUpcoming.
      record.upcoming = buildUpcoming(
        tickets.filter((t) => t.assigned_to === u.id),
        reference
      );
      return record;
    })
    // A team deck reads best with the busiest people first; an empty slide for
    // someone with no work in the window is noise, so they are dropped.
    .filter((r) => scope !== 'team' || r.totals.assigned > 0)
    .sort((a, b) => b.totals.assigned - a.totals.assigned);

  return {
    scope,
    generatedOn: reference,
    window: { from: from || null, to: to || null, dateField, dateFieldLabel: DATE_FIELDS[dateField].label },
    viewer: { name: viewer.name, role: viewer.role },
    team: scope === 'team' ? getUserTeam(viewer) || 'All teams' : null,
    people,
  };
};

module.exports = { buildReport, DATE_FIELDS };
