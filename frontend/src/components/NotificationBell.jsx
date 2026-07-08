import { Bell, CheckCheck, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import socket from "../services/socket";
import useAuthStore from "../store/authStore";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0, width: 384 });
  const wrapperRef = useRef(null);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const fetchNotifications = async () => {
    if (!user?.name) return;
    try {
      const res = await api.get("/notifications");
      // Backend already filters by user_name = req.user.name
      setNotifications(res.data);
    } catch (error) {
      console.error("Fetch notifications error", error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    socket.on("notificationReceived", fetchNotifications);
    return () => socket.off("notificationReceived", fetchNotifications);
  }, [user?.name]);

  // Close when clicking outside the bell or the panel
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e) => {
      if (
        wrapperRef.current && !wrapperRef.current.contains(e.target) &&
        panelRef.current && !panelRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const toggleOpen = () => {
    if (!open && buttonRef.current) {
      // Fixed positioning so the sidebar's overflow:hidden can't clip the panel
      const r = buttonRef.current.getBoundingClientRect();
      const width = Math.min(384, window.innerWidth - 16);
      let left = r.right - width;
      if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
      if (left < 8) left = 8;
      setPanelPos({ top: r.bottom + 10, left, width });
    }
    setOpen(!open);
  };

  const markAsRead = async (id) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, is_read: true } : n)
      );
    } catch (error) {
      console.error(error);
    }
  };

  const openNotification = (n) => {
    if (!n.is_read) markAsRead(n.id);
    if (n.ticket_id) {
      setOpen(false);
      navigate(`/tickets/${n.ticket_id}`);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    await Promise.all(unread.map(n => api.put(`/notifications/${n.id}/read`)));
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="relative" ref={wrapperRef}>
      <button ref={buttonRef} onClick={toggleOpen} className="relative">
        <Bell size={24} />
        {unreadCount > 0 && (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </div>
        )}
      </button>

      {/* Portal to body: the sidebar's CSS transform would otherwise make
          position:fixed resolve against the sidebar instead of the viewport */}
      {open && createPortal(
        <div
          ref={panelRef}
          className="fixed bg-white border rounded-2xl shadow-xl p-4 z-[100] max-h-[500px] overflow-auto"
          style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
        >
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Notifications</h2>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full flex items-center gap-1">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 && (
            <div className="text-center text-gray-400 py-6">No notifications</div>
          )}
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`border rounded-xl p-3 cursor-pointer transition hover:border-gray-300 ${!n.is_read ? "bg-blue-50 border-blue-200" : "bg-white"}`}
                onClick={() => openNotification(n)}
              >
                <div className="flex justify-between items-start">
                  <p className="font-semibold text-sm">{n.title}</p>
                  {!n.is_read && <span className="text-blue-500 text-xs">● New</span>}
                </div>
                <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-gray-400">{new Date(n.created_at).toLocaleString()}</p>
                  {n.ticket_id && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      View ticket <ExternalLink size={11} />
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
