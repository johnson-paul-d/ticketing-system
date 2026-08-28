# MCP server

An MCP endpoint that lets ChatGPT — or Claude, or any other MCP client — read the
ticketing portal directly, instead of being handed exports.

```
POST https://ticketing-backend-6azk.onrender.com/mcp
Authorization: Bearer <OAuth token, or an stk_ API key>
```

It runs inside this same Express app. There is no second service to deploy and
nothing to host: mounting `/mcp` is the whole of it.

## Connecting ChatGPT

Two ways in. **Signing in is the better one** — the connection then carries the
permissions of whoever signed in, each person gets their own, and nobody has to
handle a credential. Use an API key when there is no person: a scheduled job, a
shared workspace connector, something running unattended.

### Option A — sign in (OAuth)

Add the connector with just the URL and no credential:

```
https://ticketing-backend-6azk.onrender.com/mcp
```

The client reads the 401, discovers the authorization server, registers itself,
and sends the person to a Sieger sign-in page. They enter their normal portal
email and password, and the connector is theirs. Their password never reaches
ChatGPT — it is typed into this app.

Access lasts an hour and renews silently for thirty days. Disabling the account
in the admin panel ends it within thirty seconds.

Nothing needs configuring for this. There is no client to register by hand, no
secret to set, and no new database table — see the notes at the bottom for why.

### Option B — an API key

1. **Mint a key.** Portal → Admin Panel → API Keys → create one. Choose the user
   it should act as, and leave *read-only* ticked. The key is shown once.

   The key is a standing grant of that user's permissions. A key acting as a
   team admin lets ChatGPT see that whole team; a key acting as a team member
   shows only their own work. Pick the narrowest one that answers the questions
   you want to ask, and set an expiry.

2. **Add the connector.** ChatGPT → Settings → Connectors → create a new one.
   Developer mode, under Connectors → Advanced, is what exposes the full tool
   list; without it ChatGPT will only use the connector for search-style
   retrieval.

   - **URL:** `https://ticketing-backend-6azk.onrender.com/mcp`
   - **Authentication:** the API-key / access-token option, with the `stk_…` key
     pasted in. It is sent as `Authorization: Bearer …`, which is what this
     server expects.

3. **If the client only offers "no authentication"**, put the key in the URL
   instead:

   ```
   https://ticketing-backend-6azk.onrender.com/mcp/k/stk_…
   ```

   This works identically, but the key then sits in every proxy log and browser
   history the URL passes through. Mint a separate short-expiry key for it rather
   than reusing one, and revoke it when the connector goes away.

   The key goes in the *path*, not a query string, because ChatGPT flags
   `?api_key=` URLs as unsafe and refuses to save the connector.

4. **If the client refuses the URL above**, it wants the older SSE transport.
   Add `/sse`:

   ```
   https://ticketing-backend-6azk.onrender.com/mcp/sse
   https://ticketing-backend-6azk.onrender.com/mcp/k/stk_…/sse
   ```

   Both transports are served, with the same tools behind them. Modern clients
   should use the plain `/mcp` URL; `/sse` exists because several still open a
   stream first and give no useful error when they cannot.

Revoking the key in the admin panel cuts the connector off within thirty seconds.

## What it can do

22 tools: 14 that read and 8 that write. Every one of them goes through this
app's own API carrying the caller's credential, so a connection reaches exactly
what that person reaches — the same permission checks, the same notification
emails, the same realtime updates, the same timeline entries.

**Writing has to be granted.** An API key writes only if it was minted with
read-only unticked. An OAuth connection writes only if the person was shown the
"it can also make changes" notice on the sign-in page and agreed to it; a client
that asks only for `mcp:read` gets a connection that cannot write at all. Where
it was not granted, the write tools refuse before calling anything, and
`middleware/auth.js` refuses the underlying request anyway.

**Three things no connection can do, at any permission level:** delete anything,
approve an expense claim, or manage user accounts. There is no tool for them.
Deleting a ticket destroys a record of someone's work with no undo; an expense
approval is money, and is signed into an `approval_hash` tied to the receipt
files. Both remain in the web app for exactly the people who could always do them.

| Tool | For |
| --- | --- |
| `whoami` | Who the connection acts as, and therefore what it can see |
| `list_tickets` | Tickets, filtered by status, assignee, division, team, category, priority, due date or free text |
| `ticket_stats` | Counts and minutes grouped by person, status, division, category, priority, team or month |
| `get_ticket` | One ticket in full, with its logged work sessions |
| `list_projects` | Projects with rolled-up task progress |
| `get_project` | One project and its tasks |
| `expense_report` | Spend, per individual bill, totalled and grouped |
| `list_expense_claims` | Claims, for finding one or seeing where approval is stuck |
| `get_expense_claim` | One claim with each bill's own decision |
| `list_users` | People, to resolve names and teams (admin keys only) |
| `describe_tables` | What else is readable, and why anything is not |
| `query_table` | Read any of those tables directly — filters, sort, paging |
| `search` / `fetch` | Free-text across everything, then pull one record |
| `create_ticket` · `update_ticket` · `assign_ticket` | Raise and change work |
| `log_time` | Record time against a ticket |
| `approve_ticket` · `reject_ticket` | Clear or refuse work waiting on approval |
| `create_project` · `update_project` | Manage projects |

`query_table` covers the rest of the database: time entries, notifications, leave
and permission requests, the ABM CRM, and the LinkedIn and Google Ads analytics —
21 tables in all.

**Rows are scoped exactly as the app scopes them.** A team member sees their own
tickets and their own time entries; an admin sees their team's; a Service admin
is refused the ABM CRM the same way the web app refuses it. Nobody gets more
through MCP than they get signed in.

Three things are unreachable at any level, because this endpoint exists to hand
data to a third-party AI client: `users.password`, `api_keys` (the hashes are the
lookup value for every live key), and `linkedin_tokens` (live LinkedIn API
credentials). They have no entry in the registry and cannot be named.

`search` and `fetch` exist under exactly those names because ChatGPT's deep
research mode will not accept a connector without them.

Filtering and totalling happen server-side on purpose. `GET /api/tickets` returns
every visible ticket with its full description and every work session — handing
that to a model wastes its context and often overflows the tool-result limit. The
list tools return trimmed rows and say how many matches they left out;
`ticket_stats` and `expense_report` return the arithmetic rather than the rows.

## Configuration

Nothing is required. Two optional variables:

| Variable | Default | Why change it |
| --- | --- | --- |
| `MCP_API_BASE` | `http://127.0.0.1:$PORT/api` | Point the tools at a different API instance. The default keeps the call on the loopback, since the API is in this same process. |
| `FRONTEND_URL` | the Vercel app | Deep links in tool results (`/tickets/123`) are built from it. |

## Notes for anyone changing this

- **Authorization is not re-implemented here.** There is no RLS in this database,
  so the route handlers are the only thing enforcing who sees what. The MCP tools
  call those routes over HTTP rather than querying Supabase, which means the
  scoping cannot drift out of sync or be widened by accident. Keep it that way:
  a tool that reaches for `supabase` directly is a bug.
- **Adding a write tool means re-reading that boundary.** Read-only keys are
  refused anything that is not a GET, and the write routes carry approval side
  effects and realtime emits that an agent should not fire by accident.
- **`/mcp` and the OAuth routes are mounted ahead of the global CORS check** in
  `server.js`, and are the only routes that skip it. The reasoning is in the
  comment there.
- **OAuth stores nothing.** There is no DDL access to this database, so a design
  needing tables would ship as a migration somebody has to remember to run.
  Instead the `client_id` *is* the registration — a signed token carrying the
  redirect URIs — and tokens are signed rather than stored. The only state is a
  Map of authorization codes that live sixty seconds. A redeploy therefore does
  not invalidate anyone's connector.
- **The OAuth signing keys are derived from `JWT_SECRET`, not equal to it.**
  `middleware/auth.js` verifies a `JWT_SECRET` token and trusts it as a full
  session, so an access token signed with that same secret would also be a
  session valid on every write route in the app. `services/oauth.js` derives four
  separate keys, and a token signed for one job fails verification for any other.
  There is a test for this; keep it.
- **An OAuth connection borrows a two-minute session.** The tools call this app's
  own routes, which want a login-style token, so `portalCredentialFor` mints one
  for the signed-in person — marked `read_only` unless write was granted.
  `middleware/auth.js` enforces that flag. Remove the enforcement and the flag
  becomes a label on a token that can write.
- **Write tools live in `services/mcpWrites.js`, and declare themselves.**
  `tools/list` reports `annotations.readOnlyHint`, which is what a client reads to
  decide whether to confirm a call with the person first — a write tool that
  failed to declare it would be run silently. Reads get `readOnlyHint: true` by
  default in `listTools`, so only write tools set annotations explicitly.
- **Adding a delete or an expense-approval tool is a decision, not a gap.** Both
  were left out on purpose; the reasoning is at the top of `mcpWrites.js`.
- The tool descriptions are written for a model, not a developer. They are the
  only instructions it gets, so the non-obvious rules live in them — that a
  finished project is late rather than overdue, that expense lines are approved
  individually, that `ticket_stats` beats listing tickets to count them.

- **A table with no entry in `services/mcpTables.js` is not readable.** Adding a
  table to the database must not silently publish it, so the registry is an
  allow-list rather than a deny-list. Each entry declares its scope one of two
  ways: `source: 'route'` takes its rows from an API route that already scopes
  them, so nothing can drift; `source: 'table'` writes the rule out, and each one
  names the route it was copied from. Prefer `'route'` when a route exists.

Files: `routes/mcp.js` (transport), `services/mcpTools.js` (the tools),
`services/mcpTables.js` (the table registry and its scoping),
`services/portalApi.js` (the authenticated read client),
`services/oauth.js` + `routes/oauth.js` (sign-in).
