import { useState } from "react";

const PRIORITY_META = {
  High:   { color: "#9B2423", bg: "rgba(155,36,35,0.15)", border: "rgba(155,36,35,0.35)", icon: "▲" },
  Medium: { color: "#F59E0B", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", icon: "●" },
  Low:    { color: "#555",    bg: "rgba(80,80,80,0.12)",   border: "rgba(80,80,80,0.25)",  icon: "▼" },
};

const ACTION_ICONS = {
  Scale:  "↑",
  Pause:  "⏸",
  Reduce: "↓",
  Fix:    "⚙",
  Review: "🔍",
};

function getActionIcon(text = "") {
  for (const [key, icon] of Object.entries(ACTION_ICONS)) {
    if (text.toLowerCase().includes(key.toLowerCase())) return icon;
  }
  return "→";
}

function InfoTooltip({ content }) {
  const [open, setOpen] = useState(false);
  if (!content) return null;
  return (
    <span className="relative inline-flex">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className="w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center border ml-1"
        style={{ background: "#1A1A1A", borderColor: "#333", color: "#888" }}
        aria-label="Why this recommendation"
      >
        i
      </button>
      {open && (
        <div
          className="absolute z-50 bottom-full left-0 mb-2 w-64 rounded-xl p-3 text-xs shadow-2xl"
          style={{ background: "#111", border: "1px solid #2A2A2A", color: "#CCC", lineHeight: 1.55 }}
        >
          {content}
          <div
            className="absolute top-full left-4 border-4 border-transparent"
            style={{ borderTopColor: "#2A2A2A" }}
          />
        </div>
      )}
    </span>
  );
}

function RecommendationCard({ rec, index }) {
  const priority = rec.priority || "Low";
  const meta = PRIORITY_META[priority] || PRIORITY_META.Low;
  const actionText = rec.text || rec.message || "";
  const campaign = rec.campaign || "";
  const why = rec.why || rec.reason || null;

  return (
    <div
      className="rounded-xl p-4 border flex gap-3 items-start transition-all"
      style={{ background: meta.bg, borderColor: meta.border }}
    >
      {/* index badge */}
      <div
        className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black mt-0.5"
        style={{ background: "#0D0D0D", color: meta.color, border: `1px solid ${meta.border}` }}
      >
        {index + 1}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          {/* action */}
          <div className="flex items-center gap-1.5">
            <span className="text-base" style={{ color: meta.color }}>
              {getActionIcon(actionText)}
            </span>
            <span
              className="text-xs font-semibold leading-snug"
              style={{ color: "#F3ECE0" }}
            >
              {actionText}
            </span>
            {why && (
              <InfoTooltip
                content={
                  <span>
                    <strong style={{ color: "#F3ECE0" }}>Why this recommendation?</strong>
                    <br /><br />
                    {why}
                  </span>
                }
              />
            )}
          </div>

          {/* priority badge */}
          <span
            className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full flex-shrink-0"
            style={{ background: "#0D0D0D", color: meta.color, border: `1px solid ${meta.border}` }}
          >
            {meta.icon} {priority}
          </span>
        </div>

        {campaign && (
          <div className="mt-1.5 text-[10px] font-medium truncate" style={{ color: "#666" }}>
            Campaign: <span style={{ color: "#888" }}>{campaign}</span>
          </div>
        )}

        {/* type tag */}
        {rec.type && (
          <div className="mt-1">
            <span
              className="text-[9px] px-2 py-0.5 rounded"
              style={{ background: "#111", color: "#555", border: "1px solid #1E1E1E" }}
            >
              {rec.type}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecommendationPanel({ recommendations }) {
  const recs = recommendations || [];

  const highCount = recs.filter((r) => r.priority === "High").length;
  const medCount  = recs.filter((r) => r.priority === "Medium").length;

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <span
            className="text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ color: "#9B2423" }}
          >
            Executive Recommendations
          </span>
          <p className="text-[10px] mt-0.5" style={{ color: "#444" }}>
            AI-driven actions to improve campaign performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          {highCount > 0 && (
            <span
              className="text-[9px] font-black px-2 py-1 rounded-full"
              style={{ background: "rgba(155,36,35,0.15)", color: "#9B2423", border: "1px solid rgba(155,36,35,0.3)" }}
            >
              {highCount} High Priority
            </span>
          )}
          {medCount > 0 && (
            <span
              className="text-[9px] font-black px-2 py-1 rounded-full"
              style={{ background: "rgba(245,158,11,0.12)", color: "#F59E0B", border: "1px solid rgba(245,158,11,0.25)" }}
            >
              {medCount} Medium
            </span>
          )}
        </div>
      </div>

      {recs.length === 0 ? (
        <div
          className="rounded-xl p-6 text-center text-xs"
          style={{ background: "#0D0D0D", color: "#555", border: "1px solid #1A1A1A" }}
        >
          No recommendations at this time. All campaigns are performing within acceptable thresholds.
        </div>
      ) : (
        <div className="space-y-3">
          {recs.map((r, i) => (
            <RecommendationCard key={i} rec={r} index={i} />
          ))}
        </div>
      )}

      {/* Legend */}
      {recs.length > 0 && (
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          {Object.entries(PRIORITY_META).map(([p, m]) => (
            <div key={p} className="flex items-center gap-1.5">
              <span className="text-[10px]" style={{ color: m.color }}>{m.icon}</span>
              <span className="text-[10px]" style={{ color: "#555" }}>{p}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
