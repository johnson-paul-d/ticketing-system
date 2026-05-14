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

const localizer =
  momentLocalizer(moment);

const DnDCalendar =
  withDragAndDrop(Calendar);

// =====================================================
// USER COLORS
// =====================================================

const userColors = {
  "Johnson Paul D":
    "#10b981",

  Kavinraj: "#3b82f6",

  "Karthick R":
    "#8b5cf6",

  Admin: "#ec4899",

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
  const [events, setEvents] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  // =====================================================
  // FETCH EVENTS
  // =====================================================

  useEffect(() => {
    fetchCalendarEvents();
  }, []);

  const fetchCalendarEvents =
    async () => {
      try {
        setLoading(true);

        // =====================================================
        // FETCH TIME ENTRIES
        // =====================================================

        /*
          BACKEND SHOULD RETURN:

          [
            {
              id,
              ticket_id,
              ticket_title,
              assigned_to_name,
              priority,
              start_time,
              end_time,
              duration_minutes
            }
          ]
        */

        const res =
          await api.get(
            "/ticket-time-entries"
          );

        const formatted =
          res.data.map((entry) => {
            const assignedUser =
              entry.assigned_to_name ||
              "Default";

            const backgroundColor =
              userColors[
                assignedUser
              ] ||
              userColors.Default;

            const borderColor =
              priorityBorders[
                entry.priority
              ] || "#d1d5db";

            return {
              id: entry.id,

              title:
                entry.ticket_title,

              start:
                new Date(
                  entry.start_time
                ),

              end: new Date(
                entry.end_time
              ),

              allDay: false,

              backgroundColor,

              borderColor,

              resource: {
                ...entry,
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
  // MOVE EVENT
  // =====================================================

  const moveEvent = async ({
    event,
    start,
    end,
  }) => {
    try {
      // =====================================================
      // DURATION
      // =====================================================

      const duration =
        Math.round(
          (end - start) / 60000
        );

      // =====================================================
      // UPDATE UI
      // =====================================================

      const updatedEvents =
        events.map((e) =>
          e.id === event.id
            ? {
                ...e,

                start,

                end,

                resource: {
                  ...e.resource,

                  start_time:
                    start,

                  end_time:
                    end,

                  duration_minutes:
                    duration,
                },
              }
            : e
        );

      setEvents(updatedEvents);

      // =====================================================
      // SAVE TO BACKEND
      // =====================================================

      await api.put(
        `/ticket-time-entries/${event.id}`,
        {
          start_time:
            start.toISOString(),

          end_time:
            end.toISOString(),

          duration_minutes:
            duration,
        }
      );

      console.log(
        "Event moved"
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

      // =====================================================
      // UPDATE UI
      // =====================================================

      const updatedEvents =
        events.map((e) =>
          e.id === event.id
            ? {
                ...e,

                start,

                end,

                resource: {
                  ...e.resource,

                  start_time:
                    start,

                  end_time:
                    end,

                  duration_minutes:
                    duration,
                },
              }
            : e
        );

      setEvents(updatedEvents);

      // =====================================================
      // SAVE
      // =====================================================

      await api.put(
        `/ticket-time-entries/${event.id}`,
        {
          start_time:
            start.toISOString(),

          end_time:
            end.toISOString(),

          duration_minutes:
            duration,
        }
      );

      console.log(
        "Resize saved"
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

      border: `3px solid ${event.borderColor}`,

      borderRadius: "14px",

      color: "#ffffff",

      fontSize: "12px",

      fontWeight: "600",

      padding: "4px 6px",

      overflow: "hidden",

      boxShadow:
        "0 2px 8px rgba(0,0,0,0.15)",
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

        {/* USER */}
        <div className="text-[10px] opacity-90 truncate">
          👤{" "}
          {
            event.resource
              ?.assigned_to_name
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
              ?.duration_minutes
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
            Ticket Calendar
          </h1>

          <p className="text-gray-500 mt-2">
            Ticket work session
            planner
          </p>
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
        {/* CALENDAR */}
        {/* ===================================================== */}

        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden p-4">
          <div
            style={{
              height: "82vh",
            }}
          >
            <DnDCalendar
              localizer={
                localizer
              }

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
// LEGEND COMPONENT
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