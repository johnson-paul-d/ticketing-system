import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";
import useAuthStore from "../store/authStore";
import { FileDown, Loader2, CalendarRange, Users, User, AlertCircle } from "lucide-react";

const inputCls =
  "w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 outline-none focus:ring-2 focus:ring-[#9b2423]/40";

const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Monday-to-Sunday, from any date inside the week. Written out rather than
// pulled from a date library because it is the only date maths on this page.
const weekBounds = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  const mon = new Date(d);
  mon.setDate(d.getDate() - dow);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { from: iso(mon), to: iso(sun) };
};

const monthBounds = (monthStr) => {
  const [y, m] = String(monthStr).split("-").map(Number);
  if (!y || !m) return null;
  return { from: `${y}-${pad(m)}-01`, to: iso(new Date(y, m, 0)) };
};

const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const pretty = (isoStr) => {
  if (!isoStr) return "—";
  const [y, m, d] = isoStr.split("-").map(Number);
  return `${d} ${MONTH_NAMES[m - 1]?.slice(0, 3)} ${y}`;
};

export default function WorkReport() {
  const me = useAuthStore((s) => s.user);

  const [subjects, setSubjects] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const today = useMemo(() => new Date(), []);
  const [scope, setScope] = useState("me");
  const [userId, setUserId] = useState("");
  const [mode, setMode] = useState("month");
  const [month, setMonth] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`);
  const [weekOf, setWeekOf] = useState(iso(today));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [dateField, setDateField] = useState("created");

  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/reports/subjects");
        setSubjects(res.data);
      } catch (err) {
        setError(err.response?.data?.message || "Failed to load the report options");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // The window the filters currently describe, in the shape the API wants.
  const range = useMemo(() => {
    if (mode === "month") return monthBounds(month);
    if (mode === "week") return weekBounds(weekOf);
    if (mode === "custom") return from || to ? { from: from || null, to: to || null } : null;
    return null; // "all"
  }, [mode, month, weekOf, from, to]);

  const params = useMemo(() => {
    const p = { scope, dateField };
    if (scope === "person") p.userId = userId;
    if (range?.from) p.from = range.from;
    if (range?.to) p.to = range.to;
    return p;
  }, [scope, userId, dateField, range]);

  const ready = scope !== "person" || !!userId;

  // Preview follows the filters, so the page can say what the download holds
  // before anyone spends a render on it.
  useEffect(() => {
    if (!subjects || !ready) return;
    let cancelled = false;
    setPreviewing(true);
    setError("");
    const t = setTimeout(async () => {
      try {
        const res = await api.get("/reports/work/preview", { params });
        if (!cancelled) setPreview(res.data);
      } catch (err) {
        if (!cancelled) {
          setPreview(null);
          setError(err.response?.data?.message || "Could not read that window");
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [subjects, ready, JSON.stringify(params)]);

  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      const res = await api.get("/reports/work.pptx", { params, responseType: "blob" });
      // Content-Disposition carries the name the server chose; falling back
      // keeps the download working if a proxy strips the header.
      const disp = res.headers["content-disposition"] || "";
      const match = /filename="([^"]+)"/.exec(disp);
      const name = match ? match[1] : "Work Report.pptx";

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // The error body arrives as a Blob because the request asked for one, so
      // the message has to be read out of it rather than off err.response.data.
      let message = "Failed to build the report";
      const data = err.response?.data;
      if (data instanceof Blob) {
        try {
          message = JSON.parse(await data.text()).message || message;
        } catch {
          /* not JSON; keep the default */
        }
      } else if (data?.message) {
        message = data.message;
      }
      setError(message);
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-20 text-gray-400 gap-2">
          <Loader2 size={18} className="animate-spin" /> Loading…
        </div>
      </MainLayout>
    );
  }

  const people = subjects?.people || [];
  const canOthers = subjects?.canReportOnOthers;

  return (
    <MainLayout>
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-3">
          <FileDown className="text-[#9b2423]" size={28} /> Work Report
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Download a PowerPoint of work done, in the MRM deck format
        </p>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl border border-red-200 flex items-start gap-2.5">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* FILTERS */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-2xl shadow-sm">
          {/* Whose */}
          <label className="block text-xs font-semibold text-gray-500 mb-2">Whose work</label>
          <div className="flex flex-wrap gap-2 mb-5">
            <button
              onClick={() => setScope("me")}
              className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition ${
                scope === "me"
                  ? "bg-[#9b2423] border-[#9b2423] text-white"
                  : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
              }`}
            >
              <User size={15} /> Mine
            </button>
            {canOthers && (
              <>
                <button
                  onClick={() => setScope("person")}
                  className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition ${
                    scope === "person"
                      ? "bg-[#9b2423] border-[#9b2423] text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <User size={15} /> One person
                </button>
                <button
                  onClick={() => setScope("team")}
                  className={`inline-flex items-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl border transition ${
                    scope === "team"
                      ? "bg-[#9b2423] border-[#9b2423] text-white"
                      : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Users size={15} /> Whole team
                </button>
              </>
            )}
          </div>

          {scope === "person" && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Person</label>
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className={inputCls}>
                <option value="">Choose a person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.isMe ? " (you)" : ""} — {p.designation || p.role}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Period */}
          <label className="block text-xs font-semibold text-gray-500 mb-2">Period</label>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              ["month", "Month"],
              ["week", "Week"],
              ["custom", "Custom range"],
              ["all", "All time"],
            ].map(([v, label]) => (
              <button
                key={v}
                onClick={() => setMode(v)}
                className={`text-sm font-semibold px-4 py-2.5 rounded-xl border transition ${
                  mode === v
                    ? "bg-gray-900 border-gray-900 text-white"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "month" && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Month</label>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inputCls} />
            </div>
          )}

          {mode === "week" && (
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">Week containing</label>
              <input type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1.5">
                Monday to Sunday. Pick any day inside the week you want.
              </p>
            </div>
          )}

          {mode === "custom" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
              </div>
            </div>
          )}

          {/* Which date */}
          <label className="block text-xs font-semibold text-gray-500 mb-2">Filter on</label>
          <div className="flex flex-wrap gap-2">
            {[
              ["created", "Created date", "Work that landed in this period"],
              ["due", "Due date", "Work that was meant to finish in it"],
            ].map(([v, label, hint]) => (
              <button
                key={v}
                onClick={() => setDateField(v)}
                className={`text-left px-4 py-3 rounded-xl border transition flex-1 min-w-[200px] ${
                  dateField === v
                    ? "bg-[#9b2423]/5 border-[#9b2423] text-gray-900"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="block text-sm font-semibold">{label}</span>
                <span className="block text-[11px] text-gray-500 mt-0.5">{hint}</span>
              </button>
            ))}
          </div>
        </div>

        {/* PREVIEW + DOWNLOAD */}
        <div className="bg-white p-5 sm:p-6 rounded-2xl shadow-sm flex flex-col">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
            <CalendarRange size={17} className="text-[#9b2423]" /> What you'll get
          </h2>
          <p className="text-xs text-gray-500 mb-4">
            {range?.from || range?.to
              ? `${pretty(range.from)} – ${pretty(range.to)}`
              : "Everything on record"}
            {" · by "}
            {dateField === "due" ? "due date" : "created date"}
          </p>

          {!ready ? (
            <p className="text-sm text-gray-400 py-6">Choose a person to see a preview.</p>
          ) : previewing ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm py-6">
              <Loader2 size={15} className="animate-spin" /> Checking…
            </div>
          ) : preview?.people?.length ? (
            <>
              <div className="space-y-2.5 flex-1 overflow-y-auto max-h-72">
                {preview.people.map((p) => (
                  <div key={p.name} className="border border-gray-100 rounded-xl px-3.5 py-2.5">
                    <p className="text-sm font-semibold">{p.name}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      {p.assigned} tickets · {p.completed} completed · {p.open} open
                      {p.overdueOpen ? ` · ${p.overdueOpen} past due` : ""}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-3">
                {preview.slides} slides
                {scope === "team" ? ", one per person" : ""}
              </p>
            </>
          ) : (
            <p className="text-sm text-gray-400 py-6">
              No work falls in that window. Widen the period, or try filtering on the other date.
            </p>
          )}

          <button
            onClick={download}
            disabled={downloading || !ready || !preview?.people?.length}
            className="mt-4 inline-flex items-center justify-center gap-2 bg-[#9b2423] hover:bg-[#7d1d1c] disabled:opacity-50 text-white font-semibold text-sm px-6 py-3 rounded-xl w-full"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <FileDown size={16} />}
            {downloading ? "Building…" : "Download PowerPoint"}
          </button>
          <p className="text-[11px] text-gray-400 mt-2 text-center">Signed in as {me?.name}</p>
        </div>
      </div>
    </MainLayout>
  );
}
