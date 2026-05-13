import axios from 'axios';

// Hardcode production backend URL – remove after env vars are fixed
const PROD_API_URL = 'https://ticketing-backend-6azk.onrender.com/api';
const DEV_API_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? PROD_API_URL : DEV_API_URL
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;