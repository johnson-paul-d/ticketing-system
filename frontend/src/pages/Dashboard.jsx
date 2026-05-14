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

// Generate creation trend over time (last 30 days)
function buildCreationTrend(tickets) {
  const dateMap = new Map();
  const today = new Date();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(today.getDate() - 30);
  
  // Initialize last 30 days with 0
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    dateMap.set(dateStr, { date: dateStr, created: 0, completed: 0 });
  }
  
  tickets.forEach(t => {
    if (t.created_at) {
      const createdDate = new Date(t.created_at).toISOString().split('T')[0];
      if (dateMap.has(createdDate)) {
        dateMap.get(createdDate).created++;
      } else if (new Date(createdDate) >= thirtyDaysAgo) {
        dateMap.set(createdDate, { date: createdDate, created: 1, completed: 0 });
      }
    }
    if (t.status === "Completed" && t.updated_at) {
      const completedDate = new Date(t.updated_at).toISOString().split('T')[0];
      if (dateMap.has(completedDate)) {
        dateMap.get(completedDate).completed++;
      } else if (new Date(completedDate) >= thirtyDaysAgo) {
        dateMap.set(completedDate, { date: completedDate, created: 0, completed: 1 });
      }
    }
  });
  
  return Array.from(dateMap.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// Monthly trend over all data
function buildMonthlyTrend(tickets) {
  const monthMap = new Map();
  tickets.forEach(t => {
    if (!t.created_at) return;
    const date = new Date(t.created_at);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const monthName = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { month: monthName, created: 0, completed: 0, open: 0 });
    }
    const entry = monthMap.get(monthKey);
    entry.created++;
    
    if (t.status === "Completed") {
      entry.completed++;
    }
    if (t.status === "Open") {
      entry.open++;
    }
  });
  
  // Also need to account for tickets completed in months after creation
  tickets.forEach(t => {
    if (t.status === "Completed" && t.updated_at) {
      const compDate = new Date(t.updated_at);
      const monthKey = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, '0')}`;
      const monthName = compDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      // Already counted created in its own month; completed count is fine
    }
  });
  
  // Convert to sorted array
  const sorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([key, val]) => ({
    month: val.month,
    created: val.created,
    completed: val.completed,
    openRate: val.created > 0 ? pct(val.open, val.created) : 0,
    completionRate: val.created > 0 ? pct(val.completed, val.created) : 0,
  }));
}

// Calculate average resolution time in days for completed tickets
function avgResolutionDays(tickets) {
  const completedTickets = tickets.filter(t => t.status === "Completed" && t.created_at && t.updated_at);
  if (completedTickets.length === 0) return 0;
  const totalDays = completedTickets.reduce((sum, t) => {
    const created = new Date(t.created_at);
    const resolved = new Date(t.updated_at);
    const diffDays = Math.max(0, (resolved - created) / (1000 * 60 * 60 * 24));
    return sum + diffDays;
  }, 0);
  return Math.round((totalDays / completedTickets.length) * 10) / 10;
}

// Resolution time trend by month
function resolutionTrend(tickets) {
  const completed = tickets.filter(t => t.status === "Completed" && t.created_at && t.updated_at);
  const monthMap = new Map();
  completed.forEach(t => {
    const compDate = new Date(t.updated_at);
    const monthKey = `${compDate.getFullYear()}-${String(compDate.getMonth() + 1).padStart(2, '0')}`;
    const monthName = compDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    const resolutionDays = (new Date(t.updated_at) - new Date(t.created_at)) / (1000 * 60 * 60 * 24);
    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, { month: monthName, totalDays: 0, count: 0 });
    }
    const entry = monthMap.get(monthKey);
    entry.totalDays += resolutionDays;
    entry.count++;
  });
  const sorted = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([key, val]) => ({
    month: val.month,
    avgResolutionDays: Math.round((val.totalDays / val.count) * 10) / 10,
  }));
}

// Aging of open tickets: buckets
function openTicketAging(tickets) {
  const openTickets = tickets.filter(t => t.status === "Open" && t.created_at);
  const today = new Date();
  const buckets = {
    "< 1 week": 0,
    "1-2 weeks": 0,
    "2-4 weeks": 0,
    "> 4 weeks": 0,
  };
  openTickets.forEach(t => {
    const created = new Date(t.created_at);
    const daysOpen = (today - created) / (1000 * 60 * 60 * 24);
    if (daysOpen < 7) buckets["< 1 week"]++;
    else if (daysOpen < 14) buckets["1-2 weeks"]++;
    else if (daysOpen < 28) buckets["2-4 weeks"]++;
    else buckets["> 4 weeks"]++;
  });
  return Object.entries(buckets).map(([name, value]) => ({ name, value, color: value > 0 ? T.crit : T.ink3 }));
}

// SLA compliance: tickets completed before due date
function slaCompliance(tickets) {
  const ticketsWithDue = tickets.filter(t => t.due_date && t.status === "Completed" && t.updated_at);
  if (ticketsWithDue.length === 0) return null;
  const onTime = ticketsWithDue.filter(t => {
    const due = new Date(t.due_date);
    const resolved = new Date(t.updated_at);
    return resolved <= due;
  }).length;
  return pct(onTime, ticketsWithDue.length);
}

// Backlog forecast (simple linear regression on open tickets over last 6 weeks)
function backlogForecast(tickets) {
  // Group open tickets by week
  const weekMap = new Map();
  const today = new Date();
  for (let i = 0; i < 6; i++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (i * 7));
    const weekKey = weekStart.toISOString().split('T')[0];
    weekMap.set(weekKey, 0);
  }
  tickets.filter(t => t.status !== "Completed" && t.created_at).forEach(t => {
    const created = new Date(t.created_at);
    for (let i = 0; i < 6; i++) {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - (i * 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 7);
      if (created >= weekStart && created < weekEnd) {
        const weekKey = weekStart.toISOString().split('T')[0];
        weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + 1);
        break;
      }
    }
  });
  const weeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const data = weeks.map(([week, count], idx) => ({ week: `W-${5-idx}`, count }));
  // Simple linear extrapolation: average change
  if (data.length < 2) return null;
  const changes = [];
  for (let i = 1; i < data.length; i++) {
    changes.push(data[i].count - data[i-1].count);
  }
  const avgChange = changes.reduce((a,b) => a+b,0) / changes.length;
  const lastCount = data[data.length-1].count;
  const nextForecast = Math.max(0, Math.round(lastCount + avgChange));
  const nextNext = Math.max(0, Math.round(lastCount + avgChange * 2));
  return { current: lastCount, nextWeek: nextForecast, twoWeeks: nextNext, trend: avgChange };
}

// Due date analysis
function buildDueAnalysis(tickets) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  
  let overdue = 0;
  let dueThisWeek = 0;
  let dueLater = 0;
  let noDueDate = 0;
  
  tickets.forEach(t => {
    if (!t.due_date) {
      noDueDate++;
      return;
    }
    const dueDate = new Date(t.due_date);
    dueDate.setHours(0, 0, 0, 0);
    if (dueDate < today) {
      overdue++;
    } else if (dueDate <= nextWeek) {
      dueThisWeek++;
    } else {
      dueLater++;
    }
  });
  
  return [
    { name: "Overdue", value: overdue, color: T.overdue },
    { name: "Due This Week", value: dueThisWeek, color: T.dueSoon },
    { name: "Due Later", value: dueLater, color: T.dueLater },
    { name: "No Due Date", value: noDueDate, color: T.ink3 },
  ];
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
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 4,
          background: accentColor,
          borderRadius: "4px 0 0 4px",
        }}
      />
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          color: T.ink3,
          marginBottom: 8,
        }}
      >
        {label}
      </p>
      <p
        style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 34,
          lineHeight: 1,
          color: accentColor,
          margin: "0 0 4px",
        }}
      >
        {value}
      </p>
      <p style={{ fontSize: 11, color: T.ink3, margin: 0 }}>{sub}</p>
      {trend !== undefined && (
        <div style={{ marginTop: 8, fontSize: 10, color: trend >= 0 ? T.done : T.crit }}>
          {trend > 0 ? `↑ ${trend}%` : trend < 0 ? `↓ ${Math.abs(trend)}%` : '→ 0%'} from last period
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
      <p style={{ fontSize: 14, fontWeight: 600, color: T.ink, margin: 0 }}>
        {title}
      </p>
      {sub && (
        <p style={{ fontSize: 11, color: T.ink3, margin: "4px 0 0" }}>{sub}</p>
      )}
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          color: T.ink3,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 12,
          color: T.ink,
          background: T.surfaceAlt,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
          padding: "6px 10px",
          cursor: "pointer",
          outline: "none",
          transition: "border-color 0.2s ease",
        }}
        onFocus={(e) => e.target.style.borderColor = T.violet}
        onBlur={(e) => e.target.style.borderColor = T.border}
      >
        <option value="all">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function DateRangeFilter({ label, startDate, endDate, onStartChange, onEndChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label
        style={{
          fontSize: 10,
          color: T.ink3,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 500,
        }}
      >
        {label}
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          type="date"
          value={startDate || ""}
          onChange={(e) => onStartChange(e.target.value || null)}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: T.ink,
            background: T.surfaceAlt,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
            outline: "none",
          }}
          placeholder="Start"
        />
        <input
          type="date"
          value={endDate || ""}
          onChange={(e) => onEndChange(e.target.value || null)}
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: T.ink,
            background: T.surfaceAlt,
            border: `1px solid ${T.border}`,
            borderRadius: 10,
            padding: "6px 10px",
            cursor: "pointer",
            outline: "none",
          }}
          placeholder="End"
        />
      </div>
    </div>
  );
}

function HorizontalBar({ label, value, max, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 10,
      }}
    >
      <span
        style={{
          fontSize: 12,
          color: T.ink2,
          width: 90,
          flexShrink: 0,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          background: T.surfaceAlt,
          borderRadius: 6,
          height: 8,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct(value, max)}%`,
            height: "100%",
            background: color,
            borderRadius: 6,
            transition: "width 0.4s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: T.ink3, width: 28, textAlign: "right" }}>
        {value}
      </span>
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <span style={{ fontSize: 12, color: T.ink3 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || T.ink }}>
        {value}
      </span>
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
    <div
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        borderRadius: 12,
        padding: "12px 16px",
        marginBottom: 10,
        transition: "transform 0.1s ease",
      }}
    >
      <p
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontWeight: 600,
          color: s.labelColor,
          margin: "0 0 4px",
        }}
      >
        {label}
      </p>
      <p style={{ fontSize: 12, color: T.ink2, lineHeight: 1.5, margin: 0 }}>
        {text}
      </p>
    </div>
  );
}

function EfficiencyRow({ rank, name, total, comp, openCount, eff, avatarColor }) {
  const effColor =
    eff >= 70 ? T.done : eff >= 40 ? T.gold : T.crit;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "9px 0",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <span style={{ fontSize: 10, color: T.ink3, width: 16, flexShrink: 0 }}>
        {rank}
      </span>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: avatarColor + "22",
          color: avatarColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          fontWeight: 600,
          flexShrink: 0,
        }}
      >
        {initials(name)}
      </div>
      <span
        style={{
          fontSize: 12,
          color: T.ink2,
          flex: 1,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={name}
      >
        {name}
      </span>
      <div style={{ width: 120, flexShrink: 0 }}>
        <div
          style={{
            height: 5,
            borderRadius: 3,
            background: T.open,
            width: `${pct(openCount, total)}%`,
            marginBottom: 3,
          }}
        />
        <div
          style={{
            height: 5,
            borderRadius: 3,
            background: T.done,
            width: `${pct(comp, total)}%`,
          }}
        />
      </div>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: effColor,
          width: 36,
          textAlign: "right",
          flexShrink: 0,
        }}
      >
        {eff}%
      </span>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 12,
        padding: "10px 14px",
        boxShadow: "0 4px 16px rgba(15,25,35,0.12)",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {label && (
        <p style={{ fontSize: 11, color: T.ink3, marginBottom: 6 }}>{label}</p>
      )}
      {payload.map((p, i) => (
        <div
          key={i}
          style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.color,
            }}
          />
          <span style={{ fontSize: 12, color: T.ink2 }}>{p.name}:</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

/* ─── Main component ────────────────────────────────────────────────────── */
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
  const isDirector = isAdmin || isManager; // For director-level views

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
        const createdDate = new Date(t.created_at).toISOString().split('T')[0];
        if (createdDate < createdStartDate) return false;
      }
      if (createdEndDate && t.created_at) {
        const createdDate = new Date(t.created_at).toISOString().split('T')[0];
        if (createdDate > createdEndDate) return false;
      }
      
      if (dueStartDate && t.due_date) {
        const dueDate = new Date(t.due_date).toISOString().split('T')[0];
        if (dueDate < dueStartDate) return false;
      }
      if (dueEndDate && t.due_date) {
        const dueDate = new Date(t.due_date).toISOString().split('T')[0];
        if (dueDate > dueEndDate) return false;
      }
      
      return true;
    });
  }, [allTickets, fStatus, fPriority, fCategory, fDivision, fAssignee, createdStartDate, createdEndDate, dueStartDate, dueEndDate]);

  const resetAll = () => {
    setFStatus("all");
    setFPriority("all");
    setFCategory("all");
    setFDivision("all");
    setFAssignee("all");
    setCreatedStartDate(null);
    setCreatedEndDate(null);
    setDueStartDate(null);
    setDueEndDate(null);
  };

  /* ── Derived data ───────────────────────────────────────────────────── */
  const total = tickets.length;
  const openT = tickets.filter((t) => t.status === "Open");
  const progT = tickets.filter((t) => t.status === "In Progress");
  const doneT = tickets.filter((t) => t.status === "Completed");
  const critT = tickets.filter(
    (t) => t.priority === "Critical" || t.priority === "High"
  );
  const completionRate = pct(doneT.length, total);
  const overdueTickets = tickets.filter(t => {
    if (!t.due_date || t.status === "Completed") return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(t.due_date);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  });
  const avgResolution = avgResolutionDays(tickets);
  const sla = slaCompliance(tickets);
  const backlogForecastData = backlogForecast(tickets);
  const agingData = openTicketAging(tickets);
  const resolutionTrendData = resolutionTrend(tickets);
  const monthlyTrend = buildMonthlyTrend(tickets);
  
  const statusPieData = [
    { name: "Open", value: openT.length, color: T.open },
    { name: "In Progress", value: progT.length, color: T.prog },
    { name: "Completed", value: doneT.length, color: T.done },
  ];

  const priOrder = ["Critical", "High", "Medium", "Low"];
  const priColors = {
    Critical: T.crit,
    High: T.open,
    Medium: T.gold,
    Low: T.done,
  };
  const priMap = groupBy(tickets, "priority");
  const priMax = Math.max(...priOrder.map((p) => priMap[p] || 0), 1);

  const weeklyData = useMemo(() => buildWeekly(tickets), [tickets]);
  const creationTrendData = useMemo(() => buildCreationTrend(tickets), [tickets]);
  const dueAnalysisData = useMemo(() => buildDueAnalysis(tickets), [tickets]);

  const assigneePerf = useMemo(() => {
    return unique(tickets, "assigned_to_name")
      .map((name) => {
        const pt = tickets.filter((t) => t.assigned_to_name === name);
        const comp = pt.filter((t) => t.status === "Completed").length;
        const openCount = pt.filter((t) => t.status === "Open").length;
        return {
          name,
          total: pt.length,
          comp,
          openCount,
          eff: pct(comp, pt.length),
        };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [tickets]);

  const divPerf = useMemo(() => {
    return unique(tickets, "division")
      .map((d) => {
        const dt = tickets.filter((t) => t.division === d);
        const comp = dt.filter((t) => t.status === "Completed").length;
        const openCount = dt.filter((t) => t.status === "Open").length;
        const inProg = dt.filter((t) => t.status === "In Progress").length;
        return {
          name: d,
          Completed: comp,
          Open: openCount,
          "In Progress": inProg,
          rate: pct(comp, dt.length),
        };
      })
      .sort((a, b) => b.rate - a.rate);
  }, [tickets]);

  const insights = useMemo(() => {
    const list = [];
    if (completionRate >= 60)
      list.push({
        type: "good",
        label: "Strong resolution",
        text: `${completionRate}% completion rate — the team is resolving more than it opens. Operational health is strong.`,
      });
    else if (completionRate < 40)
      list.push({
        type: "warn",
        label: "Completion gap",
        text: `Only ${completionRate}% of tickets resolved. Consider reviewing workload distribution or scope.`,
      });
    if (critT.length > 0)
      list.push({
        type: "warn",
        label: `${critT.length} critical/high ticket${critT.length > 1 ? "s" : ""}`,
        text: `${critT.length} ticket${critT.length > 1 ? "s" : ""} flagged Critical or High priority need immediate attention.`,
      });
    if (overdueTickets.length > 0)
      list.push({
        type: "warn",
        label: `${overdueTickets.length} overdue ticket${overdueTickets.length > 1 ? "s" : ""}`,
        text: `${overdueTickets.length} ticket${overdueTickets.length > 1 ? "s are" : " is"} past due date. Review and reassign if needed.`,
      });
    if (avgResolution > 5)
      list.push({
        type: "info",
        label: "Resolution time alert",
        text: `Average resolution time is ${avgResolution} days. Consider process improvements.`,
      });
    if (sla !== null && sla < 80)
      list.push({
        type: "warn",
        label: "SLA risk",
        text: `SLA compliance at ${sla}%. Tickets are missing due dates.`,
      });
    const topPerformer = assigneePerf[0];
    if (topPerformer)
      list.push({
        type: "good",
        label: "Top performer",
        text: `${topPerformer.name} leads with ${topPerformer.total} tickets and a ${topPerformer.eff}% completion rate.`,
      });
    const backlogRisk = assigneePerf.filter((a) => a.openCount >= 5);
    if (backlogRisk.length > 0)
      list.push({
        type: "info",
        label: "Backlog pressure",
        text: `${backlogRisk.map((a) => a.name.split(" ")[0]).join(", ")} each have 5+ open tickets. Redistribution may help.`,
      });
    if (divPerf[0])
      list.push({
        type: "gold",
        label: "Division leader",
        text: `${divPerf[0].name} leads all divisions with a ${divPerf[0].rate}% completion rate.`,
      });
    return list.slice(0, 6);
  }, [completionRate, critT, overdueTickets, avgResolution, sla, assigneePerf, divPerf]);

  /* ── Loading state ──────────────────────────────────────────────────── */
  if (!loaded) {
    return (
      <MainLayout>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: 400,
            fontFamily: "'DM Sans', sans-serif",
            color: T.ink3,
          }}
        >
          Loading…
        </div>
      </MainLayout>
    );
  }

  /* ── Layout helpers ─────────────────────────────────────────────────── */
  const g2 = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 };
  const g3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginBottom: 20 };
  const g4 = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 };

  return (
    <MainLayout>
      <div style={{ fontFamily: "'DM Sans', sans-serif", color: T.ink, background: T.bg, minHeight: "100vh" }}>

        {/* ── Header ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 28,
          }}
        >
          <div>
            <h1
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 32,
                fontWeight: 400,
                letterSpacing: "-0.3px",
                color: T.ink,
                margin: 0,
              }}
            >
              Director's Command Center
            </h1>
            <p style={{ fontSize: 13, color: T.ink3, marginTop: 4 }}>
              {user?.role} · {user?.name}
            </p>
          </div>
          <div style={{ textAlign: "right" }}>
            <p
              style={{
                fontFamily: "'DM Serif Display', serif",
                fontSize: 48,
                color: T.done,
                lineHeight: 1,
                margin: 0,
              }}
            >
              {completionRate}%
            </p>
            <p
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: T.ink3,
                marginTop: 4,
              }}
            >
              Completion Rate
            </p>
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
              {isAdminOrManager && (
                <FilterSelect label="Assignee" value={fAssignee} options={assigneeOpts} onChange={setFAssignee} />
              )}
              <button
                onClick={resetAll}
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: T.ink3,
                  background: "none",
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  padding: "6px 14px",
                  cursor: "pointer",
                  alignSelf: "flex-end",
                  transition: "all 0.2s ease",
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = T.surfaceAlt;
                  e.target.style.borderColor = T.borderMed;
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = "none";
                  e.target.style.borderColor = T.border;
                }}
              >
                Clear all filters
              </button>
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <DateRangeFilter
                label="Created Date"
                startDate={createdStartDate}
                endDate={createdEndDate}
                onStartChange={setCreatedStartDate}
                onEndChange={setCreatedEndDate}
              />
              <DateRangeFilter
                label="Due Date"
                startDate={dueStartDate}
                endDate={dueEndDate}
                onStartChange={setDueStartDate}
                onEndChange={setDueEndDate}
              />
            </div>
          </div>
        </Card>

        {/* ── KPI cards ── */}
        <div style={g4}>
          <KpiCard label="Total Tickets" value={total} sub="Across all divisions" accentColor={T.violet} accentBorder={T.violetBorder} />
          <KpiCard label="Open" value={openT.length} sub={`${pct(openT.length, total)}% of total`} accentColor={T.open} accentBorder={T.openBorder} />
          <KpiCard label="In Progress" value={progT.length} sub={`${pct(progT.length, total)}% of total`} accentColor={T.prog} accentBorder={T.progBorder} />
          <KpiCard label="Completed" value={doneT.length} sub={`${pct(doneT.length, total)}% resolved`} accentColor={T.done} accentBorder={T.doneBorder} />
        </div>

        {/* ── Director-level KPIs (new) ── */}
        <div style={g4}>
          <KpiCard 
            label="Avg Resolution" 
            value={`${avgResolution} d`} 
            sub="Mean time to close" 
            accentColor={T.prog} 
            accentBorder={T.progBorder}
            trend={avgResolution > 3 ? -5 : 2}
          />
          <KpiCard 
            label="SLA Compliance" 
            value={sla !== null ? `${sla}%` : "N/A"} 
            sub="Completed before due date" 
            accentColor={sla !== null && sla >= 80 ? T.done : T.crit} 
            accentBorder={sla !== null && sla >= 80 ? T.doneBorder : T.critBorder}
          />
          <KpiCard 
            label="Overdue" 
            value={overdueTickets.length} 
            sub="Past due date" 
            accentColor={T.overdue} 
            accentBorder={T.critBorder}
          />
          <KpiCard 
            label="Backlog Forecast" 
            value={backlogForecastData ? backlogForecastData.nextWeek : "?"} 
            sub="Next week (trend)" 
            accentColor={backlogForecastData && backlogForecastData.trend > 0 ? T.crit : T.done} 
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
                  {statusPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend
                  formatter={(value, entry) =>
                    `${value}: ${entry.payload.value} (${pct(entry.payload.value, total)}%)`
                  }
                  iconType="circle"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, marginTop: 8 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title="Priority breakdown" sub="Ticket volume by urgency level" />
            <div style={{ paddingTop: 8 }}>
              {priOrder
                .filter((p) => priMap[p])
                .map((p) => (
                  <HorizontalBar
                    key={p}
                    label={p}
                    value={priMap[p] || 0}
                    max={priMax}
                    color={priColors[p]}
                  />
                ))}
            </div>
          </Card>
        </div>

        {/* ── Director-level trends: Monthly volume & completion rate ── */}
        <div style={g2}>
          <Card>
            <CardHeader title="Monthly Ticket Volume" sub="Created vs Completed by month" />
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="month" tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: T.ink3, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="created" fill={T.open} name="Created" radius={[4,4,0,0]} />
                <Bar dataKey="completed" fill={T.done} name="Completed" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader title="Monthly Completion Rate" sub="% of tickets resolved in month of creation" />
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

        {/* ── Resolution trend & Aging analysis ── */}
        <div style={g2}>
          <Card>
            <CardHeader title="Resolution Time Trend" sub="Average days to close (monthly)" />
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
            <CardHeader title="Open Ticket Aging" sub="Age of unresolved tickets" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={agingData} dataKey="value" outerRadius={80} innerRadius={50} paddingAngle={2}>
                  {agingData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Creation trend + Due analysis ── */}
        <div style={g2}>
          <Card>
            <CardHeader title="Daily Activity (Last 30 days)" sub="Created vs Completed" />
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
            <CardHeader title="Due Date Overview" sub="Tickets by due urgency" />
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={dueAnalysisData} dataKey="value" outerRadius={80} innerRadius={50} paddingAngle={2} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                  {dueAnalysisData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Team efficiency matrix ── */}
        <Card style={{ marginBottom: 20 }}>
          <CardHeader
            title="Team efficiency matrix"
            sub="Completion rate and open load per assignee — top 10 by volume"
          />
          <div style={{ display: "flex", gap: 12, marginBottom: 12 }}>
            <span style={{ fontSize: 10, color: T.ink3 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 5,
                  background: T.open,
                  borderRadius: 3,
                  marginRight: 4,
                  verticalAlign: "middle",
                }}
              />
              Open load
            </span>
            <span style={{ fontSize: 10, color: T.ink3 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 10,
                  height: 5,
                  background: T.done,
                  borderRadius: 3,
                  marginRight: 4,
                  verticalAlign: "middle",
                }}
              />
              Completed
            </span>
          </div>
          {assigneePerf.map((a, i) => (
            <EfficiencyRow
              key={a.name}
              rank={i + 1}
              name={a.name}
              total={a.total}
              comp={a.comp}
              openCount={a.openCount}
              eff={a.eff}
              avatarColor={AVATAR_COLORS[i % AVATAR_COLORS.length]}
            />
          ))}
        </Card>

        {/* ── Division performance + Weekly trend (Admin/Manager only) ── */}
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
                  <Bar dataKey="Completed" stackId="a" fill={T.done} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="In Progress" stackId="a" fill={T.prog} />
                  <Bar dataKey="Open" stackId="a" fill={T.open} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <CardHeader title="Weekly activity pattern" sub="Open vs. completed by day of week" />
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

        {/* ── Insights + Director summary (Admin/Manager only) ── */}
        {isAdminOrManager && (
          <div style={g2}>
            <Card>
              <CardHeader title="AI Insights" sub="Automatically surfaced from your data" />
              {insights.map((ins, i) => (
                <InsightCard key={i} type={ins.type} label={ins.label} text={ins.text} />
              ))}
            </Card>

            <Card>
              <CardHeader title="Director Summary" sub="Key operational metrics at a glance" />
              <MetricRow label="Completion rate" value={`${completionRate}%`} color={T.done} />
              <MetricRow label="Avg resolution (days)" value={`${avgResolution} d`} color={T.prog} />
              <MetricRow label="SLA compliance" value={sla !== null ? `${sla}%` : "N/A"} color={sla !== null && sla >= 80 ? T.done : T.crit} />
              <MetricRow label="Active assignees" value={assigneePerf.length} color={T.prog} />
              <MetricRow label="Critical / High" value={critT.length} color={critT.length > 5 ? T.crit : T.ink} />
              <MetricRow label="Overdue tickets" value={overdueTickets.length} color={overdueTickets.length > 0 ? T.overdue : T.done} />
              <MetricRow label="Top performer" value={assigneePerf[0]?.name || "—"} color={T.violet} />
              <MetricRow label="Best division" value={divPerf[0]?.name || "—"} color={T.violet} />
              <MetricRow
                label="Avg team load"
                value={
                  assigneePerf.length > 0
                    ? `${Math.round(total / assigneePerf.length)} tickets`
                    : "—"
                }
                color={T.ink2}
              />
              {backlogForecastData && (
                <MetricRow label="Backlog forecast (next week)" value={backlogForecastData.nextWeek} color={backlogForecastData.trend > 0 ? T.crit : T.done} />
              )}
              <div style={{ paddingTop: 10 }}>
                <MetricRow label="Open rate" value={`${pct(openT.length, total)}%`} color={T.open} />
              </div>
            </Card>
          </div>
        )}
      </div>
    </MainLayout>
  );
}