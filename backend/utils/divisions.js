// =====================================================
// Divisions
// Keep in sync with frontend/src/constants/divisions.js
// =====================================================
// Tickets accept a division as free text, which is why the column holds a tidy
// set today only by convention. Expenses validate against this list instead: a
// division on a claim is what a spend report groups by, and one typo puts a
// whole claim in a bucket nobody looks at.

const DIVISIONS = ['ASTOR', 'CPS', 'TMD', 'All User'];

// Empty is allowed — a claim raised before divisions existed, or one whose
// division genuinely is not decided yet, reports as "No division" rather than
// being forced into a guess.
const isValidDivision = (value) =>
  value === undefined || value === null || value === '' || DIVISIONS.includes(value);

module.exports = { DIVISIONS, isValidDivision };
