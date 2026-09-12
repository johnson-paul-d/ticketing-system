require('dotenv').config();

// Fail fast rather than booting an app whose auth silently accepts nothing.
// This runs before any local module is loaded: config/supabase.js builds its
// client at require time and throws a bare "supabaseUrl is required" when the
// .env is missing, which is a far less useful message than this one.
//
// The database is one of two things: hosted Supabase, or a self-hosted
// PostgREST (POSTGREST_URL). Either pair is enough; see config/supabase.js.
const selfHostedDb = Boolean(process.env.POSTGREST_URL);
const required = selfHostedDb
  ? ['JWT_SECRET', 'POSTGREST_URL', 'POSTGREST_JWT']
  : ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]) {
    console.error(`FATAL: ${key} is not set. Refusing to start.`);
    console.error('Is backend/.env present? Copy backend/.env.example and fill in the values.');
    process.exit(1);
  }
}

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { TEAM, isAdmin, isSuperAdmin, getUserTeam } = require('./utils/roles');
const { teamRoom, userRoom } = require('./utils/realtime');
const { looksLikeApiKey } = require('./utils/apiKeys');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const projectRoutes = require('./routes/projects');
const abmRoutes = require('./routes/abm');
const expenseRoutes = require('./routes/expenses');
const verifyRoutes = require('./routes/verify');
const apiKeyRoutes = require('./routes/apiKeys');
const openapiRoutes = require('./routes/openapi');
const mcpRoutes = require('./routes/mcp');
const oauthRoutes = require('./routes/oauth');
const workReportRoutes = require('./routes/workReports');

const app = express();
const server = http.createServer(app);
const leaveRoutes = require("./routes/leaveRoutes");
const permissionRoutes = require("./routes/permissionRoutes");

const timeEntryRoutes =
  require("./routes/timeEntries");
const salesforceRoutes = require("./routes/salesforce");
const googleAdsRoutes  = require("./routes/googleAds");
const linkedinRoutes   = require("./routes/linkedin");

// Behind a reverse proxy or a Cloudflare Tunnel every connection arrives from
// localhost. Trusting the first proxy hop makes req.protocol and req.ip read
// the X-Forwarded-* headers the proxy sets, which the OAuth discovery
// documents (publicOrigin) and the rate limiter rely on.
app.set('trust proxy', 1);

app.use(express.json());

// NOTE: express.text() used to be mounted globally so the Salesforce webhook
// could read its text/plain body. That turned req.body into a String on every
// route, so destructuring silently produced undefined instead of failing. The
// text parser is now scoped to that one route inside routes/salesforce.js.

app.use(express.urlencoded({ extended: true }));

// Browser origins allowed to call the API with a session token.
//
// FRONTEND_URL is the primary app address (also used for links in emails).
// ALLOWED_ORIGINS is an optional comma-separated list for the extras a
// migration needs — the old Vercel address and the new Cloudflare one both
// staying live while DNS moves, or a *.pages.dev preview URL.
const extraOrigins = String(process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  ...new Set(
    [
      process.env.FRONTEND_URL && process.env.FRONTEND_URL.replace(/\/+$/, ''),
      ...extraOrigins,
      'https://mktg-ticketing-system.vercel.app',
      'http://localhost:3000', // local development
    ].filter(Boolean)
  ),
];



// An API key request is allowed from anywhere.
//
// CORS exists to stop a hostile page using a victim's *ambient* credentials —
// cookies the browser attaches on its own. This API has none: every caller
// presents a bearer token it had to be given. A page that does not hold the key
// gains nothing from being allowed to ask, and one that does hold it could call
// from a server anyway, where CORS does not apply at all.
//
// The browser sends no Authorization header on a preflight, so the intent has
// to be read from Access-Control-Request-Headers instead.
const carriesApiKey = (req) => {
  const direct = req.headers.authorization || '';
  if (looksLikeApiKey(direct.replace(/^Bearer\s+/i, '').trim())) return true;
  const asked = String(req.headers['access-control-request-headers'] || '');
  return req.method === 'OPTIONS' && /authorization/i.test(asked);
};

// The address this very request was made to. When the server serves the
// frontend itself (single-origin deployment, see the FRONTEND block below) the
// app's own requests carry this as their Origin — a <script type="module"> is
// fetched with one even on the same site — and refusing it would block the
// app from loading its own code. Trusting it is safe by definition: an Origin
// equal to the request's own host is the same-origin case CORS exists to let
// through. Behind the tunnel req.protocol and host come from the forwarded
// headers, courtesy of trust proxy above.
const selfOrigin = (req) => `${req.protocol}://${req.get('host')}`;

const isFirstParty = (req, origin) =>
  !origin || origin === selfOrigin(req) || allowedOrigins.includes(origin);

const corsOptions = (req, callback) => {
  const origin = req.headers.origin;
  const allowed =
    // No origin at all: curl, a server-side script, a mobile app.
    isFirstParty(req, origin) ||
    carriesApiKey(req);

  callback(allowed ? null : new Error('Not allowed by CORS'), {
    origin: allowed ? origin || true : false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    // Only the first-party app relies on cookie-style credentials. Echoing an
    // arbitrary origin with credentials:true is the one combination browsers
    // refuse outright, so it is not claimed for key callers.
    credentials: isFirstParty(req, origin),
  });
};

// =====================================================
// MCP, mounted ahead of the CORS check
// =====================================================
// Deliberately before app.use(cors(...)), and the only route that skips it.
//
// The check above allows a cross-origin request when it carries an API key in
// the Authorization header. An MCP client is normally server-side and sends no
// Origin at all, so it would pass — but the fallback that puts the key in the
// URL carries no Authorization header to recognise, and a browser-based client
// using it would be refused by an origin rule that is not protecting anything
// here. /mcp reads no cookies and every call presents a bearer key, so it sets
// its own permissive headers instead. See routes/mcp.js.
app.use('/mcp', mcpRoutes);

// The OAuth endpoints an MCP client walks through to sign someone in, plus the
// /.well-known documents it reads first. Mounted at the root because discovery
// is defined against the origin, not against a path the app chose, and ahead of
// the CORS check for the same reason as /mcp: these are fetched anonymously,
// carry no data, and are protected by PKCE and a password rather than by origin.
app.use(oauthRoutes);

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    // Socket.IO's cors hook sees only the Origin string, not the request, so
    // the same-origin rule above cannot be applied here. FRONTEND_URL covers
    // the deployed single-origin case; the local port covers checking a
    // production build on this machine.
    origin: [...allowedOrigins, `http://localhost:${process.env.PORT || 5000}`],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

// =====================================================
// SOCKET AUTH + ROOMS
// =====================================================
// Sockets used to connect anonymously and receive a global io.emit of every
// ticket row, which bypassed the team scoping the REST routes enforce. Now the
// handshake requires the same JWT the API uses, and each socket joins only the
// rooms it is entitled to. See utils/realtime.js for the emit side.
io.use((socket, next) => {
  try {
    const raw =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');

    if (!raw) return next(new Error('Authentication required'));

    socket.user = jwt.verify(raw, process.env.JWT_SECRET);
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const user = socket.user;

  socket.join(userRoom(user.id));

  // Only admins get a team feed; everyone else is reached through their own
  // user room when they are assigned to or created the record.
  if (isAdmin(user)) {
    if (isSuperAdmin(user)) {
      socket.join(teamRoom(TEAM.MARKETING));
      socket.join(teamRoom(TEAM.SERVICE));
    } else {
      const team = getUserTeam(user);
      if (team) socket.join(teamRoom(team));
    }
  }
});

app.set('io', io);

// Test route
// Health check, and the one place a deploy can be verified from outside: it
// reports the commit the running process was started from. Read once at
// startup; a missing git (or a copy of the tree that is not a clone) just
// leaves the field out rather than failing the route.
const runningCommit = (() => {
  try {
    return require('child_process')
      // safe.directory=* so a clone owned by another Windows account (git's
      // "dubious ownership" refusal) still answers; this only reads HEAD.
      .execSync('git -c safe.directory=* rev-parse --short HEAD', {
        cwd: __dirname,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      .toString()
      .trim() || undefined;
  } catch {
    return undefined;
  }
})();
const startedAt = new Date().toISOString();

app.get('/api/test', (req, res) =>
  res.json({ message: 'Backend works', commit: runningCommit, started_at: startedAt })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/api-keys', apiKeyRoutes);
// Public by design — an agent platform fetches the schema anonymously, before
// it has any credential to fetch it with. It carries no data.
app.use('/api/openapi.json', openapiRoutes);
app.use('/api/reports', workReportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/abm', abmRoutes);
app.use('/api/expenses', expenseRoutes);
// Public by design — reached from a printed claim by someone who may have no
// account. It confirms a document is genuine and returns nothing else.
app.use('/api/verify', verifyRoutes);
app.use('/api', timeEntryRoutes);
app.use("/api/leave-requests", leaveRoutes);


app.use("/api/salesforce", salesforceRoutes);
app.use("/api/google-ads", googleAdsRoutes);
app.use("/api/linkedin",   linkedinRoutes);

app.use(
  "/api/permission-requests",
  permissionRoutes
);
const { startRecurrenceScheduler } = require('./services/recurrenceScheduler');

// =====================================================
// FRONTEND (single-origin deployment)
// =====================================================
// When the frontend has been built (frontend/dist exists, or STATIC_DIR points
// at a build), this server serves it too, so one port carries the whole app.
// That is what a Cloudflare Tunnel or any single-hostname deployment wants:
// no second host, no CORS between app and API, and the socket on the same
// origin. Build the frontend with VITE_API_URL=/api for this mode.
//
// Skipped entirely when there is no build, so local development with Vite on
// port 3000 and the split Vercel/Render deployment are unaffected.
const path = require('path');
const fs = require('fs');
const STATIC_DIR = path.resolve(
  process.env.STATIC_DIR || path.join(__dirname, '..', 'frontend', 'dist')
);

if (fs.existsSync(path.join(STATIC_DIR, 'index.html'))) {
  app.use(
    express.static(STATIC_DIR, {
      index: false,
      setHeaders: (res, filePath) => {
        // Same rules as vercel.json / public/_headers: the service worker must
        // never be cached or a deploy leaves users on the old build, while
        // hashed assets are immutable by construction.
        if (/[\\/](sw|workbox-[^\\/]+)\.js$/.test(filePath)) {
          res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        } else if (/[\\/]assets[\\/]/.test(filePath)) {
          res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );

  // Everything that is not an API, MCP or OAuth path is a client route: hand
  // it index.html and let React Router pick the page. Only GET and HEAD, so a
  // mistyped POST still gets the JSON 404 below rather than an HTML page.
  const APP_PATH = /^(?!\/api(?:\/|$)|\/mcp(?:\/|$)|\/oauth\/|\/\.well-known\/).*/;
  app.get(APP_PATH, (req, res, next) => {
    if (!req.accepts('html')) return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(path.join(STATIC_DIR, 'index.html'));
  });

  console.log(`Serving frontend from ${STATIC_DIR}`);
}

// =====================================================
// ERROR HANDLING
// =====================================================
// Without this, Express's default handler answers with the full stack trace
// (absolute paths, module layout) whenever NODE_ENV isn't 'production' — which
// it never was here. The CORS rejection above is the easiest way to trigger it.
app.use((req, res) => {
  res.status(404).json({ message: 'Not found' });
});

// eslint-disable-next-line no-unused-vars -- Express identifies the error
// handler by its four-argument signature.
app.use((err, req, res, next) => {
  if (err?.message === 'Not allowed by CORS') {
    return res.status(403).json({ message: 'Origin not allowed' });
  }

  // body-parser reports a malformed or oversized body as a 4xx. Reporting that
  // as a 500 would send the client hunting for a server fault that isn't there.
  const status = err?.status || err?.statusCode;
  if (status >= 400 && status < 500) {
    return res.status(status).json({
      message: err.type === 'entity.too.large' ? 'Request body too large' : 'Malformed request body',
    });
  }

  console.error('UNHANDLED ROUTE ERROR:', err);
  res.status(500).json({ message: 'Server error' });
});

// Log and keep serving rather than dying on a stray rejection; a crash here
// takes every connected socket with it.
process.on('unhandledRejection', (reason) => {
  console.error('UNHANDLED REJECTION:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Which database and file store this process is on, so a cutover can be
  // confirmed from the log rather than by guessing from behaviour.
  console.log(
    selfHostedDb
      ? `Database: self-hosted PostgREST at ${process.env.POSTGREST_URL}`
      : `Database: Supabase at ${process.env.SUPABASE_URL}`
  );
  console.log(`File store: ${(process.env.FILE_STORE || 'drive').toLowerCase()}`);
  startRecurrenceScheduler(io);
});