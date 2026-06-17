import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
  Cell,
  ZAxis,
} from "recharts";

const CTR_BENCH = 2;
const CVR_BENCH = 5;

const QUADRANTS = [
  { id: "star",    color: "#10B981", label: "Scale",           icon: "★", cond: (d) => d.ctr >= CTR_BENCH && d.cvr >= CVR_BENCH },
  { id: "landing", color: "#F59E0B", label: "Fix Landing",     icon: "↻", cond: (d) => d.ctr >= CTR_BENCH && d.cvr < CVR_BENCH },
  { id: "traffic", color: "#38BDF8", label: "Boost Traffic",   icon: "↑", cond: (d) => d.ctr < CTR_BENCH && d.cvr >= CVR_BENCH },
  { id: "pause",   color: "#9B2423", label: "Pause / Review",  icon: "⏸", cond: (d) => d.ctr < CTR_BENCH && d.cvr < CVR_BENCH },
];

function getQ(d) { return QUADRANTS.find((q) => q.cond(d)) || QUADRANTS[3]; }

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const q = getQ(d);
  return (
    <div
      className="rounded-xl p-3 text-xs shadow-2xl min-w-[210px]"
      style={{ background: "#111", border: `1px solid ${q.color}55`, color: "#CCC", lineHeight: 1.6 }}
    >
      <div className="font-bold mb-1 truncate" style={{ color: "#F3ECE0", maxWidth: 200 }}>{d.keyword}</div>
      <div className="text-[10px] mb-2 truncate" style={{ color: "#555" }}>{d.campaign} · {d.match_type}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 mb-2">
        <span style={{ color: "#666" }}>CTR</span>
        <span style={{ color: "#A78BFA", fontWeight: 700 }}>{d.ctr.toFixed(2)}%</span>
        <span style={{ color: "#666" }}>CVR</span>
        <span style={{ color: "#38BDF8", fontWeight: 700 }}>{d.cvr.toFixed(2)}%</span>
        <span style={{ color: "#666" }}>Clicks</span>
        <span style={{ color: "#F3ECE0" }}>{Number(d.clicks).toLocaleString()}</span>
        <span style={{ color: "#666" }}>Conversions</span>
        <span style={{ color: "#10B981" }}>{Number(d.conversions).toFixed(1)}</span>
        <span style={{ color: "#666" }}>Spend</span>
        <span style={{ color: "#F59E0B" }}>₹{Number(d.cost).toLocaleString()}</span>
      </div>
      <div className="rounded-lg px-2 py-1.5" style={{ background: `${q.color}18`, border: `1px solid ${q.color}44` }}>
        <span className="font-black text-[10px]" style={{ color: q.color }}>{q.icon} {q.label}</span>
      </div>
    </div>
  );
}

const MATCH_COLORS = { EXACT: "#10B981", PHRASE: "#A78BFA", BROAD: "#F59E0B" };

export default function KeywordQuadrant({ keywords = [] }) {
  const data = useMemo(() => {
    const map = new Map();
    keywords.forEach((k) => {
      const key = `${k.keyword}||${k.match_type}`;
      if (!map.has(key)) map.set(key, { ...k, clicks: 0, impressions: 0, cost: 0, conversions: 0 });
      const agg = map.get(key);
      agg.clicks      += Number(k.clicks || 0);
      agg.impressions += Number(k.impressions || 0);
      agg.cost        += Number(k.cost || 0);
      agg.conversions += Number(k.conversions || 0);
    });
    return Array.from(map.values())
      .filter((k) => k.clicks > 0)
      .map((k) => ({
        ...k,
        ctr: k.impressions > 0 ? (k.clicks / k.impressions) * 100 : 0,
        cvr: k.clicks > 0 ? (k.conversions / k.clicks) * 100 : 0,
        size: Math.max(40, Math.min(300, k.cost / 10)),
      }));
  }, [keywords]);

  const counts = QUADRANTS.map((q) => ({ ...q, n: data.filter(q.cond).length }));

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#9B2423" }}>
            Keyword CTR vs CVR Quadrant
          </span>
          <p className="text-[10px] mt-0.5" style={{ color: "#444" }}>
            Dot size = spend · Colour = match type · Benchmarks: CTR ≥ {CTR_BENCH}% · CVR ≥ {CVR_BENCH}%
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {counts.map((q) => (
            <span
              key={q.id}
              className="text-[9px] font-black px-2 py-0.5 rounded-full"
              style={{ background: `${q.color}18`, border: `1px solid ${q.color}44`, color: q.color }}
            >
              {q.icon} {q.n}
            </span>
          ))}
        </div>
      </div>

      {/* Match type legend — this is what the dot COLOURS actually represent */}
      <div className="flex items-center gap-4 mb-3 flex-wrap">
        <span className="text-[10px]" style={{ color: "#444" }}>Dot colour:</span>
        {Object.entries(MATCH_COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
            <span className="text-[10px]" style={{ color: "#666" }}>{type}</span>
          </div>
        ))}
        <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: "#888" }} />
        <span className="text-[10px]" style={{ color: "#666" }}>OTHER</span>
      </div>

      <div className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 0 }}>
            <CartesianGrid stroke="#1A1A1A" strokeDasharray="3 3" />
            <XAxis
              dataKey="ctr"
              name="CTR"
              unit="%"
              type="number"
              stroke="#333"
              tick={{ fill: "#555", fontSize: 10 }}
              label={{ value: "CTR (%)", position: "insideBottom", offset: -10, fill: "#555", fontSize: 10 }}
            />
            <YAxis
              dataKey="cvr"
              name="CVR"
              unit="%"
              type="number"
              stroke="#333"
              tick={{ fill: "#555", fontSize: 10 }}
              label={{ value: "CVR (%)", angle: -90, position: "insideLeft", offset: 10, fill: "#555", fontSize: 10 }}
            />
            <ZAxis dataKey="size" range={[40, 300]} />
            <ReferenceLine x={CTR_BENCH} stroke="#2A2A2A" strokeDasharray="4 4"
              label={{ value: `CTR ${CTR_BENCH}%`, position: "top", fill: "#444", fontSize: 9 }} />
            <ReferenceLine y={CVR_BENCH} stroke="#2A2A2A" strokeDasharray="4 4"
              label={{ value: `CVR ${CVR_BENCH}%`, position: "right", fill: "#444", fontSize: 9 }} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#333" }} />
            <Scatter data={data}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={MATCH_COLORS[d.match_type?.toUpperCase()] || "#888"}
                  fillOpacity={0.8}
                />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Quadrant zones — about POSITION in the chart, not dot colour */}
      <div className="mt-4">
        <p className="text-[9px] mb-1.5" style={{ color: "#333" }}>QUADRANT ZONES (position, not colour)</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUADRANTS.map((q) => (
            <div key={q.id} className="rounded-lg px-3 py-2" style={{ background: `${q.color}10`, border: `1px solid ${q.color}30` }}>
              <div className="text-[10px] font-bold" style={{ color: q.color }}>{q.icon} {q.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
