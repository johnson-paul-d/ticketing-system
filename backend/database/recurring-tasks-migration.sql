-- Recurring tasks migration
-- Run this in Supabase → SQL Editor once.
--
-- A recurring task auto-generates its next occurrence on a schedule. The most
-- recent occurrence carries is_recurring = true (the active "spawner"); when its
-- recurrence_next date arrives the backend creates the next occurrence and hands
-- the flag over to it. recurrence_interval / recurrence_base_title stay on every
-- occurrence so the UI can show a "recurring" badge across the series.

alter table public.tickets add column if not exists is_recurring boolean not null default false;
alter table public.tickets add column if not exists recurrence_interval text;      -- 'daily' | 'weekly' | 'monthly'
alter table public.tickets add column if not exists recurrence_base_title text;    -- title without the period suffix
alter table public.tickets add column if not exists recurrence_next date;          -- date the next occurrence is generated

create index if not exists tickets_recurrence_idx on public.tickets(is_recurring, recurrence_next);

-- v2: stop duplicate occurrences at the database level.
--
-- The scheduler claims the spawner flag before inserting, which keeps two
-- instances from generating the same occurrence, but only the database can
-- guarantee it. One occurrence per (series, period) — the backend treats the
-- resulting 23505 as "already generated" and carries on.
--
-- CAVEAT: two independent series that share a base title AND land on the same
-- recurrence_next collide here (creating the same recurring title twice on one
-- day). Rename one of them, or widen the index with assigned_to, if that is a
-- real workflow rather than a mistake.
--
-- Existing duplicates must be cleaned first or the index will not build:
-- select recurrence_base_title, recurrence_next, count(*), array_agg(id)
--   from public.tickets
--  where recurrence_base_title is not null and recurrence_next is not null
--  group by 1, 2 having count(*) > 1;
--
-- On a large tickets table build it without locking writes, as its own
-- statement (CONCURRENTLY cannot run inside a transaction block):
-- create unique index concurrently if not exists tickets_recurrence_occurrence_idx
--   on public.tickets(recurrence_base_title, recurrence_next)
--   where recurrence_base_title is not null;

create unique index if not exists tickets_recurrence_occurrence_idx
  on public.tickets(recurrence_base_title, recurrence_next)
  where recurrence_base_title is not null;
