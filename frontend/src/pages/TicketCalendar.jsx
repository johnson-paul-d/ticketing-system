import { useEffect, useState } from "react";
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
// OVERDUE CHECK
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
// CALCULATE END TIME
// =====================================================

const calculateEndTime = (
  start,
  durationMinutes = 60
) => {
  const end = new Date(start);

  end.setMinutes(
    end.getMinutes() + durationMinutes
  );

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
          const overdue = isOverdue(
            ticket.due_date,
            ticket.status
          );

          // =====================================================
          // COLORS
          // =====================================================

          let backgroundColor = "#6b7280";

          if (ticket.status === "Completed") {
            backgroundColor = "#22c55e";
          } else if (
            ticket.status === "In Progress"
          ) {
            backgroundColor = "#3b82f6";
          } else if (
            ticket.status ===
            "Waiting For Sources"
          ) {
            backgroundColor = "#f59e0b";
          } else if (
            ticket.status ===
            "Pending Approval"
          ) {
            backgroundColor = "#a855f7";
          }

          if (overdue) {
            backgroundColor = "#ef4444";
          }

          // =====================================================
          // WORK START TIME
          // =====================================================

          const startTime =
            ticket.work_start_time
              ? new Date(
                  ticket.work_start_time
                )
              : new Date(ticket.due_date);

          // =====================================================
          // DURATION
          // =====================================================

          const duration =
            ticket.time_spent_minutes || 60;

          const endTime =
            calculateEndTime(
              startTime,
              duration
            );

          return {
            id: ticket.id,

            title: overdue
              ? `🔴 ${ticket.title}`
              : ticket.title,

            start: startTime,

            end: endTime,

            allDay: false,

            backgroundColor,

            resource: {
              ...ticket,
              duration,
            },
          };
        });

      setEvents(formatted);
    } catch (err) {
      console.error(
        "Calendar fetch error:",
        err
      );
    }
  };

  // =====================================================
  // DRAG EVENT
  // =====================================================

  const moveEvent = async ({
    event,
    start,
    end,
  }) => {
    try {
      const updatedEvents = events.map((e) =>
        e.id === event.id
          ? {
              ...e,
              start,
              end,
            }
          : e
      );

      setEvents(updatedEvents);

      await api.put(
        `/tickets/${event.id}`,
        {
          work_start_time: start,
          time_spent_minutes:
            Math.round(
              (end - start) / 60000
            ),
        }
      );
    } catch (err) {
      console.error(
        "Move event error:",
        err
      );
    }
  };

  // =====================================================
  // RESIZE EVENT
  // =====================================================

  const resizeEvent = async ({
    event,
    start,
    end,
  }) => {
    try {
      const updatedEvents = events.map((e) =>
        e.id === event.id
          ? {
              ...e,
              start,
              end,
            }
          : e
      );

      setEvents(updatedEvents);

      await api.put(
        `/tickets/${event.id}`,
        {
          work_start_time: start,
          time_spent_minutes:
            Math.round(
              (end - start) / 60000
            ),
        }
      );
    } catch (err) {
      console.error(
        "Resize event error:",
        err
      );
    }
  };

  // =====================================================
  // EVENT STYLING
  // =====================================================

  const eventStyleGetter = (event) => ({
    style: {
      backgroundColor:
        event.backgroundColor,
      borderRadius: "12px",
      color: "#ffffff",
      border: "none",
      padding: "4px 6px",
      fontSize: "12px",
      fontWeight: "600",
      overflow: "hidden",
    },
  });

  // =====================================================
  // CUSTOM EVENT
  // =====================================================

  const CustomEvent = ({ event }) => {
    return (
      <div className="overflow-hidden">
        <div className="font-semibold truncate text-[11px]">
          {event.title}
        </div>

        {event.resource
          ?.assigned_to_name && (
          <div className="text-[10px] opacity-90 truncate">
            👤{" "}
            {
              event.resource
                .assigned_to_name
            }
          </div>
        )}

        <div className="text-[10px] opacity-90">
          ⏱{" "}
          {event.resource.duration} mins
        </div>

        <div className="text-[10px] opacity-90">
          🕒{" "}
          {moment(event.start).format(
            "hh:mm A"
          )}{" "}
          -{" "}
          {moment(event.end).format(
            "hh:mm A"
          )}
        </div>
      </div>
    );
  };

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
            Jira-style work scheduling &
            tracking
          </p>
        </div>

        {/* ===================================================== */}
        {/* LEGEND */}
        {/* ===================================================== */}

        <div className="flex flex-wrap gap-3 mb-6">
          <Legend
            color="bg-green-500"
            label="Completed"
          />

          <Legend
            color="bg-blue-500"
            label="In Progress"
          />

          <Legend
            color="bg-orange-500"
            label="Waiting For Sources"
          />

          <Legend
            color="bg-purple-500"
            label="Pending Approval"
          />

          <Legend
            color="bg-red-500"
            label="Overdue"
          />
        </div>

        {/* ===================================================== */}
        {/* CALENDAR */}
        {/* ===================================================== */}

        <div className="bg-white p-3 lg:p-6 rounded-3xl shadow-sm border overflow-hidden">
          <div style={{ height: "82vh" }}>
            <DnDCalendar
              localizer={localizer}
              events={events}
              startAccessor="start"
              endAccessor="end"
              defaultView="week"
              views={[
                "month",
                "week",
                "day",
                "agenda",
              ]}
              selectable
              popup

              // =====================================================
              // DRAG & DROP
              // =====================================================

              draggableAccessor={() => true}

              resizable

              onEventDrop={moveEvent}

              onEventResize={resizeEvent}

              // =====================================================
              // TIME SETTINGS
              // =====================================================

              step={15}

              timeslots={2}

              min={
                new Date(
                  2026,
                  1,
                  1,
                  9,
                  0,
                  0
                )
              }

              max={
                new Date(
                  2026,
                  1,
                  1,
                  22,
                  0,
                  0
                )
              }

              // =====================================================
              // STYLE
              // =====================================================

              eventPropGetter={
                eventStyleGetter
              }

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

// =====================================================
// LEGEND COMPONENT
// =====================================================

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border">
      <div
        className={`w-4 h-4 rounded-full ${color}`}
      ></div>

      <span className="text-sm font-medium">
        {label}
      </span>
    </div>
  );
}