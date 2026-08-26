-- API keys: long-lived, revocable credentials for machine callers
-- Run this in Supabase → SQL Editor once.
--
-- Until now the only way for a script or an agent to call this API was to log
-- in as a person and carry a 7-day JWT. That is wrong in three ways: the token
-- expires silently mid-week, it cannot be revoked without changing that
-- person's password, and it makes an automated caller indistinguishable from
-- the human whose account it borrowed.
--
-- An API key fixes all three. It never expires unless you say so, revoking it
-- touches nothing else, and every request it makes is attributable to the key.

-- =====================================================
-- 1. The keys
-- =====================================================
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),

  -- What this key is for, in words. Shown in the admin panel; the only way to
  -- tell two keys apart once the secret itself is gone.
  name text not null,

  -- SHA-256 of the secret, hex. The secret itself is 256 bits of CSPRNG
  -- output, so it is not guessable and a plain digest is enough — bcrypt would
  -- force a full table scan on every single request, since a lookup by hash is
  -- the whole point.
  key_hash text not null unique,

  -- The first characters of the secret, kept in the clear so a key can be
  -- recognised in a list without revealing anything usable.
  key_prefix text not null,

  -- The identity this key acts as. Its role is the key's permission boundary,
  -- and deactivating that user stops the key dead.
  user_id uuid not null references public.users(id) on delete cascade,

  -- Who minted it. An API key is a standing grant of someone else's
  -- permissions, so it must be answerable to a person.
  created_by uuid references public.users(id) on delete set null,
  created_by_name text,

  -- Blocks anything that is not a GET. The narrowest useful scope, and the
  -- right default for a caller that only needs to read.
  read_only boolean not null default false,

  created_at timestamptz not null default now(),
  expires_at timestamptz,          -- null = does not expire
  revoked_at timestamptz,          -- null = live
  last_used_at timestamptz
);

-- Every request looks a key up by hash, so this index is load-bearing rather
-- than an optimisation. (The unique constraint above already creates one; this
-- is here to say so out loud if that constraint is ever relaxed.)
create index if not exists api_keys_key_hash_idx on public.api_keys (key_hash);
create index if not exists api_keys_user_id_idx on public.api_keys (user_id);

-- =====================================================
-- 2. Verify
-- =====================================================
-- select id, name, key_prefix, read_only, created_at, expires_at, revoked_at
--   from public.api_keys order by created_at desc;
