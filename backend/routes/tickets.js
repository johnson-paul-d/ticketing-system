const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const sendMail = require('../services/mailService');
const getISTTime = require('../utils/time');

// GET all tickets (with role‑based filtering)
router.get('/', auth, async (req, res) => {
  try {
    let query = supabase
      .from('tickets')
      .select('*')
      .eq('deleted', false)
      .order('created_at', { ascending: false });

    if (req.user.role === 'Team Member') {
      query = query.or(`assigned_to_name.eq.${req.user.name}, tagged_users.cs.["${req.user.name}"]`);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('GET TICKETS ERROR:', err);
    res.status(500).json({ message: 'Failed to fetch tickets' });
  }
});

// GET single ticket
router.get('/:id', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('GET SINGLE TICKET ERROR:', err);
    res.status(500).json({ message: 'Failed to fetch ticket' });
  }
});

// CREATE ticket
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, category, priority, division, due_date } = req.body;
    const timeline = [{
      type: 'system',
      action: 'Ticket created',
      user: req.user.name,
      comment: '',
      mentions: [],
      created_at: getISTTime(),
    }];

    const { data, error } = await supabase
      .from('tickets')
      .insert([{
        title,
        description,
        category,
        priority,
        division,
        due_date: due_date || null,
        status: 'Open',
        approval_required: false,
        approval_status: 'Approved',
        tagged_users: [],
        timeline,
        created_by: req.user.id,
        created_by_name: req.user.name,
        deleted: false,
      }])
      .select();

    if (error) throw error;
    const io = req.app.get('io');
    io.emit('ticketCreated', data[0]);
    res.status(201).json(data[0]);
  } catch (err) {
    console.error('CREATE TICKET ERROR:', err);
    res.status(500).json({ message: 'Failed to create ticket' });
  }
});

// UPDATE ticket (partial)
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
    if (fetchError) throw fetchError;

    // Extract mentions
    const mentions = comment?.match(/@\w+/g) || [];
    const taggedUsers = mentions.map(m => m.replace('@', ''));

    // Create mention notifications
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

    // Build timeline
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

    // Prepare update object
    const updateData = {
      updated_at: new Date(),
      timeline,
      tagged_users: [...new Set([...(existing.tagged_users || []), ...taggedUsers])],
    };

    // Simple field updates
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;
    if (due_date !== undefined && due_date !== '') {
      updateData.due_date = new Date(due_date).toISOString().split('T')[0];
    }

    // Due date change entry
    if (due_date && due_date !== existing.due_date) {
      timeline.push({
        type: 'due_date',
        action: `Due date changed to ${due_date}`,
        user: req.user.name,
        comment: comment || '',
        mentions,
        created_at: getISTTime(),
      });
      try {
        await sendMail({
          to: process.env.ADMIN_EMAIL,
          subject: 'Ticket Due Date Updated',
          text: `Ticket: ${existing.title}\nUpdated By: ${req.user.name}\nNew Due Date: ${due_date}\nComment: ${comment || 'No comment'}`,
        });
      } catch (mailErr) { console.error('MAIL ERROR:', mailErr); }
    }

    // Status change with approval flow
    if (status === 'Completed' || status === 'Waiting For Sources') {
      updateData.status = 'Pending Approval';
      updateData.approval_required = true;
      updateData.approval_status = 'Pending';
      updateData.approval_requested_by = req.user.name;
      updateData.approval_requested_status = status; // requires the column

      timeline.push({
        type: 'approval',
        action: `Approval requested for ${status}`,
        user: req.user.name,
        comment: comment || '',
        mentions,
        created_at: getISTTime(),
      });

      await supabase.from('notifications').insert({
        user_name: 'Admin',
        title: 'Approval Required',
        message: `${req.user.name} requested approval for "${existing.title}"`,
        ticket_id: existing.id,
      });
      io.emit('notificationReceived');
    } else if (status !== undefined) {
      updateData.status = status;
    }

    // Execute update
    const { data, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('SUPABASE UPDATE ERROR:', error);
      return res.status(500).json({ message: 'Database update failed', error });
    }

    io.emit('ticketUpdated', data);
    res.json(data);
  } catch (err) {
    console.error('UPDATE ERROR:', err);
    res.status(500).json({ message: 'Failed to update ticket', details: err.message });
  }
});

// APPROVE / REJECT
router.put('/:id/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Only admin can approve' });
    }
    const { approval_status } = req.body;
    const { data: existing } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    const timeline = existing.timeline || [];
    timeline.push({
      type: 'approval',
      action: `Approval ${approval_status}`,
      user: req.user.name,
      comment: '',
      mentions: [],
      created_at: getISTTime(),
    });

    let newStatus = existing.status;
    if (approval_status === 'Approved') {
      newStatus = existing.approval_requested_status || 'Completed';
    } else if (approval_status === 'Rejected') {
      newStatus = 'In Progress';
    }

    const updateData = {
      status: newStatus,
      approval_status,
      approved_by: req.user.name,
      timeline,
      approval_required: false,
      approval_requested_status: null,
    };

    const { data, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('notifications').insert({
      user_name: existing.approval_requested_by,
      title: `Ticket ${approval_status}`,
      message: `${req.user.name} ${approval_status.toLowerCase()} your ticket "${existing.title}"`,
      ticket_id: existing.id,
    });
    req.app.get('io').emit('notificationReceived');
    res.json(data);
  } catch (err) {
    console.error('APPROVAL ERROR:', err);
    res.status(500).json({ message: 'Approval failed' });
  }
});

// ASSIGN ticket
router.put('/:id/assign', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_to, assigned_to_name } = req.body;
    const { data: existing } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', id)
      .single();

    const timeline = existing.timeline || [];
    timeline.push({
      type: 'assignment',
      action: `Assigned to ${assigned_to_name}`,
      user: req.user.name,
      comment: '',
      mentions: [],
      created_at: getISTTime(),
    });

    const { data, error } = await supabase
      .from('tickets')
      .update({
        assigned_to,
        assigned_to_name,
        timeline,
        updated_at: new Date(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    req.app.get('io').emit('ticketUpdated', data);
    res.json(data);
  } catch (err) {
    console.error('ASSIGN ERROR:', err);
    res.status(500).json({ message: 'Assignment failed' });
  }
});

// DELETE (soft delete)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ message: 'Access denied' });
    }
    const { error } = await supabase
      .from('tickets')
      .update({ deleted: true, updated_at: new Date() })
      .eq('id', req.params.id);
    if (error) throw error;
    req.app.get('io').emit('ticketDeleted', req.params.id);
    res.json({ message: 'Ticket deleted' });
  } catch (err) {
    console.error('DELETE ERROR:', err);
    res.status(500).json({ message: 'Delete failed' });
  }
});

module.exports = router;