import { io } from "socket.io-client";

const socket = io(
  "https://ticketing-backend-6azk.onrender.com",
  {
    transports: ["websocket"],
  }
);

export default socket;