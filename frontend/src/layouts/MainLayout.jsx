import {
  Link,
  useLocation,
  useNavigate,
} from "react-router-dom";

import {
  LayoutDashboard,
  Ticket,
  PlusCircle,
  KanbanSquare,
  CalendarDays,
  ShieldCheck,
  BarChart3,
  LogOut,
} from "lucide-react";

import useAuthStore from "../store/authStore";

export default function MainLayout({
  children,
}) {

  const navigate =
    useNavigate();

  const location =
    useLocation();

  const user =
    useAuthStore(
      (state) => state.user
    );

  const logout =
    useAuthStore(
      (state) => state.logout
    );

  const handleLogout =
    () => {

      logout();

      navigate("/");
    };

  const menuItems = [

    {
      name: "Dashboard",
      icon: LayoutDashboard,
      path: "/dashboard",
    },

    {
      name: "Tickets",
      icon: Ticket,
      path: "/tickets",
    },

    ...(user?.role !==
    "Team Member"
      ? [
          {
            name: "Create Ticket",
            icon: PlusCircle,
            path: "/create-ticket",
          },
        ]
      : []),

    {
      name: "Kanban",
      icon: KanbanSquare,
      path: "/kanban",
    },

    {
      name: "Calendar",
      icon: CalendarDays,
      path: "/calendar",
    },

    ...(user?.role ===
    "Admin"
      ? [
          {
            name: "Admin Panel",
            icon: ShieldCheck,
            path: "/admin",
          },
        ]
      : []),

    {
      name: "Reports",
      icon: BarChart3,
      path: "/reports",
    },
  ];

  return (

    <div className="flex min-h-screen bg-gray-100">

      {/* SIDEBAR */}
      <div className="w-72 bg-black text-white flex flex-col justify-between p-6 shadow-2xl">

        <div>

          {/* LOGO */}
          <div className="mb-10">

            <h1 className="text-3xl font-extrabold tracking-tight">
              Ticket System
            </h1>

            <p className="text-gray-400 text-sm mt-1">
              Team Management Portal
            </p>

          </div>

          {/* USER CARD */}
          <div className="mb-8 bg-gradient-to-r from-zinc-900 to-zinc-800 border border-white/10 rounded-2xl p-5 shadow-lg">

            <div className="flex items-center gap-4">

              <div className="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-xl font-bold uppercase">

                {user?.name
                  ?.charAt(0)}

              </div>

              <div>

                <p className="font-semibold text-lg">
                  {user?.name}
                </p>

                <p className="text-gray-400 text-sm">
                  {user?.role}
                </p>

              </div>

            </div>

          </div>

          {/* MENU */}
          <div className="space-y-2">

            {menuItems.map(
              (item) => {

                const Icon =
                  item.icon;

                const isActive =
                  location.pathname ===
                  item.path;

                return (

                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-4 px-4 py-3 rounded-2xl transition-all duration-200 group
                      
                      ${
                        isActive
                          ? "bg-red-600 text-white shadow-lg"
                          : "hover:bg-white/10 text-gray-300"
                      }
                    `}
                  >

                    <Icon
                      size={20}
                      className={`${
                        isActive
                          ? "text-white"
                          : "text-gray-400 group-hover:text-white"
                      }`}
                    />

                    <span className="font-medium">
                      {item.name}
                    </span>

                  </Link>
                );
              }
            )}

          </div>

        </div>

        {/* LOGOUT */}
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-3 bg-red-600 hover:bg-red-700 transition-all duration-200 text-white py-4 rounded-2xl font-semibold shadow-lg"
        >

          <LogOut size={20} />

          Logout

        </button>

      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 overflow-auto">

        <div className="p-8">

          {children}

        </div>

      </div>

    </div>
  );
}