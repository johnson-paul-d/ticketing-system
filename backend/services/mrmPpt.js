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
    s.addText(`Marketing  ·  ${model.meta.fiscalYear}`, {
      x: 1, y: 4.5, w: W - 2, h: 0.36, fontFace: FONT, fontSize: 12, color: 'B79A9A', align: 'center', isTextBox: true, margin: 0,
    });
    s.addNotes(
      `Generated by the Sieger portal on ${model.meta.generatedAt}${model.meta.generatedBy ? ` by ${model.meta.generatedBy}` : ''}. ` +
        `Salesforce mirror synced ${model.meta.salesforce.syncedAt || 'n/a'}.` +
        (model.warnings.length ? ` Warnings: ${model.warnings.join(' | ')}` : '')
    );
  }

  // =====================================================
  // 2. Marketing qualified pipeline – overview
  // =====================================================
  const fyTitle = model.meta.fiscalYear.replace('FY', 'FY 20').replace('-', '–');
  const money = (v, unit = '') => (v == null ? '—' : `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}${unit}`);
  const FUNNEL_HEAD = ['Spend (₹ L)', 'Leads', 'Converted', 'Opps', 'Quotes', 'Pipeline (₹ Cr)', 'Pipeline per ₹1 L spend (₹ Cr)'];
  const funnelCells = (c) => [money(c.spendLakh), c.leads, c.converted, c.opps, c.quotes, money(c.pipelineCr), c.efficiency == null ? '—' : money(c.efficiency)];
  {
    const f = model.funnel;
    const s = chrome('Marketing Qualified Pipeline – Overview', `Spend → leads → converted → opportunities → quotes → pipeline (open quotes), by division · ${fyTitle}`);
    const colW = [2.6, 1.35, 1.1, 1.2, 1.0, 1.0, 1.65, 2.53];
    const block = (title, y, pick) => {
      s.addText(title, { x: M, y, w: W - M * 2, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: BAR, isTextBox: true, margin: 0 });
      const rows = f.divisions.map((d) => [{ text: d.label, align: 'left', bold: true }, ...funnelCells(pick(d.marketingTotal))]);
      rows.push(['Marketing sources – all divisions', ...funnelCells(pick(f.overall.marketing))]);
      rows.push([{ text: 'Including sales-created', align: 'left', color: MUTED }, ...funnelCells(pick(f.overall.total)).map((t) => ({ text: t, color: MUTED }))]);
      table(s, { y: y + 0.3, head: ['Division', ...FUNNEL_HEAD], colW, rows, fontSize: 9.5, rowH: 0.34, boldLast: false });
    };
    block(`${model.meta.monthName.toUpperCase()} ${model.meta.year}`, TOP + 0.05, (x) => x.month);
    block(`FISCAL YEAR TO DATE (${model.meta.ytdLabel})`, TOP + 0.05 + 0.3 + 0.34 * (f.divisions.length + 3) + 0.25, (x) => x.ytd);
    footnote(s, `Marketing sources: ${f.sources.filter((x) => x.key !== 'other').map((x) => x.label).join(', ')}. Pipeline: open quotes on opportunities created in the period. Spend: Google Ads for Ads; other sources as entered. Sales-created rows are opportunities with no marketing source.`);
  }

  // =====================================================
  // 3–5. One slide per division: sources, month and YTD, with a trend
  // =====================================================
  for (const d of model.funnel.divisions) {
    const s = chrome(`Marketing Qualified Pipeline – ${d.label}`, `Per source: ${model.meta.monthName} and fiscal year to date (${model.meta.ytdLabel})`);
    const mon = model.meta.monthName.slice(0, 3).toUpperCase();
    const groups = ['Spend (₹ L)', 'Leads', 'Converted', 'Opps', 'Quotes', 'Pipeline (₹ Cr)', 'Cr per ₹1 L'];
    const cw = (W - M * 2 - 2.3) / (groups.length * 2);
    const colW = [2.3, ...Array(groups.length * 2).fill(cw)];
    const hdr = (text, opts = {}) => ({
      text,
      options: { fill: { color: HEAD }, color: WHITE, bold: true, align: 'center', valign: 'middle', fontFace: FONT, fontSize: 8.5, ...opts },
    });
    const head1 = [hdr('Source', { rowspan: 2, align: 'left' }), ...groups.map((g) => hdr(g, { colspan: 2 }))];
    const head2 = groups.flatMap(() => [hdr(mon, { fill: { color: '6E1515' } }), hdr('YTD', { fill: { color: '6E1515' } })]);
    const pair = (c) => {
      const m = funnelCells(c.month);
      const y = funnelCells(c.ytd);
      return m.flatMap((v, i) => [v, y[i]]);
    };
    const body = [];
    const rowOf = (label, cells, opts = {}) => {
      const fill = opts.total ? 'EADCDC' : body.length % 2 === 0 ? BAND : BAND_ALT;
      body.push([
        { text: label, options: { fill: { color: fill }, color: opts.color || INK, bold: Boolean(opts.bold), align: 'left', valign: 'middle', fontFace: FONT, fontSize: 8.5 } },
        ...cells.map((v, i) => ({
          text: dash(v),
          options: { fill: { color: fill }, color: opts.color || (i % 2 === 0 ? INK : MUTED), bold: Boolean(opts.bold), align: 'center', valign: 'middle', fontFace: FONT, fontSize: 8.5 },
        })),
      ]);
    };
    d.sources.filter((x) => x.marketing).forEach((x) => rowOf(x.label, pair(x)));
    rowOf('Marketing sources', pair(d.marketingTotal), { bold: true, total: true });
    const other = d.sources.find((x) => !x.marketing);
    if (other) rowOf(other.label, pair(other), { color: MUTED });
    rowOf('Division total', pair(d.total), { bold: true, total: true });
    s.addTable([head1, head2, ...body], { x: M, y: TOP + 0.1, w: W - M * 2, colW, border: { type: 'solid', color: RULE, pt: 0.75 }, rowH: 0.3, margin: 0.04, autoPage: false });

    const chartY = TOP + 0.1 + 0.3 * (body.length + 2) + 0.25;
    const chartH = H - chartY - 0.5;
    if (chartH > 1.4) {
      const cwid = (W - M * 2 - 0.3) / 2;
      const ser = (name, values) => ({ categories: d.trend.categories, current: { name, values }, previous: null, target: null });
      lineChart(s, `${d.label} – marketing leads by month`, ser('Leads', d.trend.leads), { x: M, y: chartY, w: cwid, h: chartH });
      lineChart(s, `${d.label} – converted by month`, ser('Converted', d.trend.converted), { x: M + cwid + 0.3, y: chartY, w: cwid, h: chartH });
    }
    footnote(s, 'Left figure in each pair is the month, right (grey) is fiscal year to date. Pipeline: open quotes on opportunities created in the period, at Salesforce currency rates.');
  }

  // =====================================================
  // 6. Targeted ABM account conversion
  // =====================================================
  {
    const a = model.abm;
    const s = chrome('Targeted ABM Account Conversion', 'Accounts identified · status · quotation · action required');
    const tw = (W - M * 2 - 0.3 * 3) / 4;
    [
      { value: a.totals.accounts, label: 'Accounts on the list' },
      { value: a.totals.meetings, label: 'Meeting / proposal / negotiation', accent: true },
      { value: a.totals.quoted, label: 'With a quotation' },
      { value: a.totals.quotationLakh ? `₹${money(a.totals.quotationLakh)} L` : '—', label: 'Quotation value' },
    ].forEach((t, i) => tile(s, { x: M + i * (tw + 0.3), y: TOP + 0.1, w: tw, h: 0.85, ...t }));
    const clip = (t, n) => (String(t || '').length > n ? `${String(t).slice(0, n - 1)}…` : String(t || ''));
    // Every cell is kept to one line so the table height stays predictable.
    const MAX_ROWS = 12;
    const rows = a.rows.slice(0, MAX_ROWS).map((r) => [
      { text: clip(r.account, 24), align: 'left', bold: true }, clip(r.division, 15), clip(r.country, 13), r.tier, clip(r.owner, 15),
      { text: clip(r.status, 18), color: statusColor(r.status), bold: true },
      r.openOpps == null ? '—' : r.openOpps,
      r.quotationLakh != null ? `${money(r.quotationLakh)} L${r.quotationSource === 'typed' ? ' *' : ''}` : '—',
      { text: clip(r.lastActivity, 26), align: 'left' },
      { text: clip(r.action, 34), align: 'left' },
    ]);
    table(s, {
      y: TOP + 1.15,
      head: ['Account', 'Division', 'Country', 'Tier', 'Owner', 'Status', 'Opps', 'Quotation', 'Last activity', 'Action required'],
      colW: [1.9, 1.15, 1.0, 0.6, 1.15, 1.35, 0.5, 0.9, 1.85, 2.03],
      rows: rows.length ? rows : [['No accounts ticked yet – tick them under "ABM accounts" on the MRM page', '', '', '', '', '', '', '', '', '']],
      fontSize: 8, rowH: 0.3,
    });
    footnote(s, `From the portal's ABM module: status, owner, opportunities and last activity. Quotation: the module's opportunities, else open quotes in Salesforce; * typed on the MRM page.${a.rows.length > MAX_ROWS ? ` Showing ${MAX_ROWS} of ${a.rows.length} accounts.` : ''}`);
  }

  // =====================================================
  // 7. Expo plan and actuals
  // =====================================================
  {
    const ex = model.exhibitions;
    const s = chrome(`Expo Plan & Actuals – ${fyTitle}`, 'Exhibition-wise spend, leads and conversion · strategic new exhibitions identified');
    const rows = ex.rows.map((r) => [
      { text: r.name, align: 'left' },
      { text: r.status, color: statusColor(r.status), bold: true },
      r.budgetLakh != null ? `${r.budgetLakh} L` : '—',
      r.spendLakh != null ? `${r.spendLakh} L` : '—',
      dash(r.leads), dash(r.converted),
      r.opportunityAmountLakh ? `${r.opportunityAmountLakh} L` : '—',
      { text: r.remarks, align: 'left' },
    ]);
    rows.push(['TOTAL', '', '', `${ex.totals.spendLakh} L`, ex.totals.leads, ex.totals.converted, '', '']);
    const rowH = ex.rows.length > 9 ? 0.28 : 0.33;
    table(s, {
      y: TOP + 0.1,
      head: ['Exhibition', 'Status', 'Budget', 'Spend', 'Leads', 'Converted', 'Opp amount', 'Remarks'],
      colW: [3.1, 0.9, 0.9, 0.9, 0.8, 0.95, 1.1, 3.78],
      rows, fontSize: 9, rowH, boldLast: true,
    });
    const ny = TOP + 0.1 + rowH * (rows.length + 1) + 0.3;
    if (ny < H - 1.4) {
      s.addText('STRATEGIC NEW EXHIBITIONS IDENTIFIED', { x: M, y: ny, w: W - M * 2, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: BAR, isTextBox: true, margin: 0 });
      const ne = (ex.newExpos || []).map((r) => [{ text: r.name, align: 'left', bold: true }, r.city, r.month, { text: r.rationale, align: 'left' }, { text: r.status, color: statusColor(r.status), bold: true }]);
      table(s, {
        y: ny + 0.3,
        head: ['Exhibition', 'City', 'When', 'Why it matters', 'Status'],
        colW: [3.1, 1.6, 1.3, 5.23, 1.2],
        rows: ne.length ? ne : [['None identified this month', '', '', '', '']],
        fontSize: 9, rowH: 0.3, headFill: HEAD_GREEN,
      });
    }
    footnote(s, 'Leads and conversions: Salesforce leads with source Trade Show, created during the event window. Spend: as entered, or from approved expense claims.');
  }

  // =====================================================
  // 8. Exhibition lead status by salesperson
  // =====================================================
  {
    const ex = model.exhibitions;
    const s = chrome(`Exhibition Lead Status – ${fyTitle}`);
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
  // 9. Brand visibility – LinkedIn
  // =====================================================
  {
    const li = model.linkedin;
    const pages = li.pages && li.pages.length ? li.pages : [li];
    const s = chrome('Brand Visibility – LinkedIn', `${model.meta.monthName} ${model.meta.year} LinkedIn followers – target vs actual, per page`);
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
  // 10. Brand visibility – engagement activities and SEO
  // =====================================================
  {
    const en = model.engagement;
    const seo = model.seo;
    const s = chrome('Brand Visibility – Engagement & SEO', `Customer engagement activities plan vs actual · targeted keywords and Google rank · ${model.meta.monthName} ${model.meta.year}`);
    const half = (W - M * 2 - 0.4) / 2;
    const tw = (half - 0.2 * 2) / 3;
    // Left: engagement
    s.addText('CUSTOMER ENGAGEMENT ACTIVITIES', { x: M, y: TOP + 0.05, w: half, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: BAR, isTextBox: true, margin: 0 });
    [
      { value: en.plan, label: 'Planned this month' },
      { value: en.actual, label: 'Completed', accent: true },
      { value: `${en.ytdActual}/${en.ytdPlan}`, label: 'YTD done / planned' },
    ].forEach((t, i) => tile(s, { x: M + i * (tw + 0.2), y: TOP + 0.38, w: tw, h: 0.8, ...t }));
    const enRows = en.rows.slice(0, 11).map((r) => [
      { text: r.title.length > 42 ? `${r.title.slice(0, 41)}…` : r.title, align: 'left' }, r.division, prettyDate(r.due),
      { text: r.status, color: statusColor(r.status), bold: true },
    ]);
    table(s, {
      x: M, y: TOP + 1.35, w: half,
      head: ['Activity', 'Division', 'Due', 'Status'],
      colW: [half * 0.52, half * 0.14, half * 0.17, half * 0.17],
      rows: enRows.length ? enRows : [['No engagement activities found for this month', '', '', '']],
      fontSize: 8.5, rowH: 0.28,
    });
    // Right: SEO
    const rx = M + half + 0.4;
    s.addText('SEO RESULTS & KEYWORD RANKING', { x: rx, y: TOP + 0.05, w: half, h: 0.28, fontFace: FONT, fontSize: 11, bold: true, color: BAR, isTextBox: true, margin: 0 });
    [
      { value: seo.targeted, label: 'Targeted keywords' },
      { value: seo.top10, label: 'In Google top 10', accent: true },
      { value: seo.avgRank == null ? '—' : seo.avgRank, label: 'Average rank' },
    ].forEach((t, i) => tile(s, { x: rx + i * (tw + 0.2), y: TOP + 0.38, w: tw, h: 0.8, ...t }));
    const arrow = (c) => (c == null ? '—' : c > 0 ? { text: `▲ ${c}`, color: GOOD, bold: true } : c < 0 ? { text: `▼ ${Math.abs(c)}`, color: BAD, bold: true } : '=');
    const seoRows = seo.rows.slice(0, 11).map((r) => [{ text: r.keyword, align: 'left' }, r.division, dash(r.rank), dash(r.prevRank), arrow(r.change)]);
    table(s, {
      x: rx, y: TOP + 1.35, w: half,
      head: ['Keyword', 'Division', 'Rank', 'Prev month', 'Change'],
      colW: [half * 0.44, half * 0.14, half * 0.13, half * 0.15, half * 0.14],
      rows: seoRows.length ? seoRows : [['No keywords entered yet – add them under "SEO keywords" on the MRM page', '', '', '', '']],
      fontSize: 8.5, rowH: 0.28,
    });
    footnote(s, `Engagement: portal tickets in ${en.describe}; plan = due in the month, actual = completed in the month. SEO ranks are entered monthly.${seo.notes ? ` ${seo.notes}` : ''}`);
  }

  // =====================================================
  // 11. Collateral plan vs actual
  // =====================================================
  {
    const c = model.collaterals;
    const p = c.planVsActual || { plan: 0, actual: 0, ytdPlan: 0, ytdActual: 0, open: 0 };
    const s = chrome('Monthly Collateral Plan vs Actual', `Videos, animations and collaterals from tickets raised by the sales team · ${model.meta.monthName} ${model.meta.year}`);
    const tw = (W - M * 2 - 0.3 * 3) / 4;
    [
      { value: p.plan, label: 'Planned (due this month)' },
      { value: p.actual, label: 'Completed this month', accent: true },
      { value: `${p.ytdActual}/${p.ytdPlan}`, label: 'YTD completed / planned' },
      { value: p.open, label: 'Open requests' },
    ].forEach((t, i) => tile(s, { x: M + i * (tw + 0.3), y: TOP + 0.1, w: tw, h: 0.85, ...t }));
    const half = (W - M * 2 - 0.3) / 2;
    const shape = (rows) => rows.slice(0, 12).map((r) => [{ text: r.project, align: 'left' }, r.location, r.month, r.type, { text: r.status, color: statusColor(r.status), bold: true }]);
    const colW = [half * 0.34, half * 0.18, half * 0.12, half * 0.18, half * 0.18];
    s.addText('COMPLETED', { x: M, y: TOP + 1.1, w: half, h: 0.26, fontFace: FONT, fontSize: 10, bold: true, color: HEAD_GREEN, isTextBox: true, margin: 0 });
    s.addText('PLANNED / IN PROGRESS', { x: M + half + 0.3, y: TOP + 1.1, w: half, h: 0.26, fontFace: FONT, fontSize: 10, bold: true, color: BAR, isTextBox: true, margin: 0 });
    table(s, { x: M, y: TOP + 1.38, w: half, head: ['Project', 'Location', 'Month', 'Type', 'Status'], colW, rows: shape(c.completed || []), fontSize: 9, rowH: 0.3, headFill: HEAD_GREEN });
    table(s, { x: M + half + 0.3, y: TOP + 1.38, w: half, head: ['Project', 'Location', 'Month', 'Type', 'Status'], colW, rows: shape(c.planned || []), fontSize: 9, rowH: 0.3 });
    const more = (c.planned || []).length > 12 ? ` Planned list shows the first 12 of ${(c.planned || []).length} by due date.` : '';
    footnote(s, (c.fromTickets
      ? 'Rows: tickets ticked on the MRM page. Counts: every ticket in the collateral categories.'
      : c.autoListed
        ? 'Rows and counts: every ticket in the collateral categories (tick tickets on the MRM page to choose which are listed).'
        : 'Rows are typed in; tick tickets on the MRM page to list them from the portal. Counts: every ticket in the collateral categories.') + more);
  }

  // =====================================================
  // 12. Thank you (last slide)
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
