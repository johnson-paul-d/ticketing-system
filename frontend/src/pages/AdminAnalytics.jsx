// =====================================================
// FILE: src/pages/AdminAnalytics.jsx
// =====================================================

import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// =====================================================
// HELPERS
// =====================================================

const getWeekLabel = (dateString) => {
  if (!dateString) return "No Due Date";

  const date = new Date(dateString);

  const firstDay = new Date(date.getFullYear(), 0, 1);

  const pastDays = Math.floor(
    (date - firstDay) / 86400000
  );

  const week = Math.ceil(
    (pastDays + firstDay.getDay() + 1) / 7
  );

  return `Week ${week}`;
};

const getMonthLabel = (dateString) => {
  if (!dateString) return "No Due Date";

  const date = new Date(dateString);

  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
};

const formatHours = (minutes) => {
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hrs === 0) return `${mins}m`;

  return `${hrs}h ${mins}m`;
};

const isOverdue = (ticket) => {
  if (!ticket.due_date) return false;

  return (
    new Date(ticket.due_date) < new Date() &&
    ticket.status !== "Completed"
  );
};

// =====================================================
// PAGE
// =====================================================

export default function AdminAnalytics() {
  const user = useAuthStore((state) => state.user);

  const [tickets, setTickets] = useState([]);

  const [loading, setLoading] = useState(true);

  const [groupBy, setGroupBy] = useState("user");

  const [periodType, setPeriodType] = useState("week");

  const [expandedRows, setExpandedRows] = useState([]);

  const [divisionFilter, setDivisionFilter] =
    useState("All");

  const [categoryFilter, setCategoryFilter] =
    useState("All");

  // =====================================================
  // SECURITY
  // =====================================================

  if (
    user?.role !== "Admin" &&
    user?.role !== "Super Admin"
  ) {
    return (
      <MainLayout>
        <div className="p-10 text-red-500 text-xl">
          Access Denied
        </div>
      </MainLayout>
    );
  }

  // =====================================================
  // FETCH
  // =====================================================

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);

      const res = await api.get("/tickets");

      setTickets(res.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // FILTERS
  // =====================================================

  const categories = [
    "All",
    ...new Set(
      tickets
        .map((t) => t.category)
        .filter(Boolean)
    ),
  ];

  const divisions = [
    "All",
    ...new Set(
      tickets
        .map((t) => t.division)
        .filter(Boolean)
    ),
  ];

  // =====================================================
  // GROUPED DATA
  // =====================================================

  const groupedData = useMemo(() => {
    const grouped = {};

    const filtered = tickets.filter((ticket) => {
      const divisionMatch =
        divisionFilter === "All" ||
        ticket.division === divisionFilter;

      const categoryMatch =
        categoryFilter === "All" ||
        ticket.category === categoryFilter;

      return divisionMatch && categoryMatch;
    });

    filtered.forEach((ticket) => {
      const group =
        groupBy === "user"
          ? ticket.assigned_to_name ||
            "Unassigned"
          : ticket.category ||
            "Uncategorized";

      const period =
        periodType === "week"
          ? getWeekLabel(ticket.due_date)
          : getMonthLabel(ticket.due_date);

      const key = `${group}-${period}`;

      if (!grouped[key]) {
        grouped[key] = {
          group,
          period,

          open: 0,
          progress: 0,
          waiting: 0,
          completed: 0,
          overdue: 0,
          total: 0,

          tickets: [],
        };
      }

      grouped[key].tickets.push(ticket);

      grouped[key].total++;

      switch (ticket.status) {
        case "Open":
          grouped[key].open++;
          break;

        case "In Progress":
          grouped[key].progress++;
          break;

        case "Waiting For Approval":
          grouped[key].waiting++;
          break;

        case "Completed":
          grouped[key].completed++;
          break;

        default:
          break;
      }

      if (isOverdue(ticket)) {
        grouped[key].overdue++;
      }
    });

    return Object.values(grouped).sort((a, b) =>
      a.group.localeCompare(b.group)
    );
  }, [
    tickets,
    groupBy,
    periodType,
    divisionFilter,
    categoryFilter,
  ]);

  // =====================================================
  // TOGGLE ROW
  // =====================================================

  const toggleRow = (key) => {
    setExpandedRows((prev) =>
      prev.includes(key)
        ? prev.filter((x) => x !== key)
        : [...prev, key]
    );
  };

  // =====================================================
  // EXPORT
  // =====================================================

  const exportExcel = () => {
    const rows = [];

    groupedData.forEach((group) => {
      group.tickets.forEach((ticket) => {
        rows.push({
          Group: group.group,
          Period: group.period,
          Ticket: ticket.title,
          Status: ticket.status,
          Priority: ticket.priority,
          Category: ticket.category,
          Division: ticket.division,
          DueDate: ticket.due_date,
          AssignedTo:
            ticket.assigned_to_name,
          TimeLogged: formatHours(
            (ticket.time_entries || []).reduce(
              (sum, entry) =>
                sum +
                (entry.duration_minutes ||
                  0),
              0
            )
          ),
        });
      });
    });

    const worksheet =
      XLSX.utils.json_to_sheet(rows);

    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Operations Review"
    );

    const excelBuffer = XLSX.write(
      workbook,
      {
        bookType: "xlsx",
        type: "array",
      }
    );

    const fileData = new Blob(
      [excelBuffer],
      {
        type: "application/octet-stream",
      }
    );

    saveAs(
      fileData,
      "operations-review.xlsx"
    );
  };

  // =====================================================
  // KPI
  // =====================================================

  const totalOpen = tickets.filter(
    (t) => t.status === "Open"
  ).length;

  const totalCompleted = tickets.filter(
    (t) => t.status === "Completed"
  ).length;

  const totalOverdue = tickets.filter(
    isOverdue
  ).length;

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
      <div className="p-4 lg:p-8">

        {/* ================================================= */}
        {/* HEADER */}
        {/* ================================================= */}

        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold">
              Operations Review
            </h1>

            <p className="text-gray-500 mt-2">
              Ticket delivery performance matrix
            </p>
          </div>

          <button
            onClick={exportExcel}
            className="bg-black text-white px-6 py-3 rounded-2xl hover:bg-gray-800 transition"
          >
            Export Excel
          </button>
        </div>

        {/* ================================================= */}
        {/* KPI CARDS */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">

          <KPI
            title="Open Tickets"
            value={totalOpen}
            color="bg-yellow-100 text-yellow-700"
          />

          <KPI
            title="Completed"
            value={totalCompleted}
            color="bg-green-100 text-green-700"
          />

          <KPI
            title="Overdue"
            value={totalOverdue}
            color="bg-red-100 text-red-700"
          />

        </div>

        {/* ================================================= */}
        {/* FILTERS */}
        {/* ================================================= */}

        <div className="bg-white rounded-3xl p-6 border mb-8">

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">

            <Filter
              label="Group By"
              value={groupBy}
              onChange={setGroupBy}
              options={[
                {
                  label: "User",
                  value: "user",
                },
                {
                  label: "Category",
                  value: "category",
                },
              ]}
            />

            <Filter
              label="Period"
              value={periodType}
              onChange={setPeriodType}
              options={[
                {
                  label: "Week",
                  value: "week",
                },
                {
                  label: "Month",
                  value: "month",
                },
              ]}
            />

            <Filter
              label="Division"
              value={divisionFilter}
              onChange={setDivisionFilter}
              options={divisions.map((d) => ({
                label: d,
                value: d,
              }))}
            />

            <Filter
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({
                label: c,
                value: c,
              }))}
            />

          </div>

        </div>

        {/* ================================================= */}
        {/* TABLE */}
        {/* ================================================= */}

        <div className="bg-white rounded-3xl border overflow-hidden">

          <div className="overflow-x-auto">

            <table className="w-full">

              <thead className="bg-gray-100">

                <tr className="text-left">

                  <th className="p-5 font-semibold">
                    Group
                  </th>

                  <th className="p-5 font-semibold">
                    Week / Month
                  </th>

                  <th className="p-5 font-semibold">
                    Open
                  </th>

                  <th className="p-5 font-semibold">
                    In Progress
                  </th>

                  <th className="p-5 font-semibold">
                    Waiting Approval
                  </th>

                  <th className="p-5 font-semibold">
                    Completed
                  </th>

                  <th className="p-5 font-semibold">
                    Overdue
                  </th>

                  <th className="p-5 font-semibold">
                    Total
                  </th>

                </tr>

              </thead>

              <tbody>

                {groupedData.map(
                  (group, index) => {
                    const rowKey = `${group.group}-${group.period}`;

                    const expanded =
                      expandedRows.includes(
                        rowKey
                      );

                    return (
                      <>
                        {/* ===================================== */}
                        {/* SUMMARY ROW */}
                        {/* ===================================== */}

                        <tr
                          key={rowKey}
                          onClick={() =>
                            toggleRow(rowKey)
                          }
                          className={`cursor-pointer border-t hover:bg-gray-50 transition ${
                            index % 2 === 0
                              ? "bg-white"
                              : "bg-gray-50"
                          }`}
                        >

                          <td className="p-5 font-semibold">
                            {expanded
                              ? "▼"
                              : "▶"}{" "}
                            {group.group}
                          </td>

                          <td className="p-5">
                            {group.period}
                          </td>

                          <td className="p-5">
                            <Badge
                              color="yellow"
                              value={group.open}
                            />
                          </td>

                          <td className="p-5">
                            <Badge
                              color="blue"
                              value={
                                group.progress
                              }
                            />
                          </td>

                          <td className="p-5">
                            <Badge
                              color="orange"
                              value={
                                group.waiting
                              }
                            />
                          </td>

                          <td className="p-5">
                            <Badge
                              color="green"
                              value={
                                group.completed
                              }
                            />
                          </td>

                          <td className="p-5">
                            <Badge
                              color="red"
                              value={
                                group.overdue
                              }
                            />
                          </td>

                          <td className="p-5 font-bold">
                            {group.total}
                          </td>

                        </tr>

                        {/* ===================================== */}
                        {/* EXPANDED DETAILS */}
                        {/* ===================================== */}

                        {expanded && (
                          <tr>
                            <td
                              colSpan="8"
                              className="bg-gray-50 p-6"
                            >

                              <div className="overflow-x-auto">

                                <table className="w-full bg-white rounded-2xl overflow-hidden">

                                  <thead className="bg-black text-white">

                                    <tr>

                                      <th className="p-4 text-left">
                                        Ticket
                                      </th>

                                      <th className="p-4 text-left">
                                        Status
                                      </th>

                                      <th className="p-4 text-left">
                                        Priority
                                      </th>

                                      <th className="p-4 text-left">
                                        Due Date
                                      </th>

                                      <th className="p-4 text-left">
                                        Category
                                      </th>

                                      <th className="p-4 text-left">
                                        Division
                                      </th>

                                      <th className="p-4 text-left">
                                        Time Logged
                                      </th>

                                    </tr>

                                  </thead>

                                  <tbody>

                                    {group.tickets.map(
                                      (
                                        ticket,
                                        idx
                                      ) => {
                                        const totalMinutes =
                                          (
                                            ticket.time_entries ||
                                            []
                                          ).reduce(
                                            (
                                              sum,
                                              entry
                                            ) =>
                                              sum +
                                              (
                                                entry.duration_minutes ||
                                                0
                                              ),
                                            0
                                          );

                                        return (
                                          <tr
                                            key={
                                              ticket.id
                                            }
                                            className={`border-t ${
                                              idx %
                                                2 ===
                                              0
                                                ? "bg-white"
                                                : "bg-gray-50"
                                            }`}
                                          >

                                            <td className="p-4 font-medium">
                                              {
                                                ticket.title
                                              }
                                            </td>

                                            <td className="p-4">
                                              <StatusBadge
                                                status={
                                                  ticket.status
                                                }
                                              />
                                            </td>

                                            <td className="p-4">
                                              {
                                                ticket.priority
                                              }
                                            </td>

                                            <td className="p-4">
                                              {ticket.due_date
                                                ? new Date(
                                                    ticket.due_date
                                                  ).toLocaleDateString()
                                                : "-"}
                                            </td>

                                            <td className="p-4">
                                              {
                                                ticket.category
                                              }
                                            </td>

                                            <td className="p-4">
                                              {
                                                ticket.division
                                              }
                                            </td>

                                            <td className="p-4">
                                              {formatHours(
                                                totalMinutes
                                              )}
                                            </td>

                                          </tr>
                                        );
                                      }
                                    )}

                                  </tbody>

                                </table>

                              </div>

                            </td>
                          </tr>
                        )}
                      </>
                    );
                  }
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
// COMPONENTS
// =====================================================

function KPI({
  title,
  value,
  color,
}) {
  return (
    <div className="bg-white rounded-3xl border p-6">
      <p className="text-gray-500">
        {title}
      </p>

      <div
        className={`inline-block mt-4 px-4 py-2 rounded-2xl text-3xl font-bold ${color}`}
      >
        {value}
      </div>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">
        {label}
      </p>

      <select
        value={value}
        onChange={(e) =>
          onChange(e.target.value)
        }
        className="w-full border rounded-2xl px-4 py-3 bg-white"
      >
        {options.map((o) => (
          <option
            key={o.value}
            value={o.value}
          >
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function Badge({
  value,
  color,
}) {
  const colors = {
    yellow:
      "bg-yellow-100 text-yellow-700",
    blue: "bg-blue-100 text-blue-700",
    orange:
      "bg-orange-100 text-orange-700",
    green:
      "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-semibold ${colors[color]}`}
    >
      {value}
    </span>
  );
}

function StatusBadge({
  status,
}) {
  const map = {
    Open:
      "bg-yellow-100 text-yellow-700",

    "In Progress":
      "bg-blue-100 text-blue-700",

    "Waiting For Approval":
      "bg-orange-100 text-orange-700",

    Completed:
      "bg-green-100 text-green-700",
  };

  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-semibold ${
        map[status] ||
        "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}