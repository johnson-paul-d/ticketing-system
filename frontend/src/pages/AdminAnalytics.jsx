// FILE: src/pages/AdminAnalytics.jsx

import React, { useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// ─── Helpers ────────────────────────────────────────────────────────────────

const getWeekLabel = (dateString) => {
  if (!dateString) return "No due date";
  const date = new Date(dateString);
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date - firstDay) / 86400000 + firstDay.getDay() + 1) / 7);
  return `Week ${week}`;
};

const getMonthLabel = (dateString) => {
  if (!dateString) return "No due date";
  return new Date(dateString).toLocaleDateString("en-US", {
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

const formatDate = (dateString) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
};

const isOverdue = (ticket) => {
  if (!ticket.due_date) return false;
  return new Date(ticket.due_date) < new Date() && ticket.status !== "Completed";
};

const getInitials = (name = "") =>
  name.split(" ").slice(0, 2).map((n) => n[0]).join("").toUpperCase();

const AVATAR_COLORS = [
  { bg: "#EEF2FF", text: "#4338CA" },
  { bg: "#F0FDF4", text: "#15803D" },
  { bg: "#FFF7ED", text: "#C2410C" },
  { bg: "#FDF2F8", text: "#9D174D" },
  { bg: "#F0F9FF", text: "#0369A1" },
  { bg: "#FEFCE8", text: "#A16207" },
];

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_DOT = {
  Open: "bg-amber-400",
  "In Progress": "bg-blue-500",
  "Waiting For Approval": "bg-purple-400",
  Completed: "bg-green-500",
};

const PRIORITY_STYLES = {
  High: "bg-red-50 text-red-700 border border-red-200",
  Medium: "bg-amber-50 text-amber-700 border border-amber-200",
  Low: "bg-gray-100 text-gray-500",
};

// ─── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({ label, value, variant }) {
  const variants = {
    warn: "text-amber-600",
    danger: "text-red-600",
    success: "text-green-600",
    neutral: "text-gray-800",
  };
  return (
    <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
        {label}
      </p>
      <p className={`text-3xl font-semibold ${variants[variant] || variants.neutral}`}>
        {value}
      </p>
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-black/10"
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

function StatusBadge({ status }) {
  const styles = {
    Open: "bg-amber-50 text-amber-700",
    "In Progress": "bg-blue-50 text-blue-700",
    "Waiting For Approval": "bg-purple-50 text-purple-700",
    Completed: "bg-green-50 text-green-700",
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

// Progress bar showing ticket status split
function StatusProgressBar({ open, inProgress, waiting, completed, total }) {
  if (!total) return null;
  const pct = (n) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden gap-px bg-gray-100 mt-1">
      <div className="bg-green-500 rounded-l-full" style={{ width: pct(completed) }} title={`Completed: ${completed}`} />
      <div className="bg-blue-500" style={{ width: pct(inProgress) }} title={`In Progress: ${inProgress}`} />
      <div className="bg-purple-400" style={{ width: pct(waiting) }} title={`Waiting: ${waiting}`} />
      <div className="bg-amber-400" style={{ width: pct(open) }} title={`Open: ${open}`} />
    </div>
  );
}

// Individual ticket row inside the drill-down
function TicketRow({ ticket, idx }) {
  const overdue = isOverdue(ticket);
  const totalLogged = (ticket.time_entries || []).reduce(
    (sum, e) => sum + (e.duration_minutes || 0),
    0
  );

  return (
    <div
      className={`flex items-center gap-3 py-3 px-4 text-sm border-b border-gray-50 last:border-0 ${
        overdue ? "bg-red-50/40" : idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"
      }`}
    >
      {/* Status dot */}
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[ticket.status] || "bg-gray-300"}`}
        title={ticket.status}
      />

      {/* Overdue flag */}
      {overdue && (
        <span className="text-red-500 text-xs font-bold flex-shrink-0">LATE</span>
      )}

      {/* Title */}
      <span
        className={`flex-1 min-w-0 truncate font-medium ${overdue ? "text-red-700" : "text-gray-800"}`}
        title={ticket.title}
      >
        {ticket.title}
      </span>

      {/* Meta chips */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {ticket.priority && (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[ticket.priority] || "bg-gray-100 text-gray-500"}`}>
            {ticket.priority}
          </span>
        )}
        <StatusBadge status={ticket.status} />
        <span className={`text-xs tabular-nums ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
          {formatDate(ticket.due_date)}
        </span>
        <span className="text-xs text-gray-400 tabular-nums w-14 text-right">
          {formatHours(totalLogged)}
        </span>
      </div>
    </div>
  );
}

// Person card with summary + collapsible drill-down
function PersonCard({ group, colorIndex }) {
  const [open, setOpen] = useState(false);
  const { groupName, months, tickets: allTickets } = group;

  const overdueCount = allTickets.filter(isOverdue).length;
  const openCount = allTickets.filter((t) => t.status === "Open").length;
  const inProgressCount = allTickets.filter((t) => t.status === "In Progress").length;
  const waitingCount = allTickets.filter((t) => t.status === "Waiting For Approval").length;
  const completedCount = allTickets.filter((t) => t.status === "Completed").length;
  const totalLogged = allTickets.reduce(
    (s, t) => s + (t.time_entries || []).reduce((ss, e) => ss + (e.duration_minutes || 0), 0),
    0
  );
  const totalAllotted = allTickets.reduce((s, t) => s + (t.allotted_minutes || 0), 0);

  const { bg, text } = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const hasOverdue = overdueCount > 0;

  return (
    <div
      className={`rounded-2xl border bg-white overflow-hidden transition-shadow ${
        hasOverdue ? "border-red-200 shadow-sm shadow-red-50" : "border-gray-100"
      }`}
    >
      {/* Header — always visible */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50/70 transition-colors"
      >
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0"
          style={{ background: bg, color: text }}
        >
          {getInitials(groupName)}
        </div>

        {/* Name + progress bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-gray-900 text-sm">{groupName}</span>
            {hasOverdue && (
              <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                ⚠ {overdueCount} overdue
              </span>
            )}
          </div>
          <StatusProgressBar
            open={openCount}
            inProgress={inProgressCount}
            waiting={waitingCount}
            completed={completedCount}
            total={allTickets.length}
          />
        </div>

        {/* Stat pills */}
        <div className="flex items-center gap-2 flex-shrink-0 text-xs font-medium">
          <span className="text-gray-400">{allTickets.length} tickets</span>
          {openCount > 0 && (
            <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100">
              {openCount} open
            </span>
          )}
          {inProgressCount > 0 && (
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">
              {inProgressCount} in progress
            </span>
          )}
          {completedCount > 0 && (
            <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full border border-green-100">
              {completedCount} done
            </span>
          )}
          <span className="text-gray-400 pl-1">{formatHours(totalLogged)} logged</span>
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Drill-down — month → week → tickets */}
      {open && (
        <div className="border-t border-gray-100">
          {Object.values(months).map((month) => (
            <div key={month.monthLabel} className="border-b border-gray-50 last:border-0">
              {/* Month header */}
              <div className="px-5 py-2 bg-gray-50/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {month.monthLabel}
                </span>
                <span className="text-xs text-gray-400">
                  {Object.values(month.weeks).reduce((s, w) => s + w.tickets.length, 0)} tickets
                </span>
              </div>

              {Object.values(month.weeks).map((week) => (
                <div key={week.weekLabel}>
                  {/* Week sub-header */}
                  <div className="px-5 py-1.5 flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium">{week.weekLabel}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-300">{week.tickets.length} tickets</span>
                  </div>

                  {/* Ticket table header */}
                  <div className="flex items-center gap-3 px-4 py-1.5 text-xs text-gray-400 font-medium border-b border-gray-100">
                    <span className="w-2 flex-shrink-0" />
                    <span className="flex-1">Ticket</span>
                    <span className="flex-shrink-0 w-36 text-right">Priority / Status</span>
                    <span className="flex-shrink-0 w-14 text-right">Due</span>
                    <span className="flex-shrink-0 w-14 text-right">Logged</span>
                  </div>

                  {/* Sort: overdue first */}
                  {[...week.tickets]
                    .sort((a, b) => (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0))
                    .map((ticket, idx) => (
                      <TicketRow key={ticket.id} ticket={ticket} idx={idx} />
                    ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const user = useAuthStore((state) => state.user);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [groupBy, setGroupBy] = useState("user");
  const [divisionFilter, setDivisionFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [overdueFilter, setOverdueFilter] = useState("All");
  const [monthFilter, setMonthFilter] = useState("All");

  // ── Access guard ──────────────────────────────────────────────────────────
  if (user?.role !== "Admin" && user?.role !== "Super Admin") {
    return (
      <MainLayout>
        <div className="p-10 text-red-500 text-xl font-medium">Access Denied</div>
      </MainLayout>
    );
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
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
    fetchTickets();
  }, []);

  // ── Filter options ────────────────────────────────────────────────────────
  const divisions = useMemo(
    () => ["All", ...new Set(tickets.map((t) => t.division).filter(Boolean))],
    [tickets]
  );
  const categories = useMemo(
    () => ["All", ...new Set(tickets.map((t) => t.category).filter(Boolean))],
    [tickets]
  );
  const months = useMemo(
    () => ["All", ...new Set(tickets.map((t) => getMonthLabel(t.due_date)))],
    [tickets]
  );

  // ── Grouped + filtered data ───────────────────────────────────────────────
  // Structure: { groupName → { groupName, tickets[], months: { monthLabel → { monthLabel, weeks: { weekLabel → { weekLabel, tickets[] } } } } } }
  const groupedHierarchy = useMemo(() => {
    const filtered = tickets.filter((t) => {
      if (divisionFilter !== "All" && t.division !== divisionFilter) return false;
      if (categoryFilter !== "All" && t.category !== categoryFilter) return false;
      if (overdueFilter === "Overdue" && !isOverdue(t)) return false;
      if (overdueFilter === "NonOverdue" && isOverdue(t)) return false;
      if (monthFilter !== "All" && getMonthLabel(t.due_date) !== monthFilter) return false;
      return true;
    });

    const groups = {};

    filtered.forEach((ticket) => {
      const groupName =
        groupBy === "user"
          ? ticket.assigned_to_name || "Unassigned"
          : groupBy === "category"
          ? ticket.category || "Uncategorized"
          : ticket.given_by || "Unknown";

      const monthLabel = getMonthLabel(ticket.due_date);
      const weekLabel = getWeekLabel(ticket.due_date);

      if (!groups[groupName]) {
        groups[groupName] = { groupName, tickets: [], months: {} };
      }
      groups[groupName].tickets.push(ticket);

      const g = groups[groupName];
      if (!g.months[monthLabel]) g.months[monthLabel] = { monthLabel, weeks: {} };
      const m = g.months[monthLabel];
      if (!m.weeks[weekLabel]) m.weeks[weekLabel] = { weekLabel, tickets: [] };
      m.weeks[weekLabel].tickets.push(ticket);
    });

    // Sort months chronologically, weeks numerically
    for (const g of Object.values(groups)) {
      g.months = Object.fromEntries(
        Object.values(g.months)
          .sort((a, b) => new Date(a.monthLabel) - new Date(b.monthLabel))
          .map((m) => {
            m.weeks = Object.fromEntries(
              Object.values(m.weeks)
                .sort((a, b) => parseInt(a.weekLabel.split(" ")[1] || 0) - parseInt(b.weekLabel.split(" ")[1] || 0))
                .map((w) => [w.weekLabel, w])
            );
            return [m.monthLabel, m];
          })
      );
    }

    // Sort groups: most overdue tickets first
    return Object.fromEntries(
      Object.values(groups)
        .sort((a, b) => b.tickets.filter(isOverdue).length - a.tickets.filter(isOverdue).length)
        .map((g) => [g.groupName, g])
    );
  }, [tickets, groupBy, divisionFilter, categoryFilter, overdueFilter, monthFilter]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const all = Object.values(groupedHierarchy).flatMap((g) => g.tickets);
    return {
      total: all.length,
      open: all.filter((t) => t.status === "Open").length,
      inProgress: all.filter((t) => t.status === "In Progress").length,
      overdue: all.filter(isOverdue).length,
      completed: all.filter((t) => t.status === "Completed").length,
    };
  }, [groupedHierarchy]);

  // ── Export ────────────────────────────────────────────────────────────────
  const exportExcel = () => {
    const rows = [];
    for (const group of Object.values(groupedHierarchy)) {
      for (const month of Object.values(group.months)) {
        for (const week of Object.values(month.weeks)) {
          week.tickets.forEach((ticket) => {
            const logged = (ticket.time_entries || []).reduce(
              (s, e) => s + (e.duration_minutes || 0),
              0
            );
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
              Overdue: isOverdue(ticket) ? "Yes" : "No",
              TimeLogged: formatHours(logged),
              AllottedTime: formatHours(ticket.allotted_minutes || 0),
            });
          });
        }
      }
    }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Operations Review");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([buf], { type: "application/octet-stream" }), "operations-review.xlsx");
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <MainLayout>
        <div className="p-10 text-gray-400 text-sm animate-pulse">Loading tickets…</div>
      </MainLayout>
    );
  }

  const groupedList = Object.values(groupedHierarchy);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">

        {/* ── Page header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
              Operations Review
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              Ticket delivery by person — sorted by risk
            </p>
          </div>
          <button
            onClick={exportExcel}
            className="inline-flex items-center gap-2 bg-black text-white text-sm px-5 py-2.5 rounded-xl hover:bg-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export Excel
          </button>
        </div>

        {/* ── KPI row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <KpiCard label="Total tickets" value={kpis.total} variant="neutral" />
          <KpiCard label="Open" value={kpis.open} variant="warn" />
          <KpiCard label="In progress" value={kpis.inProgress} variant="neutral" />
          <KpiCard label="Overdue" value={kpis.overdue} variant="danger" />
        </div>

        {/* ── Overdue alert banner ── */}
        {kpis.overdue > 0 && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-3 mb-6 text-sm text-red-700">
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <span>
              <strong>{kpis.overdue} ticket{kpis.overdue !== 1 ? "s are" : " is"} overdue.</strong>{" "}
              People with overdue work appear at the top.
            </span>
          </div>
        )}

        {/* ── Filters ── */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <FilterSelect
              label="Group by"
              value={groupBy}
              onChange={setGroupBy}
              options={[
                { label: "Person", value: "user" },
                { label: "Category", value: "category" },
                { label: "Given by", value: "given_by" },
              ]}
            />
            <FilterSelect
              label="Division"
              value={divisionFilter}
              onChange={setDivisionFilter}
              options={divisions.map((d) => ({ label: d, value: d }))}
            />
            <FilterSelect
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({ label: c, value: c }))}
            />
            <FilterSelect
              label="Overdue status"
              value={overdueFilter}
              onChange={setOverdueFilter}
              options={[
                { label: "All tasks", value: "All" },
                { label: "Overdue only", value: "Overdue" },
                { label: "Non-overdue", value: "NonOverdue" },
              ]}
            />
            <FilterSelect
              label="Month"
              value={monthFilter}
              onChange={setMonthFilter}
              options={months.map((m) => ({ label: m, value: m }))}
            />
          </div>
        </div>

        {/* ── Legend ── */}
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-4 px-1">
          <span className="font-medium text-gray-500">Progress bar:</span>
          {[
            { color: "bg-green-500", label: "Completed" },
            { color: "bg-blue-500", label: "In progress" },
            { color: "bg-purple-400", label: "Waiting" },
            { color: "bg-amber-400", label: "Open" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              {label}
            </span>
          ))}
        </div>

        {/* ── Person cards ── */}
        {groupedList.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">
            No tickets match the current filters.
          </div>
        ) : (
          <div className="space-y-3">
            {groupedList.map((group, idx) => (
              <PersonCard key={group.groupName} group={group} colorIndex={idx} />
            ))}
          </div>
        )}
      </div>
    </MainLayout>
  );
}