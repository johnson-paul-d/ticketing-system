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
  console.error('❌ RESEND_API_KEY missing — approval emails disabled');

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const { notifyAdmins, notifyUser } = require('../services/notificationService');

// =====================================================
// PROJECT HELPERS (tasks inside a project)
// =====================================================

const fetchProject = async (projectId) => {
  if (!projectId) return null;
  let { data, error } = await supabase
    .from('projects')
    .select('id, name, target_date, members, division')
    .eq('id', projectId)
    .single();
  // projects.division migration not run yet — retry without it
  if (error && error.code === '42703') {
    ({ data } = await supabase
      .from('projects')
      .select('id, name, target_date, members')
      .eq('id', projectId)
      .single());
  }
  return data || null;
};

// The project timeline follows its tasks: when an admin sets or approves a
// task due date beyond the project target date, the target date extends
// automatically and members are informed.
const extendProjectTimeline = async (project, newDate, actorName, io) => {
  const { data: updated } = await supabase
    .from('projects')
    .update({ target_date: newDate, updated_at: getISTTime() })
    .eq('id', project.id)
    .select()
    .single();

  const memberIds = (project.members || []).filter(Boolean);
  if (memberIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('name')
      .in('id', memberIds);
    for (const u of users || []) {
      await notifyUser(
        u.name,
        'Project Timeline Extended',
        `${actorName} extended the "${project.name}" project target date to ${newDate}`,
        null
      );
    }
  }
  if (io) {
    io.emit('projectUpdated', updated);
    io.emit('notificationReceived');
  }
};

// =====================================================
// EMAIL FUNCTIONS
// =====================================================

const sendApprovalEmail = async (to, ticketTitle, requesterName, ticketId) => {
  if (!resend) return false;
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to,
      subject: `Approval Required: ${ticketTitle}`,
      html: `
        <div style="font-family:sans-serif;">
          <h2>Approval Required</h2>
          <p>${requesterName} requested approval for:</p>
          <h3>${ticketTitle}</h3>
          <a href="${process.env.FRONTEND_URL}/tickets/${ticketId}" style="background:black;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block;">View Ticket</a>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('Email error:', err);
    return false;
  }
};

// NEW: Email for due date change requests
const sendDueDateApprovalEmail = async (
  to,
  ticketTitle,
  currentDueDate,
  requestedDueDate,
  requesterName,
  ticketId
) => {
  if (!resend) return false;
  try {
    await resend.emails.send({
      from: process.env.FROM_EMAIL,
      to,
      subject: `Due Date Change Approval Required`,
      html: `
        <div style="font-family:sans-serif;">
          <h2>Due Date Change Request</h2>
          <p><strong>Ticket:</strong> ${ticketTitle}</p>
          <p><strong>Current Due Date:</strong> ${currentDueDate || 'Not Set'}</p>
          <p><strong>Requested Due Date:</strong> ${requestedDueDate}</p>
          <p><strong>Requested By:</strong> ${requesterName}</p>
          <a href="${process.env.FRONTEND_URL}/tickets/${ticketId}" style="background:black;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block;">
            Review Request
          </a>
        </div>
      `,
    });
    return true;
  } catch (err) {
    console.error('Due date approval email error:', err);
    return false;
  }
};

// =====================================================
// GET ALL TICKETS + TIME ENTRIES
// =====================================================

router.get('/', auth, async (req, res) => {
  try {
    let query = supabase.from('tickets').select('*');

    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      query = query.eq('assigned_to', req.user.id);
    }

    const { data: tickets, error } = await query.order('due_date', { ascending: true });

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Failed to fetch tickets', error });
    }

    const { data: timeEntries, error: timeError } = await supabase.from('ticket_time_entries').select('*');
    if (timeError) console.error('Time entry fetch error:', timeError);

    const assignedIds = [...new Set(tickets.map(t => t.assigned_to).filter(Boolean))];
    let users = [];
    if (assignedIds.length > 0) {
      const { data: fetchedUsers, error: userError } = await supabase.from('users').select('id, name').in('id', assignedIds);
      if (!userError && fetchedUsers) users = fetchedUsers;
      else console.error('User fetch error:', userError);
    }

    const mappedTickets = tickets.map((ticket) => {
      const entries = (timeEntries || []).filter(entry => entry.ticket_id === ticket.id);
      const assignedUser = users?.find(u => u.id === ticket.assigned_to);
      return {
        ...ticket,
        assigned_to_name: assignedUser?.name || null,
        time_entries: entries || [],
      };
    });

    res.json(mappedTickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// GET SINGLE TICKET + TIME ENTRIES
// =====================================================

router.get('/:id', auth, async (req, res) => {
  try {
    const { data: ticket, error } = await supabase.from('tickets').select('*').eq('id', req.params.id).single();

    if (error || !ticket) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      if (ticket.assigned_to !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    const { data: timeEntries, error: timeError } = await supabase
      .from('ticket_time_entries')
      .select('*')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: false });

    if (timeError) console.error('Time entry fetch error:', timeError);

    const project = await fetchProject(ticket.project_id);

    // Older rows may have assigned_to without a stored name — resolve it
    let assignedToName = ticket.assigned_to_name;
    if (ticket.assigned_to && !assignedToName) {
      const { data: assignee } = await supabase
        .from('users')
        .select('name')
        .eq('id', ticket.assigned_to)
        .single();
      assignedToName = assignee?.name || null;
    }

    res.json({
      ...ticket,
      assigned_to_name: assignedToName,
      project_name: project?.name || null,
      project_target_date: project?.target_date || null,
      time_entries: timeEntries || [],
    });
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
    const {
      title,
      description,
      priority,
      category,
      division,
      assigned_to,
      due_date,
      allotted_minutes,
      given_by,
      project_id,
    } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description required' });
    }

    // Task inside a project: due date is capped by the project target date.
    // Admins may exceed it — the project timeline extends automatically.
    let project = null;
    let extendProjectTo = null;
    if (project_id) {
      project = await fetchProject(project_id);
      if (!project) {
        return res.status(400).json({ message: 'Project not found' });
      }
      if (due_date && project.target_date && due_date > project.target_date) {
        if (req.user.role === 'Admin' || req.user.role === 'Super Admin') {
          extendProjectTo = due_date;
        } else {
          return res.status(400).json({
            message: `Task due date cannot exceed the project target date (${project.target_date})`,
          });
        }
      }
    }

    // Resolve the assignee before insert so assigned_to_name is stored on
    // the row — the ticket page reads it directly
    let assignedUser = null;
    if (assigned_to) {
      const { data: fetchedUser } = await supabase
        .from('users')
        .select('id, name')
        .eq('id', assigned_to)
        .single();
      assignedUser = fetchedUser;
    }

    const insertData = {
      title,
      description,
      priority: priority || 'Medium',
      category: category || null,
      // Tasks inside a project inherit the project's division
      division: division || project?.division || null,
      assigned_to: assigned_to || null,
      assigned_to_name: assignedUser?.name || null,
      due_date: due_date || null,
      allotted_minutes: allotted_minutes || 0,
      status: 'Open',
      created_by: req.user.id,
      created_by_name: req.user.name,
      given_by: given_by || null,
      project_id: project_id || null,
      created_at: getISTTime(),
      updated_at: getISTTime(),
      tagged_users: [],
      timeline: [
        {
          type: 'created',
          action: 'Ticket created',
          user: req.user.name,
          created_at: getISTTime(),
        },
      ],
    };

    const { data, error } = await supabase.from('tickets').insert([insertData]).select().single();

    if (error) {
      console.error(error);
      return res.status(500).json({ message: 'Ticket creation failed', error: error.message });
    }

    if (assigned_to && assignedUser) {
      await notifyUser(
        assignedUser.name,
        'New Ticket Assigned',
        `${req.user.name} assigned a ticket to you`,
        data.id
      );
    }

    const io = req.app.get('io');

    if (extendProjectTo && project) {
      await extendProjectTimeline(project, extendProjectTo, req.user.name, io);
    }

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
// UPDATE TICKET (with full due date approval workflow)
// =====================================================

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
      division,
      comment,
      allotted_minutes,
      given_by,
      project_id,
      // Due date request fields
      requested_due_date,
      due_date_change_status,
      due_date_change_requested_by,
      due_date_change_requested_at,
    } = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ message: 'Ticket not found' });
    }

    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      if (existing.assigned_to !== req.user.id) {
        return res.status(403).json({ message: 'Access denied' });
      }
    }

    let timeline = existing.timeline || [];
    const updateData = { updated_at: getISTTime(), timeline };
    let notificationsCreated = false;

    // Project context: the ticket's project (or the one being linked) sets
    // the due-date ceiling; admin actions beyond it extend the timeline
    const projectContext = await fetchProject(
      project_id !== undefined ? project_id : existing.project_id
    );
    let extendProjectTo = null;
    if (project_id) {
      if (!projectContext) {
        return res.status(400).json({ message: 'Project not found' });
      }
      updateData.project_id = project_id;
      if (existing.project_id !== project_id) {
        timeline.push({
          type: 'project',
          action: `Added to project "${projectContext.name}"`,
          user: req.user.name,
          created_at: getISTTime(),
        });
      }
      // Linked tasks take on the project's division
      if (projectContext.division && division === undefined) {
        updateData.division = projectContext.division;
      }
      // Linking an existing ticket: its due date must respect the project
      // target date (admins extend the timeline instead)
      const effectiveDue = due_date || existing.due_date;
      if (effectiveDue && projectContext.target_date && effectiveDue > projectContext.target_date) {
        if (req.user.role === 'Admin' || req.user.role === 'Super Admin') {
          extendProjectTo = effectiveDue;
        } else {
          return res.status(400).json({
            message: `Task due date (${effectiveDue}) exceeds the project target date (${projectContext.target_date})`,
          });
        }
      }
    } else if (project_id === null) {
      updateData.project_id = null;
      if (existing.project_id) {
        timeline.push({
          type: 'project',
          action: 'Removed from project',
          user: req.user.name,
          created_at: getISTTime(),
        });
      }
    }

    // =====================================================
    // 1. DUE DATE CHANGE APPROVAL / REJECTION (Admin only)
    // =====================================================

    // Approve
    if (due_date_change_status === 'Approved' && existing.requested_due_date) {
      if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
        return res.status(403).json({ message: 'Only admin can approve due date changes' });
      }
      updateData.due_date = existing.requested_due_date;
      updateData.requested_due_date = null;
      updateData.due_date_change_status = 'Approved';
      updateData.due_date_change_requested_by = null;
      updateData.due_date_change_requested_at = null;

      // Approved date beyond the project target → timeline adjusts automatically
      if (
        projectContext?.target_date &&
        existing.requested_due_date > projectContext.target_date
      ) {
        extendProjectTo = existing.requested_due_date;
      }

      timeline.push({
        type: 'due_date_approved',
        action: `Due date changed from ${existing.due_date || 'Not set'} to ${existing.requested_due_date}`,
        user: req.user.name,
        created_at: getISTTime(),
      });

      await notifyUser(
        existing.due_date_change_requested_by,
        'Due Date Change Approved',
        `${req.user.name} approved the due date change for "${existing.title}" to ${existing.requested_due_date}`,
        existing.id
      );
      notificationsCreated = true;
    }

    // Reject
    if (due_date_change_status === 'Rejected') {
      if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
        return res.status(403).json({ message: 'Only admin can reject due date changes' });
      }
      updateData.requested_due_date = null;
      updateData.due_date_change_status = 'Rejected';
      updateData.due_date_change_requested_by = null;
      updateData.due_date_change_requested_at = null;

      timeline.push({
        type: 'due_date_rejected',
        action: 'Due date change request rejected',
        user: req.user.name,
        created_at: getISTTime(),
      });

      await notifyUser(
        existing.due_date_change_requested_by,
        'Due Date Change Rejected',
        `${req.user.name} rejected the due date change request for "${existing.title}"`,
        existing.id
      );
      notificationsCreated = true;
    }

    // Revert — non-admin cancels their own pending request
    if (due_date_change_status === 'Reverted' && existing.due_date_change_status === 'Pending') {
      updateData.requested_due_date = null;
      updateData.due_date_change_status = null;
      updateData.due_date_change_requested_by = null;
      updateData.due_date_change_requested_at = null;

      timeline.push({
        type: 'due_date_reverted',
        action: 'Due date change request cancelled by requester',
        user: req.user.name,
        created_at: getISTTime(),
      });
    }

    // =====================================================
    // 2. DIRECT DUE DATE UPDATE (Admin — no approval needed)
    // =====================================================
    if (due_date && (req.user.role === 'Admin' || req.user.role === 'Super Admin')) {
      updateData.due_date = due_date;
      timeline.push({
        type: 'due_date',
        action: `Due date updated from ${existing.due_date || 'Not set'} to ${due_date}`,
        user: req.user.name,
        created_at: getISTTime(),
      });
      if (projectContext?.target_date && due_date > projectContext.target_date) {
        extendProjectTo = due_date;
      }
    }

    // =====================================================
    // 3. NEW DUE DATE CHANGE REQUEST (non-admin users only)
    // =====================================================
    if (
      requested_due_date &&
      due_date_change_status === 'Pending' &&
      existing.due_date_change_status !== 'Pending' &&
      req.user.role !== 'Admin' &&
      req.user.role !== 'Super Admin'
    ) {
      // Approval is only needed when the ticket has a "Given By" (someone
      // commissioned it), or when the new date would extend the project
      // timeline. Otherwise the change applies immediately.
      const needsApproval =
        !!existing.given_by?.trim() ||
        !!(projectContext?.target_date && requested_due_date > projectContext.target_date);

      if (needsApproval) {
        updateData.requested_due_date = requested_due_date;
        updateData.due_date_change_status = 'Pending';
        updateData.due_date_change_requested_by = due_date_change_requested_by || req.user.name;
        updateData.due_date_change_requested_at = due_date_change_requested_at || getISTTime();

        timeline.push({
          type: 'due_date_request',
          action: `Requested due date change from ${existing.due_date || 'Not set'} to ${requested_due_date}`,
          user: req.user.name,
          created_at: getISTTime(),
        });

        await notifyAdmins(
          'Due Date Change Requested',
          `${req.user.name} requested a due date change for "${existing.title}" from ${existing.due_date || 'Not set'} to ${requested_due_date}`,
          existing.id
        );
        notificationsCreated = true;

        // Send email to admin
        if (process.env.ADMIN_EMAIL) {
          await sendDueDateApprovalEmail(
            process.env.ADMIN_EMAIL,
            existing.title,
            existing.due_date,
            requested_due_date,
            req.user.name,
            existing.id
          );
        }
      } else {
        updateData.due_date = requested_due_date;
        timeline.push({
          type: 'due_date',
          action: `Due date changed from ${existing.due_date || 'Not set'} to ${requested_due_date} (no approval needed — ticket has no Given By)`,
          user: req.user.name,
          created_at: getISTTime(),
        });
      }
    }

    // =====================================================
    // 4. VALIDATE TIME LOG BEFORE STATUS CHANGE
    // =====================================================
    const approvalTriggers = ['Completed', 'Waiting For Sources', 'Waiting For Resources', 'Closed'];
    const timeLogRequired   = ['Completed', 'Waiting For Sources', 'Waiting For Resources'];
    if (status && timeLogRequired.includes(status)) {
      const { data: timeEntries, error: timeError } = await supabase
        .from('ticket_time_entries')
        .select('id')
        .eq('ticket_id', existing.id);

      if (timeError) {
        return res.status(500).json({ message: 'Failed to validate time logs' });
      }
      if (!timeEntries || timeEntries.length === 0) {
        return res.status(400).json({ message: 'Please log time before marking ticket as completed' });
      }
    }

    // =====================================================
    // 4. HANDLE COMMENT
    // =====================================================
    if (comment) {
      timeline.push({
        type: 'comment_add',
        action: 'Comment added',
        user: req.user.name,
        comment,
        created_at: getISTTime(),
      });
    }

    // =====================================================
    // 5. OTHER UPDATE FIELDS
    // =====================================================
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (category !== undefined) updateData.category = category;
    if (division !== undefined) updateData.division = division;
    if (given_by !== undefined) {
      updateData.given_by = given_by;
      timeline.push({
        type: 'given_by',
        action: `Given By updated to ${given_by}`,
        user: req.user.name,
        created_at: getISTTime(),
      });
    }
    if (allotted_minutes !== undefined && allotted_minutes !== existing.allotted_minutes) {
      timeline.push({
        type: 'allotted_time',
        action: `Allotted time changed from ${existing.allotted_minutes || 0} mins to ${allotted_minutes} mins`,
        user: req.user.name,
        created_at: getISTTime(),
      });
      updateData.allotted_minutes = allotted_minutes;
    }

    // =====================================================
    // 6. STATUS & APPROVAL REQUEST FOR COMPLETION
    // =====================================================
    if (status && approvalTriggers.includes(status)) {
      if (req.user.role === 'Admin' || req.user.role === 'Super Admin') {
        // Admins apply the status directly — no self-approval loop
        updateData.status = status;
        updateData.approval_required = false;
        updateData.approval_status = 'Approved';
        updateData.approved_by = req.user.name;
        updateData.approved_at = getISTTime();
        timeline.push({
          type: 'status',
          action: `Status changed from ${existing.status || 'Open'} to ${status}`,
          user: req.user.name,
          created_at: getISTTime(),
        });
        if (
          existing.assigned_to_name &&
          existing.assigned_to_name !== req.user.name
        ) {
          await notifyUser(
            existing.assigned_to_name,
            `Ticket ${status}`,
            `${req.user.name} marked "${existing.title}" as ${status}`,
            existing.id
          );
          notificationsCreated = true;
        }
      } else {
        updateData.status = 'Waiting For Approval';
        updateData.approval_required = true;
        updateData.approval_status = 'Pending';
        updateData.approval_requested_by = req.user.name;
        updateData.approval_requested_status = status;
        timeline.push({
          type: 'approval',
          action: `Approval requested for ${status}`,
          user: req.user.name,
          created_at: getISTTime(),
        });
        await notifyAdmins(
          'Approval Required',
          `${req.user.name} requested approval for "${existing.title}"`,
          existing.id
        );
        notificationsCreated = true;
        if (process.env.ADMIN_EMAIL) {
          await sendApprovalEmail(process.env.ADMIN_EMAIL, existing.title, req.user.name, existing.id);
        }
      }
    } else if (status !== undefined) {
      // Plain status changes (e.g. board drag to In Progress) belong in the
      // ticket history too
      if (status !== existing.status) {
        timeline.push({
          type: 'status',
          action: `Status changed from ${existing.status || 'Open'} to ${status}`,
          user: req.user.name,
          created_at: getISTTime(),
        });
      }
      updateData.status = status;
    }

    // =====================================================
    // 7. EXECUTE UPDATE
    // =====================================================
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

    if (extendProjectTo && projectContext) {
      await extendProjectTimeline(projectContext, extendProjectTo, req.user.name, io);
    }

    if (io) {
      io.emit('ticketUpdated', data);
      if (notificationsCreated) io.emit('notificationReceived');
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

// =====================================================
// APPROVE TICKET (final approval for completion)
// =====================================================

router.put('/:id/approve', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ message: 'Only admin can approve' });
    }
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', req.params.id).single();
    let timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    timeline.push({
      type: 'approval',
      action: 'Ticket approved',
      user: req.user.name,
      created_at: getISTTime(),
    });
    const finalStatus = ticket.approval_requested_status || 'Open';
    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: finalStatus,
        approval_required: false,
        approval_status: 'Approved',
        approved_by: req.user.name,
        approved_at: getISTTime(),
        updated_at: getISTTime(),
        timeline,
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ message: 'Approval failed' });

    await notifyUser(
      ticket.approval_requested_by,
      'Ticket Approved',
      `${req.user.name} approved "${ticket.title}" as ${finalStatus}`,
      ticket.id
    );

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
// REJECT TICKET (completion request)
// =====================================================

router.put('/:id/reject', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ message: 'Only admin can reject' });
    }
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', req.params.id).single();
    let timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    timeline.push({
      type: 'approval',
      action: 'Ticket rejected',
      user: req.user.name,
      created_at: getISTTime(),
    });
    const { data, error } = await supabase
      .from('tickets')
      .update({
        status: 'Open',
        approval_required: false,
        approval_status: 'Rejected',
        rejected_by: req.user.name,
        rejected_at: getISTTime(),
        updated_at: getISTTime(),
        timeline,
      })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) return res.status(500).json({ message: 'Reject failed' });

    await notifyUser(
      ticket.approval_requested_by,
      'Ticket Rejected',
      `${req.user.name} rejected the completion request for "${ticket.title}". It has been reopened.`,
      ticket.id
    );

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
// ASSIGN TICKET
// =====================================================

router.put('/:id/assign', auth, async (req, res) => {
  try {
    const { assigned_to, assigned_to_name } = req.body;

    const { data: existing } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    const { data, error } = await supabase
      .from('tickets')
      .update({
        assigned_to,
        assigned_to_name,
        updated_at: getISTTime()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: 'Assignment failed' });
    }

    await notifyUser(
      assigned_to_name,
      'Ticket Assigned',
      `${req.user.name} assigned "${existing.title}" to you`,
      existing.id
    );

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
// DELETE TICKET
// =====================================================

router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'Admin' && req.user.role !== 'Super Admin') {
      return res.status(403).json({ message: 'Only admin can delete tickets' });
    }
    const { error } = await supabase.from('tickets').delete().eq('id', req.params.id);
    if (error) return res.status(500).json({ message: 'Delete failed' });
    res.json({ success: true, message: 'Ticket deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;