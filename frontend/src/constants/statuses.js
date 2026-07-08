// Statuses a user can set on a ticket. "Waiting For Approval" is excluded
// because it is system-set by the backend when an approval is requested.
export const TICKET_STATUSES = [
  "Open",
  "In Progress",
  "Waiting For Sources",
  "Completed",
  "Closed",
];
