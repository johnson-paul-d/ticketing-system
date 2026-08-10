const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');

// Supabase REST silently caps an unbounded select at 1000 rows; ask for a
// defined page of the newest instead of relying on that.
const LIST_LIMIT = 300;

// PostgREST splits an `or` filter on commas and parentheses, so a display name
// containing either has to be double-quoted.
const quote = (value) => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

// A notification belongs to the caller when it carries their user_id, or — for
// rows written before notifications.user_id existed (and not yet backfilled) —
// when it has no user_id and the stored display name is theirs.
const scopeToCaller = (query, user) =>
  user.id
    ? query.or(`user_id.eq.${user.id},and(user_id.is.null,user_name.eq.${quote(user.name)})`)
    : query.eq('user_name', user.name);

// notifications.user_id does not exist until notifications-user-id-migration.sql
// runs — fall back to the legacy name-only addressing until it does.
const isMissingUserId = (error) => error && ['42703', 'PGRST204'].includes(error.code);

// GET user notifications
router.get('/', auth, async (req, res) => {
  try {
    const base = () =>
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(LIST_LIMIT);

    let { data, error } = await scopeToCaller(base(), req.user);
    if (isMissingUserId(error)) {
      ({ data, error } = await base().eq('user_name', req.user.name));
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch notifications' });
  }
});

// MARK single as read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const base = () =>
      supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', req.params.id)
        .select('id');

    let { data, error } = await scopeToCaller(base(), req.user);
    if (isMissingUserId(error)) {
      ({ data, error } = await base().eq('user_name', req.user.name));
    }
    if (error) throw error;
    // Nothing matched: the row is someone else's or does not exist. Both are
    // reported the same way so this can't be used to probe for ids.
    if (!data || !data.length) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update notification' });
  }
});

module.exports = router;
