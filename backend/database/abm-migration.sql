-- ABM CRM migration
-- Run this in Supabase → SQL Editor

-- 1. Accounts (companies)
create table if not exists public.abm_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text,
  industry text,
  website text,
  employees text,
  revenue text,
  priority text not null default 'Medium',        -- High / Medium / Low
  tier text not null default 'Tier 2',            -- Tier 1 / Tier 2 / Tier 3
  status text not null default 'Research',        -- Research..Won/Lost/Nurturing
  owner uuid,
  owner_name text,
  notes text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists abm_accounts_country_idx on public.abm_accounts(country);
create index if not exists abm_accounts_status_idx on public.abm_accounts(status);

-- 2. Contacts (people) — pipeline status lives HERE, not on the account,
--    because one company can have 500+ contacts at different stages.
--    Last-activity fields are denormalized so the daily queue and rollups
--    never need to scan the activities table.
create table if not exists public.abm_contacts (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.abm_accounts(id) on delete cascade,
  name text not null,
  designation text,
  role_level text,                                -- Decision Maker / Influencer / Gatekeeper / IC
  email text,
  phone text,
  linkedin text,
  whatsapp text,
  decision_maker boolean not null default false,
  status text not null default 'Contact Identified',
  do_not_contact boolean not null default false,
  next_action text,                               -- manual override; null = auto-computed
  next_action_due date,
  last_activity_type text,
  last_activity_result text,
  last_activity_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists abm_contacts_account_idx on public.abm_contacts(account_id);
create index if not exists abm_contacts_status_idx on public.abm_contacts(status);
create index if not exists abm_contacts_last_activity_idx on public.abm_contacts(last_activity_at);

-- 3. Activities — every touch is one row (the heart of the system)
create table if not exists public.abm_activities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.abm_accounts(id) on delete cascade,
  contact_id uuid references public.abm_contacts(id) on delete cascade,
  activity_type text not null,                    -- Cold Email 1, LinkedIn Connect, ...
  channel text,                                   -- Email / LinkedIn / WhatsApp / Phone / In Person
  result text,                                    -- Sent / Responded / No Response / ...
  notes text,
  activity_date date not null default current_date,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists abm_activities_account_idx on public.abm_activities(account_id);
create index if not exists abm_activities_contact_idx on public.abm_activities(contact_id);
create index if not exists abm_activities_date_idx on public.abm_activities(activity_date);

-- 4. Opportunities
create table if not exists public.abm_opportunities (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.abm_accounts(id) on delete cascade,
  name text,
  potential text,
  probability integer,                            -- 0-100
  expected_value numeric,
  stage text not null default 'Qualification',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists abm_opportunities_account_idx on public.abm_opportunities(account_id);
