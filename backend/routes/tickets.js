const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');
const { TEAM, isAdmin, isSuperAdmin, teamFromRole, getUserTeam } = require('../utils/roles');
const { isValidInterval, addInterval, occurrenceTitle } = require('../utils/recurrence');
const { isValidCategory } = require('../utils/categories');
const { ticketTeam, ticketAudience } = require('../utils/ticketTeam');

const { sendMail } = require('../services/mailService');

const { notifyAdmins, notifyUser, insertNotifications } = require('../services/notificationService');

const { emitScoped } = require('../utils/realtime');

// Today's date in IST (date-only, for tickets.completed_date)
const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().split('T')[0];

// =====================================================
// QUERY HELPERS
// =====================================================
// Supabase REST caps a response at 1000 rows and reports no error when it
// truncates, so an unpaged .select() silently returns partial data that the
// code then treats as complete. Both helpers below page explicitly.

const PAGE = 1000;

// `build` must return a fresh query each call — a PostgREST query builder can
// only be awaited once. A stable .order() is required: without one Postgres
// gives no guaranteed row order, so pages can overlap or skip rows.
const fetchAllRows = async (build) => {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
};

// PostgREST puts .in() lists in the URL, so a few thousand ids would blow the
// request-line limit. Chunk them.
const fetchByIdChunks = async (build, ids, chunkSize = 200) => {
  const out = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const { data, error } = await build(ids.slice(i, i + chunkSize));
    if (error) throw error;
    if (data?.length) out.push(...data);
  }
  return out;
};

// =====================================================
// TEAM SCOPING
// A ticket belongs to the team of its assignee, falling back to its creator.
// Team admins (Admin - Marketing / Admin - Service) only see and act on their
// own team's tickets; Super Admins span every team; everyone else is limited
// to tickets assigned to them.
// =====================================================
// Creators keep access to what they filed. Without this a non-admin who raises
// a ticket loses it the moment it is created: the create form sends no
// assignee, so assigned_to is null, and the ticket disappears from their list
// and 403s on open, edit and delete until an admin assigns it back to them.
const canAccessTicket = async (user, ticket) => {
  if (isSuperAdmin(user)) return true;
  if (isAdmin(user)) return (await ticketTeam(ticket)) === getUserTeam(user);
  return ticket.assigned_to === user.id || ticket.created_by === user.id;
};

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

    // One insert for the whole set rather than a round trip per member.
    const rows = (users || [])
      .filter((u) => u.name)
      .map((u) => ({
        user_name: u.name,
        title: 'Project Timeline Extended',
        message: `${actorName} extended the "${project.name}" project target date to ${newDate}`,
        ticket_id: null,
      }));
    if (rows.length) await insertNotifications(rows);
  }
  if (io) {
    // A project row carries no team of its own, so reach its members and
    // owners directly and let admins see it through their team feed.
    const audience = {
      allAdmins: true,
      userIds: [...memberIds, project.created_by, project.owner],
    };
    emitScoped(io, 'projectUpdated', updated, audience);
    emitScoped(io, 'notificationReceived', undefined, audience);
  }
};

// =====================================================
// EMAIL FUNCTIONS
// =====================================================

// Ticket titles and user names are attacker-controlled and land inside an HTML
// email, so a title like `<a href="https://evil">Approve</a>` would otherwise
// render as a working link in a mail the admin trusts.
const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// FRONTEND_URL is interpolated into an href — unset, every button in every
// approval mail points at "undefined/tickets/...".
const ticketUrl = (ticketId) => {
  const base = (process.env.FRONTEND_URL || '').replace(/\/+$/, '');
  return base ? `${base}/tickets/${encodeURIComponent(ticketId)}` : null;
};

const viewButton = (ticketId, label) => {
  const url = ticketUrl(ticketId);
  if (!url) return '';
  return `<a href="${esc(url)}" style="background:black;color:white;padding:10px 16px;border-radius:8px;text-decoration:none;display:inline-block;">${esc(label)}</a>`;
};

// Mail delivery must never hold up a response: sendMail allows roughly 25s of
// SMTP timeouts before falling back to Resend.
const fireAndForgetEmail = (label, promise) => {
  Promise.resolve(promise)
    .then((ok) => {
      if (ok === false) console.error(`Email send failed (${label})`);
    })
    .catch((err) => console.error(`Email send threw (${label}):`, err));
};

const sendApprovalEmail = async (to, ticketTitle, requesterName, ticketId) => {
  const { ok } = await sendMail({
    to,
    subject: `Approval Required: ${ticketTitle}`,
    html: `
        <div style="font-family:sans-serif;">
          <h2>Approval Required</h2>
          <p>${esc(requesterName)} requested approval for:</p>
          <h3>${esc(ticketTitle)}</h3>
          ${viewButton(ticketId, 'View Ticket')}
        </div>
      `,
  });
  return ok;
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
  const { ok } = await sendMail({
    to,
    subject: `Due Date Change Approval Required`,
    html: `
        <div style="font-family:sans-serif;">
          <h2>Due Date Change Request</h2>
          <p><strong>Ticket:</strong> ${esc(ticketTitle)}</p>
          <p><strong>Current Due Date:</strong> ${esc(currentDueDate || 'Not Set')}</p>
          <p><strong>Requested Due Date:</strong> ${esc(requestedDueDate)}</p>
          <p><strong>Requested By:</strong> ${esc(requesterName)}</p>
          ${viewButton(ticketId, 'Review Request')}
        </div>
      `,
  });
  return ok;
};

// =====================================================
// GET ALL TICKETS + TIME ENTRIES
// =====================================================

router.get('/', auth, async (req, res) => {
  try {
    const admin = isAdmin(req.user);

    // Non-admins see tickets assigned to them plus the ones they raised. The
    // creator clause matters: the create form sends no assignee, so their own
    // tickets would otherwise be invisible to them.
    const buildTickets = () => {
      let q = supabase.from('tickets').select('*');
      if (!admin) {
        q = q.or(`assigned_to.eq.${req.user.id},created_by.eq.${req.user.id}`);
      }
      // Secondary key on id keeps paging stable when due_date ties or is null.
      return q.order('due_date', { ascending: true }).order('id', { ascending: true });
    };

    let tickets;
    try {
      tickets = await fetchAllRows(buildTickets);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ message: 'Failed to fetch tickets' });
    }

    // Fetch only the entries belonging to these tickets. The previous
    // unfiltered select returned the first 1000 rows in the whole table, so
    // once the log grew, newer tickets rendered as having no logged work.
    let timeEntries = [];
    try {
      timeEntries = await fetchByIdChunks(
        (chunk) => supabase.from('ticket_time_entries').select('*').in('ticket_id', chunk),
        tickets.map((t) => t.id)
      );
    } catch (timeError) {
      console.error('Time entry fetch error:', timeError);
    }

    // Resolve assignee + creator: name/active for display, role for team scoping
    const userIds = [
      ...new Set(
        [...tickets.map((t) => t.assigned_to), ...tickets.map((t) => t.created_by)].filter(Boolean)
      ),
    ];
    let users = [];
    if (userIds.length > 0) {
      const { data: fetchedUsers, error: userError } = await supabase
        .from('users')
        .select('id, name, active, role')
        .in('id', userIds);
      if (!userError && fetchedUsers) users = fetchedUsers;
      else console.error('User fetch error:', userError);
    }
    const roleOf = (id) => users.find((u) => u.id === id)?.role;
    const teamOfTicket = (t) =>
      teamFromRole(roleOf(t.assigned_to)) || teamFromRole(roleOf(t.created_by)) || TEAM.MARKETING;

    let mappedTickets = tickets.map((ticket) => {
      const entries = (timeEntries || []).filter(entry => entry.ticket_id === ticket.id);
      const assignedUser = users?.find(u => u.id === ticket.assigned_to);
      return {
        ...ticket,
        assigned_to_name: assignedUser?.name || ticket.assigned_to_name || null,
        // Reports and dashboards hide work owned by disabled people.
        // Unassigned tickets stay visible (nobody is disabled).
        assigned_to_active: ticket.assigned_to ? assignedUser?.active !== false : true,
        team: teamOfTicket(ticket),
        time_entries: entries || [],
      };
    });

    // Team admins only see their own team's tickets (Super Admin sees all)
    if (admin && !isSuperAdmin(req.user)) {
      const myTeam = getUserTeam(req.user);
      mappedTickets = mappedTickets.filter((t) => t.team === myTeam);
    }

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

    if (!(await canAccessTicket(req.user, ticket))) {
      return res.status(403).json({ message: 'Access denied' });
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
      // Drives the team-specific category list on the ticket page.
      team: await ticketTeam(ticket),
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
      is_recurring,
      recurrence_interval,
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
        if (isAdmin(req.user)) {
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
        .select('id, name, role')
        .eq('id', assigned_to)
        .single();
      assignedUser = fetchedUser;
    }

    // A new ticket belongs to its assignee's team, falling back to the
    // creator's — the same rule ticketTeam applies to existing rows.
    const newTicketTeam =
      teamFromRole(assignedUser?.role) || getUserTeam(req.user) || TEAM.MARKETING;

    if (!isValidCategory(newTicketTeam, category)) {
      return res.status(400).json({
        message: `"${category}" is not a valid category for the ${newTicketTeam} team`,
      });
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

    // Recurring task: this row becomes the first occurrence and the active
    // spawner. The name gets a period suffix, the due date is one interval
    // ahead, and the backend scheduler generates each subsequent occurrence.
    if (is_recurring && isValidInterval(recurrence_interval)) {
      const today = todayIST();
      insertData.title = occurrenceTitle(title, today, recurrence_interval);
      insertData.due_date = addInterval(today, recurrence_interval);
      insertData.is_recurring = true;
      insertData.recurrence_interval = recurrence_interval;
      insertData.recurrence_base_title = title;
      insertData.recurrence_next = addInterval(today, recurrence_interval);
    }

    const { data, error } = await supabase.from('tickets').insert([insertData]).select().single();

    if (error) {
      console.error(error);
      if (insertData.is_recurring && ['42703', 'PGRST204'].includes(error.code)) {
        return res.status(503).json({
          message: 'Recurring tasks are not set up yet. Run backend/database/recurring-tasks-migration.sql in Supabase.',
          code: 'RECURRENCE_MIGRATION_REQUIRED',
        });
      }
      console.error('Ticket creation failed:', error);
      return res.status(500).json({ message: 'Ticket creation failed' });
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
      const audience = await ticketAudience(data);
      emitScoped(io, 'ticketCreated', data, audience);
      emitScoped(io, 'notificationReceived', undefined, audience);
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

    if (!(await canAccessTicket(req.user, existing))) {
      return res.status(403).json({ message: 'Access denied' });
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
        if (isAdmin(req.user)) {
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
      if (!isAdmin(req.user)) {
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
      if (!isAdmin(req.user)) {
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
    if (due_date && isAdmin(req.user)) {
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
      !isAdmin(req.user)
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
          existing.id,
          getUserTeam(req.user)
        );
        notificationsCreated = true;

        // Not awaited: sendMail allows ~25s of SMTP timeouts before falling
        // back to Resend, and the user is waiting on this response.
        if (process.env.ADMIN_EMAIL) {
          fireAndForgetEmail(
            'due date approval',
            sendDueDateApprovalEmail(
              process.env.ADMIN_EMAIL,
              existing.title,
              existing.due_date,
              requested_due_date,
              req.user.name,
              existing.id
            )
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
    // Only two fields are genuinely privileged. allotted_minutes is the time
    // budget SLA reporting is measured against, so an assignee who could raise
    // it would grade their own homework. given_by decides whether a due-date
    // change needs approval at all (see needsApproval below), so clearing it
    // removes the approval step entirely.
    //
    // Everything else here stays open to anyone who can already reach the
    // ticket. description in particular must remain writable: closing a ticket
    // appends the closure reason to it (TicketDetails.jsx closeTicket), and
    // that flow is deliberately available to non-admins. category is guarded
    // separately, by team, rather than by role.
    const privilegedFields = { given_by, allotted_minutes };
    const attemptedPrivilegedEdit = Object.entries(privilegedFields).some(
      ([field, value]) => value !== undefined && value !== existing[field]
    );

    if (attemptedPrivilegedEdit && !isAdmin(req.user)) {
      return res.status(403).json({
        message: 'Only an admin can change Given By or the allotted time',
      });
    }

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (division !== undefined) updateData.division = division;

    if (category !== undefined && category !== existing.category) {
      if (!isValidCategory(await ticketTeam(existing), category)) {
        return res.status(400).json({
          message: `"${category}" is not a valid category for this ticket's team`,
        });
      }
      updateData.category = category;
    }

    if (isAdmin(req.user)) {
      if (given_by !== undefined && given_by !== existing.given_by) {
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
    }

    // =====================================================
    // 6. STATUS & APPROVAL REQUEST FOR COMPLETION
    // =====================================================
    if (status && approvalTriggers.includes(status)) {
      if (isAdmin(req.user)) {
        // Admins apply the status directly — no self-approval loop
        updateData.status = status;
        updateData.approval_required = false;
        updateData.approval_status = 'Approved';
        updateData.approved_by = req.user.name;
        updateData.approved_at = getISTTime();
        if (status === 'Completed') updateData.completed_date = todayIST();
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
          existing.id,
          getUserTeam(req.user)
        );
        notificationsCreated = true;
        if (process.env.ADMIN_EMAIL) {
          fireAndForgetEmail(
            'completion approval',
            sendApprovalEmail(process.env.ADMIN_EMAIL, existing.title, req.user.name, existing.id)
          );
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
        // Reopening a completed ticket clears its completion date
        if (existing.status === 'Completed' && existing.completed_date) {
          updateData.completed_date = null;
        }
      }
      updateData.status = status;
    }

    // =====================================================
    // 7. EXECUTE UPDATE
    // =====================================================
    let { data, error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    // completed_date migration not run yet — retry without it
    if (error && error.code === 'PGRST204' && 'completed_date' in updateData) {
      const { completed_date: _skip, ...withoutNew } = updateData;
      ({ data, error } = await supabase
        .from('tickets')
        .update(withoutNew)
        .eq('id', id)
        .select()
        .single());
    }

    if (error) {
      console.error(error);
      console.error('Ticket update failed:', error);
      return res.status(500).json({ message: 'Update failed' });
    }

    const io = req.app.get('io');

    if (extendProjectTo && projectContext) {
      await extendProjectTimeline(projectContext, extendProjectTo, req.user.name, io);
    }

    if (io) {
      const audience = await ticketAudience(data);
      emitScoped(io, 'ticketUpdated', data, audience);
      if (notificationsCreated) emitScoped(io, 'notificationReceived', undefined, audience);
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
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admin can approve' });
    }
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (!(await canAccessTicket(req.user, ticket))) {
      return res.status(403).json({ message: 'Access denied' });
    }
    let timeline = Array.isArray(ticket.timeline) ? ticket.timeline : [];
    timeline.push({
      type: 'approval',
      action: 'Ticket approved',
      user: req.user.name,
      created_at: getISTTime(),
    });
    const finalStatus = ticket.approval_requested_status || 'Open';
    const approveData = {
      status: finalStatus,
      approval_required: false,
      approval_status: 'Approved',
      approved_by: req.user.name,
      approved_at: getISTTime(),
      updated_at: getISTTime(),
      timeline,
    };
    if (finalStatus === 'Completed') approveData.completed_date = todayIST();

    let { data, error } = await supabase
      .from('tickets')
      .update(approveData)
      .eq('id', req.params.id)
      .select()
      .single();
    // completed_date migration not run yet — retry without it
    if (error && error.code === 'PGRST204' && 'completed_date' in approveData) {
      const { completed_date: _skip, ...withoutNew } = approveData;
      ({ data, error } = await supabase
        .from('tickets')
        .update(withoutNew)
        .eq('id', req.params.id)
        .select()
        .single());
    }
    if (error) return res.status(500).json({ message: 'Approval failed' });

    await notifyUser(
      ticket.approval_requested_by,
      'Ticket Approved',
      `${req.user.name} approved "${ticket.title}" as ${finalStatus}`,
      ticket.id
    );

    const io = req.app.get('io');
    if (io) {
      const audience = await ticketAudience(data);
      emitScoped(io, 'ticketUpdated', data, audience);
      emitScoped(io, 'notificationReceived', undefined, audience);
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
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admin can reject' });
    }
    const { data: ticket } = await supabase.from('tickets').select('*').eq('id', req.params.id).single();
    if (!ticket) return res.status(404).json({ message: 'Ticket not found' });
    if (!(await canAccessTicket(req.user, ticket))) {
      return res.status(403).json({ message: 'Access denied' });
    }
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
      const audience = await ticketAudience(data);
      emitScoped(io, 'ticketUpdated', data, audience);
      emitScoped(io, 'notificationReceived', undefined, audience);
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
    const { assigned_to } = req.body;

    const { data: existing } = await supabase
      .from('tickets')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (!existing) return res.status(404).json({ message: 'Ticket not found' });
    // Assigning is an admin action, and team admins stay within their team
    if (!isAdmin(req.user) || !(await canAccessTicket(req.user, existing))) {
      return res.status(403).json({ message: 'Only admin can assign tickets' });
    }

    // Resolve the assignee server-side. The client used to supply both the id
    // and the display name: a mismatched pair left the ticket showing the wrong
    // owner permanently, and an unknown id orphaned it — assigned_to pointing
    // nowhere makes ticketTeam fall back to Marketing regardless of the truth.
    let assignee = null;
    if (assigned_to) {
      const { data: found } = await supabase
        .from('users')
        .select('id, name, role, active')
        .eq('id', assigned_to)
        .single();

      if (!found) return res.status(400).json({ message: 'Assignee not found' });
      if (!found.active) return res.status(400).json({ message: 'Cannot assign to a disabled user' });

      // A team admin must not hand work to the other team, which would move the
      // ticket out of their own scope and out of their team's reporting.
      if (!isSuperAdmin(req.user) && teamFromRole(found.role) !== getUserTeam(req.user)) {
        return res.status(403).json({ message: 'Cannot assign to a user on another team' });
      }

      assignee = found;
    }

    const { data, error } = await supabase
      .from('tickets')
      .update({
        assigned_to: assignee?.id || null,
        assigned_to_name: assignee?.name || null,
        updated_at: getISTTime()
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) {
      return res.status(500).json({ message: 'Assignment failed' });
    }

    if (assignee) {
      await notifyUser(
        assignee.name,
        'Ticket Assigned',
        `${req.user.name} assigned "${existing.title}" to you`,
        existing.id
      );
    }

    const io = req.app.get('io');

    if (io) {
      // Include the previous assignee so their board drops the ticket too.
      const audience = await ticketAudience(data);
      audience.userIds.push(existing.assigned_to);
      emitScoped(io, 'ticketUpdated', data, audience);
      emitScoped(io, 'notificationReceived', undefined, audience);
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
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admin can delete tickets' });
    }
    const { data: existing } = await supabase.from('tickets').select('*').eq('id', req.params.id).single();
    if (!existing) return res.status(404).json({ message: 'Ticket not found' });
    if (!(await canAccessTicket(req.user, existing))) {
      return res.status(403).json({ message: 'Access denied' });
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