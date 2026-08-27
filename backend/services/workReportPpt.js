// =====================================================
// The work report, as a PowerPoint deck
// =====================================================
// Built to match the MRM deck the team already presents — maroon title bar with
// the logo on the right, and work listed in banded tables. The point is that a
// report pulled from the portal can be dropped straight into the monthly review
// without anyone restyling it first.
//
// Two shapes come out of here. A personal deck goes deep on one person; a team
// deck gives each person a comparable slide. Both are built from the same
// record, so a figure can never differ between them.

const fs = require('fs');
const path = require('path');
const pptxgen = require('pptxgenjs');

// House colours, sampled from the MRM deck rather than guessed.
const BAR = '7B1A1A'; // the title bar
const COVER = '2B0A0A'; // cover background
const HEAD = '5B9BD5'; // table header
const BAND = 'EAEFF7'; // banded row
const BAND_ALT = 'F7F9FC';
const GREEN = '1E7A3C'; // the second table header the deck uses
const INK = '1A1A1A';
const WHITE = 'FFFFFF';
const MUTED = '6E6459';
const SOFT = 'D8D2C7';
const MID = '8C8C8C';
const PALE = 'BFB8AE';
const RULE = 'D9DEE7';

// Poppins is the house face and is what the MRM deck uses throughout. Where it
// is missing PowerPoint substitutes, which is why nothing here depends on its
// exact metrics for fit.
const FONT = 'Poppins';

const W = 13.333;
const H = 7.5;
const M = 0.45;
const BAR_H = 0.62;
const BODY_TOP = BAR_H + 0.45;

// Read once at module load — the same bytes go into every deck.
const LOGO = (() => {
  try {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'assets', 'sieger-logo-white.png'));
    return `image/png;base64,${buf.toString('base64')}`;
  } catch {
    // A missing logo must not cost anyone their report.
    return null;
  }
})();
const LOGO_W = 1.55;
const LOGO_H = LOGO_W * (130 / 379); // the asset's own aspect ratio

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const pretty = (iso) => {
  if (!iso) return '—';
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};

const targetMonth = (iso) => {
  if (!iso) return '—';
  const [, m] = String(iso).split('-').map(Number);
  return LONG_MONTHS[m - 1] || String(iso);
};

const windowLabel = (w) => {
  if (!w.from && !w.to) return 'All time';
  if (w.from && w.to) return `${pretty(w.from)} – ${pretty(w.to)}`;
  return w.from ? `From ${pretty(w.from)}` : `Up to ${pretty(w.to)}`;
};

const clip = (text, max) => {
  const s = String(text || '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// pptxgenjs rewrites option objects to EMU in place on first use, so a shared
// shadow silently corrupts the second shape that borrows it.
const shadow = () => ({ type: 'outer', color: '000000', blur: 7, offset: 1.5, angle: 90, opacity: 0.09 });

const buildDeck = (report) => {
  const pres = new pptxgen();
  pres.layout = 'LAYOUT_WIDE';
  pres.author = 'Sieger Ticketing System';
  pres.company = 'Sieger';

  const single = report.people.length === 1 && report.scope !== 'team';
  const subject = single ? report.people[0].person.name : `${report.team || 'Team'} Team`;
  pres.title = `${subject} — Work Report`;

  const winLabel = windowLabel(report.window);
  const basis = report.window.dateFieldLabel;

  // ---------------------------------------------------
  // Slide chrome: the maroon bar, the title, the logo
  // ---------------------------------------------------
  const chrome = (title) => {
    const s = pres.addSlide();
    s.addShape(pres.ShapeType.rect, {
      x: 0, y: 0, w: W, h: BAR_H, fill: { color: BAR }, line: { color: BAR },
    });
    s.addText(String(title).toUpperCase(), {
      x: M - 0.1, y: 0, w: W - LOGO_W - M * 2, h: BAR_H,
      fontFace: FONT, fontSize: 19, bold: true, color: WHITE,
      valign: 'middle', isTextBox: true, margin: 0,
    });
    if (LOGO) {
      s.addImage({
        data: LOGO,
        x: W - M - LOGO_W, y: (BAR_H - LOGO_H) / 2, w: LOGO_W, h: LOGO_H,
      });
    }
    return s;
  };

  const footnote = (s, text) =>
    s.addText(text, {
      x: M, y: H - 0.44, w: W - M * 2, h: 0.3,
      fontFace: FONT, fontSize: 8.5, color: MUTED, isTextBox: true, margin: 0,
    });

  // A banded table in the deck's own style.
  const table = (s, { head, rows, x = M, y, w = W - M * 2, colW, fontSize = 11, align }) => {
    const header = head.map((h) => ({
      text: h,
      options: {
        fill: { color: HEAD }, color: WHITE, bold: true, align: 'center', valign: 'middle',
        fontFace: FONT, fontSize: fontSize + 0.5,
      },
    }));
    const body = rows.map((row, i) =>
      row.map((cell, c) => ({
        text: String(cell ?? '—'),
        options: {
          fill: { color: i % 2 === 0 ? BAND : BAND_ALT },
          color: INK, align: align?.[c] || 'center', valign: 'middle',
          fontFace: FONT, fontSize,
        },
      }))
    );
    s.addTable([header, ...body], {
      x, y, w, colW,
      border: { type: 'solid', color: RULE, pt: 0.75 },
      autoPage: false,
      rowH: 0.34,
      margin: 0.06,
    });
  };

  const statRow = (s, y, cells) => {
    const gap = 0.32;
    const cw = (W - M * 2 - gap * (cells.length - 1)) / cells.length;
    cells.forEach((c, i) => {
      const x = M + i * (cw + gap);
      s.addShape(pres.ShapeType.roundRect, {
        x, y, w: cw, h: 1.32, rectRadius: 0.07,
        fill: { color: BAND }, line: { color: RULE, width: 0.75 }, shadow: shadow(),
      });
      s.addText(String(c.value), {
        x: x + 0.18, y: y + 0.16, w: cw - 0.36, h: 0.62,
        fontFace: FONT, fontSize: 30, bold: true, color: c.accent ? BAR : INK,
        align: 'center', isTextBox: true, margin: 0,
      });
      s.addText(String(c.label).toUpperCase(), {
        x: x + 0.12, y: y + 0.8, w: cw - 0.24, h: 0.24,
        fontFace: FONT, fontSize: 8.5, bold: true, color: INK,
        align: 'center', charSpacing: 0.8, isTextBox: true, margin: 0,
      });
      if (c.note) {
        s.addText(c.note, {
          x: x + 0.12, y: y + 1.03, w: cw - 0.24, h: 0.24,
          fontFace: FONT, fontSize: 8, color: MUTED, align: 'center', isTextBox: true, margin: 0,
        });
      }
    });
  };

  const sectionTitle = (s, text, x, y, w) =>
    s.addText(text, {
      x, y, w, h: 0.32,
      fontFace: FONT, fontSize: 15, bold: true, color: BAR,
      align: 'center', isTextBox: true, margin: 0,
    });

  const ui = { pres, chrome, table, statRow, sectionTitle, footnote, winLabel, basis };

  // =====================================================
  // Cover
  // =====================================================
  {
    const s = pres.addSlide();
    s.background = { color: COVER };
    if (LOGO) {
      s.addImage({ data: LOGO, x: (W - 2.5) / 2, y: 1.75, w: 2.5, h: 2.5 * (130 / 379) });
    }
    s.addText(single ? `${subject} — Work Report` : `${subject} — Work Report`, {
      x: 1.0, y: 2.95, w: W - 2.0, h: 1.3,
      fontFace: FONT, fontSize: 40, bold: true, color: WHITE,
      align: 'center', valign: 'middle', isTextBox: true, margin: 0,
    });
    s.addText(winLabel, {
      x: 1.0, y: 4.3, w: W - 2.0, h: 0.42,
      fontFace: FONT, fontSize: 17, color: 'E4D9D9', align: 'center', isTextBox: true, margin: 0,
    });

    const totals = report.people.reduce(
      (a, p) => ({
        assigned: a.assigned + p.totals.assigned,
        completed: a.completed + p.totals.completed,
      }),
      { assigned: 0, completed: 0 }
    );
    s.addText(
      `${totals.assigned} tickets  ·  ${totals.completed} completed  ·  filtered on ${basis.toLowerCase()}`,
      {
        x: 1.0, y: 4.78, w: W - 2.0, h: 0.36,
        fontFace: FONT, fontSize: 11.5, color: 'B79A9A', align: 'center', isTextBox: true, margin: 0,
      }
    );
    s.addText(`Generated ${pretty(report.generatedOn)} by ${report.viewer.name}`, {
      x: 1.0, y: H - 0.9, w: W - 2.0, h: 0.3,
      fontFace: FONT, fontSize: 9.5, color: '8A6C6C', align: 'center', isTextBox: true, margin: 0,
    });
    s.addNotes(
      `Work filtered on ${basis.toLowerCase()} between ${report.window.from || 'the beginning'} and ` +
        `${report.window.to || 'today'}. Read from the ticketing system on ${report.generatedOn}.`
    );
  }

  if (single) buildPersonalSlides(report, report.people[0], ui);
  else buildTeamSlides(report, ui);

  return pres;
};

// -----------------------------------------------------
// A full deck about one person
// -----------------------------------------------------
function buildPersonalSlides(report, rec, ui) {
  const { pres, chrome, table, statRow, sectionTitle, footnote } = ui;
  const t = rec.totals;
  const who = rec.person.name;

  // --- Summary ---
  {
    const s = chrome('Summary');
    s.addText([rec.person.designation, rec.person.role].filter(Boolean).join('  ·  '), {
      x: M, y: BODY_TOP - 0.34, w: 8, h: 0.3,
      fontFace: FONT, fontSize: 11.5, color: MUTED, isTextBox: true, margin: 0,
    });

    statRow(s, BODY_TOP + 0.05, [
      { value: t.assigned, label: 'Tickets' },
      { value: t.completed, label: 'Completed', accent: true, note: `${t.completionRate}% of the window` },
      { value: t.open, label: 'Still open' },
      { value: t.overdueOpen, label: 'Past due' },
      {
        value: t.onTimeRate === null ? '—' : `${t.onTimeRate}%`,
        label: 'On time',
        note: t.judged ? `${t.onTime} of ${t.judged}` : 'not measurable',
      },
    ]);

    // Status split, as a table rather than a chart — it reads faster and
    // matches how the MRM deck states this kind of breakdown.
    sectionTitle(s, 'Status breakdown', M, BODY_TOP + 1.7, 5.9);
    table(s, {
      head: ['Status', 'Tickets', 'Share'],
      rows: rec.byStatus.map((r) => [
        r.label,
        r.count,
        `${Math.round((r.count / t.assigned) * 100)}%`,
      ]),
      x: M, y: BODY_TOP + 2.1, w: 5.9,
      colW: [2.9, 1.5, 1.5],
      align: ['left', 'center', 'center'],
    });

    const notes = [];
    notes.push(`Counts only tickets whose ${report.window.dateFieldLabel.toLowerCase()} falls inside ${ui.winLabel}.`);
    if (t.judged) {
      const unjudged = Math.max(0, t.completed - t.judged);
      notes.push(
        `On time is measured on the ${t.judged} completed ticket${t.judged === 1 ? '' : 's'} carrying both a due date and a completion date` +
          (unjudged ? `; the other ${unjudged} cannot be judged and are excluded rather than counted as misses.` : '.')
      );
    } else if (t.completed) {
      notes.push('No completed ticket here carries both a due date and a completion date, so timeliness cannot be measured.');
    }
    notes.push(
      t.ticketsWithTime < t.assigned
        ? `Time is logged on ${t.ticketsWithTime} of ${t.assigned} tickets, so ${t.hoursLogged}h is a floor on effort, not a measure of it.`
        : 'Time is logged on every ticket in this window.'
    );

    sectionTitle(s, 'How to read these', 6.75, BODY_TOP + 1.7, W - M - 6.75);
    s.addShape(pres.ShapeType.roundRect, {
      x: 6.75, y: BODY_TOP + 2.1, w: W - M - 6.75, h: 1.72, rectRadius: 0.07,
      fill: { color: WHITE }, line: { color: RULE, width: 1 },
    });
    s.addText(
      notes.map((n, i) => ({ text: n, options: { bullet: true, breakLine: i < notes.length - 1 } })),
      {
        x: 7.0, y: BODY_TOP + 2.26, w: W - M - 7.25, h: 1.45,
        fontFace: FONT, fontSize: 9.5, color: INK, lineSpacing: 13, paraSpaceAfter: 6,
        isTextBox: true, margin: 0, valign: 'top',
      }
    );

    footnote(s, `${who} · ${ui.winLabel} · filtered on ${ui.basis.toLowerCase()}`);
  }

  // --- Planned vs actual ---
  {
    const s = chrome('Planned vs Actual');

    if (t.comparableCount > 0) {
      const diff = Math.round((t.comparableActualHours - t.comparablePlannedHours) * 10) / 10;
      statRow(s, BODY_TOP, [
        { value: `${t.comparablePlannedHours}h`, label: 'Planned', note: `${t.comparableCount} comparable tickets` },
        { value: `${t.comparableActualHours}h`, label: 'Actually logged', accent: true },
        { value: `${diff > 0 ? '+' : ''}${diff}h`, label: diff > 0 ? 'Over budget' : 'Under budget' },
      ]);

      table(s, {
        head: ['Work', 'Planned', 'Actual', 'Variance', 'Status'],
        rows: rec.plannedVsActual.map((r) => {
          const v = Math.round((r.actualHours - r.plannedHours) * 10) / 10;
          return [
            clip(r.title, 58),
            `${r.plannedHours}h`,
            `${r.actualHours}h`,
            `${v > 0 ? '+' : ''}${v}h`,
            r.status,
          ];
        }),
        y: BODY_TOP + 1.62,
        colW: [5.6, 1.35, 1.35, 1.45, 2.68],
        align: ['left', 'center', 'center', 'center', 'center'],
      });

      footnote(
        s,
        `Compared across the ${t.comparableCount} ticket${t.comparableCount === 1 ? '' : 's'} carrying both a time budget and a logged entry. ` +
          `Tickets with only one of the two are excluded — the gap there is a recording gap, not a variance.`
      );
    } else {
      statRow(s, BODY_TOP, [
        { value: `${t.hoursPlanned}h`, label: 'Total planned', note: `${t.ticketsWithPlan} tickets with a budget` },
        { value: `${t.hoursLogged}h`, label: 'Total logged', accent: true, note: `${t.ticketsWithTime} tickets with entries` },
        { value: t.comparableCount, label: 'Comparable', note: 'carrying both' },
      ]);
      s.addShape(pres.ShapeType.roundRect, {
        x: M, y: BODY_TOP + 1.7, w: W - M * 2, h: 1.5, rectRadius: 0.07,
        fill: { color: WHITE }, line: { color: RULE, width: 1 },
      });
      s.addText('Nothing to compare yet', {
        x: M + 0.35, y: BODY_TOP + 1.92, w: W - M * 2 - 0.7, h: 0.4,
        fontFace: FONT, fontSize: 17, bold: true, color: INK, isTextBox: true, margin: 0,
      });
      s.addText(
        `A planned-versus-actual comparison needs one ticket to carry both an allotted time budget and at least one logged time entry. ` +
          `In this window ${t.ticketsWithPlan} ticket${t.ticketsWithPlan === 1 ? ' has' : 's have'} a budget and ` +
          `${t.ticketsWithTime} ${t.ticketsWithTime === 1 ? 'has' : 'have'} logged time, but none have both.`,
        {
          x: M + 0.35, y: BODY_TOP + 2.36, w: W - M * 2 - 0.7, h: 0.8,
          fontFace: FONT, fontSize: 11, color: MUTED, isTextBox: true, margin: 0, valign: 'top',
        }
      );
    }
  }

  // --- Work completed ---
  if (rec.completedRecent.length) {
    const s = chrome('Work Completed');
    table(s, {
      head: ['Work', 'Division', 'Completed', 'Against Due Date'],
      rows: rec.completedRecent.map((h) => [
        clip(h.title, 62),
        h.division || '—',
        pretty(h.completedDate),
        h.onTime === true ? 'On time' : h.onTime === false ? 'Late' : 'No due date',
      ]),
      y: BODY_TOP,
      colW: [6.4, 1.9, 2.1, 2.03],
      align: ['left', 'center', 'center', 'center'],
    });
    footnote(
      s,
      `The ${rec.completedRecent.length} most recently completed of ${t.completed} in this window. ` +
        `"Against due date" is blank where the ticket carries no due date or no completion date.`
    );
  }

  // --- Upcoming ---
  {
    const s = chrome('Upcoming Planned Work');
    if (rec.upcoming.length) {
      table(s, {
        head: ['Work', 'Target Month', 'Due', 'Status'],
        rows: rec.upcoming.map((u) => [
          clip(u.title, 62),
          targetMonth(u.dueDate),
          pretty(u.dueDate),
          u.daysAway === 0 ? 'Due today' : `In ${u.daysAway} day${u.daysAway === 1 ? '' : 's'}`,
        ]),
        y: BODY_TOP,
        colW: [6.4, 2.1, 1.95, 1.98],
        align: ['left', 'center', 'center', 'center'],
      });
      footnote(
        s,
        `Open tickets with a due date from ${pretty(report.generatedOn)} onward. Not limited to the report window.` +
          (rec.upcoming.length >= 10 ? ' Showing the ten falling due soonest.' : '')
      );
    } else {
      s.addShape(pres.ShapeType.roundRect, {
        x: M, y: BODY_TOP, w: W - M * 2, h: 1.4, rectRadius: 0.07,
        fill: { color: WHITE }, line: { color: RULE, width: 1 },
      });
      s.addText('Nothing scheduled ahead', {
        x: M + 0.35, y: BODY_TOP + 0.24, w: W - M * 2 - 0.7, h: 0.4,
        fontFace: FONT, fontSize: 17, bold: true, color: INK, isTextBox: true, margin: 0,
      });
      s.addText(`${who} has no open ticket carrying a due date on or after ${pretty(report.generatedOn)}.`, {
        x: M + 0.35, y: BODY_TOP + 0.68, w: W - M * 2 - 0.7, h: 0.5,
        fontFace: FONT, fontSize: 11, color: MUTED, isTextBox: true, margin: 0,
      });
    }
  }

  // --- Division and category ---
  if (rec.byDivision.length || rec.byCategory.length) {
    const s = chrome('Work by Division and Category');
    const divCovered = t.assigned ? Math.round((t.divisioned / t.assigned) * 100) : 0;
    const catCovered = t.assigned ? Math.round((t.categorised / t.assigned) * 100) : 0;

    if (rec.byDivision.length) {
      sectionTitle(s, 'By Division', M, BODY_TOP, 6.0);
      s.addChart(
        pres.ChartType.bar,
        [{ name: 'Tickets', labels: rec.byDivision.slice(0, 6).map((r) => r.label), values: rec.byDivision.slice(0, 6).map((r) => r.count) }],
        {
          // Height follows the row count: a frame sized for six bars but given
          // two renders them absurdly thick.
          x: M, y: BODY_TOP + 0.4, w: 6.0,
          h: Math.min(3.6, 0.55 + Math.min(rec.byDivision.length, 6) * 0.52),
          barDir: 'bar', barGapWidthPct: 45, chartColors: [HEAD],
          showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10,
          dataLabelColor: INK, dataLabelFontFace: FONT, showLegend: false,
          catAxisLabelColor: INK, catAxisLabelFontSize: 10.5, catAxisLabelFontFace: FONT,
          valAxisLabelColor: MUTED, valAxisLabelFontSize: 9, valAxisLabelFontFace: FONT,
          valGridLine: { color: 'EDEFF3', size: 1 }, catGridLine: { style: 'none' },
        }
      );
    }

    if (rec.byCategory.length) {
      sectionTitle(s, 'By Category', 6.95, BODY_TOP, W - M - 6.95);
      s.addChart(
        pres.ChartType.bar,
        [{ name: 'Tickets', labels: rec.byCategory.slice(0, 7).map((r) => clip(r.label, 20)), values: rec.byCategory.slice(0, 7).map((r) => r.count) }],
        {
          x: 6.95, y: BODY_TOP + 0.4, w: W - M - 6.95,
          h: Math.min(3.6, 0.55 + Math.min(rec.byCategory.length, 7) * 0.52),
          barDir: 'bar', barGapWidthPct: 45, chartColors: [BAR],
          showValue: true, dataLabelPosition: 'outEnd', dataLabelFontSize: 10,
          dataLabelColor: INK, dataLabelFontFace: FONT, showLegend: false,
          catAxisLabelColor: INK, catAxisLabelFontSize: 10, catAxisLabelFontFace: FONT,
          valAxisLabelColor: MUTED, valAxisLabelFontSize: 9, valAxisLabelFontFace: FONT,
          valGridLine: { color: 'EDEFF3', size: 1 }, catGridLine: { style: 'none' },
        }
      );
    }

    // Coverage is read off the data rather than assumed — division is often as
    // patchy as category, and captioning one "more reliable" without checking
    // would be a claim the numbers do not support.
    footnote(
      s,
      Math.min(divCovered, catCovered) >= 90
        ? `Division is recorded on ${divCovered}% of these tickets and category on ${catCovered}%, so both charts describe the work as a whole.`
        : `Division is recorded on ${t.divisioned} of ${t.assigned} tickets (${divCovered}%) and category on ${t.categorised} (${catCovered}%). ` +
            `Each chart counts only the tickets carrying that field, so the bars are counts and not shares of all ${t.assigned}.`
    );
  }

  // --- Projects ---
  if (rec.projects.length) {
    const s = chrome('Projects');
    table(s, {
      head: ['Project', 'Division', 'Role', 'Target Date'],
      rows: rec.projects.slice(0, 12).map((p) => [
        clip(p.name, 55),
        p.division || '—',
        p.owner ? 'Owner' : 'Member',
        pretty(p.targetDate),
      ]),
      y: BODY_TOP,
      colW: [6.0, 1.9, 1.7, 2.83],
      align: ['left', 'center', 'center', 'center'],
    });
    const owned = rec.projects.filter((p) => p.owner).length;
    footnote(
      s,
      `${rec.projects.length} project${rec.projects.length === 1 ? '' : 's'}${owned ? `, owning ${owned}` : ''}` +
        `${rec.projects.length > 12 ? ` · showing the first 12` : ''}`
    );
  }
}

// -----------------------------------------------------
// One comparable slide per person
// -----------------------------------------------------
function buildTeamSlides(report, ui) {
  const { pres, chrome, table, statRow, sectionTitle, footnote } = ui;

  // --- The whole team on one page, so the per-person slides have context ---
  {
    const s = chrome('Team Summary');
    table(s, {
      head: ['Person', 'Tickets', 'Completed', 'Open', 'Past Due', 'On Time', 'Hours Logged'],
      rows: report.people.map((p) => [
        p.person.name,
        p.totals.assigned,
        p.totals.completed,
        p.totals.open,
        p.totals.overdueOpen,
        p.totals.onTimeRate === null ? '—' : `${p.totals.onTimeRate}%`,
        `${p.totals.hoursLogged}h`,
      ]),
      y: BODY_TOP,
      colW: [3.2, 1.4, 1.6, 1.2, 1.4, 1.4, 2.23],
      align: ['left', 'center', 'center', 'center', 'center', 'center', 'center'],
    });
    footnote(
      s,
      `${report.people.length} people with work in this window, busiest first. ` +
        `On time is measured only on completed tickets carrying both a due date and a completion date.`
    );
  }

  for (const rec of report.people) {
    const t = rec.totals;
    const s = chrome(rec.person.name);
    s.addText([rec.person.designation, rec.person.role].filter(Boolean).join('  ·  '), {
      x: M, y: BODY_TOP - 0.36, w: 8, h: 0.3,
      fontFace: FONT, fontSize: 11, color: MUTED, isTextBox: true, margin: 0,
    });

    statRow(s, BODY_TOP + 0.02, [
      { value: t.assigned, label: 'Tickets' },
      { value: t.completed, label: 'Completed', accent: true },
      { value: t.open, label: 'Open' },
      { value: t.overdueOpen, label: 'Past due' },
      { value: t.onTimeRate === null ? '—' : `${t.onTimeRate}%`, label: 'On time' },
      { value: `${t.hoursLogged}h`, label: 'Logged' },
    ]);

    // Planned vs actual, stated rather than charted — there is no room here for
    // a chart that would be legible.
    sectionTitle(s, 'Planned vs Actual', M, BODY_TOP + 1.6, 5.7);
    s.addShape(pres.ShapeType.roundRect, {
      x: M, y: BODY_TOP + 2.0, w: 5.7, h: 1.24, rectRadius: 0.07,
      fill: { color: BAND }, line: { color: RULE, width: 0.75 },
    });
    if (t.comparableCount > 0) {
      const diff = Math.round((t.comparableActualHours - t.comparablePlannedHours) * 10) / 10;
      s.addText(`${t.comparablePlannedHours}h planned   →   ${t.comparableActualHours}h logged`, {
        x: M + 0.26, y: BODY_TOP + 2.24, w: 5.2, h: 0.4,
        fontFace: FONT, fontSize: 15, bold: true, color: INK, isTextBox: true, margin: 0,
      });
      s.addText(
        `${diff > 0 ? '+' : ''}${diff}h against budget, across the ${t.comparableCount} ticket${t.comparableCount === 1 ? '' : 's'} carrying both a budget and logged time`,
        {
          x: M + 0.26, y: BODY_TOP + 2.68, w: 5.2, h: 0.7,
          fontFace: FONT, fontSize: 9.5, color: MUTED, isTextBox: true, margin: 0, valign: 'top',
        }
      );
    } else {
      s.addText(`${t.hoursLogged}h logged`, {
        x: M + 0.26, y: BODY_TOP + 2.24, w: 5.2, h: 0.4,
        fontFace: FONT, fontSize: 15, bold: true, color: INK, isTextBox: true, margin: 0,
      });
      s.addText('No ticket here carries both a time budget and a logged entry, so there is nothing to compare against.', {
        x: M + 0.26, y: BODY_TOP + 2.68, w: 5.2, h: 0.7,
        fontFace: FONT, fontSize: 9.5, color: MUTED, isTextBox: true, margin: 0, valign: 'top',
      });
    }

    sectionTitle(s, 'Next Due', 6.6, BODY_TOP + 1.6, W - M - 6.6);
    if (rec.upcoming.length) {
      table(s, {
        head: ['Work', 'Target Month', 'Due'],
        // Three rows, so this table ends level with the Planned card beside it
        // and leaves room for the completed table underneath.
        rows: rec.upcoming.slice(0, 3).map((u) => [
          clip(u.title, 34),
          targetMonth(u.dueDate),
          pretty(u.dueDate),
        ]),
        x: 6.6, y: BODY_TOP + 2.0, w: W - M - 6.6,
        colW: [3.0, 1.6, 1.68],
        fontSize: 9.5,
        align: ['left', 'center', 'center'],
      });
    } else {
      s.addShape(pres.ShapeType.roundRect, {
        x: 6.6, y: BODY_TOP + 2.0, w: W - M - 6.6, h: 0.8, rectRadius: 0.07,
        fill: { color: WHITE }, line: { color: RULE, width: 1 },
      });
      s.addText('Nothing open with a future due date.', {
        x: 6.85, y: BODY_TOP + 2.22, w: W - M - 7.1, h: 0.4,
        fontFace: FONT, fontSize: 10.5, color: MUTED, isTextBox: true, margin: 0,
      });
    }

    // What they actually finished. Without this the slide says how much moved
    // but never what was delivered, which is the half a reviewer asks about.
    // Below both columns above: the Planned card ends at BODY_TOP+3.24 and the
    // three-row Next Due table at BODY_TOP+3.36, so this clears them both.
    sectionTitle(s, 'Completed in this Period', M, BODY_TOP + 3.53, W - M * 2);
    if (rec.completedRecent.length) {
      table(s, {
        head: ['Work', 'Division', 'Completed', 'Against Due Date'],
        rows: rec.completedRecent.slice(0, 4).map((h) => [
          clip(h.title, 60),
          h.division || '—',
          pretty(h.completedDate),
          h.onTime === true ? 'On time' : h.onTime === false ? 'Late' : 'No due date',
        ]),
        y: BODY_TOP + 3.9,
        colW: [6.4, 1.9, 2.1, 2.03],
        fontSize: 10,
        align: ['left', 'center', 'center', 'center'],
      });
    } else {
      s.addShape(pres.ShapeType.roundRect, {
        x: M, y: BODY_TOP + 3.9, w: W - M * 2, h: 0.7, rectRadius: 0.07,
        fill: { color: WHITE }, line: { color: RULE, width: 1 },
      });
      s.addText('Nothing was completed in this window.', {
        x: M + 0.3, y: BODY_TOP + 4.08, w: W - M * 2 - 0.6, h: 0.36,
        fontFace: FONT, fontSize: 10.5, color: MUTED, isTextBox: true, margin: 0,
      });
    }

    const topDiv = rec.byDivision[0];
    footnote(
      s,
      [
        topDiv ? `Busiest division: ${topDiv.label} (${topDiv.count} of the ${t.divisioned} tickets carrying a division)` : null,
        `${rec.projects.length} project${rec.projects.length === 1 ? '' : 's'}`,
        t.completed > 4 ? `${t.completed} completed in total` : null,
        rec.upcoming.length > 3 ? `${rec.upcoming.length - 3} more due beyond the three shown` : null,
      ].filter(Boolean).join('  ·  ')
    );
    s.addNotes(
      `${rec.person.name}: ${t.assigned} tickets in window, ${t.completed} completed, ${t.overdueOpen} past due.`
    );
  }
}

/** Renders the deck to a Buffer ready to stream to the client. */
const renderReport = async (report) => {
  const pres = buildDeck(report);
  const out = await pres.write({ outputType: 'nodebuffer' });
  return Buffer.isBuffer(out) ? out : Buffer.from(out);
};

module.exports = { renderReport };
