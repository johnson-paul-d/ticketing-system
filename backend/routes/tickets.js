  const express = require("express");

  const router = express.Router();

  const supabase =
    require("../config/supabase");

  const auth =
    require("../middleware/auth");

  const sendMail =
    require("../services/mailService");

  const getISTTime =
    require("../utils/time");

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

        /*
        =====================================================
        TEAM MEMBER FILTER
        =====================================================
        */

        if (
          req.user.role ===
          "Team Member"
        ) {

          query =
            query.or(`
  assigned_to_name.eq.${req.user.name},
  tagged_users.cs.["${req.user.name}"]
  `);
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
  TEST MAIL
  =====================================================
  */

  router.get(
    "/test-mail",
    async (req, res) => {

      try {

        await sendMail({

          to:
            process.env.ADMIN_EMAIL,

          subject:
            "Test Mail",

          text:
            "Mail is working successfully",
        });

        res.json({
          success: true,
          message:
            "Mail sent successfully",
        });

      } catch (error) {

        console.log(
          "MAIL ERROR:",
          error
        );

        res.status(500).json({
          success: false,
          message:
            "Mail failed",
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

        const timeline = [
          {
            type:
              "system",

            action:
              "Ticket created",

            user:
              req.user.name,

            comment:
              "",

            mentions: [],

            created_at:
              getISTTime(),
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

              status:
                "Open",

              approval_required:
                false,

              approval_status:
                "Approved",

              tagged_users:
                [],

              timeline,

              created_by:
                req.user.id,

              created_by_name:
                req.user.name,

              deleted:
                false,
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

        /*
        =====================================================
        MENTIONS
        =====================================================
        */

        const mentions =
          comment?.match(/@\w+/g)
          || [];

        const taggedUsers =
          mentions.map(
            (m) =>
              m.replace("@", "")
          );
        /*
        =====================================================
        EXISTING TICKET
        =====================================================
        */

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

        
      /*
  =====================================================
  MENTION NOTIFICATIONS
  =====================================================
  */

  for (const username of taggedUsers) {

    await supabase
      .from("notifications")
      .insert({

        user_name:
          username,

        title:
          "You were tagged",

        message:
          `${req.user.name} tagged you in "${existing.title}"`,

        ticket_id:
          existing.id,
      });
  }


        let timeline =
          existing.timeline || [];

        /*
        =====================================================
        COMMENT ENTRY
        =====================================================
        */

        if (comment) {

          timeline.push({

            type:
              "comment",

            action:
              "Comment added",

            user:
              req.user.name,

            comment,

            mentions,

            created_at:
              getISTTime(),
          });
        }

        /*
        =====================================================
        DUE DATE
        =====================================================
        */

        if (
          due_date &&
          due_date !==
            existing.due_date
        ) {

          timeline.push({

            type:
              "due_date",

            action:
              `Due date changed to ${due_date}`,

            user:
              req.user.name,

            comment:
              comment || "",

            mentions,

            created_at:
              getISTTime(),
          });

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
        STATUS
        =====================================================
        */

        if (
          status &&
          status !==
            existing.status
        ) {

          timeline.push({

            type:
              "status",

            action:
              `Status changed to ${status}`,

            user:
              req.user.name,

            comment:
              comment || "",

            mentions,

            created_at:
              getISTTime(),
          });

          /*
          =====================================================
          APPROVAL FLOW
          =====================================================
          */

          if (
            status ===
              "Completed" ||
            status ===
              "Waiting For Sources"
          ) {

            timeline.push({

              type:
                "approval",

              action:
                `Approval requested for ${status}`,

              user:
                req.user.name,

              comment:
                comment || "",

              mentions,

              created_at:
                getISTTime(),
            });
  /*
  =====================================================
  APPROVAL NOTIFICATION
  =====================================================
  */

  await supabase
    .from("notifications")
    .insert({

      user_name:
        "Admin",

      title:
        "Approval Required",

      message:
        `${req.user.name} requested approval for "${existing.title}"`,

      ticket_id:
        existing.id,
    });
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

          timeline,

          tagged_users:
            [
              ...new Set([
                ...(existing.tagged_users || []),
                ...taggedUsers,
              ]),
            ],
        };

        if (title !== undefined)
          updateData.title =
            title;

        if (description !== undefined)
          updateData.description =
            description;

        if (priority !== undefined)
          updateData.priority =
            priority;

        if (category !== undefined)
          updateData.category =
            category;

        /*
        =====================================================
        APPROVAL LOGIC
        =====================================================
        */

        if (
          status ===
            "Completed" ||
          status ===
            "Waiting For Sources"
        ) {

          updateData.status =
            "Pending Approval";

          updateData.approval_required =
            true;

          updateData.approval_status =
            "Pending";

          updateData.approval_requested_by =
            req.user.name;

        } else if (
          status !== undefined
        ) {

          updateData.status =
            status;
        }

        /*
        =====================================================
        DUE DATE FORMAT
        =====================================================
        */

        if (
          due_date !== undefined &&
          due_date !== ""
        ) {

          updateData.due_date =
            new Date(due_date)
              .toISOString()
              .split("T")[0];
        }

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
  APPROVE / REJECT
  =====================================================
  */
  router.put(
    "/:id/approve",
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
                "Only admin can approve",
            });
        }

        const {
          approval_status,
        } = req.body;

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

        const timeline =
          existing.timeline || [];

        timeline.push({

          type:
            "approval",

          action:
            `Approval ${approval_status}`,

          user:
            req.user.name,

          comment:
            "",

          mentions: [],

          created_at:
            getISTTime(),
        });

        const updateData = {

          approval_status,

          approved_by:
            req.user.name,

          timeline,
        };

        if (
          approval_status ===
          "Approved"
        ) {

          updateData.status =
            "Completed";
        }

        if (
          approval_status ===
          "Rejected"
        ) {

          updateData.status =
            "In Progress";
        }

        const {
          data,
          error,
        } = await supabase
          .from("tickets")
          .update(updateData)
          .eq(
            "id",
            req.params.id
          )
          .select()
          .single();

        if (error)
          throw error;
        /*
=====================================================
APPROVAL RESULT NOTIFICATION
=====================================================
*/

await supabase
  .from("notifications")
  .insert({

    user_name:
      existing.approval_requested_by,

    title:
      `Ticket ${approval_status}`,

    message:
      `${req.user.name} ${approval_status.toLowerCase()} your ticket "${existing.title}"`,

    ticket_id:
      existing.id,
  });

        res.json(data);

      } catch (err) {

        console.log(err);

        res.status(500).json({
          message:
            "Approval failed",
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

        const timeline =
          existing.timeline || [];

        timeline.push({

          type:
            "assignment",

          action:
            `Assigned to ${assigned_to_name}`,

          user:
            req.user.name,

          comment:
            "",

          mentions: [],

          created_at:
            getISTTime(),
        });

        const {
          data,
          error,
        } = await supabase
          .from("tickets")
          .update({
            assigned_to,
            assigned_to_name,

            timeline,

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
              deleted:
                true,

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