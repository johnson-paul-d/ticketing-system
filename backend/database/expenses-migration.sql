-- Expense tracker migration
-- Run this in Supabase → SQL Editor once.
--
-- Model: a claim has many lines, and every line must carry at least one
-- receipt before the claim can be submitted (enforced in route code, not here,
-- because the rule only applies at the submit transition).
--
-- Approval is signed: on approval the server stores a SHA-256 over the claim's
-- canonical payload INCLUDING the receipt file hashes, so swapping a bill after
-- the fact invalidates the printed verification code just as a changed amount
-- would.

-- =====================================================
-- 1. Approver signatures
-- =====================================================
-- One signature per user, held in the private `signatures` storage bucket.
-- Route code must allow a user to set only their OWN signature — if anyone can
-- upload a signature on someone else's behalf, the approval stamp proves
-- nothing.
alter table public.users add column if not exists signature_path text;
alter table public.users add column if not exists signature_updated_at timestamptz;

-- =====================================================
-- 2. Claims
-- =====================================================
create table if not exists public.expense_claims (
  id uuid primary key default gen_random_uuid(),

  -- Human-facing reference printed on the PDF (e.g. EXP-2026-0042).
  claim_number text unique,

  claimant_id uuid not null,
  claimant_name text not null,

  -- Frozen at submit from the claimant's role. Kept on the row so a later role
  -- change cannot move an already-approved claim to another team's books.
  team text not null,

  title text not null,
  period_from date,
  period_to date,

  currency text not null default 'INR',

  -- Recomputed server-side from the lines on every write; never trusted from
  -- the client.
  total_amount numeric(12,2) not null default 0,

  status text not null default 'Draft',
  submitted_at timestamptz,

  -- Approval record. This is the system of record — the PDF is a rendering of
  -- it and can be regenerated at any time.
  approved_by uuid,
  approved_by_name text,
  approved_by_role text,
  approved_at timestamptz,
  approval_hash text,

  -- Short public code printed on the PDF and resolved by /verify/:code.
  verify_code text unique,

  rejection_reason text,

  -- Bumped when a rejected claim is reopened and edited. Any prior approval
  -- hash is cleared at that point so a stale printout stops verifying.
  revision int not null default 1,

  timeline jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint expense_claims_status_check
    check (status in ('Draft', 'Submitted', 'Approved', 'Rejected', 'Paid')),
  constraint expense_claims_total_check check (total_amount >= 0),
  constraint expense_claims_period_check
    check (period_from is null or period_to is null or period_from <= period_to)
);

create index if not exists expense_claims_claimant_idx on public.expense_claims(claimant_id);
create index if not exists expense_claims_team_status_idx on public.expense_claims(team, status);
create index if not exists expense_claims_verify_idx on public.expense_claims(verify_code);
create index if not exists expense_claims_created_idx on public.expense_claims(created_at desc);

-- =====================================================
-- 3. Line items
-- =====================================================
create table if not exists public.expense_lines (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.expense_claims(id) on delete cascade,

  expense_date date not null,
  category text not null,
  description text,

  amount numeric(12,2) not null,
  tax_amount numeric(12,2) not null default 0,

  created_at timestamptz not null default now(),

  constraint expense_lines_amount_check check (amount > 0),
  constraint expense_lines_tax_check check (tax_amount >= 0)
);

create index if not exists expense_lines_claim_idx on public.expense_lines(claim_id);

-- =====================================================
-- 4. Receipts
-- =====================================================
-- Files live in the private `expense-receipts` bucket; only the path is stored.
-- file_sha256 feeds both the approval hash and duplicate detection.
create table if not exists public.expense_receipts (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.expense_claims(id) on delete cascade,
  line_id uuid references public.expense_lines(id) on delete cascade,

  storage_path text not null,
  file_name text,
  mime_type text,
  byte_size integer,
  file_sha256 text not null,

  uploaded_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists expense_receipts_claim_idx on public.expense_receipts(claim_id);
create index if not exists expense_receipts_line_idx on public.expense_receipts(line_id);

-- Same bill submitted on two claims is worth flagging, not blocking outright —
-- a shared invoice can legitimately be split. Route code surfaces the clash.
create index if not exists expense_receipts_sha_idx on public.expense_receipts(file_sha256);

-- =====================================================
-- 5. File storage — external, not Supabase
-- =====================================================
-- Receipts and signature images live in Google Drive, reached through
-- backend/services/fileStore.js. expense_receipts.storage_path and
-- users.signature_path hold the opaque Drive file id, so nothing binary is
-- stored in Postgres and the free-tier storage quota is untouched.
--
-- Drive has no signed-URL equivalent, so files are streamed back through the
-- API after canAccessClaim passes rather than linked directly. Never make the
-- Drive folder link-shareable: a receipt carries a name, an amount and often a
-- full address.
--
-- To switch to Supabase Storage instead (FILE_STORE=supabase), create the
-- buckets first — both must be private:
--
--   insert into storage.buckets (id, name, public)
--   values ('expense-receipts', 'expense-receipts', false) on conflict (id) do nothing;
--   insert into storage.buckets (id, name, public)
--   values ('signatures', 'signatures', false) on conflict (id) do nothing;

-- =====================================================
-- 6. Verify the result
-- =====================================================
-- select column_name, data_type from information_schema.columns
--   where table_name = 'expense_claims' order by ordinal_position;
-- select count(*) from public.expense_claims;
