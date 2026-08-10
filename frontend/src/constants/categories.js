// =====================================================
// Ticket categories, per team
// =====================================================
// Keep in sync with backend/utils/categories.js, which validates what the
// client sends. A ticket's category list follows the ticket's team, not the
// viewer's — an admin opening a Service ticket sees the Service list.

export const MARKETING_CATEGORIES = [
  "Animation",
  "Branding",
  "Campaign",
  "Collateral",
  "Content",
  "Email Campaign",
  "Exhibition",
  "Others",
  "Reports",
  "Salesforce",
  "Social Media",
  "Strategy",
  "Video",
  "Website",
];

export const SERVICE_CATEGORIES = [
  "Spares / Logistics Follow up",
  "Customer Follow up",
  "Sales Force",
  "Reports / MIS",
  "Site / Installation",
  "Breakdown Support",
  "Rotary",
  "AMC Follow up",
  "Training",
  "Contractor / Vendor - Coordination",
  "Project Updates",
  "Sales - Coordination",
];

export const categoriesForTeam = (team) =>
  team === "Service" ? SERVICE_CATEGORIES : MARKETING_CATEGORIES;

// Tickets created before a team had its own list can hold a category that is no
// longer offered. Surfacing it keeps the dropdown honest about what is stored
// and stops an unrelated edit from silently reassigning the category.
export const categoryOptions = (team, current) => {
  const options = categoriesForTeam(team);
  return current && !options.includes(current) ? [...options, current] : options;
};
