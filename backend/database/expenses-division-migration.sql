-- Expense claims: division
-- Run this in Supabase → SQL Editor once, after expenses-line-approval-migration.sql.
--
-- A claim needs a division of its own, the way a ticket has one. It cannot be
-- taken from the claimant's user record: those only hold 'CPS' and 'All User',
-- so a report keyed on them could not tell TMD spend from ASTOR spend — which is
-- the whole point of filtering by division.

alter table public.expense_claims add column if not exists division text;

create index if not exists expense_claims_division_idx on public.expense_claims(division);

-- Existing claims are left null rather than guessed at. They show as
-- "No division" in the report until someone sets one; inventing a value would
-- put spend against a budget nobody chose.

-- =====================================================
-- Verify
-- =====================================================
-- select division, count(*) from public.expense_claims group by 1;
