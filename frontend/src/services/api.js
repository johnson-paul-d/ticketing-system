import axios from "axios";

const api = axios.create({
  baseURL:
    "https://ticketing-backend-6azk.onrender.com",
});

export default api;