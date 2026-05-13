import { io } from "socket.io-client";

// Get the backend URL from environment, or derive from current window location in production
const getSocketUrl = () => {
  if (process.env.REACT_APP_SOCKET_URL) {
    return process.env.REACT_APP_SOCKET_URL;
  }
  // In production (Vercel), use the same host as API but without /api
  if (process.env.NODE_ENV === 'production') {
    const apiUrl = process.env.REACT_APP_API_URL || '';
    // Remove trailing /api to get base URL
    return apiUrl.replace(/\/api$/, '');
  }
  return 'http://localhost:5000';
};

const socket = io(getSocketUrl(), {
  transports: ["websocket"],
  autoConnect: true,
});

export default socket;