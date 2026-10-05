// =====================================================
// Ticket categories, per team
// =====================================================
// Keep in sync with backend/utils/categories.js, which validates what the
// client sends (scripts/check-category-lists.js compares the two before every
// ship). A ticket's category list follows the ticket's team, not the viewer's:
// an admin opening a Service ticket sees the Service list.

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

// Names typed before the lists existed, and the plain plural or singular of the
// canonical ones, mapped to where that work is filed today. Same table as the
// server's; a name on neither the list nor this table is not guessed at.
export const LEGACY_CATEGORIES = {
  Marketing: {
    "animation video": "Animation",
    "animation videos": "Animation",
    animations: "Animation",
    rendering: "Animation",
    campaigns: "Campaign",
    "digital marketing": "Campaign",
    collaterals: "Collateral",
    "graphic design": "Collateral",
    printing: "Collateral",
    "gr presentation": "Collateral",
    "email campaigns": "Email Campaign",
    exhibitions: "Exhibition",
    expo: "Exhibition",
    other: "Others",
    general: "Others",
    training: "Others",
    report: "Reports",
    "reports/mis": "Reports",
    "sales force": "Salesforce",
    videos: "Video",
  },
  Service: {
    salesforce: "Sales Force",
    reports: "Reports / MIS",
    "amc followup": "AMC Follow up",
    "customer followup": "Customer Follow up",
    "project update": "Project Updates",
  },
};

// What is shown wherever a ticket has no category. One spelling everywhere.
export const UNCATEGORISED = "Uncategorised";

export const categoriesForTeam = (team) =>
  team === "Service" ? SERVICE_CATEGORIES : MARKETING_CATEGORIES;

// Letter case, runs of spaces and the spacing around "/" and "-" are not part
// of a category's identity.
const fold = (value) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*([/-])\s*/g, "$1")
    .replace(/\s+/g, " ");

// The canonical name for a stored or typed value on this team, "" when there
// is none, or null when the value is a name this team has no category for.
export const standardCategory = (team, value) => {
  const key = fold(value);
  if (!key) return "";
  const list = categoriesForTeam(team);
  const hit = list.find((c) => fold(c) === key);
  if (hit) return hit;
  // Own entries only: "constructor" is not a legacy category.
  const legacy = LEGACY_CATEGORIES[team === "Service" ? "Service" : "Marketing"];
  return Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : null;
};

// The options for a ticket's category dropdown. A stored value that is on
// neither the list nor the legacy table (another team's category left behind
// by a reassignment, say) is kept as an extra option, so the dropdown shows
// what is stored and an unrelated edit does not silently reassign it.
export const categoryOptions = (team, current) => {
  const options = categoriesForTeam(team);
  return current && standardCategory(team, current) === null ? [...options, current] : options;
};
