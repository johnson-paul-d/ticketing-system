const jwt = require('jsonwebtoken');
const { looksLikeApiKey, resolveApiKey } = require('../utils/apiKeys');

// Two kinds of caller reach this API: a person with a 7-day JWT from
// /api/auth/login, and a machine with a long-lived API key. Both arrive in the
// same Authorization header, and both come out the other side as req.user, so
// every route downstream stays unaware of the difference.
//
// req.apiKey is set only for the second kind. Nothing reads it for
// authorization — the key's user carries that — but it is what makes a machine
// caller identifiable when you are looking at what happened and why.
module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'No token provided' });

  const credential = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!credential) return res.status(401).json({ message: 'No token provided' });

  if (looksLikeApiKey(credential)) {
    try {
      const resolved = await resolveApiKey(credential);
      if (resolved.error) {
        return res.status(resolved.status || 401).json({ message: resolved.error });
      }

      // The narrowest scope worth having. Every mutating route in this app is
      // POST/PUT/PATCH/DELETE, so refusing those is a real boundary rather than
      // a label — and it is refused here, before any route can act on it.
      if (resolved.key.readOnly && req.method !== 'GET' && req.method !== 'OPTIONS') {
        return res.status(403).json({
          message: `API key "${resolved.key.name}" is read-only and cannot ${req.method} anything`,
        });
      }

      req.user = resolved.user;
      req.apiKey = resolved.key;
      return next();
    } catch (err) {
      console.error('API KEY AUTH ERROR:', err);
      return res.status(500).json({ message: 'Could not verify API key' });
    }
  }

  try {
    const payload = jwt.verify(credential, process.env.JWT_SECRET);

    // A read-only session, which today means a token the OAuth layer minted so
    // an MCP read can call these same routes as the signed-in person without
    // carrying their ability to change anything. Enforced here, before any route
    // can act on it — otherwise read_only would be a label on a token that in
    // fact works everywhere. See services/oauth.js, portalCredentialFor.
    if (payload.read_only === true && req.method !== 'GET' && req.method !== 'OPTIONS') {
      return res.status(403).json({
        message: `This session is read-only and cannot ${req.method} anything`,
      });
    }

    req.user = payload;
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};
