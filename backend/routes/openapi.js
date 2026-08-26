const express = require('express');
const router = express.Router();

// =====================================================
// OpenAPI 3.1 description of the read surface
// =====================================================
// Exists because an agent platform cannot be pointed at an API by URL alone.
// OpenAI's Actions builder, in particular, refuses to save a connection until
// it has parsed a schema — which is why a working API key looked like a broken
// one: nothing was ever sent.
//
// Deliberately read-only. Keys default to read-only and the write routes carry
// approval side effects and realtime emits that an agent should not be firing
// by accident. Describing only what can be read keeps the model from inventing
// a call it would be refused anyway.
//
// Served without authentication on purpose: the builder fetches this URL
// anonymously, and it lists nothing the public frontend bundle does not already
// reveal. No data passes through it.

const SERVER_URL =
  process.env.PUBLIC_API_URL || 'https://ticketing-backend-6azk.onrender.com/api';

const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const num = (description) => ({ type: 'number', description });

const TICKET = {
  type: 'object',
  properties: {
    id: str('Unique ticket id.'),
    title: str('Short summary of the work.'),
    description: str('Full detail, including any closure note appended when the ticket was closed.'),
    category: str('Work type. Marketing and Service teams use different lists.'),
    priority: str('Low, Medium, High or Urgent.'),
    division: str('Business division: ASTOR, CPS, TMD or All User.'),
    status: str('Open, In Progress, Completed, Closed or similar.'),
    team: str('Marketing or Service, derived from who the ticket is assigned to.'),
    assigned_to: str('User id of the assignee.'),
    assigned_to_name: str('Display name of the assignee.'),
    assigned_to_active: { type: 'boolean', description: 'False when the assignee has been disabled.' },
    created_by: str('User id of whoever raised it.'),
    created_by_name: str('Display name of whoever raised it.'),
    due_date: str('Date the work is due.', { format: 'date' }),
    completed_date: str('Date it was completed, if it has been.', { format: 'date' }),
    created_at: str('When it was raised.', { format: 'date-time' }),
    updated_at: str('When it last changed.', { format: 'date-time' }),
    allotted_minutes: num('Time budget set by an admin, in minutes.'),
    consumed_minutes: num('Time logged against it so far, in minutes.'),
    time_spent_minutes: num('Total logged time, in minutes.'),
    given_by: str('Who requested the work, if recorded.'),
    project_id: str('Project this ticket belongs to, if any.'),
    approval_required: { type: 'boolean', description: 'Whether it needs approval before work starts.' },
    approval_status: str('Pending, Approved or Rejected, when approval applies.'),
    is_recurring: { type: 'boolean', description: 'Whether it repeats on a schedule.' },
    time_entries: {
      type: 'array',
      description: 'Individual logged work sessions.',
      items: {
        type: 'object',
        properties: {
          id: str('Entry id.'),
          ticket_id: str('Ticket the entry belongs to.'),
          minutes: num('Minutes logged.'),
          note: str('What was done.'),
          created_at: str('When it was logged.', { format: 'date-time' }),
        },
      },
    },
  },
};

const PROJECT = {
  type: 'object',
  properties: {
    id: str('Unique project id.'),
    name: str('Project name.'),
    description: str('What the project is for.'),
    status: str('Project status.'),
    division: str('Business division: ASTOR, CPS, TMD or All User.'),
    target_date: str('Date the project is meant to finish.', { format: 'date' }),
    owner: str('User id of the project owner.'),
    created_by_name: str('Who created it.'),
    members: { type: 'array', items: str('User id of a member.'), description: 'Everyone on the project.' },
    created_at: str('When it was created.', { format: 'date-time' }),
    stats: {
      type: 'object',
      description: 'Rolled-up task progress.',
      properties: {
        total: num('Number of tasks.'),
        done: num('Tasks completed.'),
        overdue: num('Tasks past their due date and not done.'),
        complete: { type: 'boolean', description: 'True when every task is done.' },
        completed_on: str('Date the last task was finished.', { format: 'date' }),
        days_late: num('Days between the target date and actual completion. Negative means early.'),
        progress: num('Completion as a percentage, 0 to 100.'),
        max_task_due: str('Latest due date across the tasks.', { format: 'date' }),
      },
    },
  },
};

const EXPENSE_CLAIM = {
  type: 'object',
  properties: {
    id: str('Unique claim id.'),
    claim_number: str('Human-readable reference, e.g. EXP-2026-0003.'),
    title: str('What the claim is for.'),
    claimant_id: str('User id of whoever raised it.'),
    claimant_name: str('Display name of the claimant.'),
    team: str('Marketing or Service.'),
    division: str('Business division: ASTOR, CPS, TMD or All User.'),
    currency: str('Currency code, e.g. INR.'),
    total_amount: num('Sum of every line on the claim.'),
    status: str('Draft, Submitted, Partially Approved, Approved or Rejected.'),
    submitted_at: str('When it was sent for approval.', { format: 'date-time' }),
    approved_by_name: str('Who approved it, where the whole claim was approved.'),
    approved_at: str('When it was approved.', { format: 'date-time' }),
    rejection_reason: str('Why it was refused, if it was.'),
    created_at: str('When it was created.', { format: 'date-time' }),
  },
};

const EXPENSE_LINE = {
  type: 'object',
  properties: {
    line_id: str('Unique id of this individual expense line.'),
    claim_id: str('The claim it belongs to.'),
    claim_number: str('Human-readable claim reference.'),
    line_no: num('Position of the line within the claim.'),
    title: str('Title of the parent claim.'),
    claimant_name: str('Who is claiming it.'),
    team: str('Marketing or Service.'),
    division: str('Business division: ASTOR, CPS, TMD or All User.'),
    currency: str('Currency code, e.g. INR.'),
    expense_date: str('Date the money was spent.', { format: 'date' }),
    category: str('Expense category, e.g. Exhibition or Print Collaterals.'),
    description: str('What was bought.'),
    amount: num('Net amount.'),
    tax_amount: num('Tax on top of the net amount.'),
    total: num('amount plus tax_amount.'),
    approval_status: str('Pending, Approved or Rejected. Each line is decided on its own.'),
    approved_by_name: str('Who approved this particular line.'),
    approved_at: str('When this line was approved.', { format: 'date-time' }),
    rejection_reason: str('Why this line was refused, if it was.'),
  },
};

const TOTALS = {
  type: 'object',
  description: 'Money totals, split by how each line was decided.',
  properties: {
    approved: num('Total of approved lines.'),
    pending: num('Total of lines still awaiting a decision.'),
    rejected: num('Total of refused lines.'),
    all: num('Total of every line, whatever its status.'),
  },
};

const USER = {
  type: 'object',
  properties: {
    id: str('Unique user id.'),
    name: str('Display name.'),
    email: str('Work email address.'),
    role: str('Permission role, e.g. Admin - Marketing or Team Member - MKTG.'),
    designation: str('Job title, e.g. General Manager - Marketing.'),
    division: str('Business division: ASTOR, CPS, TMD or All User.'),
    active: { type: 'boolean', description: 'False when the account has been disabled.' },
  },
};

const arrayOf = (schema, description) => ({
  description,
  content: { 'application/json': { schema: { type: 'array', items: schema } } },
});

const objectOf = (schema, description) => ({
  description,
  content: { 'application/json': { schema } },
});

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Sieger Ticketing System',
    description:
      'Read access to the Sieger ticketing, projects and expense system. Every response is ' +
      'already scoped to whatever the calling key is allowed to see: a key acting as a team ' +
      'admin sees that team, a key acting as a team member sees only their own work. There is ' +
      'no way to widen that from here.',
    version: '1.0.0',
  },
  servers: [{ url: SERVER_URL, description: 'Production' }],
  paths: {
    '/tickets': {
      get: {
        operationId: 'listTickets',
        summary: 'List every ticket the key can see',
        description:
          'Returns all visible tickets in one response, ordered by due date, each with its ' +
          'assignee, division, time budget and logged work. Takes no filters — filter the ' +
          'returned list yourself on status, due_date, division, category or assigned_to_name.',
        responses: {
          200: arrayOf(TICKET, 'Every ticket visible to this key.'),
          401: { description: 'The key is missing, unknown, revoked or expired.' },
        },
      },
    },
    '/tickets/{id}': {
      get: {
        operationId: 'getTicket',
        summary: 'Get one ticket by id',
        description: 'Full detail for a single ticket, including its history and logged time.',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The ticket id.' },
        ],
        responses: {
          200: objectOf(TICKET, 'The ticket.'),
          403: { description: 'This key is not allowed to see that ticket.' },
          404: { description: 'No such ticket.' },
        },
      },
    },
    '/projects': {
      get: {
        operationId: 'listProjects',
        summary: 'List projects with their task progress',
        description:
          'Every visible project, each carrying a stats object saying how many tasks are done, ' +
          'how many are overdue, whether it finished, and how many days late it was. Use ' +
          'stats.complete rather than comparing target_date to today — a finished project is ' +
          'not overdue even if it landed after its target.',
        responses: {
          200: arrayOf(PROJECT, 'Every project visible to this key.'),
          401: { description: 'The key is missing, unknown, revoked or expired.' },
        },
      },
    },
    '/projects/{id}': {
      get: {
        operationId: 'getProject',
        summary: 'Get one project and its tasks',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The project id.' },
        ],
        responses: {
          200: objectOf(PROJECT, 'The project, with its tasks.'),
          404: { description: 'No such project.' },
        },
      },
    },
    '/expenses': {
      get: {
        operationId: 'listExpenseClaims',
        summary: 'List expense claims, paged',
        description:
          'Claims are the container; the individual bills are lines inside them. For analysis ' +
          'across many claims use getExpenseReport instead, which returns the lines flattened ' +
          'and already totalled.',
        parameters: [
          {
            name: 'page', in: 'query', required: false,
            schema: { type: 'integer', minimum: 1, default: 1 },
            description: 'Page number, starting at 1.',
          },
          {
            name: 'limit', in: 'query', required: false,
            schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 },
            description: 'Claims per page, up to 100.',
          },
          {
            name: 'status', in: 'query', required: false,
            schema: { type: 'string' },
            description: 'Exact claim status, e.g. Submitted or Approved.',
          },
          {
            name: 'search', in: 'query', required: false,
            schema: { type: 'string' },
            description: 'Free text matched against the claim title and number.',
          },
        ],
        responses: {
          200: objectOf(
            {
              type: 'object',
              properties: {
                claims: { type: 'array', items: EXPENSE_CLAIM },
                total: num('Total claims matching, across all pages.'),
                page: num('The page returned.'),
                limit: num('Page size used.'),
              },
            },
            'A page of claims.'
          ),
          401: { description: 'The key is missing, unknown, revoked or expired.' },
        },
      },
    },
    '/expenses/report': {
      get: {
        operationId: 'getExpenseReport',
        summary: 'Every expense line, flattened, with totals',
        description:
          'The right call for any question about spend. Returns one row per individual bill — ' +
          'not per claim — each carrying its category, division, amount and whether it was ' +
          'approved, plus totals split by approval status. Optionally narrowed to a date range.',
        parameters: [
          {
            name: 'from', in: 'query', required: false,
            schema: { type: 'string', format: 'date' },
            description: 'Only include lines spent on or after this date (YYYY-MM-DD).',
          },
          {
            name: 'to', in: 'query', required: false,
            schema: { type: 'string', format: 'date' },
            description: 'Only include lines spent on or before this date (YYYY-MM-DD).',
          },
        ],
        responses: {
          200: objectOf(
            {
              type: 'object',
              properties: {
                lines: { type: 'array', items: EXPENSE_LINE },
                totals: TOTALS,
              },
            },
            'Flattened expense lines and their totals.'
          ),
          401: { description: 'The key is missing, unknown, revoked or expired.' },
        },
      },
    },
    '/expenses/{id}': {
      get: {
        operationId: 'getExpenseClaim',
        summary: 'Get one claim with all its lines and receipts',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' }, description: 'The claim id.' },
        ],
        responses: {
          200: objectOf(EXPENSE_CLAIM, 'The claim, with its lines and receipts.'),
          403: { description: 'This key is not allowed to see that claim.' },
          404: { description: 'No such claim.' },
        },
      },
    },
    '/users': {
      get: {
        operationId: 'listUsers',
        summary: 'List people, to resolve names and roles',
        description:
          'Requires a key acting as an admin; any other key gets 403. Useful for turning a user ' +
          'id on a ticket into a name, or for asking who is on a team.',
        responses: {
          200: arrayOf(USER, 'Everyone visible to this key.'),
          403: { description: 'This key does not act as an admin.' },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      apiKey: {
        type: 'http',
        scheme: 'bearer',
        description:
          'A key minted in Admin Panel → API Keys. Send it as "Authorization: Bearer stk_…". ' +
          'Read-only keys are refused on anything that is not a GET.',
      },
    },
  },
  security: [{ apiKey: [] }],
};

// Cached at module load: the document never varies by request.
const body = JSON.stringify(spec, null, 2);

router.get('/', (req, res) => {
  res.type('application/json').send(body);
});

module.exports = router;
