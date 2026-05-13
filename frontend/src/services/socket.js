import { io } from "socket.io-client";

// Use the exact Render backend URL – no environment variable needed for now (hardcode to test)
const SOCKET_URL = "https://ticketing-backend-6azk.onrender.com";

const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: true,
});

export default socket;