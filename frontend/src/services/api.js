import axios from 'axios';
import { disconnectSocket } from './socket';

const api = axios.create({
  // Default to the page's own origin: the backend serves this frontend in
  // production, so /api is right there. Development sets VITE_API_URL
  // explicitly (see .claude/launch.json and .env.example).
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Parallel requests can all 401 at once; only the first one should tear down.
let sessionExpired = false;

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const isPublic = error.config?.url?.includes('/linkedin/status') ||
                       error.config?.url?.includes('/auth/');
      if (!isPublic && !sessionExpired) {
        sessionExpired = true;
        // `user` has to go too: authStore hydrates from it and ProtectedRoute
        // gates on it, so leaving it behind renders a logged-in shell with no
        // token and every request 401s in a loop.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        disconnectSocket();
        window.location.href = '/';
      }
    }
    return Promise.reject(error);
  }
);

export default api;