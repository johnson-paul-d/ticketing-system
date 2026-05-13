import { Bell, CheckCheck } from "lucide-react";
import { useEffect, useState } from "react";
import api from "../services/api";
import socket from "../services/socket";

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = async () => {
    try {
      const res = await api.get("/notifications");
      setNotifications(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    socket.on("notificationReceived", fetchNotifications);
    return () => socket.off("notificationReceived", fetchNotifications);
  }, []);

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

  const markAllRead = async () => {
    try {
      const unread = notifications.filter(n => !n.is_read);
      await Promise.all(unread.map(n => api.put(`/notifications/${n.id}/read`)));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (error) {
      console.error(error);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="relative">
        <Bell size={24} />
        {unreadCount > 0 && (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {unreadCount}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-96 bg-white border rounded-2xl shadow-xl p-4 z-50 max-h-[500px] overflow-auto">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Notifications</h2>
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded-full flex items-center gap-1">
                <CheckCheck size={14} /> Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 && <div className="text-center text-gray-400 py-6">No notifications</div>}
          <div className="space-y-3">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`border rounded-xl p-3 cursor-pointer transition ${!n.is_read ? "bg-blue-50 border-blue-200" : "bg-white"}`}
                onClick={() => markAsRead(n.id)}
              >
                <div className="flex justify-between items-start">
                  <p className="font-semibold text-sm">{n.title}</p>
                  {!n.is_read && <span className="text-blue-500 text-xs">● New</span>}
                </div>
                <p className="text-sm text-gray-600 mt-1">{n.message}</p>
                <p className="text-xs text-gray-400 mt-2">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}