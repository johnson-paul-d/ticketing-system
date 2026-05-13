const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

// Helper to send email via Resend
const sendApprovalEmail = async (to, ticketTitle, requesterName, ticketId) => {
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to: to,
      subject: `Approval Required: ${ticketTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2>Ticket Approval Required</h2>
          <p><strong>${requesterName}</strong> has requested approval for ticket:</p>
          <p><strong>${ticketTitle}</strong></p>
          <p>Please review and take action.</p>
          <a href="${process.env.FRONTEND_URL}/tickets/${ticketId}" style="background: #000; color: #fff; padding: 8px 16px; text-decoration: none; border-radius: 6px;">View Ticket</a>
        </div>
      `,
    });
    console.log('Approval email sent to', to);
  } catch (err) {
    console.error('Resend error:', err);
  }
};

// [Keep all other routes: GET, POST, GET/:id, PUT/:id/approve, PUT/:id/assign, DELETE]
// Only the PUT /:id (update) needs modification to send email.

// UPDATE ticket (partial) – with Resend email on approval request
router.put('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, priority, status, category, due_date, comment } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchError) throw fetchError;

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
    const io = req.app.get('io');
    io.emit('notificationReceived');

    let timeline = existing.timeline || [];
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
      updated_at: new Date(),
      timeline,
      tagged_users: [...new Set([...(existing.tagged_users || []), ...taggedUsers])],
    };

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;
    if (due_date !== undefined && due_date !== '') {
      updateData.due_date = new Date(due_date).toISOString().split('T')[0];
    }

    if (due_date && due_date !== existing.due_date) {
      timeline.push({
        type: 'due_date',
        action: `Due date changed to ${due_date}`,
        user: req.user.name,
        comment: comment || '',
        mentions,
        created_at: getISTTime(),
      });
      // optional: send email for due date change if needed
    }

    // Approval flow with email
    if (status === 'Completed' || status === 'Waiting For Sources') {
      updateData.status = 'Pending Approval';
      updateData.approval_required = true;
      updateData.approval_status = 'Pending';
      updateData.approval_requested_by = req.user.name;
      updateData.approval_requested_status = status;

      timeline.push({
        type: 'approval',
        action: `Approval requested for ${status}`,
        user: req.user.name,
        comment: comment || '',
        mentions,
        created_at: getISTTime(),
      });

      // Insert notification for Admin
      await supabase.from('notifications').insert({
        user_name: 'Admin',
        title: 'Approval Required',
        message: `${req.user.name} requested approval for "${existing.title}"`,
        ticket_id: existing.id,
      });

      // Send email to Admin using Resend
      const adminEmail = process.env.ADMIN_EMAIL;
      if (adminEmail) {
        await sendApprovalEmail(adminEmail, existing.title, req.user.name, existing.id);
      }

      io.emit('notificationReceived');
    } else if (status !== undefined) {
      updateData.status = status;
    }

    const { data, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Update error:', error);
      return res.status(500).json({ message: 'Database update failed', error });
    }

    io.emit('ticketUpdated', data);
    res.json(data);
  } catch (err) {
    console.error('UPDATE ERROR:', err);
    res.status(500).json({ message: 'Failed to update ticket', details: err.message });
  }
});

// Make sure to export all other routes (GET, POST, etc.) – they remain unchanged.
// (The rest of your tickets.js file, including GET, POST, etc., stays as is)
module.exports = router;