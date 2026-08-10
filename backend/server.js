require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');

const { TEAM, isAdmin, isSuperAdmin, getUserTeam } = require('./utils/roles');
const { teamRoom, userRoom } = require('./utils/realtime');

// Fail fast rather than booting an app whose auth silently accepts nothing.
for (const key of ['JWT_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[key]) {
    console.error(`FATAL: ${key} is not set. Refusing to start.`);
    process.exit(1);
  }
}

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const projectRoutes = require('./routes/projects');
const abmRoutes = require('./routes/abm');

const app = express();
const server = http.createServer(app);
const leaveRoutes = require("./routes/leaveRoutes");
const permissionRoutes = require("./routes/permissionRoutes");

const timeEntryRoutes =
  require("./routes/timeEntries");
const salesforceRoutes = require("./routes/salesforce");
const googleAdsRoutes  = require("./routes/googleAds");
const linkedinRoutes   = require("./routes/linkedin");

app.use(express.json());

// NOTE: express.text() used to be mounted globally so the Salesforce webhook
// could read its text/plain body. That turned req.body into a String on every
// route, so destructuring silently produced undefined instead of failing. The
// text parser is now scoped to that one route inside routes/salesforce.js.

app.use(express.urlencoded({ extended: true }));

// Allowed origins – add your Vercel frontend URL 
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'https://mktg-ticketing-system.vercel.app',
  'http://localhost:3000', // local development
].filter(Boolean);



const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
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
app.get('/api/test', (req, res) => res.json({ message: 'Backend works' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/abm', abmRoutes);
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
  startRecurrenceScheduler(io);
});