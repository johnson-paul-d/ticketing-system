// =====================================================
// Write tools
// =====================================================
// Everything else in the MCP surface reads. These seven change things, and they
// change them *as the person connected* — the portal routes they call apply the
// same permission checks, fire the same notification emails, push the same
// realtime updates and write the same timeline entries as the web app does.
// Nothing here reaches around that.
//
// A connection may write only if it was granted it: an API key that was minted
// without read-only ticked, or an OAuth sign-in where the person was shown the
// "it can also make changes" notice and agreed to it. Where it was not granted,
// these tools refuse before calling anything.
//
// Three things are deliberately not here, and their absence is the design rather
// than an oversight:
//
//   Deleting anything.  An agent that misreads a request and deletes a ticket
//                       has destroyed a record of somebody's work, and there is
//                       no undo in this app.
//   Approving expenses. That is money, and each approval is signed into an
//                       approval_hash tied to the receipt files — a decision a
//                       person should be making.
//   Managing users.     Creating accounts, changing roles, setting passwords.
//
// All three remain available in the web app to exactly the people who could
// always do them.

const portal = require('./portalApi');
const { todayIST } = require('../utils/time');

// Refused before anything is called, and worded so the model relays a fix
// rather than retrying the same call.
const requireWrite = (ctx) => {
  if (ctx.canWrite) return;
  throw new portal.PortalError(
    403,
    ctx.key?.name === 'OAuth sign-in'
      ? 'This connection is read-only. Reconnect and allow changes when the sign-in page asks.'
      : `The API key "${ctx.key?.name || 'in use'}" is read-only. Mint one with read-only unticked ` +
        'in Admin Panel → API Keys, or sign in instead.'
  );
};

// Only the fields the caller actually set are sent on. An update that passed
// through every undefined key would blank half the ticket, because the route
// cannot tell "not mentioned" from "set to nothing".
const given = (obj) => {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
};

const summarise = (ticket) => ({
  id: ticket?.id,
  title: ticket?.title,
  status: ticket?.status,
  priority: ticket?.priority,
  assigned_to_name: ticket?.assigned_to_name,
  due_date: ticket?.due_date,
  approval_status: ticket?.approval_status,
});

// The time-entry route runs start_time and end_time through new Date() and calls
// toISOString on the result, so a missing one throws an Invalid Date rather than
// defaulting. A model asked to "log 45 minutes on ticket 12" has no window in
// mind, so one is derived: the entry lands at 09:00 on the work date and runs
// for its duration. Passing real times overrides it.
const timeWindow = ({ work_date: workDate, duration_minutes: minutes, start_time, end_time }) => {
  if (start_time && end_time) return { start_time, end_time };
  const start = new Date(`${workDate}T09:00:00+05:30`);
  if (Number.isNaN(start.getTime())) {
    throw new portal.PortalError(400, `"${workDate}" is not a date. Use YYYY-MM-DD.`);
  }
  return {
    start_time: start.toISOString(),
    end_time: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
  };
};

const tools = [
  {
    name: 'create_ticket',
    title: 'Raise a ticket',
    description:
      'Raises a new ticket, recorded as raised by you. Only an admin can assign work to someone ' +
      'else — for anyone else the ticket comes back assigned to themselves whatever assigned_to ' +
      'said, which is the same rule the web form follows. Title and description are required.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short summary of the work.' },
        description: { type: 'string', description: 'What actually needs doing.' },
        priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
        category: {
          type: 'string',
          description: 'Work type. Marketing and Service have different lists — read one off an existing ticket if unsure.',
        },
        division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
        assigned_to: {
          type: 'string',
          description: 'User id of the assignee. Admins only; ignored for anyone else. Use list_users to find the id.',
        },
        due_date: { type: 'string', description: 'YYYY-MM-DD.' },
        allotted_minutes: { type: 'number', description: 'Time budget in minutes.' },
        given_by: { type: 'string', description: 'Who asked for the work, if worth recording.' },
        project_id: {
          type: 'string',
          description: 'Attach to a project. The due date must fall on or before the project target date unless you are an admin.',
        },
      },
      required: ['title', 'description'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const created = await portal.mutate(ctx.credential, 'POST', '/tickets', given({
        title: args.title,
        description: args.description,
        priority: args.priority,
        category: args.category,
        division: args.division,
        assigned_to: args.assigned_to,
        due_date: args.due_date,
        allotted_minutes: args.allotted_minutes,
        given_by: args.given_by,
        project_id: args.project_id,
      }));
      const ticket = created?.ticket || created;
      return { created: summarise(ticket), message: `Raised ticket ${ticket?.id}.` };
    },
  },

  {
    name: 'update_ticket',
    title: 'Change a ticket',
    description:
      'Changes a ticket you can reach — an admin can change anything on their team, anyone else ' +
      'only tickets assigned to them or raised by them. Omitted fields are left alone; pass only ' +
      'what should change. Setting status to Completed or Closed is how work is finished, and a ' +
      'closure note belongs in comment.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ticket id.' },
        title: { type: 'string' },
        description: { type: 'string' },
        status: {
          type: 'string',
          enum: ['Open', 'In Progress', 'Waiting For Sources', 'Completed', 'Closed'],
        },
        priority: { type: 'string', enum: ['Low', 'Medium', 'High', 'Urgent'] },
        category: { type: 'string' },
        division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
        due_date: { type: 'string', description: 'YYYY-MM-DD.' },
        allotted_minutes: { type: 'number', description: 'Time budget in minutes.' },
        given_by: { type: 'string' },
        project_id: { type: 'string', description: 'Move the ticket into a project.' },
        comment: {
          type: 'string',
          description: 'A note recorded against the change, shown on the ticket timeline.',
        },
      },
      required: ['id'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const { id, ...rest } = args;
      const fields = given(rest);
      if (!Object.keys(fields).length) {
        throw new portal.PortalError(400, 'Nothing to change — pass at least one field besides id.');
      }
      const updated = await portal.mutate(
        ctx.credential,
        'PUT',
        `/tickets/${encodeURIComponent(id)}`,
        fields
      );
      const ticket = updated?.ticket || updated;
      return {
        updated: summarise(ticket),
        changed: Object.keys(fields),
        message: `Updated ticket ${id}.`,
      };
    },
  },

  {
    name: 'assign_ticket',
    title: 'Reassign a ticket',
    description:
      'Hands a ticket to someone else. Admins only, and only within their own team — the route ' +
      'refuses anything else. Use list_users to turn a name into the id this wants.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ticket id.' },
        assigned_to: { type: 'string', description: 'User id of the new assignee.' },
      },
      required: ['id', 'assigned_to'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const updated = await portal.mutate(
        ctx.credential,
        'PUT',
        `/tickets/${encodeURIComponent(args.id)}/assign`,
        { assigned_to: args.assigned_to }
      );
      return { updated: summarise(updated?.ticket || updated), message: `Reassigned ticket ${args.id}.` };
    },
  },

  {
    name: 'log_time',
    title: 'Log work against a ticket',
    description:
      'Records time spent on a ticket, which adds to the ticket\'s consumed total and its ' +
      'timeline. You can log against any ticket you can reach. If you give no start and end time, ' +
      'the entry is placed at 09:00 IST on the work date and runs for its duration — good enough ' +
      'for "I spent 45 minutes on this today", and pass real times when they matter.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        ticket_id: { type: 'string', description: 'The ticket the work was on.' },
        duration_minutes: { type: 'number', minimum: 1, description: 'Minutes worked.' },
        work_date: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' },
        notes: { type: 'string', description: 'What was done.' },
        start_time: { type: 'string', description: 'ISO timestamp. Optional.' },
        end_time: { type: 'string', description: 'ISO timestamp. Optional.' },
      },
      required: ['ticket_id', 'duration_minutes'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const minutes = Number(args.duration_minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new portal.PortalError(400, 'duration_minutes must be a positive number of minutes.');
      }
      const workDate = args.work_date || todayIST();
      const window = timeWindow({ ...args, work_date: workDate, duration_minutes: minutes });

      const entry = await portal.mutate(ctx.credential, 'POST', '/ticket-time-entries', {
        ticket_id: args.ticket_id,
        work_date: workDate,
        duration_minutes: minutes,
        notes: args.notes ?? null,
        ...window,
      });

      return {
        logged: { id: entry?.id, ticket_id: args.ticket_id, minutes, work_date: workDate },
        message: `Logged ${minutes} minutes against ticket ${args.ticket_id}.`,
      };
    },
  },

  {
    name: 'approve_ticket',
    title: 'Approve a ticket',
    description:
      'Approves a ticket that is waiting on it, releasing it to the status that was requested. ' +
      'Admins only, and only on their own team. This notifies the person who raised it.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'The ticket id.' } },
      required: ['id'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const updated = await portal.mutate(
        ctx.credential,
        'PUT',
        `/tickets/${encodeURIComponent(args.id)}/approve`
      );
      return { approved: summarise(updated?.ticket || updated), message: `Approved ticket ${args.id}.` };
    },
  },

  {
    name: 'reject_ticket',
    title: 'Reject a ticket',
    description:
      'Refuses a ticket waiting on approval. Admins only, and only on their own team. This ' +
      'notifies the person who raised it, so say why in reason.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ticket id.' },
        reason: { type: 'string', description: 'Why it was refused.' },
      },
      required: ['id'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const updated = await portal.mutate(
        ctx.credential,
        'PUT',
        `/tickets/${encodeURIComponent(args.id)}/reject`,
        given({ reason: args.reason, comment: args.reason })
      );
      return { rejected: summarise(updated?.ticket || updated), message: `Rejected ticket ${args.id}.` };
    },
  },

  {
    name: 'create_project',
    title: 'Create a project',
    description:
      'Creates a project to group tickets under. Team members cannot create projects — the route ' +
      'refuses them, as the web app does. Members are user ids; use list_users to find them.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Project name.' },
        description: { type: 'string' },
        target_date: { type: 'string', description: 'YYYY-MM-DD. Tasks cannot be due after this.' },
        division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
        owner: { type: 'string', description: 'User id of the owner.' },
        members: {
          type: 'array',
          items: { type: 'string' },
          description: 'User ids of everyone on it.',
        },
      },
      required: ['name'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const project = await portal.mutate(ctx.credential, 'POST', '/projects', given({
        name: args.name,
        description: args.description,
        target_date: args.target_date,
        division: args.division,
        owner: args.owner,
        members: args.members,
      }));
      return {
        created: { id: project?.id, name: project?.name, target_date: project?.target_date },
        message: `Created project ${project?.id}.`,
      };
    },
  },

  {
    name: 'update_project',
    title: 'Change a project',
    description:
      'Changes a project you can reach. Omitted fields are left alone. Moving the target date ' +
      'earlier than a task already due will be refused by the route.',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The project id.' },
        name: { type: 'string' },
        description: { type: 'string' },
        status: { type: 'string' },
        target_date: { type: 'string', description: 'YYYY-MM-DD.' },
        division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
        owner: { type: 'string', description: 'User id of the owner.' },
        members: { type: 'array', items: { type: 'string' }, description: 'Replaces the member list.' },
      },
      required: ['id'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const { id, ...rest } = args;
      const fields = given(rest);
      if (!Object.keys(fields).length) {
        throw new portal.PortalError(400, 'Nothing to change — pass at least one field besides id.');
      }
      const project = await portal.mutate(
        ctx.credential,
        'PUT',
        `/projects/${encodeURIComponent(id)}`,
        fields
      );
      return {
        updated: { id: project?.id, name: project?.name, target_date: project?.target_date },
        changed: Object.keys(fields),
        message: `Updated project ${id}.`,
      };
    },
  },
];

module.exports = { tools, requireWrite, given, summarise };
