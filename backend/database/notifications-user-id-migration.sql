-- Notifications addressed by user id
-- Run this in Supabase → SQL Editor once.
--
-- Notifications were addressed by display name alone, so two users sharing a
-- name read each other's rows, and renaming a user orphaned every notification
-- they already had. user_id is the real address; user_name is still written
-- alongside it so rows stay readable and so anything created before this ran
-- keeps working. The API matches user_id when it is set, and falls back to
-- user_name only while user_id is null — which is why the column is nullable
-- and why the backfill below is optional rather than required.

alter table public.notifications add column if not exists user_id uuid;

create index if not exists notifications_user_id_idx on public.notifications(user_id);

-- BACKFILL (optional, run after the column exists) — maps existing rows from
-- user_name to users.id. Only names belonging to exactly one user are mapped;
-- an ambiguous name cannot be resolved to one person, so those rows are left
-- null and keep matching by name. Safe to re-run.
--
-- update public.notifications n
--    set user_id = u.id
--   from public.users u
--  where n.user_id is null
--    and n.user_name = u.name
--    and (select count(*) from public.users u2 where u2.name = n.user_name) = 1;

-- Verify: rows still unmapped, and the names behind them.
-- select user_name, count(*) from public.notifications
--  where user_id is null group by user_name order by 2 desc;
