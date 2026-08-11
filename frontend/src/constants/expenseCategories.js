// =====================================================
// Expense categories, per team
// =====================================================
// Keep in sync with backend/utils/expenseCategories.js, which validates what the
// client sends. A claim's category list follows the CLAIM's team, not the
// viewer's — an admin reviewing a Service claim sees the Service list.

// Programme spend first, then out-of-pocket costs, with the catch-all last so
// it doesn't sit mid-dropdown.
export const MARKETING_EXPENSE_CATEGORIES = [
  "Ad - Digital",
  "Ad - Magazine",
  "Customer Engagement",
  "Content Creation",
  "Exhibition",
  "Print Collaterals",
  "Software Subscriptions",
  "Merchandise",

  "Travel - Air / Rail",
  "Local Conveyance",
  "Accommodation",
  "Meals",
  "Photography / Videography",
  "Agency / Freelancer",
  "Training / Conference",
  "Courier / Postage",
  "Telephone & Internet",

  "Contingency",
];

export const SERVICE_EXPENSE_CATEGORIES = [
  "Travel - Air / Rail",
  "Local Conveyance",
  "Accommodation",
  "Meals",
  "Fuel",
  "Spares Purchase",
  "Tools & Consumables",
  "Courier / Freight",
  "Site Expenses",
  "Telephone & Internet",
  "Training",
  "Other",
];

export const expenseCategoriesForTeam = (team) =>
  team === "Service" ? SERVICE_EXPENSE_CATEGORIES : MARKETING_EXPENSE_CATEGORIES;
