const express =
  require("express");

const router =
  express.Router();

const supabase =
  require("../config/supabase");

const auth =
  require("../middleware/auth");

/*
=====================================================
GET USER NOTIFICATIONS
=====================================================
*/

router.get(
  "/",
  auth,
  async (req, res) => {

    try {

      const {
        data,
        error,
      } = await supabase
        .from("notifications")
        .select("*")
        .eq(
          "user_name",
          req.user.name
        )
        .order(
          "created_at",
          {
            ascending:
              false,
          }
        );

      if (error)
        throw error;

      res.json(data);

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Failed to fetch notifications",
      });
    }
  }
);

/*
=====================================================
MARK READ
=====================================================
*/

router.put(
  "/:id/read",
  auth,
  async (req, res) => {

    try {

      const {
        error,
      } = await supabase
        .from("notifications")
        .update({
          is_read:
            true,
        })
        .eq(
          "id",
          req.params.id
        );

      if (error)
        throw error;

      res.json({
        success:
          true,
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        message:
          "Failed to update notification",
      });
    }
  }
);

module.exports =
  router;