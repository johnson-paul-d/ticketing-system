// The reviewer's quality scorecard: the team score, a card per person, the
// tasks waiting for a rating, and every scored task with its breakdown.
// Lives as a tab of the Completion Report; the server returns it to the
// reviewer only.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Loader2,
  Mail,
  Send,
  X,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Clock,
  RotateCcw,
  ClipboardCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  Hourglass,
  CalendarRange,
} from "lucide-react";
import api from "../../services/api";
import RatingDialog from "./RatingDialog";
import {
  ScoreRing,
  GradePill,
  ScorePill,
  StarsShown,
  fmtScore,
  fmtDay,
  toneOf,
  gradeOf,
} from "./ScoreBits";

const PERIODS = [
  { key: "this-week", label: "This week" },
  { key: "last-week", label: "Last week" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthName = (ym) => `${MONTHS_SHORT[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

// Months from the portal's first ticket to now, newest first.
const monthsSince = (from) => {
  if (!from) return [];
  const out = [];
  const now = new Date();
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = now.getFullYear();
  const endM = now.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.reverse();
};

const AVATAR = ["bg-rose-100 text-rose-700", "bg-sky-100 text-sky-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-800", "bg-emerald-100 text-emerald-700", "bg-fuchsia-100 text-fuchsia-700", "bg-cyan-100 text-cyan-700"];
const avatarOf = (name) => AVATAR[[...String(name)].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR.length];
const initials = (name) =>
  String(name)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

const pctText = (v) => (v == null ? "—" : `${v}%`);
const MEDALS = { 1: "🥇", 2: "🥈", 3: "🥉" };

function Delta({ value, vs, dark }) {
  if (value == null) return <span className={`text-xs ${dark ? "text-white/60" : "text-gray-400"}`}>No earlier score</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  const color = dark
    ? value > 0 ? "text-emerald-200" : value < 0 ? "text-red-200" : "text-white/70"
    : value > 0 ? "text-emerald-600" : value < 0 ? "text-red-600" : "text-gray-400";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
      <Icon size={13} /> {value > 0 ? "+" : ""}
      {fmtScore(value)}
      {vs && <span className={`font-normal ${dark ? "text-white/60" : "text-gray-400"}`}>vs {vs}</span>}
    </span>
  );
}

function PartBar({ label, weight, value, dark }) {
  const w = Math.max(0, Math.min(100, value || 0));
  const tone = toneOf(gradeOf(value));
  return (
    <div>
      <div className={`flex items-center justify-between text-xs ${dark ? "text-white/80" : "text-gray-600"}`}>
        <span>
          {label} <span className={dark ? "text-white/50" : "text-gray-400"}>{weight}%</span>
        </span>
        <span className={`font-bold ${dark ? "text-white" : "text-gray-900"}`}>{fmtScore(value)}</span>
      </div>
      <div className={`h-1.5 rounded-full mt-1 overflow-hidden ${dark ? "bg-white/15" : "bg-[#f1ece4]"}`}>
        <div
          className={`h-full rounded-full ${dark ? "bg-white" : tone.bar}`}
          style={{ width: `${w}%`, transition: "width .8s cubic-bezier(.2,.8,.2,1)" }}
        />
      </div>
    </div>
  );
}

function HeroStat({ icon: Icon, value, label, sub, onClick, highlight }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`text-left rounded-2xl px-4 py-3 bg-white/10 hover:bg-white/15 transition ${highlight ? "ring-2 ring-amber-300/70" : ""}`}
    >
      <div className="flex items-center gap-2 text-white/70 text-[11px] font-semibold uppercase tracking-wide">
        <Icon size={13} /> {label}
      </div>
      <div className="text-2xl font-extrabold text-white mt-1 leading-none">{value}</div>
      {sub && <div className="text-[11px] text-white/60 mt-1">{sub}</div>}
    </Tag>
  );
}

function PersonCard({ p, parts, weights, active, onSelect }) {
  return (
    <button
      onClick={onSelect}
      className={`relative text-left bg-white rounded-3xl p-5 shadow-sm hover:shadow-md transition border-2 ${
        active ? "border-[#9b2423]" : "border-transparent"
      }`}
    >
      {p.rank && p.rank <= 3 && <span className="absolute top-3 right-4 text-xl">{MEDALS[p.rank]}</span>}
      <div className="flex items-center gap-4">
        <ScoreRing score={p.score} grade={p.grade} size={78} stroke={7} caption={p.score != null ? "score" : p.pending ? "pending" : "not rated"} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`w-7 h-7 rounded-full text-[11px] font-bold flex items-center justify-center ${avatarOf(p.name)}`}>
              {initials(p.name)}
            </span>
            <p className="font-bold text-gray-900 truncate">{p.name}</p>
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            {p.grade ? <GradePill grade={p.grade} /> : <span className="text-[11px] text-gray-400">Not scored yet</span>}
            {p.rank && <span className="text-[11px] text-gray-400">#{p.rank}</span>}
          </div>
          <div className="mt-1">
            <Delta value={p.delta} />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {parts.map(({ key, label }) => (
          <PartBar key={key} label={label} weight={weights[key]} value={p.parts[key]} />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-4 gap-1 text-center">
        {[
          [`${p.scored}/${p.tasks}`, "scored"],
          [pctText(p.onTimePct), "on time"],
          [pctText(p.firstPassPct), "1st pass"],
          [p.sentBack, "sent back"],
        ].map(([v, l]) => (
          <div key={l} className="bg-[#faf6f0] rounded-xl py-2">
            <div className="text-sm font-extrabold text-gray-900">{v}</div>
            <div className="text-[10px] text-gray-400">{l}</div>
          </div>
        ))}
      </div>
      {p.toRate > 0 && (
        <p className="mt-3 text-xs font-semibold text-[#9b2423]">
          {p.toRate} waiting for your rating
        </p>
      )}
    </button>
  );
}

function EmailPreview({ kind, onClose }) {
  const [mail, setMail] = useState(null);
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState("");

  useEffect(() => {
    api
      .get("/scorecard/email-preview", { params: { kind } })
      .then((r) => setMail(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not build the email"));
  }, [kind]);

  const sendTest = async () => {
    setSending(true);
    setError("");
    try {
      const r = await api.post("/scorecard/test-email", { kind });
      setSent(`Sent to ${r.data.sentTo}`);
    } catch (e) {
      setError(e.response?.data?.message || "Could not send the test email");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <Mail size={18} className="text-[#9b2423]" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 font-semibold">
              {kind === "weekly" ? "Every Monday, 9:00 am" : "The 2nd of every month, 9:00 am"}
            </p>
            <p className="text-sm font-bold truncate">{mail?.subject || "Building the email…"}</p>
          </div>
          <button
            onClick={sendTest}
            disabled={sending || !mail}
            className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#9b2423] hover:bg-[#7f1d1c] disabled:opacity-40 flex items-center gap-2"
          >
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send me a test
          </button>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {(error || sent) && (
          <p className={`px-5 py-2 text-xs ${error ? "text-red-600 bg-red-50" : "text-emerald-700 bg-emerald-50"}`}>{error || sent}</p>
        )}
        <div className="flex-1 bg-[#f6f1e9]">
          {mail ? (
            <iframe title="Email preview" srcDoc={mail.html} className="w-full h-full border-0" sandbox="" />
          ) : (
            !error && (
              <div className="h-full flex items-center justify-center text-gray-400 gap-2">
                <Loader2 size={18} className="animate-spin" /> Building the email…
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function PendingBadge({ reasons }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-full whitespace-nowrap" title={reasons.join(" · ")}>
      <Hourglass size={11} /> {reasons[0] || "Pending"}
    </span>
  );
}

const fmtMins = (min) => {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return [h ? `${h}h` : "", m ? `${m}m` : ""].filter(Boolean).join(" ");
};

function TimeChip({ t }) {
  if (!(t.allotted > 0) || !(t.spent > 0)) {
    return <span className="text-gray-300 text-xs whitespace-nowrap">{fmtMins(t.spent)} / {fmtMins(t.allotted)}</span>;
  }
  const over = t.spent > t.allotted;
  return (
    <span
      className={`text-[11px] font-semibold whitespace-nowrap ${over ? (t.parts.withinTime === 0 ? "text-red-600" : "text-amber-700") : "text-emerald-700"}`}
      title="Time taken / time allowed"
    >
      {fmtMins(t.spent)} / {fmtMins(t.allotted)}
    </span>
  );
}

function LateChip({ t }) {
  if (t.lateDays == null) return <span className="text-gray-300 text-xs">—</span>;
  if (t.lateDays <= 0) return <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">ON TIME</span>;
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${t.lateDays > 5 ? "text-red-700 bg-red-50" : "text-amber-700 bg-amber-50"}`}>
      {t.lateDays}D LATE
    </span>
  );
}

export default function ScorecardView() {
  const [period, setPeriod] = useState("this-month");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [person, setPerson] = useState("");
  const [state, setState] = useState("all");
  const [open, setOpen] = useState(null);
  const [rating, setRating] = useState(null);
  const [preview, setPreview] = useState(null);
  const [showAllQueue, setShowAllQueue] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    api
      .get("/scorecard", { params: { period } })
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.message || "Could not load the scorecard"))
      .finally(() => setLoading(false));
  }, [period]);

  useEffect(load, [load]);

  const months = useMemo(() => monthsSince(data?.firstMonth), [data?.firstMonth]);

  // The month range picked, when the period is one month or a run of months.
  const span = useMemo(() => {
    const m = /^(\d{4}-\d{2})(?:\.\.(\d{4}-\d{2}))?$/.exec(period);
    return m ? { from: m[1], to: m[2] || m[1] } : null;
  }, [period]);
  const pickSpan = (from, to) => {
    const a = from || to;
    if (!a) return;
    const b = to && to >= a ? to : a;
    setPeriod(a === b ? a : `${a}..${b}`);
  };

  const tasks = useMemo(() => {
    if (!data) return [];
    return data.tasks.filter(
      (t) =>
        (!person || (t.personId || t.person) === person) &&
        (state === "all" || t.state === state)
    );
  }, [data, person, state]);

  const counts = useMemo(() => {
    const c = { all: 0, final: 0, pending: 0, before: 0, excluded: 0 };
    (data?.tasks || [])
      .filter((t) => !person || (t.personId || t.person) === person)
      .forEach((t) => {
        c.all += 1;
        c[t.state] += 1;
      });
    return c;
  }, [data, person]);

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-400 gap-2">
        <Loader2 size={20} className="animate-spin" /> Scoring the team…
      </div>
    );
  }
  if (!data) return <div className="bg-white rounded-2xl p-8 text-center text-red-600 text-sm">{error}</div>;

  const { team, parts, weights } = data;
  const queue = showAllQueue ? data.toRate : data.toRate.slice(0, 6);
  const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className={`space-y-6 ${loading ? "opacity-60 pointer-events-none" : ""} transition-opacity`}>
      {/* Period */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="bg-white rounded-2xl p-1 shadow-sm flex flex-wrap">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                period === p.key ? "bg-[#9b2423] text-white shadow" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {months.length > 0 && (
          <div
            className={`bg-white rounded-2xl shadow-sm pl-3 pr-1 py-1 flex items-center gap-1.5 text-xs ${
              span ? "ring-2 ring-[#9b2423]" : ""
            }`}
          >
            <CalendarRange size={14} className="text-[#9b2423]" />
            <span className="text-gray-400 font-semibold">From</span>
            <select
              value={span?.from || ""}
              onChange={(e) => pickSpan(e.target.value, span?.to)}
              className="bg-transparent rounded-lg px-1.5 py-1 outline-none text-gray-700 font-semibold"
            >
              <option value="">month</option>
              {[...months].reverse().map((m) => (
                <option key={m} value={m}>{monthName(m)}</option>
              ))}
            </select>
            <span className="text-gray-400 font-semibold">to</span>
            <select
              value={span?.to || ""}
              onChange={(e) => pickSpan(span?.from, e.target.value)}
              className="bg-transparent rounded-lg px-1.5 py-1 outline-none text-gray-700 font-semibold"
            >
              <option value="">month</option>
              {months.map((m) => (
                <option key={m} value={m} disabled={Boolean(span?.from) && m < span.from}>{monthName(m)}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex-1" />
        <button onClick={() => setPreview("weekly")} className="bg-white shadow-sm rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 hover:text-[#9b2423] flex items-center gap-1.5">
          <Mail size={14} /> Monday email
        </button>
        <button onClick={() => setPreview("monthly")} className="bg-white shadow-sm rounded-xl px-3 py-2 text-xs font-semibold text-gray-700 hover:text-[#9b2423] flex items-center gap-1.5">
          <Mail size={14} /> Monthly email
        </button>
      </div>

      {data.setupNeeded && (
        <div className="flex gap-2 items-start text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-2xl px-4 py-3">
          <AlertTriangle size={17} className="flex-shrink-0 mt-0.5" />
          The scorecard database step hasn't been run on the server yet. Scores show, but ratings can't be saved until it is.
        </div>
      )}

      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-[#9b2423] via-[#86201f] to-[#5e1414] text-white p-6 sm:p-7 shadow-lg relative overflow-hidden">
        <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-white/5" />
        <div className="absolute right-24 -bottom-24 w-56 h-56 rounded-full bg-white/5" />
        <div className="relative grid gap-6 lg:grid-cols-[auto,1fr,auto] items-center">
          <div className="flex items-center gap-5">
            <ScoreRing score={team.score} size={138} stroke={11} caption="team score" dark />
            <div>
              <p className="text-[11px] uppercase tracking-widest text-white/60 font-semibold">{data.period.label}</p>
              <p className="text-xl font-extrabold leading-tight">{data.period.range}</p>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                {team.grade ? (
                  <span className="bg-white text-[#9b2423] text-xs font-bold px-3 py-1 rounded-full">{team.grade.label}</span>
                ) : (
                  <span className="text-xs text-white/70">No scored tasks yet</span>
                )}
              </div>
              <div className="mt-2">
                <Delta value={team.delta} vs={data.period.prev.label} dark />
              </div>
            </div>
          </div>

          <div className="space-y-2.5 lg:px-4 min-w-0">
            {parts.map(({ key, label }) => (
              <PartBar key={key} label={label} weight={weights[key]} value={team.parts[key]} dark />
            ))}
          </div>

          <div className="grid grid-cols-2 gap-2 lg:w-72">
            <HeroStat icon={ClipboardCheck} value={`${team.scored}/${team.tasks}`} label="Scored"
              sub={
                [team.pending && `${team.pending} pending`, team.before && `${team.before} before ${fmtDay(data.ratingFrom)}`]
                  .filter(Boolean)
                  .join(" · ") || "all scored"
              }
            />
            <HeroStat icon={Clock} value={pctText(team.onTimePct)} label="On time" sub={team.late ? `${team.late} late` : "none late"} />
            <HeroStat icon={RotateCcw} value={pctText(team.firstPassPct)} label="1st pass" sub={`${team.sentBack} sent back`} />
            <HeroStat
              icon={Star}
              value={data.toRate.length}
              label="To rate"
              sub={`${data.awaitingApproval.length} awaiting approval`}
              onClick={() => scrollTo("sc-queue")}
              highlight={data.toRate.length > 0}
            />
          </div>
        </div>
      </div>

      {/* People */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Trophy size={17} className="text-[#9b2423]" /> Team members
          </h2>
          {person && (
            <button onClick={() => setPerson("")} className="text-xs text-gray-500 hover:text-[#9b2423]">
              Show everyone
            </button>
          )}
        </div>
        {data.people.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center text-gray-400 text-sm shadow-sm">
            No work was completed in this period.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.people.map((p) => {
              const key = p.id || p.name;
              return (
                <PersonCard
                  key={key}
                  p={p}
                  parts={parts}
                  weights={weights}
                  active={person === key}
                  onSelect={() => {
                    setPerson(person === key ? "" : key);
                    scrollTo("sc-tasks");
                  }}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Waiting for a rating */}
      <div id="sc-queue" className="bg-white rounded-3xl shadow-sm p-5 scroll-mt-4">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Star size={17} className="text-amber-500 fill-amber-400" /> Waiting for you
            <span className="bg-[#9b2423] text-white text-xs font-bold px-2 py-0.5 rounded-full">{data.toRate.length}</span>
          </h2>
          {data.awaitingApproval.length > 0 && (
            <Link to="/pending-approvals" className="text-xs font-semibold text-[#9b2423] hover:underline">
              {data.awaitingApproval.length} waiting for approval → approve & rate
            </Link>
          )}
        </div>
        {data.toRate.length === 0 ? (
          <p className="text-sm text-emerald-700 bg-emerald-50 rounded-2xl px-4 py-3">Everything completed is rated and scored. 🎉</p>
        ) : (
          <>
            <div className="grid gap-2 md:grid-cols-2">
              {queue.map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-2xl border border-gray-100 px-4 py-3 hover:border-[#9b2423]/30 transition">
                  <span className={`w-8 h-8 rounded-full text-[11px] font-bold flex items-center justify-center flex-shrink-0 ${avatarOf(t.person)}`}>
                    {initials(t.person)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/tickets/${t.id}`} className="text-sm font-semibold text-gray-900 hover:text-[#9b2423] line-clamp-1">
                      {t.title}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[11px] text-gray-400">
                        {t.person} · {fmtDay(t.submittedOn)}
                      </span>
                      <LateChip t={t} />
                      {t.pending.map((p) => (
                        <span key={p} className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          {p.toUpperCase()}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    onClick={() => setRating(t.id)}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-[#9b2423] hover:bg-[#7f1d1c] flex items-center gap-1 flex-shrink-0"
                  >
                    <Star size={12} /> {t.pending.includes("Not rated") ? "Rate" : "Complete"}
                  </button>
                </div>
              ))}
            </div>
            {data.toRate.length > 6 && (
              <button onClick={() => setShowAllQueue((v) => !v)} className="mt-3 text-xs font-semibold text-gray-500 hover:text-[#9b2423]">
                {showAllQueue ? "Show fewer" : `Show all ${data.toRate.length}`}
              </button>
            )}
          </>
        )}
      </div>

      {/* Tasks */}
      <div id="sc-tasks" className="bg-white rounded-3xl shadow-sm overflow-hidden scroll-mt-4">
        <div className="px-5 pt-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck size={17} className="text-[#9b2423]" /> Task scores
            {person && <span className="text-xs font-semibold text-gray-500">· {data.people.find((p) => (p.id || p.name) === person)?.name}</span>}
          </h2>
          <div className="bg-[#faf6f0] rounded-xl p-1 flex">
            {[
              ["all", "All"],
              ["final", "Scored"],
              ["pending", "Pending"],
              ["before", `Before ${fmtDay(data.ratingFrom)}`],
              ["excluded", "Left out"],
            ]
              .filter(([k]) => k !== "before" || counts.before > 0)
              .map(([k, l]) => (
              <button
                key={k}
                onClick={() => setState(k)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold ${state === k ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
              >
                {l} <span className="text-gray-400">{counts[k]}</span>
              </button>
              ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-y border-gray-50">
                <th className="w-8" />
                <th className="text-left font-semibold px-3 py-2.5">Task</th>
                <th className="text-left font-semibold px-3 py-2.5">Person</th>
                <th className="text-left font-semibold px-3 py-2.5">Submitted</th>
                <th className="text-left font-semibold px-3 py-2.5">On time</th>
                <th className="text-center font-semibold px-3 py-2.5">Sent back</th>
                <th className="text-left font-semibold px-3 py-2.5">Accuracy</th>
                <th className="text-left font-semibold px-3 py-2.5">Quality</th>
                <th className="text-left font-semibold px-3 py-2.5">Time</th>
                <th className="text-center font-semibold px-3 py-2.5">Score</th>
                <th className="w-16" />
              </tr>
            </thead>
            <tbody>
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center text-gray-400 py-10 text-sm">
                    Nothing here for this period.
                  </td>
                </tr>
              )}
              {tasks.map((t) => (
                <Fragment key={t.id}>
                  <tr
                    className={`border-b border-gray-50 hover:bg-[#fdfaf6] cursor-pointer ${t.state === "excluded" ? "opacity-50" : ""}`}
                    onClick={() => setOpen(open === t.id ? null : t.id)}
                  >
                    <td className="pl-4 text-gray-300">{open === t.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</td>
                    <td className="px-3 py-3 max-w-[280px]">
                      <Link to={`/tickets/${t.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-gray-900 hover:text-[#9b2423] line-clamp-1">
                        {t.title}
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">{t.person}</td>
                    <td className="px-3 py-3 text-xs text-gray-600 whitespace-nowrap">
                      {fmtDay(t.submittedOn)}
                      {Object.values(t.edited || {}).some(Boolean) && (
                        <span className="ml-1 text-sky-600" title="You corrected an automatic value">●</span>
                      )}
                    </td>
                    <td className="px-3 py-3"><LateChip t={t} /></td>
                    <td className="px-3 py-3 text-center text-xs font-semibold">
                      {t.corrections ? <span className="text-orange-600">{t.corrections}</span> : <span className="text-gray-300">0</span>}
                    </td>
                    <td className="px-3 py-3"><StarsShown value={t.stars.accuracy} /></td>
                    <td className="px-3 py-3"><StarsShown value={t.stars.quality} /></td>
                    <td className="px-3 py-3"><TimeChip t={t} /></td>
                    <td className="px-3 py-3 text-center">
                      {t.state === "final" ? (
                        <ScorePill score={t.score} />
                      ) : t.state === "excluded" ? (
                        <span className="text-[10px] font-semibold text-gray-400">Left out</span>
                      ) : t.state === "before" ? (
                        <span
                          className="text-[10px] font-semibold text-gray-500 bg-gray-100 px-2 py-1 rounded-full whitespace-nowrap"
                          title={`Rating covers work completed from ${fmtDay(data.ratingFrom)}`}
                        >
                          Before {fmtDay(data.ratingFrom)}
                        </span>
                      ) : (
                        <PendingBadge reasons={t.pending} />
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {t.rateable && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setRating(t.id);
                          }}
                          className="text-xs font-bold text-[#9b2423] hover:underline whitespace-nowrap"
                        >
                          {t.stars.accuracy ? "Edit" : "Rate"}
                        </button>
                      )}
                    </td>
                  </tr>
                  {open === t.id && (
                    <tr className="bg-[#fdfaf6] border-b border-gray-100">
                      <td />
                      <td colSpan={10} className="px-3 py-4">
                        <div className="grid gap-4 md:grid-cols-[1fr,auto]">
                          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2">
                            {parts.map(({ key, label }) => (
                              <div key={key} className="bg-white rounded-2xl p-3 shadow-sm">
                                <p className="text-[11px] text-gray-500">
                                  {label} <span className="text-gray-400">· {weights[key]}%</span>
                                </p>
                                <p className="text-lg font-extrabold text-gray-900 mt-0.5">{fmtScore(t.parts[key])}</p>
                                <p className="text-[11px] text-gray-400">
                                  {t.contributions[key] == null ? "pending" : `contributes ${fmtScore(t.contributions[key])} pts`}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs text-gray-500 space-y-1 md:w-64">
                            <p>
                              Due {fmtDay(t.finalDue)}
                              {t.originalDue && t.originalDue !== t.finalDue && <> · first due {fmtDay(t.originalDue)} ({t.dueChanges.length} move{t.dueChanges.length > 1 ? "s" : ""})</>}
                            </p>
                            <p>Completed {fmtDay(t.submittedOn)} · accepted {fmtDay(t.acceptedOn)}{t.acceptedBy ? ` by ${t.acceptedBy}` : ""}</p>
                            <p>Time taken {fmtMins(t.spent)} of {fmtMins(t.allotted)} allowed</p>
                            {Object.values(t.edited || {}).some(Boolean) && (
                              <p className="text-sky-700">
                                Corrected:{" "}
                                {[
                                  t.edited.submittedOn && `completed date (was ${fmtDay(t.auto.submittedOn)})`,
                                  t.edited.corrections && `times sent back (was ${t.auto.corrections})`,
                                  t.edited.spent && `time taken (was ${fmtMins(t.auto.spent)})`,
                                  t.edited.allotted && `time allowed (was ${fmtMins(t.auto.allotted)})`,
                                ]
                                  .filter(Boolean)
                                  .join(", ")}
                              </p>
                            )}
                            {t.sentBack.map((b, i) => (
                              <p key={i} className={b.scopeChange ? "text-sky-700" : "text-orange-700"}>
                                {b.scopeChange ? "Scope change" : "Sent back"} {fmtDay(b.on)}{b.reason ? `: ${b.reason}` : ""}
                              </p>
                            ))}
                            {t.remarks && <p className="text-gray-700 italic">"{t.remarks}"</p>}
                            {t.ratedBy && <p className="text-gray-400">Rated by {t.ratedBy}</p>}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* How it works */}
      <div className="bg-white/70 rounded-3xl p-5 text-xs text-gray-500 leading-relaxed flex gap-3">
        <Info size={16} className="text-[#9b2423] flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-gray-700 mb-1">How a task is scored</p>
          <p>
            On time {weights.onTime}% (by the due date 100 · 1–2 days late 75 · 3–5 days 50 · later 0, using the day the accepted work was
            submitted, so waiting for approval never counts) · First-time pass {weights.firstPass}% (100 · sent back once 50 · twice or more 0;
            scope changes don't count) · Accuracy {weights.accuracy}% and Quality {weights.quality}% (your stars ÷ 5 × 100) · Within time
            allowed {weights.withinTime}% (time logged within the time allotted 100 · up to ¼ over 75 · up to ½ over 50 · more 0; no time
            allowed or none logged = full marks). You can correct the completed date, times sent back, time taken and time allowed on any
            task. A task without a due date, an approval or both ratings stays pending — never zero. Monthly activity buckets (MISC, MEETINGS…) are left out unless you
            include them. You rate work completed from {fmtDay(data.ratingFrom)}; earlier work shows its automatic results only.
          </p>
        </div>
      </div>

      {rating && <RatingDialog ticketId={rating} mode="rate" onClose={() => setRating(null)} onDone={load} />}
      {preview && <EmailPreview kind={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}
