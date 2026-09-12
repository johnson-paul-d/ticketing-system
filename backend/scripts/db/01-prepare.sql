-- =====================================================
-- Self-hosted database, step 1: prepare an empty database
-- =====================================================
-- Run as the postgres superuser, CONNECTED TO the new database:
--
--   createdb -U postgres mkttickets
--   psql -U postgres -d mkttickets -f 01-prepare.sql
--
-- Runs before the Supabase dump is restored. It only provides what the dump
-- assumes is already there.

-- gen_random_uuid() is built in since PostgreSQL 13, but Supabase projects
-- carry both of these and a column default may name uuid_generate_v4().
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- Supabase runs in UTC, and PostgREST renders every timestamptz in the
-- session's zone. The app stores IST wall-clock strings and reads them back
-- expecting the same shape, so the database must keep answering in UTC even
-- though the machine it runs on is set to IST.
alter database mkttickets set timezone to 'UTC';
