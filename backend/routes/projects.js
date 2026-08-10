const express = require('express');
const router = express.Router();

const supabase = require('../config/supabase');
const auth = require('../middleware/auth');
const getISTTime = require('../utils/time');
const { notifyUser, insertNotifications } = require('../services/notificationService');
const { isAdmin, isSuperAdmin, isTeamMember, teamFromRole } = require('../utils/roles');
const { emitScoped } = require('../utils/realtime');

// A project belongs to the team of whoever created it (falling back to its
// owner). Used to keep team admins scoped to their own team's projects.
const projectTeam = (project, roleById) =>
  teamFromRole(roleById[project.created_by]) ||
  teamFromRole(roleById[project.owner]) ||
  'Marketing';

const rolesByIdFor = async (projects) => {
  const ids = [
    ...new Set(projects.flatMap((p) => [p.created_by, p.owner]).filter(Boolean)),
  ];
  if (!ids.length) return {};
  const { data } = await supabase.from('users').select('id, role').in('id', ids);
  return Object.fromEntries((data || []).map((u) => [u.id, u.role]));
};

// An admin may act on a project only within their own team; Super Admin spans
// every team.
const adminScopedTo = (user, project, roleById) =>
  isSuperAdmin(user) ||
  (isAdmin(user) && projectTeam(project, roleById) === teamFromRole(user.role));

// Supabase REST caps a response at 1000 rows without reporting an error, so an
// unbounded select would silently under-count task stats. Page until exhausted,
// ordered by a unique column — without a stable order Postgres may repeat or
// skip rows between pages.
const PAGE = 1000;

// `build` must return a fresh query each call — a PostgREST builder can only be
// awaited once. `onError` decides whether a failure is fatal or degrades to the
// rows gathered so far.
const fetchPaged = async (build, onError) => {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build().range(from, from + PAGE - 1);
    if (error) {
      if (onError) return onError(error, rows);
      throw error;
    }
    rows.push(...(data || []));
    if (!data || data.length < PAGE) return rows;
  }
};

const fetchProjectTickets = () =>
  fetchPaged(
    () =>
      supabase
        .from('tickets')
        .select('id, project_id, status, due_date, assigned_to')
        .not('project_id', 'is', null)
        .order('id', { ascending: true }),
    // A missing tickets.project_id column means the migration has not run yet —
    // degrade to empty stats rather than 500-ing the whole project list.
    (error, rows) => {
      console.error('Project task lookup failed:', error);
      return rows;
    }
  );

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

// Returns the ids actually notified, so the socket nudge can be aimed at them.
const notifyMembers = async (memberIds, excludeUserId, title, message) => {
  if (!memberIds?.length) return [];
  const ids = memberIds.filter((id) => id && id !== excludeUserId);
  if (!ids.length) return [];
  const { data: users } = await supabase
    .from('users')
    .select('id, name')
    .in('id', ids);
  if (!users?.length) return [];
  await insertNotifications(
    users.map((u) => ({
      user_id: u.id,
      user_name: u.name,
      title,
      message,
      ticket_id: null,
    }))
  );
  return users.map((u) => u.id);
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
    let projects;
    try {
      projects = await fetchPaged(() =>
        supabase
          .from('projects')
          .select('*')
          // created_at alone is not unique, so pages could repeat or skip rows.
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
      );
    } catch (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }

    const projectTickets = await fetchProjectTickets();

    const enriched = (projects || []).map((p) => {
      const tasks = projectTickets.filter((t) => t.project_id === p.id);
      return { ...p, stats: taskStats(tasks, p.target_date) };
    });

    let visible;
    if (isSuperAdmin(req.user)) {
      visible = enriched;
    } else if (isAdmin(req.user)) {
      // Team admins only see their own team's projects (by creator's team)
      const roleById = await rolesByIdFor(enriched);
      const myTeam = teamFromRole(req.user.role);
      visible = enriched.filter((p) => projectTeam(p, roleById) === myTeam);
    } else {
      // Everyone else only sees projects they own, belong to, or have a task in
      visible = enriched.filter(
        (p) =>
          (p.members || []).includes(req.user.id) ||
          p.created_by === req.user.id ||
          p.owner === req.user.id ||
          projectTickets.some(
            (t) => t.project_id === p.id && t.assigned_to === req.user.id
          )
      );
    }

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
    if (isTeamMember(req.user)) {
      return res.status(403).json({ message: 'Team members cannot create projects' });
    }
    const { name, description, target_date, members, color, division, owner } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'Project name is required' });
    }

    const insertRow = {
      name: name.trim(),
      description: description || null,
      status: 'Active',
      target_date: target_date || null,
      color: color || null,
      division: division || null,
      owner: owner || null,
      members: Array.isArray(members) ? members : [],
      created_by: req.user.id,
      created_by_name: req.user.name,
      created_at: getISTTime(),
      updated_at: getISTTime(),
    };

    let { data, error } = await supabase.from('projects').insert([insertRow]).select().single();
    // division/owner migration not run yet — retry without the new columns
    if (error && error.code === 'PGRST204') {
      const { division: _d, owner: _o, ...withoutNew } = insertRow;
      ({ data, error } = await supabase.from('projects').insert([withoutNew]).select().single());
    }
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }

    const notified = await notifyMembers(
      data.members,
      req.user.id,
      'Added to Project',
      `${req.user.name} added you to the project "${data.name}"`
    );

    const io = req.app.get('io');
    if (io) {
      const roleById = await rolesByIdFor([data]);
      emitScoped(io, 'projectCreated', data, {
        team: projectTeam(data, roleById),
        userIds: [data.created_by, data.owner, ...(data.members || [])],
      });
      emitScoped(io, 'notificationReceived', undefined, { userIds: notified });
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

    // Access: admin (scoped to their team), owner, member, creator, or
    // assignee of any task
    const roleById = await rolesByIdFor([project]);
    const hasAccess =
      adminScopedTo(req.user, project, roleById) ||
      (project.members || []).includes(req.user.id) ||
      project.created_by === req.user.id ||
      project.owner === req.user.id ||
      (tasks || []).some((t) => t.assigned_to === req.user.id);
    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Resolve names for members + owner + task assignees in one query
    const userIds = [
      ...new Set(
        [
          ...(project.members || []),
          project.owner,
          ...(tasks || []).map((t) => t.assigned_to),
        ].filter(Boolean)
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

    // Stable Jira-style task numbers, assigned server-side over the FULL set
    // so numbering matches for every viewer
    [...tasksWithNames]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .forEach((t, i) => {
        t.task_number = i + 1;
      });

    // Members only see their own tasks — admins, the project creator and
    // the project owner see the whole picture
    const fullView =
      isAdmin(req.user) ||
      project.created_by === req.user.id ||
      project.owner === req.user.id;
    const visibleTasks = fullView
      ? tasksWithNames
      : tasksWithNames.filter((t) => t.assigned_to === req.user.id);

    res.json({
      ...project,
      full_view: fullView,
      // Overall stats stay project-wide so everyone sees the project stage
      stats: taskStats(tasksWithNames, project.target_date),
      tasks: visibleTasks,
      member_details: (project.members || [])
        .map((id) => users.find((u) => u.id === id))
        .filter(Boolean),
      owner_details: users.find((u) => u.id === project.owner) || null,
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
    // Same rule as the read paths: an admin only reaches their own team's
    // projects, so a Service admin cannot edit a Marketing project.
    const roleById = await rolesByIdFor([existing]);
    if (
      !adminScopedTo(req.user, existing, roleById) &&
      existing.created_by !== req.user.id &&
      existing.owner !== req.user.id
    ) {
      return res.status(403).json({ message: 'Only admin, the project owner or the creator can edit' });
    }

    const { name, description, status, target_date, members, color, division, owner } = req.body;
    const updateData = { updated_at: getISTTime() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (color !== undefined) updateData.color = color;
    if (members !== undefined) updateData.members = members;
    if (division !== undefined) updateData.division = division;
    if (owner !== undefined) updateData.owner = owner;

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

    let { data, error } = await supabase
      .from('projects')
      .update(updateData)
      .eq('id', existing.id)
      .select()
      .single();
    // division/owner migration not run yet — retry without the new columns
    if (error && error.code === 'PGRST204') {
      const { division: _d, owner: _o, ...withoutNew } = updateData;
      ({ data, error } = await supabase
        .from('projects')
        .update(withoutNew)
        .eq('id', existing.id)
        .select()
        .single());
    }
    if (error) throw error;

    const notified = [];

    // Tell the new owner
    if (owner && owner !== existing.owner && owner !== req.user.id) {
      const { data: ownerUser } = await supabase
        .from('users')
        .select('name')
        .eq('id', owner)
        .single();
      if (ownerUser) {
        await notifyUser(
          ownerUser.name,
          'Project Ownership',
          `${req.user.name} made you the owner of the project "${data.name}"`,
          null
        );
        notified.push(owner);
      }
    }

    // Division maps to all tasks in the project — propagate changes
    if (division !== undefined && division && division !== existing.division) {
      await supabase
        .from('tickets')
        .update({ division, updated_at: getISTTime() })
        .eq('project_id', existing.id);
    }

    // Notify newly added members
    if (members !== undefined) {
      const added = (members || []).filter(
        (id) => !(existing.members || []).includes(id)
      );
      notified.push(
        ...(await notifyMembers(
          added,
          req.user.id,
          'Added to Project',
          `${req.user.name} added you to the project "${data.name}"`
        ))
      );
    }

    const io = req.app.get('io');
    if (io) {
      const audienceRoles = await rolesByIdFor([data]);
      emitScoped(io, 'projectUpdated', data, {
        team: projectTeam(data, audienceRoles),
        userIds: [data.created_by, data.owner, ...(data.members || [])],
      });
      emitScoped(io, 'notificationReceived', undefined, { userIds: notified });
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

    const { data: existing, error: fetchError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (fetchError || !existing) {
      if (isMissingSchema(fetchError)) return migrationResponse(res);
      return res.status(404).json({ message: 'Project not found' });
    }

    const roleById = await rolesByIdFor([existing]);
    if (!adminScopedTo(req.user, existing, roleById)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await supabase
      .from('tickets')
      .update({ project_id: null })
      .eq('project_id', existing.id);
    const { error } = await supabase.from('projects').delete().eq('id', existing.id);
    if (error) {
      if (isMissingSchema(error)) return migrationResponse(res);
      throw error;
    }
    const io = req.app.get('io');
    emitScoped(io, 'projectDeleted', { id: existing.id }, {
      team: projectTeam(existing, roleById),
      userIds: [existing.created_by, existing.owner, ...(existing.members || [])],
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Failed to delete project' });
  }
});

module.exports = router;
