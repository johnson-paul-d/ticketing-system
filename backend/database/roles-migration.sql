-- Team-based role migration
-- Run this in Supabase → SQL Editor once.
--
-- Splits the old roles into team-suffixed roles. Every existing user belongs to
-- the Marketing team, so legacy roles map to their Marketing equivalents.
--
-- The app already treats any team-less legacy role (Admin / User / Team Member)
-- as Marketing, so the system keeps working even before this runs — this just
-- normalises the stored values so the Admin Panel shows the new labels. It is
-- safe to run more than once.

update public.users set role = 'Admin - Marketing'   where role = 'Admin';
update public.users set role = 'User - MKTG'         where role = 'User';
update public.users set role = 'Team Member - MKTG'  where role = 'Team Member';
-- Any existing 'Super Admin' rows are left unchanged.

-- OPTIONAL — promote the platform owner to Super Admin so they can manage BOTH
-- teams and create the Service-team accounts. Replace the email, then run:
-- update public.users set role = 'Super Admin' where email = 'you@siegerglobal.net';

-- Verify the result:
-- select email, role, division, active from public.users order by role, name;
