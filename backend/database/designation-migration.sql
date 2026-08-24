-- Designation on the person, and frozen onto the approval
-- Run this in Supabase → SQL Editor once.
--
-- A signed document should carry a job title, not a permissions label. Until
-- now the approval block printed users.role — "Admin - Marketing" — which says
-- what someone may do in the system, not what they are in the company.

-- =====================================================
-- 1. The person's designation
-- =====================================================
-- Free text: "General Manager - Marketing", "Sr. Executive - Service". Set by
-- an admin in the Admin Panel alongside role and division, NOT by the person
-- themselves — a title that appears above a signature on a reimbursement
-- document is a statement about someone's authority, and self-service would
-- make it a statement they wrote about themselves.
alter table public.users add column if not exists designation text;

-- =====================================================
-- 2. Frozen onto each approval
-- =====================================================
-- Copied onto the line at the moment of approval, the same way
-- approved_by_role already is, so a later promotion cannot rewrite what an old
-- signed document says the signer was at the time.
alter table public.expense_lines add column if not exists approved_by_designation text;

-- =====================================================
-- 3. Seed the one approver in use, so existing documents read correctly
-- =====================================================
-- Everything approved so far was approved by the same person. Adjust or remove
-- this before running if that is not the designation you want.
update public.users
set designation = 'General Manager - Marketing'
where name = 'Ramenaathan' and designation is null;

update public.expense_lines l
set approved_by_designation = u.designation
from public.users u
where l.approved_by = u.id
  and l.approved_by_designation is null
  and u.designation is not null;

-- =====================================================
-- 4. Verify
-- =====================================================
-- select name, role, designation from public.users where designation is not null;
-- select approved_by_name, approved_by_role, approved_by_designation
--   from public.expense_lines where approval_status = 'Approved';
