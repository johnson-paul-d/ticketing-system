// Checks the scorecard arithmetic against worked examples: on time and passed
// first time, late by different amounts, sent back once and twice, a scope
// change, time over the allowance, missing inputs, and the reviewer's
// corrections. No database: each ticket is built in memory.
//
//   node backend/scripts/scorecard-check.js
//
// Weights: on time 35, first-time pass 25, accuracy 20, quality 10,
// within time allowed 10.

// The service loads the database client on require; nothing here queries it.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), quiet: true });
const { analyseTicket, summarise } = require('../services/scorecard');

// Timeline instants are UTC; 06:00Z is 11:30 am IST on the same day.
const at = (day) => `${day}T06:00:00.000Z`;
const request = (day) => ({ type: 'approval', action: 'Approval requested for Completed', user: 'Vimal', created_at: at(day) });
const approve = (day) => ({ type: 'approval', action: 'Ticket approved', user: 'Ramenaathan', created_at: at(day) });
const reject = (day, extra = {}) => ({ type: 'approval', action: 'Ticket rejected', user: 'Ramenaathan', created_at: at(day), ...extra });

// Due 10 Nov, 4 hours allowed; each case logs 3 hours unless it says otherwise.
const ticket = (over) => ({
  id: over.id,
  title: over.title || over.id,
  status: 'Completed',
  assigned_to: 'u1',
  assigned_to_name: 'Vimal',
  due_date: '2026-11-10',
  timeline: [],
  allotted_minutes: 240,
  ...over,
});
const stars = (accuracy, quality, more = {}) => ({ accuracy, quality, excluded: null, ...more });
const onTimeDone = () => [request('2026-11-10'), approve('2026-11-10')];

const cases = [
  {
    name: 'On time, passed first time, 5 + 5 stars, within time',
    t: ticket({ id: 'A', timeline: onTimeDone() }),
    r: stars(5, 5),
    expect: { onTime: 100, firstPass: 100, withinTime: 100, score: 100, state: 'final' },
  },
  {
    name: 'Submitted on time, approved 4 days later (reviewer wait does not count)',
    t: ticket({ id: 'B', timeline: [request('2026-11-09'), approve('2026-11-13')] }),
    r: stars(4, 4),
    // 35 + 25 + 20×0.8 + 10×0.8 + 10 = 94
    expect: { onTime: 100, lateDays: -1, score: 94, state: 'final' },
  },
  {
    name: '2 days late, first pass, 4 + 3 stars',
    t: ticket({ id: 'C', timeline: [request('2026-11-12'), approve('2026-11-12')] }),
    r: stars(4, 3),
    // 35×0.75 + 25 + 16 + 6 + 10 = 83.25 → 83.3
    expect: { onTime: 75, lateDays: 2, score: 83.3 },
  },
  {
    name: '5 days late',
    t: ticket({ id: 'D', timeline: [request('2026-11-15'), approve('2026-11-16')] }),
    r: stars(3, 3),
    // 17.5 + 25 + 12 + 6 + 10 = 70.5
    expect: { onTime: 50, lateDays: 5, score: 70.5 },
  },
  {
    name: '6 days late',
    t: ticket({ id: 'E', timeline: [request('2026-11-16'), approve('2026-11-16')] }),
    r: stars(3, 3),
    expect: { onTime: 0, lateDays: 6, score: 53 },
  },
  {
    name: 'Sent back once, then accepted on time',
    t: ticket({ id: 'F', timeline: [request('2026-11-05'), reject('2026-11-06'), request('2026-11-08'), approve('2026-11-09')] }),
    r: stars(4, 5),
    // 35 + 12.5 + 16 + 10 + 10 = 83.5
    expect: { firstPass: 50, corrections: 1, onTime: 100, score: 83.5 },
  },
  {
    name: 'Sent back twice',
    t: ticket({ id: 'G', timeline: [request('2026-11-03'), reject('2026-11-04'), request('2026-11-05'), reject('2026-11-06'), request('2026-11-07'), approve('2026-11-08')] }),
    r: stars(4, 4),
    expect: { firstPass: 0, corrections: 2, score: 69 },
  },
  {
    name: 'Sent back for a scope change: not a correction',
    t: ticket({ id: 'H', timeline: [request('2026-11-05'), reject('2026-11-06', { scope_change: true, reason: 'Brief changed' }), request('2026-11-09'), approve('2026-11-09')] }),
    r: stars(5, 5),
    expect: { firstPass: 100, corrections: 0, scopeChanges: 1, score: 100 },
  },
  {
    name: 'Comments alone are not a send-back',
    t: ticket({ id: 'I', timeline: [request('2026-11-08'), { type: 'comment_add', action: 'Comment added', created_at: at('2026-11-08') }, approve('2026-11-09')] }),
    r: stars(5, 4),
    expect: { firstPass: 100, corrections: 0, score: 98 },
  },
  {
    name: 'Took a quarter longer than allowed (5h of 4h)',
    t: ticket({ id: 'T1', timeline: onTimeDone() }),
    r: stars(5, 5),
    spent: 300,
    expect: { withinTime: 75, score: 97.5 },
  },
  {
    name: 'Took half as long again (6h of 4h)',
    t: ticket({ id: 'T2', timeline: onTimeDone() }),
    r: stars(5, 5),
    spent: 360,
    expect: { withinTime: 50, score: 95 },
  },
  {
    name: 'Took more than half as long again (6h 40m of 4h)',
    t: ticket({ id: 'T3', timeline: onTimeDone() }),
    r: stars(5, 5),
    spent: 400,
    expect: { withinTime: 0, score: 90 },
  },
  {
    name: 'Not rated yet: pending, not zero',
    t: ticket({ id: 'J', timeline: onTimeDone() }),
    r: null,
    expect: { score: null, state: 'pending', pendingHas: 'Not rated' },
  },
  {
    name: 'Only one of the two ratings given: still pending',
    t: ticket({ id: 'K', timeline: onTimeDone() }),
    r: stars(4, null),
    expect: { score: null, state: 'pending', pendingHas: 'Not rated' },
  },
  {
    name: 'No due date: pending, not zero',
    t: ticket({ id: 'L', due_date: null, timeline: onTimeDone() }),
    r: stars(5, 5),
    expect: { onTime: null, score: null, state: 'pending', pendingHas: 'No due date' },
  },
  {
    name: 'No time allowed on the ticket: full marks for that part',
    t: ticket({ id: 'W', allotted_minutes: 0, timeline: onTimeDone() }),
    r: stars(4, 4),
    // 35 + 25 + 16 + 8 + 10 = 94
    expect: { withinTime: 100, noTimeLimit: true, score: 94, state: 'final' },
  },
  {
    name: 'No time logged: full marks for that part',
    t: ticket({ id: 'X', timeline: onTimeDone() }),
    r: stars(4, 4),
    spent: 0,
    expect: { withinTime: 100, noTimeLogged: true, score: 94, state: 'final' },
  },
  {
    name: 'Waiting for approval: pending, first pass shown as if approved now',
    t: ticket({ id: 'M', status: 'Waiting For Approval', timeline: [request('2026-11-11')] }),
    r: stars(5, 5),
    expect: { onTime: 75, firstPass: 100, score: null, state: 'pending', pendingHas: 'Waiting for approval' },
  },
  {
    name: 'Closed directly by an admin',
    t: ticket({ id: 'N', status: 'Closed', timeline: [{ type: 'status', action: 'Status changed from In Progress to Closed', created_at: at('2026-11-10') }] }),
    r: stars(5, 5),
    expect: { onTime: 100, firstPass: 100, score: 100 },
  },
  {
    name: 'Due date moved with approval: judged against the approved date, original kept',
    t: ticket({ id: 'O', due_date: '2026-11-20', timeline: [{ type: 'due_date_approved', action: 'Due date changed from 2026-11-10 to 2026-11-20', user: 'Ramenaathan', created_at: at('2026-11-08') }, request('2026-11-18'), approve('2026-11-19')] }),
    r: stars(5, 5),
    expect: { onTime: 100, originalDue: '2026-11-10', finalDue: '2026-11-20', score: 100 },
  },
  {
    name: 'Monthly activity bucket is left out automatically',
    t: ticket({ id: 'P', title: 'MISC - NOV', is_recurring: true, timeline: [request('2026-11-30'), approve('2026-11-30')] }),
    r: null,
    expect: { state: 'excluded', score: null },
  },
  {
    name: '...unless the reviewer includes it',
    t: ticket({ id: 'Q', title: 'MEETINGS - NOV', is_recurring: true, timeline: onTimeDone() }),
    r: stars(5, 5, { excluded: false }),
    expect: { state: 'final', score: 100 },
  },
  {
    name: 'Late in IST at 11 pm counts the IST day, not UTC',
    t: ticket({ id: 'R', timeline: [{ type: 'approval', action: 'Approval requested for Completed', created_at: '2026-11-10T17:45:00.000Z' }, approve('2026-11-11')] }),
    r: stars(5, 5),
    // 17:45Z on the 10th is 11:15 pm IST on the 10th: still on time
    expect: { lateDays: 0, onTime: 100 },
  },
  {
    name: 'Submitted 00:30 IST on the 11th counts as the 11th (1 day late)',
    t: ticket({ id: 'S', timeline: [{ type: 'approval', action: 'Approval requested for Completed', created_at: '2026-11-10T19:00:00.000Z' }, approve('2026-11-11')] }),
    r: stars(5, 5),
    // 26.25 + 25 + 20 + 10 + 10 = 91.25 → 91.3
    expect: { lateDays: 1, onTime: 75, score: 91.3 },
  },
  {
    name: 'Completed before rating began: automatic results shown, never rated or scored',
    t: ticket({ id: 'B0', due_date: '2026-09-28', timeline: [request('2026-09-30'), approve('2026-09-30')] }),
    r: stars(5, 5),
    rateFrom: '2026-10-02',
    expect: { state: 'before', rateable: false, score: null, onTime: 75, firstPass: 100 },
  },
  {
    name: 'Completed on the first rating day is rated',
    t: ticket({ id: 'B1', due_date: '2026-10-02', timeline: [request('2026-10-02'), approve('2026-10-03')] }),
    r: stars(5, 5),
    rateFrom: '2026-10-02',
    expect: { state: 'final', rateable: true, score: 100 },
  },
  {
    name: 'Reviewer corrects the completed date (delivered on the 10th, marked done on the 16th)',
    t: ticket({ id: 'Y1', timeline: [request('2026-11-16'), approve('2026-11-16')] }),
    r: stars(5, 5, { submitted_on: '2026-11-10' }),
    expect: { submittedOn: '2026-11-10', lateDays: 0, onTime: 100, score: 100, editedHas: 'submittedOn' },
  },
  {
    name: 'Reviewer sets the time allowed on a ticket that had none',
    t: ticket({ id: 'Y2', allotted_minutes: 0, timeline: onTimeDone() }),
    r: stars(5, 5, { allotted_minutes: 120 }),
    // 3h logged against 2h allowed = 150% → 50
    expect: { allotted: 120, withinTime: 50, score: 95, state: 'final', editedHas: 'allotted' },
  },
  {
    name: 'Reviewer corrects the time taken',
    t: ticket({ id: 'Y3', timeline: onTimeDone() }),
    r: stars(5, 5, { spent_minutes: 230 }),
    spent: 400,
    expect: { spent: 230, withinTime: 100, score: 100, editedHas: 'spent' },
  },
  {
    name: 'Reviewer corrects the times sent back (two send-backs were not about the work)',
    t: ticket({ id: 'Y4', timeline: [request('2026-11-03'), reject('2026-11-04'), request('2026-11-05'), reject('2026-11-06'), request('2026-11-07'), approve('2026-11-08')] }),
    r: stars(5, 5, { corrections: 0 }),
    expect: { corrections: 0, firstPass: 100, score: 100, editedHas: 'corrections' },
  },
];

let failed = 0;
const results = [];
for (const c of cases) {
  const a = analyseTicket(c.t, c.r, c.spent ?? 180, c.rateFrom || '2026-10-02');
  results.push(a);
  const problems = [];
  for (const [k, v] of Object.entries(c.expect)) {
    if (k === 'pendingHas') {
      if (!a.pending.includes(v)) problems.push(`pending should include "${v}", got [${a.pending.join(', ')}]`);
      continue;
    }
    if (k === 'editedHas') {
      if (!a.edited[v]) problems.push(`${v} should be marked as corrected`);
      continue;
    }
    const got = k in a.parts ? a.parts[k] : a[k];
    if (got !== v) problems.push(`${k}: expected ${v}, got ${got}`);
  }
  if (problems.length) failed++;
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${c.name}${a.score != null ? `  → ${a.score}` : ''}`);
  for (const p of problems) console.log(`        ${p}`);
}

// Roll-up: only final scores average; pending and excluded tasks never drag it down.
const s = summarise(results);
const finals = results.filter((r) => r.state === 'final').map((r) => r.score);
const expectAvg = Math.round((finals.reduce((x, y) => x + y, 0) / finals.length) * 10) / 10;
const rollOk = s.score === expectAvg && s.excluded === 1 && s.scored === finals.length && s.before === 1;
if (!rollOk) failed++;
console.log(`${rollOk ? 'PASS' : 'FAIL'}  Team average uses final scores only → ${s.score} (${s.scored} scored, ${s.pending} pending, ${s.before} before rating began, ${s.excluded} left out)`);

console.log(failed ? `\n${failed} check(s) failed` : `\nAll ${cases.length + 1} checks pass`);
process.exit(failed ? 1 : 0);
