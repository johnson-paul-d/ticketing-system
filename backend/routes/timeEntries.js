const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");
const auth = require("../middleware/auth");
const getISTTime = require("../utils/time");

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

      // =========================================
      // TIME VALIDATION (REMOVED)
      // =========================================
      // Consumed minutes kept for reporting
      const consumed = ticket.consumed_minutes || 0;

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
            duration_minutes,
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
      // =========================================
      const updatedMinutes = consumed + duration_minutes;

      let timeline = ticket.timeline || [];
      timeline.push({
        type: "time_log",
        action: `${req.user.name} logged ${Math.floor(
          duration_minutes / 60
        )}h ${duration_minutes % 60}m`,
        created_at: getISTTime(),
        user: req.user.name,
      });

      await supabase
        .from("tickets")
        .update({
          consumed_minutes: updatedMinutes,
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
  async (req, res) => {
    try {
      const { ticketId } = req.params;

      const { data, error } = await supabase
        .from("ticket_time_entries")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });

      if (error) {
        return res.status(400).json({
          error: error.message,
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
      const { start_time, end_time, duration_minutes } = req.body;

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

      // =========================================
      // VALIDATE ALLOTTED TIME (REMOVED)
      // =========================================
      // Keep consumed minutes calculation for reporting
      const consumed = ticket.consumed_minutes || 0;
      const adjustedConsumed = consumed - existingEntry.duration_minutes;

      // =========================================
      // UPDATE ENTRY
      // =========================================
      const { data, error } = await supabase
        .from("ticket_time_entries")
        .update({
          start_time: new Date(start_time).toISOString(),
          end_time: new Date(end_time).toISOString(),
          duration_minutes,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(400).json({
          error: error.message,
        });
      }

      // =========================================
      // UPDATE CONSUMED TIME
      // =========================================
      const newConsumed = adjustedConsumed + duration_minutes;

      await supabase
        .from("tickets")
        .update({
          consumed_minutes: newConsumed,
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