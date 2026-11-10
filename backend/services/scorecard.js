// =====================================================
// Quality scorecard
// =====================================================
// One score per completed task, out of 100, from five parts:
//
//   On time               35%  automatic: the day the accepted work was submitted
//                              against the approved due date
//   First-time pass       25%  automatic: how often the work was sent back
//   Accuracy              20%  the reviewer's 1–5 stars
//   Quality               10%  the reviewer's 1–5 stars
//   Within time allowed   10%  automatic: time logged against the time allotted;
//                              full marks when no time was allotted or logged
//
// Submission is the moment the person asked for the version that was finally
// approved, so time spent waiting for the reviewer never counts as lateness.
// A send-back marked as a scope change is not a correction. The reviewer can
// correct any automatic input (completed date, times sent back, time taken,
// time allowed); the history keeps what was changed and by whom. A part that
// cannot be worked out yet (no due date, not approved, not rated) leaves the
// task pending rather than scoring zero, and a task's score is published only
// when all five parts are in.
//
// Only the reviewer (SCORECARD_REVIEWERS, Ram by default) sees or changes any
// of this; the ratings live in ticket_scores, apart from the ticket rows their
// assignees can read.

const supabase = require('../config/supabase');
const { IST_OFFSET_MINUTES, todayIST } = require('../utils/time');
const { isAdmin, isSuperAdmin, getUserTeam, teamFromRole, TEAM } = require('../utils/roles');

const WEIGHTS = { onTime: 35, firstPass: 25, accuracy: 20, quality: 10, withinTime: 10 };
const PARTS = [
  { key: 'onTime', label: 'On time', auto: true },
  { key: 'firstPass', label: 'First-time pass', auto: true },
  { key: 'accuracy', label: 'Accuracy', auto: false },
  { key: 'quality', label: 'Quality', auto: false },
  { key: 'withinTime', label: 'Within time allowed', auto: true },
];

// The reviewer rates work completed on or after this day. Earlier work still
// shows on the scorecard with its automatic results (on time, first-time pass,
// time), but is never rated, so the reviewer is not asked to rate a backlog.
const ratingFrom = () => process.env.SCORECARD_FROM || '2026-10-02';

const reviewerEmails = () =>
  (process.env.SCORECARD_REVIEWERS || 'ramenaathan@siegerglobal.net')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const isReviewer = (user) =>
  Boolean(user?.email) &&
  isAdmin(user) &&
  reviewerEmails().includes(String(user.email).trim().toLowerCase());

// ---------- dates (calendar days in IST, as YYYY-MM-DD) ----------

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Timeline instants are UTC; the day that matters is the one in India.
const istDay = (value) => {
  if (!value) return null;
  const s = String(value);
  if (DAY.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + IST_OFFSET_MINUTES * 60000).toISOString().slice(0, 10);
};

const addDays = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const daysBetween = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const fmtDay = (day) => (day ? `${Number(day.slice(8, 10))} ${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}` : '');
const monthLabel = (ym) => `${MONTHS_LONG[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

const lastOfMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const prevMonth = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
};
const monthsBetween = (a, b) =>
  (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const monthSpanLabel = (a, b) => {
  const short = (ym) => MONTHS[Number(ym.slice(5, 7)) - 1];
  return a.slice(0, 4) === b.slice(0, 4)
    ? `${short(a)} – ${short(b)} ${b.slice(0, 4)}`
    : `${short(a)} ${a.slice(0, 4)} – ${short(b)} ${b.slice(0, 4)}`;
};
const mondayOf = (day) => addDays(day, -((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7));

const weekLabel = (from, to) =>
  from.slice(0, 7) === to.slice(0, 7)
    ? `${Number(from.slice(8, 10))}–${fmtDay(to)}`
    : `${fmtDay(from).replace(/ \d{4}$/, '')} – ${fmtDay(to)}`;

// The window a scorecard covers, and the one before it for comparison.
// key: this-week | last-week | this-month | last-month | YYYY-MM | YYYY-MM..YYYY-MM
function periodRange(key = 'this-month', today = todayIST()) {
  if (key === 'this-week' || key === 'last-week') {
    const thisMonday = mondayOf(today);
    const from = key === 'this-week' ? thisMonday : addDays(thisMonday, -7);
    const to = key === 'this-week' ? today : addDays(from, 6);
    const prevFrom = addDays(from, -7);
    return {
      key, kind: 'week', from, to,
      label: key === 'this-week' ? 'This week' : 'Last week',
      range: weekLabel(from, addDays(from, 6)),
      prev: { from: prevFrom, to: addDays(prevFrom, 6), label: 'the week before' },
    };
  }
  // A run of whole months, "YYYY-MM..YYYY-MM", compared with the same number
  // of months just before it.
  const span = /^(\d{4}-\d{2})\.\.(\d{4}-\d{2})$/.exec(key);
  if (span) {
    const [a, b] = [span[1], span[2]].sort();
    if (a !== b) {
      const months = monthsBetween(a, b) + 1;
      const end = lastOfMonth(b);
      let pa = a;
      for (let i = 0; i < months; i++) pa = prevMonth(pa);
      const pb = prevMonth(a);
      return {
        key: `${a}..${b}`, kind: 'months', from: `${a}-01`, to: end > today ? today : end,
        label: `${months} months`,
        range: monthSpanLabel(a, b),
        prev: { from: `${pa}-01`, to: lastOfMonth(pb), label: monthSpanLabel(pa, pb) },
      };
    }
    key = a;
  }
  let ym = today.slice(0, 7);
  if (key === 'last-month') ym = prevMonth(ym);
  else if (/^\d{4}-\d{2}$/.test(key)) ym = key;
  const from = `${ym}-01`;
  const end = lastOfMonth(ym);
  const to = end > today ? today : end;
  const pm = prevMonth(ym);
  return {
    key, kind: 'month', from, to,
    label: key === 'this-month' ? 'This month' : key === 'last-month' ? 'Last month' : monthLabel(ym),
    range: monthLabel(ym),
    prev: { from: `${pm}-01`, to: lastOfMonth(pm), label: monthLabel(pm) },
  };
}

// ---------- scoring rules ----------

const onTimeScore = (lateDays) => (lateDays <= 0 ? 100 : lateDays <= 2 ? 75 : lateDays <= 5 ? 50 : 0);
const firstPassScore = (corrections) => (corrections === 0 ? 100 : corrections === 1 ? 50 : 0);
// Time logged against the time allotted: within it 100, up to a quarter over 75,
// up to half over 50, more than that 0.
const withinTimeScore = (spent, allotted) => {
  const r = spent / allotted;
  return r <= 1 ? 100 : r <= 1.25 ? 75 : r <= 1.5 ? 50 : 0;
};
const starScore = (stars) => (Number.isInteger(stars) && stars >= 1 && stars <= 5 ? (stars / 5) * 100 : null);
const round1 = (n) => Math.round(n * 10) / 10;

const grade = (score) => {
  if (score == null) return null;
  if (score >= 90) return { label: 'Outstanding', tone: 'outstanding' };
  if (score >= 75) return { label: 'Strong', tone: 'strong' };
  if (score >= 60) return { label: 'Fair', tone: 'fair' };
  return { label: 'Needs attention', tone: 'low' };
};

// Monthly buckets that collect time rather than a deliverable ("MISC - SEP",
// "MEETINGS - SEP", "SF SUPPORT ACTIVITIES - SEP") are left out unless the
// reviewer includes them.
const ACTIVITY_RX = /\b(misc|miscellaneous|meetings?|activities)\b/i;
const MONTH_SUFFIX_RX = /[-–]\s*[a-z]{3,9}(\s+\d{2,4})?\s*$/i;
const isActivityBucket = (t) =>
  ACTIVITY_RX.test(t.title || '') &&
  Boolean(t.is_recurring || t.recurrence_base_title || MONTH_SUFFIX_RX.test(t.title || ''));

const DATE_RX = /from (.*?) to (\d{4}-\d{2}-\d{2})/i;
const COMPLETION_REQUEST_RX = /^Approval requested for (Completed|Closed)\b/i;
const TERMINAL = new Set(['Completed', 'Closed']);

// Walks the ticket's history once: due-date moves, completion requests,
// send-backs and the acceptance that finally closed it.
function readHistory(t) {
  const tl = Array.isArray(t.timeline) ? t.timeline : [];
  const dueChanges = [];
  const sentBack = [];
  let request = null;
  let accepted = null;
  for (const e of tl) {
    const action = String(e?.action || '');
    if ((e.type === 'due_date' || e.type === 'due_date_approved') && DATE_RX.test(action)) {
      const [, from, to] = action.match(DATE_RX);
      dueChanges.push({ from: DAY.test(from) ? from : null, to, on: istDay(e.created_at), by: e.user || null });
      continue;
    }
    if (e.type === 'approval') {
      if (COMPLETION_REQUEST_RX.test(action)) {
        request = { at: e.created_at };
      } else if (/^Approval requested for/i.test(action)) {
        request = null; // a request for some other status is not a submission
      } else if (/^Ticket rejected/i.test(action)) {
        if (request) {
          sentBack.push({
            on: istDay(e.created_at),
            by: e.user || null,
            reason: e.reason || null,
            scopeChange: e.scope_change === true,
          });
        }
        request = null;
      } else if (/^Ticket approved/i.test(action)) {
        if (request) accepted = { submittedAt: request.at, acceptedAt: e.created_at, by: e.user || null };
        request = null;
      }
      continue;
    }
    // An admin can close work directly; then submission and acceptance coincide.
    if (e.type === 'status' && / to (Completed|Closed)\b/i.test(action)) {
      accepted = { submittedAt: e.created_at, acceptedAt: e.created_at, by: e.user || null, direct: true };
    }
  }
  return { dueChanges, sentBack, request, accepted };
}

const intOrNull = (v) => (Number.isInteger(v) ? v : null);

function analyseTicket(t, rating = null, spent = 0, rateFrom = ratingFrom()) {
  const h = readHistory(t);
  const terminal = TERMINAL.has(t.status);
  const waiting = t.status === 'Waiting For Approval' && Boolean(h.request);

  let accepted = h.accepted;
  if (terminal && !accepted) {
    // Rows older than status logging: the stored dates are all there is.
    const at = t.completed_date || t.approved_at || t.updated_at;
    accepted = { submittedAt: at, acceptedAt: t.approved_at || at, by: t.approved_by || null, legacy: true };
  }

  // What the ticket's history says, and what the reviewer corrected it to.
  const auto = {
    submittedOn: istDay(terminal ? accepted?.submittedAt : waiting ? h.request.at : null),
    corrections: h.sentBack.filter((b) => !b.scopeChange).length,
    spent: spent || 0,
    allotted: t.allotted_minutes || 0,
  };
  // Completed before rating began: automatic results only, never rated.
  const rateable = !auto.submittedOn || auto.submittedOn >= rateFrom;
  if (!rateable) rating = null;
  const set = {
    submittedOn: istDay(rating?.submitted_on),
    corrections: intOrNull(rating?.corrections),
    spent: intOrNull(rating?.spent_minutes),
    allotted: intOrNull(rating?.allotted_minutes),
  };
  const use = (k) => (set[k] != null ? set[k] : auto[k]);
  const submittedOn = use('submittedOn');
  const corrections = use('corrections');
  const spentMin = use('spent');
  const allottedMin = use('allotted');

  const finalDue = istDay(t.due_date);
  const originalDue = h.dueChanges.length ? h.dueChanges[0].from || finalDue : finalDue;
  const lateDays = submittedOn && finalDue ? daysBetween(finalDue, submittedOn) : null;

  const stars = {
    accuracy: intOrNull(rating?.accuracy),
    quality: intOrNull(rating?.quality),
  };
  // No time allotted, or none logged, cannot be over time: full marks.
  const timed = allottedMin > 0 && spentMin > 0;
  const parts = {
    onTime: lateDays === null ? null : onTimeScore(lateDays),
    // While waiting for approval this is what the task would get if approved now.
    firstPass: terminal || waiting ? firstPassScore(corrections) : null,
    accuracy: starScore(stars.accuracy),
    quality: starScore(stars.quality),
    withinTime: timed ? withinTimeScore(spentMin, allottedMin) : 100,
  };
  const contributions = {};
  for (const { key } of PARTS) {
    contributions[key] = parts[key] === null ? null : round1((parts[key] * WEIGHTS[key]) / 100);
  }

  const pending = [];
  if (!terminal) pending.push(waiting ? 'Waiting for approval' : 'Not submitted');
  if (!finalDue) pending.push('No due date');
  if (parts.accuracy === null || parts.quality === null) pending.push('Not rated');

  const autoExcluded = isActivityBucket(t);
  const excluded = rating?.excluded === true || (rating?.excluded == null && autoExcluded);
  const complete = rateable && terminal && PARTS.every(({ key }) => parts[key] !== null);
  const score = complete ? round1(PARTS.reduce((s, { key }) => s + contributions[key], 0)) : null;

  return {
    id: t.id,
    title: t.title,
    personId: t.assigned_to || null,
    person: t.assigned_to_name || 'Unassigned',
    division: t.division || null,
    projectId: t.project_id || null,
    status: t.status,
    originalDue,
    finalDue,
    dueChanges: h.dueChanges,
    submittedOn,
    acceptedOn: terminal ? istDay(accepted?.acceptedAt) : null,
    acceptedBy: terminal ? accepted?.by || null : null,
    legacy: Boolean(accepted?.legacy),
    lateDays,
    corrections,
    scopeChanges: h.sentBack.filter((b) => b.scopeChange).length,
    sentBack: h.sentBack,
    stars,
    parts,
    contributions,
    score,
    grade: grade(score),
    state: excluded ? 'excluded' : !rateable ? 'before' : complete ? 'final' : 'pending',
    pending: excluded || !rateable ? [] : pending,
    rateable,
    excluded,
    autoExcluded,
    // the reviewer's own choice: true / false, or null when left automatic
    excludedChoice: rating?.excluded ?? null,
    // the automatic values, and which of them the reviewer corrected
    auto,
    edited: Object.fromEntries(Object.entries(set).map(([k, v]) => [k, v != null])),
    remarks: rating?.remarks || null,
    ratedBy: rating?.updated_by_name || null,
    ratedAt: rating?.updated_at || null,
    spent: spentMin,
    allotted: allottedMin,
    noTimeLimit: !(allottedMin > 0),
    noTimeLogged: !(spentMin > 0),
  };
}

// ---------- roll-ups ----------

const avg = (xs) => (xs.length ? round1(xs.reduce((s, v) => s + v, 0) / xs.length) : null);
const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);

function summarise(tasks) {
  const counted = tasks.filter((t) => t.state !== 'excluded');
  const accepted = counted.filter((t) => TERMINAL.has(t.status));
  const final = counted.filter((t) => t.state === 'final');
  const known = (key) => accepted.map((t) => t.parts[key]).filter((v) => v !== null);
  const dated = accepted.filter((t) => t.lateDays !== null);
  const rated = accepted.filter((t) => t.stars.accuracy !== null && t.stars.quality !== null);
  const withAllot = accepted.filter((t) => t.allotted > 0);
  const score = avg(final.map((t) => t.score));
  return {
    tasks: counted.length,
    scored: final.length,
    pending: counted.filter((t) => t.state === 'pending').length,
    // completed before rating began: automatic results only
    before: counted.filter((t) => t.state === 'before').length,
    // accepted work still missing something only the reviewer can give
    toRate: accepted.filter((t) => t.state === 'pending').length,
    noDueDate: accepted.filter((t) => !t.finalDue).length,
    excluded: tasks.length - counted.length,
    score,
    grade: grade(score),
    // Each part averaged over the completed work where it is known, so work
    // from before rating began still shows its automatic results.
    parts: Object.fromEntries(PARTS.map(({ key }) => [key, avg(known(key))])),
    onTimePct: pct(dated.filter((t) => t.lateDays <= 0).length, dated.length),
    late: dated.filter((t) => t.lateDays > 0).length,
    avgDaysLate: avg(dated.filter((t) => t.lateDays > 0).map((t) => t.lateDays)),
    firstPassPct: pct(accepted.filter((t) => t.corrections === 0).length, accepted.length),
    sentBack: accepted.reduce((s, t) => s + t.corrections, 0),
    stars: {
      accuracy: avg(rated.map((t) => t.stars.accuracy)),
      quality: avg(rated.map((t) => t.stars.quality)),
    },
    spent: accepted.reduce((s, t) => s + t.spent, 0),
    allotted: accepted.reduce((s, t) => s + t.allotted, 0),
    withinAllottedPct: pct(withAllot.filter((t) => t.spent <= t.allotted).length, withAllot.length),
  };
}

// ---------- data ----------

const PAGE = 1000;
const pageAll = async (build) => {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
};
const byChunks = async (build, ids, size = 200) => {
  const out = [];
  for (let i = 0; i < ids.length; i += size) {
    const { data, error } = await build(ids.slice(i, i + size));
    if (error) throw error;
    if (data?.length) out.push(...data);
  }
  return out;
};

// The ratings table arrives with a migration; until it has run the scorecard
// still works, with every task unrated.
const MISSING_TABLE = new Set(['PGRST205', '42P01', 'PGRST200']);
const isMissingTable = (err) => MISSING_TABLE.has(err?.code);

const TICKET_COLS =
  'id,title,status,assigned_to,assigned_to_name,created_by,division,project_id,due_date,timeline,completed_date,approved_at,approved_by,updated_at,allotted_minutes,is_recurring,recurrence_base_title';

async function loadUsers() {
  const { data, error } = await supabase.from('users').select('id,name,email,role,active');
  if (error) throw error;
  return data || [];
}

// The viewer's team, as GET /tickets scopes it: a ticket belongs to the team
// of its assignee, falling back to its creator. Super Admins see every team.
function teamFilter(viewer, users) {
  if (isSuperAdmin(viewer)) return () => true;
  const myTeam = getUserTeam(viewer);
  const roleOf = (id) => users.find((u) => u.id === id)?.role;
  return (t) =>
    (teamFromRole(roleOf(t.assigned_to)) || teamFromRole(roleOf(t.created_by)) || TEAM.MARKETING) === myTeam;
}

// The reviewer's own work is not theirs to rate.
const isOwnWork = (viewer, users, t) => {
  const self =
    viewer.id ||
    users.find((u) => u.email && u.email.toLowerCase() === String(viewer.email || '').toLowerCase())?.id;
  return Boolean(self) && t.assigned_to === self;
};

async function loadRatings(ids) {
  try {
    const rows = await byChunks(
      (chunk) => supabase.from('ticket_scores').select('*').in('ticket_id', chunk),
      ids
    );
    return { ratings: new Map(rows.map((r) => [r.ticket_id, r])), setupNeeded: false };
  } catch (err) {
    if (isMissingTable(err)) return { ratings: new Map(), setupNeeded: true };
    throw err;
  }
}

async function loadSpent(ids) {
  const rows = await byChunks(
    (chunk) => supabase.from('ticket_time_entries').select('ticket_id,duration_minutes').in('ticket_id', chunk),
    ids
  );
  const spent = new Map();
  for (const r of rows) spent.set(r.ticket_id, (spent.get(r.ticket_id) || 0) + (r.duration_minutes || 0));
  return spent;
}

// Everything the scorecard can show for one viewer, from `sinceDay` on.
async function loadScope(viewer, sinceDay) {
  const users = await loadUsers();
  const inTeam = teamFilter(viewer, users);
  const activeIds = new Set(users.filter((u) => u.active !== false).map((u) => u.id));
  const keep = (t) =>
    inTeam(t) && (!t.assigned_to || activeIds.has(t.assigned_to)) && !isOwnWork(viewer, users, t);

  // A ticket finished on or after sinceDay was last updated on or after it.
  const since = new Date(Date.parse(`${sinceDay}T00:00:00Z`) - IST_OFFSET_MINUTES * 60000).toISOString();
  const [done, waiting, open] = await Promise.all([
    pageAll(() =>
      supabase.from('tickets').select(TICKET_COLS)
        .in('status', ['Completed', 'Closed'])
        .not('deleted', 'is', true)
        .gte('updated_at', since)
        .order('id', { ascending: true })
    ),
    pageAll(() =>
      supabase.from('tickets').select(TICKET_COLS)
        .eq('status', 'Waiting For Approval')
        .not('deleted', 'is', true)
        .order('id', { ascending: true })
    ),
    pageAll(() =>
      supabase.from('tickets').select('id,title,status,assigned_to,assigned_to_name,created_by,due_date')
        .not('status', 'in', '("Completed","Closed")')
        .not('deleted', 'is', true)
        .lt('due_date', todayIST())
        .order('id', { ascending: true })
    ),
  ]);

  // A ticket keeps the assignee's name as it was when assigned; show today's.
  const nameOf = (t) => users.find((u) => u.id === t.assigned_to)?.name || t.assigned_to_name || 'Unassigned';
  const tickets = [...done, ...waiting].filter(keep).map((t) => ({ ...t, assigned_to_name: nameOf(t) }));
  const ids = tickets.map((t) => t.id);
  const [{ ratings, setupNeeded }, spent] = await Promise.all([loadRatings(ids), loadSpent(ids)]);
  return {
    users,
    setupNeeded,
    tasks: tickets.map((t) => analyseTicket(t, ratings.get(t.id) || null, spent.get(t.id) || 0)),
    overdue: open.filter(keep).map((t) => ({
      id: t.id,
      title: t.title,
      person: nameOf(t),
      due: istDay(t.due_date),
      daysOverdue: daysBetween(istDay(t.due_date), todayIST()),
      status: t.status,
    })),
  };
}

// The month the portal's first ticket was raised: the earliest month worth
// offering in the period picker.
async function firstTicketMonth() {
  const { data } = await supabase.from('tickets').select('created_at').order('created_at', { ascending: true }).limit(1);
  return istDay(data?.[0]?.created_at)?.slice(0, 7) || ratingFrom().slice(0, 7);
}

const byPerson = (tasks) => {
  const map = new Map();
  for (const t of tasks) {
    const key = t.personId || t.person;
    if (!map.has(key)) map.set(key, { id: t.personId, name: t.person, tasks: [] });
    map.get(key).tasks.push(t);
  }
  return map;
};

// The scorecard for one period, as the reviewer sees it.
async function buildScorecard(viewer, periodKey = 'this-month') {
  const period = periodRange(periodKey);
  const from = ratingFrom();
  const since = [period.prev.from, from].sort()[0];
  const [scope, firstMonth] = await Promise.all([loadScope(viewer, since), firstTicketMonth()]);

  const within = (t, a, b) => t.submittedOn && t.submittedOn >= a && t.submittedOn <= b;
  const done = scope.tasks.filter((t) => TERMINAL.has(t.status));
  const tasks = done.filter((t) => within(t, period.from, period.to));
  const prevTasks = done.filter((t) => within(t, period.prev.from, period.prev.to));

  const prevPeople = byPerson(prevTasks);
  const people = [...byPerson(tasks).values()]
    .map((p) => {
      const s = summarise(p.tasks);
      const before = prevPeople.get(p.id || p.name);
      const prevScore = before ? summarise(before.tasks).score : null;
      return {
        id: p.id,
        name: p.name,
        ...s,
        prevScore,
        delta: s.score != null && prevScore != null ? round1(s.score - prevScore) : null,
      };
    })
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.tasks - a.tasks || a.name.localeCompare(b.name));
  // Rank only people with a published score.
  let rank = 0;
  for (const p of people) p.rank = p.score != null ? ++rank : null;

  const team = summarise(tasks);
  const prevTeam = summarise(prevTasks);

  // Accepted work still waiting on the reviewer (a rating, a due date),
  // whatever period it falls in.
  const toRate = done
    .filter((t) => t.state === 'pending')
    .sort((a, b) => (a.submittedOn < b.submittedOn ? -1 : 1));
  const awaitingApproval = scope.tasks
    // submittedOn is set only for a completion request, not one for another status
    .filter((t) => t.status === 'Waiting For Approval' && t.submittedOn && !t.excluded)
    .sort((a, b) => ((a.submittedOn || '') < (b.submittedOn || '') ? -1 : 1));

  return {
    reviewer: viewer.name,
    period,
    ratingFrom: from,
    firstMonth,
    weights: WEIGHTS,
    parts: PARTS,
    setupNeeded: scope.setupNeeded,
    team: {
      ...team,
      prevScore: prevTeam.score,
      delta: team.score != null && prevTeam.score != null ? round1(team.score - prevTeam.score) : null,
    },
    people,
    tasks: tasks.sort((a, b) => ((a.submittedOn || '') < (b.submittedOn || '') ? 1 : -1)),
    toRate,
    awaitingApproval,
    overdue: scope.overdue.sort((a, b) => b.daysOverdue - a.daysOverdue),
  };
}

// One ticket's score card, for the rating dialog and the ticket page.
async function taskScore(viewer, ticketId) {
  const { data: t, error } = await supabase.from('tickets').select(TICKET_COLS).eq('id', ticketId).maybeSingle();
  if (error) throw error;
  if (!t) return null;
  const users = await loadUsers();
  if (!teamFilter(viewer, users)(t) || isOwnWork(viewer, users, t)) return null;
  const [{ ratings, setupNeeded }, spent] = await Promise.all([loadRatings([t.id]), loadSpent([t.id])]);
  const rating = ratings.get(t.id) || null;
  return {
    setupNeeded,
    weights: WEIGHTS,
    parts: PARTS,
    ratingFrom: ratingFrom(),
    task: analyseTicket(t, rating, spent.get(t.id) || 0),
    history: Array.isArray(rating?.history) ? rating.history : [],
  };
}

const RATEABLE = new Set(['Completed', 'Closed', 'Waiting For Approval']);

// Saves the reviewer's stars, remarks and include/exclude choice, keeping
// every earlier version in the row's history.
async function saveRating(viewer, ticketId, input) {
  const { data: t, error } = await supabase.from('tickets').select(TICKET_COLS).eq('id', ticketId).maybeSingle();
  if (error) throw error;
  if (!t) return { status: 404, message: 'Ticket not found' };
  const users = await loadUsers();
  if (!teamFilter(viewer, users)(t)) return { status: 403, message: 'Access denied' };
  if (isOwnWork(viewer, users, t)) return { status: 400, message: 'Your own work is not rated on your scorecard' };
  if (!RATEABLE.has(t.status)) return { status: 400, message: 'Only submitted or completed work can be rated' };
  if (!analyseTicket(t).rateable) {
    return { status: 400, message: `Only work completed from ${fmtDay(ratingFrom())} can be rated` };
  }

  const star = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 1 && n <= 5 ? n : NaN;
  };
  // A correction of an automatic value; empty puts the automatic one back.
  const count = (v, max) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : NaN;
  };
  const accuracy = star(input.accuracy);
  const quality = star(input.quality);
  if (Number.isNaN(accuracy) || Number.isNaN(quality)) {
    return { status: 400, message: 'Ratings are whole stars from 1 to 5' };
  }
  const corrections = count(input.corrections, 20);
  const spentMinutes = count(input.spent_minutes, 100000);
  const allottedMinutes = count(input.allotted_minutes, 100000);
  if ([corrections, spentMinutes, allottedMinutes].some(Number.isNaN)) {
    return { status: 400, message: 'Times sent back and minutes must be whole numbers, zero or more' };
  }
  const submittedOn = input.submitted_on ? String(input.submitted_on).slice(0, 10) : null;
  if (submittedOn && (!DAY.test(submittedOn) || submittedOn > todayIST())) {
    return { status: 400, message: 'The completed date must be a date, not in the future' };
  }
  const excluded = input.excluded === true ? true : input.excluded === false ? false : null;
  const remarks = String(input.remarks || '').trim().slice(0, 2000) || null;
  const values = {
    accuracy,
    quality,
    remarks,
    excluded,
    submitted_on: submittedOn,
    corrections,
    spent_minutes: spentMinutes,
    allotted_minutes: allottedMinutes,
  };

  const { data: existing, error: readErr } = await supabase
    .from('ticket_scores').select('history').eq('ticket_id', String(t.id)).maybeSingle();
  if (readErr) {
    if (isMissingTable(readErr)) return { status: 503, message: 'The scorecard database step has not been run yet' };
    throw readErr;
  }
  const at = new Date().toISOString();
  const history = [
    ...(Array.isArray(existing?.history) ? existing.history : []),
    { at, by: viewer.name, ...values },
  ];
  const { error: writeErr } = await supabase.from('ticket_scores').upsert(
    {
      ticket_id: String(t.id),
      ...values,
      updated_at: at,
      updated_by_name: viewer.name,
      history,
    },
    { onConflict: 'ticket_id' }
  );
  if (writeErr) throw writeErr;
  return { status: 200 };
}

module.exports = {
  WEIGHTS,
  PARTS,
  ratingFrom,
  reviewerEmails,
  isReviewer,
  periodRange,
  analyseTicket,
  summarise,
  buildScorecard,
  taskScore,
  saveRating,
  fmtDay,
  istDay,
};
