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

const localizer =
  momentLocalizer(moment);

const DnDCalendar =
  withDragAndDrop(Calendar);

// =====================================================
// ASSIGNEE COLORS
// =====================================================

const userColors = {
  Rameenathan: "#3b82f6",
  Kavya: "#ec4899",
  Johnson: "#10b981",
  Admin: "#8b5cf6",
  Default: "#6b7280",
};

// =====================================================
// PRIORITY BORDERS
// =====================================================

const priorityBorders = {
  High: "#ef4444",
  Medium: "#f59e0b",
  Low: "#22c55e",
};

// =====================================================
// OVERDUE CHECK
// =====================================================

const isOverdue = (
  dueDateStr,
  status
) => {
  if (status === "Completed")
    return false;

  const today = new Date();

  today.setUTCHours(
    0,
    0,
    0,
    0
  );

  const due = new Date(
    dueDateStr
  );

  due.setUTCHours(
    0,
    0,
    0,
    0
  );

  return due < today;
};

// =====================================================
// END TIME
// =====================================================

const calculateEndTime = (
  start,
  durationMinutes = 60
) => {
  const end = new Date(start);

  end.setMinutes(
    end.getMinutes() +
      durationMinutes
  );

  return end;
};

export default function TicketCalendar() {
  const [events, setEvents] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedUser, setSelectedUser] =
    useState("All");

  useEffect(() => {
    fetchTickets();
  }, []);

  // =====================================================
  // FETCH TICKETS
  // =====================================================

  const fetchTickets = async () => {
    try {
      setLoading(true);

      const res = await api.get(
        "/tickets"
      );

      const formatted =
        res.data.map((ticket) => {
          const overdue =
            isOverdue(
              ticket.due_date,
              ticket.status
            );

          // =====================================================
          // PERSON COLOR
          // =====================================================

          const assignedPerson =
            ticket.assigned_to_name ||
            "Default";

          let backgroundColor =
            userColors[
              assignedPerson
            ] ||
            userColors["Default"];

          // =====================================================
          // PRIORITY BORDER
          // =====================================================

          let borderColor =
            priorityBorders[
              ticket.priority
            ] || "#d1d5db";

          // =====================================================
          // OVERDUE
          // =====================================================

          if (overdue) {
            backgroundColor =
              "#ef4444";
          }

          // =====================================================
          // START TIME
          // =====================================================

          let startTime;

          if (
            ticket.work_start_time
          ) {
            startTime = new Date(
              ticket.work_start_time
            );
          } else if (
            ticket.due_date
          ) {
            startTime = new Date(
              ticket.due_date
            );

            startTime.setHours(
              9,
              0,
              0,
              0
            );
          } else {
            startTime =
              new Date();
          }

          // =====================================================
          // INVALID DATE FIX
          // =====================================================

          if (
            isNaN(
              startTime.getTime()
            )
          ) {
            startTime =
              new Date();
          }

          // =====================================================
          // DURATION
          // =====================================================

          const duration =
            ticket.time_spent_minutes ||
            60;

          const endTime =
            calculateEndTime(
              startTime,
              duration
            );

          return {
            id: ticket.id,

            title:
              ticket.title,

            start: startTime,

            end: endTime,

            allDay: false,

            backgroundColor,

            borderColor,

            resource: {
              ...ticket,

              duration,

              assignedPerson,
            },
          };
        });

      setEvents(formatted);
    } catch (err) {
      console.error(
        "Calendar fetch error:",
        err
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // FILTERED EVENTS
  // =====================================================

  const filteredEvents =
    useMemo(() => {
      if (
        selectedUser === "All"
      ) {
        return events;
      }

      return events.filter(
        (event) =>
          event.resource
            ?.assignedPerson ===
          selectedUser
      );
    }, [events, selectedUser]);

  // =====================================================
  // USERS
  // =====================================================

  const uniqueUsers =
    useMemo(() => {
      const users =
        events.map(
          (e) =>
            e.resource
              ?.assignedPerson
        );

      return [
        "All",
        ...new Set(users),
      ];
    }, [events]);

  // =====================================================
  // MOVE EVENT
  // =====================================================

  const moveEvent = async ({
    event,
    start,
    end,
  }) => {
    try {
      const duration =
        Math.round(
          (end - start) / 60000
        );

      const updatedEvents =
        events.map((e) =>
          e.id === event.id
            ? {
                ...e,
                start,
                end,

                resource: {
                  ...e.resource,

                  duration,

                  work_start_time:
                    start,

                  time_spent_minutes:
                    duration,
                },
              }
            : e
        );

      setEvents(updatedEvents);

      await api.put(
        `/tickets/${event.id}`,
        {
          work_start_time:
            start.toISOString(),

          time_spent_minutes:
            duration,
        }
      );
    } catch (err) {
      console.error(
        "Move failed:",
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
      const duration =
        Math.round(
          (end - start) / 60000
        );

      const updatedEvents =
        events.map((e) =>
          e.id === event.id
            ? {
                ...e,
                start,
                end,

                resource: {
                  ...e.resource,

                  duration,

                  work_start_time:
                    start,

                  time_spent_minutes:
                    duration,
                },
              }
            : e
        );

      setEvents(updatedEvents);

      await api.put(
        `/tickets/${event.id}`,
        {
          work_start_time:
            start.toISOString(),

          time_spent_minutes:
            duration,
        }
      );
    } catch (err) {
      console.error(
        "Resize failed:",
        err
      );
    }
  };

  // =====================================================
  // EVENT STYLE
  // =====================================================

  const eventStyleGetter = (
    event
  ) => ({
    style: {
      backgroundColor:
        event.backgroundColor,

      borderRadius: "14px",

      color: "#ffffff",

      border: `3px solid ${event.borderColor}`,

      padding: "5px 8px",

      fontSize: "12px",

      fontWeight: "600",

      overflow: "hidden",

      boxShadow:
        "0 2px 8px rgba(0,0,0,0.15)",

      transition: "0.2s",
    },
  });

  // =====================================================
  // CUSTOM EVENT
  // =====================================================

  const CustomEvent = ({
    event,
  }) => {
    return (
      <div className="overflow-hidden">
        {/* TITLE */}
        <div className="font-bold truncate text-[11px]">
          {event.title}
        </div>

        {/* ASSIGNEE */}
        <div className="text-[10px] opacity-90 truncate">
          👤{" "}
          {
            event.resource
              ?.assignedPerson
          }
        </div>

        {/* PRIORITY */}
        <div className="text-[10px] opacity-90">
          ⚡{" "}
          {
            event.resource
              ?.priority
          }
        </div>

        {/* DURATION */}
        <div className="text-[10px] opacity-90">
          ⏱{" "}
          {
            event.resource
              ?.duration
          }{" "}
          mins
        </div>

        {/* TIME */}
        <div className="text-[10px] opacity-90">
          🕒{" "}
          {moment(
            event.start
          ).format("hh:mm A")}{" "}
          -{" "}
          {moment(
            event.end
          ).format("hh:mm A")}
        </div>
      </div>
    );
  };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10">
          <div className="text-xl font-semibold">
            Loading calendar...
          </div>
        </div>
      </MainLayout>
    );
  }

  // =====================================================
  // MAIN UI
  // =====================================================

  return (
    <MainLayout>
      <div className="p-4 lg:p-6">
        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <div className="mb-8">
          <h1 className="text-4xl font-bold">
            Team Calendar
          </h1>

          <p className="text-gray-500 mt-2">
            Jira-style team
            scheduling with
            swimlanes
          </p>
        </div>

        {/* ===================================================== */}
        {/* SWIMLANES / USER FILTER */}
        {/* ===================================================== */}

        <div className="mb-6 flex flex-wrap gap-3">
          {uniqueUsers.map(
            (user) => (
              <button
                key={user}
                onClick={() =>
                  setSelectedUser(
                    user
                  )
                }
                className={`px-4 py-2 rounded-2xl border font-medium transition ${
                  selectedUser ===
                  user
                    ? "bg-black text-white"
                    : "bg-white hover:bg-gray-100"
                }`}
              >
                {user}
              </button>
            )
          )}
        </div>

        {/* ===================================================== */}
        {/* LEGEND */}
        {/* ===================================================== */}

        <div className="flex flex-wrap gap-3 mb-6">
          <Legend
            color="bg-red-500"
            label="High Priority"
          />

          <Legend
            color="bg-orange-500"
            label="Medium Priority"
          />

          <Legend
            color="bg-green-500"
            label="Low Priority"
          />
        </div>

        {/* ===================================================== */}
        {/* TEAM WORKLOAD */}
        {/* ===================================================== */}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {uniqueUsers
            .filter(
              (u) => u !== "All"
            )
            .map((user) => {
              const userEvents =
                events.filter(
                  (e) =>
                    e.resource
                      ?.assignedPerson ===
                    user
                );

              const totalMinutes =
                userEvents.reduce(
                  (sum, e) =>
                    sum +
                    (e.resource
                      ?.duration ||
                      0),
                  0
                );

              return (
                <div
                  key={user}
                  className="bg-white rounded-2xl border p-4 shadow-sm"
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-4 h-4 rounded-full"
                      style={{
                        background:
                          userColors[
                            user
                          ] ||
                          "#6b7280",
                      }}
                    ></div>

                    <h3 className="font-bold">
                      {user}
                    </h3>
                  </div>

                  <div className="text-sm text-gray-500">
                    Tickets:{" "}
                    {
                      userEvents.length
                    }
                  </div>

                  <div className="text-sm text-gray-500">
                    Workload:{" "}
                    {Math.round(
                      totalMinutes /
                        60
                    )}
                    h
                  </div>
                </div>
              );
            })}
        </div>

        {/* ===================================================== */}
        {/* CALENDAR */}
        {/* ===================================================== */}

        <div className="bg-white p-3 lg:p-6 rounded-3xl shadow-sm border overflow-hidden">
          <div
            style={{
              height: "82vh",
            }}
          >
            <DnDCalendar
              localizer={
                localizer
              }

              events={
                filteredEvents
              }

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

              draggableAccessor={() =>
                true
              }

              resizable

              onEventDrop={
                moveEvent
              }

              onEventResize={
                resizeEvent
              }

              // =====================================================
              // TIME
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
                event:
                  CustomEvent,
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
// LEGEND
// =====================================================

function Legend({
  color,
  label,
}) {
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