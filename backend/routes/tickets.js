const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');

const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// =====================================================
// HELPER – SEND APPROVAL EMAIL
// =====================================================
const sendApprovalEmail = async (to, ticketTitle, requesterName, ticketId) => {
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to,
      subject: `Approval Required: ${ticketTitle}`,
      html: `
        <div style="font-family:sans-serif;max-width:600px;">
          <h2>Ticket Approval Required</h2>
          <p><strong>${requesterName}</strong> requested approval for:</p>
          <p><strong>${ticketTitle}</strong></p>
          <a href="${process.env.FRONTEND_URL}/tickets/${ticketId}"
             style="background:#000;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;margin-top:10px;">
            View Ticket
          </a>
        </div>
      `,
    });
    console.log(`✅ Approval email sent to ${to}`);
  } catch (err) {
    console.error('❌ EMAIL ERROR:', err);
    // Don't throw – email failure shouldn't break the update, but log it
  }
};

// =====================================================
// GET ALL TICKETS (filtered by role)
// =====================================================
router.get('/', auth, async (req, res) => {
  try {
    let query = supabase.from('tickets').select('*');

    // Non‑admins see only their assigned tickets
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      query = query.eq('assigned_to', req.user.id);
    }

    const { data, error } = await query.order('due_date', { ascending: true });

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Failed to fetch tickets', error });
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// GET SINGLE TICKET (with access control)
// =====================================================
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Non‑admins can only view their own tickets
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      if (data.assigned_to !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// CREATE TICKET
// =====================================================
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, priority, category, assigned_to, due_date } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description required' });
    }

    const insertData = {
      title,
      description,
      priority: priority || 'Medium',
      category: category || null,
      assigned_to: assigned_to || null,
      due_date: due_date || null,
      status: 'Open',
      created_by: req.user.name,
      created_at: getISTTime(),
      updated_at: getISTTime(),
      tagged_users: [],
      timeline: [{
        type: 'created',
        action: 'Ticket created',
        user: req.user.name,
        created_at: getISTTime(),
      }],
    };

    const { data, error } = await supabase
      .from('tickets')
      .insert([insertData])
      .select()
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Ticket creation failed', error: error.message });
    }

    // Notify assignee if any
    if (assigned_to) {
      await supabase.from('notifications').insert({
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
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// UPDATE TICKET (includes approval flow)
// =====================================================
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, category, due_date, comment } = req.body;

    // Fetch existing ticket
    const { data: existing, error: fetchError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    // Access control: non‑admins can only update their own tickets
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      if (existing.assigned_to !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    // Handle mentions
    const mentions = comment?.match(/@\w+/g) || [];
    const taggedUsers = mentions.map(m => m.replace('@', ''));

    for (const username of taggedUsers) {
      await supabase.from('notifications').insert({
        user_name: username,
        title: 'You were tagged',
        message: `${req.user.name} tagged you in "${existing.title}"`,
        ticket_id: existing.id,
      });
    }

    // Prepare timeline
    let timeline = Array.isArray(existing.timeline) ? existing.timeline : [];
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

    const updateData = {
      updated_at: new Date().toISOString(),
      timeline,
      tagged_users: Array.from(new Set([...(existing.tagged_users || []), ...taggedUsers])),
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;

    // Due date change
    if (due_date !== undefined && due_date !== '') {
      updateData.due_date = new Date(due_date).toISOString().split('T')[0];
      timeline.push({
        type: 'due_date',
        action: `Due date changed to ${due_date}`,
        user: req.user.name,
        created_at: getISTTime(),
      });
    }

    // =====================================================
    // APPROVAL FLOW – FIXED
    // =====================================================
    // Accept both 'Waiting For Resources' and 'Waiting For Sources'
    const approvalStatuses = ['Completed', 'Waiting For Resources', 'Waiting For Sources'];
    if (status && approvalStatuses.includes(status)) {
      updateData.status = 'Waiting For Approval';
      updateData.approval_required = true;
      updateData.approval_status = 'Pending';
      updateData.approval_requested_by = req.user.name;
      updateData.approval_requested_status = status; // store original requested status

      timeline.push({
        type: 'approval',
        action: `Approval requested for ${status}`,
        user: req.user.name,
        comment: comment || '',
        mentions,
        created_at: getISTTime(),
      });

      // Notify admin (by username 'Admin')
      await supabase.from('notifications').insert({
        user_name: 'Admin',
        title: 'Approval Required',
        message: `${req.user.name} requested approval for "${existing.title}"`,
        ticket_id: existing.id,
      });

      // Send email to admin
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendApprovalEmail(adminEmail, existing.title, req.user.name, existing.id);
      } else {
        console.warn('⚠️ ADMIN_EMAIL not set – email not sent');
      }

      const io = req.app.get('io');
      if (io) io.emit('notificationReceived');
    } else if (status !== undefined) {
      // Normal status update (no approval)
      updateData.status = status;
    }

    // Perform update
    const { data, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Update failed', error: error.message });
    }

    const io = req.app.get('io');
    if (io) io.emit('ticketUpdated', data);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// APPROVE TICKET (admin only)
// =====================================================
router.put('/:id/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ message: 'Only admin can approve' });
    }

    const { data: ticket, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    let timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    timeline.push({
      type: 'approval',
      action: 'Ticket approved',
      user: req.user.name,
      created_at: getISTTime(),
    });

    const finalStatus = ticket.approval_requested_status || 'Open';
    const { data, error: updateError } = await supabase
      .from('tickets')
      .update({
        status: finalStatus,
        approval_required: false,
        approval_status: 'Approved',
        approved_by: req.user.name,
        approved_at: getISTTime(),
        timeline,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ message: 'Approval failed' });
    }

    const io = req.app.get('io');
    if (io) io.emit('ticketUpdated', data);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// REJECT TICKET (admin only)
// =====================================================
router.put('/:id/reject', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ message: 'Only admin can reject' });
    }

    const { data: ticket, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    let timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    timeline.push({
      type: 'approval',
      action: 'Ticket rejected',
      user: req.user.name,
      created_at: getISTTime(),
    });

    const { data, error: updateError } = await supabase
      .from('tickets')
      .update({
        status: 'Open',
        approval_required: false,
        approval_status: 'Rejected',
        rejected_by: req.user.name,
        rejected_at: getISTTime(),
        timeline,
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (updateError) {
      return res.status(500).json({ message: 'Reject failed' });
    }

    const io = req.app.get('io');
    if (io) io.emit('ticketUpdated', data);

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// ASSIGN TICKET
// =====================================================
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
      .update({ assigned_to, updated_at: getISTTime() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: 'Assignment failed' });
    }

    await supabase.from('notifications').insert({
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
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// DELETE TICKET (admin only)
// =====================================================
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ message: 'Only admin can delete tickets' });
    }

    const { error } = await supabase.from('tickets').delete().eq('id', req.params.id);

    if (error) {
      return res.status(500).json({ message: 'Delete failed' });
    }

    res.json({ success: true, message: 'Ticket deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;