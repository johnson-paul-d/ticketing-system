import { io } from "socket.io-client";

const PROD_SOCKET_URL = 'https://ticketing-backend-6azk.onrender.com';
const DEV_SOCKET_URL = 'http://localhost:5000';

const socket = io(process.env.NODE_ENV === 'production' ? PROD_SOCKET_URL : DEV_SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: true,
});

export default socket;