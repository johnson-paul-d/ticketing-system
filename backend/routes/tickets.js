const express = require("express");

const router = express.Router();

const supabase =
  require("../config/supabase");

const auth =
  require("../middleware/auth");

const sendMail =
  require("../services/mailService");

/*
=====================================================
GET ALL TICKETS
=====================================================
*/
router.get(
  "/",
  auth,
  async (req, res) => {

    try {

      let query =
        supabase
          .from("tickets")
          .select("*")
          .eq("deleted", false)
          .order(
            "created_at",
            {
              ascending: false,
            }
          );

      // TEAM MEMBER FILTER
      if (
        req.user.role ===
        "Team Member"
      ) {

        query =
          query.eq(
            "assigned_to_name",
            req.user.name
          );
      }

      const {
        data,
        error,
      } = await query;

      if (error)
        throw error;

      res.json(data);

    } catch (error) {

      console.log(
        "GET TICKETS ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch tickets",
      });
    }
  }
);

/*
=====================================================
GET SINGLE TICKET
=====================================================
*/
router.get(
  "/:id",
  auth,
  async (req, res) => {

    try {

      const {
        data,
        error,
      } = await supabase
        .from("tickets")
        .select("*")
        .eq(
          "id",
          req.params.id
        )
        .single();

      if (error)
        throw error;

      res.json(data);

    } catch (error) {

      console.log(
        "GET SINGLE TICKET ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to fetch ticket",
      });
    }
  }
);

/*
=====================================================
CREATE TICKET
=====================================================
*/
router.post(
  "/",
  auth,
  async (req, res) => {

    try {

      const {
        title,
        description,
        category,
        priority,
        division,
        due_date,
      } = req.body;

      const history = [
        {
          action:
            "Ticket created",

          user:
            req.user.name,

          comment:
            "",

          date:
            new Date().toLocaleString(),
        },
      ];

      const {
        data,
        error,
      } = await supabase
        .from("tickets")
        .insert([
          {
            title,
            description,
            category,
            priority,
            division,
            due_date,

            status: "Open",

            history,

            created_by:
              req.user.id,

            created_by_name:
              req.user.name,

            deleted: false,
          },
        ])
        .select();

      if (error)
        throw error;

      res
        .status(201)
        .json(data[0]);

    } catch (error) {

      console.log(
        "CREATE TICKET ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to create ticket",
      });
    }
  }
);

/*
=====================================================
UPDATE TICKET
=====================================================
*/
router.put(
  "/:id",
  auth,
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const {
        title,
        description,
        priority,
        status,
        category,
        due_date,
        comment,
      } = req.body;

      // GET EXISTING
      const {
        data: existing,
        error: fetchError,
      } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError)
        throw fetchError;

      let updatedHistory =
        existing.history || [];

      /*
      =====================================================
      DUE DATE HISTORY
      =====================================================
      */
      if (
        due_date &&
        due_date !==
          existing.due_date
      ) {

        updatedHistory.push({
          action:
            `Due date changed to ${due_date}`,

          user:
            req.user.name,

          comment:
            comment || "",

          date:
            new Date().toLocaleString(),
        });

        // EMAIL
        try {

          await sendMail({
            to:
              process.env.ADMIN_EMAIL,

            subject:
              "Ticket Due Date Updated",

            text:
              `
Ticket:
${existing.title}

Updated By:
${req.user.name}

New Due Date:
${due_date}

Comment:
${comment || "No comment"}
              `,
          });

        } catch (mailError) {

          console.log(
            "MAIL ERROR:",
            mailError
          );
        }
      }

      /*
      =====================================================
      STATUS HISTORY
      =====================================================
      */
      if (
        status &&
        status !==
          existing.status
      ) {

        updatedHistory.push({
          action:
            `Status changed to ${status}`,

          user:
            req.user.name,

          comment:
            comment || "",

          date:
            new Date().toLocaleString(),
        });

        // COMPLETION EMAIL
        if (
          status ===
          "Completed"
        ) {

          try {

            await sendMail({
              to:
                process.env.ADMIN_EMAIL,

              subject:
                "Ticket Completed",

              text:
                `
Ticket:
${existing.title}

Completed By:
${req.user.name}

Comment:
${comment || "No comment"}
                `,
            });

          } catch (mailError) {

            console.log(
              "MAIL ERROR:",
              mailError
            );
          }
        }
      }

      /*
      =====================================================
      UPDATE OBJECT
      =====================================================
      */

      const updateData = {

        updated_at:
          new Date(),

        history:
          updatedHistory,
      };

      if (title !== undefined)
        updateData.title = title;

      if (description !== undefined)
        updateData.description =
          description;

      if (priority !== undefined)
        updateData.priority =
          priority;

      if (status !== undefined)
        updateData.status =
          status;

      if (category !== undefined)
        updateData.category =
          category;

      if (due_date !== undefined)
        updateData.due_date =
          due_date;

      /*
      =====================================================
      UPDATE DATABASE
      =====================================================
      */

      const {
        data,
        error,
      } = await supabase
        .from("tickets")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) {

        console.log(
          "SUPABASE UPDATE ERROR:",
          error
        );

        return res
          .status(500)
          .json({
            message:
              "Database update failed",
            error,
          });
      }

      res.json(data);

    } catch (error) {

      console.log(
        "UPDATE ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Failed to update ticket",
      });
    }
  }
);

/*
=====================================================
ASSIGN TICKET
=====================================================
*/
router.put(
  "/:id/assign",
  auth,
  async (req, res) => {

    try {

      const { id } =
        req.params;

      const {
        assigned_to,
        assigned_to_name,
      } = req.body;

      const {
        data: existing,
      } = await supabase
        .from("tickets")
        .select("*")
        .eq("id", id)
        .single();

      const history =
        existing.history || [];

      history.push({
        action:
          `Assigned to ${assigned_to_name}`,

        user:
          req.user.name,

        comment:
          "",

        date:
          new Date().toLocaleString(),
      });

      const {
        data,
        error,
      } = await supabase
        .from("tickets")
        .update({
          assigned_to,
          assigned_to_name,

          history,

          updated_at:
            new Date(),
        })
        .eq("id", id)
        .select()
        .single();

      if (error)
        throw error;

      res.json(data);

    } catch (error) {

      console.log(
        "ASSIGN ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Assignment failed",
      });
    }
  }
);

/*
=====================================================
UNASSIGN TICKET
=====================================================
*/
router.put(
  "/:id/unassign",
  auth,
  async (req, res) => {

    try {

      const {
        data: existing,
      } = await supabase
        .from("tickets")
        .select("*")
        .eq(
          "id",
          req.params.id
        )
        .single();

      const history =
        existing.history || [];

      history.push({
        action:
          "Ticket unassigned",

        user:
          req.user.name,

        comment:
          "",

        date:
          new Date().toLocaleString(),
      });

      const {
        data,
        error,
      } = await supabase
        .from("tickets")
        .update({
          assigned_to: null,
          assigned_to_name: null,

          history,

          updated_at:
            new Date(),
        })
        .eq(
          "id",
          req.params.id
        )
        .select();

      if (error)
        throw error;

      res.json(data[0]);

    } catch (error) {

      console.log(
        "UNASSIGN ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Unassign failed",
      });
    }
  }
);

/*
=====================================================
DELETE TICKET
=====================================================
*/
router.delete(
  "/:id",
  auth,
  async (req, res) => {

    try {

      if (
        req.user.role !==
        "Admin"
      ) {

        return res
          .status(403)
          .json({
            message:
              "Access denied",
          });
      }

      const { error } =
        await supabase
          .from("tickets")
          .update({
            deleted: true,

            updated_at:
              new Date(),
          })
          .eq(
            "id",
            req.params.id
          );

      if (error)
        throw error;

      res.json({
        message:
          "Ticket deleted",
      });

    } catch (error) {

      console.log(
        "DELETE ERROR:",
        error
      );

      res.status(500).json({
        message:
          "Delete failed",
      });
    }
  }
);

module.exports = router;