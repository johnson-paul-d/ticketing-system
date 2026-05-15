import { useEffect, useState, useMemo, useRef } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
  ComposedChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  ZAxis,
} from "recharts";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";

/* ─── Design tokens ─────────────────────────────────────────────────────── */
const T = {
  bg: "#F7F6F2",
  surface: "#FFFFFF",
  surfaceAlt: "#F2F0EB",
  border: "#E4E0D8",
  borderMed: "#C8C3BA",

  ink: "#0F1923",
  ink2: "#3D4D5C",
  ink3: "#7A8B99",

  open: "#C0521E",
  openBg: "#FEF0E8",
  openBorder: "#F0B592",

  prog: "#1A6E8E",
  progBg: "#E4F4FA",
  progBorder: "#7BBFD6",

  done: "#2C6E49",
  doneBg: "#E4F2EB",
  doneBorder: "#7DB995",

  crit: "#A0232B",
  critBg: "#FAEAEA",
  critBorder: "#F5C0C0",

  gold: "#A07820",
  goldBg: "#FDF4E0",
  goldBorder: "#D4B060",

  violet: "#5A4A9A",
  violetBg: "#EEF0FF",
  violetBorder: "#A8A0D6",

  overdue: "#D63031",
  dueSoon: "#E17055",
  dueLater: "#00B894",
};

const AVATAR_COLORS = [
  "#6C5CE7", "#00B894", "#E17055", "#0984E3",
  "#FDCB6E", "#D63031", "#74B9FF", "#A29BFE",
  "#55EFC4", "#FD79A8",
];

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Serif+Display:ital@0;1&display=swap";

/* ─── Utilities ─────────────────────────────────────────────────────────── */
const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);
const unique = (arr, key) =>
  [...new Set(arr.map((x) => x[key]).filter(Boolean))].sort();
const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = item[key] || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
const initials = (name) =>
  name
    ? name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "?";

function buildWeekly(tickets) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const open = {};
  const done = {};
  days.forEach((d) => { open[d] = 0; done[d] = 0; });
  tickets.forEach((t) => {
    if (!t.created_at) return;
    const d = new Date(t.created_at).toLocaleDateString("en-US", { weekday: "short" });
    if (open[d] !== undefined) {
      if (t.status === "Open") open[d]++;
      if (t.status === "Completed") done[d]++;
    }
  });
  return days.map((d) => ({ day: d, Open: open[d], Completed: done[d] }));
}

function buildCreationTrend(tickets) {
  const dateMap = new Map();
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    dateMap.set(dateStr, { date: dateStr, created: 0, completed: 0 });
  }
  tickets.forEach((t) => {
    if (t.created_at) {
      const createdDate = new Date(t.created_at).toISOString().split("T")[0];
      if (dateMap.has(createdDate)) dateMap.get(createdDate).created++;
    }
    if (t.status === "Completed" && t.updated_at) {
      const completedDate = new Date(t.updated_at).toISOString().split("T")[0];
      if (dateMap.has(completedDate)) dateMap.get(completedDate).completed++;
    }
  });
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function buildMonthlyTrend(tickets) {
  const monthMap = new Map();
  tickets.forEach((t) => {
    if (!t.created_at) return;
    const date = new Date(t.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthName = date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { month: monthName, created: 0, completed: 0, open: 0 });
    }
    const entry = monthMap.get(monthKey);
    entry.created++;
    if (t.status === "Completed") entry.completed++;
    if (t.status === "Open") entry.open++;
  });
  const sorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([, val]) => ({
    month: val.month,
    created: val.created,
    completed: val.completed,
    openRate: val.created > 0 ? pct(val.open, val.created) : 0,
    completionRate: val.created > 0 ? pct(val.completed, val.created) : 0,
  }));
}

function avgResolutionDays(tickets) {
  const completedTickets = tickets.filter(
    (t) => t.status === "Completed" && t.created_at && t.updated_at
  );
  if (completedTickets.length === 0) return 0;
  const totalDays = completedTickets.reduce((sum, t) => {
    const created = new Date(t.created_at);
    const resolved = new Date(t.updated_at);
    return sum + Math.max(0, (resolved - created) / (1000 * 60 * 60 * 24));
  }, 0);
  return Math.round((totalDays / completedTickets.length) * 10) / 10;
}

function resolutionTrend(tickets) {
  const completed = tickets.filter(
    (t) => t.status === "Completed" && t.created_at && t.updated_at
  );
  const monthMap = new Map();
  completed.forEach((t) => {
    const compDate = new Date(t.updated_at);
    const monthKey = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, "0")}`;
    const monthName = compDate.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    const resolutionDays =
      (new Date(t.updated_at) - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { month: monthName, totalDays: 0, count: 0 });
    }
    const entry = monthMap.get(monthKey);
    entry.totalDays += resolutionDays;
    entry.count++;
  });
  return Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, val]) => ({
      month: val.month,
      avgResolutionDays: Math.round((val.totalDays / val.count) * 10) / 10,
    }));
}

function openTicketAging(tickets) {
  const openTickets = tickets.filter((t) => t.status === "Open" && t.created_at);
  const today = new Date();
  const buckets = { "< 1 week": 0, "1-2 weeks": 0, "2-4 weeks": 0, "> 4 weeks": 0 };
  openTickets.forEach((t) => {
    const daysOpen = (today - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
    if (daysOpen < 7) buckets["< 1 week"]++;
    else if (daysOpen < 14) buckets["1-2 weeks"]++;
    else if (daysOpen < 28) buckets["2-4 weeks"]++;
    else buckets["> 4 weeks"]++;
  });
  return Object.entries(buckets).map(([name, value]) => ({
    name,
    value,
    color: value > 0 ? T.crit : T.ink3,
  }));
}

function slaCompliance(tickets) {
  const ticketsWithDue = tickets.filter(
    (t) => t.due_date && t.status === "Completed" && t.updated_at
  );
  if (ticketsWithDue.length === 0) return null;
  const onTime = ticketsWithDue.filter((t) => new Date(t.updated_at) <= new Date(t.due_date)).length;
  return pct(onTime, ticketsWithDue.length);
}

function backlogForecast(tickets) {
  const weekMap = new Map();
  const today = new Date();
  for (let i = 0; i < 6; i++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - i * 7);
    weekMap.set(weekStart.toISOString().split("T")[0], 0);
  }
  tickets
    .filter((t) => t.status !== "Completed" && t.created_at)
    .forEach((t) => {
      const created = new Date(t.created_at);
      for (let i = 0; i < 6; i++) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - i * 7);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 7);
        if (created >= weekStart && created < weekEnd) {
          const key = weekStart.toISOString().split("T")[0];
          weekMap.set(key, (weekMap.get(key) || 0) + 1);
          break;
        }
      }
    });
  const weeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const data = weeks.map(([, count], idx) => ({ week: `W-${5 - idx}`, count }));
  if (data.length < 2) return null;
  const changes = [];
  for (let i = 1; i < data.length; i++) changes.push(data[i].count - data[i - 1].count);
  const avgChange = changes.reduce((a, b) => a + b, 0) / changes.length;
  const lastCount = data[data.length - 1].count;
  return {
    historicalData: data,
    current: lastCount,
    nextWeek: Math.max(0, Math.round(lastCount + avgChange)),
    twoWeeks: Math.max(0, Math.round(lastCount + avgChange * 2)),
    trend: avgChange,
  };
}

function buildDueAnalysis(tickets) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  let overdue = 0, dueThisWeek = 0, dueLater = 0, noDueDate = 0;
  tickets.forEach((t) => {
    if (!t.due_date) { noDueDate++; return; }
    const dueDate = new Date(t.due_date);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate < today) overdue++;
    else if (dueDate <= nextWeek) dueThisWeek++;
    else dueLater++;
  });
  return [
    { name: "Overdue", value: overdue, color: T.overdue },
    { name: "Due This Week", value: dueThisWeek, color: T.dueSoon },
    { name: "Due Later", value: dueLater, color: T.dueLater },
    { name: "No Due Date", value: noDueDate, color: T.ink3 },
  ];
}

/* ─── NEW Chart 1: Ticket Flow Funnel data builder ──────────────────────── */
function buildFunnelData(tickets) {
  const total = tickets.length;
  const inProg = tickets.filter((t) => t.status === "In Progress").length;
  const done = tickets.filter((t) => t.status === "Completed").length;
  const ticketsWithDue = tickets.filter(
    (t) => t.due_date && t.status === "Completed" && t.updated_at
  );
  const onTime = ticketsWithDue.filter(
    (t) => new Date(t.updated_at) <= new Date(t.due_date)
  ).length;
  return [
    { stage: "Created", value: total, color: T.violet },
    { stage: "In Progress", value: inProg, color: T.prog },
    { stage: "Completed", value: done, color: T.done },
    { stage: "On Time", value: onTime, color: T.gold },
  ];
}

/* ─── NEW Chart 2: Category performance data builder ────────────────────── */
function buildCategoryPerf(tickets) {
  return unique(tickets, "category").map((cat) => {
    const ct = tickets.filter((t) => t.category === cat);
    const completed = ct.filter((t) => t.status === "Completed").length;
    const open = ct.filter((t) => t.status === "Open").length;
    const inProg = ct.filter((t) => t.status === "In Progress").length;
    return {
      name: cat,
      total: ct.length,
      completed,
      open,
      inProg,
      completionRate: pct(completed, ct.length),
    };
  }).sort((a, b) => b.completionRate - a.completionRate);
}

/* ─── NEW Chart 3: Effort variance per engineer ─────────────────────────── */
function buildEffortVariance(tickets, assigneePerf) {
  return assigneePerf.map((a) => {
    const engineerTickets = tickets.filter(
      (t) => t.assigned_to_name === a.name && t.allotted_minutes && t.consumed_minutes
    );
    if (engineerTickets.length === 0) return { name: a.name, variance: 0, count: 0 };
    const totalAllotted = engineerTickets.reduce((s, t) => s + (t.allotted_minutes || 0), 0);
    const totalConsumed = engineerTickets.reduce((s, t) => s + (t.consumed_minutes || 0), 0);
    const variancePct =
      totalAllotted > 0
        ? Math.round(((totalConsumed - totalAllotted) / totalAllotted) * 100)
        : 0;
    return { name: a.name, variance: variancePct, count: engineerTickets.length };
  }).sort((a, b) => a.variance - b.variance);
}

/* ─── NEW Chart 4: SLA breach per assignee ──────────────────────────────── */
function buildSlaByAssignee(tickets, assigneePerf) {
  return assigneePerf.map((a) => {
    const withDue = tickets.filter(
      (t) =>
        t.assigned_to_name === a.name &&
        t.due_date &&
        t.status === "Completed" &&
        t.updated_at
    );
    if (withDue.length === 0) return { name: a.name, sla: null, onTime: 0, total: 0 };
    const onTime = withDue.filter(
      (t) => new Date(t.updated_at) <= new Date(t.due_date)
    ).length;
    return {
      name: a.name,
      sla: pct(onTime, withDue.length),
      onTime,
      total: withDue.length,
    };
  }).filter((a) => a.sla !== null).sort((a, b) => b.sla - a.sla);
}

/* ─── NEW Chart 5: Day-of-week heatmap data builder ─────────────────────── */
function buildDayHeatmap(tickets) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const statuses = ["Open", "In Progress", "Completed"];
  const grid = {};
  statuses.forEach((s) => {
    grid[s] = {};
    days.forEach((d) => (grid[s][d] = 0));
  });
  tickets.forEach((t) => {
    if (!t.created_at) return;
    const d = new Date(t.created_at).toLocaleDateString("en-US", { weekday: "short" });
    if (grid[t.status] && grid[t.status][d] !== undefined) grid[t.status][d]++;
  });
  return { grid, days, statuses };
}

/* ─── NEW Chart 6: Backlog forecast chart data ───────────────────────────── */
function buildBacklogChartData(forecastResult) {
  if (!forecastResult) return [];
  const hist = forecastResult.historicalData || [];
  const projected = [
    ...hist,
    { week: "W+1", count: null, projected: forecastResult.nextWeek },
    { week: "W+2", count: null, projected: forecastResult.twoWeeks },
  ];
  return projected;
}

/* ─── NEW Chart 7: Velocity trend per engineer (monthly) ────────────────── */
function buildVelocityTrend(tickets, assigneePerf) {
  const top5 = assigneePerf.slice(0, 5);
  const monthMap = new Map();
  tickets.forEach((t) => {
    if (t.status !== "Completed" || !t.updated_at) return;
    const date = new Date(t.updated_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const monthName = date.toLocaleDateString("en-US", { year: "numeric", month: "short" });
    if (!monthMap.has(monthKey)) monthMap.set(monthKey, { month: monthName });
    const entry = monthMap.get(monthKey);
    top5.forEach((a) => {
      if (t.assigned_to_name === a.name) {
        entry[a.name] = (entry[a.name] || 0) + 1;
      }
    });
  });
  return Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, val]) => val);
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function KpiCard({ label, value, sub, accentColor, accentBorder, trend }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${accentBorder}`,
        borderRadius: 16,
        padding: "18px 20px",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 2px 8px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.03)",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
        cursor: "default",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 8px 20px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.02)";
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, background: accentColor, borderRadius: "4px 0 0 4px" }} />
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: T.ink3, marginBottom: 8 }}>{label}</p>
      <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 34, lineHeight: 1, color: accentColor, margin: "0 0 4px" }}>{value}</p>
      <p style={{ fontSize: 11, color: T.ink3, margin: 0 }}>{sub}</p>
      {trend !== undefined && (
        <div style={{ marginTop: 8, fontSize: 10, color: trend >= 0 ? T.done : T.crit }}>
          {trend > 0 ? `↑ ${trend}%` : trend < 0 ? `↓ ${Math.abs(trend)}%` : "→ 0%"} from last period
        </div>
      )}
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 20,
        padding: "20px 22px",
        overflow: "hidden",
        boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
        transition: "box-shadow 0.2s ease",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ title, sub }) {
  return (
    <div style={{ marginBottom: 16, borderLeft: `3px solid ${T.violet}`, paddingLeft: 12 }}>
      <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: 0 }}>{title}</p>
      {sub && <p style={{ fontSize: 11, color: T.ink3, margin: "4px 0 0" }}>{sub}</p>}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, color: T.ink3, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.ink, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: "6px 10px", cursor: "pointer", outline: "none" }}
        onFocus={(e) => (e.target.style.borderColor = T.violet)}
        onBlur={(e) => (e.target.style.borderColor = T.border)}
      >
        <option value="all">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function DateRangeFilter({ label, startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 10, color: T.ink3, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>{label}</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input type="date" value={startDate || ""} onChange={(e) => onStartChange(e.target.value || null)} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.ink, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: "6px 10px", cursor: "pointer", outline: "none" }} />
        <input type="date" value={endDate || ""} onChange={(e) => onEndChange(e.target.value || null)} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.ink, background: T.surfaceAlt, border: `1px solid ${T.border}`, borderRadius: 10, padding: "6px 10px", cursor: "pointer", outline: "none" }} />
      </div>
    </div>
  );
}

function HorizontalBar({ label, value, max, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
      <span style={{ fontSize: 12, color: T.ink2, width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 6, height: 8, overflow: "hidden" }}>
        <div style={{ width: `${pct(value, max)}%`, height: "100%", background: color, borderRadius: 6, transition: "width 0.4s ease" }} />
      </div>
      <span style={{ fontSize: 11, color: T.ink3, width: 28, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 12, color: T.ink3 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || T.ink }}>{value}</span>
    </div>
  );
}

function InsightCard({ type, label, text }) {
  const styles = {
    good: { bg: T.doneBg, border: T.doneBorder, labelColor: T.done },
    warn: { bg: T.critBg, border: T.critBorder, labelColor: T.crit },
    info: { bg: T.progBg, border: T.progBorder, labelColor: T.prog },
    gold: { bg: T.goldBg, border: T.goldBorder, labelColor: T.gold },
  };
  const s = styles[type] || styles.info;
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: "12px 16px", marginBottom: 10 }}>
      <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, color: s.labelColor, margin: "0 0 4px" }}>{label}</p>
      <p style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, margin: 0 }}>{text}</p>
    </div>
  );
}

function EfficiencyRow({ rank, name, total, comp, openCount, eff, avatarColor }) {
  const effColor = eff >= 70 ? T.done : eff >= 40 ? T.gold : T.crit;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: `1px solid ${T.border}` }}>
      <span style={{ fontSize: 10, color: T.ink3, width: 16, flexShrink: 0 }}>{rank}</span>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: avatarColor + "22", color: avatarColor, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{initials(name)}</div>
      <span style={{ fontSize: 12, color: T.ink2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={name}>{name}</span>
      <div style={{ width: 120, flexShrink: 0 }}>
        <div style={{ height: 5, borderRadius: 3, background: T.open, width: `${pct(openCount, total)}%`, marginBottom: 3 }} />
        <div style={{ height: 5, borderRadius: 3, background: T.done, width: `${pct(comp, total)}%` }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: effColor, width: 36, textAlign: "right", flexShrink: 0 }}>{eff}%</span>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "10px 14px", boxShadow: "0 4px 16px rgba(15,25,35,0.12)", fontFamily: "'DM Sans', sans-serif" }}>
      {label && <p style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>{label}</p>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color }} />
          <span style={{ fontSize: 12, color: T.ink2 }}>{p.name}:</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════════════════
   NEW CHART SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── Chart 1: Funnel ─────────────────────────────────────────────────────── */
function FunnelChart({ data }) {
  if (!data || data.length === 0) return null;
  const max = data[0].value || 1;
  return (
    <div>
      {data.map((item, i) => {
        const widthPct = pct(item.value, max);
        const dropoff = i > 0 ? pct(item.value, data[i - 1].value) : 100;
        return (
          <div key={item.stage} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: T.ink3, width: 80, flexShrink: 0, textAlign: "right" }}>{item.stage}</span>
              <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 8, height: 32, overflow: "hidden", position: "relative" }}>
                <div
                  style={{
                    width: `${widthPct}%`,
                    height: "100%",
                    background: item.color,
                    borderRadius: 8,
                    display: "flex",
                    alignItems: "center",
                    paddingLeft: 12,
                    transition: "width 0.5s ease",
                    opacity: 1 - i * 0.08,
                  }}
                >
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{item.value}</span>
                </div>
              </div>
              {i > 0 && (
                <span style={{ fontSize: 10, color: dropoff >= 70 ? T.done : dropoff >= 50 ? T.gold : T.crit, width: 36, flexShrink: 0, textAlign: "right", fontWeight: 600 }}>
                  {dropoff}%
                </span>
              )}
              {i === 0 && <span style={{ width: 36 }} />}
            </div>
          </div>
        );
      })}
      <div style={{ marginTop: 12, display: "flex", gap: 16, flexWrap: "wrap" }}>
        {data.map((item) => (
          <div key={item.stage} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: T.ink3 }}>{item.stage}: {item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Chart 2: Category performance ──────────────────────────────────────── */
function CategoryPerfChart({ data }) {
  if (!data || data.length === 0) return <p style={{ fontSize: 12, color: T.ink3 }}>No category data available.</p>;
  return (
    <div>
      {data.map((cat) => (
        <div key={cat.name} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: T.ink2, width: 100, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={cat.name}>{cat.name}</span>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
              <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 4, height: 7, overflow: "hidden" }}>
                <div style={{ width: `${pct(cat.completed, cat.total)}%`, height: "100%", background: T.done, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 10, color: T.done, width: 32, textAlign: "right", fontWeight: 600 }}>{pct(cat.completed, cat.total)}%</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 4, height: 4, overflow: "hidden" }}>
                <div style={{ width: `${pct(cat.open, cat.total)}%`, height: "100%", background: T.open, borderRadius: 4 }} />
              </div>
              <span style={{ fontSize: 10, color: T.open, width: 32, textAlign: "right" }}>{cat.open} open</span>
            </div>
          </div>
          <span style={{ fontSize: 10, color: T.ink3, width: 36, textAlign: "right", flexShrink: 0 }}>{cat.total} total</span>
        </div>
      ))}
      <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: T.done }} />
          <span style={{ fontSize: 10, color: T.ink3 }}>Completion rate (thick)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 4, borderRadius: 2, background: T.open }} />
          <span style={{ fontSize: 10, color: T.ink3 }}>Open load (thin)</span>
        </div>
      </div>
    </div>
  );
}

/* ── Chart 3: Effort variance ────────────────────────────────────────────── */
function EffortVarianceChart({ data }) {
  if (!data || data.length === 0) return <p style={{ fontSize: 12, color: T.ink3 }}>No effort data (allotted/consumed minutes) found.</p>;
  const maxAbs = Math.max(...data.map((d) => Math.abs(d.variance)), 1);
  return (
    <div>
      {data.map((item) => {
        const isOver = item.variance > 0;
        const barWidth = Math.min(Math.abs(item.variance) / maxAbs, 1) * 45;
        const color = isOver ? T.crit : T.done;
        return (
          <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 11, color: T.ink2, width: 80, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>{item.name}</span>
            <div style={{ flex: 1, position: "relative", height: 14, display: "flex", alignItems: "center" }}>
              <div style={{ position: "absolute", left: "50%", width: 1, height: 14, background: T.borderMed }} />
              {item.variance < 0 && (
                <div style={{ position: "absolute", right: "50%", width: `${barWidth}%`, height: 8, background: T.done, borderRadius: "3px 0 0 3px" }} />
              )}
              {item.variance > 0 && (
                <div style={{ position: "absolute", left: "50%", width: `${barWidth}%`, height: 8, background: T.crit, borderRadius: "0 3px 3px 0" }} />
              )}
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color, width: 44, textAlign: "right", flexShrink: 0 }}>
              {item.variance > 0 ? `+${item.variance}%` : `${item.variance}%`}
            </span>
          </div>
        );
      })}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, background: T.done, borderRadius: 2 }} />
          <span style={{ fontSize: 10, color: T.ink3 }}>Under-utilized (over-estimated)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, background: T.crit, borderRadius: 2 }} />
          <span style={{ fontSize: 10, color: T.ink3 }}>Over-utilized (under-estimated)</span>
        </div>
      </div>
    </div>
  );
}

/* ── Chart 4: SLA breach by assignee ────────────────────────────────────── */
function SlaBreakdownChart({ data }) {
  if (!data || data.length === 0) return <p style={{ fontSize: 12, color: T.ink3 }}>No SLA data (requires due dates on completed tickets).</p>;
  return (
    <div>
      {data.map((item, i) => {
        const slaColor = item.sla >= 90 ? T.done : item.sla >= 70 ? T.gold : T.crit;
        return (
          <div key={item.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 10, color: T.ink3, width: 16, flexShrink: 0 }}>{i + 1}</span>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length] + "22", color: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600, flexShrink: 0 }}>{initials(item.name)}</div>
            <span style={{ fontSize: 12, color: T.ink2, width: 90, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>{item.name}</span>
            <div style={{ flex: 1, background: T.surfaceAlt, borderRadius: 6, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${item.sla}%`, height: "100%", background: slaColor, borderRadius: 6, transition: "width 0.4s ease" }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: slaColor, width: 36, textAlign: "right", flexShrink: 0 }}>{item.sla}%</span>
            <span style={{ fontSize: 10, color: T.ink3, width: 52, textAlign: "right", flexShrink: 0 }}>{item.onTime}/{item.total}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Chart 5: Day-of-week heatmap ───────────────────────────────────────── */
function DayHeatmap({ data }) {
  if (!data) return null;
  const { grid, days, statuses } = data;
  const statusColors = { Open: T.open, "In Progress": T.prog, Completed: T.done };
  const allVals = statuses.flatMap((s) => days.map((d) => grid[s][d]));
  const maxVal = Math.max(...allVals, 1);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(7, 1fr)`, gap: 4, marginBottom: 4 }}>
        <div />
        {days.map((d) => (
          <div key={d} style={{ fontSize: 10, color: T.ink3, textAlign: "center", fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      {statuses.map((status) => (
        <div key={status} style={{ display: "grid", gridTemplateColumns: `80px repeat(7, 1fr)`, gap: 4, marginBottom: 4 }}>
          <div style={{ fontSize: 10, color: T.ink2, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: statusColors[status], flexShrink: 0 }} />
            {status}
          </div>
          {days.map((d) => {
            const val = grid[status][d];
            const intensity = val / maxVal;
            const baseColor = statusColors[status];
            return (
              <div
                key={d}
                title={`${status} · ${d}: ${val}`}
                style={{
                  height: 32,
                  borderRadius: 6,
                  background: baseColor,
                  opacity: intensity < 0.05 ? 0.08 : 0.15 + intensity * 0.85,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "default",
                  transition: "opacity 0.2s",
                }}
              >
                <span style={{ fontSize: 10, fontWeight: val > 0 ? 600 : 400, color: intensity > 0.5 ? "#fff" : T.ink2 }}>{val || ""}</span>
              </div>
            );
          })}
        </div>
      ))}
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
        {statuses.map((s) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: statusColors[s] }} />
            <span style={{ fontSize: 10, color: T.ink3 }}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Chart 6: Backlog forecast chart (Recharts) ──────────────────────────── */
function BacklogForecastChart({ forecastResult }) {
  if (!forecastResult) return <p style={{ fontSize: 12, color: T.ink3 }}>Insufficient data for backlog forecast.</p>;
  const chartData = buildBacklogChartData(forecastResult);
  const trendColor = forecastResult.trend > 0 ? T.crit : T.done;
  return (
    <div>
      <ResponsiveContainer width="100%" height={220}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="week" tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="count" name="Actual backlog" fill={T.violet} radius={[4, 4, 0, 0]} opacity={0.85} />
          <Line
            type="monotone"
            dataKey="projected"
            name="Projected"
            stroke={trendColor}
            strokeWidth={2.5}
            strokeDasharray="6 3"
            dot={{ r: 5, fill: trendColor }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        {[
          { label: "Current", value: forecastResult.current, color: T.violet },
          { label: "Next week", value: forecastResult.nextWeek, color: trendColor },
          { label: "In 2 weeks", value: forecastResult.twoWeeks, color: trendColor },
        ].map((item) => (
          <div key={item.label} style={{ flex: 1, background: T.surfaceAlt, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
            <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: item.color, margin: 0, lineHeight: 1 }}>{item.value}</p>
            <p style={{ fontSize: 10, color: T.ink3, margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</p>
          </div>
        ))}
        <div style={{ flex: 1, background: forecastResult.trend > 0 ? T.critBg : T.doneBg, border: `1px solid ${forecastResult.trend > 0 ? T.critBorder : T.doneBorder}`, borderRadius: 10, padding: "10px 12px", textAlign: "center" }}>
          <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: trendColor, margin: 0, lineHeight: 1 }}>
            {forecastResult.trend > 0 ? `+${Math.round(forecastResult.trend)}` : Math.round(forecastResult.trend)}
          </p>
          <p style={{ fontSize: 10, color: T.ink3, margin: "4px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Weekly trend</p>
        </div>
      </div>
    </div>
  );
}

/* ── Chart 7: Engineer velocity trend ───────────────────────────────────── */
const VELOCITY_COLORS = ["#6C5CE7", "#00B894", "#E17055", "#0984E3", "#FDCB6E"];

function VelocityTrendChart({ data, engineers }) {
  if (!data || data.length === 0 || !engineers || engineers.length === 0) {
    return <p style={{ fontSize: 12, color: T.ink3 }}>No monthly velocity data available.</p>;
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        {engineers.map((eng, i) => (
          <div key={eng} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 16, height: 3, background: VELOCITY_COLORS[i % VELOCITY_COLORS.length], borderRadius: 2 }} />
            <span style={{ fontSize: 10, color: T.ink3 }}>{eng.split(" ")[0]}</span>
          </div>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="month" tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} angle={-30} textAnchor="end" height={40} interval="preserveStartEnd" />
          <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip />} />
          {engineers.map((eng, i) => (
            <Line
              key={eng}
              type="monotone"
              dataKey={eng}
              stroke={VELOCITY_COLORS[i % VELOCITY_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [allTickets, setAllTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [fCategory, setFCategory] = useState("all");
  const [fDivision, setFDivision] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [createdStartDate, setCreatedStartDate] = useState(null);
  const [createdEndDate, setCreatedEndDate] = useState(null);
  const [dueStartDate, setDueStartDate] = useState(null);
  const [dueEndDate, setDueEndDate] = useState(null);

  const isAdmin = user?.role === "Admin";
  const isManager = user?.role === "Manager";
  const isAdminOrManager = isAdmin || isManager;

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONT_URL;
    document.head.appendChild(link);
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");
      let data = res.data;
      if (user?.role === "Team Member") {
        data = data.filter((t) => t.assigned_to_name === user.name);
      }
      setAllTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoaded(true);
    }
  };

  const statusOpts = useMemo(() => unique(allTickets, "status"), [allTickets]);
  const priorityOpts = useMemo(() => unique(allTickets, "priority"), [allTickets]);
  const categoryOpts = useMemo(() => unique(allTickets, "category"), [allTickets]);
  const divisionOpts = useMemo(() => unique(allTickets, "division"), [allTickets]);
  const assigneeOpts = useMemo(() => unique(allTickets, "assigned_to_name"), [allTickets]);

  const tickets = useMemo(() => {
    return allTickets.filter((t) => {
      if (fStatus !== "all" && t.status !== fStatus) return false;
      if (fPriority !== "all" && t.priority !== fPriority) return false;
      if (fCategory !== "all" && t.category !== fCategory) return false;
      if (fDivision !== "all" && t.division !== fDivision) return false;
      if (fAssignee !== "all" && t.assigned_to_name !== fAssignee) return false;
      if (createdStartDate && t.created_at) {
        if (new Date(t.created_at).toISOString().split("T")[0] < createdStartDate) return false;
      }
      if (createdEndDate && t.created_at) {
        if (new Date(t.created_at).toISOString().split("T")[0] > createdEndDate) return false;
      }
      if (dueStartDate && t.due_date) {
        if (new Date(t.due_date).toISOString().split("T")[0] < dueStartDate) return false;
      }
      if (dueEndDate && t.due_date) {
        if (new Date(t.due_date).toISOString().split("T")[0] > dueEndDate) return false;
      }
      return true;
    });
  }, [allTickets, fStatus, fPriority, fCategory, fDivision, fAssignee, createdStartDate, createdEndDate, dueStartDate, dueEndDate]);

  const resetAll = () => {
    setFStatus("all"); setFPriority("all"); setFCategory("all");
    setFDivision("all"); setFAssignee("all");
    setCreatedStartDate(null); setCreatedEndDate(null);
    setDueStartDate(null); setDueEndDate(null);
  };

  /* ── Derived data ───────────────────────────────────────────────────── */
  const total = tickets.length;
  const openT = tickets.filter((t) => t.status === "Open");
  const progT = tickets.filter((t) => t.status === "In Progress");
  const doneT = tickets.filter((t) => t.status === "Completed");
  const critT = tickets.filter((t) => t.priority === "Critical" || t.priority === "High");
  const completionRate = pct(doneT.length, total);

  const overdueTickets = tickets.filter((t) => {
    if (!t.due_date || t.status === "Completed") return false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dueDate = new Date(t.due_date); dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });

  const avgResolution = avgResolutionDays(tickets);
  const sla = slaCompliance(tickets);
  const backlogForecastData = useMemo(() => backlogForecast(tickets), [tickets]);
  const agingData = useMemo(() => openTicketAging(tickets), [tickets]);
  const resolutionTrendData = useMemo(() => resolutionTrend(tickets), [tickets]);
  const monthlyTrend = useMemo(() => buildMonthlyTrend(tickets), [tickets]);
  const weeklyData = useMemo(() => buildWeekly(tickets), [tickets]);
  const creationTrendData = useMemo(() => buildCreationTrend(tickets), [tickets]);
  const dueAnalysisData = useMemo(() => buildDueAnalysis(tickets), [tickets]);

  const statusPieData = [
    { name: "Open", value: openT.length, color: T.open },
    { name: "In Progress", value: progT.length, color: T.prog },
    { name: "Completed", value: doneT.length, color: T.done },
  ];

  const priOrder = ["Critical", "High", "Medium", "Low"];
  const priColors = { Critical: T.crit, High: T.open, Medium: T.gold, Low: T.done };
  const priMap = groupBy(tickets, "priority");
  const priMax = Math.max(...priOrder.map((p) => priMap[p] || 0), 1);

  const assigneePerf = useMemo(() => {
    return unique(tickets, "assigned_to_name")
      .map((name) => {
        const pt = tickets.filter((t) => t.assigned_to_name === name);
        const comp = pt.filter((t) => t.status === "Completed").length;
        const openCount = pt.filter((t) => t.status === "Open").length;
        return { name, total: pt.length, comp, openCount, eff: pct(comp, pt.length) };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [tickets]);

  const divPerf = useMemo(() => {
    return unique(tickets, "division").map((d) => {
      const dt = tickets.filter((t) => t.division === d);
      const comp = dt.filter((t) => t.status === "Completed").length;
      const openCount = dt.filter((t) => t.status === "Open").length;
      const inProg = dt.filter((t) => t.status === "In Progress").length;
      return { name: d, Completed: comp, Open: openCount, "In Progress": inProg, rate: pct(comp, dt.length) };
    }).sort((a, b) => b.rate - a.rate);
  }, [tickets]);

  /* ── Advanced KPIs ──────────────────────────────────────────────────── */
  const totalAllocatedMinutes = tickets.reduce((s, t) => s + (t.allotted_minutes || 0), 0);
  const totalConsumedMinutes = tickets.reduce((s, t) => s + (t.consumed_minutes || 0), 0);
  const utilizationRate = totalAllocatedMinutes
    ? Math.round((totalConsumedMinutes / totalAllocatedMinutes) * 100) : 0;

  const estimationAccuracy = tickets.length
    ? Math.round(tickets.reduce((acc, t) => {
        const allotted = t.allotted_minutes || 0;
        const consumed = t.consumed_minutes || 0;
        if (!allotted) return acc;
        return acc + Math.max(0, 100 - (Math.abs(consumed - allotted) / allotted) * 100);
      }, 0) / tickets.length) : 0;

  const productivityScore = Math.round(
    completionRate * 0.35 + (sla || 0) * 0.25 + estimationAccuracy * 0.20 + utilizationRate * 0.20
  );
  const burnoutRisk = assigneePerf.filter((a) => a.openCount >= 5 && a.eff < 50).length;
  const teamHealthIndex = Math.round(
    completionRate * 0.30 + (sla || 0) * 0.25 + estimationAccuracy * 0.20 +
    utilizationRate * 0.15 + (100 - overdueTickets.length * 2) * 0.10
  );

  const utilizationHeatmap = assigneePerf.map((a) => {
    const et = tickets.filter((t) => t.assigned_to_name === a.name);
    return {
      engineer: a.name,
      allocated: et.reduce((s, t) => s + (t.allotted_minutes || 0), 0),
      consumed: et.reduce((s, t) => s + (t.consumed_minutes || 0), 0),
      utilization: et.reduce((s, t) => s + (t.allotted_minutes || 0), 0)
        ? Math.round((et.reduce((s, t) => s + (t.consumed_minutes || 0), 0) /
          et.reduce((s, t) => s + (t.allotted_minutes || 0), 0)) * 100) : 0,
    };
  });

  const productivityLeaderboard = assigneePerf
    .map((a) => ({ ...a, score: Math.round(a.eff * 0.6 + (100 - a.openCount * 5) * 0.4) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  const overdueRecoveryTrend = creationTrendData.map((d) => ({
    date: d.date, resolved: d.completed, overdue: overdueTickets.length,
  }));

  const workloadDistribution = assigneePerf.map((a) => ({
    name: a.name, open: a.openCount, completed: a.comp,
  }));

  /* ── NEW: 7 new chart data ──────────────────────────────────────────── */
  const funnelData = useMemo(() => buildFunnelData(tickets), [tickets]);
  const categoryPerfData = useMemo(() => buildCategoryPerf(tickets), [tickets]);
  const effortVarianceData = useMemo(() => buildEffortVariance(tickets, assigneePerf), [tickets, assigneePerf]);
  const slaByAssigneeData = useMemo(() => buildSlaByAssignee(tickets, assigneePerf), [tickets, assigneePerf]);
  const dayHeatmapData = useMemo(() => buildDayHeatmap(tickets), [tickets]);
  const velocityData = useMemo(() => buildVelocityTrend(tickets, assigneePerf), [tickets, assigneePerf]);
  const top5Engineers = assigneePerf.slice(0, 5).map((a) => a.name);

  const insights = useMemo(() => {
    const list = [];
    if (completionRate >= 60) list.push({ type: "good", label: "Strong resolution", text: `${completionRate}% completion rate — the team is resolving more than it opens.` });
    else if (completionRate < 40) list.push({ type: "warn", label: "Completion gap", text: `Only ${completionRate}% of tickets resolved. Consider reviewing workload distribution.` });
    if (critT.length > 0) list.push({ type: "warn", label: `${critT.length} critical/high ticket${critT.length > 1 ? "s" : ""}`, text: `${critT.length} ticket${critT.length > 1 ? "s" : ""} flagged Critical or High need immediate attention.` });
    if (overdueTickets.length > 0) list.push({ type: "warn", label: `${overdueTickets.length} overdue`, text: `${overdueTickets.length} ticket${overdueTickets.length > 1 ? "s are" : " is"} past due. Review and reassign if needed.` });
    if (avgResolution > 5) list.push({ type: "info", label: "Resolution time alert", text: `Average resolution is ${avgResolution} days. Consider process improvements.` });
    if (sla !== null && sla < 80) list.push({ type: "warn", label: "SLA risk", text: `SLA compliance at ${sla}%. Tickets are missing due dates.` });
    if (assigneePerf[0]) list.push({ type: "good", label: "Top performer", text: `${assigneePerf[0].name} leads with ${assigneePerf[0].total} tickets and ${assigneePerf[0].eff}% completion.` });
    const backlogRisk = assigneePerf.filter((a) => a.openCount >= 5);
    if (backlogRisk.length > 0) list.push({ type: "info", label: "Backlog pressure", text: `${backlogRisk.map((a) => a.name.split(" ")[0]).join(", ")} each have 5+ open tickets.` });
    if (divPerf[0]) list.push({ type: "gold", label: "Division leader", text: `${divPerf[0].name} leads all divisions with a ${divPerf[0].rate}% completion rate.` });
    return list.slice(0, 6);
  }, [completionRate, critT, overdueTickets, avgResolution, sla, assigneePerf, divPerf]);

  if (!loaded) {
    return (
      <MainLayout>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: 400, fontFamily: "'DM Sans', sans-serif", color: T.ink3 }}>Loading…</div>
      </MainLayout>
    );
  }

  const g2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 };
  const g3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 20 };
  const g4 = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 };

  return (
    <MainLayout>
      <div style={{ fontFamily: "'DM Sans', sans-serif", color: T.ink, background: T.bg, minHeight: "100vh" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, fontWeight: 400, letterSpacing: "-0.3px", color: T.ink, margin: 0 }}>Director's Command Center</h1>
            <p style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>{user?.role} · {user?.name}</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{ fontFamily: "'DM Serif Display', serif", fontSize: 48, color: T.done, lineHeight: 1, margin: 0 }}>{completionRate}%</p>
            <p style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: T.ink3, marginTop: 4 }}>Completion Rate</p>
          </div>
        </div>

        {/* ── Filters ── */}
        <Card style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              <FilterSelect label="Status" value={fStatus} options={statusOpts} onChange={setFStatus} />
              <FilterSelect label="Priority" value={fPriority} options={priorityOpts} onChange={setFPriority} />
              <FilterSelect label="Category" value={fCategory} options={categoryOpts} onChange={setFCategory} />
              <FilterSelect label="Division" value={fDivision} options={divisionOpts} onChange={setFDivision} />
              {isAdminOrManager && <FilterSelect label="Assignee" value={fAssignee} options={assigneeOpts} onChange={setFAssignee} />}
              <button
                onClick={resetAll}
                style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: T.ink3, background: "none", border: `1px solid ${T.border}`, borderRadius: 10, padding: "6px 14px", cursor: "pointer", alignSelf: "flex-end" }}
                onMouseEnter={(e) => { e.target.style.background = T.surfaceAlt; e.target.style.borderColor = T.borderMed; }}
                onMouseLeave={(e) => { e.target.style.background = "none"; e.target.style.borderColor = T.border; }}
              >Clear all filters</button>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <DateRangeFilter label="Created Date" startDate={createdStartDate} endDate={createdEndDate} onStartChange={setCreatedStartDate} onEndChange={setCreatedEndDate} />
              <DateRangeFilter label="Due Date" startDate={dueStartDate} endDate={dueEndDate} onStartChange={setDueStartDate} onEndChange={setDueEndDate} />
            </div>
          </div>
        </Card>

        {/* ── KPI row 1 ── */}
        <div style={g4}>
          <KpiCard label="Total Tickets" value={total} sub="Across all divisions" accentColor={T.violet} accentBorder={T.violetBorder} />
          <KpiCard label="Open" value={openT.length} sub={`${pct(openT.length, total)}% of total`} accentColor={T.open} accentBorder={T.openBorder} />
          <KpiCard label="In Progress" value={progT.length} sub={`${pct(progT.length, total)}% of total`} accentColor={T.prog} accentBorder={T.progBorder} />
          <KpiCard label="Completed" value={doneT.length} sub={`${pct(doneT.length, total)}% resolved`} accentColor={T.done} accentBorder={T.doneBorder} />
        </div>

        {/* ── KPI row 2 ── */}
        <div style={g4}>
          <KpiCard label="Utilization" value={`${utilizationRate}%`} sub="Consumed vs allocated" accentColor={T.prog} accentBorder={T.progBorder} />
          <KpiCard label="Estimation Accuracy" value={`${estimationAccuracy}%`} sub="Planned vs actual effort" accentColor={T.gold} accentBorder={T.goldBorder} />
          <KpiCard label="Productivity Score" value={productivityScore} sub="Overall operational score" accentColor={T.done} accentBorder={T.doneBorder} />
          <KpiCard label="Burnout Risk" value={burnoutRisk} sub="Engineers at risk" accentColor={T.crit} accentBorder={T.critBorder} />
        </div>

        {/* ── Team Health Index ── */}
        <div style={{ marginBottom: 24 }}>
          <KpiCard
            label="Team Health Index"
            value={`${teamHealthIndex}%`}
            sub="Composite operational health score"
            accentColor={teamHealthIndex >= 80 ? T.done : teamHealthIndex >= 60 ? T.gold : T.crit}
            accentBorder={T.borderMed}
          />
        </div>

        {/* ── Status pie + Priority bars ── */}
        <div style={g2}>
          <Card>
            <CardHeader title="Status distribution" sub="Current breakdown by status" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusPieData} dataKey="value" outerRadius={90} innerRadius={55} paddingAngle={2}>
                  {statusPieData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend formatter={(value, entry) => `${value}: ${entry.payload.value} (${pct(entry.payload.value, total)}%)`} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, marginTop: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <CardHeader title="Priority breakdown" sub="Ticket volume by urgency level" />
            <div style={{ paddingTop: 8 }}>
              {priOrder.filter((p) => priMap[p]).map((p) => (
                <HorizontalBar key={p} label={p} value={priMap[p] || 0} max={priMax} color={priColors[p]} />
              ))}
            </div>
          </Card>
        </div>

        {/* ── Monthly volume & completion rate ── */}
        <div style={g2}>
          <Card>
            <CardHeader title="Monthly ticket volume" sub="Created vs completed by month" />
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="month" tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="created" fill={T.open} name="Created" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" fill={T.done} name="Completed" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <CardHeader title="Monthly completion rate" sub="% of tickets resolved in month of creation" />
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="month" tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} domain={[0, 100]} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="completionRate" stroke={T.done} strokeWidth={3} name="Completion Rate %" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Resolution trend & Aging ── */}
        <div style={g2}>
          <Card>
            <CardHeader title="Resolution time trend" sub="Average days to close (monthly)" />
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={resolutionTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="month" tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="avgResolutionDays" stroke={T.violet} strokeWidth={2.5} name="Avg Resolution (days)" dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <CardHeader title="Open ticket aging" sub="Age distribution of unresolved tickets" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={agingData} dataKey="value" outerRadius={80} innerRadius={50} paddingAngle={2}>
                  {agingData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Daily activity + Due date overview ── */}
        <div style={g2}>
          <Card>
            <CardHeader title="Daily activity (last 30 days)" sub="Created vs completed" />
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={creationTrendData}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="date" tick={{ fill: T.ink3, fontSize: 9 }} axisLine={false} tickLine={false} angle={-45} textAnchor="end" height={50} interval="preserveStartEnd" />
                <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="created" stroke={T.open} strokeWidth={2} name="Created" dot={{ r: 2 }} />
                <Line type="monotone" dataKey="completed" stroke={T.done} strokeWidth={2} name="Completed" dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </Card>
          <Card>
            <CardHeader title="Due date overview" sub="Tickets by due urgency" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={dueAnalysisData} dataKey="value" outerRadius={80} innerRadius={50} paddingAngle={2} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {dueAnalysisData.map((entry, i) => <Cell key={i} fill={entry.color} stroke="none" />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            NEW SECTION: 7 ADDITIONAL CHARTS
            ══════════════════════════════════════════════════════════════════ */}
        <div style={{ margin: "32px 0 20px", borderTop: `2px solid ${T.violetBorder}`, paddingTop: 24 }}>
          <h2 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 400, color: T.ink, margin: "0 0 4px" }}>Flow, Gaps & Velocity</h2>
          <p style={{ fontSize: 13, color: T.ink3, marginBottom: 24 }}>Seven additional perspectives on team performance and risk</p>

          {/* ── CHART 1: Ticket Flow Funnel ── */}
          <Card style={{ marginBottom: 20 }}>
            <CardHeader
              title="Ticket flow funnel"
              sub="Drop-off rate at each stage — shows where work stalls"
            />
            <FunnelChart data={funnelData} />
          </Card>

          {/* ── CHART 2: Category performance ── */}
          <Card style={{ marginBottom: 20 }}>
            <CardHeader
              title="Category completion rate"
              sub="Resolution rate vs open load per ticket category"
            />
            <CategoryPerfChart data={categoryPerfData} />
          </Card>

          {/* ── CHART 3 & 4: Effort Variance + SLA Breakdown side by side ── */}
          <div style={g2}>
            <Card>
              <CardHeader
                title="Estimation variance per engineer"
                sub="% over/under consumed vs allotted time — center = perfect estimate"
              />
              <EffortVarianceChart data={effortVarianceData} />
            </Card>
            <Card>
              <CardHeader
                title="SLA compliance by assignee"
                sub="% of their tickets closed on or before due date"
              />
              <SlaBreakdownChart data={slaByAssigneeData} />
            </Card>
          </div>

          {/* ── CHART 5: Day-of-week heatmap ── */}
          <Card style={{ marginBottom: 20 }}>
            <CardHeader
              title="Day-of-week activity heatmap"
              sub="Ticket volume by status per weekday — darker = more tickets"
            />
            <DayHeatmap data={dayHeatmapData} />
          </Card>

          {/* ── CHART 6: Backlog forecast ── */}
          <Card style={{ marginBottom: 20 }}>
            <CardHeader
              title="Backlog forecast"
              sub="Historical weekly open backlog with 2-week linear projection"
            />
            <BacklogForecastChart forecastResult={backlogForecastData} />
          </Card>

          {/* ── CHART 7: Velocity trend ── */}
          <Card style={{ marginBottom: 20 }}>
            <CardHeader
              title="Engineer velocity trend"
              sub="Monthly tickets completed per engineer — top 5 by volume"
            />
            <VelocityTrendChart data={velocityData} engineers={top5Engineers} />
          </Card>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            EXISTING ADVANCED ANALYTICS SECTION
            ══════════════════════════════════════════════════════════════════ */}
        <div style={{ margin: "32px 0 20px" }}>
          <CardHeader title="Productivity & Performance Intelligence" sub="Advanced analytics for team efficiency" />
        </div>

        {/* Team Utilization Chart */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader title="Team utilization" sub="Consumed vs allocated effort per engineer" />
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={utilizationHeatmap}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="engineer" tick={{ fill: T.ink3, fontSize: 10 }} />
              <YAxis tick={{ fill: T.ink3, fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="allocated" fill={T.gold} radius={[4, 4, 0, 0]} name="Allocated (min)" />
              <Bar dataKey="consumed" fill={T.prog} radius={[4, 4, 0, 0]} name="Consumed (min)" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Estimation Accuracy Scatter */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader title="Estimation accuracy (scatter)" sub="Allocated vs consumed time per ticket" />
          <ResponsiveContainer width="100%" height={320}>
            <ScatterChart>
              <CartesianGrid />
              <XAxis type="number" dataKey="allotted_minutes" name="Allocated (min)" tick={{ fill: T.ink3, fontSize: 10 }} />
              <YAxis type="number" dataKey="consumed_minutes" name="Consumed (min)" tick={{ fill: T.ink3, fontSize: 10 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter name="Tickets" data={tickets} fill={T.violet} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        {/* Productivity Leaderboard */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader title="Productivity leaderboard" sub="Score based on efficiency & backlog — top 10 engineers" />
          {productivityLeaderboard.map((u, i) => (
            <div key={u.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, color: T.ink3, width: 20 }}>#{i + 1}</span>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: AVATAR_COLORS[i % AVATAR_COLORS.length] + "22", color: AVATAR_COLORS[i % AVATAR_COLORS.length], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600 }}>{initials(u.name)}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.ink }}>{u.name}</div>
                  <div style={{ fontSize: 11, color: T.ink3 }}>{u.comp} completed · {u.openCount} open</div>
                </div>
              </div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 28, color: u.score >= 70 ? T.done : u.score >= 50 ? T.gold : T.crit }}>{u.score}</div>
            </div>
          ))}
        </Card>

        {/* Overdue Recovery Trend */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader title="Overdue recovery trend" sub="Resolved tickets vs overdue backlog over time" />
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={overdueRecoveryTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: T.ink3, fontSize: 10 }} />
              <YAxis tick={{ fill: T.ink3, fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Line type="monotone" dataKey="resolved" stroke={T.done} strokeWidth={3} name="Resolved" />
              <Line type="monotone" dataKey="overdue" stroke={T.crit} strokeWidth={3} name="Overdue" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        {/* Workload Distribution */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader title="Workload distribution" sub="Open vs completed workload per engineer" />
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={workloadDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fill: T.ink3, fontSize: 10 }} />
              <YAxis tick={{ fill: T.ink3, fontSize: 10 }} />
              <Tooltip content={<ChartTooltip />} />
              <Legend />
              <Bar dataKey="open" stackId="a" fill={T.open} name="Open" />
              <Bar dataKey="completed" stackId="a" fill={T.done} name="Completed" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Team efficiency matrix */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader title="Team efficiency matrix" sub="Completion rate and open load per assignee — top 10 by volume" />
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: T.ink3 }}><span style={{ display: "inline-block", width: 10, height: 5, background: T.open, borderRadius: 3, marginRight: 4, verticalAlign: "middle" }} />Open load</span>
            <span style={{ fontSize: 10, color: T.ink3 }}><span style={{ display: "inline-block", width: 10, height: 5, background: T.done, borderRadius: 3, marginRight: 4, verticalAlign: "middle" }} />Completed</span>
          </div>
          {assigneePerf.map((a, i) => (
            <EfficiencyRow key={a.name} rank={i + 1} name={a.name} total={a.total} comp={a.comp} openCount={a.openCount} eff={a.eff} avatarColor={AVATAR_COLORS[i % AVATAR_COLORS.length]} />
          ))}
        </Card>

        {/* Division performance + Weekly trend (Admin/Manager only) */}
        {isAdminOrManager && (
          <div style={g2}>
            <Card>
              <CardHeader title="Division performance" sub="Ticket status breakdown per division" />
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={divPerf} layout="vertical" barCategoryGap={8}>
                  <CartesianGrid strokeDasharray="2 4" horizontal={false} />
                  <XAxis type="number" tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" tick={{ fill: T.ink2, fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Completed" stackId="a" fill={T.done} />
                  <Bar dataKey="In Progress" stackId="a" fill={T.prog} />
                  <Bar dataKey="Open" stackId="a" fill={T.open} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
            <Card>
              <CardHeader title="Weekly activity pattern" sub="Open vs completed by day of week" />
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={weeklyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                  <XAxis dataKey="day" tick={{ fill: T.ink3, fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  <Area type="monotone" dataKey="Open" stroke={T.open} fill={T.openBg} strokeWidth={2.5} strokeDasharray="5 3" />
                  <Area type="monotone" dataKey="Completed" stroke={T.done} fill={T.doneBg} strokeWidth={2.5} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

        {/* Insights + Director summary (Admin/Manager only) */}
        {isAdminOrManager && (
          <div style={g2}>
            <Card>
              <CardHeader title="AI insights" sub="Automatically surfaced from your data" />
              {insights.map((ins, i) => <InsightCard key={i} type={ins.type} label={ins.label} text={ins.text} />)}
            </Card>
            <Card>
              <CardHeader title="Director summary" sub="Key operational metrics at a glance" />
              <MetricRow label="Completion rate" value={`${completionRate}%`} color={T.done} />
              <MetricRow label="Avg resolution (days)" value={`${avgResolution} d`} color={T.prog} />
              <MetricRow label="SLA compliance" value={sla !== null ? `${sla}%` : "N/A"} color={sla !== null && sla >= 80 ? T.done : T.crit} />
              <MetricRow label="Active assignees" value={assigneePerf.length} color={T.prog} />
              <MetricRow label="Critical / High" value={critT.length} color={critT.length > 5 ? T.crit : T.ink} />
              <MetricRow label="Overdue tickets" value={overdueTickets.length} color={overdueTickets.length > 0 ? T.overdue : T.done} />
              <MetricRow label="Top performer" value={assigneePerf[0]?.name || "—"} color={T.violet} />
              <MetricRow label="Best division" value={divPerf[0]?.name || "—"} color={T.violet} />
              <MetricRow label="Avg team load" value={assigneePerf.length > 0 ? `${Math.round(total / assigneePerf.length)} tickets` : "—"} color={T.ink2} />
              {backlogForecastData && (
                <MetricRow label="Backlog forecast (next week)" value={backlogForecastData.nextWeek} color={backlogForecastData.trend > 0 ? T.crit : T.done} />
              )}
              <MetricRow label="Open rate" value={`${pct(openT.length, total)}%`} color={T.open} />
              <MetricRow label="Team Health Index" value={`${teamHealthIndex}%`} color={teamHealthIndex >= 80 ? T.done : teamHealthIndex >= 60 ? T.gold : T.crit} />
              <MetricRow label="Estimation Accuracy" value={`${estimationAccuracy}%`} color={estimationAccuracy >= 80 ? T.done : T.gold} />
              <MetricRow label="Utilization Rate" value={`${utilizationRate}%`} color={utilizationRate >= 70 ? T.done : utilizationRate >= 50 ? T.gold : T.crit} />
              <MetricRow label="Burnout Risk Count" value={burnoutRisk} color={burnoutRisk > 2 ? T.crit : T.done} />
            </Card>
          </div>
        )}

      </div>
    </MainLayout>
  );
}