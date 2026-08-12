// =====================================================
// Time
// =====================================================
// Instants are stored in UTC. A timestamptz column records a moment, not a wall
// clock, so writing UTC is correct and nothing here should change that — the
// timezone question belongs to display, and display alone.
//
// The default export is still named getISTTime at its ~76 call sites and has
// always returned UTC. Rather than churn every one of those for a rename, the
// honest name is exported alongside it and this comment records the truth.
// Prefer `nowUTC` in new code.

const nowUTC = () => new Date().toISOString();

// India does not observe daylight saving, so a fixed offset is exact rather
// than an approximation that drifts twice a year.
const IST_OFFSET_MINUTES = 330;

// Shifts an instant so its UTC fields read as IST wall-clock fields. Only ever
// used for formatting — never for anything that gets stored.
const asISTFields = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + IST_OFFSET_MINUTES * 60000);
};

/** Today's calendar date in IST, as YYYY-MM-DD. */
const todayIST = () => asISTFields(new Date()).toISOString().split('T')[0];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Human-readable IST, for documents people read.
 *
 * A date-only column (YYYY-MM-DD) is already the intended calendar date and is
 * rendered as-is: shifting it could move it a day and misstate when an expense
 * was incurred.
 */
const formatIST = (value, { withTime = false } = {}) => {
  if (!value) return null;

  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (dateOnly) {
    const [y, m, d] = value.split('-');
    return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
  }

  const ist = asISTFields(value);
  if (!ist) return null;

  const stamp = `${pad2(ist.getUTCDate())} ${MONTHS[ist.getUTCMonth()]} ${ist.getUTCFullYear()}`;
  if (!withTime) return stamp;
  return `${stamp}, ${pad2(ist.getUTCHours())}:${pad2(ist.getUTCMinutes())} IST`;
};

module.exports = nowUTC;
module.exports.nowUTC = nowUTC;
module.exports.todayIST = todayIST;
module.exports.formatIST = formatIST;
module.exports.IST_OFFSET_MINUTES = IST_OFFSET_MINUTES;
