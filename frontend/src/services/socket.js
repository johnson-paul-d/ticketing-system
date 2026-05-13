import { io } from "socket.io-client";

const socketUrl = process.env.REACT_APP_SOCKET_URL || 
  (process.env.NODE_ENV === 'production' ? window.location.origin : 'http://localhost:5000');

const socket = io(socketUrl, {
  transports: ["websocket"],
  autoConnect: true,
});

export default socket;