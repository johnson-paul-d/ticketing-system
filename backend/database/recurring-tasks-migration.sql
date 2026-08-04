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
