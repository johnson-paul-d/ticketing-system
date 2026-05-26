// FILE: src/pages/AdminAnalytics.jsx

import React, { useEffect, useMemo, useState } from "react";
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
  const pastDays = Math.floor((date - firstDay) / 86400000);
  const week = Math.ceil((pastDays + firstDay.getDay() + 1) / 7);
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
  return new Date(ticket.due_date) < new Date() && ticket.status !== "Completed";
};

// =====================================================
// PAGE
// =====================================================

export default function AdminAnalytics() {
  const user = useAuthStore((state) => state.user);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState("user");
  const [divisionFilter, setDivisionFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [overdueFilter, setOverdueFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");

  // =====================================================
  // SECURITY
  // =====================================================
  if (user?.role !== "Admin" && user?.role !== "Super Admin") {
    return (
      <MainLayout>
        <div className="p-10 text-red-500 text-xl">Access Denied</div>
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
    ...new Set(tickets.map((t) => t.category).filter(Boolean)),
  ];

  const divisions = [
    "All",
    ...new Set(tickets.map((t) => t.division).filter(Boolean)),
  ];

  const months = useMemo(() => {
    const monthValues = tickets.map((ticket) => getMonthLabel(ticket.due_date));
    return ["All", ...new Set(monthValues)];
  }, [tickets]);

  // =====================================================
  // HIERARCHICAL GROUPED DATA (Group → Month → Week)
  // =====================================================
  const groupedHierarchy = useMemo(() => {
    const groups = {}; // { groupName: { groupName, months: { monthLabel: { monthLabel, weeks: { weekLabel: { weekLabel, tickets: [], ...aggregates } } } } }

    const filtered = tickets.filter((ticket) => {
      const divisionMatch =
        divisionFilter === "All" || ticket.division === divisionFilter;
      const categoryMatch =
        categoryFilter === "All" || ticket.category === categoryFilter;
      const overdueMatch =
        overdueFilter === "All"
          ? true
          : overdueFilter === "Overdue"
          ? isOverdue(ticket)
          : !isOverdue(ticket);
      const monthMatch =
        monthFilter === "All"
          ? true
          : getMonthLabel(ticket.due_date) === monthFilter;
      return divisionMatch && categoryMatch && overdueMatch && monthMatch;
    });

    filtered.forEach((ticket) => {
      const weekLabel = getWeekLabel(ticket.due_date);
      const monthLabel = getMonthLabel(ticket.due_date);

      let groupName = "Unknown";
      if (groupBy === "user") {
        groupName = ticket.assigned_to_name || "Unassigned";
      } else if (groupBy === "category") {
        groupName = ticket.category || "Uncategorized";
      } else if (groupBy === "given_by") {
        groupName = ticket.given_by || "Unknown";
      }

      // Ensure group exists
      if (!groups[groupName]) {
        groups[groupName] = {
          groupName,
          months: {},
        };
      }
      const group = groups[groupName];

      // Ensure month exists
      if (!group.months[monthLabel]) {
        group.months[monthLabel] = {
          monthLabel,
          weeks: {},
        };
      }
      const monthObj = group.months[monthLabel];

      // Ensure week exists
      if (!monthObj.weeks[weekLabel]) {
        monthObj.weeks[weekLabel] = {
          weekLabel,
          tickets: [],
          open: 0,
          progress: 0,
          completed: 0,
          overdue: 0,
          total: 0,
          loggedMinutes: 0,
          allottedMinutes: 0,
        };
      }
      const weekObj = monthObj.weeks[weekLabel];

      // Push ticket and update aggregates
      weekObj.tickets.push(ticket);
      weekObj.total++;

      const totalMinutes = (ticket.time_entries || []).reduce(
        (sum, entry) => sum + (entry.duration_minutes || 0),
        0
      );
      weekObj.loggedMinutes += totalMinutes;
      weekObj.allottedMinutes += ticket.allotted_minutes || 0;

      switch (ticket.status) {
        case "Open":
          weekObj.open++;
          break;
        case "In Progress":
          weekObj.progress++;
          break;
        case "Completed":
          weekObj.completed++;
          break;
        default:
          break;
      }

      if (isOverdue(ticket)) {
        weekObj.overdue++;
      }
    });

    // Optional: sort months and weeks (by date order)
    for (const group of Object.values(groups)) {
      // Sort months chronologically (oldest first)
      const sortedMonths = Object.values(group.months).sort((a, b) => {
        return new Date(a.monthLabel) - new Date(b.monthLabel);
      });
      group.months = Object.fromEntries(
        sortedMonths.map((m) => [m.monthLabel, m])
      );

      for (const month of Object.values(group.months)) {
        // Sort weeks by week number
        const sortedWeeks = Object.values(month.weeks).sort((a, b) => {
          const weekA = parseInt(a.weekLabel.split(" ")[1]) || 0;
          const weekB = parseInt(b.weekLabel.split(" ")[1]) || 0;
          return weekA - weekB;
        });
        month.weeks = Object.fromEntries(
          sortedWeeks.map((w) => [w.weekLabel, w])
        );
      }
    }

    return groups;
  }, [tickets, groupBy, divisionFilter, categoryFilter, overdueFilter, monthFilter]);

  // =====================================================
  // EXPORT EXCEL (traverse hierarchy)
  // =====================================================
  const exportExcel = () => {
    const rows = [];
    for (const group of Object.values(groupedHierarchy)) {
      for (const month of Object.values(group.months)) {
        for (const week of Object.values(month.weeks)) {
          week.tickets.forEach((ticket) => {
            rows.push({
              Group: group.groupName,
              Month: month.monthLabel,
              Week: week.weekLabel,
              Ticket: ticket.title,
              Status: ticket.status,
              Priority: ticket.priority,
              Category: ticket.category,
              Division: ticket.division,
              DueDate: ticket.due_date,
              AssignedTo: ticket.assigned_to_name,
              TimeLogged: formatHours(
                (ticket.time_entries || []).reduce(
                  (sum, entry) => sum + (entry.duration_minutes || 0),
                  0
                )
              ),
            });
          });
        }
      }
    }
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Operations Review");
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
    });
    const fileData = new Blob([excelBuffer], {
      type: "application/octet-stream",
    });
    saveAs(fileData, "operations-review.xlsx");
  };

  // =====================================================
  // KPI (based on all tickets, not filtered)
  // =====================================================
  const totalOpen = tickets.filter((t) => t.status === "Open").length;
  const totalCompleted = tickets.filter((t) => t.status === "Completed").length;
  const totalOverdue = tickets.filter(isOverdue).length;

  // =====================================================
  // LOADING
  // =====================================================
  if (loading) {
    return (
      <MainLayout>
        <div className="p-10">Loading...</div>
      </MainLayout>
    );
  }

  // =====================================================
  // UI
  // =====================================================
  return (
    <MainLayout>
      <div className="p-4 lg:p-8">
        {/* HEADER */}
        <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold">Operations Review</h1>
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

        {/* KPI CARDS */}
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

        {/* FILTERS */}
        <div className="bg-white rounded-3xl p-6 border mb-8">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
            <Filter
              label="Group By"
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { label: "User", value: "user" },
                { label: "Category", value: "category" },
                { label: "Given By", value: "given_by" },
              ]}
            />
            <Filter
              label="Division"
              value={divisionFilter}
              onChange={setDivisionFilter}
              options={divisions.map((d) => ({ label: d, value: d }))}
            />
            <Filter
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({ label: c, value: c }))}
            />
            <Filter
              label="Overdue Status"
              value={overdueFilter}
              onChange={setOverdueFilter}
              options={[
                { label: "All Tasks", value: "All" },
                { label: "Only Overdue", value: "Overdue" },
                { label: "Non Overdue", value: "NonOverdue" },
              ]}
            />
            <Filter
              label="Month"
              value={monthFilter}
              onChange={setMonthFilter}
              options={months.map((m) => ({ label: m, value: m }))}
            />
          </div>
        </div>

        {/* NEW HIERARCHICAL UI: Group → Month → Week */}
        <div className="space-y-5 mb-6">
          {Object.values(groupedHierarchy).map((group) => (
            <div key={group.groupName} className="bg-white rounded-3xl border p-5">
              {/* Group Title */}
              <h2 className="text-2xl font-bold mb-4 border-b pb-2">
                {group.groupName}
              </h2>

              {/* Months container */}
              <div className="space-y-4">
                {Object.values(group.months).map((month) => (
                  <div
                    key={month.monthLabel}
                    className="bg-gray-100 rounded-2xl p-4"
                  >
                    {/* Month Label */}
                    <h3 className="text-xl font-bold">{month.monthLabel}</h3>

                    {/* Weeks List */}
                    <div className="mt-3 ml-4 space-y-2">
                      {Object.values(month.weeks).map((week) => (
                        <div
                          key={week.weekLabel}
                          className="text-gray-600 font-medium"
                        >
                          • {week.weekLabel}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </MainLayout>
  );
}

// =====================================================
// COMPONENTS
// =====================================================
function KPI({ title, value, color }) {
  return (
    <div className="bg-white rounded-3xl border p-6">
      <p className="text-gray-500">{title}</p>
      <div
        className={`inline-block mt-4 px-4 py-2 rounded-2xl text-3xl font-bold ${color}`}
      >
        {value}
      </div>
    </div>
  );
}

function Filter({ label, value, onChange, options }) {
  return (
    <div>
      <p className="text-sm text-gray-500 mb-2">{label}</p>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border rounded-2xl px-4 py-3 bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}