const express = require("express");
const router = express.Router();

const supabase = require("../config/supabase");
const auth = require("../middleware/auth");
const getISTTime = require("../utils/time");

// =====================================================
// CREATE PERMISSION REQUEST
// =====================================================

router.post("/", auth, async (req, res) => {
  try {
    const {
      permission_date,
      from_time,
      to_time,
      reason,
    } = req.body;

    const { data, error } = await supabase
      .from("permission_requests")
      .insert([
        {
          user_id: req.user.id,
          user_name: req.user.name,

          permission_date,
          from_time,
          to_time,
          reason,

          status: "Approved",

          created_at: getISTTime(),
        },
      ])
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        message: "Permission request failed",
        error,
      });
    }

    res.status(201).json(data);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });
  }
});

// =====================================================
// GET PERMISSIONS
// =====================================================

router.get("/", auth, async (req, res) => {
  try {
    let query = supabase
      .from("permission_requests")
      .select("*")
      .order("created_at", {
        ascending: false,
      });

    if (
      req.user.role !== "Admin" &&
      req.user.role !== "Super Admin"
    ) {
      query = query.eq(
        "user_id",
        req.user.id
      );
    }

    const { data, error } = await query;

    if (error) {
      return res.status(500).json({
        message: "Fetch failed",
      });
    }

    res.json(data);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: "Server error",
    });
  }
});

module.exports = router;