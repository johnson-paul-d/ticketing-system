import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Menu, X, LayoutDashboard, Grid, KanbanSquare, Calendar,
  Shield, BarChart3, LogOut, PlusCircle, ChevronRight
} from "lucide-react";
import { useState } from "react";
import useAuthStore from "../store/authStore";
import NotificationBell from "../components/NotificationBell";

export default function MainLayout({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const menuItems = [
    { label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { label: "Tickets", path: "/tickets", icon: Grid },
    ...(user?.role !== "Team Member"
      ? [{ label: "Create Ticket", path: "/create-ticket", icon: PlusCircle }]
      : []),
    { label: "Kanban", path: "/kanban", icon: KanbanSquare },
    { label: "Calendar", path: "/calendar", icon: Calendar },
    { label: "Timeline", path: "/timeline", icon: BarChart3 },
    ...(user?.role === "Admin"
      ? [{ label: "Admin Panel", path: "/admin", icon: Shield }]
      : []),
    { label: "Reports", path: "/reports", icon: BarChart3 },
  ];

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=Inter:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg-deep: #06070a;
          --bg-panel: rgba(14, 16, 22, 0.88);
          --bg-card: rgba(20, 23, 30, 0.72);
          --bg-hover: rgba(255, 255, 255, 0.06);

          --accent: #00b3ff;
          --accent-dim: rgba(0, 179, 255, 0.12);
          --accent-glow: rgba(0, 179, 255, 0.35);

          --gold: #d6a85f;

          --text-1: #f5f7fa;
          --text-2: #a4adbb;
          --text-3: #5d6573;

          --border: rgba(255, 255, 255, 0.08);
          --sidebar-w: 280px;
          --radius: 14px;

          --font-display: 'Sora', sans-serif;
          --font-body: 'Inter', sans-serif;
          --transition: all 240ms cubic-bezier(0.22, 1, 0.36, 1);
        }

        .ml-root {
          display: flex;
          min-height: 100vh;
          background: radial-gradient(circle at top left, rgba(0, 179, 255, 0.08), transparent 30%),
                      radial-gradient(circle at bottom right, rgba(214, 168, 95, 0.06), transparent 25%),
                      linear-gradient(180deg, #06070a 0%, #0b0d12 45%, #11141b 100%);
          font-family: var(--font-body);
          color: var(--text-1);
        }

        /* Overlay */
        .ml-overlay {
          display: none;
          position: fixed; inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          z-index: 40;
          animation: fadeIn 200ms ease;
        }
        .ml-overlay.active { display: block; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }

        /* Sidebar - Glassmorphism + Premium Effects */
        .ml-sidebar {
          position: fixed;
          top: 0; left: 0;
          width: var(--sidebar-w);
          height: 100vh;
          background: rgba(14, 16, 22, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: inset 1px 0 rgba(255, 255, 255, 0.03), 0 0 40px rgba(0, 0, 0, 0.4);
          display: flex;
          flex-direction: column;
          z-index: 50;
          transform: translateX(-100%);
          transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
          overflow: hidden;
        }

        /* Ambient Glow for Sidebar */
        .ml-sidebar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
          pointer-events: none;
        }

        .ml-sidebar::before {
          content: '';
          position: absolute;
          top: -80px; left: -80px;
          width: 260px; height: 260px;
          background: radial-gradient(circle, var(--accent-dim) 0%, transparent 70%);
          pointer-events: none;
        }

        .ml-sidebar.open,
        @media (min-width: 1024px) { .ml-sidebar { transform: translateX(0); position: static; flex-shrink: 0; } }

        @media (min-width: 1024px) {
          .ml-sidebar { transform: translateX(0) !important; position: static; flex-shrink: 0; }
        }
        @media (max-width: 1023px) {
          .ml-sidebar.open { transform: translateX(0); }
        }

        /* Sidebar Header */
        .ml-sidebar-header {
          padding: 28px 24px 20px;
          border-bottom: 1px solid var(--border);
          position: relative;
        }
        .ml-close-btn {
          display: none;
          position: absolute; top: 24px; right: 20px;
          background: var(--bg-hover);
          border: 1px solid var(--border);
          color: var(--text-2);
          border-radius: 8px;
          width: 32px; height: 32px;
          align-items: center; justify-content: center;
          cursor: pointer;
          transition: var(--transition);
        }
        .ml-close-btn:hover { color: var(--text-1); border-color: var(--accent); }
        @media (max-width: 1023px) { .ml-close-btn { display: flex; } }

        .ml-logo-mark {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 4px;
        }
        .ml-logo-icon {
          width: 32px; height: 32px;
          background: var(--accent);
          border-radius: 8px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          box-shadow: 0 0 16px var(--accent-glow);
        }
        .ml-logo-icon svg { width: 16px; height: 16px; color: #fff; }
        .ml-logo-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          color: var(--text-1);
          letter-spacing: -0.3px;
        }
        .ml-logo-sub {
          font-size: 11px;
          color: var(--text-3);
          font-weight: 400;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding-left: 42px;
        }

        /* User Card - Premium Identity Card */
        .ml-user-card {
          margin: 16px 16px 8px;
          padding: 14px 16px;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.04), rgba(255, 255, 255, 0.01));
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        }
        .ml-user-card::after {
          content: '';
          position: absolute; top: 0; left: 0;
          width: 3px; height: 100%;
          background: var(--accent);
          border-radius: 0 2px 2px 0;
        }
        .ml-avatar {
          width: 40px; height: 40px;
          border-radius: 10px;
          background: linear-gradient(135deg, var(--accent) 0%, #004e7c 100%);
          display: grid; place-items: center;
          font-family: var(--font-display);
          font-size: 17px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
          box-shadow: 0 4px 12px var(--accent-glow);
        }
        .ml-user-info { flex: 1; min-width: 0; }
        .ml-user-name {
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 600;
          color: var(--text-1);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .ml-user-role {
          font-size: 11px;
          color: var(--text-2);
          font-weight: 300;
          margin-top: 1px;
        }
        .ml-notif-slot { flex-shrink: 0; }

        /* Nav Section */
        .ml-nav-label {
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--text-3);
          padding: 16px 24px 8px;
        }

        /* Nav Items - Futuristic Control Panel Effect */
        .ml-nav {
          flex: 1;
          overflow-y: auto;
          padding: 0 10px;
          scrollbar-width: none;
        }
        .ml-nav::-webkit-scrollbar { display: none; }

        .ml-nav-item {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 10px 14px;
          border-radius: 10px;
          text-decoration: none;
          color: var(--text-2);
          font-size: 13.5px;
          font-weight: 400;
          transition: var(--transition);
          position: relative;
          margin-bottom: 2px;
        }
        .ml-nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-1);
          transform: translateX(4px);
        }
        .ml-nav-item.active {
          background: linear-gradient(90deg, rgba(0, 179, 255, 0.18), rgba(0, 179, 255, 0.06));
          color: var(--text-1);
          font-weight: 500;
        }
        .ml-nav-item.active::before {
          content: '';
          position: absolute; left: 0; top: 50%; transform: translateY(-50%);
          width: 3px; height: 60%;
          background: var(--accent);
          border-radius: 0 3px 3px 0;
          box-shadow: 0 0 8px var(--accent-glow);
        }
        .ml-nav-icon {
          width: 34px; height: 34px;
          border-radius: 8px;
          display: grid; place-items: center;
          flex-shrink: 0;
          background: var(--bg-hover);
          transition: var(--transition);
        }
        .ml-nav-item.active .ml-nav-icon {
          background: var(--accent);
          box-shadow: 0 4px 12px var(--accent-glow);
          color: #fff;
        }
        .ml-nav-item:hover .ml-nav-icon { background: var(--bg-card); }
        .ml-nav-arrow {
          margin-left: auto;
          opacity: 0;
          transform: translateX(-4px);
          transition: var(--transition);
          color: var(--accent);
        }
        .ml-nav-item:hover .ml-nav-arrow,
        .ml-nav-item.active .ml-nav-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        /* Sidebar Footer */
        .ml-sidebar-footer {
          padding: 16px;
          border-top: 1px solid var(--border);
        }
        .ml-logout-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 13px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-2);
          font-family: var(--font-body);
          font-size: 13.5px;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition);
          letter-spacing: 0.01em;
        }
        .ml-logout-btn:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: #fff;
          box-shadow: 0 4px 16px var(--accent-glow);
        }

        /* Main Content Area */
        .ml-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }

        /* Topbar - Glassmorphism */
        .ml-topbar {
          display: none;
          background: rgba(14, 16, 22, 0.88);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          padding: 0 16px;
          height: 60px;
          align-items: center;
          gap: 12px;
          position: sticky; top: 0; z-index: 30;
        }
        @media (max-width: 1023px) { .ml-topbar { display: flex; } }
        .ml-menu-btn {
          width: 38px; height: 38px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 9px;
          display: grid; place-items: center;
          cursor: pointer;
          color: var(--text-1);
          flex-shrink: 0;
          transition: var(--transition);
        }
        .ml-menu-btn:hover { border-color: var(--accent); }
        .ml-topbar-title {
          font-family: var(--font-display);
          font-size: 16px;
          font-weight: 700;
          color: var(--text-1);
        }
        .ml-topbar-notif { margin-left: auto; }

        /* Page Content with Subtle Grid Texture */
        .ml-content {
          flex: 1;
          padding: 28px 32px;
          overflow-x: hidden;
          background-image: linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
          background-size: 40px 40px;
        }
        @media (max-width: 768px) { .ml-content { padding: 16px; } }
      `}</style>

      <div className="ml-root">
        {/* Mobile overlay */}
        <div className={`ml-overlay ${open ? "active" : ""}`} onClick={() => setOpen(false)} />

        {/* Sidebar */}
        <aside className={`ml-sidebar ${open ? "open" : ""}`}>
          {/* Header */}
          <div className="ml-sidebar-header">
            <div className="ml-logo-mark">
              <div className="ml-logo-icon">
                <Grid />
              </div>
              <span className="ml-logo-title">Sieger Nexus</span>
            </div>
            <p className="ml-logo-sub">Automation Operations Platform</p>
            <button className="ml-close-btn" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>

          {/* User card */}
          <div className="ml-user-card">
            <div className="ml-avatar">{user?.name?.charAt(0)}</div>
            <div className="ml-user-info">
              <div className="ml-user-name">{user?.name}</div>
              <div className="ml-user-role">{user?.role}</div>
            </div>
            <div className="ml-notif-slot">
              <NotificationBell />
            </div>
          </div>

          {/* Nav */}
          <p className="ml-nav-label">Navigation</p>
          <nav className="ml-nav">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setOpen(false)}
                  className={`ml-nav-item ${isActive ? "active" : ""}`}
                >
                  <span className="ml-nav-icon">
                    <Icon size={16} />
                  </span>
                  {item.label}
                  <ChevronRight size={13} className="ml-nav-arrow" />
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div className="ml-sidebar-footer">
            <button className="ml-logout-btn" onClick={handleLogout}>
              <LogOut size={15} />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Main area */}
        <div className="ml-main">
          {/* Mobile topbar */}
          <div className="ml-topbar">
            <button className="ml-menu-btn" onClick={() => setOpen(true)}>
              <Menu size={18} />
            </button>
            <span className="ml-topbar-title">Sieger Nexus</span>
            <div className="ml-topbar-notif">
              <NotificationBell />
            </div>
          </div>

          {/* Page content */}
          <div className="ml-content">{children}</div>
        </div>
      </div>
    </>
  );
}