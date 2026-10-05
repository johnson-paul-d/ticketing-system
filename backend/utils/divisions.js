// =====================================================
// Divisions (server)
// Keep in sync with frontend/src/constants/divisions.js
// =====================================================
// One list for tickets, projects, users and expense claims. Everything that
// stores a division goes through standardDivision(), which accepts the name in
// any letter case or spacing and the spellings used before the list was
// enforced, and always hands back the list's spelling. Nothing else should
// compare division strings by hand.
//
// ABM accounts and the MRM report have division lists of their own; this is
// not theirs.

const DIVISIONS = ['ASTOR', 'CPS', 'TMD', 'All User'];

// Letter case and runs of spaces are not part of a division's identity.
const fold = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// Values that were stored before the list was enforced. "ALL" is what the
// first ticket form called "All User", and is on a few dozen older tickets.
// Welker is a textile machinery brand, not a division: its work is filed under
// TMD (the Welker Rebranding project is a TMD project).
// A name on neither the list nor this table is not guessed at.
const LEGACY = {
  all: 'All User',
  'all users': 'All User',
  welker: 'TMD',
};

const canonical = new Map(DIVISIONS.map((d) => [fold(d), d]));

/**
 * The canonical division for `value`.
 *
 * Returns { ok: true, value } where value is the name on the list, or null
 * when the input is empty: a ticket, project or claim may have no division,
 * and that is stored one way, as null. Returns { ok: false } for a name that
 * is not a division; the caller decides whether that is an error (somebody
 * setting it) or something to leave alone (a stored value nobody is touching).
 */
const standardDivision = (value) => {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const key = fold(value);
  if (!key) return { ok: true, value: null };
  const name = canonical.get(key) || (Object.prototype.hasOwnProperty.call(LEGACY, key) ? LEGACY[key] : undefined);
  return name ? { ok: true, value: name } : { ok: false };
};

// For a 400: says what was sent and what is accepted.
const divisionError = (value) => `"${value}" is not a division. Use one of: ${DIVISIONS.join(', ')}`;

module.exports = { DIVISIONS, LEGACY, standardDivision, divisionError, fold };
