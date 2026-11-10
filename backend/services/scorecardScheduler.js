// =====================================================
// Scorecard email schedule
// =====================================================
// Monday from 9 am IST: last week's scorecard. The 2nd of the month from 9 am
// IST: last month's. Sent to each reviewer (SCORECARD_REVIEWERS), built from
// the team that reviewer can see.
//
// Off unless SCORECARD_EMAILS=on, so a development machine or a fresh deploy
// never mails anyone. Each report is claimed in scorecard_mail_log before it
// goes out, so a restart or a second process cannot send it twice; a failed
// send gives the claim back and the next check tries again the same day.

const supabase = require('../config/supabase');
const { IST_OFFSET_MINUTES } = require('../utils/time');
const { sendMail } = require('./mailService');
const { buildScorecard, periodRange, reviewerEmails } = require('./scorecard');
const { buildScorecardEmail } = require('./scorecardMail');

const CHECK_EVERY_MS = 5 * 60 * 1000;
const SEND_FROM_HOUR = 9;

const enabled = () => String(process.env.SCORECARD_EMAILS || '').trim().toLowerCase() === 'on';

// The reviewers as users, so each report is scoped to what they may see.
async function reviewers() {
  const emails = reviewerEmails();
  if (!emails.length) return [];
  const { data, error } = await supabase.from('users').select('id,name,email,role,active');
  if (error) throw error;
  return (data || []).filter(
    (u) => u.active !== false && u.email && emails.includes(String(u.email).trim().toLowerCase())
  );
}

// Builds and sends one report to one person. Used by the schedule and by the
// "send me a test" button.
async function sendScorecardEmail(viewer, kind, to, { test = false } = {}) {
  const card = await buildScorecard(viewer, kind === 'weekly' ? 'last-week' : 'last-month');
  const { subject, html } = buildScorecardEmail(card, kind);
  return sendMail({ to, subject: test ? `[TEST] ${subject}` : subject, html });
}

async function sendOnce(kind, periodKey) {
  const { error: claimErr } = await supabase
    .from('scorecard_mail_log')
    .insert({ kind, period: periodKey });
  if (claimErr) {
    if (claimErr.code === '23505') return; // already sent
    throw claimErr;
  }
  const people = await reviewers();
  const sentTo = [];
  try {
    for (const r of people) {
      const { ok, error } = await sendScorecardEmail(r, kind, r.email);
      if (!ok) throw new Error(error || 'send failed');
      sentTo.push(r.email);
    }
  } catch (err) {
    // Give the claim back unless someone already got it, so it is retried.
    if (!sentTo.length) {
      await supabase.from('scorecard_mail_log').delete().eq('kind', kind).eq('period', periodKey);
    }
    throw err;
  }
  await supabase
    .from('scorecard_mail_log')
    .update({ recipients: sentTo.join(', ') || null })
    .eq('kind', kind)
    .eq('period', periodKey);
  console.log(`Scorecard: ${kind} report for ${periodKey} sent to ${sentTo.join(', ') || 'nobody'}`);
}

async function sendDueReports(now = new Date()) {
  const ist = new Date(now.getTime() + IST_OFFSET_MINUTES * 60000);
  if (ist.getUTCHours() < SEND_FROM_HOUR) return;
  const today = ist.toISOString().slice(0, 10);
  if (ist.getUTCDay() === 1) {
    await sendOnce('weekly', periodRange('last-week', today).from);
  }
  if (ist.getUTCDate() === 2) {
    await sendOnce('monthly', periodRange('last-month', today).from.slice(0, 7));
  }
}

function startScorecardScheduler() {
  if (!enabled()) {
    console.log('Scorecard emails: off (set SCORECARD_EMAILS=on to send them)');
    return;
  }
  console.log(`Scorecard emails: on, to ${reviewerEmails().join(', ')}`);
  const run = () => sendDueReports().catch((err) => console.error('Scorecard email error:', err.message || err));
  setTimeout(run, 30000);
  setInterval(run, CHECK_EVERY_MS).unref();
}

module.exports = { startScorecardScheduler, sendScorecardEmail, sendDueReports };
