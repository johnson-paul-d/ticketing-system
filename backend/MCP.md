# MCP server

An MCP endpoint that lets ChatGPT — or Claude, or any other MCP client — read the
ticketing portal directly, instead of being handed exports.

```
POST https://ticketing-backend-6azk.onrender.com/mcp
Authorization: Bearer stk_…
```

It runs inside this same Express app. There is no second service to deploy and
nothing to host: mounting `/mcp` is the whole of it.

## Connecting ChatGPT

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

Read. Nothing else. Every tool is a GET against this app's own API, carrying the
caller's key, so an agent reaches exactly what that key reaches and cannot create,
edit, approve or delete anything.

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
| `search` / `fetch` | Free-text across everything, then pull one record |

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
- **`/mcp` is mounted ahead of the global CORS check** in `server.js`, and is the
  only route that skips it. The reasoning is in the comment there.
- The tool descriptions are written for a model, not a developer. They are the
  only instructions it gets, so the non-obvious rules live in them — that a
  finished project is late rather than overdue, that expense lines are approved
  individually, that `ticket_stats` beats listing tickets to count them.

Files: `routes/mcp.js` (transport), `services/mcpTools.js` (the tools),
`services/portalApi.js` (the authenticated read client).
