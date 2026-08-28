// =====================================================
// OAuth 2.1 endpoints + discovery
// =====================================================
// The routes an MCP client walks through when someone adds the connector and
// picks "sign in" instead of pasting a key:
//
//   /.well-known/oauth-protected-resource   what this resource is, and who
//                                           issues tokens for it
//   /.well-known/oauth-authorization-server  where to register, authorize, and
//                                           exchange
//   POST /oauth/register                    the client registers itself
//   GET  /oauth/authorize                   the person signs in
//   POST /oauth/token                       the client swaps the code
//
// The metadata documents are served without authentication, because they are
// fetched before the client holds anything to authenticate with. They carry no
// data — only URLs of this same app.

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const supabase = require('../config/supabase');
const oauth = require('../services/oauth');
const { rateLimit } = require('../utils/rateLimit');

const { publicOrigin, resourceUrl } = oauth;

// Discovery documents are public and fetched from anywhere, including by a
// browser-based client. Same reasoning as /mcp: nothing here is protected by
// origin, so an origin rule would only break honest callers.
router.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// =====================================================
// DISCOVERY
// =====================================================

const authServerMetadata = (req) => {
  const origin = publicOrigin(req);
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    scopes_supported: oauth.SCOPES_SUPPORTED,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    // PKCE is not optional here. Every client of this server is public — there
    // is no secret to issue one — so the proof key is the only thing binding the
    // code to whoever asked for it.
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  };
};

const protectedResourceMetadata = (req) => ({
  resource: resourceUrl(req),
  authorization_servers: [publicOrigin(req)],
  scopes_supported: oauth.SCOPES_SUPPORTED,
  bearer_methods_supported: ['header'],
});

// Clients differ on whether they append the resource path to the well-known
// URL. Both spellings answer, rather than one of them 404ing into an "auth is
// not supported" conclusion.
for (const path of [
  '/.well-known/oauth-authorization-server',
  '/.well-known/oauth-authorization-server/mcp',
  '/.well-known/openid-configuration',
]) {
  router.get(path, (req, res) => res.json(authServerMetadata(req)));
}

for (const path of [
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
]) {
  router.get(path, (req, res) => res.json(protectedResourceMetadata(req)));
}

// =====================================================
// DYNAMIC CLIENT REGISTRATION
// =====================================================
// Open registration, which sounds worse than it is: registering gets you a
// client_id and nothing else. It grants no access. Access still requires a
// person to sign in at /oauth/authorize with their own credentials, and the
// token that follows carries their permissions.
//
// Rate-limited anyway, so a loop cannot be used to generate work.
router.post(
  '/oauth/register',
  rateLimit({ name: 'oauth-register', windowMs: 60 * 60 * 1000, max: 60 }),
  (req, res) => {
    const result = oauth.registerClient(req.body || {});
    if (result.error) {
      return res.status(400).json({ error: result.error, error_description: result.message });
    }

    res.status(201).json({
      client_id: result.client_id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: result.redirect_uris,
      client_name: result.client_name,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      scope: oauth.SCOPES_SUPPORTED.join(' '),
    });
  }
);

// =====================================================
// AUTHORIZE
// =====================================================

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

// Anything reaching this page came off a query string, so all of it is escaped
// on the way in. The client name in particular is whatever the client called
// itself at registration.
const loginPage = ({ clientName, requestToken, error, email, canWrite }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sign in · Sieger Ticketing</title>
<style>
  :root { --red:#9B2423; --cream:#F3ECE0; --ink:#111; }
  * { box-sizing:border-box; }
  body {
    margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
    background:var(--cream); color:var(--ink); padding:24px;
    font-family:'Poppins','Segoe UI',system-ui,-apple-system,sans-serif;
  }
  .card { width:100%; max-width:400px; background:#fff; border:1px solid rgba(0,0,0,.08);
          border-radius:14px; padding:32px; box-shadow:0 12px 32px rgba(0,0,0,.07); }
  h1 { margin:0 0 4px; font-size:20px; letter-spacing:-.01em; }
  .sub { margin:0 0 24px; font-size:14px; color:#5b5b5b; line-height:1.5; }
  .sub strong { color:var(--ink); }
  label { display:block; font-size:13px; font-weight:600; margin:0 0 6px; }
  input { width:100%; padding:11px 12px; margin:0 0 16px; font-size:15px; font-family:inherit;
          border:1px solid #d8d2c8; border-radius:8px; background:#fff; }
  input:focus { outline:2px solid var(--red); outline-offset:-1px; border-color:var(--red); }
  button { width:100%; padding:12px; font-size:15px; font-weight:600; font-family:inherit;
           color:#fff; background:var(--red); border:0; border-radius:8px; cursor:pointer; }
  button:hover { background:#821d1c; }
  .error { background:#fdecec; border:1px solid #f5c2c2; color:#8a1f1f; font-size:13px;
           padding:10px 12px; border-radius:8px; margin:0 0 16px; }
  .note { margin:20px 0 0; font-size:12px; color:#6b6b6b; line-height:1.5; text-align:center; }
  .warn { background:#fbf3e6; border:1px solid #e8d5ae; color:#6b4e13; font-size:13px;
          padding:11px 12px; border-radius:8px; margin:0 0 18px; line-height:1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>Sieger Ticketing</h1>
    <p class="sub"><strong>${escapeHtml(clientName)}</strong> is asking to read your tickets,
      projects and expenses. It will see exactly what you see${canWrite ? '' : ', and cannot change anything'}.</p>
    ${
      canWrite
        ? `<div class="warn"><strong>It can also make changes.</strong> Raising tickets, editing them,
             logging time and approving work — all as you, and all recorded under your name. It cannot
             delete anything, and it cannot approve expense claims.</div>`
        : ''
    }
    ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
    <form method="post" action="/oauth/authorize" autocomplete="on">
      <input type="hidden" name="request" value="${escapeHtml(requestToken)}">
      <label for="email">Work email</label>
      <input id="email" name="email" type="email" required autocomplete="username"
             value="${escapeHtml(email || '')}">
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required autocomplete="current-password">
      <button type="submit">Sign in and allow</button>
    </form>
    <p class="note">Your password is never shared with the app you are connecting.</p>
  </div>
</body>
</html>`;

const errorPage = (title, detail) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
         background:#F3ECE0; color:#111; padding:24px;
         font-family:'Poppins','Segoe UI',system-ui,-apple-system,sans-serif; }
  .card { max-width:440px; background:#fff; border-radius:14px; padding:32px;
          border:1px solid rgba(0,0,0,.08); }
  h1 { margin:0 0 8px; font-size:19px; color:#9B2423; }
  p { margin:0; font-size:14px; line-height:1.6; color:#444; }
</style></head>
<body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p></div></body></html>`;

// Reads and checks everything the client sent. Returns either a rendered
// failure, a redirect-back failure, or a validated request.
//
// Which of the two failure kinds applies is the important part: if the client_id
// or redirect_uri is wrong, the redirect target cannot be trusted, so the error
// has to be shown to the person instead of sent onward. That rule is what stops
// this endpoint being used as an open redirect.
const readAuthorizeParams = (req) => {
  const q = req.method === 'POST' ? req.body : req.query;

  const client = oauth.verifyClient(q.client_id);
  if (!client) {
    return { render: ['Unknown application', 'That client is not registered with this server. Remove the connector and add it again.'] };
  }

  const redirectUri = String(q.redirect_uri || '');
  if (!client.redirect_uris.includes(redirectUri)) {
    return { render: ['Redirect address not recognised', 'The address this application asked to be sent back to is not one it registered. Nothing has been shared.'] };
  }

  const state = q.state ? String(q.state) : '';
  const fail = (error, description) => ({ redirect: { redirectUri, error, description, state } });

  if (String(q.response_type || '') !== 'code') {
    return fail('unsupported_response_type', 'Only the authorization code flow is supported');
  }
  if (String(q.code_challenge_method || '') !== 'S256') {
    return fail('invalid_request', 'code_challenge_method must be S256');
  }
  const codeChallenge = String(q.code_challenge || '');
  if (!codeChallenge) {
    return fail('invalid_request', 'code_challenge is required');
  }

  // A client that names its scopes gets exactly those. One that names none —
  // which is most of them — gets both, and the sign-in page then says plainly
  // that writing is included. The consent is what the person is shown and
  // agrees to, not a parameter they never see.
  const requested = String(q.scope || '').trim();
  if (requested && !requested.split(/\s+/).every((x) => oauth.SCOPES_SUPPORTED.includes(x))) {
    return fail('invalid_scope', `Scopes offered: ${oauth.SCOPES_SUPPORTED.join(', ')}`);
  }
  const scope = requested || oauth.SCOPES_SUPPORTED.join(' ');

  return {
    ok: {
      clientId: String(q.client_id),
      clientName: client.client_name,
      redirectUri,
      codeChallenge,
      state,
      scope,
      resource: String(q.resource || '') || null,
    },
  };
};

const redirectWithError = (res, { redirectUri, error, description, state }) => {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) url.searchParams.set('state', state);
  res.redirect(302, url.toString());
};

router.get('/oauth/authorize', (req, res) => {
  const parsed = readAuthorizeParams(req);
  if (parsed.render) return res.status(400).send(errorPage(...parsed.render));
  if (parsed.redirect) return redirectWithError(res, parsed.redirect);

  const { clientName, ...rest } = parsed.ok;
  res.type('html').send(
    loginPage({
      clientName,
      canWrite: oauth.canWriteWith(rest.scope),
      requestToken: oauth.signRequest({ ...rest, clientName }),
    })
  );
});

router.post(
  '/oauth/authorize',
  // The same limit the portal's own login carries, for the same reason: this is
  // a password prompt, and it is reachable by anyone who can register a client.
  rateLimit({ name: 'oauth-login', windowMs: 15 * 60 * 1000, max: 20 }),
  async (req, res) => {
    // The request came back signed, so the parameters are the ones this server
    // approved a moment ago rather than whatever the form was edited to say.
    const request = oauth.verifyRequest(req.body?.request);
    if (!request) {
      return res
        .status(400)
        .send(errorPage('Sign-in expired', 'That sign-in page went stale. Start the connection again from the app.'));
    }

    const email = String(req.body?.email || '').trim();
    const password = String(req.body?.password || '');

    const retry = (message) =>
      res.status(401).type('html').send(
        loginPage({
          clientName: request.clientName,
          canWrite: oauth.canWriteWith(request.scope),
          requestToken: oauth.signRequest(request),
          error: message,
          email,
        })
      );

    if (!email || !password) return retry('Enter your email and password.');

    let user;
    try {
      const { data, error } = await supabase.from('users').select('*').eq('email', email).limit(1);
      if (error) throw error;
      user = data?.[0];
    } catch (err) {
      console.error('OAUTH LOGIN ERROR:', err);
      return res.status(500).send(errorPage('Something went wrong', 'Could not check those details. Try again shortly.'));
    }

    // Every failure below says the same thing, so this page cannot be used to
    // find out which addresses have accounts. The one exception is a disabled
    // account, where a person needs to know why their own password "stopped
    // working" — and knowing it is disabled tells an outsider nothing they could
    // not learn by having it refused anyway.
    if (!user || !user.password) return retry('Those details were not recognised.');
    if (!user.active) return retry('That account is disabled.');

    const valid = await bcrypt.compare(password.trim(), String(user.password).trim());
    if (!valid) return retry('Those details were not recognised.');

    const code = oauth.issueCode({
      userId: user.id,
      clientId: request.clientId,
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
      scope: request.scope,
      resource: request.resource,
    });

    const url = new URL(request.redirectUri);
    url.searchParams.set('code', code);
    if (request.state) url.searchParams.set('state', request.state);
    res.redirect(302, url.toString());
  }
);

// =====================================================
// TOKEN
// =====================================================

router.post(
  '/oauth/token',
  rateLimit({ name: 'oauth-token', windowMs: 60 * 1000, max: 60 }),
  async (req, res) => {
    // A token response must never be cached — it is a credential in a body.
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');

    const fail = (error, description, status = 400) =>
      res.status(status).json({ error, error_description: description });

    const grantType = String(req.body?.grant_type || '');

    if (grantType === 'authorization_code') {
      const grant = oauth.redeemCode(req.body?.code);
      if (!grant) return fail('invalid_grant', 'That code is unknown, already used, or expired');

      // The code was issued to one client, for one redirect address. Both are
      // checked so a code intercepted in a redirect cannot be spent by anyone
      // else.
      if (grant.clientId !== String(req.body?.client_id || '')) {
        return fail('invalid_grant', 'That code was issued to a different client');
      }
      if (req.body?.redirect_uri && grant.redirectUri !== String(req.body.redirect_uri)) {
        return fail('invalid_grant', 'redirect_uri does not match the one used to get this code');
      }
      if (!oauth.verifyPkce(req.body?.code_verifier, grant.codeChallenge)) {
        return fail('invalid_grant', 'code_verifier does not match the code_challenge');
      }

      let user;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, role, active')
          .eq('id', grant.userId)
          .maybeSingle();
        if (error) throw error;
        user = data;
      } catch (err) {
        console.error('OAUTH TOKEN ERROR:', err);
        return fail('server_error', 'Could not issue a token', 500);
      }

      if (!user || !user.active) return fail('invalid_grant', 'That account is no longer active');

      return res.json(
        oauth.issueTokens({
          user,
          clientId: grant.clientId,
          scope: grant.scope,
          resource: grant.resource || resourceUrl(req),
        })
      );
    }

    if (grantType === 'refresh_token') {
      const claims = oauth.verifyRefreshToken(req.body?.refresh_token);
      if (!claims) return fail('invalid_grant', 'That refresh token is invalid or expired');
      if (req.body?.client_id && claims.cid !== String(req.body.client_id)) {
        return fail('invalid_grant', 'That refresh token belongs to a different client');
      }

      let user;
      try {
        const { data, error } = await supabase
          .from('users')
          .select('id, name, email, role, active')
          .eq('id', claims.sub)
          .maybeSingle();
        if (error) throw error;
        user = data;
      } catch (err) {
        console.error('OAUTH REFRESH ERROR:', err);
        return fail('server_error', 'Could not refresh the token', 500);
      }

      // The refresh token outlives any single access token, so this is the check
      // that actually ends a disabled person's connection.
      if (!user || !user.active) return fail('invalid_grant', 'That account is no longer active');

      return res.json(
        oauth.issueTokens({
          user,
          clientId: claims.cid,
          // Whatever was granted originally, never more. A refresh token issued
          // before scopes existed carries none and renews as read-only.
          scope: claims.scope,
          resource: claims.aud || resourceUrl(req),
        })
      );
    }

    return fail('unsupported_grant_type', `grant_type must be authorization_code or refresh_token`);
  }
);

module.exports = router;
