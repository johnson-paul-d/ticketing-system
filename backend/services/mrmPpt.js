// =====================================================
// The MRM deck, as PowerPoint
// =====================================================
// Rebuilds the monthly Management Review Meeting deck from the model in
// services/mrmData.js. Slide order, titles and table shapes follow the deck
// the team presents by hand, so the generated file can replace it rather than
// sit beside it. Charts are native PowerPoint charts, editable in the file.
//
// Same house style as services/workReportPpt.js (which was itself sampled from
// this deck): maroon title bar, logo on the right, Poppins, banded tables.

const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

const BAR = '7B1A1A';
const COVER = '2B0A0A';
const HEAD = '8B1D1D'; // the MRM deck heads its tables in maroon
const HEAD_GREEN = '1E7E34';
const HEAD_GREY = '5F5F5F';
const BAND = 'F6F1F1';
const BAND_ALT = 'FFFFFF';
const INK = '1A1A1A';
const WHITE = 'FFFFFF';
const MUTED = '6E6459';
const RULE = 'DDD3D3';
const GOOD = '1E7E34';
const WARN = 'B88500';
const BAD = 'B3261E';

const FONT = 'Poppins';
const W = 13.333;
const H = 7.5;
const M = 0.45;
const BAR_H = 0.62;
const TOP = BAR_H + 0.3;

const LOGO = (() => {
  try {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sieger-logo-white.png'));
    return `image/png;base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
})();
const LOGO_W = 1.55;
const LOGO_H = LOGO_W * (130 / 379);

const dash = (v) => (v === null || v === undefined || v === '' ? '—' : String(v));
const prettyDate = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-');
  return d && m && y ? `${d}-${m}-${y}` : String(iso);
};
const statusColor = (text) => {
  const s = String(text || '').toLowerCase();
  if (/done|completed|100%/.test(s)) return GOOD;
  if (/planned|awaiting|\d+%/.test(s)) return WARN;
  return INK;
};

const renderMrm = async (model) => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'Sieger Ticketing System';
  pres.company = 'Sieger';
  pres.title = `MRM – ${model.meta.monthName} ${model.meta.year}`;

  const chrome = (title, subtitle) => {
    const s = pres.addSlide();
    s.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: W, h: BAR_H, fill: { color: BAR }, line: { color: BAR } });
    s.addText(String(title).toUpperCase(), {
      x: M - 0.1, y: 0, w: W - LOGO_W - M * 2, h: BAR_H,
      fontFace: FONT, fontSize: 19, bold: true, color: WHITE, valign: 'middle', isTextBox: true, margin: 0,
    });
    if (LOGO) s.addImage({ data: LOGO, x: W - M - LOGO_W, y: (BAR_H - LOGO_H) / 2, w: LOGO_W, h: LOGO_H });
    if (subtitle) {
      s.addText(subtitle, {
        x: M, y: BAR_H + 0.06, w: W - M * 2, h: 0.26,
        fontFace: FONT, fontSize: 10, italic: true, color: MUTED, isTextBox: true, margin: 0,
      });
    }
    return s;
  };

  const footnote = (s, text) =>
    s.addText(text, {
      x: M, y: H - 0.36, w: W - M * 2, h: 0.26,
      fontFace: FONT, fontSize: 8, color: MUTED, isTextBox: true, margin: 0,
    });

  // A banded table. `cells` may be strings or { text, color, bold, align }.
  const table = (s, { head, rows, x = M, y, w = W - M * 2, colW, fontSize = 10, rowH = 0.3, headFill = HEAD, align = [], boldLast = false }) => {
    const header = head.map((h) => ({
      text: h,
      options: { fill: { color: headFill }, color: WHITE, bold: true, align: 'center', valign: 'middle', fontFace: FONT, fontSize: fontSize + 0.5 },
    }));
    const body = rows.map((row, i) =>
      row.map((cell, c) => {
        const o = cell && typeof cell === 'object' ? cell : { text: cell };
        const last = boldLast && i === rows.length - 1;
        // A blank cell in a totals row is meant to be blank, not a dash.
        const blank = o.text === '' || o.text === null || o.text === undefined;
        return {
          text: last && blank ? '' : dash(o.text),
          options: {
            fill: { color: last ? 'EADCDC' : i % 2 === 0 ? BAND : BAND_ALT },
            color: o.color || INK, bold: Boolean(o.bold || last),
            align: o.align || align[c] || 'center', valign: 'middle', fontFace: FONT, fontSize,
          },
        };
      })
    );
    s.addTable([header, ...body], {
      x, y, w, colW, border: { type: 'solid', color: RULE, pt: 0.75 }, autoPage: false, rowH, margin: 0.05,
    });
  };

  const tile = (s, { x, y, w, h = 1.0, value, label, accent }) => {
    s.addShape(pres.ShapeType.roundRect, {
      x, y, w, h, rectRadius: 0.07, fill: { color: BAND }, line: { color: RULE, width: 0.75 },
    });
    s.addText(String(value), {
      x, y: y + 0.08, w, h: h * 0.55, fontFace: FONT, fontSize: 26, bold: true, color: accent ? BAR : INK,
      align: 'center', valign: 'middle', isTextBox: true, margin: 0,
    });
    s.addText(String(label).toUpperCase(), {
      x, y: y + h * 0.62, w, h: h * 0.3, fontFace: FONT, fontSize: 8.5, bold: true, color: MUTED,
      align: 'center', charSpacing: 0.8, isTextBox: true, margin: 0,
    });
  };

  const lineChart = (s, title, ser, { x, y, w, h, unit }) => {
    s.addText(title, {
      x, y, w, h: 0.3, fontFace: FONT, fontSize: 12, bold: true, color: BAR, align: 'center', isTextBox: true, margin: 0,
    });
    const data = [];
    const colors = [];
    if (ser.previous) {
      data.push({ name: ser.previous.name, labels: ser.categories, values: ser.previous.values.map((v) => (v == null ? null : v)) });
      colors.push('9A9A9A');
    }
    data.push({ name: ser.current.name, labels: ser.categories, values: ser.current.values.map((v) => (v == null ? null : v)) });
    colors.push(BAR);
    if (ser.target) {
      data.push({ name: ser.target.name, labels: ser.categories, values: ser.target.values.map((v) => (v == null ? null : v)) });
      colors.push(GOOD);
    }
    s.addChart(pres.ChartType.line, data, {
      x, y: y + 0.3, w, h: h - 0.3,
      chartColors: colors, lineSize: 2.25, lineDataSymbolSize: 6,
      showLegend: true, legendPos: 'b', legendFontFace: FONT, legendFontSize: 9,
      catAxisLabelFontFace: FONT, catAxisLabelFontSize: 9, valAxisLabelFontFace: FONT, valAxisLabelFontSize: 9,
      valGridLine: { color: 'E8E0E0', size: 0.5 }, catGridLine: { style: 'none' },
      showValue: true, dataLabelFontFace: FONT, dataLabelFontSize: 8, dataLabelPosition: 't',
      dataLabelFormatCode: unit === 'money' ? '0.00' : '0',
      displayBlanksAs: 'gap',
    });
  };

  // =====================================================
  // 1. Cover
  // =====================================================
  {
    const s = pres.addSlide();
    s.background = { color: COVER };
    if (LOGO) s.addImage({ data: LOGO, x: (W - 2.6) / 2, y: 1.7, w: 2.6, h: 2.6 * (130 / 379) });
    s.addText('MANAGEMENT REVIEW MEETING', {
      x: 1, y: 3.0, w: W - 2, h: 0.9, fontFace: FONT, fontSize: 38, bold: true, color: WHITE, align: 'center', isTextBox: true, margin: 0,
    });
    s.addText(`MRM – ${model.meta.monthName.toUpperCase()} ${model.meta.year}`, {
      x: 1, y: 3.95, w: W - 2, h: 0.5, fontFace: FONT, fontSize: 20, color: 'E4D9D9', align: 'center', isTextBox: true, margin: 0,
    });
    s.addText(`${model.meta.division}  ·  ${model.meta.fiscalYear}`, {
      x: 1, y: 4.5, w: W - 2, h: 0.36, fontFace: FONT, fontSize: 12, color: 'B79A9A', align: 'center', isTextBox: true, margin: 0,
    });
    s.addNotes(
      `Generated by the Sieger portal on ${model.meta.generatedAt}${model.meta.generatedBy ? ` by ${model.meta.generatedBy}` : ''}. ` +
        `Salesforce mirror synced ${model.meta.salesforce.syncedAt || 'n/a'}.` +
        (model.warnings.length ? ` Warnings: ${model.warnings.join(' | ')}` : '')
    );
  }

  // =====================================================
  // 2. ABP targets
  // =====================================================
  {
    const s = chrome(`${model.meta.fiscalYear.replace('FY', 'FY 20').replace('-', '–')} – ABP Marketing Targets | ${model.meta.monthName} Review`);
    const mon = model.meta.monthName.toUpperCase();
    table(s, {
      y: TOP + 0.1,
      head: ['Area', 'FY TARGET', `YTD TARGET\n(${model.meta.ytdLabel})`, 'YTD ACHIEVED', `${mon} TARGET`, `${mon} ACHIEVED`],
      colW: [1.75, 2.75, 2.2, 2.45, 1.64, 1.64],
      rows: model.abp.rows.map((r) => [
        { text: r.area, bold: true, color: BAR },
        r.fyTarget, r.ytdTarget, { text: r.ytdAchieved, bold: true }, r.monthTarget, { text: r.monthAchieved, bold: true },
      ]),
      fontSize: 9.5, rowH: 1.02,
    });
  }

  // =====================================================
  // 3. MQL comparison and performance
  // =====================================================
  {
    const s = chrome('MQL Comparison and Performance', `Inbound leads: ${'Google AdWords and Website'} · ${model.meta.division}`);
    const cw = (W - M * 2 - 0.3) / 2;
    const ch = (H - TOP - 0.75) / 2;
    lineChart(s, 'Total Leads Monthly Trend', model.mql.leads, { x: M, y: TOP + 0.12, w: cw, h: ch });
    lineChart(s, 'Converted Leads Monthly Trend', model.mql.convertedLeads, { x: M + cw + 0.3, y: TOP + 0.12, w: cw, h: ch });
    lineChart(s, 'Pipeline Trend – Values in Million', model.mql.pipelineMn, { x: M, y: TOP + 0.12 + ch + 0.1, w: cw, h: ch });
    lineChart(s, 'Ad Spend – ₹ Lakh', model.mql.adSpendLakh, { x: M + cw + 0.3, y: TOP + 0.12 + ch + 0.1, w: cw, h: ch, unit: 'money' });
    footnote(s, 'Past months are shown as presented at the time; the current month is read live from Salesforce and Google Ads.');
  }

  // =====================================================
  // 4. Site branding
  // =====================================================
  {
    const sb = model.siteBranding;
    const pct = sb.total ? Math.round((sb.completed / sb.total) * 100) : 0;
    const s = chrome('Site Branding', 'Completed & ongoing installations across customer locations, in due-date order');
    tile(s, { x: M, y: TOP + 0.15, w: 2.0, value: sb.total, label: 'Total projects' });
    tile(s, { x: M, y: TOP + 1.3, w: 2.0, value: `${sb.completed}/${sb.total}`, label: `Completed (${pct}%)`, accent: true });

    // Every cell is clipped to one line: a wrapped row is taller than rowH and
    // PowerPoint then pushes the table off the bottom of the slide.
    const clip = (t, n) => (String(t || '').length > n ? `${String(t).slice(0, n - 1)}…` : String(t || ''));
    const PER_COL = 18;
    const shown = sb.rows.slice(0, PER_COL * 2);
    const cols = [shown.slice(0, PER_COL), shown.slice(PER_COL)];
    const tx = M + 2.2;
    const tw = (W - M - tx - 0.2) / 2;
    cols.forEach((rows, i) => {
      if (!rows.length) return;
      table(s, {
        x: tx + i * (tw + 0.2), y: TOP + 0.15, w: tw,
        head: ['Customer', 'System', 'Progress'],
        colW: [tw * 0.4, tw * 0.3, tw * 0.3],
        rows: rows.map((r) => [
          { text: clip(r.customer, 30), align: 'left' },
          { text: r.system ? `● ${clip(r.system, 22)}` : '—', align: 'left' },
          { text: r.progress, color: r.done ? GOOD : r.overdue ? BAD : WARN, bold: r.done || r.overdue },
        ]),
        fontSize: 8, rowH: 0.285,
      });
    });
    if (sb.rows.length > shown.length) {
      footnote(s, `Showing the first ${shown.length} of ${sb.total} sites by date. The rest are planned later; full list in the portal project "${sb.project}".`);
    }
  }

  // =====================================================
  // 5. Exhibition & event tracker
  // =====================================================
  {
    const ex = model.exhibitions;
    const s = chrome(`Exhibition & Event Tracker – ${model.meta.fiscalYear.replace('FY', 'FY 20').replace('-', '–')}`, 'Exhibition-wise spend and lead conversion tracker');
    const rows = ex.rows.map((r) => [
      { text: r.name, align: 'left' },
      { text: r.status, color: statusColor(r.status), bold: true },
      r.spendLakh != null ? `${r.spendLakh} Lakh` : '—',
      dash(r.leads), dash(r.converted),
      r.opportunityAmountLakh ? `${r.opportunityAmountLakh} Lakh` : '—',
      { text: r.remarks, align: 'left' },
    ]);
    rows.push(['TOTAL', '', `${ex.totals.spendLakh} Lakh`, ex.totals.leads, ex.totals.converted, '', '']);
    table(s, {
      y: TOP + 0.2,
      head: ['Exhibition Name', 'Status', 'Expected Spend', 'No. of Leads', 'Converted', 'Opportunity Amount', 'Remarks'],
      colW: [3.35, 0.95, 1.35, 1.05, 1.0, 1.45, 3.28],
      rows, fontSize: 9.5, rowH: 0.4, boldLast: true,
    });
    footnote(s, 'Leads and conversions: Salesforce leads with source Trade Show, created during the event window. Spend: as entered, or from approved expense claims.');
  }

  // =====================================================
  // 6. Exhibition lead status by salesperson
  // =====================================================
  {
    const ex = model.exhibitions;
    const s = chrome(`Exhibition Lead Status – ${model.meta.fiscalYear.replace('FY', 'FY 20').replace('-', '–')}`);
    const z = (v) => (v ? v : '');
    const rows = ex.byOwner.map((o) => [{ text: o.user, align: 'left' }, o.assigned, z(o.converted), z(o.open), z(o.dropped), z(o.visits)]);
    if (ex.byOwnerTotal) {
      const t = ex.byOwnerTotal;
      rows.push(['Total', t.assigned, t.converted, t.open, t.dropped, t.visits]);
    }
    const tw = 9.2;
    table(s, {
      x: (W - tw) / 2, y: TOP + 0.25, w: tw,
      head: ['User', 'Assigned', 'Converted', 'Open', 'Dropped', 'Visits Done'],
      colW: [3.2, 1.2, 1.2, 1.2, 1.2, 1.2],
      rows: rows.length ? rows : [['No exhibition leads in Salesforce for this period', '', '', '', '', '']],
      fontSize: 10.5, rowH: 0.36, boldLast: Boolean(ex.byOwnerTotal),
    });
    footnote(s, 'Visits done: visit plans with a recorded check-in against the lead. Dropped includes Unqualified.');
  }

  // =====================================================
  // 7. LinkedIn
  // =====================================================
  {
    const li = model.linkedin;
    const pages = li.pages && li.pages.length ? li.pages : [li];
    const s = chrome('LinkedIn Performance', `${model.meta.monthName} ${model.meta.year} LinkedIn followers – target vs actual, per page`);
    const leftW = 7.4;
    table(s, {
      x: M, y: TOP + 0.2, w: leftW,
      head: ['Page', 'Followers', 'Target', 'Achieved', 'Gap', 'Achieved %'],
      colW: [2.2, 1.1, 1.0, 1.05, 1.0, 1.05],
      rows: pages.map((p) => [
        { text: p.label || p.org, align: 'left', bold: true },
        p.followersTotal != null ? p.followersTotal.toLocaleString('en-IN') : '—',
        dash(p.month.target),
        { text: dash(p.month.achieved), bold: true },
        dash(p.month.gap),
        p.month.achievedPct != null ? `${p.month.achievedPct}%` : '—',
      ]),
      fontSize: 10.5, rowH: 0.4,
    });
    // One chart per page, side by side under the table.
    const chartY = TOP + 0.35 + 0.4 * (pages.length + 1) + 0.2;
    const chartH = H - chartY - 0.55;
    const cw = (leftW - 0.2 * (pages.length - 1)) / pages.length;
    pages.forEach((p, i) => {
      lineChart(s, `${p.label || p.org} – target vs actual`, p.series, { x: M + i * (cw + 0.2), y: chartY, w: cw, h: chartH });
    });

    const bx = M + leftW + 0.3;
    const bw = W - M - bx;
    const box = (title, items, y, fill) => {
      s.addShape(pres.ShapeType.rect, { x: bx, y, w: bw, h: 0.36, fill: { color: fill }, line: { color: fill } });
      s.addText(title, { x: bx + 0.12, y, w: bw - 0.24, h: 0.36, fontFace: FONT, fontSize: 11.5, bold: true, color: WHITE, valign: 'middle', isTextBox: true, margin: 0 });
      s.addText(
        (items.length ? items : ['—']).map((t) => ({ text: t, options: { bullet: { code: '25CF' }, breakLine: true } })),
        { x: bx + 0.12, y: y + 0.42, w: bw - 0.24, h: 2.1, fontFace: FONT, fontSize: 10.5, color: INK, valign: 'top', paraSpaceAfter: 5, isTextBox: true, margin: 0 }
      );
    };
    box(model.meta.monthName, li.doneThisMonth, TOP + 0.2, HEAD_GREY);
    box('Next month plan', li.nextMonthPlan, TOP + 2.95, HEAD_GREEN);
    footnote(s, 'Followers: page total at month end. Achieved: followers gained in the month, from the portal’s LinkedIn sync.');
  }

  // =====================================================
  // 8. Project inauguration plan
  // =====================================================
  {
    const ina = model.inaugurations;
    const s = chrome(`Project Inauguration Plan – ${model.meta.fiscalYear.replace('FY', 'FY 20').replace('-', '–')}`);
    const tw = (W - M * 2 - 0.3 * 3) / 4;
    [
      { value: ina.target, label: 'Target' },
      { value: ina.completed, label: 'Completed', accent: true },
      { value: ina.ongoing, label: 'Ongoing' },
      { value: `${ina.overallPct}%`, label: 'Overall progress' },
    ].forEach((t, i) => tile(s, { x: M + i * (tw + 0.3), y: TOP + 0.15, w: tw, ...t }));
    table(s, {
      y: TOP + 1.45,
      head: ['Event', 'Status', 'Progress', 'Next Action'],
      colW: [4.4, 1.5, 1.5, 5.03],
      rows: ina.items.map((i) => [
        { text: i.event, align: 'left', bold: true },
        { text: i.status, color: statusColor(i.status), bold: true },
        `${Number(i.progress) || 0}%`,
        { text: i.nextAction, align: 'left' },
      ]),
      fontSize: 10.5, rowH: 0.42,
    });
  }

  // =====================================================
  // 9. Collaterals and videos
  // =====================================================
  {
    const c = model.collaterals;
    const s = chrome('Collaterals and Videos');
    const half = (W - M * 2 - 0.3) / 2;
    const shape = (rows) => rows.map((r) => [{ text: r.project, align: 'left' }, r.location, r.month, r.type, { text: r.status, color: statusColor(r.status), bold: true }]);
    const colW = [half * 0.3, half * 0.2, half * 0.12, half * 0.2, half * 0.18];
    table(s, { x: M, y: TOP + 0.2, w: half, head: ['Project', 'Location', 'Month', 'Type', 'Status'], colW, rows: shape(c.completed || []), fontSize: 9.5, rowH: 0.34, headFill: HEAD_GREEN });
    table(s, { x: M + half + 0.3, y: TOP + 0.2, w: half, head: ['Project', 'Location', 'Month', 'Type', 'Status'], colW, rows: shape(c.planned || []), fontSize: 9.5, rowH: 0.34 });
  }

  // =====================================================
  // 10. Open export opportunities
  // =====================================================
  {
    const eo = model.exportOpps;
    const s = chrome('Open Export Opportunities');
    const rows = eo.rows.map((r) => [
      { text: r.name, align: 'left', bold: true }, r.stage, r.country, r.product, dash(r.carSpaces),
      r.amountUsdMn != null ? `${r.amountUsdMn} Mn` : '', prettyDate(r.closeDate),
    ]);
    rows.push(['TOTAL', '', '', '', '', `${eo.totalUsdMn} Mn`, '']);
    table(s, {
      y: TOP + 0.2,
      head: ['Opportunity name', 'Stage', 'Country', 'Product', 'Car spaces', 'Opp Amount (USD)', 'Close date'],
      colW: [4.4, 1.3, 1.6, 1.4, 1.2, 1.4, 1.13],
      rows, fontSize: 10, rowH: 0.38, boldLast: true,
    });
    footnote(s, 'From Salesforce: open Sieger Parking opportunities priced in a foreign currency, past Qualification. Country, product and car spaces are filled in where Salesforce has none.');
  }

  // =====================================================
  // 11. Agents
  // =====================================================
  {
    const a = model.agents;
    const s = chrome(a.title || 'Agents');
    table(s, {
      y: TOP + 0.2,
      head: ['Month', 'Agent Name', 'Location', 'Potential', 'Status', 'Next Action'],
      colW: [1.0, 2.6, 1.9, 2.2, 3.0, 1.73],
      rows: (a.items || []).map((i) => [i.month, { text: i.name, align: 'left', bold: true }, i.location, i.potential, { text: i.status, align: 'left' }, i.nextAction]),
      fontSize: 10.5, rowH: 0.42,
    });
  }

  // =====================================================
  // 12. Thank you
  // =====================================================
  {
    const s = pres.addSlide();
    s.background = { color: COVER };
    if (LOGO) s.addImage({ data: LOGO, x: (W - 2.6) / 2, y: 1.9, w: 2.6, h: 2.6 * (130 / 379) });
    s.addText('MANAGEMENT REVIEW MEETING', { x: 1, y: 3.1, w: W - 2, h: 0.5, fontFace: FONT, fontSize: 20, color: 'E4D9D9', align: 'center', isTextBox: true, margin: 0 });
    s.addText('THANK YOU', { x: 1, y: 3.65, w: W - 2, h: 1.0, fontFace: FONT, fontSize: 44, bold: true, color: WHITE, align: 'center', isTextBox: true, margin: 0 });
  }

  return pres.write({ outputType: 'nodebuffer' });
};

module.exports = { renderMrm };
