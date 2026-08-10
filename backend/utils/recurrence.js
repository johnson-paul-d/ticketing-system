// =====================================================
// Recurring-task helpers
// Dates are plain YYYY-MM-DD strings, parsed at UTC midnight so the arithmetic
// and labels never drift with the server timezone.
// =====================================================

const INTERVALS = ['daily', 'weekly', 'monthly'];

const isValidInterval = (i) => INTERVALS.includes(i);

const parse = (dateStr) => new Date(`${dateStr}T00:00:00Z`);
const fmt = (d) => d.toISOString().split('T')[0];

// Day 0 of the following month is the last day of the given one.
const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// Add one month keeping the day of month, clamped to the last day when the
// target month is shorter. A date already sitting on its month end stays on the
// month end, so a clamped anchor recovers instead of being lost for good:
// 31 Jan -> 28 Feb -> 31 Mar, rather than raw setUTCMonth's 31 Jan -> 3 Mar.
const addMonth = (d) => {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const atMonthEnd = day === daysInMonth(year, month);
  const targetYear = month === 11 ? year + 1 : year;
  const targetMonth = (month + 1) % 12;
  const targetDays = daysInMonth(targetYear, targetMonth);
  return new Date(Date.UTC(targetYear, targetMonth, atMonthEnd ? targetDays : Math.min(day, targetDays)));
};

// Add one interval to a YYYY-MM-DD date, returning YYYY-MM-DD.
const addInterval = (dateStr, interval) => {
  const d = parse(dateStr);
  if (interval === 'daily') d.setUTCDate(d.getUTCDate() + 1);
  else if (interval === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
  else if (interval === 'monthly') return fmt(addMonth(d));
  return fmt(d);
};

// Human label for the period a date represents.
//   daily   -> "4 Aug 2026"
//   weekly  -> "Week of 4 Aug 2026"
//   monthly -> "Aug 2026"
const periodSuffix = (dateStr, interval) => {
  const d = parse(dateStr);
  const day = d.getUTCDate();
  const month = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = d.getUTCFullYear();
  if (interval === 'daily') return `${day} ${month} ${year}`;
  if (interval === 'weekly') return `Week of ${day} ${month} ${year}`;
  if (interval === 'monthly') return `${month} ${year}`;
  return '';
};

// Full occurrence title: "Base — <period>"
const occurrenceTitle = (baseTitle, dateStr, interval) =>
  `${baseTitle} — ${periodSuffix(dateStr, interval)}`;

module.exports = { INTERVALS, isValidInterval, addInterval, periodSuffix, occurrenceTitle };
