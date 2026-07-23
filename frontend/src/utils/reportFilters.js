// Work owned by disabled (deactivated) people is excluded from reports and
// dashboards. The backend annotates each ticket with assigned_to_active;
// unassigned tickets and older payloads without the flag stay visible.
export const excludeDisabledUsers = (tickets = []) =>
  tickets.filter((t) => t.assigned_to_active !== false);
