const supabase = require('../config/supabase');

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
// since GET /notifications filters on user_name = req.user.name)
const notifyAdmins = async (title, message, ticketId) => {
  try {
    const { data: admins, error } = await supabase
      .from('users')
      .select('name')
      .in('role', ['Admin', 'Super Admin'])
      .eq('active', true);
    if (error || !admins?.length) {
      if (error) console.error('Admin lookup for notification failed:', error);
      return;
    }
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
