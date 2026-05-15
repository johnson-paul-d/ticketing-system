import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  Menu, X, LayoutDashboard, Cpu, KanbanSquare, Calendar,
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
    { label: "Tickets", path: "/tickets", icon: Cpu },
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
        /* ----- GLOBAL RESET & VARIABLES (Sieger Identity) ----- */
        *,
        *::before,
        *::after {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }

        :root {
          --bg-deep: #050505;
          --bg-panel: rgba(14, 14, 14, 0.82);
          --bg-card: rgba(24, 24, 24, 0.72);
          --bg-hover: rgba(255, 255, 255, 0.05);

          --accent: #9b2423;
          --accent-soft: rgba(155, 36, 35, 0.18);
          --accent-glow: rgba(155, 36, 35, 0.35);
          --accent-border: rgba(155, 36, 35, 0.5);

          --cream: #f3ece0;

          --text-1: #f5f5f5;
          --text-2: #b7b7b7;
          --text-3: #6a6a6a;

          --border: rgba(255, 255, 255, 0.08);
          --border-gold: rgba(243, 236, 224, 0.2);

          --sidebar-w: 280px;
          --radius-sm: 8px;
          --radius-md: 12px;
          --radius-lg: 16px;
          --transition-smooth: all 240ms cubic-bezier(0.22, 1, 0.36, 1);
          --shadow-elevation: 0 8px 32px rgba(0, 0, 0, 0.4);
          --shadow-glow: 0 0 12px var(--accent-glow);
        }

        /* ----- TYPOGRAPHY (Effra alternatives) ----- */
        @import url('https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300;14..32,400;14..32,500;14..32,600;14..32,700&family=Sora:wght@400;500;600;700&display=swap');

        /* ----- SCROLLBAR (premium industrial) ----- */
        ::-webkit-scrollbar {
          width: 5px;
          height: 5px;
        }
        ::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb {
          background: var(--accent-soft);
          border-radius: 10px;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--accent);
        }

        /* ----- MAIN LAYOUT ----- */
        .ml-root {
          display: flex;
          min-height: 100vh;
          background: radial-gradient(circle at 20% 30%, rgba(155, 36, 35, 0.08), transparent 40%),
                      radial-gradient(circle at 80% 70%, rgba(243, 236, 224, 0.03), transparent 50%),
                      linear-gradient(145deg, #050505 0%, #0a0a0a 45%, #0f0f12 100%);
          font-family: 'Inter', sans-serif;
          color: var(--text-1);
          position: relative;
        }

        /* ----- OVERLAY (mobile) ----- */
        .ml-overlay {
          display: none;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.75);
          backdrop-filter: blur(8px);
          z-index: 40;
          transition: var(--transition-smooth);
        }
        .ml-overlay.active {
          display: block;
          animation: fadeIn 200ms ease;
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        /* ----- SIDEBAR (glass + metallic + premium) ----- */
        .ml-sidebar {
          position: fixed;
          top: 0;
          left: 0;
          width: var(--sidebar-w);
          height: 100vh;
          background: rgba(12, 12, 16, 0.88);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-right: 1px solid var(--border);
          box-shadow: inset 1px 0 rgba(255, 255, 255, 0.02), var(--shadow-elevation);
          display: flex;
          flex-direction: column;
          z-index: 50;
          transform: translateX(-100%);
          transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
          overflow-y: auto;
          overflow-x: hidden;
        }
        /* Ambient red glow + metallic overlay */
        .ml-sidebar::before {
          content: '';
          position: absolute;
          top: -20%;
          left: -20%;
          width: 140%;
          height: 140%;
          background: radial-gradient(circle, var(--accent-soft) 0%, transparent 70%);
          pointer-events: none;
          opacity: 0.4;
        }
        .ml-sidebar::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.02) 0%, transparent 50%);
          pointer-events: none;
        }

        .ml-sidebar.open {
          transform: translateX(0);
        }
        @media (min-width: 1024px) {
          .ml-sidebar {
            transform: translateX(0);
            position: sticky;
            top: 0;
            flex-shrink: 0;
            height: 100vh;
          }
        }

        /* ----- SIDEBAR HEADER (Logo Area - Sieger OPS) ----- */
        .ml-sidebar-header {
          padding: 28px 24px 24px;
          border-bottom: 1px solid var(--border);
          position: relative;
          z-index: 2;
        }
        .ml-close-btn {
          display: none;
          position: absolute;
          top: 24px;
          right: 20px;
          background: var(--bg-hover);
          border: 1px solid var(--border);
          color: var(--text-2);
          border-radius: var(--radius-sm);
          width: 34px;
          height: 34px;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .ml-close-btn:hover {
          color: var(--text-1);
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        @media (max-width: 1023px) {
          .ml-close-btn {
            display: flex;
          }
        }

        .ml-logo-mark {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 8px;
        }
        .ml-logo-icon {
          width: 40px;
          height: 40px;
          background: var(--accent);
          border-radius: 10px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          box-shadow: 0 0 16px var(--accent-glow);
          transition: var(--transition-smooth);
        }
        .ml-logo-icon svg {
          width: 20px;
          height: 20px;
          color: var(--cream);
        }
        .ml-logo-title {
          font-family: 'Sora', sans-serif;
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          background: linear-gradient(135deg, #fff 60%, var(--cream) 100%);
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }
        .ml-logo-sub {
          font-size: 0.7rem;
          font-weight: 400;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--text-3);
          padding-left: 52px;
          margin-top: -4px;
        }

        /* ----- USER CARD (Executive Identity Panel) ----- */
        .ml-user-card {
          margin: 20px 16px 16px;
          padding: 14px 16px;
          background: linear-gradient(135deg, rgba(24, 24, 28, 0.9), rgba(16, 16, 20, 0.7));
          backdrop-filter: blur(12px);
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          gap: 12px;
          position: relative;
          overflow: hidden;
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.3);
          transition: var(--transition-smooth);
        }
        .ml-user-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: radial-gradient(circle at 0% 20%, var(--accent-soft), transparent 70%);
          opacity: 0.3;
          pointer-events: none;
        }
        .ml-user-card::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 3px;
          height: 100%;
          background: var(--accent);
          box-shadow: var(--shadow-glow);
        }
        .ml-avatar {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          background: linear-gradient(145deg, var(--accent) 0%, #6b1a19 100%);
          display: grid;
          place-items: center;
          font-family: 'Sora', sans-serif;
          font-size: 1.2rem;
          font-weight: 700;
          color: var(--cream);
          flex-shrink: 0;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          transition: var(--transition-smooth);
        }
        .ml-user-info {
          flex: 1;
          min-width: 0;
        }
        .ml-user-name {
          font-family: 'Sora', sans-serif;
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--text-1);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ml-user-role {
          font-size: 0.7rem;
          font-weight: 400;
          color: var(--text-2);
          letter-spacing: 0.01em;
          margin-top: 2px;
        }
        .ml-notif-slot {
          flex-shrink: 0;
        }

        /* ----- NAVIGATION LABEL ----- */
        .ml-nav-label {
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--text-3);
          padding: 20px 24px 8px;
        }

        /* ----- NAVIGATION ITEMS (premium active/hover) ----- */
        .ml-nav {
          flex: 1;
          overflow-y: auto;
          padding: 0 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .ml-nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 14px;
          border-radius: 10px;
          text-decoration: none;
          color: var(--text-2);
          font-size: 0.85rem;
          font-weight: 500;
          transition: var(--transition-smooth);
          position: relative;
        }
        .ml-nav-item:hover {
          background: var(--bg-hover);
          color: var(--text-1);
          transform: translateX(4px);
        }
        .ml-nav-item.active {
          background: linear-gradient(90deg, var(--accent-soft) 0%, rgba(155, 36, 35, 0.05) 100%);
          color: var(--text-1);
          font-weight: 600;
        }
        .ml-nav-item.active::before {
          content: '';
          position: absolute;
          left: 0;
          top: 50%;
          transform: translateY(-50%);
          width: 3px;
          height: 55%;
          background: var(--accent);
          border-radius: 0 2px 2px 0;
          box-shadow: var(--shadow-glow);
        }
        .ml-nav-icon {
          width: 34px;
          height: 34px;
          border-radius: 8px;
          display: grid;
          place-items: center;
          flex-shrink: 0;
          background: rgba(255, 255, 255, 0.03);
          transition: var(--transition-smooth);
        }
        .ml-nav-item.active .ml-nav-icon {
          background: var(--accent);
          box-shadow: 0 0 12px var(--accent-glow);
          color: var(--cream);
        }
        .ml-nav-item:hover .ml-nav-icon {
          background: rgba(255, 255, 255, 0.08);
        }
        .ml-nav-arrow {
          margin-left: auto;
          opacity: 0;
          transform: translateX(-6px);
          transition: var(--transition-smooth);
          color: var(--accent);
        }
        .ml-nav-item:hover .ml-nav-arrow,
        .ml-nav-item.active .ml-nav-arrow {
          opacity: 1;
          transform: translateX(0);
        }

        /* ----- SIDEBAR FOOTER (Logout) ----- */
        .ml-sidebar-footer {
          padding: 20px 16px 24px;
          border-top: 1px solid var(--border);
          margin-top: auto;
        }
        .ml-logout-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 12px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid var(--border);
          color: var(--text-2);
          font-family: 'Inter', sans-serif;
          font-size: 0.8rem;
          font-weight: 500;
          cursor: pointer;
          transition: var(--transition-smooth);
        }
        .ml-logout-btn:hover {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--cream);
          box-shadow: 0 4px 14px var(--accent-glow);
          transform: translateY(-1px);
        }

        /* ----- MAIN CONTENT AREA ----- */
        .ml-main {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          background: transparent;
        }

        /* ----- MOBILE TOPBAR (glass + floating feel) ----- */
        .ml-topbar {
          display: none;
          background: rgba(10, 10, 12, 0.75);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid var(--border);
          padding: 0 20px;
          height: 64px;
          align-items: center;
          gap: 16px;
          position: sticky;
          top: 0;
          z-index: 30;
        }
        @media (max-width: 1023px) {
          .ml-topbar {
            display: flex;
          }
        }
        .ml-menu-btn {
          width: 40px;
          height: 40px;
          background: var(--bg-card);
          border: 1px solid var(--border);
          border-radius: 12px;
          display: grid;
          place-items: center;
          cursor: pointer;
          color: var(--text-1);
          transition: var(--transition-smooth);
        }
        .ml-menu-btn:hover {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .ml-topbar-title {
          font-family: 'Sora', sans-serif;
          font-size: 1.1rem;
          font-weight: 700;
          background: linear-gradient(135deg, #fff, var(--cream));
          background-clip: text;
          -webkit-background-clip: text;
          color: transparent;
        }
        .ml-topbar-notif {
          margin-left: auto;
        }

        /* ----- CONTENT AREA (industrial grid + premium spacing) ----- */
        .ml-content {
          flex: 1;
          padding: 28px 32px;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.015) 1px, transparent 1px);
          background-size: 44px 44px;
          transition: var(--transition-smooth);
        }

        /* ===== RESPONSIVE & MOBILE OPTIMIZATIONS ===== */
        /* Tablet & Mobile spacing */
        @media (max-width: 768px) {
          .ml-content {
            padding: 20px 16px;
          }
          .ml-sidebar-header {
            padding: 20px 20px 20px;
          }
          .ml-user-card {
            margin: 16px 12px;
            padding: 12px 14px;
          }
          .ml-nav-label {
            padding: 16px 20px 6px;
          }
          .ml-nav {
            padding: 0 8px;
          }
          .ml-nav-item {
            padding: 8px 12px;
          }
        }

        /* Small mobile (<=480px) */
        @media (max-width: 480px) {
          .ml-content {
            padding: 16px 12px;
          }
          .ml-topbar {
            height: 56px;
            padding: 0 12px;
          }
          .ml-menu-btn {
            width: 36px;
            height: 36px;
          }
          .ml-topbar-title {
            font-size: 1rem;
          }
          .ml-sidebar {
            width: 85%;
            max-width: 280px;
          }
          .ml-logo-title {
            font-size: 1.2rem;
          }
          .ml-logo-sub {
            font-size: 0.6rem;
            padding-left: 48px;
          }
          .ml-avatar {
            width: 38px;
            height: 38px;
            font-size: 1rem;
          }
        }

        /* Safe area support (notch, dynamic island) */
        @supports (padding-top: env(safe-area-inset-top)) {
          .ml-sidebar {
            padding-top: env(safe-area-inset-top);
            padding-bottom: env(safe-area-inset-bottom);
          }
          .ml-topbar {
            padding-top: env(safe-area-inset-top);
            height: calc(64px + env(safe-area-inset-top));
          }
          @media (max-width: 480px) {
            .ml-topbar {
              height: calc(56px + env(safe-area-inset-top));
            }
          }
        }

        /* Desktop refinements */
        @media (min-width: 1024px) {
          .ml-content {
            padding: 32px 40px;
          }
          .ml-nav-item {
            padding: 10px 16px;
          }
        }

        /* Ultrawide */
        @media (min-width: 1600px) {
          .ml-content {
            padding: 40px 56px;
          }
        }

        /* Touch-friendly tap targets */
        @media (hover: none) and (pointer: coarse) {
          .ml-nav-item,
          .ml-logout-btn,
          .ml-menu-btn,
          .ml-close-btn {
            min-height: 44px;
          }
          .ml-nav-icon {
            min-width: 40px;
          }
        }
      `}</style>

      <div className="ml-root">
        {/* Mobile overlay */}
        <div className={`ml-overlay ${open ? "active" : ""}`} onClick={() => setOpen(false)} />

        {/* Sidebar - Sieger Premium Automation Control */}
        <aside className={`ml-sidebar ${open ? "open" : ""}`}>
          <div className="ml-sidebar-header">
            <div className="ml-logo-mark">
              <div className="ml-logo-icon">
                <Cpu strokeWidth={1.8} />
              </div>
              <span className="ml-logo-title">SIEGER OPS</span>
            </div>
            <p className="ml-logo-sub">Automation Command Center</p>
            <button className="ml-close-btn" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>

          {/* Executive Identity Card */}
          <div className="ml-user-card">
            <div className="ml-avatar">{user?.name?.charAt(0) || "U"}</div>
            <div className="ml-user-info">
              <div className="ml-user-name">{user?.name || "Operator"}</div>
              <div className="ml-user-role">{user?.role || "Engineer"}</div>
            </div>
            <div className="ml-notif-slot">
              <NotificationBell />
            </div>
          </div>

          {/* Navigation */}
          <p className="ml-nav-label">Core Systems</p>
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
                    <Icon size={16} strokeWidth={1.5} />
                  </span>
                  {item.label}
                  <ChevronRight size={14} className="ml-nav-arrow" />
                </Link>
              );
            })}
          </nav>

          {/* Footer Logout */}
          <div className="ml-sidebar-footer">
            <button className="ml-logout-btn" onClick={handleLogout}>
              <LogOut size={16} strokeWidth={1.6} />
              Exit Terminal
            </button>
          </div>
        </aside>

        {/* Main Area */}
        <div className="ml-main">
          {/* Mobile Topbar - Glassmorphism */}
          <div className="ml-topbar">
            <button className="ml-menu-btn" onClick={() => setOpen(true)}>
              <Menu size={20} strokeWidth={1.6} />
            </button>
            <span className="ml-topbar-title">SIEGER OPS</span>
            <div className="ml-topbar-notif">
              <NotificationBell />
            </div>
          </div>

          {/* Dynamic Content */}
          <div className="ml-content">{children}</div>
        </div>
      </div>
    </>
  );
}