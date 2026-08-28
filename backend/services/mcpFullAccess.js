// =====================================================
// The rest of what a signed-in person can do
// =====================================================
// mcpWrites.js covers the everyday writing — raising work, changing it, logging
// time. This covers everything else the web app offers: deleting, the whole
// expense claim lifecycle including approvals, and managing user accounts.
//
// Together they are parity. A connection can do what the person behind it can do
// and nothing more, and the "nothing more" is not enforced here — it is enforced
// by the same route handlers the web app posts to. Every tool below is a thin
// call to one of them, so a team member asking to delete a ticket gets the
// route's own "Only admin can delete tickets", and a Marketing admin asking to
// change a Service user gets "You can only manage users on your own team". None
// of those rules are restated here, because a second copy is the one that
// eventually disagrees.
//
// The single exception, and it is the app's own rule rather than a new one:
// routes/apiKeys.js refuses to let a machine caller mint or revoke API keys,
// because otherwise revoking a connection would not end the access it granted.
// An OAuth session now carries agent:true so that rule reaches it too. Minting
// stays a thing a person does at a keyboard.

const portal = require('./portalApi');
const { requireWrite, given } = require('./mcpWrites');

const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: true };
const changes = { readOnlyHint: false, destructiveHint: false, idempotentHint: true };
const creates = { readOnlyHint: false, destructiveHint: false, idempotentHint: false };

const id = (v) => encodeURIComponent(String(v));

// Saves repeating the same four lines eighteen times. The handler still owns
// anything that needs checking before the call.
const simple = ({ name, title, description, annotations, schema, required = [], call, reply }) => ({
  name,
  title,
  description,
  annotations,
  inputSchema: { type: 'object', properties: schema, required },
  handler: async (args, ctx) => {
    requireWrite(ctx);
    const { method, path, body } = call(args);
    const result = await portal.mutate(ctx.credential, method, path, body);
    return reply ? reply(result, args) : { result, message: 'Done.' };
  },
});

const tools = [
  // ---------------------------------------------------------------
  // Deleting
  // ---------------------------------------------------------------
  // All three routes are admin-only and scoped to the admin's own team, so
  // these are exactly as reachable as the delete buttons in the web app.
  // There is no undo behind any of them.
  simple({
    name: 'delete_ticket',
    title: 'Delete a ticket',
    description:
      'Deletes a ticket outright. Admins only, and only on their own team — the route refuses ' +
      'anyone else. There is no undo and no archive: the ticket and its history are gone. Prefer ' +
      'setting the status to Closed unless the ticket was raised in error.',
    annotations: destructive,
    schema: { id: { type: 'string', description: 'The ticket id.' } },
    required: ['id'],
    call: (a) => ({ method: 'DELETE', path: `/tickets/${id(a.id)}` }),
    reply: (_r, a) => ({ deleted: a.id, message: `Deleted ticket ${a.id}. This cannot be undone.` }),
  }),

  simple({
    name: 'delete_project',
    title: 'Delete a project',
    description:
      'Deletes a project. Admins only, and only their own team\'s. The tickets in it are not ' +
      'deleted with it, but they stop belonging to a project.',
    annotations: destructive,
    schema: { id: { type: 'string', description: 'The project id.' } },
    required: ['id'],
    call: (a) => ({ method: 'DELETE', path: `/projects/${id(a.id)}` }),
    reply: (_r, a) => ({ deleted: a.id, message: `Deleted project ${a.id}. This cannot be undone.` }),
  }),

  // ---------------------------------------------------------------
  // Time entries
  // ---------------------------------------------------------------
  {
    name: 'update_time_entry',
    title: 'Correct a logged time entry',
    description:
      'Rewrites a time entry and adjusts the ticket\'s running total to match. The person who ' +
      'logged it can change their own; an admin can change anyone\'s on their team. This replaces ' +
      'the entry rather than patching it, so duration_minutes is always required.',
    annotations: changes,
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: { type: 'string', description: 'The time entry id, from query_table on ticket_time_entries.' },
        duration_minutes: { type: 'number', minimum: 1, description: 'The corrected duration.' },
        work_date: { type: 'string', description: 'YYYY-MM-DD.' },
        notes: { type: 'string', description: 'What was done.' },
        start_time: { type: 'string', description: 'ISO timestamp. Optional.' },
        end_time: { type: 'string', description: 'ISO timestamp. Optional.' },
      },
      required: ['entry_id', 'duration_minutes'],
    },
    handler: async (args, ctx) => {
      requireWrite(ctx);
      const minutes = Number(args.duration_minutes);
      if (!Number.isFinite(minutes) || minutes <= 0) {
        throw new portal.PortalError(400, 'duration_minutes must be a positive number of minutes.');
      }
      // Same reason as log_time: the route puts both through new Date() and
      // calls toISOString, so a missing one throws rather than defaulting.
      let window = { start_time: args.start_time, end_time: args.end_time };
      if (!args.start_time || !args.end_time) {
        const day = args.work_date || new Date().toISOString().slice(0, 10);
        const start = new Date(`${day}T09:00:00+05:30`);
        if (Number.isNaN(start.getTime())) {
          throw new portal.PortalError(400, `"${day}" is not a date. Use YYYY-MM-DD.`);
        }
        window = {
          start_time: start.toISOString(),
          end_time: new Date(start.getTime() + minutes * 60 * 1000).toISOString(),
        };
      }
      const updated = await portal.mutate(
        ctx.credential,
        'PUT',
        `/ticket-time-entries/${id(args.entry_id)}`,
        given({ duration_minutes: minutes, work_date: args.work_date, notes: args.notes, ...window })
      );
      return { updated: { id: updated?.id, minutes }, message: `Time entry ${args.entry_id} now reads ${minutes} minutes.` };
    },
  },

  simple({
    name: 'delete_time_entry',
    title: 'Delete a logged time entry',
    description:
      'Removes a time entry and takes its minutes back off the ticket total. The person who ' +
      'logged it, or an admin over that ticket\'s team — deleting someone else\'s record of their ' +
      'work is treated as the same act as rewriting it.',
    annotations: destructive,
    schema: { entry_id: { type: 'string', description: 'The time entry id.' } },
    required: ['entry_id'],
    call: (a) => ({ method: 'DELETE', path: `/ticket-time-entries/${id(a.entry_id)}` }),
    reply: (_r, a) => ({ deleted: a.entry_id, message: `Deleted time entry ${a.entry_id}.` }),
  }),

  // ---------------------------------------------------------------
  // Expense claims
  // ---------------------------------------------------------------
  // A claim is raised as a Draft, lines are added to it, each line needs a
  // receipt before the claim can be submitted, and then each line is approved or
  // refused on its own. That shape is why there is no single "file an expense"
  // tool: the steps are separate in the app because they happen at different
  // times.
  simple({
    name: 'create_expense_claim',
    title: 'Start an expense claim',
    description:
      'Opens a new claim in Draft, in your name. Add bills to it with add_expense_line, then ' +
      'submit_expense_claim once every line has a receipt attached. Receipts have to be uploaded ' +
      'in the web app — a file cannot be sent through this connection.',
    annotations: creates,
    schema: {
      title: { type: 'string', description: 'What the claim is for.' },
      division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
      currency: { type: 'string', description: 'Three-letter code. Defaults to INR.' },
    },
    required: ['title', 'division'],
    call: (a) => ({
      method: 'POST',
      path: '/expenses',
      body: given({ title: a.title, division: a.division, currency: a.currency }),
    }),
    reply: (r) => ({
      created: { id: r?.id, claim_number: r?.claim_number, status: r?.status },
      message: `Opened claim ${r?.claim_number || r?.id} as a draft.`,
    }),
  }),

  simple({
    name: 'update_expense_claim',
    title: 'Change an expense claim',
    description:
      'Changes the claim itself, not its bills. Only while it is still editable — once a line has ' +
      'been approved the currency is fixed, because each approval was computed over it and is ' +
      'signed into a document that has already been printed.',
    annotations: changes,
    schema: {
      id: { type: 'string', description: 'The claim id.' },
      title: { type: 'string' },
      division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
      currency: { type: 'string', description: 'Three-letter code.' },
    },
    required: ['id'],
    call: (a) => ({
      method: 'PUT',
      path: `/expenses/${id(a.id)}`,
      body: given({ title: a.title, division: a.division, currency: a.currency }),
    }),
    reply: (r, a) => ({ updated: { id: r?.id || a.id }, message: `Updated claim ${a.id}.` }),
  }),

  simple({
    name: 'delete_expense_claim',
    title: 'Delete an expense claim',
    description: 'Deletes a claim and its lines. Only while the claim is still editable.',
    annotations: destructive,
    schema: { id: { type: 'string', description: 'The claim id.' } },
    required: ['id'],
    call: (a) => ({ method: 'DELETE', path: `/expenses/${id(a.id)}` }),
    reply: (_r, a) => ({ deleted: a.id, message: `Deleted claim ${a.id}.` }),
  }),

  simple({
    name: 'add_expense_line',
    title: 'Add a bill to a claim',
    description:
      'Adds one bill. amount is the net figure and tax_amount goes on top of it. The category has ' +
      'to be one your team uses — read the list off an existing claim, or from ' +
      'query_table on expense_lines, if unsure. A line still needs its receipt attaching in the ' +
      'web app before the claim can be submitted.',
    annotations: creates,
    schema: {
      claim_id: { type: 'string', description: 'The claim to add it to.' },
      expense_date: { type: 'string', description: 'YYYY-MM-DD, the date the money was spent.' },
      category: { type: 'string', description: 'Expense category, e.g. Exhibition or Print Collaterals.' },
      description: { type: 'string', description: 'What was bought.' },
      amount: { type: 'number', description: 'Net amount, before tax.' },
      tax_amount: { type: 'number', description: 'Tax on top. Defaults to 0.' },
    },
    required: ['claim_id', 'expense_date', 'category', 'amount'],
    call: (a) => ({
      method: 'POST',
      path: `/expenses/${id(a.claim_id)}/lines`,
      body: given({
        expense_date: a.expense_date,
        category: a.category,
        description: a.description,
        amount: a.amount,
        tax_amount: a.tax_amount,
      }),
    }),
    reply: (r) => ({
      added: { line_id: r?.id, amount: r?.amount, tax_amount: r?.tax_amount },
      message: 'Added the bill. It needs a receipt attached in the web app before the claim can be submitted.',
    }),
  }),

  simple({
    name: 'update_expense_line',
    title: 'Change a bill',
    description: 'Changes one bill on a claim, while that line is still editable.',
    annotations: changes,
    schema: {
      claim_id: { type: 'string', description: 'The claim id.' },
      line_id: { type: 'string', description: 'The line id.' },
      expense_date: { type: 'string', description: 'YYYY-MM-DD.' },
      category: { type: 'string' },
      description: { type: 'string' },
      amount: { type: 'number', description: 'Net amount.' },
      tax_amount: { type: 'number' },
    },
    required: ['claim_id', 'line_id'],
    call: (a) => ({
      method: 'PUT',
      path: `/expenses/${id(a.claim_id)}/lines/${id(a.line_id)}`,
      body: given({
        expense_date: a.expense_date,
        category: a.category,
        description: a.description,
        amount: a.amount,
        tax_amount: a.tax_amount,
      }),
    }),
    reply: (_r, a) => ({ updated: a.line_id, message: `Updated line ${a.line_id}.` }),
  }),

  simple({
    name: 'delete_expense_line',
    title: 'Remove a bill from a claim',
    description: 'Removes one bill, while that line is still editable.',
    annotations: destructive,
    schema: {
      claim_id: { type: 'string', description: 'The claim id.' },
      line_id: { type: 'string', description: 'The line id.' },
    },
    required: ['claim_id', 'line_id'],
    call: (a) => ({ method: 'DELETE', path: `/expenses/${id(a.claim_id)}/lines/${id(a.line_id)}` }),
    reply: (_r, a) => ({ deleted: a.line_id, message: `Removed line ${a.line_id}.` }),
  }),

  simple({
    name: 'submit_expense_claim',
    title: 'Send a claim for approval',
    description:
      'Hands a draft claim to the approvers. Every line must already have a receipt attached, and ' +
      'the route refuses the whole submission naming the lines that do not — receipts are attached ' +
      'in the web app. Only ever done once: lines added afterwards go to the approvers on their own.',
    annotations: changes,
    schema: { id: { type: 'string', description: 'The claim id.' } },
    required: ['id'],
    call: (a) => ({ method: 'POST', path: `/expenses/${id(a.id)}/submit` }),
    reply: (r, a) => ({ submitted: a.id, status: r?.status, message: `Submitted claim ${a.id} for approval.` }),
  }),

  // Approving is the one place where a refusal is routinely about the approver
  // rather than the claim: the route requires a signature on file, because the
  // approval is printed onto a document over that signature.
  simple({
    name: 'approve_expense_line',
    title: 'Approve one bill',
    description:
      'Approves a single bill. Lines are decided one at a time, so a claim can end up part ' +
      'approved. This is money leaving the company and it is recorded against your name and ' +
      'signature — the route refuses if you have not uploaded a signature, and refuses a line with ' +
      'no receipt attached.',
    annotations: changes,
    schema: {
      claim_id: { type: 'string', description: 'The claim id.' },
      line_id: { type: 'string', description: 'The line id.' },
    },
    required: ['claim_id', 'line_id'],
    call: (a) => ({ method: 'POST', path: `/expenses/${id(a.claim_id)}/lines/${id(a.line_id)}/approve` }),
    reply: (r, a) => ({ approved: a.line_id, result: r, message: `Approved line ${a.line_id}.` }),
  }),

  simple({
    name: 'reject_expense_line',
    title: 'Refuse one bill',
    description:
      'Refuses a single bill. A reason is required — the claimant is shown it, and it is the only ' +
      'thing telling them what to fix before resubmitting.',
    annotations: changes,
    schema: {
      claim_id: { type: 'string', description: 'The claim id.' },
      line_id: { type: 'string', description: 'The line id.' },
      reason: { type: 'string', description: 'Why it was refused. Shown to the claimant.' },
    },
    required: ['claim_id', 'line_id', 'reason'],
    call: (a) => ({
      method: 'POST',
      path: `/expenses/${id(a.claim_id)}/lines/${id(a.line_id)}/reject`,
      body: { reason: a.reason },
    }),
    reply: (_r, a) => ({ rejected: a.line_id, message: `Refused line ${a.line_id}.` }),
  }),

  simple({
    name: 'approve_expense_claim',
    title: 'Approve every outstanding bill on a claim',
    description:
      'Approves every line still awaiting a decision, in one go. Lines it cannot approve — no ' +
      'receipt, already decided — are reported back rather than silently skipped. Same signature ' +
      'requirement as approving one.',
    annotations: changes,
    schema: { id: { type: 'string', description: 'The claim id.' } },
    required: ['id'],
    call: (a) => ({ method: 'POST', path: `/expenses/${id(a.id)}/approve-all` }),
    reply: (r, a) => ({ claim_id: a.id, result: r, message: `Ran approval across claim ${a.id}.` }),
  }),

  simple({
    name: 'resubmit_expense_line',
    title: 'Resubmit a refused bill',
    description:
      'Puts a refused bill back in front of the approvers, after whatever they objected to has ' +
      'been fixed. Only works on a line that was actually rejected.',
    annotations: changes,
    schema: {
      claim_id: { type: 'string', description: 'The claim id.' },
      line_id: { type: 'string', description: 'The line id.' },
    },
    required: ['claim_id', 'line_id'],
    call: (a) => ({ method: 'POST', path: `/expenses/${id(a.claim_id)}/lines/${id(a.line_id)}/resubmit` }),
    reply: (_r, a) => ({ resubmitted: a.line_id, message: `Line ${a.line_id} is back with the approvers.` }),
  }),

  // ---------------------------------------------------------------
  // User accounts
  // ---------------------------------------------------------------
  // Admin-only, and a team admin is confined to their own team — otherwise one
  // could mint a Super Admin account and escalate that way. The route enforces
  // both. What it cannot enforce is judgement about handing an account to the
  // wrong person, so these say plainly what they are.
  simple({
    name: 'create_user',
    title: 'Create a user account',
    description:
      'Creates an account someone can sign in with. Admins only, and only on their own team. The ' +
      'password is set here and cannot be read back afterwards — give it to the person directly ' +
      'rather than leaving it in a chat log, and have them change it. The role decides what they ' +
      'can see across the whole app, so read it back to whoever asked before creating.',
    annotations: creates,
    schema: {
      name: { type: 'string', description: 'Display name.' },
      email: { type: 'string', description: 'Work email. This is the sign-in name.' },
      password: { type: 'string', description: 'Initial password.' },
      role: {
        type: 'string',
        description:
          'e.g. "Team Member - MKTG", "User - Service", "Admin - Marketing". The team is part of ' +
          'the label. A team admin cannot create a role outside their own team.',
      },
      division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
      designation: { type: 'string', description: 'Job title, printed under the signature on approved expenses.' },
    },
    required: ['name', 'email', 'password', 'role'],
    call: (a) => ({
      method: 'POST',
      path: '/users',
      body: given({
        name: a.name,
        email: a.email,
        password: a.password,
        role: a.role,
        division: a.division,
        designation: a.designation,
      }),
    }),
    reply: (r) => ({
      created: { id: r?.id, name: r?.name, email: r?.email, role: r?.role },
      message: `Created ${r?.email}. Give them the password directly and have them change it.`,
    }),
  }),

  simple({
    name: 'update_user',
    title: 'Change a user account',
    description:
      'Changes an account. Admins only, own team only. Setting active to false is how someone is ' +
      'switched off — it also kills every API key and connection they hold, within thirty seconds. ' +
      'Changing role changes what they can see everywhere. You cannot deactivate your own account.',
    annotations: changes,
    schema: {
      id: { type: 'string', description: 'The user id.' },
      name: { type: 'string' },
      email: { type: 'string' },
      password: { type: 'string', description: 'A new password. Omit to leave it alone.' },
      role: { type: 'string', description: 'e.g. "Admin - Marketing". Cannot move someone outside your team.' },
      division: { type: 'string', enum: ['ASTOR', 'CPS', 'TMD', 'All User'] },
      designation: { type: 'string' },
      active: { type: 'boolean', description: 'false switches the account off.' },
    },
    required: ['id'],
    call: (a) => {
      const { id: _id, ...rest } = a;
      const body = given(rest);
      if (!Object.keys(body).length) {
        throw new portal.PortalError(400, 'Nothing to change — pass at least one field besides id.');
      }
      return { method: 'PUT', path: `/users/${id(a.id)}`, body };
    },
    reply: (r, a) => ({
      updated: { id: r?.id || a.id, name: r?.name, role: r?.role, active: r?.active },
      message: `Updated ${a.id}.`,
    }),
  }),

  simple({
    name: 'delete_user',
    title: 'Delete a user account',
    description:
      'Removes the account row entirely. Admins only, own team only, and never your own. This is ' +
      'heavier than it sounds: their tickets and claims remain but no longer resolve to a person. ' +
      'Switching the account off with update_user active:false is almost always what is wanted ' +
      'instead, and it stops their access just as immediately.',
    annotations: destructive,
    schema: { id: { type: 'string', description: 'The user id.' } },
    required: ['id'],
    call: (a) => ({ method: 'DELETE', path: `/users/${id(a.id)}` }),
    reply: (_r, a) => ({
      deleted: a.id,
      message: `Deleted account ${a.id}. Their past work no longer resolves to a name.`,
    }),
  }),
];

module.exports = { tools };
