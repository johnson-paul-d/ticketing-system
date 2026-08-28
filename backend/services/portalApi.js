// =====================================================
// Read client for this app's own public API
// =====================================================
// The MCP server does not touch Supabase. It calls the same HTTP routes a
// browser or a curl caller would, carrying the caller's own API key.
//
// That is the whole security design. There is no RLS in this database, so the
// route handlers are the only thing enforcing who may see what — a team admin
// sees their team, a team member sees their own work. Re-implementing those
// queries here would mean writing that scoping a second time, and the second
// copy is the one that eventually disagrees with the first. Going out through
// the front door means the MCP layer cannot widen access even by accident: an
// agent can reach exactly what the key behind it can reach, and nothing else.

const crypto = require('crypto');

// Loopback by default: the API is in this same process, so there is no reason
// to leave the box. Override when the MCP server is run beside a remote API.
const BASE =
  process.env.MCP_API_BASE ||
  process.env.PUBLIC_API_URL ||
  `http://127.0.0.1:${process.env.PORT || 5000}/api`;

const TIMEOUT_MS = 25 * 1000;

// An error the tool layer can turn into a message for the model rather than a
// stack trace: the status is what tells it whether to give up or ask for a
// different key.
class PortalError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'PortalError';
    this.status = status;
  }
}

// ---------------------------------------------------------------
// Response cache
// ---------------------------------------------------------------
// A model answering one question calls several tools in a row, and most of them
// read the same two lists — /tickets returns every visible ticket with its time
// entries, which is the most expensive call in the app. Without this, "how many
// open tickets per person, and which are overdue" rebuilds that list three
// times in ten seconds.
//
// Twenty seconds is short enough that nothing a person just changed in the UI
// looks stale to the agent for long, and long enough to cover one exchange.
const CACHE_TTL_MS = 20 * 1000;
const CACHE_MAX_ENTRIES = 200;
const cache = new Map(); // `${keyFingerprint}:${path}` -> { expiresAt, body }

// Keyed by digest, never by the key itself: the cache is a Map that shows up in
// a heap dump, and a raw credential should not be sitting in one.
const fingerprint = (credential) =>
  crypto.createHash('sha256').update(String(credential), 'utf8').digest('hex').slice(0, 16);

setInterval(() => {
  const now = Date.now();
  for (const [k, entry] of cache) if (entry.expiresAt < now) cache.delete(k);
}, 60 * 1000).unref();

const clearCache = () => cache.clear();

const buildUrl = (path, query) => {
  const url = new URL(BASE.replace(/\/$/, '') + path);
  for (const [k, v] of Object.entries(query || {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  return url;
};

/**
 * GET a path on the portal API as whoever the credential belongs to.
 *
 * @param {string} credential  raw API key (stk_…) or JWT, exactly as the caller sent it
 * @param {string} path        path below /api, e.g. '/tickets'
 * @param {object} [query]     query string parameters; empty values are dropped
 */
const get = async (credential, path, query) => {
  const url = buildUrl(path, query);
  const cacheKey = `${fingerprint(credential)}:${url.pathname}${url.search}`;

  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.body;

  let res;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // A timeout here is the API being slow, not the key being wrong. Saying so
    // stops the model retrying with a different credential.
    throw new PortalError(
      504,
      err?.name === 'TimeoutError'
        ? `The ticketing API did not answer ${path} within ${TIMEOUT_MS / 1000}s`
        : `Could not reach the ticketing API: ${err?.message || err}`
    );
  }

  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new PortalError(res.status, `The ticketing API returned a non-JSON response for ${path}`);
  }

  if (!res.ok) {
    throw new PortalError(res.status, body?.message || `${path} failed with ${res.status}`);
  }

  if (cache.size >= CACHE_MAX_ENTRIES) {
    // Oldest insertion first — Map preserves it, and an exact LRU is not worth
    // a second structure for a cache this small.
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, body });

  return body;
};

/**
 * POST/PUT/PATCH/DELETE a path on the portal API as whoever the credential
 * belongs to. Never cached, and it empties the read cache on the way out.
 *
 * That last part matters more than it looks: a tool that creates a ticket and a
 * tool that lists them are twenty seconds apart at most, and without this the
 * list would answer from a snapshot taken before the write. The model would then
 * report that its own change had not happened.
 */
const mutate = async (credential, method, path, body) => {
  const url = buildUrl(path);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${credential}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new PortalError(
      504,
      err?.name === 'TimeoutError'
        ? `The ticketing API did not answer ${method} ${path} within ${TIMEOUT_MS / 1000}s`
        : `Could not reach the ticketing API: ${err?.message || err}`
    );
  }

  const text = await res.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    throw new PortalError(res.status, `The ticketing API returned a non-JSON response for ${path}`);
  }

  // Emptied whether or not the write succeeded: a 500 from a route that had
  // already written half of what it meant to would otherwise leave the cache
  // confidently wrong.
  clearCache();

  if (!res.ok) {
    throw new PortalError(res.status, parsed?.message || `${method} ${path} failed with ${res.status}`);
  }

  return parsed;
};

module.exports = { get, mutate, clearCache, PortalError, BASE };
