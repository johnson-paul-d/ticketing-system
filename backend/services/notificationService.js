const supabase = require('../config/supabase');
const { isAdmin, isSuperAdmin, getUserTeam } = require('../utils/roles');

// Insert notification rows. If notifications.ticket_id is still the legacy
// bigint type (tickets use uuid ids), the typed insert fails with 22P02 —
// retry without ticket_id so the notification is still delivered.
const insertNotifications = async (rows) => {
  const { error } = await supabase.from('notifications').insert(rows);
  if (!error) return;
  if (error.code === '22P02') {
    const fallbackRows = rows.map(({ ticket_id, ...rest }) => rest);
    const { error: retryError } = await supabase.from('notifications').insert(fallbackRows);
    if (retryError) console.error('Notification insert failed (retry):', retryError);
  } else {
    console.error('Notification insert failed:', error);
  }
};

// Insert one notification per active admin (matched by real name,
// since GET /notifications filters on user_name = req.user.name).
// When a team is given, only that team's admins (plus Super Admins, who span
// every team) are notified — keeping approval requests within the requester's
// team.
const notifyAdmins = async (title, message, ticketId, team = null) => {
  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('name, role')
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
    await insertNotifications([
      { user_name: userName, title, message, ticket_id: ticketId },
    ]);
  } catch (err) {
    console.error('notifyUser error:', err);
  }
};

module.exports = { insertNotifications, notifyAdmins, notifyUser };
