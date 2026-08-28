// =====================================================
// MCP server (Streamable HTTP) for ChatGPT and friends
// =====================================================
// One endpoint, POST /mcp, speaking JSON-RPC 2.0. That is the whole of the
// Streamable HTTP transport that a client like ChatGPT actually uses: it posts
// a request, it gets a JSON response. The optional server-initiated SSE stream
// is not offered, because nothing here pushes — every tool is a read that
// answers immediately.
//
// Written by hand rather than on the official SDK on purpose. The protocol
// surface a read-only server needs is five methods, and the SDK's stateless
// transport brings a session layer, an SSE layer and a strict Accept-header
// check that rejects clients this endpoint would otherwise serve fine. Five
// methods of JSON-RPC is less code than the glue would have been.
//
// Authentication is the portal's own API key, and it is the only thing standing
// between this URL and the data, so the key is resolved before any tool runs:
// an unknown key gets a 401 from here rather than a confusing empty result from
// four tools in a row.

const crypto = require('crypto');
const express = require('express');
const router = express.Router();

const { looksLikeApiKey, resolveApiKey } = require('../utils/apiKeys');
const oauth = require('../services/oauth');
const { rateLimit } = require('../utils/rateLimit');
const tools = require('../services/mcpTools');
const { PortalError } = require('../services/portalApi');

// Newest first. A client tells us what it speaks in `initialize`; if we know
// that version we echo it back, otherwise we answer with our newest and let the
// client decide whether it can live with that. Both are what the spec asks for.
const SUPPORTED_PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const LATEST_PROTOCOL = SUPPORTED_PROTOCOLS[0];

const SERVER_INFO = {
  name: 'sieger-ticketing',
  title: 'Sieger Ticketing System',
  version: '1.0.0',
};

// Read once by the model when it connects, so it is the cheapest place to put
// the handful of rules it would otherwise get wrong on its first attempt.
const INSTRUCTIONS = [
  'Read-only access to the Sieger ticketing, projects and expense portal.',
  '',
  'Scope: every result is already limited to what the connected key is allowed to see — a key',
  'acting as a team admin sees that team, one acting as a team member sees only their own work.',
  'No tool here can widen that. If a total looks too small, call whoami before doubting the data.',
  '',
  'Choosing a tool:',
  '- Counting or totalling tickets: ticket_stats, not list_tickets followed by counting.',
  '- Anything about money: expense_report. It reads individual bills and totals them; a claim is',
  '  only an envelope, and lines inside one claim can be approved and rejected separately.',
  '- A project is late, not overdue, once its tasks are all done — read `complete` and `days_late`',
  '  rather than comparing target_date to today.',
  '- Dates are Indian Standard Time. whoami reports today.',
  '',
  'Beyond those: describe_tables lists everything else readable — time entries, notifications,',
  'leave and permission requests, the ABM CRM, LinkedIn and Google Ads analytics — and query_table',
  'reads it. Those rows are scoped the same way, so a refusal there is a real answer, not a fault',
  'to retry.',
  '',
  'Writing: create_ticket, update_ticket, assign_ticket, log_time, approve_ticket, reject_ticket,',
  'create_project and update_project change real records, as the person connected and under their',
  'name. Everything else is a read. Nothing here can delete, approve an expense claim, or touch a',
  'user account. Call whoami to see whether this connection may write at all — if it may not, that',
  'is a setting on the connection, not something to work around.',
].join('\n');

// A tool result that large is unusable in the client anyway, and truncating
// JSON hands the model something it cannot parse. Better to say so and let it
// ask a narrower question.
const MAX_RESULT_CHARS = 100 * 1000;

// ---------------------------------------------------------------
// Transport plumbing
// ---------------------------------------------------------------

const rpcError = (id, code, message, data) => ({
  jsonrpc: '2.0',
  id: id ?? null,
  error: { code, message, ...(data ? { data } : {}) },
});

const rpcResult = (id, result) => ({ jsonrpc: '2.0', id, result });

// This endpoint is bearer-authenticated and reads no cookies, so an origin
// check would protect nothing: a page that does not hold the key gains nothing
// from being allowed to ask, and one that holds it can call from a server,
// where CORS does not apply. Same reasoning as the API-key path in server.js.
const permissiveCors = (req, res, next) => {
  res.set('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key, MCP-Protocol-Version, Mcp-Session-Id');
  res.set('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version');
  res.set('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
};

router.use(permissiveCors);

// Generous, because a single question from the model fans out into several tool
// calls. This is here to stop a runaway loop, not to meter usage.
router.use(rateLimit({ name: 'mcp', windowMs: 60 * 1000, max: 120 }));

// ---------------------------------------------------------------
// Credential
// ---------------------------------------------------------------
// Three ways in, in order of preference:
//
//   Authorization: Bearer stk_…   what every MCP client sends when it is told
//                                 the connector uses an API key
//   X-Api-Key: stk_…              some clients only offer a custom header
//   POST /mcp/k/stk_…             last resort, for a client that can only add
//                                 a URL with no authentication at all
//
// The URL form works but puts a live credential into every proxy log and
// browser history it passes through, so it is worth a short-lived key of its own
// rather than the one used everywhere else.
const credentialFrom = (req) => {
  const header = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (header) return header;

  const custom = String(req.headers['x-api-key'] || '').trim();
  if (custom) return custom;

  const inPath = String(req.params.key || '').trim();
  if (inPath) return inPath;

  const inQuery = String(req.query.key || req.query.api_key || '').trim();
  return inQuery || null;
};

// Resolved up front so a bad credential fails once, loudly, instead of turning
// into four identical tool errors the model then tries to work around.
//
// Every 401 carries the resource_metadata pointer, which is how a client
// discovers it can sign in rather than demanding a pasted key: it reads the
// header, fetches the metadata, finds the authorization server, and starts the
// OAuth flow on its own. RFC 6750 for the shape, the MCP authorization spec for
// the resource_metadata parameter.
// A header value must be ASCII, and these descriptions are written for people —
// the key prompt carries an ellipsis, and a portal error could carry anything.
// Node throws on the non-ASCII byte rather than dropping it, which took the whole
// 401 down with it. The readable form still goes in the JSON body.
const headerSafe = (text) => String(text).replace(/[^\x20-\x7E]/g, '').replace(/"/g, "'");

const unauthorized = (req, res, error, description) => {
  res.set(
    'WWW-Authenticate',
    `Bearer realm="mcp", error="${error}", error_description="${headerSafe(description)}", ` +
      `resource_metadata="${oauth.publicOrigin(req)}/.well-known/oauth-protected-resource"`
  );
  res.status(401).json({ error, message: description });
  return null;
};

// Two kinds of credential reach this endpoint, and they are told apart by shape
// rather than by asking: an API key is a person deciding a machine may act as
// them indefinitely, an OAuth token is a person signing in as themselves. Both
// end up as the same ctx, so nothing downstream has to care which happened.
const authenticate = async (req, res) => {
  const credential = credentialFrom(req);
  if (!credential) {
    return unauthorized(
      req,
      res,
      'missing_token',
      'Sign in, or send a ticketing API key as "Authorization: Bearer stk_…"'
    );
  }

  if (looksLikeApiKey(credential)) {
    let resolved;
    try {
      resolved = await resolveApiKey(credential);
    } catch (err) {
      console.error('MCP AUTH ERROR:', err);
      res.status(500).json({ error: 'auth_failed', message: 'Could not verify the API key' });
      return null;
    }

    if (resolved.error) return unauthorized(req, res, 'invalid_token', resolved.error);

    // Whoever minted the key decided this when they ticked, or did not tick,
    // read-only in the admin panel. middleware/auth.js refuses a read-only key
    // anything that is not a GET regardless, so this only decides whether the
    // write tools are offered at all rather than failing halfway through one.
    return {
      credential,
      user: resolved.user,
      key: resolved.key,
      canWrite: resolved.key.readOnly !== true,
    };
  }

  if (oauth.looksLikeOAuthToken(credential)) {
    let resolved;
    try {
      resolved = await oauth.verifyAccessToken(credential);
    } catch (err) {
      console.error('MCP OAUTH ERROR:', err);
      res.status(500).json({ error: 'auth_failed', message: 'Could not verify the access token' });
      return null;
    }

    if (resolved.error) return unauthorized(req, res, 'invalid_token', resolved.error);

    // The tools read through this app's own routes, which want a session token
    // rather than an OAuth one. This mints a short-lived, read-only session for
    // the person who signed in — so the reads carry their permissions and
    // nothing more. See services/oauth.js.
    // Whether this connection may write was decided by the person on the
    // sign-in page and is carried in the token's scope. The session minted for
    // the portal call matches it, so a read-only connection holds a credential
    // that cannot write even if a write tool were somehow reached.
    return {
      credential: oauth.cachedPortalCredential(resolved.user, { readOnly: !resolved.canWrite }),
      user: resolved.user,
      key: { id: null, name: 'OAuth sign-in', readOnly: !resolved.canWrite },
      canWrite: resolved.canWrite === true,
    };
  }

  return unauthorized(
    req,
    res,
    'invalid_token',
    'That credential is neither a ticketing API key nor an access token from this server'
  );
};

// ---------------------------------------------------------------
// Method dispatch
// ---------------------------------------------------------------

const handleInitialize = (params) => {
  const asked = params?.protocolVersion;
  return {
    protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : LATEST_PROTOCOL,
    // Only tools. No resources, no prompts, nothing that pushes.
    capabilities: { tools: { listChanged: false } },
    serverInfo: SERVER_INFO,
    instructions: INSTRUCTIONS,
  };
};

const callTool = async (params, ctx) => {
  const tool = tools.byName.get(params?.name);
  if (!tool) {
    // A wrong tool name is the model's mistake to recover from, not a transport
    // fault, so it comes back as a tool result it can read and correct.
    return {
      content: [
        {
          type: 'text',
          text: `No tool named "${params?.name}". Available: ${[...tools.byName.keys()].join(', ')}.`,
        },
      ],
      isError: true,
    };
  }

  try {
    const data = await tool.handler(params.arguments || {}, ctx);
    const text = JSON.stringify(data, null, 2);

    if (text.length > MAX_RESULT_CHARS) {
      return {
        content: [
          {
            type: 'text',
            text:
              `That call produced ${Math.round(text.length / 1000)}KB, which is too much to return. ` +
              'Narrow it — add filters, lower limit, or use ticket_stats / expense_report to get ' +
              'the numbers instead of the rows.',
          },
        ],
        isError: true,
      };
    }

    return { content: [{ type: 'text', text }] };
  } catch (err) {
    // A 403 from the portal is a real answer — this key is not allowed to see
    // that — and the model should say so rather than retry. Passing the portal's
    // own message through keeps that distinction intact.
    if (err instanceof PortalError) {
      return {
        content: [{ type: 'text', text: `${err.message} (status ${err.status})` }],
        isError: true,
      };
    }
    console.error(`MCP TOOL ERROR [${params?.name}]:`, err);
    return {
      content: [{ type: 'text', text: `The ${params.name} tool failed: ${err.message}` }],
      isError: true,
    };
  }
};

const dispatch = async (message, ctx) => {
  const { id, method, params } = message;

  switch (method) {
    case 'initialize':
      return rpcResult(id, handleInitialize(params));

    case 'ping':
      return rpcResult(id, {});

    case 'tools/list':
      return rpcResult(id, { tools: tools.listTools() });

    case 'tools/call':
      return rpcResult(id, await callTool(params, ctx));

    // Not advertised in capabilities, so a strict client never asks. Some ask
    // anyway on connect, and an empty list is a quieter answer than an error
    // they will surface to the user as a fault.
    case 'resources/list':
      return rpcResult(id, { resources: [] });
    case 'resources/templates/list':
      return rpcResult(id, { resourceTemplates: [] });
    case 'prompts/list':
      return rpcResult(id, { prompts: [] });

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
};

// ---------------------------------------------------------------
// POST /mcp
// ---------------------------------------------------------------

const handlePost = async (req, res) => {
  const ctx = await authenticate(req, res);
  if (!ctx) return;

  const body = req.body;
  if (!body || typeof body !== 'object') {
    return res.status(400).json(rpcError(null, -32700, 'Parse error: expected a JSON body'));
  }

  // Batching was dropped in the 2025-06-18 spec, but older clients still send
  // arrays and it costs nothing to keep answering them.
  const messages = Array.isArray(body) ? body : [body];
  if (!messages.length) {
    return res.status(400).json(rpcError(null, -32600, 'Invalid request: empty batch'));
  }

  const responses = [];
  for (const message of messages) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      responses.push(rpcError(message?.id, -32600, 'Invalid request'));
      continue;
    }

    // A notification has no id and expects no reply — "notifications/initialized"
    // being the one every client sends right after it connects.
    if (message.id === undefined || message.id === null) continue;

    try {
      responses.push(await dispatch(message, ctx));
    } catch (err) {
      console.error('MCP DISPATCH ERROR:', err);
      responses.push(rpcError(message.id, -32603, 'Internal error'));
    }
  }

  // Nothing but notifications: acknowledged, with no body, as the spec requires.
  if (!responses.length) return res.status(202).end();

  res.set('MCP-Protocol-Version', req.headers['mcp-protocol-version'] || LATEST_PROTOCOL);
  res.json(Array.isArray(body) ? responses : responses[0]);
};

router.post('/', handlePost);

// The URL-embedded key fallback, for a client that can only be handed a plain
// URL. Same handler; credentialFrom picks the key out of the path.
router.post('/k/:key', handlePost);

// ---------------------------------------------------------------
// The older HTTP+SSE transport
// ---------------------------------------------------------------
// Streamable HTTP above is the current transport and what a modern client picks.
// The 2024-11-05 one is still what several clients try first — OpenAI's own
// examples of connecting ChatGPT to an MCP server point at a /sse URL — and a
// connector that fails at the "add" step gives no hint about why. Supporting
// both costs one endpoint pair and removes the guesswork.
//
// The shape of it: the client opens a GET stream, is told over that stream where
// to post, and posts there. Replies come back down the original stream rather
// than as the POST response.

const SESSION_MAX = 100;
const HEARTBEAT_MS = 25 * 1000;
const sessions = new Map(); // sessionId -> { res, ctx, heartbeat }

const closeSession = (sessionId) => {
  const session = sessions.get(sessionId);
  if (!session) return;
  clearInterval(session.heartbeat);
  sessions.delete(sessionId);
};

const openStream = async (req, res) => {
  const ctx = await authenticate(req, res);
  if (!ctx) return;

  // Unguessable, because the POST half of this transport is authorised by
  // holding the session id and nothing else. 122 bits of randomness is what
  // makes that acceptable.
  const sessionId = crypto.randomUUID();

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Render and most reverse proxies buffer a response body by default, which
    // holds the endpoint event back and leaves the client waiting forever.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  // The one message this transport requires: where to send everything else.
  // req.baseUrl is the mount point, so this stays correct if /mcp ever moves.
  res.write(`event: endpoint\ndata: ${req.baseUrl}/messages?sessionId=${sessionId}\n\n`);

  // An idle stream is indistinguishable from a dead one to anything in between,
  // and Render closes what it thinks is dead.
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), HEARTBEAT_MS);
  heartbeat.unref?.();

  if (sessions.size >= SESSION_MAX) {
    const oldest = sessions.keys().next().value;
    if (oldest) {
      sessions.get(oldest)?.res.end();
      closeSession(oldest);
    }
  }
  sessions.set(sessionId, { res, ctx, heartbeat });

  req.on('close', () => closeSession(sessionId));
};

router.get('/sse', openStream);
router.get('/k/:key/sse', openStream);

router.post('/messages', async (req, res) => {
  const sessionId = String(req.query.sessionId || '');
  const session = sessions.get(sessionId);

  // Usually a stream that dropped and a client that has not noticed. Saying so
  // makes it reconnect instead of retrying into nothing.
  if (!session) {
    return res.status(404).json({
      error: 'unknown_session',
      message: 'That session is not open. Reconnect to /sse to get a new one.',
    });
  }

  const messages = Array.isArray(req.body) ? req.body : [req.body];

  // The POST is only an acknowledgement in this transport; the answer goes back
  // down the stream the client is already holding open.
  res.status(202).end();

  for (const message of messages) {
    if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') continue;
    if (message.id === undefined || message.id === null) continue;

    let response;
    try {
      response = await dispatch(message, session.ctx);
    } catch (err) {
      console.error('MCP SSE DISPATCH ERROR:', err);
      response = rpcError(message.id, -32603, 'Internal error');
    }

    // The client may have vanished mid-call; writing to a closed stream throws.
    try {
      session.res.write(`event: message\ndata: ${JSON.stringify(response)}\n\n`);
    } catch {
      closeSession(sessionId);
      return;
    }
  }
});

// ---------------------------------------------------------------
// The rest of the transport
// ---------------------------------------------------------------

// A GET on the Streamable HTTP endpoint asks for a server-initiated stream.
// This server never initiates anything, and the spec's answer for that is 405 —
// clients read it as "post to me instead" and carry on. The SSE transport above
// lives on its own path and is unaffected.
const noStream = (req, res) =>
  res.status(405).json({
    error: 'method_not_allowed',
    message:
      'This endpoint does not push. Send JSON-RPC requests as POST to this same URL, or use ' +
      'the older SSE transport at /mcp/sse.',
  });

router.get('/', noStream);
router.get('/k/:key', noStream);

// Session teardown. There is no session state to tear down — every request is
// resolved from its own key — but answering 204 rather than 404 keeps clients
// that always send it from logging a disconnect error.
const endSession = (req, res) => res.sendStatus(204);
router.delete('/', endSession);
router.delete('/k/:key', endSession);

module.exports = router;
