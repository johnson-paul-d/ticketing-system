import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

export default function TimeTracker() {
  const [tickets, setTickets] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedUser, setSelectedUser] =
    useState("All");

  // =====================================================
  // FETCH TICKETS
  // =====================================================

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets =
    async () => {
      try {
        setLoading(true);

        const res =
          await api.get("/tickets");

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
    date,
    minutes
  ) => {
    try {
      await api.post(
        "/ticket-time-entries",
        {
          ticket_id: ticketId,
          work_date: date,
          duration_minutes:
            minutes,
        }
      );

      fetchTickets();
    } catch (err) {
      console.error(err);
    }
  };

  // =====================================================
  // FILTER
  // =====================================================

  const filteredTickets =
    selectedUser === "All"
      ? tickets
      : tickets.filter(
          (t) =>
            t.assigned_to_name ===
            selectedUser
        );

  // =====================================================
  // USERS
  // =====================================================

  const users = [
    "All",
    ...new Set(
      tickets.map(
        (t) =>
          t.assigned_to_name
      )
    ),
  ];

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <MainLayout>
        <div className="p-8">
          Loading...
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
            Time Tracker
          </h1>

          <p className="text-gray-500 mt-2">
            Daily ticket work
            tracking
          </p>
        </div>

        {/* ===================================================== */}
        {/* FILTER */}
        {/* ===================================================== */}

        <div className="flex flex-wrap gap-3 mb-6">
          {users.map((user) => (
            <button
              key={user}
              onClick={() =>
                setSelectedUser(
                  user
                )
              }
              className={`px-4 py-2 rounded-2xl border text-sm font-medium transition ${
                selectedUser ===
                user
                  ? "bg-black text-white"
                  : "bg-white"
              }`}
            >
              {user}
            </button>
          ))}
        </div>

        {/* ===================================================== */}
        {/* TABLE */}
        {/* ===================================================== */}

        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-4 text-sm font-semibold">
                    Ticket
                  </th>

                  <th className="text-left p-4 text-sm font-semibold">
                    Assigned
                  </th>

                  <th className="text-left p-4 text-sm font-semibold">
                    Priority
                  </th>

                  <th className="text-left p-4 text-sm font-semibold">
                    Due Date
                  </th>

                  <th className="text-left p-4 text-sm font-semibold">
                    Total Time
                  </th>

                  <th className="text-left p-4 text-sm font-semibold">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredTickets.map(
                  (ticket) => (
                    <TicketRow
                      key={ticket.id}
                      ticket={ticket}
                      onLogTime={
                        logTime
                      }
                    />
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

// =====================================================
// TICKET ROW
// =====================================================

function TicketRow({
  ticket,
  onLogTime,
}) {
  const [minutes, setMinutes] =
    useState("");

  const today = new Date()
    .toISOString()
    .split("T")[0];

  const handleSave =
    async () => {
      if (!minutes) return;

      await onLogTime(
        ticket.id,
        today,
        Number(minutes)
      );

      setMinutes("");
    };

  const totalMinutes =
    ticket.total_minutes || 0;

  const priorityColor =
    ticket.priority === "High"
      ? "bg-red-100 text-red-600"
      : ticket.priority ===
        "Medium"
      ? "bg-orange-100 text-orange-600"
      : "bg-green-100 text-green-600";

  return (
    <tr className="border-b hover:bg-gray-50 transition">
      {/* ===================================================== */}
      {/* TITLE */}
      {/* ===================================================== */}

      <td className="p-4">
        <div className="font-semibold">
          {ticket.title}
        </div>

        <div className="text-xs text-gray-500 mt-1">
          #{ticket.id}
        </div>
      </td>

      {/* ===================================================== */}
      {/* ASSIGNED */}
      {/* ===================================================== */}

      <td className="p-4">
        <div className="text-sm">
          {
            ticket.assigned_to_name
          }
        </div>
      </td>

      {/* ===================================================== */}
      {/* PRIORITY */}
      {/* ===================================================== */}

      <td className="p-4">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${priorityColor}`}
        >
          {ticket.priority}
        </span>
      </td>

      {/* ===================================================== */}
      {/* DUE */}
      {/* ===================================================== */}

      <td className="p-4 text-sm">
        {ticket.due_date}
      </td>

      {/* ===================================================== */}
      {/* TOTAL */}
      {/* ===================================================== */}

      <td className="p-4">
        <div className="font-semibold">
          {Math.floor(
            totalMinutes / 60
          )}
          h{" "}
          {totalMinutes % 60}
          m
        </div>
      </td>

      {/* ===================================================== */}
      {/* LOG */}
      {/* ===================================================== */}

      <td className="p-4">
        <div className="flex gap-2">
          <input
            type="number"
            placeholder="mins"
            value={minutes}
            onChange={(e) =>
              setMinutes(
                e.target.value
              )
            }
            className="w-24 px-3 py-2 rounded-xl border text-sm"
          />

          <button
            onClick={
              handleSave
            }
            className="bg-black text-white px-4 py-2 rounded-xl text-sm font-medium hover:opacity-90 transition"
          >
            Log
          </button>
        </div>
      </td>
    </tr>
  );
}