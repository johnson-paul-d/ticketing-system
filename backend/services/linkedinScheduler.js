const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const { isSuperAdmin, isAdmin, isServiceTeam } = require('../utils/roles');

// =====================================================
// Daily LinkedIn sync
// =====================================================
// LinkedIn figures used to refresh only when somebody pressed Sync on the
// dashboard, so the follower table had whole weeks missing and a month's gain
// could not be read off it. The MRM deck needs the month-end count, which
// means a snapshot has to exist for every day.
//
// This calls the existing POST /api/linkedin/sync once a day rather than
// duplicating it: that route already knows every organisation, handles the
// token, and dedupes. It is called over loopback as a short-lived session for
// an admin, exactly as a person pressing the button would.
//
// Opt-in: LINKEDIN_AUTO_SYNC=on. It belongs on the server only; a developer's
// laptop pointed at the dev database has no business calling LinkedIn.

const CHECK_EVERY_MS = 60 * 60 * 1000; // look hourly…
const DUE_AFTER_MS = 20 * 60 * 60 * 1000; // …sync when the last one is older than this

let running = false;

const lastSyncedAt = async () => {
  const { data, error } = await supabase
    .from('linkedin_follower_stats')
    .select('synced_at')
    .order('synced_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message || error.code);
  return data?.[0]?.synced_at ? new Date(data[0].synced_at).getTime() : 0;
};

const pickActor = async () => {
  const { data, error } = await supabase.from('users').select('id, name, email, role').eq('active', true);
  if (error) throw new Error(error.message || error.code);
  return (data || []).find(isSuperAdmin) || (data || []).find((u) => isAdmin(u) && !isServiceTeam(u)) || null;
};

const syncIfDue = async (port) => {
  if (running) return;
  running = true;
  try {
    const last = await lastSyncedAt();
    if (Date.now() - last < DUE_AFTER_MS) return;

    const actor = await pickActor();
    if (!actor) {
      console.warn('LinkedIn auto-sync: no active Marketing admin to run as; skipped');
      return;
    }
    const token = jwt.sign(
      { id: actor.id, email: actor.email, role: actor.role, name: actor.name, system: 'linkedin-scheduler' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await fetch(`http://127.0.0.1:${port}/api/linkedin/sync`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      const orgs = Object.keys(body.summary || {});
      console.log(`LinkedIn auto-sync: done for ${orgs.length} organisation(s)`);
    } else {
      // "LinkedIn not connected" or an expired token lands here. It is logged
      // and retried next hour; reconnecting on the dashboard fixes it.
      console.warn(`LinkedIn auto-sync: ${res.status} ${body.message || ''}`.trim());
    }
  } catch (err) {
    console.error('LinkedIn auto-sync error:', err.message);
  } finally {
    running = false;
  }
};

const startLinkedInScheduler = (port) => {
  if (String(process.env.LINKEDIN_AUTO_SYNC || '').toLowerCase() !== 'on') return;
  console.log('LinkedIn auto-sync: on (daily)');
  setTimeout(() => syncIfDue(port), 2 * 60 * 1000).unref(); // shortly after boot
  setInterval(() => syncIfDue(port), CHECK_EVERY_MS).unref();
};

module.exports = { startLinkedInScheduler, syncIfDue };
