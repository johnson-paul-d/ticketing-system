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

module.exports = {
  TEAM,
  isSuperAdmin,
  isAdmin,
  isTeamMember,
  teamFromRole,
  getUserTeam,
  sameTeam,
};
