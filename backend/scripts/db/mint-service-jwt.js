// Mints the token the app presents to a self-hosted PostgREST.
//
//   node scripts/db/mint-service-jwt.js "<jwt-secret from postgrest.conf>"
//
// or with the secret in POSTGREST_JWT_SECRET. Prints one line: the token to
// put in backend/.env as POSTGREST_JWT.
//
// The token names the database role PostgREST should switch to for every
// request — service_role, which 02-postgrest-roles.sql gives full access.
// It carries no expiry, exactly like a Supabase service-role key: this app is
// the only holder, it lives in the same .env as the database credentials, and
// a token that expired silently at 3am would take the portal down with it.
// Rotate it by changing jwt-secret in postgrest.conf and minting again.

//
// An optional second argument names a different database role, for a PostgREST
// that serves another database with narrower rights:
//
//   node scripts/db/mint-service-jwt.js "<secret>" sf_reader
//
// (the read-only role over the Salesforce mirror; see docs/SELF-HOSTING.md).

const jwt = require('jsonwebtoken');

const secret = process.argv[2] || process.env.POSTGREST_JWT_SECRET;
const role = process.argv[3] || 'service_role';

if (!secret || secret.length < 32 || !/^[a-z_][a-z0-9_]*$/.test(role)) {
  console.error('Usage: node scripts/db/mint-service-jwt.js "<jwt-secret of at least 32 characters>" [role]');
  process.exit(1);
}

const token = jwt.sign(
  { role, iss: 'mkttickets', iat: Math.floor(Date.now() / 1000) },
  secret,
  { algorithm: 'HS256' }
);

process.stdout.write(token + '\n');
