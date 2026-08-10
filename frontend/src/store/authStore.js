import { create } from "zustand";
import { connectSocket, disconnectSocket } from "../services/socket";

const useAuthStore = create((set) => ({
  user: JSON.parse(localStorage.getItem("user")) || null,

  login: (user, token) => {
    localStorage.setItem("user", JSON.stringify(user));
    localStorage.setItem("token", token);
    // The JWT travels in the socket handshake, so the connection has to be
    // (re)opened here to pick up the token that was just stored.
    connectSocket();
    set({ user });
  },

  logout: () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    // Without this the socket stays open on a shared machine and the next user
    // keeps receiving the previous session's events.
    disconnectSocket();
    set({ user: null });
  },
}));

export default useAuthStore;