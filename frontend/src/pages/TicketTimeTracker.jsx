import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

// =====================================================
// TIME TRACKER
// =====================================================

export default function TimeTracker() {
  const [tickets, setTickets] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [selectedUser, setSelectedUser] =
    useState("All");

  // =====================================================
  // AVAILABILITY STATES
  // =====================================================

  const [availabilityUser, setAvailabilityUser] =
    useState("");

  const [availabilityDate, setAvailabilityDate] =
    useState(
      new Date()
        .toISOString()
        .split("T")[0]
    );

  const [permissionHours, setPermissionHours] =
    useState("0");

  const [leaveType, setLeaveType] =
    useState("none");

  const [availabilityData, setAvailabilityData] =
    useState([]);

  // =====================================================
  // FETCH DATA
  // =====================================================

  useEffect(() => {
    fetchTickets();
    fetchAvailability();
  }, []);

  // =====================================================
  // FETCH TICKETS
  // =====================================================

  const fetchTickets =
    async () => {
      try {
        setLoading(true);

        /*
          BACKEND SHOULD RETURN:

          [
            {
              id,
              title,
              assigned_to_name,
              priority,
              due_date,

              time_entries: [
                {
                  id,
                  work_date,
                  duration_minutes
                }
              ]
            }
          ]
        */

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
  // FETCH AVAILABILITY
  // =====================================================

  const fetchAvailability =
    async () => {
      try {
        const res =
          await api.get(
            "/employee-availability"
          );

        setAvailabilityData(
          res.data
        );
      } catch (err) {
        console.error(err);
      }
    };

  // =====================================================
  // USERS
  // =====================================================

  const users = [
    "All",

    ...new Set(
      tickets
        .map(
          (t) =>
            t.assigned_to_name
        )
        .filter(Boolean)
    ),
  ];

  // =====================================================
  // SAVE AVAILABILITY
  // =====================================================

  const saveAvailability =
    async () => {
      try {
        // =====================================================
        // MAX 2 HOURS VALIDATION
        // =====================================================

        if (
          Number(
            permissionHours
          ) > 2
        ) {
          alert(
            "Maximum permission allowed is 2 hours"
          );

          return;
        }

        await api.post(
          "/employee-availability",
          {
            employee_name:
              availabilityUser,

            work_date:
              availabilityDate,

            permission_hours:
              Number(
                permissionHours
              ),

            leave_type:
              leaveType,
          }
        );

        alert(
          "Availability saved"
        );

        fetchAvailability();
      } catch (err) {
        console.error(err);
      }
    };

  // =====================================================
  // LOG TIME
  // =====================================================

  const logTime = async (
    ticketId,
    workDate,
    minutes
  ) => {
    try {
      await api.post(
        "/ticket-time-entries",
        {
          ticket_id: ticketId,

          work_date: workDate,

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
  // GROUP BY DATE
  // =====================================================

  const groupedByDate =
    filteredTickets.reduce(
      (acc, ticket) => {
        if (
          ticket.time_entries &&
          ticket.time_entries.length
        ) {
          ticket.time_entries.forEach(
            (entry) => {
              const date =
                entry.work_date;

              if (!acc[date]) {
                acc[date] = [];
              }

              acc[date].push({
                ticket,
                entry,
              });
            }
          );
        }

        return acc;
      },
      {}
    );

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
            Daily work tracking &
            availability
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
        {/* AVAILABILITY */}
        {/* ===================================================== */}

        <div className="bg-white rounded-3xl border p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">
            Employee Availability
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {/* USER */}
            <select
              className="border rounded-2xl px-4 py-3"
              value={
                availabilityUser
              }
              onChange={(e) =>
                setAvailabilityUser(
                  e.target.value
                )
              }
            >
              <option value="">
                Select User
              </option>

              {users
                .filter(
                  (u) =>
                    u !== "All"
                )
                .map((user) => (
                  <option
                    key={user}
                    value={user}
                  >
                    {user}
                  </option>
                ))}
            </select>

            {/* DATE */}
            <input
              type="date"
              value={
                availabilityDate
              }
              onChange={(e) =>
                setAvailabilityDate(
                  e.target.value
                )
              }
              className="border rounded-2xl px-4 py-3"
            />

            {/* PERMISSION */}
            <select
              value={
                permissionHours
              }
              onChange={(e) =>
                setPermissionHours(
                  e.target.value
                )
              }
              className="border rounded-2xl px-4 py-3"
            >
              <option value="0">
                No Permission
              </option>

              <option value="1">
                1 Hour Permission
              </option>

              <option value="2">
                2 Hour Permission
              </option>
            </select>

            {/* LEAVE */}
            <select
              value={leaveType}
              onChange={(e) =>
                setLeaveType(
                  e.target.value
                )
              }
              className="border rounded-2xl px-4 py-3"
            >
              <option value="none">
                No Leave
              </option>

              <option value="half_day">
                Half Day
              </option>

              <option value="full_day">
                Full Day
              </option>
            </select>

            {/* SAVE */}
            <button
              onClick={
                saveAvailability
              }
              className="bg-black text-white rounded-2xl px-4 py-3 font-semibold"
            >
              Save
            </button>
          </div>
        </div>

        {/* ===================================================== */}
        {/* LOG TIME */}
        {/* ===================================================== */}

        <div className="bg-white rounded-3xl border p-6 mb-6 shadow-sm">
          <h2 className="text-xl font-bold mb-4">
            Log Work Time
          </h2>

          <div className="space-y-4">
            {filteredTickets.map(
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

        {/* ===================================================== */}
        {/* DATE WISE TRACKING */}
        {/* ===================================================== */}

        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          {Object.entries(
            groupedByDate
          )

            .sort(
              ([a], [b]) =>
                new Date(b) -
                new Date(a)
            )

            .map(
              ([date, entries]) => {
                const totalMinutes =
                  entries.reduce(
                    (
                      sum,
                      item
                    ) =>
                      sum +
                      item.entry
                        .duration_minutes,
                    0
                  );

                return (
                  <div
                    key={date}
                    className="border-b"
                  >
                    {/* DATE HEADER */}

                    <div className="bg-gray-50 px-6 py-4 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">
                          {new Date(
                            date
                          ).toLocaleDateString(
                            "en-IN",
                            {
                              weekday:
                                "long",
                              year:
                                "numeric",
                              month:
                                "long",
                              day: "numeric",
                            }
                          )}
                        </h2>

                        <p className="text-sm text-gray-500 mt-1">
                          {
                            entries.length
                          }{" "}
                          tickets
                          worked
                        </p>
                      </div>

                      <div className="text-right">
                        <div className="text-xl font-bold">
                          {Math.floor(
                            totalMinutes /
                              60
                          )}
                          h{" "}
                          {totalMinutes %
                            60}
                          m
                        </div>

                        <div className="text-xs text-gray-500">
                          Total
                          logged
                        </div>
                      </div>
                    </div>

                    {/* TABLE */}

                    <table className="w-full">
                      <thead className="bg-white border-b">
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
                            Worked Time
                          </th>

                          <th className="text-left p-4 text-sm font-semibold">
                            Capacity
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {entries.map(
                          ({
                            ticket,
                            entry,
                          }) => {
                            const availability =
                              availabilityData.find(
                                (
                                  a
                                ) =>
                                  a.employee_name ===
                                    ticket.assigned_to_name &&
                                  a.work_date ===
                                    date
                              );

                            // =====================================================
                            // CAPACITY
                            // =====================================================

                            let availableHours = 8;

                            if (
                              availability?.leave_type ===
                              "half_day"
                            ) {
                              availableHours = 4;
                            }

                            if (
                              availability?.leave_type ===
                              "full_day"
                            ) {
                              availableHours = 0;
                            }

                            availableHours -=
                              availability?.permission_hours ||
                              0;

                            const priorityColor =
                              ticket.priority ===
                              "High"
                                ? "bg-red-100 text-red-600"
                                : ticket.priority ===
                                  "Medium"
                                ? "bg-orange-100 text-orange-600"
                                : "bg-green-100 text-green-600";

                            return (
                              <tr
                                key={
                                  entry.id
                                }
                                className="border-b hover:bg-gray-50"
                              >
                                {/* TITLE */}

                                <td className="p-4">
                                  <div className="font-semibold">
                                    {
                                      ticket.title
                                    }
                                  </div>

                                  <div className="text-xs text-gray-500 mt-1">
                                    #
                                    {
                                      ticket.id
                                    }
                                  </div>
                                </td>

                                {/* USER */}

                                <td className="p-4 text-sm">
                                  {
                                    ticket.assigned_to_name
                                  }
                                </td>

                                {/* PRIORITY */}

                                <td className="p-4">
                                  <span
                                    className={`px-3 py-1 rounded-full text-xs font-semibold ${priorityColor}`}
                                  >
                                    {
                                      ticket.priority
                                    }
                                  </span>
                                </td>

                                {/* WORKED */}

                                <td className="p-4">
                                  <div className="font-semibold">
                                    {Math.floor(
                                      entry.duration_minutes /
                                        60
                                    )}
                                    h{" "}
                                    {entry.duration_minutes %
                                      60}
                                    m
                                  </div>
                                </td>

                                {/* CAPACITY */}

                                <td className="p-4">
                                  <div className="font-semibold">
                                    {
                                      availableHours
                                    }
                                    h
                                  </div>

                                  {availability?.leave_type !==
                                    "none" && (
                                    <div className="text-xs text-red-500 mt-1">
                                      {availability.leave_type ===
                                      "half_day"
                                        ? "Half Day"
                                        : "Full Day"}
                                    </div>
                                  )}

                                  {availability?.permission_hours >
                                    0 && (
                                    <div className="text-xs text-orange-500">
                                      {
                                        availability.permission_hours
                                      }
                                      h
                                      Permission
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          }
                        )}
                      </tbody>
                    </table>
                  </div>
                );
              }
            )}
        </div>
      </div>
    </MainLayout>
  );
}

// =====================================================
// LOG TIME CARD
// =====================================================

function LogTimeCard({
  ticket,
  onLogTime,
}) {
  const [minutes, setMinutes] =
    useState("");

  const [date, setDate] =
    useState(
      new Date()
        .toISOString()
        .split("T")[0]
    );

  const handleSave =
    async () => {
      if (!minutes) return;

      await onLogTime(
        ticket.id,
        date,
        Number(minutes)
      );

      setMinutes("");
    };

  return (
    <div className="border rounded-2xl p-4 flex flex-col md:flex-row md:items-center gap-4">
      {/* TITLE */}

      <div className="flex-1">
        <div className="font-semibold">
          {ticket.title}
        </div>

        <div className="text-xs text-gray-500 mt-1">
          {
            ticket.assigned_to_name
          }
        </div>
      </div>

      {/* DATE */}

      <input
        type="date"
        value={date}
        onChange={(e) =>
          setDate(
            e.target.value
          )
        }
        className="border rounded-xl px-3 py-2"
      />

      {/* MINUTES */}

      <input
        type="number"
        placeholder="Minutes"
        value={minutes}
        onChange={(e) =>
          setMinutes(
            e.target.value
          )
        }
        className="border rounded-xl px-3 py-2 w-32"
      />

      {/* SAVE */}

      <button
        onClick={handleSave}
        className="bg-black text-white px-5 py-2 rounded-xl font-medium"
      >
        Log Time
      </button>
    </div>
  );
}