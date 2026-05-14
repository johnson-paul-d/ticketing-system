import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";

const localizer = momentLocalizer(moment);

// =====================================================
// HELPER: OVERDUE CHECK
// =====================================================
const isOverdue = (dueDateStr, status) => {
  if (status === "Completed") return false;

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const due = new Date(dueDateStr);
  due.setUTCHours(0, 0, 0, 0);

  return due < today;
};

// =====================================================
// HELPER: CALCULATE END TIME
// =====================================================
// Example:
// start_time = "2026-05-14T09:00:00"
// work_duration = 120 (minutes)
// End => 11:00 AM
const calculateEndTime = (start, durationMinutes = 60) => {
  const end = new Date(start);
  end.setMinutes(end.getMinutes() + durationMinutes);
  return end;
};

export default function TicketCalendar() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetchTickets();
  }, []);

  // =====================================================
  // FETCH TICKETS
  // =====================================================
  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");

      const formatted = res.data
        .filter((ticket) => ticket.due_date)
        .map((ticket) => {
          const overdue = isOverdue(ticket.due_date, ticket.status);

          let backgroundColor = "#6b7280";

          if (ticket.status === "Completed")
            backgroundColor = "#22c55e";
          else if (ticket.status === "In Progress")
            backgroundColor = "#3b82f6";
          else if (ticket.status === "Waiting For Sources")
            backgroundColor = "#f59e0b";
          else if (ticket.status === "Pending Approval")
            backgroundColor = "#a855f7";

          if (overdue) backgroundColor = "#ef4444";

          // =====================================================
          // WORK TRACKING
          // =====================================================

          /*
            REQUIRED FIELDS FROM BACKEND

            ticket.work_start_time
            ticket.time_spent_minutes

            Example:
            work_start_time: "2026-05-14T10:00:00"
            time_spent_minutes: 90
          */

          const startTime = ticket.work_start_time
            ? new Date(ticket.work_start_time)
            : new Date(ticket.due_date);

          const duration = ticket.time_spent_minutes || 60;

          const endTime = calculateEndTime(
            startTime,
            duration
          );

          return {
            title: overdue
              ? `🔴 ${ticket.title}`
              : `${ticket.title}`,

            start: startTime,
            end: endTime,

            allDay: false,

            resource: {
              ...ticket,
              duration,
            },

            backgroundColor,
            borderColor: "transparent",
            textColor: "#ffffff",
          };
        });

      setEvents(formatted);
    } catch (err) {
      console.error("Calendar fetch error:", err);
    }
  };

  // =====================================================
  // EVENT STYLE
  // =====================================================
  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor: event.backgroundColor,
      borderRadius: "14px",
      color: "#ffffff",
      border: "none",
      padding: "6px 8px",
      fontSize: "13px",
      fontWeight: "600",
    },
  });

  // =====================================================
  // CUSTOM EVENT UI
  // =====================================================
  const CustomEvent = ({ event }) => (
    <div className="overflow-hidden">
      <div className="font-semibold truncate">
        {event.title}
      </div>

      {event.resource?.assigned_to_name && (
        <div className="text-[10px] opacity-90 truncate">
          👤 {event.resource.assigned_to_name}
        </div>
      )}

      <div className="text-[10px] opacity-90">
        ⏱ {event.resource.duration} mins
      </div>

      <div className="text-[10px] opacity-90">
        🕒{" "}
        {moment(event.start).format("hh:mm A")} -{" "}
        {moment(event.end).format("hh:mm A")}
      </div>
    </div>
  );

  return (
    <MainLayout>
      <div className="p-4 lg:p-6">
        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <div className="mb-8">
          <h1 className="text-3xl lg:text-4xl font-bold">
            Ticket Calendar
          </h1>

          <p className="text-gray-500 mt-2">
            Jira-style work tracking calendar
          </p>
        </div>

        {/* ===================================================== */}
        {/* LEGEND */}
        {/* ===================================================== */}

        <div className="flex flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border">
            <div className="w-4 h-4 rounded-full bg-green-500"></div>
            <span className="text-sm font-medium">
              Completed
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border">
            <div className="w-4 h-4 rounded-full bg-blue-500"></div>
            <span className="text-sm font-medium">
              In Progress
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border">
            <div className="w-4 h-4 rounded-full bg-orange-500"></div>
            <span className="text-sm font-medium">
              Waiting For Sources
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border">
            <div className="w-4 h-4 rounded-full bg-purple-500"></div>
            <span className="text-sm font-medium">
              Pending Approval
            </span>
          </div>

          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border">
            <div className="w-4 h-4 rounded-full bg-red-500"></div>
            <span className="text-sm font-medium">
              Overdue
            </span>
          </div>
        </div>

        {/* ===================================================== */}
        {/* CALENDAR */}
        {/* ===================================================== */}

        <div className="bg-white p-3 lg:p-6 rounded-3xl shadow-sm border overflow-hidden">
          <div style={{ height: "80vh" }}>
            <Calendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              views={["month", "week", "day", "agenda"]}
              popup
              selectable
              step={15}
              timeslots={2}

              // =====================================================
              // SHOW ONLY AFTER 9 AM
              // =====================================================

              min={new Date(2026, 1, 1, 9, 0, 0)}
              max={new Date(2026, 1, 1, 22, 0, 0)}

              // =====================================================
              // DAY/WEEK VIEW
              // =====================================================

              defaultView="week"

              eventPropGetter={eventStyleGetter}
              components={{
                event: CustomEvent,
              }}

              style={{
                height: "100%",
              }}
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}