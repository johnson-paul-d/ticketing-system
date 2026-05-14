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

const localizer =
  momentLocalizer(moment);

const DnDCalendar =
  withDragAndDrop(Calendar);

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
// PRIORITY BORDERS
// =====================================================

const priorityBorders = {
  High: "#ef4444",
  Medium: "#f59e0b",
  Low: "#22c55e",
};

export default function TicketCalendar() {
  const [events, setEvents] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [currentView, setCurrentView] =
    useState("month");

  const [selectedUser, setSelectedUser] =
    useState("All");

  // =====================================================
  // FETCH
  // =====================================================

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

      let allEvents = [];

      res.data.forEach((ticket) => {
        const assignedPerson =
          ticket.assigned_to_name ||
          "Default";

        const backgroundColor =
          userColors[
            assignedPerson
          ] ||
          userColors.Default;

        const borderColor =
          priorityBorders[
            ticket.priority
          ] || "#d1d5db";

        // =====================================================
        // MONTH VIEW
        // DUE DATE EVENT
        // =====================================================

        if (ticket.due_date) {
          const dueDate =
            new Date(
              ticket.due_date
            );

          allEvents.push({
            id: `due-${ticket.id}`,

            title: `📌 ${ticket.title}`,

            start: dueDate,

            end: dueDate,

            allDay: true,

            type: "due_date",

            backgroundColor,

            borderColor,

            resource: {
              ...ticket,

              assignedPerson,
            },
          });
        }

        // =====================================================
        // WORK LOG EVENTS
        // =====================================================

        if (
          ticket.time_entries &&
          ticket.time_entries.length
        ) {
          ticket.time_entries.forEach(
            (entry) => {
              const start =
                new Date(
                  entry.start_time
                );

              const end =
                new Date(
                  entry.end_time
                );

              allEvents.push({
                id: `work-${entry.id}`,

                title:
                  ticket.title,

                start,

                end,

                allDay: false,

                type: "work_log",

                backgroundColor,

                borderColor,

                resource: {
                  ...ticket,

                  entry,

                  assignedPerson,

                  duration:
                    entry.duration_minutes,
                },
              });
            }
          );
        }
      });

      setEvents(allEvents);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

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
  // FILTERED EVENTS
  // =====================================================

  const filteredEvents =
    useMemo(() => {
      let filtered =
        selectedUser === "All"
          ? events
          : events.filter(
              (event) =>
                event.resource
                  ?.assignedPerson ===
                selectedUser
            );

      // =====================================================
      // MONTH VIEW
      // =====================================================

      if (
        currentView === "month"
      ) {
        return filtered.filter(
          (e) =>
            e.type ===
            "due_date"
        );
      }

      // =====================================================
      // WEEK/DAY/AGENDA
      // =====================================================

      return filtered.filter(
        (e) =>
          e.type ===
          "work_log"
      );
    }, [
      events,
      selectedUser,
      currentView,
    ]);

  // =====================================================
  // DRAG
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

      setEvents((prev) =>
        prev.map((e) =>
          e.id === event.id
            ? {
                ...e,
                start,
                end,
              }
            : e
        )
      );

      await api.put(
        `/ticket-time-entries/${event.resource.entry.id}`,
        {
          start_time:
            start.toISOString(),

          end_time:
            end.toISOString(),

          duration_minutes:
            duration,
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

  // =====================================================
  // RESIZE
  // =====================================================

  const resizeEvent =
    async ({
      event,
      start,
      end,
    }) => {
      try {
        const duration =
          Math.round(
            (end - start) /
              60000
          );

        setEvents((prev) =>
          prev.map((e) =>
            e.id === event.id
              ? {
                  ...e,
                  start,
                  end,
                }
              : e
          )
        );

        await api.put(
          `/ticket-time-entries/${event.resource.entry.id}`,
          {
            start_time:
              start.toISOString(),

            end_time:
              end.toISOString(),

            duration_minutes:
              duration,
          }
        );
      } catch (err) {
        console.error(err);
      }
    };

  // =====================================================
  // STYLE
  // =====================================================

  const eventStyleGetter = (
    event
  ) => ({
    style: {
      backgroundColor:
        event.backgroundColor,

      borderRadius: "14px",

      color: "#fff",

      border: `3px solid ${event.borderColor}`,

      padding: "5px 8px",

      fontSize: "12px",

      fontWeight: "600",

      boxShadow:
        "0 2px 8px rgba(0,0,0,0.15)",
    },
  });

  // =====================================================
  // CUSTOM EVENT
  // =====================================================

  const CustomEvent = ({
    event,
  }) => (
    <div className="overflow-hidden">
      <div className="font-bold truncate text-[11px]">
        {event.title}
      </div>

      {event.type ===
        "work_log" && (
        <>
          <div className="text-[10px] opacity-90 truncate">
            👤{" "}
            {
              event.resource
                ?.assignedPerson
            }
          </div>

          <div className="text-[10px] opacity-90">
            ⏱{" "}
            {
              event.resource
                ?.duration
            }{" "}
            mins
          </div>

          <div className="text-[10px] opacity-90">
            🕒{" "}
            {moment(
              event.start
            ).format(
              "hh:mm A"
            )}{" "}
            -
            {" "}
            {moment(
              event.end
            ).format(
              "hh:mm A"
            )}
          </div>
        </>
      )}
    </div>
  );

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10">
          Loading...
        </div>
      </MainLayout>
    );
  }

  // =====================================================
  // UI
  // =====================================================

  return (
    <MainLayout>
      <div className="p-4 lg:p-6">
        {/* HEADER */}

        <div className="mb-8">
          <h1 className="text-4xl font-bold">
            Team Calendar
          </h1>

          <p className="text-gray-500 mt-2">
            Due dates +
            work sessions
          </p>
        </div>

        {/* USERS */}

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
                    : "bg-white"
                }`}
              >
                {user}
              </button>
            )
          )}
        </div>

        {/* CALENDAR */}

        <div className="bg-white p-4 rounded-3xl border shadow-sm">
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

              defaultView="month"

              view={currentView}

              onView={(view) =>
                setCurrentView(
                  view
                )
              }

              views={[
                "month",
                "week",
                "day",
                "agenda",
              ]}

              selectable

              popup

              draggableAccessor={() =>
                currentView !==
                "month"
              }

              resizable={
                currentView !==
                "month"
              }

              onEventDrop={
                moveEvent
              }

              onEventResize={
                resizeEvent
              }

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