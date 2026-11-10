// Small pieces shared by the quality scorecard: the score ring, star rating,
// grade pill, and the hook that says whether this person is the reviewer.
import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import api from "../../services/api";

export const TONES = {
  outstanding: { stroke: "#059669", text: "text-emerald-700", soft: "bg-emerald-50", bar: "bg-emerald-500" },
  strong: { stroke: "#0d9488", text: "text-teal-700", soft: "bg-teal-50", bar: "bg-teal-500" },
  fair: { stroke: "#d97706", text: "text-amber-700", soft: "bg-amber-50", bar: "bg-amber-500" },
  low: { stroke: "#dc2626", text: "text-red-700", soft: "bg-red-50", bar: "bg-red-500" },
  none: { stroke: "#d1d5db", text: "text-gray-500", soft: "bg-gray-100", bar: "bg-gray-300" },
};

// Same bands as the server (services/scorecard.js, grade).
export const gradeOf = (score) => {
  if (score == null) return null;
  if (score >= 90) return { label: "Outstanding", tone: "outstanding" };
  if (score >= 75) return { label: "Strong", tone: "strong" };
  if (score >= 60) return { label: "Fair", tone: "fair" };
  return { label: "Needs attention", tone: "low" };
};

export const toneOf = (grade) => TONES[grade?.tone] || TONES.none;

export const fmtScore = (v) => (v == null ? "—" : Number.isInteger(v) ? String(v) : v.toFixed(1));

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDay = (d) => (d ? `${Number(d.slice(8, 10))} ${MONTHS[Number(d.slice(5, 7)) - 1]}` : "—");

export const STAR_LABELS = ["", "Poor", "Below expectations", "Acceptable", "Good", "Excellent"];

export function ScoreRing({ score, grade, size = 72, stroke = 7, caption, dark = false }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = score == null ? 0 : Math.max(0, Math.min(100, score));
  const tone = toneOf(grade || gradeOf(score));
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "rgba(255,255,255,.18)" : "#f1ece4"} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={dark ? "#ffffff" : tone.stroke}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          style={{ transition: "stroke-dashoffset .9s cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className={`font-extrabold ${dark ? "text-white" : "text-gray-900"}`} style={{ fontSize: size * 0.3 }}>
          {fmtScore(score)}
        </span>
        {caption && (
          <span className={`mt-1 ${dark ? "text-white/70" : "text-gray-400"}`} style={{ fontSize: Math.max(9, size * 0.1) }}>
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

export function GradePill({ grade, className = "" }) {
  if (!grade) return null;
  const t = toneOf(grade);
  return (
    <span className={`inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full ${t.soft} ${t.text} ${className}`}>
      {grade.label}
    </span>
  );
}

export function ScorePill({ score }) {
  const t = toneOf(gradeOf(score));
  return (
    <span className={`inline-flex min-w-[46px] justify-center text-xs font-extrabold px-2.5 py-1 rounded-full ${t.soft} ${t.text}`}>
      {fmtScore(score)}
    </span>
  );
}

// Read-only stars, for tables.
export function StarsShown({ value, size = 13 }) {
  if (value == null) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5" title={`${value} of 5 · ${STAR_LABELS[value] || ""}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= value ? "fill-amber-400 text-amber-400" : "text-gray-200"} />
      ))}
    </span>
  );
}

// Pick 1–5; clicking the chosen star again clears it.
export function StarPicker({ value, onChange, disabled }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value || 0;
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(value === n ? null : n)}
            className="p-0.5 transition-transform hover:scale-110 disabled:opacity-40"
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
          >
            <Star size={26} className={n <= shown ? "fill-amber-400 text-amber-400" : "text-gray-300"} />
          </button>
        ))}
      </div>
      <span className="text-xs text-gray-500 w-32">{shown ? STAR_LABELS[shown] : "Not rated"}</span>
    </div>
  );
}

// Whether the signed-in person is the scorecard reviewer. Asked once per page
// load; the server is what actually enforces it.
let accessPromise = null;
export function useScorecardAccess() {
  const [reviewer, setReviewer] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!accessPromise) {
      accessPromise = api
        .get("/scorecard/access")
        .then((r) => Boolean(r.data?.reviewer))
        .catch(() => {
          accessPromise = null;
          return false;
        });
    }
    accessPromise.then((v) => alive && setReviewer(v));
    return () => {
      alive = false;
    };
  }, []);
  return reviewer;
}

// A different user may sign in without a page reload.
export const resetScorecardAccess = () => {
  accessPromise = null;
};
