// =====================================================
// Ticket categories, per team (server)
// Keep in sync with frontend/src/constants/categories.js
// =====================================================

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

/**
 * Is `category` offered to `team`?
 *
 * Empty is always allowed — category is optional on a ticket. Validation is
 * only applied to values the caller is actually setting: every Service ticket
 * predating this split carries a Marketing category, and rejecting those would
 * block unrelated edits to old tickets.
 */
const isValidCategory = (team, category) => {
  if (category === undefined || category === null || category === '') return true;
  return categoriesForTeam(team).includes(category);
};

module.exports = {
  MARKETING_CATEGORIES,
  SERVICE_CATEGORIES,
  categoriesForTeam,
  isValidCategory,
};
