import { create } from "zustand";

const storedUser = JSON.parse(
  localStorage.getItem("user")
);

const useAuthStore = create((set) => ({
  user: storedUser || null,

  login: (user) => {
    localStorage.setItem(
      "user",
      JSON.stringify(user)
    );

    set({
      user,
    });
  },

  logout: () => {
    localStorage.removeItem("user");

    set({
      user: null,
    });
  },
}));

export default useAuthStore;