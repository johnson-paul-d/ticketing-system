import { useEffect, useState, useMemo } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const T = {
  bg: "#F7F5F0",
  surface: "#FFFFFF",
  surfaceAlt: "#F2EFE9",
  glass: "#FFFFFFCC",

  slate: "#1E2A3A",
  slateLight: "#334155",
  slateMuted: "#64748B",

  open: "#C4622D",
  openBg: "#FDF0E8",
  openBorder: "#E8A87C",

  progress: "#2E6B8A",
  progressBg: "#E8F4F8",
  progressBorder: "#7BB8D0",

  done: "#3A6B4A",
  doneBg: "#EAF3EC",
  doneBorder: "#85BF96",

  critical: "#8B2E2E",
  criticalBg: "#FBE9E9",

  mauve: "#7B5E7B",
  amber: "#B07D2E",
  sage: "#4E7C5F",
  teal: "#2A7B82",
  rose: "#A0455A",
  indigo: "#4754A0",

  textPrimary: "#1E2A3A",
  textSecondary: "#64748B",
  textTertiary: "#94A3B8",
  textInverse: "#F7F5F0",

  border: "#E2DDD5",
  borderMed: "#C8C2B8",
  borderDark: "#9E9589",
};

const CHART_PALETTE = [
  T.open,
  T.progress,
  T.done,
  T.mauve,
  T.amber,
  T.teal,
  T.rose,
  T.indigo,
];

const FONT_URL =
  "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap";

const groupBy = (arr, key) =>
  arr.reduce((acc, item) => {
    const k = item[key] || "Unknown";
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

const toChart = (obj) =>
  Object.entries(obj).map(([name, value]) => ({
    name,
    value,
  }));

const unique = (arr, key) =>
  [...new Set(arr.map((x) => x[key]).filter(Boolean))].sort();

const pct = (n, total) =>
  total > 0 ? `${Math.round((n / total) * 100)}%` : "0%";

function buildWeeklyTrend(tickets) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const buckets = {};

  days.forEach((d) => {
    buckets[d] = {
      day: d,
      Open: 0,
      "In Progress": 0,
      Completed: 0,
    };
  });

  tickets.forEach((t) => {
    const date = t.created_at ? new Date(t.created_at) : null;

    if (!date) return;

    const dayName = date.toLocaleDateString("en-US", {
      weekday: "short",
    });

    if (buckets[dayName]) {
      const key = ["Open", "In Progress", "Completed"].includes(t.status)
        ? t.status
        : null;

      if (key) buckets[dayName][key]++;
    }
  });

  return days.map((d) => buckets[d]);
}

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 4px 24px rgba(30,42,58,0.12)",
      }}
    >
      {label && (
        <p
          style={{
            fontSize: 11,
            color: T.textTertiary,
            marginBottom: 6,
          }}
        >
          {label}
        </p>
      )}

      {payload.map((p, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 2,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: p.color,
            }}
          />

          <span>{p.name}:</span>

          <span
            style={{
              fontWeight: 600,
            }}
          >
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

function Card({ children, style }) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.border}`,
        borderRadius: 16,
        padding: "22px 24px",
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function CardHeader({ eyebrow, title }) {
  return (
    <div
      style={{
        marginBottom: 18,
      }}
    >
      {eyebrow && (
        <p
          style={{
            fontSize: 10,
            color: T.textTertiary,
            textTransform: "uppercase",
            marginBottom: 4,
            letterSpacing: "0.12em",
          }}
        >
          {eyebrow}
        </p>
      )}

      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          margin: 0,
        }}
      >
        {title}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accentColor,
  accentBg,
  accentBorder,
}) {
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${accentBorder}`,
        borderRadius: 14,
        padding: "20px 22px",
      }}
    >
      <p
        style={{
          fontSize: 10,
          color: T.textTertiary,
          marginBottom: 10,
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>

      <p
        style={{
          fontSize: 36,
          margin: "0 0 6px",
          color: accentColor,
        }}
      >
        {value}
      </p>

      <p
        style={{
          fontSize: 11,
          color: T.textTertiary,
        }}
      >
        {sub}
      </p>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <label
        style={{
          fontSize: 10,
          color: T.textTertiary,
          textTransform: "uppercase",
        }}
      >
        {label}
      </label>

      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: T.surfaceAlt,
          border: `1px solid ${T.border}`,
          borderRadius: 8,
          padding: "7px 12px",
        }}
      >
        <option value="all">All</option>

        {options.map((o) => (
          <option
            key={o}
            value={o}
          >
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function MetricRow({ label, value, color }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: `1px solid ${T.border}`,
      }}
    >
      <span>{label}</span>

      <span
        style={{
          color,
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

const axisTick = {
  fill: T.textTertiary,
  fontSize: 10,
};

const axisLine = {
  axisLine: false,
  tickLine: false,
};

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);

  const [allTickets, setAllTickets] = useState([]);
  const [loaded, setLoaded] = useState(false);

  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");
  const [fCategory, setFCategory] = useState("all");
  const [fDivision, setFDivision] = useState("all");
  const [fAssignee, setFAssignee] = useState("all");
  const [fDate, setFDate] = useState("all");

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
        data = data.filter(
          (t) => t.assigned_to_name === user.name
        );
      }

      setAllTickets(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoaded(true);
    }
  };

  const statusOpts = useMemo(
    () => unique(allTickets, "status"),
    [allTickets]
  );

  const priorityOpts = useMemo(
    () => unique(allTickets, "priority"),
    [allTickets]
  );

  const categoryOpts = useMemo(
    () => unique(allTickets, "category"),
    [allTickets]
  );

  const divisionOpts = useMemo(
    () => unique(allTickets, "division"),
    [allTickets]
  );

  const assigneeOpts = useMemo(
    () => unique(allTickets, "assigned_to_name"),
    [allTickets]
  );

  const tickets = useMemo(() => {
    return allTickets.filter((t) => {
      if (fStatus !== "all" && t.status !== fStatus)
        return false;

      if (
        fPriority !== "all" &&
        t.priority !== fPriority
      )
        return false;

      if (
        fCategory !== "all" &&
        t.category !== fCategory
      )
        return false;

      if (
        fDivision !== "all" &&
        t.division !== fDivision
      )
        return false;

      if (
        fAssignee !== "all" &&
        t.assigned_to_name !== fAssignee
      )
        return false;

      return true;
    });
  }, [
    allTickets,
    fStatus,
    fPriority,
    fCategory,
    fDivision,
    fAssignee,
  ]);

  const resetAll = () => {
    setFStatus("all");
    setFPriority("all");
    setFCategory("all");
    setFDivision("all");
    setFAssignee("all");
    setFDate("all");
  };

  const openT = tickets.filter(
    (t) => t.status === "Open"
  );

  const progressT = tickets.filter(
    (t) => t.status === "In Progress"
  );

  const completedT = tickets.filter(
    (t) => t.status === "Completed"
  );

  const criticalT = tickets.filter(
    (t) =>
      t.priority === "Critical" ||
      t.priority === "High"
  );

  const completionRate =
    tickets.length > 0
      ? Math.round(
          (completedT.length / tickets.length) * 100
        )
      : 0;

  const statusData = [
    {
      name: "Open",
      value: openT.length,
    },
    {
      name: "In Progress",
      value: progressT.length,
    },
    {
      name: "Completed",
      value: completedT.length,
    },
  ];

  const priorityData = toChart(
    groupBy(tickets, "priority")
  );

  const categoryData = toChart(
    groupBy(tickets, "category")
  );

  const divisionData = toChart(
    groupBy(tickets, "division")
  );

  const weeklyTrend = buildWeeklyTrend(tickets);

  const assigneeData = toChart(
    groupBy(tickets, "assigned_to_name")
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const statusByDivision = divisionData.map((d) => {
    const divTickets = tickets.filter(
      (t) => t.division === d.name
    );

    return {
      division: d.name,
      Open: divTickets.filter(
        (t) => t.status === "Open"
      ).length,

      Progress: divTickets.filter(
        (t) => t.status === "In Progress"
      ).length,

      Completed: divTickets.filter(
        (t) => t.status === "Completed"
      ).length,
    };
  });

  const assigneePerformance = assigneeData.map((a) => {
    const personTickets = tickets.filter(
      (t) => t.assigned_to_name === a.name
    );

    return {
      name: a.name,
      Completed: personTickets.filter(
        (t) => t.status === "Completed"
      ).length,

      Open: personTickets.filter(
        (t) => t.status === "Open"
      ).length,

      Total: personTickets.length,
    };
  });

  const g4 = {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 14,
    marginBottom: 20,
  };

  const g3 = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: 14,
    marginBottom: 20,
  };

  const g2 = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
    marginBottom: 20,
  };

  if (!loaded) {
    return (
      <MainLayout>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: 400,
          }}
        >
          Loading...
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 24,
          }}
        >
          <div>
            <h1>Analytics Dashboard</h1>

            <p>
              {user?.role} · {user?.name}
            </p>
          </div>

          <div>
            <h2>{completionRate}%</h2>
            <p>Completion</p>
          </div>
        </div>

        <Card
          style={{
            marginBottom: 20,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 14,
              flexWrap: "wrap",
            }}
          >
            <FilterSelect
              label="Status"
              value={fStatus}
              options={statusOpts}
              onChange={setFStatus}
            />

            <FilterSelect
              label="Priority"
              value={fPriority}
              options={priorityOpts}
              onChange={setFPriority}
            />

            <FilterSelect
              label="Category"
              value={fCategory}
              options={categoryOpts}
              onChange={setFCategory}
            />

            <FilterSelect
              label="Division"
              value={fDivision}
              options={divisionOpts}
              onChange={setFDivision}
            />

            {isAdminOrManager && (
              <FilterSelect
                label="Assignee"
                value={fAssignee}
                options={assigneeOpts}
                onChange={setFAssignee}
              />
            )}

            <button onClick={resetAll}>
              Clear Filters
            </button>
          </div>
        </Card>

        <div style={g4}>
          <StatCard
            label="Total"
            value={tickets.length}
            sub="All tickets"
            accentColor={T.slate}
            accentBg="#EFF2F6"
            accentBorder="#C8D0DC"
          />

          <StatCard
            label="Open"
            value={openT.length}
            sub={pct(openT.length, tickets.length)}
            accentColor={T.open}
            accentBg={T.openBg}
            accentBorder={T.openBorder}
          />

          <StatCard
            label="In Progress"
            value={progressT.length}
            sub={pct(progressT.length, tickets.length)}
            accentColor={T.progress}
            accentBg={T.progressBg}
            accentBorder={T.progressBorder}
          />

          <StatCard
            label="Completed"
            value={completedT.length}
            sub={pct(completedT.length, tickets.length)}
            accentColor={T.done}
            accentBg={T.doneBg}
            accentBorder={T.doneBorder}
          />
        </div>

        <div style={g2}>
          <Card>
            <CardHeader
              eyebrow="Distribution"
              title="Status Breakdown"
            />

            <ResponsiveContainer
              width="100%"
              height={280}
            >
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  outerRadius={90}
                >
                  <Cell fill={T.open} />
                  <Cell fill={T.progress} />
                  <Cell fill={T.done} />
                </Pie>

                <Tooltip
                  content={<ChartTooltip />}
                />

                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <CardHeader
              eyebrow="Trend"
              title="Weekly Activity"
            />

            <ResponsiveContainer
              width="100%"
              height={280}
            >
              <AreaChart data={weeklyTrend}>
                <CartesianGrid
                  strokeDasharray="2 4"
                />

                <XAxis
                  dataKey="day"
                  tick={axisTick}
                  {...axisLine}
                />

                <YAxis
                  tick={axisTick}
                  {...axisLine}
                />

                <Tooltip
                  content={<ChartTooltip />}
                />

                <Area
                  type="monotone"
                  dataKey="Open"
                  stroke={T.open}
                  fill={T.open}
                />

                <Area
                  type="monotone"
                  dataKey="Completed"
                  stroke={T.done}
                  fill={T.done}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {isAdminOrManager && (
          <>
            <Card
              style={{
                marginBottom: 20,
              }}
            >
              <CardHeader
                eyebrow="Executive"
                title="Division performance overview"
              />

              <ResponsiveContainer
                width="100%"
                height={320}
              >
                <BarChart
                  data={statusByDivision}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                  />

                  <XAxis
                    dataKey="division"
                    tick={axisTick}
                    {...axisLine}
                  />

                  <YAxis
                    tick={axisTick}
                    {...axisLine}
                  />

                  <Tooltip
                    content={<ChartTooltip />}
                  />

                  <Legend />

                  <Bar
                    dataKey="Open"
                    stackId="a"
                    fill={T.open}
                  />

                  <Bar
                    dataKey="Progress"
                    stackId="a"
                    fill={T.progress}
                  />

                  <Bar
                    dataKey="Completed"
                    stackId="a"
                    fill={T.done}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card
              style={{
                marginBottom: 20,
              }}
            >
              <CardHeader
                eyebrow="Leadership"
                title="Team efficiency matrix"
              />

              <ResponsiveContainer
                width="100%"
                height={320}
              >
                <BarChart
                  data={assigneePerformance}
                >
                  <CartesianGrid
                    strokeDasharray="2 4"
                  />

                  <XAxis
                    dataKey="name"
                    tick={axisTick}
                    {...axisLine}
                  />

                  <YAxis
                    tick={axisTick}
                    {...axisLine}
                  />

                  <Tooltip
                    content={<ChartTooltip />}
                  />

                  <Legend />

                  <Bar
                    dataKey="Completed"
                    fill={T.done}
                  />

                  <Bar
                    dataKey="Open"
                    fill={T.open}
                  />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <div style={g2}>
              <Card>
                <CardHeader
                  eyebrow="Executive"
                  title="Director Summary"
                />

                <MetricRow
                  label="Completion Rate"
                  value={`${completionRate}%`}
                  color={T.done}
                />

                <MetricRow
                  label="Critical / High"
                  value={criticalT.length}
                  color={T.critical}
                />

                <MetricRow
                  label="Active Assignees"
                  value={assigneeData.length}
                  color={T.progress}
                />

                <MetricRow
                  label="Top Assignee"
                  value={
                    assigneeData[0]?.name || "—"
                  }
                  color={T.open}
                />
              </Card>

              <div style={g3}>
                <StatCard
                  label="Best Division"
                  value={
                    divisionData.sort(
                      (a, b) => b.value - a.value
                    )[0]?.name || "—"
                  }
                  sub="Highest ticket volume"
                  accentColor={T.indigo}
                  accentBg="#EEF2FF"
                  accentBorder="#C7D2FE"
                />

                <StatCard
                  label="Critical Tickets"
                  value={criticalT.length}
                  sub="Needs attention"
                  accentColor={T.critical}
                  accentBg={T.criticalBg}
                  accentBorder="#F5B5B5"
                />

                <StatCard
                  label="Resolution Rate"
                  value={`${completionRate}%`}
                  sub="Operational efficiency"
                  accentColor={T.done}
                  accentBg={T.doneBg}
                  accentBorder={T.doneBorder}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </MainLayout>
  );
}