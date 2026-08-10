// =====================================================
// Ticket team resolution
// =====================================================
// A ticket belongs to the team of its assignee, falling back to its creator,
// and to Marketing when neither resolves. Both the authorization check
// (canAccessTicket) and the realtime audience depend on this, so it lives in
// one place rather than being re-derived per route.

const supabase = require('../config/supabase');
const { TEAM, teamFromRole } = require('./roles');

const ticketTeam = async (ticket) => {
  const ids = [ticket?.assigned_to, ticket?.created_by].filter(Boolean);
  if (!ids.length) return TEAM.MARKETING;

  const { data: users } = await supabase.from('users').select('id, role').in('id', ids);
  const roleOf = (id) => users?.find((u) => u.id === id)?.role;

  return (
    teamFromRole(roleOf(ticket.assigned_to)) ||
    teamFromRole(roleOf(ticket.created_by)) ||
    TEAM.MARKETING
  );
};

// Who may receive realtime updates about this ticket — the same rule
// canAccessTicket applies, expressed as socket rooms.
const ticketAudience = async (ticket) => ({
  team: await ticketTeam(ticket),
  userIds: [ticket?.assigned_to, ticket?.created_by],
});

module.exports = { ticketTeam, ticketAudience };
