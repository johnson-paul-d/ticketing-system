-- =====================================================
-- Self-hosted database, step 2: roles for PostgREST
-- =====================================================
-- Run AFTER the dump has been restored (the grants need the tables to exist):
--
--   psql -U postgres -d mkttickets -f 02-postgrest-roles.sql
--
-- Then change the authenticator password below, or run afterwards:
--   alter role authenticator with password '<a long random password>';
--
-- Three roles, mirroring what Supabase sets up:
--   authenticator  the only role that logs in. PostgREST connects as it and
--                  then switches to the role named in the request's JWT.
--   service_role   what this app acts as: full access to every table. Its
--                  name is the `role` claim in POSTGREST_JWT
--                  (see mint-service-jwt.js).
--   anon           what a request with no token gets. Nothing is granted to
--                  it; every call from the app carries the token.
--
-- Safe to run more than once.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'CHANGE_ME_authenticator_password';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end $$;

grant anon to authenticator;
grant service_role to authenticator;

-- PostgREST loads its schema cache as authenticator, so it needs to see the
-- schema even though it never reads a row as itself.
grant usage on schema public to authenticator;

grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Tables created later by a migration script get the same access without
-- anyone remembering to re-run this file.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;

-- Same reasoning as 01-prepare.sql: answer in UTC whatever the machine says.
alter role authenticator set timezone to 'UTC';
alter role service_role  set timezone to 'UTC';

-- Tell a running PostgREST to reload its schema cache. Harmless if none is
-- connected yet. Run this again after every future migration script.
notify pgrst, 'reload schema';
