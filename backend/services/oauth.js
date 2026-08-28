// =====================================================
// OAuth 2.1 for the MCP endpoint
// =====================================================
// ChatGPT and Claude will both connect to an MCP server with an API key, but
// only if a person pastes one in. OAuth is what lets someone add the connector
// and sign in as themselves — which also means the connection carries their own
// permissions rather than whoever's key was handed round.
//
// Two constraints shaped this.
//
// There is no DDL access to this database, so a design needing new tables would
// ship as a migration someone has to remember to run before anything works. So
// nothing here is stored: registered clients, authorization codes and tokens are
// all self-contained and signed. The only state is a Map of codes, which live
// sixty seconds and are meant to be lost on restart anyway.
//
// And the app already signs JWTs with JWT_SECRET, which middleware/auth.js
// verifies and trusts as a full session. If OAuth tokens were signed with that
// same secret, every one of them would also be a portal session valid on every
// write route in the app. So the keys below are derived from it and are not
// interchangeable: a token signed for one purpose fails verification for any
// other.

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

// ---------------------------------------------------------------
// Key separation
// ---------------------------------------------------------------
// One secret in the environment, four keys that cannot verify each other's
// tokens. A leaked or confused token is then useless outside the one job it was
// signed for — most importantly, an OAuth access token is not a session.
const deriveKey = (label) =>
  crypto.createHmac('sha256', String(process.env.JWT_SECRET)).update(`mcp-oauth:${label}`).digest('hex');

const KEYS = {
  client: deriveKey('client-registration'),
  request: deriveKey('authorization-request'),
  access: deriveKey('access-token'),
  refresh: deriveKey('refresh-token'),
};

const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const CODE_TTL_MS = 60 * 1000;
const REQUEST_TTL_SECONDS = 10 * 60;

// Two scopes, because writing is a different thing to consent to than reading.
// A connection that can only read is the default everywhere: if a client asks
// for nothing, or an old token predates this and carries no scope at all, it
// gets read. Writing has to be asked for and shown on the sign-in page.
const SCOPE = 'mcp:read';
const WRITE_SCOPE = 'mcp:write';
const SCOPES_SUPPORTED = [SCOPE, WRITE_SCOPE];

const grants = (scope, wanted) => String(scope || '').split(/\s+/).includes(wanted);
const canWriteWith = (scope) => grants(scope, WRITE_SCOPE);

// ---------------------------------------------------------------
// Client registration, without a client table
// ---------------------------------------------------------------
// Dynamic registration exists because a client like ChatGPT has nobody to ask
// for credentials — it registers itself the moment someone adds the connector.
// Rather than storing what it sends, the registration *is* the client_id: a
// signed token carrying the redirect URIs. Verifying it later proves those URIs
// are the ones registered, which is the only thing the store was ever for.
//
// The upshot is that a redeploy does not invalidate anyone's connector, which a
// table in memory would, and there is no unbounded table of clients that were
// registered once by a probe and never used.
const registerClient = ({ redirect_uris: redirectUris, client_name: clientName }) => {
  if (!Array.isArray(redirectUris) || !redirectUris.length) {
    return { error: 'invalid_redirect_uri', message: 'redirect_uris is required' };
  }
  if (redirectUris.length > 10) {
    return { error: 'invalid_redirect_uri', message: 'Too many redirect_uris' };
  }

  for (const uri of redirectUris) {
    if (typeof uri !== 'string') {
      return { error: 'invalid_redirect_uri', message: 'Each redirect_uri must be a string' };
    }
    let parsed;
    try {
      parsed = new URL(uri);
    } catch {
      return { error: 'invalid_redirect_uri', message: `Not a valid URL: ${uri}` };
    }
    // http is allowed only on loopback, which is how a desktop client or the MCP
    // Inspector receives its redirect. Anywhere else it would put the code on
    // the wire in clear.
    const isLoopback = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
      return {
        error: 'invalid_redirect_uri',
        message: `redirect_uri must be https, or http on loopback: ${uri}`,
      };
    }
  }

  const clientId = jwt.sign(
    { redirect_uris: redirectUris, client_name: String(clientName || 'MCP client').slice(0, 120) },
    KEYS.client,
    { noTimestamp: false }
  );

  return { client_id: clientId, redirect_uris: redirectUris, client_name: clientName };
};

const verifyClient = (clientId) => {
  try {
    return jwt.verify(String(clientId), KEYS.client);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------
// The authorization request, carried through the login form
// ---------------------------------------------------------------
// Between rendering the sign-in page and the person submitting it, the OAuth
// parameters have to survive a round trip through the browser. Signing them into
// one token and posting that back means the form cannot be edited into
// redirecting the code somewhere else — the alternative, hidden fields read back
// at face value, would let exactly that.
// Strips exp/iat because a failed sign-in re-signs the request it just verified,
// and jsonwebtoken refuses expiresIn on a payload that already carries an exp.
// Without this every wrong password threw instead of re-rendering the form.
const signRequest = ({ exp, iat, ...payload }) =>
  jwt.sign(payload, KEYS.request, { expiresIn: REQUEST_TTL_SECONDS });

const verifyRequest = (token) => {
  try {
    return jwt.verify(String(token), KEYS.request);
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------
// Authorization codes
// ---------------------------------------------------------------
// The one piece of state, and the only one that suits being state: a code is
// valid for sixty seconds, may be redeemed once, and losing the lot on restart
// costs a person one retry of a sign-in they are already in the middle of.
const codes = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes) if (entry.expiresAt < now) codes.delete(code);
}, 30 * 1000).unref();

const issueCode = (grant) => {
  const code = crypto.randomBytes(32).toString('base64url');
  codes.set(code, { ...grant, expiresAt: Date.now() + CODE_TTL_MS });
  return code;
};

// Single use, enforced by deleting on read. A code replayed by anyone who
// intercepted it finds nothing.
const redeemCode = (code) => {
  const entry = codes.get(String(code));
  if (!entry) return null;
  codes.delete(String(code));
  if (entry.expiresAt < Date.now()) return null;
  return entry;
};

const verifyPkce = (verifier, challenge) => {
  if (typeof verifier !== 'string' || verifier.length < 43 || verifier.length > 128) return false;
  const computed = crypto.createHash('sha256').update(verifier).digest('base64url');
  // Both are base64url of a 32-byte digest, so lengths match and timingSafeEqual
  // will not throw.
  const a = Buffer.from(computed);
  const b = Buffer.from(String(challenge));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// ---------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------
// `aud` is the MCP endpoint itself. The MCP spec asks for it because a token
// minted for this server should be useless if it is replayed against a
// different one that happens to trust the same issuer.
const issueTokens = ({ user, clientId, resource, scope }) => {
  const claims = { sub: user.id, email: user.email, name: user.name, role: user.role };
  // The refresh token carries the scope too, so renewing cannot quietly widen
  // what was granted — and a refresh token issued before scopes existed renews
  // as read-only rather than picking up write it was never consented to.
  const granted = canWriteWith(scope) ? `${SCOPE} ${WRITE_SCOPE}` : SCOPE;

  return {
    access_token: jwt.sign({ ...claims, typ: 'mcp_at', scope: granted, aud: resource, cid: clientId }, KEYS.access, {
      expiresIn: ACCESS_TTL_SECONDS,
    }),
    refresh_token: jwt.sign({ sub: user.id, typ: 'mcp_rt', scope: granted, aud: resource, cid: clientId }, KEYS.refresh, {
      expiresIn: REFRESH_TTL_SECONDS,
    }),
    token_type: 'Bearer',
    expires_in: ACCESS_TTL_SECONDS,
    scope: granted,
  };
};

// ---------------------------------------------------------------
// User lookup
// ---------------------------------------------------------------
// A token is good for an hour, so the account behind it has to be re-checked
// rather than trusted from the claims — otherwise disabling someone leaves their
// connector working until the token happens to expire. Cached for the same
// thirty seconds, and for the same reason, as the API key cache.
const USER_CACHE_TTL_MS = 30 * 1000;
const userCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of userCache) if (entry.expiresAt < now) userCache.delete(id);
}, 60 * 1000).unref();

const loadUser = async (id) => {
  const cached = userCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.user;

  const { data, error } = await supabase
    .from('users')
    .select('id, name, email, role, active')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;

  userCache.set(id, { expiresAt: Date.now() + USER_CACHE_TTL_MS, user: data || null });
  return data || null;
};

/**
 * Resolves an OAuth access token to the user it was issued for.
 * Returns { user } or { error, status } with a reason meant for the caller.
 */
const verifyAccessToken = async (token) => {
  let claims;
  try {
    claims = jwt.verify(String(token), KEYS.access);
  } catch (err) {
    return {
      error: err?.name === 'TokenExpiredError' ? 'The access token has expired' : 'Invalid access token',
      status: 401,
    };
  }

  if (claims.typ !== 'mcp_at') return { error: 'Invalid access token', status: 401 };

  const user = await loadUser(claims.sub);
  if (!user) return { error: 'The account behind this token no longer exists', status: 401 };
  if (!user.active) return { error: 'The account behind this token is disabled', status: 401 };

  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    scope: claims.scope,
    canWrite: canWriteWith(claims.scope),
  };
};

const verifyRefreshToken = (token) => {
  try {
    const claims = jwt.verify(String(token), KEYS.refresh);
    return claims.typ === 'mcp_rt' ? claims : null;
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------
// The credential used to call the portal's own API
// ---------------------------------------------------------------
// The MCP tools read through this app's public routes, which want the kind of
// token /api/auth/login issues. This mints one for the signed-in user, valid for
// two minutes and marked read-only, so the loopback call carries exactly the
// permissions the person has and none of the ability to change anything.
//
// read_only is enforced in middleware/auth.js. Without that it would be a label,
// and this function would be handing out full write capability to satisfy a
// read.
const portalCredentialFor = (user, { readOnly = true } = {}) =>
  jwt.sign(
    // read_only is omitted rather than set false for a write session, so the
    // flag only ever appears when it is doing something. middleware/auth.js
    // enforces it wherever it appears.
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      // Marks the session as belonging to a machine acting for this person
      // rather than the person at a keyboard. routes/apiKeys.js already refuses
      // to let an API key mint another API key — "minting is a thing a person
      // does" — and this is what lets it apply the same rule here. Without it an
      // MCP client could issue itself a credential that outlives the connection
      // it was granted through.
      agent: true,
      ...(readOnly ? { read_only: true } : {}),
    },
    process.env.JWT_SECRET,
    { expiresIn: '2m' }
  );

// Cached so that a run of tool calls reuses one token rather than minting a new
// string every time — portalApi caches its reads per credential, and a fresh
// credential per request would miss that cache on every single call.
const PORTAL_CREDENTIAL_TTL_MS = 90 * 1000;
const credentialCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of credentialCache) if (entry.expiresAt < now) credentialCache.delete(id);
}, 60 * 1000).unref();

const cachedPortalCredential = (user, { readOnly = true } = {}) => {
  // Keyed by mode as well as person: handing a read-only connection a cached
  // write credential because someone else signed in with write would undo the
  // whole point of the flag.
  const key = `${user.id}:${readOnly ? 'r' : 'rw'}`;
  const hit = credentialCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.token;

  const token = portalCredentialFor(user, { readOnly });
  credentialCache.set(key, { expiresAt: Date.now() + PORTAL_CREDENTIAL_TTL_MS, token });
  return token;
};

// Distinguishes an OAuth token from an stk_ API key without trying to verify it.
const looksLikeOAuthToken = (value) => typeof value === 'string' && value.split('.').length === 3;

// Behind Render's proxy the socket is plain http and the host header is the
// internal one, so the public origin has to come from the forwarded headers.
// Trusting them is safe here: they only build URLs handed back to the caller,
// and a forged one would mislead nobody but the caller that forged it.
const publicOrigin = (req) => {
  if (process.env.PUBLIC_BACKEND_URL) return process.env.PUBLIC_BACKEND_URL.replace(/\/$/, '');
  const proto =
    String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
};

const resourceUrl = (req) => `${publicOrigin(req)}/mcp`;

module.exports = {
  SCOPE,
  WRITE_SCOPE,
  SCOPES_SUPPORTED,
  canWriteWith,
  ACCESS_TTL_SECONDS,
  publicOrigin,
  resourceUrl,
  cachedPortalCredential,
  registerClient,
  verifyClient,
  signRequest,
  verifyRequest,
  issueCode,
  redeemCode,
  verifyPkce,
  issueTokens,
  verifyAccessToken,
  verifyRefreshToken,
  portalCredentialFor,
  looksLikeOAuthToken,
};
