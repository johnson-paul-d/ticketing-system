const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");
const auth = require("../middleware/auth");
const getISTTime = require("../utils/time");
const {
  TEAM,
  isAdmin,
  isSuperAdmin,
  teamFromRole,
  getUserTeam,
} = require("../utils/roles");

// =====================================================
// TICKET ACCESS
// A ticket belongs to the team of its assignee, falling back to its creator —
// the same rule routes/tickets.js applies. Team admins are limited to their
// own team, Super Admins span every team, everyone else needs to be the
// assignee or the creator. There is no row-level security behind this, so
// these checks are the only thing guarding the data.
// =====================================================
const ticketTeam = async (ticket) => {
  const ids = [ticket.assigned_to, ticket.created_by].filter(Boolean);
  if (!ids.length) return TEAM.MARKETING;
  const { data: users } = await supabase
    .from("users")
    .select("id, role")
    .in("id", ids);
  const roleOf = (id) => users?.find((u) => u.id === id)?.role;
  return (
    teamFromRole(roleOf(ticket.assigned_to)) ||
    teamFromRole(roleOf(ticket.created_by)) ||
    TEAM.MARKETING
  );
};

const canAccessTicket = async (user, ticket) => {
  if (isSuperAdmin(user)) return true;
  if (isAdmin(user)) return (await ticketTeam(ticket)) === getUserTeam(user);
  return ticket.assigned_to === user.id || ticket.created_by === user.id;
};

// Entries are stamped with user_name, not a user id, so ownership has to be
// matched on the name; prefer user_id if the column ever appears on the row.
const ownsEntry = (user, entry) =>
  entry.user_id ? entry.user_id === user.id : entry.user_name === user.name;

// Only the person who logged the time, or an admin over that ticket's team,
// may rewrite it.
const canModifyEntry = async (user, entry, ticket) => {
  if (ownsEntry(user, entry)) return true;
  if (isSuperAdmin(user)) return true;
  if (isAdmin(user)) return (await ticketTeam(ticket)) === getUserTeam(user);
  return false;
};

// duration_minutes arrives straight from JSON and may be a string ("30"),
// which would concatenate rather than add in the consumed_minutes arithmetic.
const parseDuration = (value) => {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  return minutes;
};

const formatDuration = (minutes) =>
  `${Math.floor(minutes / 60)}h ${minutes % 60}m`;

// =====================================================
// CREATE TIME ENTRY
// =====================================================
router.post(
  "/ticket-time-entries",
  auth,
  async (req, res) => {
    try {
      const {
        ticket_id,
        work_date,
        start_time,
        end_time,
        duration_minutes,
        notes,
      } = req.body;

      const minutes = parseDuration(duration_minutes);
      if (minutes === null) {
        return res.status(400).json({
          message: "Invalid duration",
        });
      }

      // =========================================
      // GET TICKET
      // =========================================
      const {
        data: ticket,
        error: ticketError,
      } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", ticket_id)
        .single();

      if (ticketError || !ticket) {
        return res.status(404).json({
          message: "Ticket not found",
        });
      }

      if (!(await canAccessTicket(req.user, ticket))) {
        return res.status(403).json({
          message: "Access denied",
        });
      }

      // =========================================
      // INSERT ENTRY
      // =========================================
      const { data, error } = await supabase
        .from("ticket_time_entries")
        .insert([
          {
            ticket_id,
            work_date,
            start_time: new Date(start_time).toISOString(),
            end_time: new Date(end_time).toISOString(),
            duration_minutes: minutes,
            notes,
            user_name: req.user.name,
            created_at: getISTTime(),
          },
        ])
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          message: "Failed to log time",
          error,
        });
      }

      // =========================================
      // UPDATE TICKET CONSUMED TIME
      // Re-read as late as possible so the window between reading and writing
      // stays small. This is still a read-modify-write: the REST client has no
      // transactions, so two writes landing together can lose one.
      // =========================================
      const { data: fresh } = await supabase
        .from("tickets")
        .select("consumed_minutes, timeline")
        .eq("id", ticket_id)
        .single();

      const current = fresh || ticket;
      const consumed = Number(current.consumed_minutes) || 0;

      let timeline = current.timeline || [];
      timeline.push({
        type: "time_log",
        action: `${req.user.name} logged ${formatDuration(minutes)}`,
        created_at: getISTTime(),
        user: req.user.name,
      });

      await supabase
        .from("tickets")
        .update({
          consumed_minutes: consumed + minutes,
          timeline,
        })
        .eq("id", ticket_id);

      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        message: "Server error",
      });
    }
  }
);

// =====================================================
// GET TIME ENTRIES BY TICKET
// =====================================================
router.get(
  "/ticket-time-entries/:ticketId",
  auth,
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .select("id, assigned_to, created_by")
        .eq("id", ticketId)
        .single();

      if (ticketError || !ticket) {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      if (!(await canAccessTicket(req.user, ticket))) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      const { data, error } = await supabase
        .from("ticket_time_entries")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Time entry fetch failed:", error);
        return res.status(500).json({
          error: "Failed to fetch time entries",
        });
      }

      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Server error",
      });
    }
  }
);

// =====================================================
// UPDATE TIME ENTRY (FULLY REPLACED)
// =====================================================
router.put(
  "/ticket-time-entries/:id",
  auth,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { work_date, start_time, end_time, duration_minutes, notes } = req.body;

      const minutes = parseDuration(duration_minutes);
      if (minutes === null) {
        return res.status(400).json({
          error: "Invalid duration",
        });
      }

      // =========================================
      // GET EXISTING ENTRY
      // =========================================
      const { data: existingEntry, error: existingError } = await supabase
        .from("ticket_time_entries")
        .select("*")
        .eq("id", id)
        .single();

      if (existingError || !existingEntry) {
        return res.status(404).json({
          message: "Time entry not found",
        });
      }

      // =========================================
      // GET TICKET
      // =========================================
      const { data: ticket, error: ticketError } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", existingEntry.ticket_id)
        .single();

      if (ticketError || !ticket) {
        return res.status(404).json({
          message: "Ticket not found",
        });
      }

      if (!(await canModifyEntry(req.user, existingEntry, ticket))) {
        return res.status(403).json({
          error: "Access denied",
        });
      }

      // =========================================
      // UPDATE ENTRY
      // =========================================
      // work_date and notes are sent by the edit form and were previously
      // dropped here, so changing either reported success and saved nothing.
      const entryUpdate = {
        start_time: new Date(start_time).toISOString(),
        end_time: new Date(end_time).toISOString(),
        duration_minutes: minutes,
      };
      if (work_date !== undefined) entryUpdate.work_date = work_date;
      if (notes !== undefined) entryUpdate.notes = notes;

      const { data, error } = await supabase
        .from("ticket_time_entries")
        .update(entryUpdate)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Time entry update failed:", error);
        return res.status(400).json({
          error: "Failed to update time entry",
        });
      }

      // =========================================
      // UPDATE CONSUMED TIME
      // Re-read late, as in the create handler — the same read-modify-write
      // race applies here and can only be narrowed, not closed.
      // =========================================
      const { data: fresh } = await supabase
        .from("tickets")
        .select("consumed_minutes")
        .eq("id", existingEntry.ticket_id)
        .single();

      const consumed = Number((fresh || ticket).consumed_minutes) || 0;
      const previous = Number(existingEntry.duration_minutes) || 0;

      await supabase
        .from("tickets")
        .update({
          consumed_minutes: consumed - previous + minutes,
        })
        .eq("id", existingEntry.ticket_id);

      res.json(data);
    } catch (err) {
      console.error(err);
      res.status(500).json({
        error: "Server error",
      });
    }
  }
);

module.exports = router;