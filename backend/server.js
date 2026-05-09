require("dotenv").config();
const express = require(
  "express"
);

const cors = require(
  "cors"
);

const http = require(
  "http"
);

const {
  Server,
} = require("socket.io");

require("dotenv").config();


// ROUTES
const ticketRoutes = require(
  "./routes/tickets"
);

const authRoutes = require(
  "./routes/auth"
);

const userRoutes = require(
  "./routes/users"
);


// EXPRESS APP
const app = express();


// HTTP SERVER
const server =
  http.createServer(app);


// SOCKET IO
const io = new Server(server, {
  cors: {
    origin:
      "",

    methods: [
      "GET",
      "POST",
      "PUT",
      "DELETE",
    ],
  },
});


// MIDDLEWARE
app.use(
  cors({
    origin:"",

    credentials: true,
  })
);

app.use(express.json());

app.use(
  "/uploads",
  express.static("uploads")
);


// SOCKET ACCESS
app.use((req, res, next) => {
  req.io = io;

  next();
});


// ROUTES
app.use(
  "/api/tickets",
  ticketRoutes
);

app.use(
  "/api/auth",
  authRoutes
);

app.use(
  "/api/users",
  userRoutes
);


// ROOT
app.get("/", (req, res) => {
  res.send(
    "Ticketing Backend Running"
  );
});


// SOCKET EVENTS
io.on(
  "connection",
  (socket) => {
    console.log(
      "User connected:",
      socket.id
    );

    socket.on(
      "disconnect",
      () => {
        console.log(
          "User disconnected"
        );
      }
    );
  }
);


// PORT
const PORT =
  process.env.PORT || 5000;


// START SERVER
server.listen(PORT, () => {
  console.log(
    `Server running on port ${PORT}`
  );
});