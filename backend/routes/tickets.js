const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/*
=====================================================
HELPER - SEND APPROVAL EMAIL
=====================================================
*/
const sendApprovalEmail = async (
  to,
  ticketTitle,
  requesterName,
  ticketId
) => {
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to,
      subject: `Approval Required: ${ticketTitle}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;">
          <h2>Ticket Approval Required</h2>

          <p>
            <strong>${requesterName}</strong>
            has requested approval for:
          </p>

          <p>
            <strong>${ticketTitle}</strong>
          </p>

          <a
            href="${process.env.FRONTEND_URL}/tickets/${ticketId}"
            style="
              background:#000;
              color:#fff;
              padding:10px 18px;
              border-radius:6px;
              text-decoration:none;
              display:inline-block;
              margin-top:10px;
            "
          >
            View Ticket
          </a>
        </div>
      `,
    });

    console.log('Approval email sent');
  } catch (err) {
    console.error('EMAIL ERROR:', err);
  }
};

/*
=====================================================
GET ALL TICKETS
=====================================================
*/
router.get('/', auth, async (req, res) => {
  try {

    let query = supabase
      .from('tickets')
      .select('*');

    /*
    ============================================
    ADMIN CAN SEE ALL TICKETS
    ============================================
    */
    if (
      req.user.role !== 'Admin' &&
      req.user.role !== 'Super Admin'
    ) {
      query = query.eq(
        'assigned_to',
        req.user.email
      );
    }

    const { data, error } = await query.order(
      'created_at',
      { ascending: false }
    );

    if (error) {
      console.error(error);

      return res.status(500).json({
        message: 'Failed to fetch tickets',
        error,
      });
    }

    res.json(data);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Server error',
    });
  }
});

/*
=====================================================
GET SINGLE TICKET
=====================================================
*/
router.get('/:id', auth, async (req, res) => {
  try {

    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      return res.status(404).json({
        message: 'Ticket not found',
      });
    }

    /*
    ============================================
    NORMAL USERS CAN ONLY VIEW
    THEIR ASSIGNED TICKETS
    ============================================
    */
    if (
      req.user.role !== 'Admin' &&
      req.user.role !== 'Super Admin'
    ) {
      if (data.assigned_to !== req.user.email) {
        return res.status(403).json({
          message: 'Access denied',
        });
      }
    }

    res.json(data);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Server error',
    });
  }
});

/*
=====================================================
CREATE TICKET
=====================================================
*/
router.post('/', auth, async (req, res) => {
  try {

    console.log('BODY:', req.body);
    console.log('USER:', req.user);

    const {
      title,
      description,
      priority,
      category,
      assigned_to,
      due_date,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({
        message: 'Title and description are required',
      });
    }

    const insertData = {
      title,
      description,
      priority: priority || 'Medium',
      category: category || null,
      assigned_to: assigned_to || null,
      due_date: due_date || null,

      status: 'Open',

      created_by:
        req.user?.name ||
        req.user?.email ||
        'Unknown',

      created_at: getISTTime(),
      updated_at: getISTTime(),

      tagged_users: [],

      timeline: [
        {
          type: 'created',
          action: 'Ticket created',
          user:
            req.user?.name ||
            req.user?.email ||
            'Unknown',
          created_at: getISTTime(),
        },
      ],
    };

    const { data, error } = await supabase
      .from('tickets')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error('SUPABASE ERROR:', error);

      return res.status(500).json({
        message: 'Database insert failed',
        error: error.message,
      });
    }

    /*
    ============================================
    ASSIGNMENT NOTIFICATION
    ============================================
    */
    if (assigned_to) {
      await supabase
        .from('notifications')
        .insert({
          user_name: assigned_to,
          title: 'New Ticket Assigned',
          message: `${req.user.name} assigned a ticket to you`,
          ticket_id: data.id,
        });
    }

    const io = req.app.get('io');

    if (io) {
      io.emit('ticketCreated', data);
      io.emit('notificationReceived');
    }

    res.status(201).json(data);

  } catch (err) {
    console.error('CREATE ERROR:', err);

    res.status(500).json({
      message: 'Server error',
      details: err.message,
    });
  }
});

/*
=====================================================
UPDATE TICKET
=====================================================
*/
router.put('/:id', auth, async (req, res) => {
  try {

    const { id } = req.params;

    const {
      title,
      description,
      priority,
      status,
      category,
      due_date,
      comment,
    } = req.body;

    const { data: existing, error: fetchError } =
      await supabase
        .from('tickets')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError) {
      return res.status(404).json({
        message: 'Ticket not found',
      });
    }

    /*
    ============================================
    NORMAL USERS CAN UPDATE ONLY
    THEIR ASSIGNED TICKETS
    ============================================
    */
    if (
      req.user.role !== 'Admin' &&
      req.user.role !== 'Super Admin'
    ) {
      if (existing.assigned_to !== req.user.email) {
        return res.status(403).json({
          message: 'Access denied',
        });
      }
    }

    const mentions =
      comment?.match(/@\w+/g) || [];

    const taggedUsers = mentions.map((m) =>
      m.replace('@', '')
    );

    /*
    ============================================
    TAG NOTIFICATIONS
    ============================================
    */
    for (const username of taggedUsers) {
      await supabase
        .from('notifications')
        .insert({
          user_name: username,
          title: 'You were tagged',
          message: `${req.user.name} tagged you in "${existing.title}"`,
          ticket_id: existing.id,
        });
    }

    const io = req.app.get('io');

    if (io) {
      io.emit('notificationReceived');
    }

    /*
    ============================================
    TIMELINE
    ============================================
    */
    let timeline = [];

    if (existing.timeline) {

      if (Array.isArray(existing.timeline)) {
        timeline = existing.timeline;
      } else {
        try {
          timeline = JSON.parse(
            existing.timeline
          );
        } catch {
          timeline = [];
        }
      }
    }

    if (comment) {
      timeline.push({
        type: 'comment',
        action: 'Comment added',
        user: req.user.name,
        comment,
        mentions,
        created_at: getISTTime(),
      });
    }

    /*
    ============================================
    UPDATE DATA
    ============================================
    */
    const updateData = {
      updated_at: new Date().toISOString(),

      timeline: Array.isArray(timeline)
        ? timeline
        : [],

      tagged_users: Array.from(
        new Set([
          ...(existing.tagged_users || []),
          ...taggedUsers,
        ])
      ),
    };

    if (title !== undefined)
      updateData.title = title;

    if (description !== undefined)
      updateData.description = description;

    if (priority !== undefined)
      updateData.priority = priority;

    if (category !== undefined)
      updateData.category = category;

    /*
    ============================================
    DUE DATE
    ============================================
    */
    if (
      due_date !== undefined &&
      due_date !== ''
    ) {

      updateData.due_date = new Date(
        due_date
      )
        .toISOString()
        .split('T')[0];

      timeline.push({
        type: 'due_date',
        action: `Due date changed to ${due_date}`,
        user: req.user.name,
        created_at: getISTTime(),
      });
    }

    /*
    ============================================
    APPROVAL FLOW
    ============================================
    */
    if (
      status === 'Completed' ||
      status === 'Waiting For Sources' ||
      status === 'Waiting For Approval'
    ) {

      updateData.status = status;

      updateData.approval_required = true;

      updateData.approval_status = 'Pending';

      updateData.approval_requested_by =
        req.user.name;

      updateData.approval_requested_status =
        status;

      timeline.push({
        type: 'approval',
        action: `Approval requested for ${status}`,
        user: req.user.name,
        comment: comment || '',
        mentions,
        created_at: getISTTime(),
      });

      /*
      ========================================
      ADMIN NOTIFICATION
      ========================================
      */
      await supabase
        .from('notifications')
        .insert({
          user_name: 'Admin',
          title: 'Approval Required',
          message: `${req.user.name} requested approval for "${existing.title}"`,
          ticket_id: existing.id,
        });

      /*
      ========================================
      EMAIL
      ========================================
      */
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

      if (io) {
        io.emit('notificationReceived');
      }

    } else if (status !== undefined) {

      updateData.status = status;
    }

    /*
    ============================================
    UPDATE DATABASE
    ============================================
    */
    const { data, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('UPDATE ERROR:', error);

      return res.status(500).json({
        message: 'Database update failed',
        error: error.message,
      });
    }

    if (io) {
      io.emit('ticketUpdated', data);
    }

    res.json(data);

  } catch (err) {
    console.error('UPDATE SERVER ERROR:', err);

    res.status(500).json({
      message: 'Failed to update ticket',
      details: err.message,
    });
  }
});

/*
=====================================================
ASSIGN TICKET
=====================================================
*/
router.put('/:id/assign', auth, async (req, res) => {
  try {

    const { assigned_to } = req.body;

    const { data: existing } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    const { data, error } = await supabase
      .from('tickets')
      .update({
        assigned_to,
        updated_at: getISTTime(),
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({
        message: 'Assignment failed',
      });
    }

    /*
    ============================================
    ASSIGNMENT NOTIFICATION
    ============================================
    */
    await supabase
      .from('notifications')
      .insert({
        user_name: assigned_to,
        title: 'Ticket Assigned',
        message: `${req.user.name} assigned "${existing.title}" to you`,
        ticket_id: existing.id,
      });

    const io = req.app.get('io');

    if (io) {
      io.emit('ticketUpdated', data);
      io.emit('notificationReceived');
    }

    res.json(data);

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Server error',
    });
  }
});

/*
=====================================================
DELETE TICKET
=====================================================
*/
router.delete('/:id', auth, async (req, res) => {
  try {

    /*
    ============================================
    ONLY ADMIN CAN DELETE
    ============================================
    */
    if (
      req.user.role !== 'Admin' &&
      req.user.role !== 'Super Admin'
    ) {
      return res.status(403).json({
        message: 'Only admin can delete tickets',
      });
    }

    const { error } = await supabase
      .from('tickets')
      .delete()
      .eq('id', req.params.id);

    if (error) {
      return res.status(500).json({
        message: 'Delete failed',
      });
    }

    res.json({
      success: true,
      message: 'Ticket deleted',
    });

  } catch (err) {
    console.error(err);

    res.status(500).json({
      message: 'Server error',
    });
  }
});

module.exports = router;