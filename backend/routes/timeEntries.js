const express = require("express");
const router = express.Router();

const supabase =
  require("../config/supabase");

// =====================================================
// CREATE TIME ENTRY
// =====================================================

router.post(
  "/ticket-time-entries",
  async (req, res) => {
    try {
      const {
        ticket_id,
        work_date,
        duration_minutes,
        notes,
        user_name,
      } = req.body;

      const { data, error } =
        await supabase
          .from(
            "ticket_time_entries"
          )
          .insert([
            {
              ticket_id,
              work_date,
              duration_minutes,
              notes,
              user_name,
            },
          ])
          .select()
          .single();

      if (error) {
        console.error(error);

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

module.exports = router;