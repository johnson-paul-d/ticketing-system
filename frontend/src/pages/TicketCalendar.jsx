// =====================================================
// TICKET CALENDAR
// FILE: src/pages/TicketCalendar.jsx
// =====================================================

import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

import {
  Calendar,
  momentLocalizer,
} from "react-big-calendar";

import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";

import moment from "moment";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

// =====================================================
// LOCALIZER
// =====================================================

const localizer = momentLocalizer(moment);
const DnDCalendar = withDragAndDrop(Calendar);

// =====================================================
// USER COLORS
// =====================================================

const userColors = {
  Rameenathan: "#3b82f6",
  Kavya: "#ec4899",
  Johnson: "#10b981",
  Admin: "#8b5cf6",
  Default: "#6b7280",
};

// =====================================================
// PRIORITY COLORS
// =====================================================

const priorityBorders = {
  High: "#ef4444",
  Medium: "#f59e0b",
  Low: "#22c55e",
};

export default function TicketCalendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState("month");
  const [selectedUser, setSelectedUser] = useState("All");

  // =====================================================
  // FETCH
  // =====================================================

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);

      const [ticketsRes, leavesRes, permissionsRes] = await Promise.all([
        api.get("/tickets"),
        api.get("/leave-requests"),
        api.get("/permission-requests"),
      ]);

      const tickets = ticketsRes.data || [];
      const leaves = leavesRes.data || [];
      const permissions = permissionsRes.data || [];

      let allEvents = [];

      // =====================================================
      // TICKETS
      // =====================================================

      tickets.forEach((ticket) => {
        const assignedPerson = ticket.assigned_to_name || "Default";
        const userColor = userColors[assignedPerson] || userColors.Default;
        const borderColor = priorityBorders[ticket.priority] || "#d1d5db";

        const isOverdue =
          ticket.due_date &&
          new Date(ticket.due_date) < new Date() &&
          ticket.status !== "Completed";

        if (ticket.due_date) {
          const dueDate = new Date(ticket.due_date);
          allEvents.push({
            id: `due-${ticket.id}`,
            title: isOverdue ? `🚨 OVERDUE - ${ticket.title}` : `📌 ${ticket.title}`,
            start: dueDate,
            end: dueDate,
            allDay: true,
            type: isOverdue ? "overdue" : "due_date",
            backgroundColor: isOverdue ? "#dc2626" : userColor,
            borderColor: isOverdue ? "#7f1d1d" : borderColor,
            resource: { ...ticket, assignedPerson },
          });
        }

        if (ticket.time_entries && ticket.time_entries.length) {
          ticket.time_entries.forEach((entry) => {
            const start = new Date(entry.start_time);
            const end = new Date(entry.end_time);
            allEvents.push({
              id: `work-${entry.id}`,
              title: ticket.title,
              start,
              end,
              allDay: false,
              type: "work_log",
              backgroundColor: userColor,
              borderColor,
              resource: {
                ...ticket,
                entry,
                assignedPerson,
                duration: entry.duration_minutes,
              },
            });
          });
        }
      });

      // =====================================================
      // LEAVE EVENTS – FULL DAY BLOCK (00:00 → 23:59:59)
      // =====================================================

      leaves.forEach((leave) => {
        // Backend sends from_date / to_date
        const start = new Date(leave.from_date);
        start.setHours(0, 0, 0, 0);

        const end = new Date(leave.to_date);
        end.setHours(23, 59, 59, 999);

        allEvents.push({
          id: `leave-${leave.id}`,
          title: `🏖 ${leave.user_name || "Employee"} On Leave`,
          start,
          end,
          allDay: true,
          type: "leave",
          backgroundColor: "#dc2626",
          borderColor: "#7f1d1d",
          resource: {
            ...leave,
            assignedPerson: leave.user_name,
          },
        });
      });

      // =====================================================
      // PERMISSION EVENTS (timed blocks)
      // =====================================================

      permissions.forEach((permission) => {
        // Backend sends permission_date, from_time, to_time
        const start = new Date(
          `${permission.permission_date}T${permission.from_time}`
        );
        const end = new Date(
          `${permission.permission_date}T${permission.to_time}`
        );

        allEvents.push({
          id: `permission-${permission.id}`,
          title: `🕒 ${permission.user_name || "Employee"} Permission`,
          start,
          end,
          allDay: false,
          type: "permission",
          backgroundColor: "#7c3aed",
          borderColor: "#5b21b6",
          resource: {
            ...permission,
            assignedPerson: permission.user_name,
          },
        });
      });

      console.log("Calendar Events:", allEvents);
      setEvents(allEvents);
    } catch (err) {
      console.error("Calendar fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // USERS
  // =====================================================

  const uniqueUsers = useMemo(() => {
    const users = events.map((e) => e.resource?.assignedPerson);
    return ["All", ...new Set(users)];
  }, [events]);

  // =====================================================
  // FILTER – LEAVE VISIBLE IN WEEK/DAY VIEW
  // =====================================================

  const filteredEvents = useMemo(() => {
    let filtered = selectedUser === "All"
      ? events
      : events.filter((event) => event.resource?.assignedPerson === selectedUser);

    if (currentView === "month") {
      return filtered.filter(
        (e) => e.type === "due_date" || e.type === "overdue" || e.type === "leave"
      );
    }

    // WEEK / DAY / AGENDA – now includes leave events
    return filtered.filter(
      (e) => e.type === "work_log" || e.type === "permission" || e.type === "leave"
    );
  }, [events, selectedUser, currentView]);

  // =====================================================
  // MOVE / RESIZE
  // =====================================================

  const moveEvent = async ({ event, start, end }) => {
    try {
      const duration = Math.round((end - start) / 60000);
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, start, end } : e))
      );
      if (event.type === "work_log") {
        await api.put(`/ticket-time-entries/${event.resource.entry.id}`, {
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: duration,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const resizeEvent = async ({ event, start, end }) => {
    try {
      const duration = Math.round((end - start) / 60000);
      setEvents((prev) =>
        prev.map((e) => (e.id === event.id ? { ...e, start, end } : e))
      );
      if (event.type === "work_log") {
        await api.put(`/ticket-time-entries/${event.resource.entry.id}`, {
          start_time: start.toISOString(),
          end_time: end.toISOString(),
          duration_minutes: duration,
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // =====================================================
  // EVENT STYLE
  // =====================================================

  const eventStyleGetter = (event) => {
    let style = {
      backgroundColor: event.backgroundColor,
      borderRadius: "14px",
      color: "#fff",
      border: `3px solid ${event.borderColor}`,
      padding: "5px 8px",
      fontSize: "12px",
      fontWeight: "600",
      boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
    };

    if (event.type === "overdue") {
      style.animation = "pulse 2s infinite";
      style.fontWeight = "800";
    }

    if (event.type === "permission") {
      style.backgroundColor = "#7c3aed";
      style.border = "3px solid #5b21b6";
      style.opacity = 0.95;
    }

    if (event.type === "leave") {
      style.backgroundColor = "#dc2626";
      style.border = "3px solid #7f1d1d";
      style.fontWeight = "800";
    }

    return { style };
  };

  const CustomEvent = ({ event }) => (
    <div className="overflow-hidden">
      <div className="font-bold truncate text-[11px]">{event.title}</div>
      {event.resource?.assignedPerson && (
        <div className="text-[10px] opacity-90 truncate">
          👤 {event.resource?.assignedPerson}
        </div>
      )}
      {event.type === "work_log" && (
        <>
          <div className="text-[10px] opacity-90">⏱ {event.resource?.duration} mins</div>
          <div className="text-[10px] opacity-90">
            🕒 {moment(event.start).format("hh:mm A")} - {moment(event.end).format("hh:mm A")}
          </div>
        </>
      )}
    </div>
  );

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10 text-xl font-semibold">Loading calendar...</div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="p-4 lg:p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold">Team Calendar</h1>
          <p className="text-gray-500 mt-2">Tickets, workload, leaves & permissions</p>
        </div>

        <div className="mb-6 flex flex-wrap gap-3">
          {uniqueUsers.map((user) => (
            <button
              key={user}
              onClick={() => setSelectedUser(user)}
              className={`px-4 py-2 rounded-2xl border font-medium transition ${
                selectedUser === user
                  ? "bg-black text-white shadow-lg"
                  : "bg-white hover:bg-gray-100"
              }`}
            >
              {user}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <Legend color="#dc2626" label="Overdue" />
          <Legend color="#3b82f6" label="Tickets" />
          <Legend color="#dc2626" label="Leave" />
          <Legend color="#7c3aed" label="Permission" />
        </div>

        <div className="bg-white p-4 rounded-3xl border shadow-sm">
          <div style={{ height: "82vh" }}>
            <DnDCalendar
              localizer={localizer}
              events={filteredEvents}
              startAccessor="start"
              endAccessor="end"
              defaultView="month"
              view={currentView}
              onView={(view) => setCurrentView(view)}
              views={["month", "week", "day", "agenda"]}
              selectable
              popup
              draggableAccessor={() => currentView !== "month"}
              resizable={currentView !== "month"}
              onEventDrop={moveEvent}
              onEventResize={resizeEvent}
              step={15}
              timeslots={2}
              min={new Date(2026, 1, 1, 8, 0, 0)}
              max={new Date(2026, 1, 1, 23, 0, 0)}
              eventPropGetter={eventStyleGetter}
              components={{ event: CustomEvent }}
              style={{ height: "100%" }}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border shadow-sm">
      <div style={{ backgroundColor: color }} className="w-4 h-4 rounded-full"></div>
      <span className="text-sm font-medium">{label}</span>
    </div>
  );
}