const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');

const { Resend } = require('resend');

// =====================================================
// RESEND
// =====================================================

if (!process.env.RESEND_API_KEY)
  console.error(
    '❌ RESEND_API_KEY missing'
  );

const resend = new Resend(
  process.env.RESEND_API_KEY
);

// =====================================================
// EMAIL
// =====================================================

const sendApprovalEmail =
  async (
    to,
    ticketTitle,
    requesterName,
    ticketId
  ) => {
    try {
      await resend.emails.send({
        from:
          process.env.FROM_EMAIL,

        to,

        subject: `Approval Required: ${ticketTitle}`,

        html: `
        <div style="font-family:sans-serif;">
          <h2>Approval Required</h2>

          <p>
            ${requesterName}
            requested approval for:
          </p>

          <h3>${ticketTitle}</h3>

          <a
            href="${process.env.FRONTEND_URL}/tickets/${ticketId}"
            style="
              background:black;
              color:white;
              padding:10px 16px;
              border-radius:8px;
              text-decoration:none;
              display:inline-block;
            "
          >
            View Ticket
          </a>
        </div>
      `,
      });

      return true;
    } catch (err) {
      console.error(
        'Email error:',
        err
      );

      return false;
    }
  };

// =====================================================
// GET ALL TICKETS + TIME ENTRIES
// =====================================================

router.get(
  '/',
  auth,
  async (req, res) => {
    try {
      // =====================================================
      // BASE QUERY
      // =====================================================

      let query = supabase
        .from('tickets')
        .select('*');

      // =====================================================
      // ACCESS CONTROL
      // =====================================================

      if (
        req.user.role !==
          'Admin' &&
        req.user.role !==
          'Super Admin'
      ) {
        query = query.eq(
          'assigned_to',
          req.user.id
        );
      }

      // =====================================================
      // GET TICKETS
      // =====================================================

      const {
        data: tickets,
        error,
      } = await query.order(
        'due_date',
        {
          ascending: true,
        }
      );

      if (error) {
        console.error(error);

        return res
          .status(500)
          .json({
            message:
              'Failed to fetch tickets',
            error,
          });
      }

      // =====================================================
      // GET TIME ENTRIES
      // =====================================================

      const {
        data: timeEntries,
        error: timeError,
      } = await supabase
        .from(
          'ticket_time_entries'
        )
        .select('*');

      if (timeError) {
        console.error(
          'Time entry fetch error:',
          timeError
        );
      }

      // =====================================================
      // GET USERS (for assigned_to names)
      // =====================================================

      const assignedIds = [
        ...new Set(
          tickets
            .map(t => t.assigned_to)
            .filter(Boolean)
        )
      ];

      let users = [];
      if (assignedIds.length > 0) {
        const { data: fetchedUsers, error: userError } = await supabase
          .from('users')
          .select('id, name')
          .in('id', assignedIds);

        if (!userError && fetchedUsers) {
          users = fetchedUsers;
        } else {
          console.error('User fetch error:', userError);
        }
      }

      // =====================================================
      // MAP TIME ENTRIES AND USER NAMES
      // =====================================================

      const mappedTickets = tickets.map((ticket) => {

        const entries =
          (timeEntries || []).filter(
            (entry) =>
              entry.ticket_id === ticket.id
          );

        const assignedUser = users?.find(
          (u) => u.id === ticket.assigned_to
        );

        return {
          ...ticket,

          assigned_to_name:
            assignedUser?.name || null,

          time_entries:
            entries || [],
        };
      });

      res.json(mappedTickets);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

// =====================================================
// GET SINGLE TICKET + TIME ENTRIES
// =====================================================

router.get(
  '/:id',
  auth,
  async (req, res) => {
    try {
      // =====================================================
      // GET TICKET
      // =====================================================

      const {
        data: ticket,
        error,
      } = await supabase
        .from('tickets')
        .select('*')
        .eq(
          'id',
          req.params.id
        )
        .single();

      if (
        error ||
        !ticket
      ) {
        return res
          .status(404)
          .json({
            message:
              'Ticket not found',
          });
      }

      // =====================================================
      // ACCESS CONTROL
      // =====================================================

      if (
        req.user.role !==
          'Admin' &&
        req.user.role !==
          'Super Admin'
      ) {
        if (
          ticket.assigned_to !==
          req.user.id
        ) {
          return res
            .status(403)
            .json({
              message:
                'Access denied',
            });
        }
      }

      // =====================================================
      // GET TIME ENTRIES
      // =====================================================

      const {
        data: timeEntries,
        error: timeError,
      } = await supabase
        .from(
          'ticket_time_entries'
        )
        .select('*')
        .eq(
          'ticket_id',
          ticket.id
        )
        .order(
          'created_at',
          {
            ascending:
              false,
          }
        );

      if (timeError) {
        console.error(
          'Time entry fetch error:',
          timeError
        );
      }

      // =====================================================
      // FINAL RESPONSE
      // =====================================================

      res.json({
        ...ticket,

        time_entries:
          timeEntries || [],
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

// =====================================================
// CREATE TICKET
// =====================================================

router.post(
  '/',
  auth,
  async (req, res) => {
    try {
      const {
        title,
        description,
        priority,
        category,
        assigned_to,
        due_date,
        allotted_minutes,
      } = req.body;

      if (
        !title ||
        !description
      ) {
        return res
          .status(400)
          .json({
            message:
              'Title and description required',
          });
      }

      const insertData = {
        title,

        description,

        priority:
          priority ||
          'Medium',

        category:
          category || null,

        assigned_to:
          assigned_to ||
          null,

        due_date:
          due_date ||
          null,

        allotted_minutes:
          allotted_minutes || 0,

        status: 'Open',

        created_by:
          req.user.name,

        created_at:
          getISTTime(),

        updated_at:
          getISTTime(),

        tagged_users: [],

        timeline: [
          {
            type:
              'created',

            action:
              'Ticket created',

            user:
              req.user.name,

            created_at:
              getISTTime(),
          },
        ],
      };

      const {
        data,
        error,
      } = await supabase
        .from('tickets')
        .insert([
          insertData,
        ])
        .select()
        .single();

      if (error) {
        console.error(error);

        return res
          .status(500)
          .json({
            message:
              'Ticket creation failed',

            error:
              error.message,
          });
      }

      // =====================================================
      // NOTIFICATION
      // =====================================================

      if (assigned_to) {
        await supabase
          .from(
            'notifications'
          )
          .insert({
            user_name:
              assigned_to,

            title:
              'New Ticket Assigned',

            message: `${req.user.name} assigned a ticket to you`,

            ticket_id:
              data.id,
          });
      }

      const io =
        req.app.get('io');

      if (io) {
        io.emit(
          'ticketCreated',
          data
        );

        io.emit(
          'notificationReceived'
        );
      }

      res
        .status(201)
        .json(data);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

// =====================================================
// UPDATE TICKET
// =====================================================

router.put(
  '/:id',
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
        allotted_minutes,
      } = req.body;

      const {
  data: existing,
  error: fetchError,
} = await supabase
  .from("tickets")
  .select("*")
  .eq("id", req.params.id)
  .single();

if (fetchError || !existing) {
  return res.status(404).json({
    message: "Ticket not found",
  });
}

      // =====================================================
      // ACCESS
      // =====================================================

      if (
        req.user.role !==
          'Admin' &&
        req.user.role !==
          'Super Admin'
      ) {
        if (
          existing.assigned_to !==
          req.user.id
        ) {
          return res
            .status(403)
            .json({
              message:
                'Access denied',
            });
        }
      }

      // =====================================================
      // TIMELINE
      // =====================================================

let timeline =
  existing.timeline || [];

      // =====================================================
      // COMMENT (type: comment_add)
      // =====================================================

      if (comment) {
        timeline.push({
          type: 'comment_add',

          action:
            'Comment added',

          user:
            req.user.name,

          comment,

          created_at:
            getISTTime(),
        });
      }

      const updateData = {
        updated_at:
          getISTTime(),

        timeline,
      };

      if (
        title !== undefined
      )
        updateData.title =
          title;

      if (
        description !==
        undefined
      )
        updateData.description =
          description;

      if (
        priority !==
        undefined
      )
        updateData.priority =
          priority;

      if (
        category !==
        undefined
      )
        updateData.category =
          category;

      // =====================================================
      // DUE DATE CHANGE TRACKING
      // =====================================================

      if (
        due_date !==
          undefined &&
        due_date !== ''
      ) {
        const oldDate = existing.due_date;
        const newDate = new Date(due_date).toISOString().split('T')[0];
        updateData.due_date = newDate;

        if (oldDate !== newDate) {
          timeline.push({
            type: 'due_date',
            action: `Due date changed from ${oldDate || 'Not set'} to ${newDate}`,
            user: req.user.name,
            created_at: getISTTime(),
          });
        }
      }

      // =====================================================
      // ALLOTTED TIME CHANGE TRACKING
      // =====================================================

      if (
        allotted_minutes !== undefined &&
        allotted_minutes !== existing.allotted_minutes
      ) {
        timeline.push({
          type: 'allotted_time',
          action: `Allotted time changed from ${existing.allotted_minutes || 0} mins to ${allotted_minutes} mins`,
          user: req.user.name,
          created_at: getISTTime(),
        });
        updateData.allotted_minutes = allotted_minutes;
      }

      // =====================================================
      // APPROVAL FLOW
      // =====================================================

      const approvalTriggers =
        [
          'Completed',
          'Waiting For Sources',
          'Waiting For Resources',
        ];

      if (
        status &&
        approvalTriggers.includes(
          status
        )
      ) {
        updateData.status =
          'Waiting For Approval';

        updateData.approval_required =
          true;

        updateData.approval_status =
          'Pending';

        updateData.approval_requested_by =
          req.user.name;

        updateData.approval_requested_status =
          status;

        timeline.push({
          type:
            'approval',

          action: `Approval requested for ${status}`,

          user:
            req.user.name,

          created_at:
            getISTTime(),
        });

        await supabase
          .from(
            'notifications'
          )
          .insert({
            user_name:
              'Admin',

            title:
              'Approval Required',

            message: `${req.user.name} requested approval for "${existing.title}"`,

            ticket_id:
              existing.id,
          });

        const adminEmail =
          process.env.ADMIN_EMAIL;

        if (adminEmail) {
          await sendApprovalEmail(
            adminEmail,
            existing.title,
            req.user.name,
            existing.id
          );
        }
      } else if (
        status !==
        undefined
      ) {
        updateData.status =
          status;
      }

      // =====================================================
      // UPDATE
      // =====================================================

      const {
        data,
        error,
      } = await supabase
        .from('tickets')
        .update(
          updateData
        )
        .eq('id', id)
        .select()
        .single();

      if (error) {
        console.error(error);

        return res
          .status(500)
          .json({
            message:
              'Update failed',

            error:
              error.message,
          });
      }

      const io =
        req.app.get('io');

      if (io) {
        io.emit(
          'ticketUpdated',
          data
        );
      }

      res.json(data);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

// =====================================================
// APPROVE
// =====================================================

router.put(
  '/:id/approve',
  auth,
  async (req, res) => {
    try {
      if (
        req.user.role !==
          'Admin' &&
        req.user.role !==
          'Super Admin'
      ) {
        return res
          .status(403)
          .json({
            message:
              'Only admin can approve',
          });
      }

      const {
        data: ticket,
      } = await supabase
        .from('tickets')
        .select('*')
        .eq(
          'id',
          req.params.id
        )
        .single();

      let timeline =
        Array.isArray(
          ticket.timeline
        )
          ? ticket.timeline
          : [];

      timeline.push({
        type:
          'approval',

        action:
          'Ticket approved',

        user:
          req.user.name,

        created_at:
          getISTTime(),
      });

      const finalStatus =
        ticket.approval_requested_status ||
        'Open';

      const {
        data,
        error,
      } = await supabase
        .from('tickets')
        .update({
          status:
            finalStatus,

          approval_required:
            false,

          approval_status:
            'Approved',

          approved_by:
            req.user.name,

          approved_at:
            getISTTime(),

          updated_at:
            getISTTime(),

          timeline,
        })
        .eq(
          'id',
          req.params.id
        )
        .select()
        .single();

      if (error) {
        return res
          .status(500)
          .json({
            message:
              'Approval failed',
          });
      }

      const io =
        req.app.get('io');

      if (io) {
        io.emit(
          'ticketUpdated',
          data
        );
      }

      res.json(data);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

// =====================================================
// REJECT
// =====================================================

router.put(
  '/:id/reject',
  auth,
  async (req, res) => {
    try {
      if (
        req.user.role !==
          'Admin' &&
        req.user.role !==
          'Super Admin'
      ) {
        return res
          .status(403)
          .json({
            message:
              'Only admin can reject',
          });
      }

      const {
        data: ticket,
      } = await supabase
        .from('tickets')
        .select('*')
        .eq(
          'id',
          req.params.id
        )
        .single();

      let timeline =
        Array.isArray(
          ticket.timeline
        )
          ? ticket.timeline
          : [];

      timeline.push({
        type:
          'approval',

        action:
          'Ticket rejected',

        user:
          req.user.name,

        created_at:
          getISTTime(),
      });

      const {
        data,
        error,
      } = await supabase
        .from('tickets')
        .update({
          status: 'Open',

          approval_required:
            false,

          approval_status:
            'Rejected',

          rejected_by:
            req.user.name,

          rejected_at:
            getISTTime(),

          updated_at:
            getISTTime(),

          timeline,
        })
        .eq(
          'id',
          req.params.id
        )
        .select()
        .single();

      if (error) {
        return res
          .status(500)
          .json({
            message:
              'Reject failed',
          });
      }

      const io =
        req.app.get('io');

      if (io) {
        io.emit(
          'ticketUpdated',
          data
        );
      }

      res.json(data);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

// =====================================================
// ASSIGN
// =====================================================

router.put(
  '/:id/assign',
  auth,
  async (req, res) => {
    try {
      const {
        assigned_to,
      } = req.body;

      const {
        data: existing,
      } = await supabase
        .from('tickets')
        .select('*')
        .eq(
          'id',
          req.params.id
        )
        .single();

      const {
        data,
        error,
      } = await supabase
        .from('tickets')
        .update({
          assigned_to,

          updated_at:
            getISTTime(),
        })
        .eq(
          'id',
          req.params.id
        )
        .select()
        .single();

      if (error) {
        return res
          .status(500)
          .json({
            message:
              'Assignment failed',
          });
      }

      await supabase
        .from(
          'notifications'
        )
        .insert({
          user_name:
            assigned_to,

          title:
            'Ticket Assigned',

          message: `${req.user.name} assigned "${existing.title}" to you`,

          ticket_id:
            existing.id,
        });

      const io =
        req.app.get('io');

      if (io) {
        io.emit(
          'ticketUpdated',
          data
        );

        io.emit(
          'notificationReceived'
        );
      }

      res.json(data);
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

// =====================================================
// DELETE
// =====================================================

router.delete(
  '/:id',
  auth,
  async (req, res) => {
    try {
      if (
        req.user.role !==
          'Admin' &&
        req.user.role !==
          'Super Admin'
      ) {
        return res
          .status(403)
          .json({
            message:
              'Only admin can delete tickets',
          });
      }

      const { error } =
        await supabase
          .from('tickets')
          .delete()
          .eq(
            'id',
            req.params.id
          );

      if (error) {
        return res
          .status(500)
          .json({
            message:
              'Delete failed',
          });
      }

      res.json({
        success: true,
        message:
          'Ticket deleted',
      });
    } catch (err) {
      console.error(err);

      res.status(500).json({
        message:
          'Server error',
      });
    }
  }
);

module.exports = router;