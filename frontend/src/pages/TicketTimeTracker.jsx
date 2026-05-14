// =====================================================
// TIME TRACKER
// FILE: src/pages/TimeTracker.jsx
// =====================================================

import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import moment from "moment";

export default function TimeTracker() {
  const [tickets, setTickets] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  // =====================================================
  // FETCH
  // =====================================================

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets =
    async () => {
      try {
        setLoading(true);

        const res =
          await api.get(
            "/tickets"
          );

        setTickets(res.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

  // =====================================================
  // LOG TIME
  // =====================================================

  const logTime = async (
    ticketId,
    workDate,
    startTime,
    endTime,
    notes
  ) => {
    try {
      const duration =
        Math.round(
          (new Date(
            endTime
          ) -
            new Date(
              startTime
            )) /
            60000
        );

      await api.post(
        "/ticket-time-entries",
        {
          ticket_id: ticketId,

          work_date:
            workDate,

          start_time:
            startTime,

          end_time:
            endTime,

          duration_minutes:
            duration,

          notes,
        }
      );

      fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

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
            Time Tracker
          </h1>

          <p className="text-gray-500 mt-2">
            Log work sessions
          </p>
        </div>

        {/* TICKETS */}

        <div className="space-y-4">
          {tickets.map(
            (ticket) => (
              <LogTimeCard
                key={ticket.id}
                ticket={ticket}
                onLogTime={
                  logTime
                }
              />
            )
          )}
        </div>
      </div>
    </MainLayout>
  );
}

// =====================================================
// CARD
// =====================================================

function LogTimeCard({
  ticket,
  onLogTime,
}) {
  const [workDate, setWorkDate] =
    useState(
      new Date()
        .toISOString()
        .split("T")[0]
    );

  const [startTime, setStartTime] =
    useState("");

  const [endTime, setEndTime] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const handleSave =
    async () => {
      if (
        !startTime ||
        !endTime
      ) {
        return alert(
          "Select start & end time"
        );
      }

      await onLogTime(
        ticket.id,
        workDate,
        startTime,
        endTime,
        notes
      );

      alert(
        "Time logged"
      );

      setNotes("");
    };

  // =====================================================
  // DURATION
  // =====================================================

  let duration = 0;

  if (
    startTime &&
    endTime
  ) {
    duration = Math.round(
      (new Date(endTime) -
        new Date(
          startTime
        )) /
        60000
    );
  }

  return (
    <div className="bg-white rounded-3xl border p-6 shadow-sm">
      {/* HEADER */}

      <div className="mb-5">
        <h2 className="text-xl font-bold">
          {ticket.title}
        </h2>

        <p className="text-gray-500 mt-1">
          {
            ticket.assigned_to_name
          }
        </p>
      </div>

      {/* FORM */}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* DATE */}

        <input
          type="date"
          value={workDate}
          onChange={(e) =>
            setWorkDate(
              e.target.value
            )
          }
          className="border rounded-2xl px-4 py-3"
        />

        {/* START */}

        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) =>
            setStartTime(
              e.target.value
            )
          }
          className="border rounded-2xl px-4 py-3"
        />

        {/* END */}

        <input
          type="datetime-local"
          value={endTime}
          onChange={(e) =>
            setEndTime(
              e.target.value
            )
          }
          className="border rounded-2xl px-4 py-3"
        />

        {/* NOTES */}

        <input
          type="text"
          placeholder="Work notes"
          value={notes}
          onChange={(e) =>
            setNotes(
              e.target.value
            )
          }
          className="border rounded-2xl px-4 py-3"
        />

        {/* SAVE */}

        <button
          onClick={handleSave}
          className="bg-black hover:bg-gray-800 text-white rounded-2xl px-6 py-3 font-semibold"
        >
          Log Time
        </button>
      </div>

      {/* DURATION */}

      <div className="mt-4">
        <span className="bg-gray-100 px-4 py-2 rounded-full text-sm font-medium">
          ⏱ Duration:{" "}
          {Math.floor(
            duration / 60
          )}
          h{" "}
          {duration % 60}m
        </span>
      </div>

      {/* PREVIOUS LOGS */}

      {ticket.time_entries &&
        ticket.time_entries
          .length > 0 && (
          <div className="mt-6 border-t pt-6">
            <h3 className="font-bold mb-4">
              Previous Logs
            </h3>

            <div className="space-y-3">
              {ticket.time_entries.map(
                (entry) => (
                  <div
                    key={entry.id}
                    className="bg-gray-50 border rounded-2xl p-4"
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                      <div>
                        <div className="font-semibold">
                          📅{" "}
                          {
                            entry.work_date
                          }
                        </div>

                        <div className="text-sm text-gray-500 mt-1">
                          🕒{" "}
                          {moment(
                            entry.start_time
                          ).format(
                            "hh:mm A"
                          )}{" "}
                          -
                          {" "}
                          {moment(
                            entry.end_time
                          ).format(
                            "hh:mm A"
                          )}
                        </div>

                        {entry.notes && (
                          <div className="text-sm mt-2">
                            {
                              entry.notes
                            }
                          </div>
                        )}
                      </div>

                      <div className="text-lg font-bold">
                        {Math.floor(
                          entry.duration_minutes /
                            60
                        )}
                        h{" "}
                        {entry.duration_minutes %
                          60}
                        m
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
    </div>
  );
}