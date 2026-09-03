-- =====================================================
-- Paid status for expense lines
-- =====================================================
-- Approval and payment are two different events. A line is approved when
-- somebody signs off that the money is owed; it is paid when the money has
-- actually gone out. Between the two sits the thing finance most needs to see —
-- what is approved but still owed.
--
-- Payment is recorded in its own columns rather than as a fourth
-- approval_status, for two reasons.
--
-- isLineEditable is `approval_status !== 'Approved'`, so a line whose status was
-- moved to 'Paid' would quietly become editable again — its amount rewritable
-- after the money had left, while the printed document went on attesting to the
-- old figure.
--
-- And approval_status carries the audit answer to "was this approved, by whom".
-- Overwriting it with a later event would destroy that. Payment is additive:
-- paid_at is null until it happens, and the approval record beneath it is
-- untouched.
--
-- Safe to run more than once, and safe to run while the app is up: the code
-- treats these columns as optional and falls back to treating every line as
-- unpaid until they exist.

alter table public.expense_lines add column if not exists paid_at timestamptz;
alter table public.expense_lines add column if not exists paid_by uuid;
alter table public.expense_lines add column if not exists paid_by_name text;

-- "What is still owed" is the query this exists to answer, and it filters on
-- approved-and-not-yet-paid across the whole table.
create index if not exists expense_lines_paid_at_idx
  on public.expense_lines (paid_at);

-- =====================================================
-- After running this
-- =====================================================
-- Nothing else is needed. A claim's Paid status is derived from its lines by
-- rollupStatus() rather than stored, so the envelope can never disagree with
-- its contents — the same reasoning that already applies to Approved and
-- Partially Approved.
--
-- Every existing line has paid_at null, which reads as unpaid. Nothing is
-- retroactively marked paid, because nothing here knows which of them were.
