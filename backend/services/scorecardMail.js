// =====================================================
// Scorecard emails
// =====================================================
// The weekly (Monday 9 am, the week before) and monthly (2nd, 9 am, the month
// before) summaries sent to the reviewer. Inline styles and tables only, so
// the layout survives Gmail and Outlook.

const { fmtDay } = require('./scorecard');

const BRAND = '#9b2423';
const INK = '#1f2937';
const MUTED = '#6b7280';
const LINE = '#eee7dc';
const TONE = {
  outstanding: { fg: '#047857', bg: '#d1fae5' },
  strong: { fg: '#0f766e', bg: '#ccfbf1' },
  fair: { fg: '#b45309', bg: '#fef3c7' },
  low: { fg: '#b91c1c', bg: '#fee2e2' },
  none: { fg: MUTED, bg: '#f3f4f6' },
};

const esc = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const num = (v, suffix = '') => (v == null ? '—' : `${Number.isInteger(v) ? v : v.toFixed(1)}${suffix}`);
const toneOf = (g) => TONE[g?.tone] || TONE.none;

const scorecardUrl = () => {
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  return base ? `${base}/completion-report?tab=scorecard` : null;
};
const ticketUrl = (id) => {
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  return base ? `${base}/tickets/${encodeURIComponent(id)}` : null;
};

const pill = (score, g) => {
  const t = toneOf(g);
  return `<span style="display:inline-block;min-width:44px;text-align:center;font-weight:700;font-size:14px;color:${t.fg};background:${t.bg};border-radius:999px;padding:4px 10px;">${num(score)}</span>`;
};

const bar = (value, color, track = '#f1ece4') => {
  const w = Math.max(0, Math.min(100, Math.round(value || 0)));
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>
    <td style="background:${color};height:6px;width:${w}%;font-size:0;line-height:0;">&nbsp;</td>
    <td style="background:${track};height:6px;width:${100 - w}%;font-size:0;line-height:0;">&nbsp;</td>
  </tr></table>`;
};

// Change against the period before, coloured for the dark header.
const delta = (d, vs) => {
  if (d == null) return `<span style="color:#f3c4c4;">No earlier score to compare</span>`;
  if (d === 0) return `<span style="color:#f3c4c4;">Same as ${esc(vs)}</span>`;
  const up = d > 0;
  return `<span style="color:${up ? '#bbf7d0' : '#fecaca'};font-weight:600;">${up ? '▲' : '▼'} ${Math.abs(d).toFixed(1)}</span> <span style="color:#f3c4c4;">vs ${esc(vs)}</span>`;
};

const tile = (value, label, sub) => `
  <td width="25%" style="padding:6px;" valign="top">
    <div style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;padding:14px 12px;">
      <div style="font-size:22px;font-weight:800;color:${INK};">${value}</div>
      <div style="font-size:12px;color:${MUTED};margin-top:2px;">${esc(label)}</div>
      ${sub ? `<div style="font-size:11px;color:#9ca3af;margin-top:2px;">${esc(sub)}</div>` : ''}
    </div>
  </td>`;

const section = (title, body) => `
  <tr><td style="padding:22px 28px 0;">
    <div style="font-size:15px;font-weight:700;color:${INK};margin-bottom:10px;">${title}</div>
    ${body}
  </td></tr>`;

function peopleTable(people) {
  if (!people.length) {
    return `<div style="color:${MUTED};font-size:13px;">No work was submitted in this period.</div>`;
  }
  const rows = people
    .map((p) => {
      const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : p.rank ? `#${p.rank}` : '';
      return `<tr>
        <td style="padding:10px 8px;border-top:1px solid ${LINE};font-size:13px;width:28px;text-align:center;">${medal}</td>
        <td style="padding:10px 8px;border-top:1px solid ${LINE};">
          <div style="font-size:14px;font-weight:600;color:${INK};">${esc(p.name)}</div>
          <div style="margin-top:6px;width:160px;">${bar(p.score, toneOf(p.grade).fg)}</div>
        </td>
        <td style="padding:10px 8px;border-top:1px solid ${LINE};text-align:center;">${pill(p.score, p.grade)}</td>
        <td style="padding:10px 8px;border-top:1px solid ${LINE};text-align:center;font-size:13px;color:${INK};">${p.scored}<span style="color:${MUTED};">/${p.tasks}</span></td>
        <td style="padding:10px 8px;border-top:1px solid ${LINE};text-align:center;font-size:13px;color:${INK};">${num(p.onTimePct, '%')}</td>
        <td style="padding:10px 8px;border-top:1px solid ${LINE};text-align:center;font-size:13px;color:${INK};">${num(p.firstPassPct, '%')}</td>
        <td style="padding:10px 8px;border-top:1px solid ${LINE};text-align:center;font-size:13px;color:${p.toRate ? BRAND : MUTED};font-weight:${p.toRate ? 700 : 400};">${p.toRate || '—'}</td>
      </tr>`;
    })
    .join('');
  const th = (t, align = 'center') =>
    `<th style="padding:6px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;font-weight:600;text-align:${align};">${t}</th>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#fff;border:1px solid ${LINE};border-radius:12px;">
    <tr>${th('')}${th('Person', 'left')}${th('Score')}${th('Scored')}${th('On time')}${th('1st pass')}${th('To rate')}</tr>
    ${rows}
  </table>`;
}

function listRows(items, render, more) {
  const shown = items.slice(0, 8).map(render).join('');
  const rest = items.length > 8 ? `<div style="font-size:12px;color:${MUTED};padding-top:8px;">…and ${items.length - 8} more${more ? ` ${more}` : ''}</div>` : '';
  return `<div style="background:#fff;border:1px solid ${LINE};border-radius:12px;padding:4px 14px;">${shown}</div>${rest}`;
}

function buildScorecardEmail(card, kind) {
  const { period, team } = card;
  const heading = kind === 'weekly' ? 'Weekly team scorecard' : 'Monthly team scorecard';
  const subject = `${heading} · ${period.range}`;
  const url = scorecardUrl();
  const g = toneOf(team.grade);

  const toRateBody = card.toRate.length
    ? listRows(
        card.toRate,
        (t) => {
          const link = ticketUrl(t.id);
          const title = link ? `<a href="${esc(link)}" style="color:${INK};text-decoration:none;font-weight:600;">${esc(t.title)}</a>` : `<b>${esc(t.title)}</b>`;
          return `<div style="padding:9px 0;border-bottom:1px solid #f4efe7;font-size:13px;">${title}
            <div style="color:${MUTED};font-size:12px;margin-top:2px;">${esc(t.person)} · submitted ${esc(fmtDay(t.submittedOn))}${t.lateDays > 0 ? ` · <span style="color:#b91c1c;">${t.lateDays}d late</span>` : ''}</div></div>`;
        },
        'on the scorecard'
      )
    : `<div style="color:#047857;font-size:13px;">Nothing waiting: every completed task is rated and scored.</div>`;

  const overdueByPerson = {};
  for (const o of card.overdue) overdueByPerson[o.person] = (overdueByPerson[o.person] || 0) + 1;
  const overdueBody = card.overdue.length
    ? `<div style="font-size:13px;color:${INK};margin-bottom:8px;">${Object.entries(overdueByPerson)
        .sort((a, b) => b[1] - a[1])
        .map(([n, c]) => `<span style="display:inline-block;background:#fff;border:1px solid ${LINE};border-radius:999px;padding:3px 10px;margin:0 6px 6px 0;">${esc(n)} <b style="color:#b91c1c;">${c}</b></span>`)
        .join('')}</div>` +
      listRows(
        card.overdue,
        (o) => `<div style="padding:9px 0;border-bottom:1px solid #f4efe7;font-size:13px;"><b>${esc(o.title)}</b>
          <div style="color:${MUTED};font-size:12px;margin-top:2px;">${esc(o.person)} · due ${esc(fmtDay(o.due))} · <span style="color:#b91c1c;">${o.daysOverdue}d overdue</span></div></div>`
      )
    : `<div style="color:#047857;font-size:13px;">No open ticket is past its due date.</div>`;

  const parts = card.parts
    .map(
      ({ key, label }) => `<tr>
        <td style="font-size:12px;color:#fde8e8;padding:3px 0;width:140px;">${esc(label)} <span style="color:#f3c4c4;">${card.weights[key]}%</span></td>
        <td style="padding:3px 0;">${bar(team.parts[key], '#ffffff', '#b8504f')}</td>
        <td style="font-size:12px;color:#fff;font-weight:700;padding:3px 0 3px 10px;width:36px;text-align:right;">${num(team.parts[key])}</td>
      </tr>`
    )
    .join('');

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f6f1e9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f1e9;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;font-family:Segoe UI,Arial,sans-serif;background:#fbf8f3;border-radius:18px;overflow:hidden;border:1px solid ${LINE};">
    <tr><td style="background:${BRAND};background:linear-gradient(135deg,#9b2423,#6e1716);padding:26px 28px;">
      <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#f3c4c4;font-weight:600;">Sieger Marketing · ${esc(heading)}</div>
      <div style="font-size:24px;font-weight:800;color:#fff;margin-top:6px;">${esc(period.range)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px;"><tr>
        <td width="150" valign="middle">
          <div style="width:118px;height:118px;border-radius:50%;background:#ffffff;text-align:center;">
            <div style="padding-top:28px;font-size:38px;font-weight:800;color:${g.fg};line-height:1;">${num(team.score)}</div>
            <div style="font-size:11px;color:${MUTED};margin-top:6px;">team score</div>
          </div>
        </td>
        <td valign="middle">
          <div style="display:inline-block;background:${g.bg};color:${g.fg};font-weight:700;font-size:12px;border-radius:999px;padding:4px 12px;">${esc(team.grade?.label || 'Not scored yet')}</div>
          <div style="font-size:12px;margin:8px 0 10px;color:#fff;">${delta(team.delta, period.prev.label)}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${parts}</table>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:14px 22px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      ${tile(`${team.scored}<span style="font-size:13px;color:${MUTED};font-weight:600;">/${team.tasks}</span>`, 'Tasks scored', team.pending ? `${team.pending} pending` : 'all scored')}
      ${tile(num(team.onTimePct, '%'), 'On time', team.late ? `${team.late} late · avg ${num(team.avgDaysLate)}d` : 'none late')}
      ${tile(num(team.firstPassPct, '%'), 'First-time pass', `${team.sentBack} sent back`)}
      ${tile(`<span style="color:${card.toRate.length ? BRAND : INK};">${card.toRate.length}</span>`, 'Waiting for you', `${card.awaitingApproval.length} awaiting approval`)}
    </tr></table></td></tr>
    ${section('Team members', peopleTable(card.people))}
    ${section(`Waiting for you <span style="color:${MUTED};font-weight:400;">(${card.toRate.length})</span>`, toRateBody)}
    ${section(`Open tickets past their due date <span style="color:${MUTED};font-weight:400;">(${card.overdue.length})</span>`, overdueBody)}
    <tr><td style="padding:24px 28px;">
      ${url ? `<a href="${esc(url)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 22px;border-radius:10px;">Open the scorecard</a>` : ''}
      <div style="font-size:11px;color:#9ca3af;margin-top:16px;line-height:1.6;">
        Task score = on time ${card.weights.onTime}% + first-time pass ${card.weights.firstPass}% + accuracy ${card.weights.accuracy}% + quality ${card.weights.quality}% + within time allowed ${card.weights.withinTime}%.
        On time: 100 by the due date, 75 for 1–2 days late, 50 for 3–5, 0 beyond. First-time pass: 100, 50 after one send-back, 0 after two.
        Stars count as stars ÷ 5 × 100. Within time allowed: 100 inside the allotted time, 75 up to a quarter over, 50 up to half over, 0 beyond;
        no time allowed or none logged is full marks. Work without a rating or due date is pending, never zero. Scope changes are not counted as corrections.
      </div>
    </td></tr>
  </table>
  </td></tr></table>
  </body></html>`;

  return { subject, html };
}

module.exports = { buildScorecardEmail };
