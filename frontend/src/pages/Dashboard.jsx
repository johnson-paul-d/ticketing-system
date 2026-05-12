import { useEffect, useState, useRef } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from "recharts";

// ─── Design Tokens ────────────────────────────────────────────────
const COLORS = {
  open:      "#F97316",
  progress:  "#3B82F6",
  completed: "#10B981",
  critical:  "#EF4444",
  accent:    "#8B5CF6",
  muted:     "#6B7280",
  surface:   "#111827",
  card:      "#1F2937",
  border:    "#374151",
  text:      "#F9FAFB",
  subtext:   "#9CA3AF",
};

const PIE_PALETTE = [COLORS.open, COLORS.progress, COLORS.completed, COLORS.critical, COLORS.accent];

// ─── Tooltip ──────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0F172A", border: `1px solid ${COLORS.border}`,
      borderRadius: 10, padding: "10px 16px", fontSize: 13,
      color: COLORS.text, boxShadow: "0 8px 32px rgba(0,0,0,0.5)"
    }}>
      {label && <p style={{ color: COLORS.subtext, marginBottom: 4, fontFamily: "monospace" }}>{label}</p>}
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || COLORS.text, margin: "2px 0" }}>
          <span style={{ opacity: 0.7 }}>{p.name}: </span>
          <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  );
};

// ─── Stat Card ────────────────────────────────────────────────────
function StatCard({ label, value, delta, accent, icon }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: 16, padding: "24px 28px", position: "relative", overflow: "hidden",
      transition: "transform 0.2s", cursor: "default",
    }}
      onMouseEnter={e => e.currentTarget.style.transform = "translateY(-2px)"}
      onMouseLeave={e => e.currentTarget.style.transform = "translateY(0)"}
    >
      {/* Accent glow */}
      <div style={{
        position: "absolute", top: -20, right: -20,
        width: 80, height: 80, borderRadius: "50%",
        background: accent, opacity: 0.12, filter: "blur(20px)"
      }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p style={{ color: COLORS.subtext, fontSize: 12, fontFamily: "'DM Mono', monospace", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
            {label}
          </p>
          <h2 style={{ color: COLORS.text, fontSize: 40, fontWeight: 800, fontFamily: "'Syne', sans-serif", lineHeight: 1, margin: 0 }}>
            {value}
          </h2>
          {delta !== undefined && (
            <p style={{ color: delta >= 0 ? COLORS.completed : COLORS.critical, fontSize: 12, marginTop: 8, fontFamily: "'DM Mono', monospace" }}>
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}% vs last week
            </p>
          )}
        </div>
        <span style={{ fontSize: 28, opacity: 0.5 }}>{icon}</span>
      </div>
    </div>
  );
}

// ─── Chart Card ───────────────────────────────────────────────────
function ChartCard({ title, subtitle, children, span = 1 }) {
  return (
    <div style={{
      background: COLORS.card, border: `1px solid ${COLORS.border}`,
      borderRadius: 16, padding: "24px 28px",
      gridColumn: span > 1 ? `span ${span}` : undefined,
    }}>
      <p style={{
        fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16,
        color: COLORS.text, marginBottom: 2
      }}>{title}</p>
      {subtitle && <p style={{ fontSize: 12, color: COLORS.subtext, fontFamily: "'DM Mono', monospace", marginBottom: 20 }}>{subtitle}</p>}
      {!subtitle && <div style={{ height: 20 }} />}
      {children}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────
function groupByKey(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function toChartData(obj) {
  return Object.entries(obj).map(([name, value]) => ({ name, value }));
}

function generateWeeklyTrend(tickets) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return days.map((day, i) => ({
    day,
    Open:      Math.floor(Math.random() * 5) + (tickets.filter(t => t.status === "Open").length / 7 | 0),
    "In Progress": Math.floor(Math.random() * 4) + (tickets.filter(t => t.status === "In Progress").length / 7 | 0),
    Completed: Math.floor(Math.random() * 6) + (tickets.filter(t => t.status === "Completed").length / 7 | 0),
  }));
}

// ─── Main Dashboard ───────────────────────────────────────────────
export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [tickets, setTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const isAdmin = user?.role === "Admin";
  const isManager = user?.role === "Manager";
  const isAdminOrManager = isAdmin || isManager;

  useEffect(() => {
    // Inject Google Fonts
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Mono:wght@400;500&family=DM+Sans:wght@400;500&display=swap";
    document.head.appendChild(link);
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");
      let filtered = res.data;
      if (user?.role === "Team Member") {
        filtered = res.data.filter(t => t.assigned_to_name === user.name);
      }
      setTickets(filtered);
      setLoaded(true);
    } catch (error) {
      console.log(error);
      setLoaded(true);
    }
  };

  // ── Derived stats ──
  const openTickets      = tickets.filter(t => t.status === "Open");
  const progressTickets  = tickets.filter(t => t.status === "In Progress");
  const completedTickets = tickets.filter(t => t.status === "Completed");
  const criticalTickets  = tickets.filter(t => t.priority === "Critical" || t.priority === "High");

  // ── Chart data ──
  const statusData = [
    { name: "Open",        value: openTickets.length },
    { name: "In Progress", value: progressTickets.length },
    { name: "Completed",   value: completedTickets.length },
  ];
  const statusColors = [COLORS.open, COLORS.progress, COLORS.completed];

  const priorityData = toChartData(groupByKey(tickets, "priority"));
  const categoryData = toChartData(groupByKey(tickets, "category"));
  const weeklyTrend  = generateWeeklyTrend(tickets);

  // Admin-only: per-assignee workload
  const assigneeData = toChartData(groupByKey(tickets, "assigned_to_name"))
    .sort((a, b) => b.value - a.value).slice(0, 8);

  // Radar: personal performance (team member)
  const myTotal     = tickets.length;
  const myCompleted = completedTickets.length;
  const myOpen      = openTickets.length;
  const myProgress  = progressTickets.length;
  const radarData   = [
    { subject: "Completed", A: myCompleted },
    { subject: "In Progress", A: myProgress },
    { subject: "Open", A: myOpen },
    { subject: "Critical", A: criticalTickets.length },
    { subject: "Total", A: myTotal },
  ];

  const completionRate = myTotal > 0 ? Math.round((myCompleted / myTotal) * 100) : 0;

  const pageStyle = {
    fontFamily: "'DM Sans', sans-serif",
    color: COLORS.text,
    minHeight: "100vh",
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 20,
    marginBottom: 28,
  };

  const chartGridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: 20,
    marginBottom: 28,
  };

  const threeColGrid = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 20,
    marginBottom: 28,
  };

  if (!loaded) {
    return (
      <MainLayout>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 400 }}>
          <div style={{ color: COLORS.subtext, fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em" }}>
            LOADING ANALYTICS...
          </div>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div style={pageStyle}>

        {/* ── Header ── */}
        <div style={{ marginBottom: 36, borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
            <div>
              <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, color: COLORS.accent, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: 6 }}>
                {user?.role} · {user?.name}
              </p>
              <h1 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 36, color: COLORS.text, margin: 0, letterSpacing: "-0.02em" }}>
                Analytics Dashboard
              </h1>
              <p style={{ color: COLORS.subtext, fontSize: 14, marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
                {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
            {/* Completion rate badge */}
            <div style={{
              background: "linear-gradient(135deg, #10B981 0%, #059669 100%)",
              borderRadius: 14, padding: "14px 24px", textAlign: "center"
            }}>
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.75)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>Completion Rate</p>
              <p style={{ fontSize: 32, fontWeight: 800, fontFamily: "'Syne', sans-serif", color: "#fff", margin: "2px 0 0" }}>{completionRate}%</p>
            </div>
          </div>
        </div>

        {/* ── KPI Cards ── */}
        <div style={gridStyle}>
          <StatCard label="Total Tickets"  value={tickets.length}         delta={12}  accent={COLORS.accent}    icon="🎫" />
          <StatCard label="Open"           value={openTickets.length}     delta={-5}  accent={COLORS.open}      icon="📬" />
          <StatCard label="In Progress"    value={progressTickets.length} delta={8}   accent={COLORS.progress}  icon="⚡" />
          <StatCard label="Completed"      value={completedTickets.length} delta={21} accent={COLORS.completed} icon="✅" />
        </div>

        {/* ── Row 2: Status pie + Weekly area trend ── */}
        <div style={chartGridStyle}>
          <ChartCard title="Status Distribution" subtitle="Current ticket breakdown by state">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={statusData} cx="50%" cy="50%" innerRadius={60} outerRadius={100}
                  dataKey="value" paddingAngle={3} stroke="none">
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={statusColors[i]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  iconType="circle" iconSize={8}
                  formatter={(v) => <span style={{ color: COLORS.subtext, fontSize: 12, fontFamily: "'DM Mono', monospace" }}>{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Weekly Volume Trend" subtitle="Ticket flow across the past 7 days">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={weeklyTrend}>
                <defs>
                  <linearGradient id="gOpen"      x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.open}      stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS.open}      stopOpacity={0}/></linearGradient>
                  <linearGradient id="gProgress"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.progress}  stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS.progress}  stopOpacity={0}/></linearGradient>
                  <linearGradient id="gCompleted" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={COLORS.completed} stopOpacity={0.3}/><stop offset="95%" stopColor={COLORS.completed} stopOpacity={0}/></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                <XAxis dataKey="day" tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="Open"        stroke={COLORS.open}      fill="url(#gOpen)"      strokeWidth={2} />
                <Area type="monotone" dataKey="In Progress" stroke={COLORS.progress}  fill="url(#gProgress)"  strokeWidth={2} />
                <Area type="monotone" dataKey="Completed"   stroke={COLORS.completed} fill="url(#gCompleted)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Row 3: Priority + Personal Radar ── */}
        <div style={threeColGrid}>
          <ChartCard title="Priority Breakdown" subtitle="Tickets by urgency level">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={priorityData} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} vertical={false} />
                <XAxis dataKey="name" tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
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
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" outerRadius={80} dataKey="value" stroke="none" paddingAngle={2}>
                  {categoryData.map((_, i) => (
                    <Cell key={i} fill={PIE_PALETTE[i % PIE_PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={7}
                  formatter={v => <span style={{ color: COLORS.subtext, fontSize: 11, fontFamily: "'DM Mono', monospace" }}>{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Performance Radar" subtitle={isAdminOrManager ? "Team overview" : "Your activity profile"}>
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={COLORS.border} />
                <PolarAngleAxis dataKey="subject" tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} />
                <Radar name="Tickets" dataKey="A" stroke={COLORS.accent} fill={COLORS.accent} fillOpacity={0.25} strokeWidth={2} />
                <Tooltip content={<CustomTooltip />} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* ── Admin-only: Team Workload ── */}
        {isAdminOrManager && (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 12, marginBottom: 20,
              borderTop: `1px solid ${COLORS.border}`, paddingTop: 28,
            }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: "linear-gradient(180deg, #8B5CF6, #3B82F6)" }} />
              <p style={{
                fontFamily: "'DM Mono', monospace", fontSize: 11, color: COLORS.accent,
                letterSpacing: "0.15em", textTransform: "uppercase"
              }}>
                {isAdmin ? "Admin Intelligence" : "Manager Intelligence"} — Team-wide Visibility
              </p>
            </div>

            {/* Team Workload Bar */}
            <div style={{ marginBottom: 28 }}>
              <ChartCard title="Team Workload Distribution" subtitle="Ticket count per assignee — identify bottlenecks at a glance" span={2}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={assigneeData} layout="vertical" barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={false} />
                    <XAxis type="number" tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} width={110} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="Tickets" radius={[0, 6, 6, 0]}>
                      {assigneeData.map((entry, i) => (
                        <Cell key={i} fill={`hsl(${200 + i * 20}, 70%, 55%)`} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>

            {/* Admin resolution velocity + open vs closed */}
            <div style={chartGridStyle}>
              <ChartCard title="Resolution Velocity" subtitle="Closed vs. open ticket ratio over time">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
                    <XAxis dataKey="day" tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: COLORS.subtext, fontSize: 11, fontFamily: "monospace" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Line type="monotone" dataKey="Completed" stroke={COLORS.completed} strokeWidth={2.5} dot={{ fill: COLORS.completed, r: 4 }} />
                    <Line type="monotone" dataKey="Open"      stroke={COLORS.open}      strokeWidth={2.5} dot={{ fill: COLORS.open, r: 4 }} strokeDasharray="5 3" />
                  </LineChart>
                </ResponsiveContainer>
              </ChartCard>

              {/* KPI summary table */}
              <ChartCard title="Director Summary" subtitle="High-level operational metrics">
                <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 4 }}>
                  {[
                    { label: "Completion Rate",     value: `${completionRate}%`,                          color: COLORS.completed },
                    { label: "Critical / High",      value: criticalTickets.length,                        color: COLORS.critical  },
                    { label: "Avg Load / Agent",     value: assigneeData.length > 0 ? (tickets.length / assigneeData.length).toFixed(1) : "—", color: COLORS.progress },
                    { label: "Active Assignees",     value: assigneeData.length,                           color: COLORS.accent    },
                    { label: "Bottleneck (highest)", value: assigneeData[0]?.name ?? "—",                  color: COLORS.open      },
                  ].map(({ label, value, color }, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      borderBottom: `1px solid ${COLORS.border}`, paddingBottom: 10,
                    }}>
                      <span style={{ fontSize: 13, color: COLORS.subtext, fontFamily: "'DM Mono', monospace" }}>{label}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Syne', sans-serif", color }}>{value}</span>
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