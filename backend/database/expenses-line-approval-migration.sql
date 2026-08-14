-- Expense claims: per-line approval
-- Run this in Supabase → SQL Editor once, after expenses-migration.sql.
--
-- Approval moves from the claim to the individual line. An approver signs off
-- each expense separately, and each approved line yields its own printable
-- document carrying just that line and its bill. The claim becomes the envelope
-- and its status a rollup of the lines inside it.

-- =====================================================
-- 1. Approval fields on the line
-- =====================================================
alter table public.expense_lines add column if not exists approval_status text not null default 'Pending';
alter table public.expense_lines add column if not exists approved_by uuid;
alter table public.expense_lines add column if not exists approved_by_name text;
alter table public.expense_lines add column if not exists approved_by_role text;
alter table public.expense_lines add column if not exists approved_at timestamptz;
alter table public.expense_lines add column if not exists approval_hash text;
alter table public.expense_lines add column if not exists rejection_reason text;

-- Printed on the line's document and resolved by /verify/:code. Unique across
-- every line, since a code identifies one approval anywhere in the system.
alter table public.expense_lines add column if not exists verify_code text;

-- Stable position within the claim, so a line's printed reference
-- (EXP-2026-0042-02) does not move. Assigned when the claim is submitted, at
-- which point the lines are frozen.
alter table public.expense_lines add column if not exists line_no integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expense_lines_approval_status_check'
  ) then
    alter table public.expense_lines
      add constraint expense_lines_approval_status_check
      check (approval_status in ('Pending', 'Approved', 'Rejected'));
  end if;
end $$;

create unique index if not exists expense_lines_verify_code_idx
  on public.expense_lines(verify_code) where verify_code is not null;

create index if not exists expense_lines_approval_status_idx
  on public.expense_lines(approval_status);

create index if not exists expense_lines_approved_at_idx
  on public.expense_lines(approved_at desc);

-- =====================================================
-- 2. Claim status becomes a rollup
-- =====================================================
-- A submitted claim can end up wholly approved, wholly rejected, or a mix, so
-- the old status list needs the middle case.
alter table public.expense_claims drop constraint if exists expense_claims_status_check;
alter table public.expense_claims
  add constraint expense_claims_status_check
  check (status in ('Draft', 'Submitted', 'Partially Approved', 'Approved', 'Rejected', 'Paid'));

-- =====================================================
-- 3. Period is gone from the claim
-- =====================================================
-- The dates that matter are on the lines; a claim-level period was another
-- thing to fill in that nothing read.
alter table public.expense_claims drop constraint if exists expense_claims_period_check;
alter table public.expense_claims drop column if exists period_from;
alter table public.expense_claims drop column if exists period_to;

-- =====================================================
-- 4. Carry any existing claim-level approvals down to their lines
-- =====================================================
-- Approved claims predating this keep their meaning: every line inside one was
-- covered by that approval, so it is recorded per line rather than lost. The
-- verify code is left to the claim's own row — a code already in print keeps
-- resolving through the compatibility path in routes/verify.js.
update public.expense_lines l
set approval_status = 'Approved',
    approved_by     = c.approved_by,
    approved_by_name = c.approved_by_name,
    approved_by_role = c.approved_by_role,
    approved_at     = c.approved_at
from public.expense_claims c
where l.claim_id = c.id
  and c.status = 'Approved'
  and l.approval_status = 'Pending';

-- Number the lines of any claim that has already left Draft.
with ordered as (
  select l.id, row_number() over (partition by l.claim_id order by l.expense_date, l.id) as n
  from public.expense_lines l
  join public.expense_claims c on c.id = l.claim_id
  where c.status <> 'Draft'
)
update public.expense_lines l
set line_no = ordered.n
from ordered
where ordered.id = l.id and l.line_no is null;

-- =====================================================
-- 5. Verify the result
-- =====================================================
-- select column_name from information_schema.columns
--   where table_name = 'expense_lines' order by ordinal_position;
-- select approval_status, count(*) from public.expense_lines group by 1;
