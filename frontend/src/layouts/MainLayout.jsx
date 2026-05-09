import { Link, useNavigate } from "react-router-dom";

import useAuthStore from "../store/authStore";

export default function MainLayout({
  children,
}) {
  const navigate = useNavigate();

  const user = useAuthStore(
    (state) => state.user
  );

  const logout = useAuthStore(
    (state) => state.logout
  );

  const handleLogout = () => {
    logout();

    navigate("/");
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      {/* SIDEBAR */}
      <div className="w-64 bg-black text-white p-6 flex flex-col justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-10">
            Ticket System
          </h1>

          {/* USER INFO */}
          <div className="mb-8 bg-white/10 p-4 rounded-xl">
            <p className="font-semibold">
              {user?.name}
            </p>

            <p className="text-sm text-gray-400">
              {user?.role}
            </p>
          </div>

          {/* MENU */}
          <div className="space-y-4">
            <Link
              to="/dashboard"
              className="block hover:bg-white/10 p-3 rounded-xl"
            >
              Dashboard
            </Link>

            <Link
              to="/tickets"
              className="block hover:bg-white/10 p-3 rounded-xl"
            >
              Tickets
            </Link>

            {/* CREATE TICKET */}
            {user?.role !==
              "Team Member" && (
              <Link
                to="/create-ticket"
                className="block hover:bg-white/10 p-3 rounded-xl"
              >
                Create Ticket
              </Link>
            )}

            {/* KANBAN */}
            <Link
              to="/kanban"
              className="block hover:bg-white/10 p-3 rounded-xl"
            >
              Kanban
            </Link>

            {/* ADMIN ONLY */}
            {user?.role === "Admin" && (
              <Link
                to="/admin"
                className="block hover:bg-white/10 p-3 rounded-xl"
              >
                Admin Panel
              </Link>
            )}

            <Link
              to="/reports"
              className="block hover:bg-white/10 p-3 rounded-xl"
            >
              Reports
            </Link>
          </div>
        </div>

        {/* LOGOUT */}
        <button
          onClick={handleLogout}
          className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-xl w-full"
        >
          Logout
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 p-8">
        {children}
      </div>
    </div>
  );
}