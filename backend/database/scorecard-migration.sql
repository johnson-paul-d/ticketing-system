-- Quality scorecard: the reviewer's ratings and corrections per task, and a
-- log of the scorecard emails already sent. Run once on the server, then tell
-- PostgREST to reload:
--
--   psql -U postgres -d mkttickets -f D:\mkttickets\backend\database\scorecard-migration.sql
--   psql -U postgres -d mkttickets -c "notify pgrst, 'reload schema';"
--
-- Everything else in a task's score is worked out from the ticket's own
-- history (due date, submission, approvals, send-backs, logged and allotted
-- time), so only what a person decides lives here. The ratings sit in their own
-- table rather than on tickets because the ticket API returns whole rows to
-- their assignees, and the scores are for the reviewer's eyes only.
--
-- Safe to run more than once, and it upgrades the first draft of the table
-- (which had a "completeness" rating where "quality" now is).

create table if not exists public.ticket_scores (
  ticket_id text primary key,
  -- 1–5 stars each; null until rated (a missing rating is pending, never zero)
  accuracy smallint check (accuracy between 1 and 5),
  quality smallint check (quality between 1 and 5),
  remarks text,
  -- null = decided automatically (monthly activity buckets are left out),
  -- true / false = the reviewer's own choice
  excluded boolean,
  -- the reviewer's corrections of automatic values; null = use the ticket's own
  submitted_on date,
  corrections smallint check (corrections >= 0),
  spent_minutes integer check (spent_minutes >= 0),
  allotted_minutes integer check (allotted_minutes >= 0),
  updated_at timestamptz not null default now(),
  updated_by_name text,
  -- every save, oldest first: { at, by, ...the values saved }
  history jsonb not null default '[]'::jsonb
);

alter table public.ticket_scores add column if not exists quality smallint check (quality between 1 and 5);
alter table public.ticket_scores add column if not exists submitted_on date;
alter table public.ticket_scores add column if not exists corrections smallint check (corrections >= 0);
alter table public.ticket_scores add column if not exists spent_minutes integer check (spent_minutes >= 0);
alter table public.ticket_scores add column if not exists allotted_minutes integer check (allotted_minutes >= 0);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'ticket_scores' and column_name = 'completeness'
  ) then
    update public.ticket_scores set quality = completeness where quality is null;
    alter table public.ticket_scores drop column completeness;
  end if;
end $$;

-- One row per email sent, so a restart never sends the same report twice.
create table if not exists public.scorecard_mail_log (
  kind text not null,          -- 'weekly' | 'monthly'
  period text not null,        -- first day of the week, or YYYY-MM
  sent_at timestamptz not null default now(),
  recipients text,
  primary key (kind, period)
);

-- service_role already has default privileges on new tables (see
-- scripts/db/02-postgrest-roles.sql); this is for a database where that script
-- predates the default-privilege lines.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant all privileges on public.ticket_scores to service_role;
    grant all privileges on public.scorecard_mail_log to service_role;
  end if;
end $$;
