const express = require("express");
const router = express.Router();

const supabase =
  require("../config/supabase");

const auth =
  require("../middleware/auth");

const getISTTime =
  require("../utils/time");

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
      // TIME VALIDATION
      // =========================================

      const consumed =
        ticket.consumed_minutes || 0;

      const allotted =
        ticket.allotted_minutes || 0;

      if (
        allotted > 0 &&
        consumed + duration_minutes >
          allotted
      ) {
        return res.status(400).json({
          message:
            "Allotted time exhausted. Please increase ticket allotted time.",
        });
      }

      // =========================================
      // INSERT ENTRY
      // =========================================

      const {
        data,
        error,
      } = await supabase
        .from(
          "ticket_time_entries"
        )
        .insert([
          {
            ticket_id,

            work_date,

            start_time,

            end_time,

            duration_minutes,

            notes,

            user_name:
              req.user.name,

            created_at:
              getISTTime(),
          },
        ])
        .select()
        .single();

      if (error) {
        return res.status(500).json({
          message:
            "Failed to log time",
          error,
        });
      }

      // =========================================
      // UPDATE TICKET CONSUMED TIME
      // =========================================

      const updatedMinutes =
        consumed +
        duration_minutes;

      let timeline =
        ticket.timeline || [];

      timeline.push({
        type: "time_log",

        action: `${req.user.name} logged ${Math.floor(
          duration_minutes / 60
        )}h ${
          duration_minutes % 60
        }m`,

        created_at:
          getISTTime(),

        user:
          req.user.name,
      });

      await supabase
        .from("tickets")
        .update({
          consumed_minutes:
            updatedMinutes,

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
      const { ticketId } =
        req.params;

      const { data, error } =
        await supabase
          .from(
            "ticket_time_entries"
          )
          .select("*")
          .eq(
            "ticket_id",
            ticketId
          )
          .order(
            "created_at",
            {
              ascending:
                false,
            }
          );

      if (error) {
        return res
          .status(400)
          .json({
            error:
              error.message,
          });
      }

      res.json(data);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "Server error",
      });
    }
  }
);

// =====================================================
// UPDATE TIME ENTRY
// =====================================================

router.put(
  "/ticket-time-entries/:id",
  auth,
  async (req, res) => {
    try {

      const { id } =
        req.params;

      const {
        start_time,
        end_time,
        duration_minutes,
      } = req.body;

      const {
        data,
        error,
      } = await supabase
        .from(
          "ticket_time_entries"
        )
        .update({
          start_time,

          end_time,

          duration_minutes,
        })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(400).json({
          error:
            error.message,
        });
      }

      res.json(data);

    } catch (err) {
      console.error(err);

      res.status(500).json({
        error:
          "Server error",
      });
    }
  }
);

module.exports = router;