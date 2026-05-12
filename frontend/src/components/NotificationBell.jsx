import {
  Bell,
} from "lucide-react";

import {
  useEffect,
  useState,
} from "react";

import api from "../services/api";

export default function NotificationBell() {

  const [
    open,
    setOpen
  ] = useState(false);

  const [
    notifications,
    setNotifications
  ] = useState([]);

  const fetchNotifications =
    async () => {

      try {

        const res =
          await api.get(
            "/notifications"
          );

        setNotifications(
          res.data
        );

      } catch (error) {

        console.log(error);
      }
    };

  useEffect(() => {

    fetchNotifications();

  }, []);

  return (

    <div className="relative">

      <button
        onClick={() =>
          setOpen(!open)
        }
        className="relative"
      >

        <Bell size={26} />

        {notifications.filter(
          (n) => !n.is_read
        ).length > 0 && (

          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">

            {
              notifications.filter(
                (n) => !n.is_read
              ).length
            }

          </div>

        )}

      </button>

      {open && (

        <div className="absolute right-0 mt-4 w-96 bg-white border rounded-3xl shadow-xl p-4 z-50 max-h-[500px] overflow-auto">

          <h2 className="text-xl font-bold mb-4">
            Notifications
          </h2>

          <div className="space-y-3">

            {notifications.map(
              (n) => (

                <div
                  key={n.id}
                  className="border rounded-2xl p-4"
                >

                  <p className="font-semibold">
                    {n.title}
                  </p>

                  <p className="text-sm text-gray-600 mt-1">
                    {n.message}
                  </p>

                </div>

              )
            )}

          </div>

        </div>
      )}

    </div>
  );
}