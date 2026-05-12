import { useEffect, useState, useMemo } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN SYSTEM
// Palette: Warm Ivory base · Deep Slate primary · Sage green · Terracotta ·
//          Dusty Mauve · Amber gold
// Fonts:   "Instrument Serif" display · "Inter" body · "JetBrains Mono" data
// ─────────────────────────────────────────────────────────────────────────────

const T = {
  // Surfaces
  bg:         "#F7F5F0",   // warm ivory page
  surface:    "#FFFFFF",   // pure white cards
  surfaceAlt: "#F2EFE9",   // slightly warmer surface for inset areas
  glass:      "#FFFFFFCC", // semi-transparent

  // Primary — Deep Slate
  slate:      "#1E2A3A",
  slateLight: "#334155",
  slateMuted: "#64748B",

  // Semantic colours
  open:       "#C4622D",   // terracotta
  openBg:     "#FDF0E8",
  openBorder: "#E8A87C",

  progress:   "#2E6B8A",   // steel blue
  progressBg: "#E8F4F8",
  progressBorder: "#7BB8D0",

  done:       "#3A6B4A",   // forest green
  doneBg:     "#EAF3EC",
  doneBorder: "#85BF96",

  critical:   "#8B2E2E",   // deep crimson
  criticalBg: "#FBE9E9",

  // Accent colours for charts / variety
  mauve:      "#7B5E7B",
  amber:      "#B07D2E",
  sage:       "#4E7C5F",
  teal:       "#2A7B82",
  rose:       "#A0455A",
  indigo:     "#4754A0",

  // Text
  textPrimary:   "#1E2A3A",
  textSecondary: "#64748B",
  textTertiary:  "#94A3B8",
  textInverse:   "#F7F5F0",

  // Borders
  border:    "#E2DDD5",
  borderMed: "#C8C2B8",
  borderDark:"#9E9589",

  // Gradients (as string refs for inline use)
  gradSlate: "linear-gradient(135deg, #1E2A3A 0%, #2D3F54 100%)",
  gradGreen: "linear-gradient(135deg, #3A6B4A 0%, #4E8A63 100%)",
};

const CHART_PALETTE = [T.open, T.progress, T.done, T.mauve, T.amber, T.teal, T.rose, T.indigo];

// ─────────────────────────────────────────────────────────────────────────────
// FONT INJECTION
// ─────────────────────────────────────────────────────────────────────────────
const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────
const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = item[key] || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

const toChart = (obj) =>
  Object.entries(obj).map(([name, value]) => ({ name, value }));

const unique = (arr, key) =>
  [...new Set(arr.map((x) => x[key]).filter(Boolean))].sort();

const pct = (n, total) =>
  total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";

function buildWeeklyTrend(tickets) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const buckets = {};
  days.forEach((d) => { buckets[d] = { day: d, Open: 0, "In Progress": 0, Completed: 0 }; });
  tickets.forEach((t) => {
    const date = t.created_at ? new Date(t.created_at) : null;
    if (!date) return;
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
    if (buckets[dayName]) {
      const key = ["Open", "In Progress", "Completed"].includes(t.status) ? t.status : null;
      if (key) buckets[dayName][key]++;
    }
  });
  return days.map((d) => buckets[d]);
}

// ─────────────────────────────────────────────────────────────────────────────
// MODULAR PRIMITIVE COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/** Recharts tooltip with new design language */
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 10,
      padding: "10px 14px",
      boxShadow: "0 4px 24px rgba(30,42,58,0.12)",
      fontFamily: "'Inter', sans-serif",
    }}>
      {label && (
        <p style={{ fontSize: 11, color: T.textTertiary, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, letterSpacing: "0.06em" }}>
          {label}
        </p>
      )}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
          <span style={{ fontSize: 12, color: T.textSecondary }}>{p.name}:</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary, fontFamily: "'JetBrains Mono', monospace" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
};

/** Base card — every chart/section lives in one */
function Card({ children, style, noPad }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: 16,
      padding: noPad ? 0 : "22px 24px",
      overflow: "hidden",
      ...style,
    }}>
      {children}
    </div>
  );
}

/** Card header with eyebrow label + title */
function CardHeader({ eyebrow, title, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
      <div>
        {eyebrow && (
          <p style={{
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            color: T.textTertiary, letterSpacing: "0.12em",
            textTransform: "uppercase", marginBottom: 4,
          }}>
            {eyebrow}
          </p>
        )}
        <p style={{ fontSize: 14, fontWeight: 600, color: T.textPrimary, fontFamily: "'Inter', sans-serif", margin: 0 }}>
          {title}
        </p>
      </div>
      {right}
    </div>
  );
}

/** Recharts axis tick style helper */
const axisTick = { fill: T.textTertiary, fontSize: 10, fontFamily: "'JetBrains Mono', monospace" };
const axisLine = { axisLine: false, tickLine: false };

/** Section divider with label */
function SectionLabel({ icon, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <div style={{ width: 3, height: 18, borderRadius: 2, background: T.slateLight }} />
      <span style={{
        fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
        color: T.slateLight, letterSpacing: "0.14em", textTransform: "uppercase",
      }}>
        {label}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// KPI STAT CARD
// ─────────────────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, dot, accentColor, accentBg, accentBorder }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? accentBg : T.surface,
        border: `1px solid ${hov ? accentBorder : T.border}`,
        borderRadius: 14,
        padding: "20px 22px",
        transition: "all 0.18s ease",
        cursor: "default",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* top accent strip */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0,
        height: 3, background: accentColor, borderRadius: "14px 14px 0 0",
        opacity: hov ? 1 : 0.35, transition: "opacity 0.18s",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{
            fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
            color: T.textTertiary, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10,
          }}>
            {label}
          </p>
          <p style={{
            fontSize: 36, fontFamily: "'Instrument Serif', serif",
            color: T.textPrimary, lineHeight: 1, margin: "0 0 6px",
            fontStyle: hov ? "italic" : "normal", transition: "font-style 0.18s",
          }}>
            {value}
          </p>
          {sub && (
            <p style={{ fontSize: 11, color: T.textTertiary, fontFamily: "'JetBrains Mono', monospace" }}>
              {sub}
            </p>
          )}
        </div>
        {dot && (
          <div style={{
            width: 10, height: 10, borderRadius: "50%",
            background: accentColor, opacity: hov ? 1 : 0.5,
            transition: "opacity 0.18s", marginTop: 4,
          }} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILTER COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

const selectBase = {
  background: T.surfaceAlt,
  border: `1px solid ${T.border}`,
  borderRadius: 8,
  color: T.textPrimary,
  fontFamily: "'JetBrains Mono', monospace",
  fontSize: 12,
  padding: "7px 28px 7px 10px",
  cursor: "pointer",
  outline: "none",
  appearance: "none",
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='11' height='11' fill='%2394A3B8' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`,
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 9px center",
  transition: "border-color 0.14s, background 0.14s",
};

function FilterSelect({ label, value, options, onChange, minWidth = 128 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        fontSize: 10, color: T.textTertiary,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...selectBase, minWidth, color: value !== "all" ? T.textPrimary : T.textTertiary }}
        onFocus={(e)  => { e.target.style.borderColor = T.slateLight; e.target.style.background = T.surface; }}
        onBlur={(e)   => { e.target.style.borderColor = T.border;     e.target.style.background = T.surfaceAlt; }}
      >
        <option value="all">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function DateSelect({ value, onChange }) {
  const opts = [
    { v: "all",   l: "All time"    },
    { v: "today", l: "Today"       },
    { v: "7d",    l: "Last 7 days" },
    { v: "30d",   l: "Last 30 days"},
    { v: "90d",   l: "Last 90 days"},
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{
        fontSize: 10, color: T.textTertiary,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        Period
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...selectBase, minWidth: 140, color: value !== "all" ? T.textPrimary : T.textTertiary }}
        onFocus={(e)  => { e.target.style.borderColor = T.slateLight; e.target.style.background = T.surface; }}
        onBlur={(e)   => { e.target.style.borderColor = T.border;     e.target.style.background = T.surfaceAlt; }}
      >
        {opts.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}

/** Chip tag for active filters */
function FilterChip({ label, onRemove }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 5,
        background: hov ? T.slateLight : T.slate,
        color: T.textInverse,
        borderRadius: 20, padding: "3px 10px 3px 11px",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
        transition: "background 0.14s", cursor: "default",
      }}
    >
      {label}
      <button
        onClick={onRemove}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "rgba(247,245,240,0.6)", fontSize: 15, lineHeight: 1, padding: 0,
          transition: "color 0.14s",
        }}
        onMouseOver={(e)  => (e.target.style.color = T.textInverse)}
        onMouseOut={(e)   => (e.target.style.color = "rgba(247,245,240,0.6)")}
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY ROW for Director view
// ─────────────────────────────────────────────────────────────────────────────
function MetricRow({ label, value, color }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: "10px 0", borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontSize: 12, color: T.textSecondary, fontFamily: "'Inter', sans-serif" }}>{label}</span>
      <span style={{ fontSize: 14, fontFamily: "'Instrument Serif', serif", color: color || T.textPrimary }}>{value}</span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [allTickets, setAllTickets] = useState([]);
  const [loaded, setLoaded]         = useState(false);

  const [fStatus,   setFStatus]   = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [fCategory, setFCategory] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fDate,     setFDate]     = useState("all");

  const isAdmin          = user?.role === "Admin";
  const isManager        = user?.role === "Manager";
  const isAdminOrManager = isAdmin || isManager;

  // Font + data init
  useEffect(() => {
    const link = document.createElement("link");
    link.rel   = "stylesheet";
    link.href  = FONT_URL;
    document.head.appendChild(link);
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");
      let data  = res.data;
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

  // Filter option lists
  const statusOpts   = useMemo(() => unique(allTickets, "status"),           [allTickets]);
  const priorityOpts = useMemo(() => unique(allTickets, "priority"),         [allTickets]);
  const categoryOpts = useMemo(() => unique(allTickets, "category"),         [allTickets]);
  const assigneeOpts = useMemo(() => unique(allTickets, "assigned_to_name"), [allTickets]);

  const dateCutoff = useMemo(() => {
    if (fDate === "all") return null;
    const now = new Date();
    if (fDate === "today") { const d = new Date(now); d.setHours(0,0,0,0); return d; }
    const days = fDate === "7d" ? 7 : fDate === "30d" ? 30 : 90;
    return new Date(now.getTime() - days * 86400000);
  }, [fDate]);

  const tickets = useMemo(() => allTickets.filter((t) => {
    if (fStatus   !== "all" && t.status           !== fStatus)   return false;
    if (fPriority !== "all" && t.priority         !== fPriority) return false;
    if (fCategory !== "all" && t.category         !== fCategory) return false;
    if (fAssignee !== "all" && t.assigned_to_name !== fAssignee) return false;
    if (dateCutoff && t.created_at && new Date(t.created_at) < dateCutoff) return false;
    return true;
  }), [allTickets, fStatus, fPriority, fCategory, fAssignee, dateCutoff]);

  const activeFilters = [
    fStatus   !== "all" && { key: "s", label: fStatus,   clear: () => setFStatus("all")   },
    fPriority !== "all" && { key: "p", label: fPriority, clear: () => setFPriority("all") },
    fCategory !== "all" && { key: "c", label: fCategory, clear: () => setFCategory("all") },
    fAssignee !== "all" && { key: "a", label: fAssignee, clear: () => setFAssignee("all") },
    fDate     !== "all" && { key: "d", label: fDate,     clear: () => setFDate("all")     },
  ].filter(Boolean);

  const resetAll = () => {
    setFStatus("all"); setFPriority("all"); setFCategory("all");
    setFAssignee("all"); setFDate("all");
  };

  // Derived metrics
  const openT      = tickets.filter((t) => t.status === "Open");
  const progressT  = tickets.filter((t) => t.status === "In Progress");
  const completedT = tickets.filter((t) => t.status === "Completed");
  const criticalT  = tickets.filter((t) => t.priority === "Critical" || t.priority === "High");
  const completionRate = tickets.length > 0
    ? Math.round((completedT.length / tickets.length) * 100) : 0;

  // Chart datasets
  const statusData   = [
    { name: "Open",        value: openT.length      },
    { name: "In Progress", value: progressT.length  },
    { name: "Completed",   value: completedT.length },
  ];
  const priorityData = toChart(groupBy(tickets, "priority"));
  const categoryData = toChart(groupBy(tickets, "category"));
  const weeklyTrend  = buildWeeklyTrend(tickets);
  const assigneeData = toChart(groupBy(tickets, "assigned_to_name"))
    .sort((a, b) => b.value - a.value).slice(0, 10);

  const radarData = [
    { subject: "Completed",   A: completedT.length },
    { subject: "In Progress", A: progressT.length  },
    { subject: "Open",        A: openT.length      },
    { subject: "Critical",    A: criticalT.length  },
    { subject: "Total",       A: tickets.length    },
  ];

  // ── Layout grid helpers ──
  const g4 = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 20 };
  const g2 = { display: "grid", gridTemplateColumns: "1fr 1fr",        gap: 14, marginBottom: 20 };
  const g3 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr",    gap: 14, marginBottom: 20 };

  // ── Loading state ──
  if (!loaded) {
    return (
      <MainLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400 }}>
          <p style={{
            color: T.textTertiary, fontFamily: "'JetBrains Mono', monospace",
            fontSize: 13, letterSpacing: "0.08em",
          }}>
            loading analytics...
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      {/* Root wrapper — warm ivory bg */}
      <div style={{ fontFamily: "'Inter', sans-serif", color: T.textPrimary }}>

        {/* ── PAGE HEADER ─────────────────────────────────────────────── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          marginBottom: 24, paddingBottom: 20, borderBottom: `1px solid ${T.border}`,
        }}>
          <div>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 10,
              color: T.textTertiary, letterSpacing: "0.14em",
              textTransform: "uppercase", marginBottom: 6,
            }}>
              {user?.role} · {user?.name}
            </p>
            {/* Instrument Serif display heading */}
            <h1 style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 40, fontWeight: 400, fontStyle: "italic",
              color: T.textPrimary, margin: "0 0 4px",
              letterSpacing: "-0.01em", lineHeight: 1.1,
            }}>
              Analytics
            </h1>
            <p style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              color: T.textTertiary, letterSpacing: "0.05em",
            }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          {/* Completion rate badge */}
          <div style={{
            background: T.gradGreen,
            background: T.slate,
            borderRadius: 14, padding: "14px 24px", textAlign: "center",
            border: `1px solid ${T.slateLight}`,
          }}>
            <p style={{
              fontSize: 10, color: "rgba(247,245,240,0.55)",
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 4,
            }}>
              completion
            </p>
            <p style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 34, fontStyle: "italic", color: T.textInverse,
              margin: 0, lineHeight: 1,
            }}>
              {completionRate}%
            </p>
          </div>
        </div>

        {/* ── FILTER BAR ──────────────────────────────────────────────── */}
        <Card style={{ marginBottom: 20, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
          <div style={{
            display: "flex", alignItems: "flex-end",
            justifyContent: "space-between", flexWrap: "wrap", gap: 16,
            marginBottom: activeFilters.length > 0 ? 14 : 0,
          }}>
            {/* Selects row */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
              <FilterSelect label="Status"   value={fStatus}   options={statusOpts}   onChange={setFStatus}   />
              <FilterSelect label="Priority" value={fPriority} options={priorityOpts} onChange={setFPriority} />
              <FilterSelect label="Category" value={fCategory} options={categoryOpts} onChange={setFCategory} />
              {isAdminOrManager && (
                <FilterSelect label="Assignee" value={fAssignee} options={assigneeOpts} onChange={setFAssignee} minWidth={160} />
              )}
              <DateSelect value={fDate} onChange={setFDate} />
            </div>

            {/* Ticket count + clear */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                color: T.textTertiary,
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: 20, padding: "4px 12px",
              }}>
                {tickets.length} / {allTickets.length}
              </span>
              {activeFilters.length > 0 && (
                <button
                  onClick={resetAll}
                  style={{
                    background: "none", border: `1px solid ${T.borderMed}`,
                    borderRadius: 8, color: T.textSecondary,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                    padding: "5px 11px", cursor: "pointer", transition: "all 0.14s",
                  }}
                  onMouseOver={(e) => { e.target.style.borderColor = T.open; e.target.style.color = T.open; }}
                  onMouseOut={(e)  => { e.target.style.borderColor = T.borderMed; e.target.style.color = T.textSecondary; }}
                >
                  ✕ clear all
                </button>
              )}
            </div>
          </div>

          {/* Active chips */}
          {activeFilters.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeFilters.map((f) => (
                <FilterChip key={f.key} label={f.label} onRemove={f.clear} />
              ))}
            </div>
          )}
        </Card>

        {/* ── KPI CARDS ───────────────────────────────────────────────── */}
        <div style={g4}>
          <StatCard
            label="Total"
            value={tickets.length}
            sub={`${allTickets.length} unfiltered`}
            dot accentColor={T.slateLight} accentBg="#EFF2F6" accentBorder="#C8D0DC"
          />
          <StatCard
            label="Open"
            value={openT.length}
            sub={pct(openT.length, tickets.length)}
            dot accentColor={T.open} accentBg={T.openBg} accentBorder={T.openBorder}
          />
          <StatCard
            label="In Progress"
            value={progressT.length}
            sub={pct(progressT.length, tickets.length)}
            dot accentColor={T.progress} accentBg={T.progressBg} accentBorder={T.progressBorder}
          />
          <StatCard
            label="Completed"
            value={completedT.length}
            sub={pct(completedT.length, tickets.length)}
            dot accentColor={T.done} accentBg={T.doneBg} accentBorder={T.doneBorder}
          />
        </div>

        {/* ── STATUS DONUT + WEEKLY AREA ───────────────────────────────── */}
        <div style={g2}>
          <Card>
            <CardHeader eyebrow="distribution" title="Status breakdown" />
            <ResponsiveContainer width="100%" height={230}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={58} outerRadius={96}
                  dataKey="value" paddingAngle={3} stroke="none">
                  <Cell fill={T.open}     />
                  <Cell fill={T.progress} />
                  <Cell fill={T.done}     />
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={7}
                  formatter={(v) => (
                    <span style={{ fontSize: 11, color: T.textSecondary, fontFamily: "'Inter', sans-serif" }}>{v}</span>
                  )} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader eyebrow="volume" title="Volume by day of week" />
            <ResponsiveContainer width="100%" height={230}>
              <AreaChart data={weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  {[[T.open, "ao"], [T.progress, "ap"], [T.done, "ac"]].map(([color, id]) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.22} />
                      <stop offset="95%" stopColor={color} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={T.border} />
                <XAxis dataKey="day" tick={axisTick} {...axisLine} />
                <YAxis tick={axisTick} {...axisLine} />
                <Tooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="Open"        stroke={T.open}     fill="url(#ao)" strokeWidth={1.8} />
                <Area type="monotone" dataKey="In Progress" stroke={T.progress} fill="url(#ap)" strokeWidth={1.8} />
                <Area type="monotone" dataKey="Completed"   stroke={T.done}     fill="url(#ac)" strokeWidth={1.8} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── PRIORITY + CATEGORY + RADAR ─────────────────────────────── */}
        <div style={g3}>
          <Card>
            <CardHeader eyebrow="urgency" title="Priority breakdown" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={priorityData} barCategoryGap="32%" margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                <XAxis dataKey="name" tick={axisTick} {...axisLine} />
                <YAxis tick={axisTick} {...axisLine} />
                <Tooltip content={<ChartTooltip />} />
                <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                  {priorityData.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader eyebrow="type" title="Category split" />
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={75}
                  dataKey="value" stroke="none" paddingAngle={2}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={7}
                  formatter={(v) => (
                    <span style={{ fontSize: 10, color: T.textSecondary, fontFamily: "'Inter', sans-serif" }}>{v}</span>
                  )} />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader eyebrow="profile" title={isAdminOrManager ? "Team snapshot" : "Your activity"} />
            <ResponsiveContainer width="100%" height={200}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={T.border} />
                <PolarAngleAxis dataKey="subject" tick={{ ...axisTick, fontSize: 9 }} />
                <Radar dataKey="A" stroke={T.slateLight} fill={T.slateLight} fillOpacity={0.15} strokeWidth={1.8} />
                <Tooltip content={<ChartTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── ADMIN / MANAGER SECTION ──────────────────────────────────── */}
        {isAdminOrManager && (
          <>
            <div style={{ marginTop: 8, marginBottom: 16, paddingTop: 20, borderTop: `1px solid ${T.border}` }}>
              <SectionLabel label={`${isAdmin ? "Admin" : "Manager"} intelligence — team-wide`} />
            </div>

            {/* Full-width: Team workload */}
            <Card style={{ marginBottom: 14 }}>
              <CardHeader eyebrow="workload" title="Tickets per assignee" />
              <ResponsiveContainer width="100%" height={Math.max(180, assigneeData.length * 36)}>
                <BarChart data={assigneeData} layout="vertical" barCategoryGap="28%" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.border} horizontal={false} />
                  <XAxis type="number" tick={axisTick} {...axisLine} />
                  <YAxis type="category" dataKey="name" tick={{ ...axisTick, fontSize: 11 }} {...axisLine} width={120} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="value" name="Tickets" radius={[0, 5, 5, 0]}>
                    {assigneeData.map((_, i) => (
                      <Cell key={i} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* 2-col: Resolution line + Director summary */}
            <div style={g2}>
              <Card>
                <CardHeader eyebrow="velocity" title="Resolution trend" />
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={weeklyTrend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.border} />
                    <XAxis dataKey="day" tick={axisTick} {...axisLine} />
                    <YAxis tick={axisTick} {...axisLine} />
                    <Tooltip content={<ChartTooltip />} />
                    <Line type="monotone" dataKey="Completed" stroke={T.done}     strokeWidth={2} dot={{ fill: T.done,     r: 3, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="Open"      stroke={T.open}     strokeWidth={2} dot={{ fill: T.open,     r: 3, strokeWidth: 0 }} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card>
                <CardHeader eyebrow="executive" title="Director summary" />
                <MetricRow label="Completion rate"    value={`${completionRate}%`}                                                                          color={T.done}     />
                <MetricRow label="Critical / High"    value={criticalT.length}                                                                              color={T.critical} />
                <MetricRow label="Avg load per agent" value={assigneeData.length > 0 ? (tickets.length / assigneeData.length).toFixed(1) : "—"}             color={T.progress} />
                <MetricRow label="Active assignees"   value={assigneeData.length}                                                                           color={T.slateLight} />
                <MetricRow label="Top assignee"       value={assigneeData[0]?.name ?? "—"}                                                                  color={T.open}     />
                <MetricRow label="Unresolved"         value={openT.length + progressT.length}                                                               color={T.textSecondary} />
              </Card>
            </div>
          </>
        )}

      </div>
    </MainLayout>
  );
}