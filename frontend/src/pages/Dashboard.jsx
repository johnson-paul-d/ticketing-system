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

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  open:      "#F97316",
  progress:  "#3B82F6",
  completed: "#10B981",
  critical:  "#EF4444",
  accent:    "#8B5CF6",
  surface:   "#0D1117",
  card:      "#161B22",
  cardHover: "#1C2430",
  border:    "#30363D",
  text:      "#E6EDF3",
  subtext:   "#8B949E",
  input:     "#21262D",
  tag:       "#388BFD1A",
  tagBorder: "#388BFD66",
};
const PIE_PALETTE = [C.open, C.progress, C.completed, C.critical, C.accent, "#EC4899", "#14B8A6"];

// ─── Utility ──────────────────────────────────────────────────────────────────
const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = item[key] || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

const toChart = (obj) => Object.entries(obj).map(([name, value]) => ({ name, value }));

const unique = (arr, key) =>
  [...new Set(arr.map((x) => x[key]).filter(Boolean))].sort();

// Build day-of-week trend from real created_at dates
function buildWeeklyTrend(tickets) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const buckets = {};
  days.forEach((d) => {
    buckets[d] = { day: d, Open: 0, "In Progress": 0, Completed: 0 };
  });
  tickets.forEach((t) => {
    const date = t.created_at ? new Date(t.created_at) : null;
    if (!date) return;
    const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
    if (buckets[dayName] && t.status) {
      const key = ["Open", "In Progress", "Completed"].includes(t.status) ? t.status : null;
      if (key) buckets[dayName][key]++;
    }
  });
  return days.map((d) => buckets[d]);
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0D1117", border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "10px 16px", fontSize: 13, color: C.text,
      boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    }}>
      {label && (
        <p style={{ color: C.subtext, marginBottom: 4, fontFamily: "monospace", fontSize: 11 }}>
          {label}
        </p>
      )}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || C.text, margin: "2px 0" }}>
          <span style={{ opacity: 0.65 }}>{p.name}: </span>
          <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, accent, icon, sub }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? C.cardHover : C.card,
        border: `1px solid ${hov ? accent + "66" : C.border}`,
        borderRadius: 16, padding: "22px 26px",
        position: "relative", overflow: "hidden",
        transition: "all 0.2s", cursor: "default",
        transform: hov ? "translateY(-2px)" : "none",
        boxShadow: hov ? `0 8px 32px ${accent}22` : "none",
      }}
    >
      <div style={{
        position: "absolute", top: -24, right: -24, width: 90, height: 90,
        borderRadius: "50%", background: accent, opacity: 0.1, filter: "blur(24px)",
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{
            color: C.subtext, fontSize: 11, fontFamily: "'DM Mono', monospace",
            letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10,
          }}>
            {label}
          </p>
          <h2 style={{
            color: C.text, fontSize: 38, fontWeight: 800,
            fontFamily: "'Syne', sans-serif", lineHeight: 1, margin: 0,
          }}>
            {value}
          </h2>
          {sub && (
            <p style={{ color: C.subtext, fontSize: 11, marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
              {sub}
            </p>
          )}
        </div>
        <span style={{ fontSize: 26, opacity: 0.4 }}>{icon}</span>
      </div>
    </div>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, fullWidth }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`,
      borderRadius: 16, padding: "22px 26px",
      gridColumn: fullWidth ? "1 / -1" : undefined,
    }}>
      <p style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 700,
        fontSize: 15, color: C.text, margin: 0,
      }}>
        {title}
      </p>
      {subtitle ? (
        <p style={{
          fontSize: 11, color: C.subtext,
          fontFamily: "'DM Mono', monospace", margin: "4px 0 18px",
        }}>
          {subtitle}
        </p>
      ) : (
        <div style={{ height: 18 }} />
      )}
      {children}
    </div>
  );
}

// ─── Filter Select ────────────────────────────────────────────────────────────
const chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='%238B949E' viewBox='0 0 16 16'%3E%3Cpath d='M7.247 11.14L2.451 5.658C1.885 5.013 2.345 4 3.204 4h9.592a1 1 0 0 1 .753 1.659l-4.796 5.48a1 1 0 0 1-1.506 0z'/%3E%3C/svg%3E")`;

const selectStyle = {
  background: C.input, border: `1px solid ${C.border}`, borderRadius: 8,
  color: C.text, fontFamily: "'DM Mono', monospace", fontSize: 12,
  padding: "7px 28px 7px 10px", cursor: "pointer", outline: "none",
  appearance: "none", backgroundImage: chevron,
  backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
  transition: "border-color 0.15s",
};

function FilterSelect({ label, icon, value, options, onChange, minWidth = 130 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 10, color: C.subtext, fontFamily: "'DM Mono', monospace",
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        {icon} {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...selectStyle, minWidth, color: value !== "all" ? C.text : C.subtext }}
        onFocus={(e) => (e.target.style.borderColor = C.accent)}
        onBlur={(e)  => (e.target.style.borderColor = C.border)}
      >
        <option value="all">All {label}s</option>
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

function DateRangeSelect({ value, onChange }) {
  const opts = [
    { label: "All Time",     value: "all"  },
    { label: "Today",        value: "today"},
    { label: "Last 7 Days",  value: "7d"   },
    { label: "Last 30 Days", value: "30d"  },
    { label: "Last 90 Days", value: "90d"  },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <label style={{
        fontSize: 10, color: C.subtext, fontFamily: "'DM Mono', monospace",
        letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        📅 Date Range
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ ...selectStyle, minWidth: 140, color: value !== "all" ? C.text : C.subtext }}
        onFocus={(e) => (e.target.style.borderColor = C.accent)}
        onBlur={(e)  => (e.target.style.borderColor = C.border)}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ─── Active Filter Tag ────────────────────────────────────────────────────────
function FilterTag({ label, onRemove }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      background: C.tag, border: `1px solid ${C.tagBorder}`,
      borderRadius: 20, padding: "3px 10px 3px 12px",
      fontFamily: "'DM Mono', monospace", fontSize: 11, color: "#388BFD",
    }}>
      {label}
      <button
        onClick={onRemove}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#388BFD", fontSize: 14, lineHeight: 1, padding: 0, opacity: 0.7,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [allTickets, setAllTickets] = useState([]);
  const [loaded, setLoaded]         = useState(false);

  // Filter state
  const [fStatus,   setFStatus]   = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [fCategory, setFCategory] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fDate,     setFDate]     = useState("all");

  const isAdmin          = user?.role === "Admin";
  const isManager        = user?.role === "Manager";
  const isAdminOrManager = isAdmin || isManager;

  // ── Font injection + fetch ──
  useEffect(() => {
    const link = document.createElement("link");
    link.rel   = "stylesheet";
    link.href  = "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500&display=swap";
    document.head.appendChild(link);
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res  = await api.get("/tickets");
      let data   = res.data;
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

  // ── Options derived from real data ──
  const statusOptions   = useMemo(() => unique(allTickets, "status"),           [allTickets]);
  const priorityOptions = useMemo(() => unique(allTickets, "priority"),         [allTickets]);
  const categoryOptions = useMemo(() => unique(allTickets, "category"),         [allTickets]);
  const assigneeOptions = useMemo(() => unique(allTickets, "assigned_to_name"), [allTickets]);

  // ── Date cutoff ──
  const dateCutoff = useMemo(() => {
    if (fDate === "all") return null;
    const now = new Date();
    if (fDate === "today") {
      const d = new Date(now); d.setHours(0, 0, 0, 0); return d;
    }
    const days = fDate === "7d" ? 7 : fDate === "30d" ? 30 : 90;
    return new Date(now.getTime() - days * 86400000);
  }, [fDate]);

  // ── Apply all filters ──
  const tickets = useMemo(() => {
    return allTickets.filter((t) => {
      if (fStatus   !== "all" && t.status           !== fStatus)   return false;
      if (fPriority !== "all" && t.priority         !== fPriority) return false;
      if (fCategory !== "all" && t.category         !== fCategory) return false;
      if (fAssignee !== "all" && t.assigned_to_name !== fAssignee) return false;
      if (dateCutoff && t.created_at && new Date(t.created_at) < dateCutoff) return false;
      return true;
    });
  }, [allTickets, fStatus, fPriority, fCategory, fAssignee, dateCutoff]);

  // ── Active filter descriptors ──
  const activeFilters = [
    fStatus   !== "all" && { key: "status",   label: `Status: ${fStatus}`,     clear: () => setFStatus("all")   },
    fPriority !== "all" && { key: "priority", label: `Priority: ${fPriority}`, clear: () => setFPriority("all") },
    fCategory !== "all" && { key: "category", label: `Category: ${fCategory}`, clear: () => setFCategory("all") },
    fAssignee !== "all" && { key: "assignee", label: `Assignee: ${fAssignee}`, clear: () => setFAssignee("all") },
    fDate     !== "all" && { key: "date",     label: `Date: ${fDate}`,         clear: () => setFDate("all")     },
  ].filter(Boolean);

  const resetAll = () => {
    setFStatus("all"); setFPriority("all"); setFCategory("all");
    setFAssignee("all"); setFDate("all");
  };

  // ── Derived metrics (all computed from filtered set) ──
  const openT      = tickets.filter((t) => t.status === "Open");
  const progressT  = tickets.filter((t) => t.status === "In Progress");
  const completedT = tickets.filter((t) => t.status === "Completed");
  const criticalT  = tickets.filter((t) => t.priority === "Critical" || t.priority === "High");
  const completionRate = tickets.length > 0
    ? Math.round((completedT.length / tickets.length) * 100) : 0;

  const pct = (n) => tickets.length > 0 ? `${Math.round((n / tickets.length) * 100)}% of filtered` : "—";

  // ── Chart data ──
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

  // ── Layout helpers ──
  const grid4 = { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 18, marginBottom: 24 };
  const grid2 = { display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 18, marginBottom: 24 };
  const grid3 = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 18, marginBottom: 24 };

  if (!loaded) {
    return (
      <MainLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400 }}>
          <p style={{ color: C.subtext, fontFamily: "'DM Mono', monospace", fontSize: 13, letterSpacing: "0.1em" }}>
            LOADING ANALYTICS...
          </p>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div style={{ fontFamily: "'DM Sans', sans-serif", color: C.text }}>

        {/* ── Header ── */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          marginBottom: 28, borderBottom: `1px solid ${C.border}`, paddingBottom: 22,
        }}>
          <div>
            <p style={{
              fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.accent,
              letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6,
            }}>
              {user?.role} · {user?.name}
            </p>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 34,
              color: C.text, margin: 0, letterSpacing: "-0.02em",
            }}>
              Analytics Dashboard
            </h1>
            <p style={{ color: C.subtext, fontSize: 12, marginTop: 5, fontFamily: "'DM Mono', monospace" }}>
              {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>
          <div style={{
            background: "linear-gradient(135deg, #10B981, #059669)",
            borderRadius: 14, padding: "13px 22px", textAlign: "center",
          }}>
            <p style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Completion Rate
            </p>
            <p style={{ fontSize: 30, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "#fff", margin: "2px 0 0" }}>
              {completionRate}%
            </p>
          </div>
        </div>

        {/* ── Filter Bar ── */}
        <div style={{
          background: C.card, border: `1px solid ${C.border}`,
          borderRadius: 14, padding: "18px 22px", marginBottom: 22,
        }}>
          <div style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            flexWrap: "wrap", gap: 16,
            marginBottom: activeFilters.length > 0 ? 14 : 0,
          }}>
            {/* Selects */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
              <FilterSelect label="Status"   icon="🔵" value={fStatus}   options={statusOptions}   onChange={setFStatus}   />
              <FilterSelect label="Priority" icon="🔴" value={fPriority} options={priorityOptions} onChange={setFPriority} />
              <FilterSelect label="Category" icon="🏷️" value={fCategory} options={categoryOptions} onChange={setFCategory} />
              {isAdminOrManager && (
                <FilterSelect
                  label="Assignee" icon="👤"
                  value={fAssignee} options={assigneeOptions}
                  onChange={setFAssignee} minWidth={160}
                />
              )}
              <DateRangeSelect value={fDate} onChange={setFDate} />
            </div>

            {/* Count + reset */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.subtext,
                background: C.input, borderRadius: 20, padding: "5px 13px",
                border: `1px solid ${C.border}`,
              }}>
                {tickets.length} / {allTickets.length} tickets
              </span>
              {activeFilters.length > 0 && (
                <button
                  onClick={resetAll}
                  style={{
                    background: "none", border: `1px solid ${C.border}`, borderRadius: 8,
                    color: C.subtext, fontFamily: "'DM Mono', monospace", fontSize: 11,
                    padding: "5px 12px", cursor: "pointer", transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.target.style.borderColor = C.critical; e.target.style.color = C.critical; }}
                  onMouseLeave={(e) => { e.target.style.borderColor = C.border;   e.target.style.color = C.subtext;  }}
                >
                  ✕ Clear All
                </button>
              )}
            </div>
          </div>

          {/* Active filter tags */}
          {activeFilters.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {activeFilters.map((f) => (
                <FilterTag key={f.key} label={f.label} onRemove={f.clear} />
              ))}
            </div>
          )}
        </div>

        {/* ── KPI Cards ── */}
        <div style={grid4}>
          <StatCard label="Total Tickets" value={tickets.length}       accent={C.accent}    icon="🎫" sub={`${allTickets.length} unfiltered`} />
          <StatCard label="Open"          value={openT.length}         accent={C.open}      icon="📬" sub={pct(openT.length)} />
          <StatCard label="In Progress"   value={progressT.length}     accent={C.progress}  icon="⚡" sub={pct(progressT.length)} />
          <StatCard label="Completed"     value={completedT.length}    accent={C.completed} icon="✅" sub={pct(completedT.length)} />
        </div>

        {/* ── Status pie + Weekly trend ── */}
        <div style={grid2}>
          <ChartCard title="Status Distribution" subtitle="Filtered ticket breakdown by state">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="value" paddingAngle={4} stroke="none">
                  {[C.open, C.progress, C.completed].map((color, i) => (
                    <Cell key={i} fill={color} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8}
                  formatter={(v) => (
                    <span style={{ color: C.subtext, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>{v}</span>
                  )} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Volume by Day of Week" subtitle="Tickets grouped by created_at day">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={weeklyTrend}>
                <defs>
                  {[["gO", C.open], ["gP", C.progress], ["gC", C.completed]].map(([id, color]) => (
                    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor={color} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={color} stopOpacity={0}    />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                <XAxis dataKey="day" tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Open"        stroke={C.open}      fill="url(#gO)" strokeWidth={2} />
                <Area type="monotone" dataKey="In Progress" stroke={C.progress}  fill="url(#gP)" strokeWidth={2} />
                <Area type="monotone" dataKey="Completed"   stroke={C.completed} fill="url(#gC)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Priority + Category + Radar ── */}
        <div style={grid3}>
          <ChartCard title="Priority Breakdown" subtitle="Tickets by urgency level">
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={priorityData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {priorityData.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Category Split" subtitle="Tickets by category type">
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={78}
                  dataKey="value" stroke="none" paddingAngle={2}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={7}
                  formatter={(v) => (
                    <span style={{ color: C.subtext, fontSize: 10, fontFamily: "'DM Mono', monospace" }}>{v}</span>
                  )} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Performance Radar"
            subtitle={isAdminOrManager ? "Team snapshot" : "Your activity profile"}
          >
            <ResponsiveContainer width="100%" height={210}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={C.border} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} />
                <Radar dataKey="A" stroke={C.accent} fill={C.accent} fillOpacity={0.22} strokeWidth={2} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Admin / Manager section ── */}
        {isAdminOrManager && (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 12,
              borderTop: `1px solid ${C.border}`, paddingTop: 26, marginBottom: 18,
            }}>
              <div style={{
                width: 4, height: 20, borderRadius: 2,
                background: "linear-gradient(180deg, #8B5CF6, #3B82F6)",
              }} />
              <p style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11, color: C.accent,
                letterSpacing: "0.15em", textTransform: "uppercase", margin: 0,
              }}>
                {isAdmin ? "Admin" : "Manager"} Intelligence — Team-wide Visibility
              </p>
            </div>

            {/* Team Workload (full width) */}
            <div style={{ marginBottom: 24 }}>
              <ChartCard
                title="Team Workload Distribution"
                subtitle="Ticket count per assignee — spot bottlenecks instantly"
                fullWidth
              >
                <ResponsiveContainer width="100%" height={Math.max(200, assigneeData.length * 38)}>
                  <BarChart data={assigneeData} layout="vertical" barCategoryGap="28%">
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                    <XAxis type="number" tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: C.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={130} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Tickets" radius={[0, 6, 6, 0]}>
                      {assigneeData.map((_, i) => (
                        <Cell key={i} fill={`hsl(${200 + i * 22}, 70%, 56%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Resolution velocity + Director summary */}
            <div style={grid2}>
              <ChartCard title="Resolution Velocity" subtitle="Completed vs. Open by day of week">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="day" tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: C.subtext, fontSize: 10, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="Completed" stroke={C.completed} strokeWidth={2.5} dot={{ fill: C.completed, r: 4 }} />
                    <Line type="monotone" dataKey="Open"      stroke={C.open}      strokeWidth={2.5} dot={{ fill: C.open, r: 4 }} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Director Summary" subtitle="Operational metrics for current filter">
                <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 4 }}>
                  {[
                    { label: "Completion Rate",  value: `${completionRate}%`,                                                                   color: C.completed },
                    { label: "Critical / High",  value: criticalT.length,                                                                       color: C.critical  },
                    { label: "Avg Load / Agent", value: assigneeData.length > 0 ? (tickets.length / assigneeData.length).toFixed(1) : "—",      color: C.progress  },
                    { label: "Active Assignees", value: assigneeData.length,                                                                     color: C.accent    },
                    { label: "Top Assignee",     value: assigneeData[0]?.name ?? "—",                                                            color: C.open      },
                    { label: "Unresolved",       value: openT.length + progressT.length,                                                         color: C.subtext   },
                  ].map(({ label, value, color }, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderBottom: `1px solid ${C.border}`, paddingBottom: 10,
                    }}>
                      <span style={{ fontSize: 12, color: C.subtext, fontFamily: "'DM Mono', monospace" }}>{label}</span>
                      <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Syne', sans-serif", color }}>{value}</span>
                    </div>
                  ))}
                </div>
              </ChartCard>
            </div>
          </>
        )}

      </div>
    </MainLayout>
  );
}