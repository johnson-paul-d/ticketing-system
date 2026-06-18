// FILE: src/pages/AdminAnalytics.jsx

import React, { useEffect, useMemo, useRef, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getWeekLabel = (dateString) => {
  if (!dateString) return "No due date";
  const date = new Date(dateString);
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date - firstDay) / 86400000 + firstDay.getDay() + 1) / 7);
  return `Week ${week}`;
};

const getMonthLabel = (dateString) => {
  if (!dateString) return "No due date";
  return new Date(dateString).toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const formatHours = (minutes) => {
  if (!minutes) return "—";
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins}m`;
};

const formatDate = (dateString) => {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
};

const isOverdue = (ticket) => {
  if (!ticket.due_date) return false;
  return new Date(ticket.due_date) < new Date() && ticket.status !== "Completed" && ticket.status !== "Closed";
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

const STATUS_CONFIG = {
  Open:                    { dot: "bg-amber-400",  badge: "bg-amber-50 text-amber-700" },
  "In Progress":           { dot: "bg-blue-500",   badge: "bg-blue-50 text-blue-700" },
  "Waiting For Approval":  { dot: "bg-purple-400", badge: "bg-purple-50 text-purple-700" },
  Completed:               { dot: "bg-green-500",  badge: "bg-green-50 text-green-700" },
  Closed:                  { dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-500" },
};

const PRIORITY_STYLES = {
  High:   "bg-red-50 text-red-700 border border-red-200",
  Medium: "bg-amber-50 text-amber-700 border border-amber-200",
  Low:    "bg-gray-100 text-gray-500",
};

// ─── Small reusable pieces ────────────────────────────────────────────────────

function KpiCard({ label, value, sub, variant = "neutral" }) {
  const color = { warn: "text-amber-600", danger: "text-red-600", success: "text-green-600", neutral: "text-gray-800" }[variant];
  return (
    <div className="bg-white rounded-2xl p-5 border border-gray-100">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{label}</p>
      <p className={`text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
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
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function MultiSelectFilter({ label, selected, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val) => {
    onChange(
      selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val]
    );
  };

  const clearAll = () => onChange([]);

  const displayLabel =
    selected.length === 0
      ? "All statuses"
      : selected.length === 1
      ? selected[0]
      : `${selected.length} selected`;

  return (
    <div className="flex flex-col gap-1 relative" ref={ref}>
      <label className="text-xs text-gray-400">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`text-sm border rounded-xl px-3 py-2 bg-white text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-2 focus:ring-black/10 transition-colors ${
          selected.length > 0 ? "border-black text-gray-900 font-medium" : "border-gray-200 text-gray-700"
        }`}
      >
        <span className="truncate">{displayLabel}</span>
        <svg className={`w-3.5 h-3.5 flex-shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 min-w-[190px]">
          {selected.length > 0 && (
            <button
              onClick={clearAll}
              className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100"
            >
              Clear selection
            </button>
          )}
          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="rounded border-gray-300 text-black focus:ring-black w-3.5 h-3.5 flex-shrink-0"
                />
                {o.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Thin coloured strip showing completion split
function StatusBar({ open, inProgress, waiting, completed, closed, total }) {
  if (!total) return null;
  const w = (n) => `${Math.round((n / total) * 100)}%`;
  return (
    <div className="flex h-1 rounded-full overflow-hidden bg-gray-100">
      <div className="bg-green-500"  style={{ width: w(completed) }} />
      <div className="bg-blue-500"   style={{ width: w(inProgress) }} />
      <div className="bg-purple-400" style={{ width: w(waiting) }} />
      <div className="bg-amber-400"  style={{ width: w(open) }} />
      <div className="bg-gray-400"   style={{ width: w(closed) }} />
    </div>
  );
}

// ─── Ticket row ───────────────────────────────────────────────────────────────
// Columns (fixed widths so every row aligns with the header):
//   status dot | title (flex) | priority | status | due | logged | allotted

const COL = {
  dot:      "w-3 flex-shrink-0",
  title:    "flex-1 min-w-0",
  priority: "w-16 flex-shrink-0 text-right",
  status:   "w-36 flex-shrink-0 text-right",
  due:      "w-16 flex-shrink-0 text-right",
  logged:   "w-16 flex-shrink-0 text-right",
  allotted: "w-20 flex-shrink-0 text-right",
};

function TicketRow({ ticket }) {
  const overdue = isOverdue(ticket);
  const logged   = (ticket.time_entries || []).reduce((s, e) => s + (e.duration_minutes || 0), 0);
  const allotted = ticket.allotted_minutes || 0;
  const overBudget = allotted > 0 && logged > allotted;

  const cfg = STATUS_CONFIG[ticket.status] || { dot: "bg-gray-300", badge: "bg-gray-100 text-gray-600" };

  return (
    <div className={`flex items-center gap-3 px-5 py-2.5 text-sm border-b border-gray-50 last:border-0 ${overdue ? "bg-red-50/50" : ""}`}>

      {/* Status dot */}
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} title={ticket.status} />

      {/* Title + overdue tag */}
      <span className={`${COL.title} truncate font-medium ${overdue ? "text-red-700" : "text-gray-800"}`} title={ticket.title}>
        {overdue && <span className="mr-1.5 text-xs font-bold text-red-500">LATE</span>}
        {ticket.title}
      </span>

      {/* Priority */}
      <span className={`${COL.priority}`}>
        {ticket.priority
          ? <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PRIORITY_STYLES[ticket.priority] || "bg-gray-100 text-gray-500"}`}>{ticket.priority}</span>
          : <span className="text-gray-300">—</span>
        }
      </span>

      {/* Status badge */}
      <span className={`${COL.status} flex justify-end`}>
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${cfg.badge}`}>{ticket.status}</span>
      </span>

      {/* Due date */}
      <span className={`${COL.due} text-xs tabular-nums ${overdue ? "text-red-600 font-semibold" : "text-gray-400"}`}>
        {formatDate(ticket.due_date)}
      </span>

      {/* Logged time */}
      <span className={`${COL.logged} text-xs tabular-nums ${overBudget ? "text-red-600 font-semibold" : "text-gray-500"}`}>
        {formatHours(logged)}
      </span>

      {/* Allocated time */}
      <span className="w-20 flex-shrink-0 text-right text-xs tabular-nums text-gray-400">
        {formatHours(allotted)}
      </span>
    </div>
  );
}

// Column header row — must mirror COL widths exactly
function TableHeader() {
  return (
    <div className="flex items-center gap-3 px-5 py-2 text-xs font-medium text-gray-400 border-b border-gray-100 bg-gray-50/60">
      <span className="w-2 flex-shrink-0" />
      <span className="flex-1">Ticket</span>
      <span className="w-16 flex-shrink-0 text-right">Priority</span>
      <span className="w-36 flex-shrink-0 text-right">Status</span>
      <span className="w-16 flex-shrink-0 text-right">Due</span>
      <span className="w-16 flex-shrink-0 text-right">Logged</span>
      <span className="w-20 flex-shrink-0 text-right">Allocated</span>
    </div>
  );
}

// ─── Person card ──────────────────────────────────────────────────────────────

function PersonCard({ group, colorIndex }) {
  const [open, setOpen] = useState(false);
  const { groupName, months, tickets: all } = group;

  const overdueCount   = all.filter(isOverdue).length;
  const openCount      = all.filter((t) => t.status === "Open").length;
  const inProgCount    = all.filter((t) => t.status === "In Progress").length;
  const waitingCount   = all.filter((t) => t.status === "Waiting For Approval").length;
  const completedCount = all.filter((t) => t.status === "Completed").length;
  const closedCount    = all.filter((t) => t.status === "Closed").length;

  const totalLogged   = all.reduce((s, t) => s + (t.time_entries || []).reduce((ss, e) => ss + (e.duration_minutes || 0), 0), 0);
  const totalAllotted = all.reduce((s, t) => s + (t.allotted_minutes || 0), 0);

  const { bg, text: textColor } = AVATAR_COLORS[colorIndex % AVATAR_COLORS.length];
  const hasOverdue = overdueCount > 0;

  return (
    <div className={`rounded-2xl border bg-white overflow-hidden ${hasOverdue ? "border-red-200" : "border-gray-100"}`}>

      {/* ── Clickable header ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-gray-50/60 transition-colors"
      >
        {/* Avatar */}
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0"
          style={{ background: bg, color: textColor }}
        >
          {getInitials(groupName)}
        </div>

        {/* Name + progress bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="font-semibold text-gray-900 text-sm">{groupName}</span>
            {hasOverdue && (
              <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                ⚠ {overdueCount} overdue
              </span>
            )}
          </div>
          <StatusBar
            open={openCount} inProgress={inProgCount}
            waiting={waitingCount} completed={completedCount}
            closed={closedCount} total={all.length}
          />
        </div>

        {/* Right-side summary — 4 clean numbers, always aligned */}
        <div className="hidden sm:grid grid-cols-5 gap-6 flex-shrink-0 text-center">
          {[
            { val: all.length,      label: "total" },
            { val: openCount,       label: "open" },
            { val: completedCount,  label: "done" },
            { val: closedCount,     label: "closed" },
            { val: `${formatHours(totalLogged)} / ${formatHours(totalAllotted)}`, label: "time" },
          ].map(({ val, label }) => (
            <div key={label}>
              <div className="text-sm font-semibold text-gray-800 tabular-nums">{val}</div>
              <div className="text-xs text-gray-400">{label}</div>
            </div>
          ))}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Drill-down: month → week → tickets ── */}
      {open && (
        <div className="border-t border-gray-100">
          {Object.values(months).map((month) => (
            <div key={month.monthLabel}>

              {/* Month strip */}
              <div className="px-5 py-2 bg-gray-50 flex items-center justify-between border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {month.monthLabel}
                </span>
                <span className="text-xs text-gray-400">
                  {Object.values(month.weeks).reduce((s, w) => s + w.tickets.length, 0)} tickets
                </span>
              </div>

              {Object.values(month.weeks).map((week, wi) => (
                <div key={week.weekLabel}>

                  {/* Week divider */}
                  <div className="px-5 py-1.5 flex items-center gap-3">
                    <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{week.weekLabel}</span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="text-xs text-gray-300 whitespace-nowrap">{week.tickets.length} tickets</span>
                  </div>

                  {/* Column header — rendered once per week group */}
                  <TableHeader />

                  {/* Tickets — overdue floated to top */}
                  {[...week.tickets]
                    .sort((a, b) => (isOverdue(b) ? 1 : 0) - (isOverdue(a) ? 1 : 0))
                    .map((ticket) => (
                      <TicketRow key={ticket.id} ticket={ticket} />
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

// ─── Legend ───────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-400 mb-3 px-1">
      <span className="text-gray-500 font-medium">Progress bar</span>
      {[
        { color: "bg-green-500",  label: "Completed" },
        { color: "bg-blue-500",   label: "In Progress" },
        { color: "bg-purple-400", label: "Waiting" },
        { color: "bg-amber-400",  label: "Open" },
        { color: "bg-gray-400",   label: "Closed" },
      ].map(({ color, label }) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminAnalytics() {
  const user = useAuthStore((state) => state.user);
  const [tickets, setTickets]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [groupBy, setGroupBy]         = useState("user");
  const [divisionFilter, setDivisionFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [overdueFilter, setOverdueFilter]   = useState("All");
  const [monthFilter, setMonthFilter]       = useState("All");
  const [statusFilter, setStatusFilter]     = useState([]);

  // ========== REMOVED ACCESS DENIED BLOCK ==========

  useEffect(() => {
    const fetch_ = async () => {
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
    fetch_();
  }, []);

  const divisions = useMemo(() => ["All", ...new Set(tickets.map((t) => t.division).filter(Boolean))], [tickets]);
  const categories = useMemo(() => ["All", ...new Set(tickets.map((t) => t.category).filter(Boolean))], [tickets]);
  const months = useMemo(() => ["All", ...new Set(tickets.map((t) => getMonthLabel(t.due_date)))], [tickets]);

  const groupedHierarchy = useMemo(() => {
    const filtered = tickets.filter((t) => {
      // STEP 2: Non‑admins see only their own tickets
      if (user?.role !== "Admin" && user?.role !== "Super Admin") {
        const isOwnTicket = t.assigned_to === user.id || t.assigned_to_name === user.name;
        if (!isOwnTicket) return false;
      }

      if (divisionFilter !== "All" && t.division !== divisionFilter) return false;
      if (categoryFilter !== "All" && t.category !== categoryFilter) return false;
      if (overdueFilter === "Overdue" && !isOverdue(t)) return false;
      if (overdueFilter === "NonOverdue" && isOverdue(t)) return false;
      if (monthFilter !== "All" && getMonthLabel(t.due_date) !== monthFilter) return false;
      if (statusFilter.length > 0 && !statusFilter.includes(t.status)) return false;
      return true;
    });

    const groups = {};

    filtered.forEach((ticket) => {
      const groupName =
        groupBy === "user"     ? (ticket.assigned_to_name || "Unassigned") :
        groupBy === "category" ? (ticket.category         || "Uncategorized") :
                                  (ticket.given_by         || "Unknown");

      const monthLabel = getMonthLabel(ticket.due_date);
      const weekLabel  = getWeekLabel(ticket.due_date);

      if (!groups[groupName]) groups[groupName] = { groupName, tickets: [], months: {} };
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

    // Most overdue person floats to top
    return Object.fromEntries(
      Object.values(groups)
        .sort((a, b) => b.tickets.filter(isOverdue).length - a.tickets.filter(isOverdue).length)
        .map((g) => [g.groupName, g])
    );
  }, [tickets, groupBy, divisionFilter, categoryFilter, overdueFilter, monthFilter, statusFilter, user]);

  const kpis = useMemo(() => {
    const all = Object.values(groupedHierarchy).flatMap((g) => g.tickets);
    return {
      total:     all.length,
      open:      all.filter((t) => t.status === "Open").length,
      inProgress:all.filter((t) => t.status === "In Progress").length,
      overdue:   all.filter(isOverdue).length,
      completed: all.filter((t) => t.status === "Completed").length,
      closed:    all.filter((t) => t.status === "Closed").length,
    };
  }, [groupedHierarchy]);

  const exportExcel = () => {
    const rows = [];
    for (const group of Object.values(groupedHierarchy)) {
      for (const month of Object.values(group.months)) {
        for (const week of Object.values(month.weeks)) {
          week.tickets.forEach((t) => {
            const logged = (t.time_entries || []).reduce((s, e) => s + (e.duration_minutes || 0), 0);
            rows.push({
              Group: group.groupName, Month: month.monthLabel, Week: week.weekLabel,
              Ticket: t.title, Status: t.status, Priority: t.priority,
              Category: t.category, Division: t.division, DueDate: t.due_date,
              AssignedTo: t.assigned_to_name,
              Overdue: isOverdue(t) ? "Yes" : "No",
              TimeLogged: formatHours(logged),
              AllocatedTime: formatHours(t.allotted_minutes || 0),
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

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10 text-gray-400 text-sm animate-pulse">Loading tickets…</div>
      </MainLayout>
    );
  }

  const groupedList = Object.values(groupedHierarchy);

  return (
    <MainLayout>
      <div className="p-4 lg:p-8 max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Operations Review</h1>
            <p className="text-sm text-gray-400 mt-1">Ticket delivery by person · sorted by risk</p>
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

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <KpiCard label="Total"       value={kpis.total}      variant="neutral" />
          <KpiCard label="Open"        value={kpis.open}       variant="warn" />
          <KpiCard label="In Progress" value={kpis.inProgress} variant="neutral" />
          <KpiCard label="Completed"   value={kpis.completed}  variant="success" />
          <KpiCard label="Closed"      value={kpis.closed}     variant="neutral" />
          <KpiCard label="Overdue"     value={kpis.overdue}    variant="danger" />
        </div>

        {/* Overdue alert */}
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

        {/* Filters */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <FilterSelect label="Group by" value={groupBy} onChange={setGroupBy}
              options={[{ label: "Person", value: "user" }, { label: "Category", value: "category" }, { label: "Given by", value: "given_by" }]} />
            <FilterSelect label="Division" value={divisionFilter} onChange={setDivisionFilter}
              options={divisions.map((d) => ({ label: d, value: d }))} />
            <FilterSelect label="Category" value={categoryFilter} onChange={setCategoryFilter}
              options={categories.map((c) => ({ label: c, value: c }))} />
            <MultiSelectFilter label="Status" selected={statusFilter} onChange={setStatusFilter}
              options={[
                { label: "Open",                 value: "Open" },
                { label: "In Progress",          value: "In Progress" },
                { label: "Waiting For Approval", value: "Waiting For Approval" },
                { label: "Completed",            value: "Completed" },
                { label: "Closed",               value: "Closed" },
              ]} />
            <FilterSelect label="Overdue status" value={overdueFilter} onChange={setOverdueFilter}
              options={[{ label: "All tasks", value: "All" }, { label: "Overdue only", value: "Overdue" }, { label: "Non-overdue", value: "NonOverdue" }]} />
            <FilterSelect label="Month" value={monthFilter} onChange={setMonthFilter}
              options={months.map((m) => ({ label: m, value: m }))} />
          </div>
        </div>

        {/* Legend */}
        <Legend />

        {/* Person cards */}
        {groupedList.length === 0 ? (
          <div className="text-center py-20 text-gray-400 text-sm">No tickets match the current filters.</div>
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