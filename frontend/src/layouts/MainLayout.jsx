import { Link, useNavigate } from "react-router-dom";
import { Menu, X, LayoutDashboard, Ticket, KanbanSquare, Calendar, Shield, BarChart3, LogOut, PlusCircle } from "lucide-react";
import { useState } from "react";
import useAuthStore from "../store/authStore";
import NotificationBell from "../components/NotificationBell";

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const menuItems = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Tickets", path: "/tickets", icon: Ticket },
    ...(user?.role !== "Team Member" ? [{ label: "Create Ticket", path: "/create-ticket", icon: PlusCircle }] : []),
    { label: "Kanban", path: "/kanban", icon: KanbanSquare },
    { label: "Calendar", path: "/calendar", icon: Calendar },
    ...(user?.role === "Admin" ? [{ label: "Admin Panel", path: "/admin", icon: Shield }] : []),
    { label: "Reports", path: "/reports", icon: BarChart3 },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {open && <div onClick={() => setOpen(false)} className="fixed inset-0 bg-black/50 z-40 lg:hidden" />}
      <div className={`fixed lg:static z-50 top-0 left-0 h-full w-72 bg-black text-white transition-transform duration-300 flex flex-col justify-between p-5 ${open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div>
          <div className="flex items-center justify-between mb-8">
            <div><h1 className="text-3xl font-bold">Ticket System</h1><p className="text-gray-400 text-sm">Team Management Portal</p></div>
            <button onClick={() => setOpen(false)} className="lg:hidden"><X /></button>
          </div>
          <div className="bg-white/10 rounded-2xl p-4 mb-8 flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-600 flex items-center justify-center font-bold text-xl">{user?.name?.charAt(0)}</div>
            <div className="flex-1"><h2 className="font-semibold text-lg leading-tight">{user?.name}</h2><p className="text-gray-400 text-sm">{user?.role}</p></div>
            <NotificationBell />
          </div>
          <div className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.path} to={item.path} onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-red-600 transition">
                  <Icon size={20} /><span>{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
        <button onClick={handleLogout} className="bg-red-600 hover:bg-red-700 transition rounded-2xl py-4 flex items-center justify-center gap-2 font-semibold">
          <LogOut size={18} /> Logout
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="lg:hidden bg-white shadow-sm p-4 flex items-center gap-4 sticky top-0 z-30">
          <button onClick={() => setOpen(true)}><Menu /></button>
          <h1 className="font-bold text-lg">Ticket System</h1>
          <div className="ml-auto"><NotificationBell /></div>
        </div>
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </div>
    </div>
  );
}