import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  TrendingUp,
  Loader2,
  CalendarCheck2,
  CalendarX2,
  Repeat,
  Timer,
  Users,
  FilterX,
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
import { TICKET_DIVISIONS } from "../constants/divisions";

const dstr = (d) => (d ? String(d).split("T")[0] : null);
const DATE_RX = /from (.*?) to (\d{4}-\d{2}-\d{2})/i;

const fmtMins = (mins) => {
  const m = Math.max(0, Number(mins) || 0);
  if (!m) return "—";
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  return [d ? `${d}d` : "", h ? `${h}h` : "", mm ? `${mm}m` : ""].filter(Boolean).join(" ") || "0m";
};

const daysBetween = (a, b) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

// Reconstruct the due-date journey of a ticket from its timeline
const analyzeTicket = (t) => {
  const timeline = Array.isArray(t.timeline) ? t.timeline : [];
  const changes = timeline
    .filter((e) => (e.type === "due_date" || e.type === "due_date_approved") && DATE_RX.test(e.action || ""))
    .map((e) => {
      const [, from, to] = e.action.match(DATE_RX);
      return { from: /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null, to, at: e.created_at };
    });

  const finalDue = dstr(t.due_date);
  const originalDue = changes.length ? changes[0].from : finalDue;

  // Completed date: real column first, then approval stamp, then the status
  // timeline entry, then last update as a last resort
  let completedOn = dstr(t.completed_date);
  if (!completedOn && t.approved_at && (t.status === "Completed" || t.approval_requested_status === "Completed")) {
    completedOn = dstr(t.approved_at);
  }
  if (!completedOn) {
    const statusEntry = [...timeline]
      .reverse()
      .find((e) => (e.action || "").includes("to Completed"));
    if (statusEntry) completedOn = dstr(statusEntry.created_at);
  }
  if (!completedOn) completedOn = dstr(t.updated_at);

  const spent = (t.time_entries || []).reduce((s, e) => s + (e.duration_minutes || 0), 0);
  const allotted = t.allotted_minutes || 0;

  return {
    ...t,
    originalDue,
    finalDue,
    moves: changes.length,
    daysMoved: originalDue && finalDue ? daysBetween(originalDue, finalDue) : 0,
    completedOn,
    onTimeOriginal: completedOn && originalDue ? completedOn <= originalDue : null,
    onTimeFinal: completedOn && finalDue ? completedOn <= finalDue : null,
    spent,
    allotted,
    withinAllotted: allotted > 0 ? spent <= allotted : null,
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

function OnTimeBadge({ ok }) {
  if (ok === null) return <span className="text-gray-300 text-xs">—</span>;
  return ok ? (
    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">ON TIME</span>
  ) : (
    <span className="text-[10px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">LATE</span>
  );
}

export default function CompletionReport() {
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);

  const [fPerson, setFPerson] = useState("");
  const [fDivision, setFDivision] = useState("");
  const [fProject, setFProject] = useState("");
  const [fMonth, setFMonth] = useState("");
  const [fStatus, setFStatus] = useState("Both");

  useEffect(() => {
    Promise.all([api.get("/tickets"), api.get("/projects").catch(() => ({ data: [] }))])
      .then(([t, p]) => {
        setTickets(t.data || []);
        setProjects(p.data || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const projectName = (id) => projects.find((p) => p.id === id)?.name || null;

  const completed = useMemo(
    () =>
      tickets
        .filter((t) =>
          fStatus === "Both"
            ? t.status === "Completed" || t.status === "Closed"
            : t.status === fStatus
        )
        .map(analyzeTicket),
    [tickets, fStatus]
  );

  const filtered = useMemo(
    () =>
      completed.filter((t) => {
        if (fPerson && (t.assigned_to_name || "Unassigned") !== fPerson) return false;
        if (fDivision && t.division !== fDivision) return false;
        if (fProject && t.project_id !== fProject) return false;
        if (fMonth && (t.completedOn || "").slice(0, 7) !== fMonth) return false;
        return true;
      }),
    [completed, fPerson, fDivision, fProject, fMonth]
  );

  const filtersActive = !!(fPerson || fDivision || fProject || fMonth || fStatus !== "Both");

  const kpis = useMemo(() => {
    const total = filtered.length;
    const withOrig = filtered.filter((t) => t.onTimeOriginal !== null);
    const onTimeOrig = withOrig.filter((t) => t.onTimeOriginal).length;
    const withFinal = filtered.filter((t) => t.onTimeFinal !== null);
    const onTimeFinal = withFinal.filter((t) => t.onTimeFinal).length;
    const moved = filtered.filter((t) => t.moves > 0);
    const totalMoves = filtered.reduce((s, t) => s + t.moves, 0);
    const withAllot = filtered.filter((t) => t.withinAllotted !== null);
    const withinAllot = withAllot.filter((t) => t.withinAllotted).length;
    return {
      total,
      onTimeOrigPct: pct(onTimeOrig, withOrig.length),
      onTimeOrigN: `${onTimeOrig}/${withOrig.length}`,
      onTimeFinalPct: pct(onTimeFinal, withFinal.length),
      movedN: moved.length,
      movedPct: pct(moved.length, total),
      avgMoves: total ? (totalMoves / total).toFixed(1) : "0",
      withinAllotPct: pct(withinAllot, withAllot.length),
      withinAllotN: `${withinAllot}/${withAllot.length}`,
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
        const withOrig = g.tasks.filter((t) => t.onTimeOriginal !== null);
        const withAllot = g.tasks.filter((t) => t.withinAllotted !== null);
        return {
          name: g.name,
          completed: g.tasks.length,
          onTimeOrigPct: pct(withOrig.filter((t) => t.onTimeOriginal).length, withOrig.length),
          moved: g.tasks.filter((t) => t.moves > 0).length,
          avgMoves: (g.tasks.reduce((s, t) => s + t.moves, 0) / g.tasks.length).toFixed(1),
          avgDaysMoved: (
            g.tasks.reduce((s, t) => s + Math.max(0, t.daysMoved), 0) / g.tasks.length
          ).toFixed(1),
          withinAllotPct: pct(withAllot.filter((t) => t.withinAllotted).length, withAllot.length),
          spent: g.tasks.reduce((s, t) => s + t.spent, 0),
          allotted: g.tasks.reduce((s, t) => s + t.allotted, 0),
        };
      })
      .sort((a, b) => b.completed - a.completed);
  }, [filtered]);

  const personOptions = useMemo(
    () => [...new Set(completed.map((t) => t.assigned_to_name || "Unassigned"))].sort(),
    [completed]
  );
  const monthOptions = useMemo(
    () => [...new Set(completed.map((t) => (t.completedOn || "").slice(0, 7)).filter(Boolean))].sort().reverse(),
    [completed]
  );

  const detail = useMemo(
    () => [...filtered].sort((a, b) => ((a.completedOn || "") < (b.completedOn || "") ? 1 : -1)),
    [filtered]
  );

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <TrendingUp className="text-[#9b2423]" size={28} /> Completion Report
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Completed work vs the original commitment — due date moves, punctuality and allotted time
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
          <Loader2 size={20} className="animate-spin" /> Crunching completions…
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
            <select value={fMonth} onChange={(e) => setFMonth(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600">
              <option value="">All months</option>
              {monthOptions.map((m) => <option key={m}>{m}</option>)}
            </select>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
              className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none text-gray-600">
              <option value="Both">Completed + Closed</option>
              <option value="Completed">Completed only</option>
              <option value="Closed">Closed only</option>
            </select>
            {filtersActive && (
              <button
                onClick={() => { setFPerson(""); setFDivision(""); setFProject(""); setFMonth(""); setFStatus("Both"); }}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-[#9b2423] px-2 py-2">
                <FilterX size={14} /> Clear
              </button>
            )}
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <KpiCard icon={CalendarCheck2} label="Tasks completed" value={kpis.total} tone="neutral" />
            <KpiCard
              icon={CalendarCheck2}
              label="On time vs original due"
              value={`${kpis.onTimeOrigPct}%`}
              sub={kpis.onTimeOrigN}
              tone={kpis.onTimeOrigPct >= 70 ? "good" : kpis.onTimeOrigPct >= 40 ? "warn" : "bad"}
            />
            <KpiCard
              icon={CalendarX2}
              label="Had due date moves"
              value={kpis.movedN}
              sub={`${kpis.movedPct}% of tasks · avg ${kpis.avgMoves} moves`}
              tone={kpis.movedPct <= 20 ? "good" : kpis.movedPct <= 50 ? "warn" : "bad"}
            />
            <KpiCard
              icon={CalendarCheck2}
              label="On time vs final due"
              value={`${kpis.onTimeFinalPct}%`}
              tone={kpis.onTimeFinalPct >= 80 ? "good" : "warn"}
            />
            <KpiCard
              icon={Timer}
              label="Within allotted time"
              value={`${kpis.withinAllotPct}%`}
              sub={kpis.withinAllotN + " with allotted set"}
              tone={kpis.withinAllotPct >= 70 ? "good" : kpis.withinAllotPct >= 40 ? "warn" : "bad"}
            />
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm p-12 text-center text-gray-400">
              No completed tasks match the current filters
            </div>
          ) : (
            <>
              {/* Per-person chart */}
              {perPerson.length > 1 && (
                <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
                  <h2 className="font-semibold text-sm mb-4 flex items-center gap-2">
                    <Users size={15} className="text-[#9b2423]" /> On-time delivery vs original due date, by person
                  </h2>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={perPerson} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-12} height={44} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" domain={[0, 100]} />
                        <Tooltip />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="onTimeOrigPct" name="On time %" fill="#059669" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="withinAllotPct" name="Within allotted %" fill="#9b2423" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Per-person summary */}
              <div className="bg-white rounded-2xl shadow-sm overflow-x-auto mb-6">
                <div className="px-5 pt-4 pb-2">
                  <h2 className="font-semibold text-sm flex items-center gap-2">
                    <Users size={15} className="text-[#9b2423]" /> Person-wise summary
                  </h2>
                </div>
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-2.5 font-semibold">Person</th>
                      <th className="px-4 py-2.5 font-semibold">Completed</th>
                      <th className="px-4 py-2.5 font-semibold">On Time (orig)</th>
                      <th className="px-4 py-2.5 font-semibold">Tasks Moved</th>
                      <th className="px-4 py-2.5 font-semibold">Avg Moves</th>
                      <th className="px-4 py-2.5 font-semibold">Avg Days Pushed</th>
                      <th className="px-4 py-2.5 font-semibold">Within Allotted</th>
                      <th className="px-4 py-2.5 font-semibold">Spent / Allotted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {perPerson.map((p) => (
                      <tr key={p.name} className="border-b border-gray-50">
                        <td className="px-5 py-3 font-semibold">{p.name}</td>
                        <td className="px-4 py-3">{p.completed}</td>
                        <td className={`px-4 py-3 font-semibold ${p.onTimeOrigPct >= 70 ? "text-emerald-600" : p.onTimeOrigPct >= 40 ? "text-amber-600" : "text-red-600"}`}>
                          {p.onTimeOrigPct}%
                        </td>
                        <td className="px-4 py-3">{p.moved}</td>
                        <td className="px-4 py-3">{p.avgMoves}</td>
                        <td className="px-4 py-3">{p.avgDaysMoved}</td>
                        <td className="px-4 py-3">{p.withinAllotPct}%</td>
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
                    <Repeat size={15} className="text-[#9b2423]" /> Task detail — the due date journey
                  </h2>
                </div>
                <table className="w-full min-w-[960px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                      <th className="px-5 py-2.5 font-semibold">Task</th>
                      <th className="px-4 py-2.5 font-semibold">Person</th>
                      <th className="px-4 py-2.5 font-semibold">Original Due</th>
                      <th className="px-4 py-2.5 font-semibold">Final Due</th>
                      <th className="px-4 py-2.5 font-semibold">Moves</th>
                      <th className="px-4 py-2.5 font-semibold">Days Pushed</th>
                      <th className="px-4 py-2.5 font-semibold">Completed On</th>
                      <th className="px-4 py-2.5 font-semibold">vs Original</th>
                      <th className="px-4 py-2.5 font-semibold">vs Final</th>
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
                        <td className="px-4 py-3 text-xs whitespace-nowrap">{t.completedOn || "—"}</td>
                        <td className="px-4 py-3"><OnTimeBadge ok={t.onTimeOriginal} /></td>
                        <td className="px-4 py-3"><OnTimeBadge ok={t.onTimeFinal} /></td>
                        <td className="px-4 py-3 text-xs whitespace-nowrap">
                          <span className={t.withinAllotted === false ? "text-red-600 font-semibold" : ""}>
                            {fmtMins(t.spent)}
                          </span>{" "}
                          / {fmtMins(t.allotted)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-[11px] text-gray-400 px-5 py-3 border-t border-gray-50">
                  * final due date differs from the original commitment · "Days Pushed" = final due − original due
                </p>
              </div>
            </>
          )}
        </>
      )}
    </MainLayout>
  );
}
