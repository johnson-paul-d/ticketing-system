-- Projects feature migration
-- Run this in Supabase → SQL Editor

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  status text not null default 'Active',
  target_date date,
  color text,
  members uuid[] not null default '{}',
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.tickets
  add column if not exists project_id uuid references public.projects(id) on delete set null;

create index if not exists tickets_project_id_idx on public.tickets(project_id);

-- v2: division on projects (mapped to all tasks)
alter table public.projects add column if not exists division text;
