import { io } from "socket.io-client";

const PROD_SOCKET_URL = 'https://ticketing-backend-6azk.onrender.com';
const DEV_SOCKET_URL = 'http://localhost:5000';

const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ||
  (import.meta.env.PROD ? PROD_SOCKET_URL : DEV_SOCKET_URL);

// The server rejects any handshake without a JWT, so the socket stays closed
// until a token exists instead of connecting anonymously at import time.
const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: false,
});

let activeToken = null;

export function connectSocket() {
  const token = localStorage.getItem("token");
  if (!token) return socket;
  if (socket.connected && activeToken === token) return socket;
  // A live connection carries the token it handshook with, so a different token
  // means tearing the old one down first.
  if (socket.connected) socket.disconnect();
  activeToken = token;
  // Assigned on the instance rather than passed to io() so every reconnect
  // attempt sends the token that is current at that moment.
  socket.auth = { token };
  socket.connect();
  return socket;
}

export function disconnectSocket() {
  activeToken = null;
  socket.auth = {};
  socket.disconnect();
  return socket;
}

socket.on("connect_error", (err) => {
  // socket.active is false when the server itself refused the handshake (missing
  // or invalid token). Retrying that would spin, so stay closed until the next
  // connectSocket() call supplies a fresh token.
  if (!socket.active) {
    activeToken = null;
    socket.disconnect();
    console.warn("Socket connection refused:", err.message);
  }
});

// A page refresh never runs login(), so re-establish from the stored token.
if (localStorage.getItem("token")) connectSocket();

export default socket;
