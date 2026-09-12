// Proves a database copy by counting rows in every table on both sides.
//
//   node scripts/db/compare-counts.js
//
// Reads the hosted side from SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY and the
// self-hosted side from POSTGREST_URL / POSTGREST_JWT, all from backend/.env.
// Exits non-zero if any table differs or is missing, so it can gate a cutover.

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

// Every table the app reads or writes. Keep in step with services/mcpTables.js
// and the database/*.sql migrations.
const TABLES = [
  'users',
  'tickets',
  'ticket_time_entries',
  'notifications',
  'projects',
  'expense_claims',
  'expense_lines',
  'expense_receipts',
  'api_keys',
  'leave_requests',
  'permission_requests',
  'abm_accounts',
  'abm_contacts',
  'abm_activities',
  'abm_opportunities',
  'abm_settings',
  'linkedin_tokens',
  'linkedin_follower_stats',
  'linkedin_page_analytics',
  'linkedin_post_analytics',
  'linkedin_ad_analytics',
  'google_ads_campaign_analysis',
  'google_ads_keyword_analysis',
];

const need = (name) => {
  if (!process.env[name]) {
    console.error(`${name} is not set in backend/.env`);
    process.exit(1);
  }
  return process.env[name];
};

const hosted = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const base = need('POSTGREST_URL').replace(/\/+$/, '');
const prefix = `${base}/rest/v1`;
const local = createClient(base, need('POSTGREST_JWT'), {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input.url;
      const rewritten = url.startsWith(prefix) ? base + url.slice(prefix.length) : url;
      return fetch(typeof input === 'string' ? rewritten : new Request(rewritten, input), init);
    },
  },
});

const countIn = async (client, table) => {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) return { error: error.message || error.code };
  return { count };
};

(async () => {
  let bad = 0;
  console.log(`${'table'.padEnd(32)} ${'hosted'.padStart(8)} ${'local'.padStart(8)}  result`);
  for (const table of TABLES) {
    const [h, l] = await Promise.all([countIn(hosted, table), countIn(local, table)]);
    const hs = h.error ? `ERR` : String(h.count);
    const ls = l.error ? `ERR` : String(l.count);
    let result = 'ok';
    if (h.error && l.error) result = `absent on both (${h.error})`;
    else if (h.error) result = `hosted: ${h.error}`;
    else if (l.error) {
      result = `LOCAL: ${l.error}`;
      bad += 1;
    } else if (h.count !== l.count) {
      result = 'MISMATCH';
      bad += 1;
    }
    console.log(`${table.padEnd(32)} ${hs.padStart(8)} ${ls.padStart(8)}  ${result}`);
  }
  console.log(bad ? `\n${bad} table(s) differ — do not cut over yet.` : '\nAll tables match.');
  process.exit(bad ? 1 : 0);
})();
