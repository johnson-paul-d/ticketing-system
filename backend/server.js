require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const ticketRoutes = require('./routes/tickets');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');

const app = express();
const server = http.createServer(app);
const leaveRoutes = require("./routes/leaveRoutes");
const permissionRoutes = require("./routes/permissionRoutes");

const timeEntryRoutes =
  require("./routes/timeEntries");
const salesforceRoutes = require("./routes/salesforce");
const googleAdsRoutes = require("./routes/googleAdsDashboard");

app.use(express.json());

app.use(express.text());

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
// ❌ REMOVED the line: app.options('*', cors(corsOptions));
// The cors() middleware already handles OPTIONS preflight requests.

app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  },
});

app.set('io', io);

// Test route
app.get('/api/test', (req, res) => res.json({ message: 'Backend works' }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api', timeEntryRoutes);
app.use("/api/leave-requests", leaveRoutes);


app.use("/api/salesforce", salesforceRoutes);
app.use("/api/google-ads", googleAdsRoutes);

app.use(
  "/api/permission-requests",
  permissionRoutes
);
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));