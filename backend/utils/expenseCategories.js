// =====================================================
// Expense categories, per team (server)
// Keep in sync with frontend/src/constants/expenseCategories.js
// =====================================================
// Same shape as utils/categories.js: the list follows the CLAIM's team, not
// the viewer's, so an admin reviewing another team's claim sees that team's
// categories.

const { TEAM } = require('./roles');

const MARKETING_EXPENSE_CATEGORIES = [
  'Travel - Air / Rail',
  'Local Conveyance',
  'Accommodation',
  'Meals',
  'Client Entertainment',
  'Exhibition / Event',
  'Printing & Collateral',
  'Software / Subscription',
  'Telephone & Internet',
  'Courier',
  'Other',
];

const SERVICE_EXPENSE_CATEGORIES = [
  'Travel - Air / Rail',
  'Local Conveyance',
  'Accommodation',
  'Meals',
  'Fuel',
  'Spares Purchase',
  'Tools & Consumables',
  'Courier / Freight',
  'Site Expenses',
  'Telephone & Internet',
  'Training',
  'Other',
];

const expenseCategoriesForTeam = (team) =>
  team === TEAM.SERVICE ? SERVICE_EXPENSE_CATEGORIES : MARKETING_EXPENSE_CATEGORIES;

// Empty is rejected at the route level (category is required on a line); this
// only answers whether a supplied value belongs to the team.
const isValidExpenseCategory = (team, category) =>
  expenseCategoriesForTeam(team).includes(category);

module.exports = {
  MARKETING_EXPENSE_CATEGORIES,
  SERVICE_EXPENSE_CATEGORIES,
  expenseCategoriesForTeam,
  isValidExpenseCategory,
};
