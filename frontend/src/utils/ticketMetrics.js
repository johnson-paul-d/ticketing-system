// =====================================================================
// Ticket metric helpers — single, documented source of truth for the
// math behind the dashboards. Keeping the formulas here (instead of
// inline in each chart) makes them traceable and consistent everywhere.
// =====================================================================

const DONE_STATUSES = ["Completed", "Closed"];
export const isResolved = (t) => DONE_STATUSES.includes(t.status);

const dateOnly = (d) => (d ? String(d).split("T")[0] : null);

// ---------------------------------------------------------------------
// Actual time spent on a ticket = sum of its logged time entries.
// NOTE: the tickets table has NO `consumed_minutes` column — time is
// tracked as individual ticket_time_entries rows returned on each ticket
// as `time_entries`. Reading t.consumed_minutes (as the old dashboard
// did) always yields 0.
// ---------------------------------------------------------------------
export const consumedMinutes = (t) =>
  (t.time_entries || []).reduce((s, e) => s + (Number(e.duration_minutes) || 0), 0);

export const allottedMinutes = (t) => Number(t.allotted_minutes) || 0;

// ---------------------------------------------------------------------
// Completion date — traceable and edit-proof. In priority order:
//   1. completed_date column (stamped the moment status became Completed)
//   2. the "... to Completed/Closed" status entry in the ticket history
//   3. the approval that finalised a completion request
//   4. approved_at (only if the ticket is in a done state)
// It deliberately NEVER falls back to updated_at, which moves on any
// later edit and silently corrupts resolution-time and SLA figures.
// Returns a date string (or null).
// ---------------------------------------------------------------------
export const completionDate = (t) => {
  if (t.completed_date) return dateOnly(t.completed_date);

  const tl = Array.isArray(t.timeline) ? t.timeline : [];

  const statusEntry = [...tl]
    .reverse()
    .find((e) => e.type === "status" && /to (Completed|Closed)\b/i.test(e.action || ""));
  if (statusEntry) return dateOnly(statusEntry.created_at);

  const wasRequested = tl.some(
    (e) => e.type === "approval" && /Approval requested for (Completed|Closed)/i.test(e.action || "")
  );
  if (wasRequested) {
    const approved = [...tl]
      .reverse()
      .find((e) => e.type === "approval" && /Ticket approved/i.test(e.action || ""));
    if (approved) return dateOnly(approved.created_at);
  }

  if (t.approved_at && isResolved(t)) return dateOnly(t.approved_at);
  return null;
};

// Resolution time in days (created -> completed). null when unresolved
// or not computable. Negative diffs are clamped to 0.
export const resolutionDays = (t) => {
  const done = completionDate(t);
  if (!done || !t.created_at) return null;
  const d = (new Date(done).getTime() - new Date(dateOnly(t.created_at)).getTime()) / 86400000;
  return d >= 0 ? d : 0;
};

// True when a resolved ticket met its due date. null when not assessable
// (no due date / not resolved / no completion date).
export const metDueDate = (t) => {
  if (!t.due_date || !isResolved(t)) return null;
  const done = completionDate(t);
  if (!done) return null;
  return new Date(done).getTime() <= new Date(dateOnly(t.due_date)).getTime();
};

// A ticket is overdue when it is still open past its due date.
export const isOverdue = (t) => {
  if (!t.due_date || isResolved(t)) return false;
  const today = dateOnly(new Date().toISOString());
  return dateOnly(t.due_date) < today;
};

export const round1 = (n) => Math.round(n * 10) / 10;
export const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
