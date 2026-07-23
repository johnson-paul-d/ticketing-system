import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Gauge,
  Loader2,
  CalendarClock,
  CalendarX2,
  Repeat,
  Timer,
  Users,
  FilterX,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import { excludeDisabledUsers } from "../utils/reportFilters";
import { TICKET_DIVISIONS } from "../constants/divisions";

const DONE = ["Completed", "Closed"];
const dstr = (d) => (d ? String(d).split("T")[0] : null);
const DATE_RX = /from (.*?) to (\d{4}-\d{2}-\d{2})/i;
const today = () => new Date().toISOString().split("T")[0];

const fmtMins = (mins) => {
  const m = Math.max(0, Number(mins) || 0);
  if (!m) return "—";
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return [d ? `${d}d` : "", h ? `${h}h` : "", mm ? `${mm}m` : ""].filter(Boolean).join(" ") || "0m";
};

const dayDiff = (a, b) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

// Adherence snapshot of an in-flight (not done) ticket
const analyzeOpen = (t) => {
  const timeline = Array.isArray(t.timeline) ? t.timeline : [];
  const changes = timeline
    .filter((e) => (e.type === "due_date" || e.type === "due_date_approved") && DATE_RX.test(e.action || ""))
    .map((e) => {
      const [, from, to] = e.action.match(DATE_RX);
      return { from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null, to };
    });

  const finalDue = dstr(t.due_date);
  const originalDue = changes.length ? changes[0].from : finalDue;
  const todayStr = today();

  const daysToDue = finalDue ? dayDiff(todayStr, finalDue) : null; // <0 overdue
  const overdue = finalDue ? finalDue < todayStr : false;
  const dueSoon = daysToDue !== null && daysToDue >= 0 && daysToDue <= 7;

  const spent = (t.time_entries || []).reduce((s, e) => s + (e.duration_minutes || 0), 0);
  const allotted = t.allotted_minutes || 0;
  const overAllotted = allotted > 0 ? spent > allotted : null;

  return {
    ...t,
    originalDue,
    finalDue,
    moves: changes.length,
    daysMoved: originalDue && finalDue ? dayDiff(originalDue, finalDue) : 0,
    daysToDue,
    overdue,
    dueSoon,
    spent,
    allotted,
    overAllotted,
    allottedPct: allotted > 0 ? Math.round((spent / allotted) * 100) : null,
    // "adhering" = not overdue AND not over its allotted budget
    adhering: !overdue && overAllotted !== true,
  };
};

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

function KpiCard({ icon: Icon, label, value, sub, tone }) {
  const tones = {
    good: "text-emerald-600 bg-emerald-50",
    bad: "text-red-600 bg-red-50",
    warn: "text-amber-600 bg-amber-50",
    neutral: "text-[#9b2423] bg-[#9b2423]/10",
  };
  return (
    <div className="bg-white rounded-2xl shadow-sm p-4 sm:p-5 flex items-start gap-3">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tones[tone] || tones.neutral}`}>
        <Icon size={17} />
      </span>
      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-bold leading-tight">{value}</p>
        <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
        {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function DueBadge({ t }) {
  if (t.daysToDue === null) return <span className="text-gray-300 text-xs">no due date</span>;
  if (t.overdue)
    return (
      <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
        {Math.abs(t.daysToDue)}d overdue
      </span>
    );
  if (t.dueSoon)
    return (
      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
        {t.daysToDue === 0 ? "due today" : `${t.daysToDue}d left`}
      </span>
    );
  return (
    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
      {t.daysToDue}d left
    </span>
  );
}

export default function OpenTicketsReport() {
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fPerson, setFPerson] = useState("");
  const [fDivision, setFDivision] = useState("");
  const [fProject, setFProject] = useState("");
  const [fRisk, setFRisk] = useState("All");

  useEffect(() => {
    Promise.all([api.get("/tickets"), api.get("/projects").catch(() => ({ data: [] }))])
      .then(([t, p]) => {
        setTickets(excludeDisabledUsers(t.data || []));
        setProjects(p.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const projectName = (id) => projects.find((p) => p.id === id)?.name || null;

  const open = useMemo(
    () => tickets.filter((t) => !DONE.includes(t.status)).map(analyzeOpen),
    [tickets]
  );

  const filtered = useMemo(
    () =>
      open.filter((t) => {
        if (fPerson && (t.assigned_to_name || "Unassigned") !== fPerson) return false;
        if (fDivision && t.division !== fDivision) return false;
        if (fProject && t.project_id !== fProject) return false;
        if (fRisk === "Overdue" && !t.overdue) return false;
        if (fRisk === "DueSoon" && !t.dueSoon) return false;
        if (fRisk === "OverAllotted" && t.overAllotted !== true) return false;
        if (fRisk === "Moved" && t.moves === 0) return false;
        return true;
      }),
    [open, fPerson, fDivision, fProject, fRisk]
  );

  const filtersActive = !!(fPerson || fDivision || fProject || fRisk !== "All");

  const kpis = useMemo(() => {
    const total = filtered.length;
    const overdue = filtered.filter((t) => t.overdue).length;
    const dueSoon = filtered.filter((t) => t.dueSoon).length;
    const moved = filtered.filter((t) => t.moves > 0).length;
    const totalMoves = filtered.reduce((s, t) => s + t.moves, 0);
    const withAllot = filtered.filter((t) => t.overAllotted !== null);
    const overAllot = withAllot.filter((t) => t.overAllotted).length;
    const adhering = filtered.filter((t) => t.adhering).length;
    return {
      total,
      overdue,
      overduePct: pct(overdue, total),
      dueSoon,
      moved,
      movedPct: pct(moved, total),
      avgMoves: total ? (totalMoves / total).toFixed(1) : "0",
      overAllot,
      overAllotPct: pct(overAllot, withAllot.length),
      overAllotN: `${overAllot}/${withAllot.length}`,
      adheringPct: pct(adhering, total),
    };
  }, [filtered]);

  const perPerson = useMemo(() => {
    const map = {};
    filtered.forEach((t) => {
      const key = t.assigned_to_name || "Unassigned";
      if (!map[key]) map[key] = { name: key, tasks: [] };
      map[key].tasks.push(t);
    });
    return Object.values(map)
      .map((g) => {
        const withAllot = g.tasks.filter((t) => t.overAllotted !== null);
        const overdueTasks = g.tasks.filter((t) => t.overdue);
        return {
          name: g.name,
          open: g.tasks.length,
          overdue: overdueTasks.length,
          overduePct: pct(overdueTasks.length, g.tasks.length),
          avgDaysOverdue: overdueTasks.length
            ? (overdueTasks.reduce((s, t) => s + Math.abs(t.daysToDue), 0) / overdueTasks.length).toFixed(1)
            : "0",
          moved: g.tasks.filter((t) => t.moves > 0).length,
          avgMoves: (g.tasks.reduce((s, t) => s + t.moves, 0) / g.tasks.length).toFixed(1),
          overAllot: withAllot.filter((t) => t.overAllotted).length,
          adheringPct: pct(g.tasks.filter((t) => t.adhering).length, g.tasks.length),
          spent: g.tasks.reduce((s, t) => s + t.spent, 0),
          allotted: g.tasks.reduce((s, t) => s + t.allotted, 0),
        };
      })
      .sort((a, b) => b.overdue - a.overdue || b.open - a.open);
  }, [filtered]);

  const personOptions = useMemo(
    () => [...new Set(open.map((t) => t.assigned_to_name || "Unassigned"))].sort(),
    [open]
  );

  const detail = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        // most at-risk first: overdue by most days, then soonest due
        const av = a.daysToDue === null ? 99999 : a.daysToDue;
        const bv = b.daysToDue === null ? 99999 : b.daysToDue;
        return av - bv;
      }),
    [filtered]
  );

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <Gauge className="text-[#9b2423]" size={28} /> Open Tickets — Adherence
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          In-flight work: due-date adherence, slippage (date moves) and time burned vs allotted
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Loading open tickets…
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap mb-5">
            <select value={fPerson} onChange={(e) => setFPerson(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600">
              <option value="">All people</option>
              {personOptions.map((p) => <option key={p}>{p}</option>)}
            </select>
            <select value={fDivision} onChange={(e) => setFDivision(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600">
              <option value="">All divisions</option>
              {TICKET_DIVISIONS.map((d) => <option key={d}>{d}</option>)}
            </select>
            {projects.length > 0 && (
              <select value={fProject} onChange={(e) => setFProject(e.target.value)}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600 max-w-[160px]">
                <option value="">All projects</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
            <select value={fRisk} onChange={(e) => setFRisk(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600">
              <option value="All">All open</option>
              <option value="Overdue">Overdue only</option>
              <option value="DueSoon">Due in 7 days</option>
              <option value="OverAllotted">Over allotted time</option>
              <option value="Moved">Due date moved</option>
            </select>
            {filtersActive && (
              <button
                onClick={() => { setFPerson(""); setFDivision(""); setFProject(""); setFRisk("All"); }}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-[#9b2423] px-2 py-2">
                <FilterX size={14} /> Clear
              </button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <KpiCard icon={CalendarClock} label="Open tasks" value={kpis.total} tone="neutral" />
            <KpiCard
              icon={AlertTriangle}
              label="Overdue"
              value={kpis.overdue}
              sub={`${kpis.overduePct}% of open`}
              tone={kpis.overduePct === 0 ? "good" : kpis.overduePct <= 25 ? "warn" : "bad"}
            />
            <KpiCard icon={CalendarClock} label="Due within 7 days" value={kpis.dueSoon} tone="warn" />
            <KpiCard
              icon={CalendarX2}
              label="Due date moved"
              value={kpis.moved}
              sub={`${kpis.movedPct}% · avg ${kpis.avgMoves} moves`}
              tone={kpis.movedPct <= 20 ? "good" : kpis.movedPct <= 50 ? "warn" : "bad"}
            />
            <KpiCard
              icon={Timer}
              label="Over allotted time"
              value={`${kpis.overAllotPct}%`}
              sub={`${kpis.overAllotN} with allotted set`}
              tone={kpis.overAllotPct === 0 ? "good" : kpis.overAllotPct <= 25 ? "warn" : "bad"}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
              No open tasks match the current filters
            </div>
          ) : (
            <>
              {/* Per-person chart */}
              {perPerson.length > 1 && (
                <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
                  <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                    <Users size={15} className="text-[#9b2423]" /> Open workload and overdue count, by person
                  </h2>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perPerson} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} height={44} />
                        <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="open" name="Open" fill="#9b2423" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="overdue" name="Overdue" fill="#dc2626" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Per-person summary */}
              <div className="bg-white rounded-2xl shadow-sm overflow-x-auto mb-6">
                <div className="px-5 pt-4 pb-2">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Users size={15} className="text-[#9b2423]" /> Person-wise adherence
                  </h2>
                </div>
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-2.5 font-semibold">Person</th>
                      <th className="px-4 py-2.5 font-semibold">Open</th>
                      <th className="px-4 py-2.5 font-semibold">Overdue</th>
                      <th className="px-4 py-2.5 font-semibold">Avg Days Overdue</th>
                      <th className="px-4 py-2.5 font-semibold">Date Moved</th>
                      <th className="px-4 py-2.5 font-semibold">Avg Moves</th>
                      <th className="px-4 py-2.5 font-semibold">Over Allotted</th>
                      <th className="px-4 py-2.5 font-semibold">On Track</th>
                      <th className="px-4 py-2.5 font-semibold">Spent / Allotted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perPerson.map((p) => (
                      <tr key={p.name} className="border-b border-gray-50">
                        <td className="px-5 py-3 font-semibold">{p.name}</td>
                        <td className="px-4 py-3">{p.open}</td>
                        <td className={`px-4 py-3 font-semibold ${p.overdue > 0 ? "text-red-600" : "text-gray-400"}`}>
                          {p.overdue}{p.overdue > 0 ? ` (${p.overduePct}%)` : ""}
                        </td>
                        <td className="px-4 py-3">{p.avgDaysOverdue}</td>
                        <td className="px-4 py-3">{p.moved}</td>
                        <td className="px-4 py-3">{p.avgMoves}</td>
                        <td className={`px-4 py-3 ${p.overAllot > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                          {p.overAllot}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${p.adheringPct >= 70 ? "text-emerald-600" : p.adheringPct >= 40 ? "text-amber-600" : "text-red-600"}`}>
                          {p.adheringPct}%
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {fmtMins(p.spent)} / {fmtMins(p.allotted)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Detail table */}
              <div className="bg-white rounded-2xl shadow-sm overflow-x-auto">
                <div className="px-5 pt-4 pb-2">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Repeat size={15} className="text-[#9b2423]" /> Open task detail — most at-risk first
                  </h2>
                </div>
                <table className="w-full min-w-[980px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-2.5 font-semibold">Task</th>
                      <th className="px-4 py-2.5 font-semibold">Person</th>
                      <th className="px-4 py-2.5 font-semibold">Status</th>
                      <th className="px-4 py-2.5 font-semibold">Original Due</th>
                      <th className="px-4 py-2.5 font-semibold">Current Due</th>
                      <th className="px-4 py-2.5 font-semibold">Moves</th>
                      <th className="px-4 py-2.5 font-semibold">Days Pushed</th>
                      <th className="px-4 py-2.5 font-semibold">Due Status</th>
                      <th className="px-4 py-2.5 font-semibold">Spent / Allotted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.map((t) => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-5 py-3 max-w-[240px]">
                          <Link to={`/tickets/${t.id}`} className="font-medium hover:text-[#9b2423] line-clamp-1">
                            {t.title}
                          </Link>
                          {t.project_id && projectName(t.project_id) && (
                            <span className="text-[10px] text-gray-400">📁 {projectName(t.project_id)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{t.assigned_to_name || "—"}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap text-gray-500">{t.status}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{t.originalDue || "—"}</td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          {t.finalDue || "—"}
                          {t.moves > 0 && <span className="text-amber-600 font-semibold"> *</span>}
                        </td>
                        <td className={`px-4 py-3 font-semibold ${t.moves > 0 ? "text-amber-600" : "text-gray-400"}`}>
                          {t.moves}
                        </td>
                        <td className={`px-4 py-3 ${t.daysMoved > 0 ? "text-red-600 font-semibold" : "text-gray-400"}`}>
                          {t.daysMoved > 0 ? `+${t.daysMoved}d` : t.daysMoved < 0 ? `${t.daysMoved}d` : "—"}
                        </td>
                        <td className="px-4 py-3"><DueBadge t={t} /></td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={t.overAllotted === true ? "text-red-600 font-semibold" : ""}>
                            {fmtMins(t.spent)}
                          </span>{" "}
                          / {fmtMins(t.allotted)}
                          {t.allottedPct !== null && (
                            <span className={`ml-1 text-[10px] ${t.overAllotted ? "text-red-500" : "text-gray-400"}`}>
                              ({t.allottedPct}%)
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-50">
                  * current due date differs from the original · "Days Pushed" = current due − original due · time % = spent ÷ allotted
                </p>
              </div>
            </>
          )}
        </>
      )}
    </MainLayout>
  );
}
