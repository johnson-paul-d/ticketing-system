// =====================================================
// Central role & team helpers (server)
// Keep in sync with frontend/src/constants/roles.js
// =====================================================
//
// Every role carries its team in the label:
//   Super Admin            → spans all teams
//   Admin - Marketing      → Marketing team admin
//   Admin - Service        → Service team admin
//   User - MKTG            → Marketing team user
//   User - Service         → Service team user
//   Team Member - MKTG     → Marketing team member
//   Team Member - Service  → Service team member
//
// Legacy roles (Admin / User / Team Member — no team suffix) are treated as
// Marketing, because every existing user belongs to the Marketing team. This
// keeps the app working before the role values are normalised in the database.

const TEAM = { MARKETING: 'Marketing', SERVICE: 'Service' };

const norm = (role) => String(role || '').trim();

const isSuperAdmin = (user) => norm(user?.role) === 'Super Admin';

const isAdmin = (user) => {
  const r = norm(user?.role);
  return r === 'Super Admin' || r.startsWith('Admin');
};

const isTeamMember = (user) => norm(user?.role).startsWith('Team Member');

// The team a role belongs to. Super Admin (and empty/unknown roles that are a
// super admin) span every team → null. Everything else resolves to a team,
// defaulting to Marketing for legacy labels.
const teamFromRole = (role) => {
  const r = norm(role);
  if (!r || r === 'Super Admin') return null;
  return /service/i.test(r) ? TEAM.SERVICE : TEAM.MARKETING;
};

const getUserTeam = (user) => teamFromRole(user?.role);

// Two users share a team (Super Admin matches everyone).
const sameTeam = (a, b) => {
  const ta = getUserTeam(a);
  const tb = getUserTeam(b);
  return ta === null || tb === null || ta === tb;
};

const isServiceTeam = (user) => getUserTeam(user) === TEAM.SERVICE;

// Ad-dashboard access. These mirror canAccessGoogleAds / canAccessLinkedIn in
// frontend/src/constants/roles.js — the client uses them to hide navigation,
// the server uses them to actually enforce access. Keep the two in sync.
const canAccessGoogleAds = (user) =>
  !isServiceTeam(user) &&
  (isAdmin(user) || String(user?.email || '').toLowerCase() === 'digitalmarketing@siegerglobal.net');

const canAccessLinkedIn = (user) =>
  !isServiceTeam(user) &&
  (isAdmin(user) || user?.id === '072c5ff4-7d6e-4930-b271-e47e261f604d');

module.exports = {
  TEAM,
  isSuperAdmin,
  isAdmin,
  isTeamMember,
  teamFromRole,
  getUserTeam,
  sameTeam,
  isServiceTeam,
  canAccessGoogleAds,
  canAccessLinkedIn,
};
