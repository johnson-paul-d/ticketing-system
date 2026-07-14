const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');
const { notifyUser } = require('../services/notificationService');

const isAdmin = (user) =>
  user.role === 'Admin' || user.role === 'Super Admin';

// Migration not run yet → tell the client clearly instead of a generic 500
const isMissingSchema = (error) =>
  error && ['PGRST205', '42P01', '42703'].includes(error.code);

const migrationResponse = (res) =>
  res.status(503).json({
    message:
      'Projects are not set up yet. Run backend/database/projects-migration.sql in Supabase.',
    code: 'PROJECTS_MIGRATION_REQUIRED',
  });

const DONE_STATUSES = ['Completed', 'Closed'];

const taskStats = (tasks, targetDate) => {
  const today = new Date().toISOString().split('T')[0];
  const total = tasks.length;
  const done = tasks.filter((t) => DONE_STATUSES.includes(t.status)).length;
  const overdue = tasks.filter(
    (t) => !DONE_STATUSES.includes(t.status) && t.due_date && t.due_date < today
  ).length;
  return {
    total,
    done,
    overdue,
    progress: total ? Math.round((done / total) * 100) : 0,
    max_task_due: tasks.reduce(
      (max, t) => (t.due_date && t.due_date > max ? t.due_date : max),
      ''
    ) || null,
  };
};

const notifyMembers = async (memberIds, excludeUserId, title, message) => {
  if (!memberIds?.length) return;
  const ids = memberIds.filter((id) => id && id !== excludeUserId);
  if (!ids.length) return;
  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .in('id', ids);
  for (const u of users || []) {
    await notifyUser(u.name, title, message, null);
  }
};

// =====================================================
// GET ACTIVE USERS (for member/assignee pickers — any logged-in user)
// =====================================================
router.get('/meta/members', auth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, name, role, division')
      .eq('active', true)
      .order('name');
    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch members' });
  }
});

// =====================================================
// LIST PROJECTS (+ per-project task stats)
// =====================================================
router.get('/', auth, async (req, res) => {
  try {
    const { data: projects, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }

    const { data: projectTickets } = await supabase
      .from('tickets')
      .select('id, project_id, status, due_date, assigned_to')
      .not('project_id', 'is', null);

    const enriched = (projects || []).map((p) => {
      const tasks = (projectTickets || []).filter((t) => t.project_id === p.id);
      return { ...p, stats: taskStats(tasks, p.target_date) };
    });

    // Non-admins only see projects they belong to or have a task in
    const visible = isAdmin(req.user)
      ? enriched
      : enriched.filter(
          (p) =>
            (p.members || []).includes(req.user.id) ||
            p.created_by === req.user.id ||
            (projectTickets || []).some(
              (t) => t.project_id === p.id && t.assigned_to === req.user.id
            )
        );

    res.json(visible);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch projects' });
  }
});

// =====================================================
// CREATE PROJECT (Admin + User roles, like ticket creation)
// =====================================================
router.post('/', auth, async (req, res) => {
  try {
    if (req.user.role === 'Team Member') {
      return res.status(403).json({ message: 'Team members cannot create projects' });
    }
    const { name, description, target_date, members, color } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Project name is required' });
    }

    const { data, error } = await supabase
      .from('projects')
      .insert([
        {
          name: name.trim(),
          description: description || null,
          status: 'Active',
          target_date: target_date || null,
          color: color || null,
          members: Array.isArray(members) ? members : [],
          created_by: req.user.id,
          created_by_name: req.user.name,
          created_at: getISTTime(),
          updated_at: getISTTime(),
        },
      ])
      .select()
      .single();
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }

    await notifyMembers(
      data.members,
      req.user.id,
      'Added to Project',
      `${req.user.name} added you to the project "${data.name}"`
    );

    const io = req.app.get('io');
    if (io) {
      io.emit('projectCreated', data);
      io.emit('notificationReceived');
    }
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to create project' });
  }
});

// =====================================================
// GET SINGLE PROJECT (+ tasks + member details)
// =====================================================
router.get('/:id', auth, async (req, res) => {
  try {
    const { data: project, error } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !project) {
      if (isMissingSchema(error)) return migrationResponse(res);
      return res.status(404).json({ message: 'Project not found' });
    }

    const { data: tasks } = await supabase
      .from('tickets')
      .select('*')
      .eq('project_id', project.id)
      .order('created_at', { ascending: true });

    // Access: admin, member, creator, or assignee of any task
    const hasAccess =
      isAdmin(req.user) ||
      (project.members || []).includes(req.user.id) ||
      project.created_by === req.user.id ||
      (tasks || []).some((t) => t.assigned_to === req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Resolve names for members + task assignees in one query
    const userIds = [
      ...new Set(
        [...(project.members || []), ...(tasks || []).map((t) => t.assigned_to)].filter(Boolean)
      ),
    ];
    let users = [];
    if (userIds.length) {
      const { data: fetched } = await supabase
        .from('users')
        .select('id, name, role, division')
        .in('id', userIds);
      users = fetched || [];
    }

    const tasksWithNames = (tasks || []).map((t) => ({
      ...t,
      assigned_to_name:
        t.assigned_to_name || users.find((u) => u.id === t.assigned_to)?.name || null,
    }));

    res.json({
      ...project,
      stats: taskStats(tasksWithNames, project.target_date),
      tasks: tasksWithNames,
      member_details: (project.members || [])
        .map((id) => users.find((u) => u.id === id))
        .filter(Boolean),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to fetch project' });
  }
});

// =====================================================
// UPDATE PROJECT (admin or creator)
// =====================================================
router.put('/:id', auth, async (req, res) => {
  try {
    const { data: existing, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchError || !existing) {
      if (isMissingSchema(fetchError)) return migrationResponse(res);
      return res.status(404).json({ message: 'Project not found' });
    }
    if (!isAdmin(req.user) && existing.created_by !== req.user.id) {
      return res.status(403).json({ message: 'Only admin or the project creator can edit' });
    }

    const { name, description, status, target_date, members, color } = req.body;
    const updateData = { updated_at: getISTTime() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (color !== undefined) updateData.color = color;
    if (members !== undefined) updateData.members = members;

    // Target date cannot shrink below the latest task due date —
    // the project timeline depends on its tasks
    if (target_date !== undefined) {
      if (target_date) {
        const { data: tasks } = await supabase
          .from('tickets')
          .select('due_date, status')
          .eq('project_id', existing.id);
        const maxDue = (tasks || []).reduce(
          (max, t) => (t.due_date && t.due_date > max ? t.due_date : max),
          ''
        );
        if (maxDue && target_date < maxDue) {
          return res.status(400).json({
            message: `Target date cannot be earlier than the latest task due date (${maxDue})`,
          });
        }
      }
      updateData.target_date = target_date;
    }

    const { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;

    // Notify newly added members
    if (members !== undefined) {
      const added = (members || []).filter(
        (id) => !(existing.members || []).includes(id)
      );
      await notifyMembers(
        added,
        req.user.id,
        'Added to Project',
        `${req.user.name} added you to the project "${data.name}"`
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('projectUpdated', data);
      io.emit('notificationReceived');
    }
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to update project' });
  }
});

// =====================================================
// DELETE PROJECT (admin) — tasks are unlinked, not deleted
// =====================================================
router.delete('/:id', auth, async (req, res) => {
  try {
    if (!isAdmin(req.user)) {
      return res.status(403).json({ message: 'Only admin can delete projects' });
    }
    await supabase
      .from('tickets')
      .update({ project_id: null })
      .eq('project_id', req.params.id);
    const { error } = await supabase.from('projects').delete().eq('id', req.params.id);
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    const io = req.app.get('io');
    if (io) io.emit('projectDeleted', { id: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete project' });
  }
});

module.exports = router;
