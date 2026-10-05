// =====================================================
// Ticket categories, per team (server)
// Keep in sync with frontend/src/constants/categories.js
// =====================================================
// One list per team is the whole vocabulary. Everything that stores a category
// goes through standardCategory(), which accepts the canonical name in any
// letter case or spacing and the legacy names people used before the lists
// existed, and always hands back the canonical spelling. Nothing else should
// compare category strings by hand.

const { TEAM } = require('./roles');

const MARKETING_CATEGORIES = [
  'Animation',
  'Branding',
  'Campaign',
  'Collateral',
  'Content',
  'Email Campaign',
  'Exhibition',
  'Others',
  'Reports',
  'Salesforce',
  'Social Media',
  'Strategy',
  'Video',
  'Website',
];

const SERVICE_CATEGORIES = [
  'Spares / Logistics Follow up',
  'Customer Follow up',
  'Sales Force',
  'Reports / MIS',
  'Site / Installation',
  'Breakdown Support',
  'Rotary',
  'AMC Follow up',
  'Training',
  'Contractor / Vendor - Coordination',
  'Project Updates',
  'Sales - Coordination',
];

const categoriesForTeam = (team) =>
  team === TEAM.SERVICE ? SERVICE_CATEGORIES : MARKETING_CATEGORIES;

// Letter case, runs of spaces and the spacing around "/" and "-" are not part
// of a category's identity: "reports/mis" and "Reports / MIS" are one name.
const fold = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s*([/-])\s*/g, '$1')
    .replace(/\s+/g, ' ');

// Names that were typed before the lists existed (all of these are in the
// tickets table), plus the plain plural and singular forms of the canonical
// names. Each maps to where the team files that kind of work today: brochures,
// visiting cards and print jobs are Collateral, 3D renders sit with Animation,
// and a Marketing "training" ticket has always been filed under Others.
// A name that is on neither the list nor this table is not guessed at.
const LEGACY = {
  [TEAM.MARKETING]: {
    'animation video': 'Animation',
    'animation videos': 'Animation',
    animations: 'Animation',
    rendering: 'Animation',
    campaigns: 'Campaign',
    'digital marketing': 'Campaign',
    collaterals: 'Collateral',
    'graphic design': 'Collateral',
    printing: 'Collateral',
    'gr presentation': 'Collateral',
    'email campaigns': 'Email Campaign',
    exhibitions: 'Exhibition',
    expo: 'Exhibition',
    other: 'Others',
    general: 'Others',
    training: 'Others',
    report: 'Reports',
    'reports/mis': 'Reports',
    'sales force': 'Salesforce',
    videos: 'Video',
  },
  [TEAM.SERVICE]: {
    salesforce: 'Sales Force',
    reports: 'Reports / MIS',
    'amc followup': 'AMC Follow up',
    'customer followup': 'Customer Follow up',
    'project update': 'Project Updates',
  },
};

const teamKey = (team) => (team === TEAM.SERVICE ? TEAM.SERVICE : TEAM.MARKETING);

const canonicalIndex = (team) => new Map(categoriesForTeam(team).map((c) => [fold(c), c]));

// Own entries only: "constructor" is not a legacy category.
const legacyName = (team, key) => {
  const table = LEGACY[teamKey(team)];
  return Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;
};

/**
 * The canonical category for `value` on `team`.
 *
 * Returns { ok: true, value } where value is the canonical name, or null when
 * the input is empty (category is optional on a ticket). Returns { ok: false }
 * when the input is a name this team has no category for; the caller decides
 * whether that is an error (somebody setting it) or something to leave alone
 * (a stored value nobody is touching).
 */
const standardCategory = (team, value) => {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== 'string') return { ok: false };
  const key = fold(value);
  if (!key) return { ok: true, value: null };
  const canonical = canonicalIndex(team).get(key) || legacyName(team, key);
  return canonical ? { ok: true, value: canonical } : { ok: false };
};

/**
 * standardCategory for a value already stored on a ticket, where the caller
 * would rename the ticket to the result.
 *
 * `teamKnown` is false when the team is only the Marketing default (nobody on
 * the ticket resolves to a team). A name on the other team's list is then that
 * team's category and not a legacy name of this one: "Training" on such a
 * ticket is Service's Training, not Marketing's old word for Others. It is
 * reported as unknown, so it is left alone.
 */
const standardStored = (team, value, teamKnown) => {
  const std = standardCategory(team, value);
  if (!std.ok || !std.value || teamKnown) return std;
  const key = fold(value);
  const other = teamKey(team) === TEAM.SERVICE ? TEAM.MARKETING : TEAM.SERVICE;
  if (canonicalIndex(other).has(key) && !canonicalIndex(team).has(key)) return { ok: false };
  return std;
};

/**
 * A hand-typed list of category names (the MRM settings hold a few), as the
 * tickets table may spell them.
 *
 * A name on either team's list stands for itself in its canonical spelling,
 * and for the other team's name for the same work where the two legacy tables
 * point at each other (Salesforce / Sales Force, Reports / Reports / MIS). It
 * is never read as the other team's one-way legacy name: "Training" is a
 * Service category, not Marketing "Others".
 *
 * A legacy name stands for what it was renamed to, and for itself as typed, so
 * a setting saved before the lists were standardised ("ANIMATION VIDEO") finds
 * its tickets whether or not the rename has reached them. Anything else is
 * kept as typed.
 */
const storedNames = (names) => {
  const teams = [TEAM.MARKETING, TEAM.SERVICE];
  const out = new Set();
  for (const raw of names || []) {
    const key = fold(raw);
    if (!key) continue;
    const exact = teams.map((team) => canonicalIndex(team).get(key)).filter(Boolean);
    if (exact.length) {
      for (const name of exact) {
        out.add(name);
        for (const team of teams) {
          const twin = legacyName(team, key);
          if (twin && teams.some((t) => legacyName(t, fold(twin)) === name)) out.add(twin);
        }
      }
      continue;
    }
    teams.map((team) => legacyName(team, key)).filter(Boolean).forEach((name) => out.add(name));
    out.add(String(raw).trim());
  }
  return [...out];
};

module.exports = {
  MARKETING_CATEGORIES,
  SERVICE_CATEGORIES,
  LEGACY,
  categoriesForTeam,
  standardCategory,
  standardStored,
  storedNames,
  fold,
};
