// =====================================================
// Divisions
// =====================================================
// Keep in sync with backend/utils/divisions.js, which validates what the
// client sends (scripts/check-shared-lists.js compares the two before every
// ship). One list for tickets, projects, users and expense claims. ABM accounts
// have a list of their own (constants/abm.js).

export const TICKET_DIVISIONS = [
  "ASTOR",
  "CPS",
  "TMD",
  "All User",
];

// Spellings stored before the list was enforced, mapped to the name on the
// list. Same table as the server's.
export const LEGACY_DIVISIONS = {
  all: "All User",
  "all users": "All User",
  welker: "TMD",
};

// What is shown wherever a record has no division. One spelling everywhere.
export const NO_DIVISION = "No division";

// Letter case and runs of spaces are not part of a division's identity.
const fold = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

// The name on the list for a stored or typed value, "" when there is none, or
// null when the value is not a division at all.
export const standardDivision = (value) => {
  const key = fold(value);
  if (!key) return "";
  const hit = TICKET_DIVISIONS.find((d) => fold(d) === key);
  if (hit) return hit;
  return Object.prototype.hasOwnProperty.call(LEGACY_DIVISIONS, key) ? LEGACY_DIVISIONS[key] : null;
};

// The options for a division dropdown. A stored value that is neither on the
// list nor a known old spelling is kept as an extra option, so the dropdown
// shows what is stored and an unrelated save does not silently replace it.
export const divisionOptions = (current) =>
  current && standardDivision(current) === null ? [...TICKET_DIVISIONS, current] : TICKET_DIVISIONS;
