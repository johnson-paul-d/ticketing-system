const { createClient } = require('@supabase/supabase-js');

// =====================================================
// Read-only client for the Salesforce mirror
// =====================================================
// Sieger's Salesforce org is mirrored into a PostgreSQL database on the server
// (salesforce_db_v2) by a separate sync. Reports that need leads, opportunities
// or visits read that mirror rather than calling the Salesforce API: it is
// local, it is already kept fresh, and it costs no API quota.
//
//   SALESFORCE_DB_URL   a PostgREST serving that database, e.g.
//                       http://127.0.0.1:3003 on the server
//   SALESFORCE_DB_JWT   a token whose role claim is `sf_reader`, a role that
//                       has SELECT and nothing else (see docs/SELF-HOSTING.md)
//
// Optional: without these the rest of the portal is unaffected and the reports
// that depend on it say so. Same /rest/v1 prefix handling as config/supabase.js.

const url = (process.env.SALESFORCE_DB_URL || '').replace(/\/+$/, '');
const key = process.env.SALESFORCE_DB_JWT;

let salesforce = null;

if (url && key) {
  const prefix = `${url}/rest/v1`;
  const strip = (input) => {
    const u = typeof input === 'string' ? input : input.url;
    if (!u.startsWith(prefix)) return input;
    const rewritten = url + u.slice(prefix.length);
    return typeof input === 'string' ? rewritten : new Request(rewritten, input);
  };
  salesforce = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(strip(input), init) },
  });
}

module.exports = { salesforce, isConfigured: Boolean(salesforce) };
