const supabase = require('../config/supabase');
const { isAdmin, isSuperAdmin, getUserTeam } = require('../utils/roles');

// Insert notification rows, degrading past the two schema variants still in the
// wild: notifications.user_id does not exist until notifications-user-id-migration.sql
// runs (42703 from Postgres, PGRST204 when PostgREST catches it in its schema
// cache first), and a legacy bigint notifications.ticket_id rejects the uuid
// ticket ids (22P02). Either way the notification is still delivered.
const insertNotifications = async (rows) => {
  let payload = rows;
  let { error } = await supabase.from('notifications').insert(payload);

  if (error && ['42703', 'PGRST204'].includes(error.code)) {
    payload = payload.map(({ user_id, ...rest }) => rest);
    ({ error } = await supabase.from('notifications').insert(payload));
  }
  if (error && error.code === '22P02') {
    payload = payload.map(({ ticket_id, ...rest }) => rest);
    ({ error } = await supabase.from('notifications').insert(payload));
  }
  if (error) console.error('Notification insert failed:', error);
};

// Notifications are addressed by user_id, with user_name written alongside so
// rows survive a rename readably and pre-migration rows still render. A display
// name shared by two users cannot be resolved to one id — those rows keep the
// legacy name-only addressing rather than being delivered to the wrong person.
const resolveUserId = async (userName) => {
  if (!userName) return null;
  const { data, error } = await supabase.from('users').select('id').eq('name', userName).limit(2);
  if (error || data?.length !== 1) return null;
  return data[0].id;
};

// Insert one notification per active admin.
// When a team is given, only that team's admins (plus Super Admins, who span
// every team) are notified — keeping approval requests within the requester's
// team.
const notifyAdmins = async (title, message, ticketId, team = null) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, role')
      .eq('active', true);
    if (error || !users?.length) {
      if (error) console.error('Admin lookup for notification failed:', error);
      return;
    }
    const admins = users.filter((u) => {
      if (!isAdmin(u)) return false;
      if (!team) return true;
      return isSuperAdmin(u) || getUserTeam(u) === team;
    });
    if (!admins.length) return;
    const rows = admins.map((a) => ({
      user_id: a.id,
      user_name: a.name,
      title,
      message,
      ticket_id: ticketId,
    }));
    await insertNotifications(rows);
  } catch (err) {
    console.error('notifyAdmins error:', err);
  }
};

const notifyUser = async (userName, title, message, ticketId) => {
  if (!userName) return;
  try {
    const userId = await resolveUserId(userName);
    await insertNotifications([
      { user_id: userId, user_name: userName, title, message, ticket_id: ticketId },
    ]);
  } catch (err) {
    console.error('notifyUser error:', err);
  }
};

module.exports = { insertNotifications, notifyAdmins, notifyUser };
