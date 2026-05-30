// Director KPI Card (unchanged)
import { fmt } from "../../utils/googleAdsMetrics";

const ACCENT = {
  blue:   { ring: "ring-blue-500/20",   text: "text-blue-400",   glow: "from-blue-900/30",   dot: "bg-blue-500"   },
  violet: { ring: "ring-violet-500/20", text: "text-violet-400", glow: "from-violet-900/30", dot: "bg-violet-500" },
  indigo: { ring: "ring-indigo-500/20", text: "text-indigo-400", glow: "from-indigo-900/30", dot: "bg-indigo-500" },
  emerald:{ ring: "ring-emerald-500/20",text: "text-emerald-400",glow: "from-emerald-900/30",dot: "bg-emerald-500"},
  cyan:   { ring: "ring-cyan-500/20",   text: "text-cyan-400",   glow: "from-cyan-900/30",   dot: "bg-cyan-500"   },
  amber:  { ring: "ring-amber-500/20",  text: "text-amber-400",  glow: "from-amber-900/30",  dot: "bg-amber-500"  },
  red:    { ring: "ring-red-500/20",    text: "text-red-400",    glow: "from-red-900/30",    dot: "bg-red-500"    },
  rose:   { ring: "ring-rose-500/20",   text: "text-rose-400",   glow: "from-rose-900/30",   dot: "bg-rose-500"   },
};

function DirectorKPI({ label, value, subValue, accent = "blue", delta, className = "" }) {
  const a = ACCENT[accent];
  return (
    <div className={`relative bg-[#0c1425] border border-slate-800/80 rounded-2xl p-4 ring-1 ${a.ring} overflow-hidden flex flex-col gap-1 ${className}`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${a.glow} to-transparent opacity-60 pointer-events-none`} />
      <span className="relative text-[10px] font-semibold text-slate-500 uppercase tracking-widest leading-none">{label}</span>
      <span className={`relative text-2xl font-black leading-tight ${a.text}`}>{value}</span>
      <div className="relative flex items-center justify-between mt-0.5">
        {subValue && <span className="text-[11px] text-slate-600">{subValue}</span>}
        {delta !== undefined && (
          <span className={`text-[11px] font-semibold ${delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
export default DirectorKPI;