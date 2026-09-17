-- MRM (Management Review Meeting) report inputs
-- Run once on the server, then tell PostgREST to reload:
--
--   psql -U postgres -d mkttickets -f D:\mkttickets\backend\database\mrm-migration.sql
--   psql -U postgres -d mkttickets -c "notify pgrst, 'reload schema';"
--
-- Most of the monthly deck is computed: leads, conversions and pipeline from the
-- Salesforce mirror, ad spend and LinkedIn followers from the portal's own
-- syncs, exhibitions and site branding from projects and expenses. What cannot
-- be computed lives here: the year's targets, the wording of the plan slides,
-- the hand-kept trackers (inaugurations, collaterals, agents), and the figures
-- already presented to management for past months, which are kept exactly as
-- they were shown rather than recomputed from data that has since moved.
--
-- One row per named input, each a JSON document, so a new section of the deck
-- never needs another migration. The report falls back to built-in defaults
-- for any key that is absent, which is also how it behaves before this runs.

create table if not exists public.mrm_inputs (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by_name text
);

-- Safe to run more than once. service_role already has default privileges on
-- new tables (see scripts/db/02-postgrest-roles.sql); this is for a database
-- where that script predates the default-privilege lines.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all privileges on public.mrm_inputs to service_role;
  end if;
end $$;
