const { createClient } = require('@supabase/supabase-js');

// =====================================================
// Database client
// =====================================================
// Every query in this app goes through the Supabase client's table API, which
// is a PostgREST client underneath. That makes the backing database swappable
// without touching a single route:
//
//   Hosted Supabase (default)
//     SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, exactly as before.
//
//   Self-hosted PostgreSQL + PostgREST (POSTGREST_URL set)
//     POSTGREST_URL   e.g. http://127.0.0.1:3001
//     POSTGREST_JWT   a token whose `role` claim names the database role the
//                     API should act as (see scripts/db/mint-service-jwt.js)
//
// The only wire-level difference is a path prefix: the client always appends
// /rest/v1 to its base URL because that is where Supabase mounts PostgREST,
// while a bare PostgREST serves its tables at the root. The custom fetch below
// strips the prefix, and nothing else in the app knows which mode it is in.
//
// Supabase also caps responses at 1000 rows; a bare PostgREST has no cap unless
// db-max-rows is set. Every listing in this app pages explicitly, so either
// behaviour is fine.

const SELF_HOSTED = Boolean(process.env.POSTGREST_URL);

let supabase;

if (SELF_HOSTED) {
  const base = process.env.POSTGREST_URL.replace(/\/+$/, '');
  const key = process.env.POSTGREST_JWT;
  if (!key) {
    console.error('FATAL: POSTGREST_URL is set but POSTGREST_JWT is not. Refusing to start.');
    process.exit(1);
  }

  const prefix = `${base}/rest/v1`;
  const stripPrefix = (input) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!url.startsWith(prefix)) return input;
    const rewritten = base + url.slice(prefix.length);
    return typeof input === 'string' ? rewritten : new Request(rewritten, input);
  };

  supabase = createClient(base, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(stripPrefix(input), init),
    },
  });
} else {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

supabase.isSelfHosted = SELF_HOSTED;

module.exports = supabase;
