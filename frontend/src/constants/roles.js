// =====================================================
// Central role & team helpers (client)
// Keep in sync with backend/utils/roles.js
// =====================================================
//
// Every role carries its team in the label. Legacy roles (Admin / User /
// Team Member — no team suffix) are treated as Marketing, since every existing
// user belongs to the Marketing team.

// Selectable roles, grouped for the Admin Panel dropdown.
export const ROLE_OPTIONS = [
  { group: "Marketing", roles: ["Admin - Marketing", "User - MKTG", "Team Member - MKTG"] },
  { group: "Service", roles: ["Admin - Service", "User - Service", "Team Member - Service"] },
  { group: "Global", roles: ["Super Admin"] },
];

export const ALL_ROLES = ROLE_OPTIONS.flatMap((g) => g.roles);

const norm = (role) => String(role || "").trim();

export const isSuperAdmin = (user) => norm(user?.role) === "Super Admin";

export const isAdmin = (user) => {
  const r = norm(user?.role);
  return r === "Super Admin" || r.startsWith("Admin");
};

export const isTeamMember = (user) => norm(user?.role).startsWith("Team Member");

// The team a user belongs to. Super Admin spans every team → null (sees all).
export const getTeam = (user) => {
  const r = norm(user?.role);
  if (!r || r === "Super Admin") return null;
  return /service/i.test(r) ? "Service" : "Marketing";
};

export const isServiceTeam = (user) => getTeam(user) === "Service";

// Team-aware branding for the home page + sidebar. Service users see "Service"
// wherever Marketing users see the marketing branding.
export const teamBrand = (user) =>
  isServiceTeam(user)
    ? { short: "SIEGER SERVICE", sub: "SERVICE TEAM", dashboard: "SERVICE TEAM DASHBOARD" }
    : { short: "SIEGER MKT", sub: "MARKETING TEAM", dashboard: "MARKETING TEAM DASHBOARD" };

// Requirement #4 — the Service team has no access to the ad dashboards.
// Preserves the prior gates (admins + the specific power users) while
// excluding anyone on the Service team.
export const canAccessGoogleAds = (user) =>
  !isServiceTeam(user) &&
  (isAdmin(user) ||
    user?.email?.toLowerCase() === "digitalmarketing@siegerglobal.net");

export const canAccessLinkedIn = (user) =>
  !isServiceTeam(user) &&
  (isAdmin(user) || user?.id === "072c5ff4-7d6e-4930-b271-e47e261f604d");
