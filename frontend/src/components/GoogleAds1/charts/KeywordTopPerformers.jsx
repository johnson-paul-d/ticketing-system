import { useState, useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from "recharts";

const METRICS = [
  { key: "conversions",      label: "Conversions",   color: "#10B981", format: (v) => v.toFixed(1) },
  { key: "clicks",           label: "Clicks",        color: "#9B2423", format: (v) => v.toLocaleString() },
  { key: "cost",             label: "Spend (₹)",     color: "#F59E0B", format: (v) => `₹${v.toLocaleString()}` },
  { key: "conversion_rate",  label: "CVR (%)",        color: "#38BDF8", format: (v) => `${v.toFixed(2)}%` },
  { key: "ctr",              label: "CTR (%)",        color: "#A78BFA", format: (v) => `${v.toFixed(2)}%` },
];

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div
      className="rounded-xl p-3 text-xs shadow-2xl min-w-[220px]"
      style={{ background: "#111", border: "1px solid #2A2A2A", color: "#CCC", lineHeight: 1.6 }}
    >
      <div className="font-bold mb-2" style={{ color: "#F3ECE0" }}>{d.keyword}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span style={{ color: "#666" }}>Campaign</span>
        <span className="truncate" style={{ color: "#AAA", maxWidth: 120 }}>{d.campaign}</span>
        <span style={{ color: "#666" }}>Match Type</span>
        <span style={{ color: "#AAA" }}>{d.match_type}</span>
        <span style={{ color: "#666" }}>Clicks</span>
        <span style={{ color: "#F3ECE0" }}>{Number(d.clicks).toLocaleString()}</span>
        <span style={{ color: "#666" }}>Impressions</span>
        <span style={{ color: "#F3ECE0" }}>{Number(d.impressions).toLocaleString()}</span>
        <span style={{ color: "#666" }}>CTR</span>
        <span style={{ color: "#A78BFA" }}>{Number(d.ctr).toFixed(2)}%</span>
        <span style={{ color: "#666" }}>CVR</span>
        <span style={{ color: "#38BDF8" }}>{Number(d.conversion_rate).toFixed(2)}%</span>
        <span style={{ color: "#666" }}>Conversions</span>
        <span style={{ color: "#10B981", fontWeight: 700 }}>{Number(d.conversions).toFixed(1)}</span>
        <span style={{ color: "#666" }}>Spend</span>
        <span style={{ color: "#F59E0B" }}>₹{Number(d.cost).toLocaleString()}</span>
        <span style={{ color: "#666" }}>CPA</span>
        <span style={{ color: "#F3ECE0" }}>
          {d.conversions > 0 ? `₹${(d.cost / d.conversions).toFixed(0)}` : "—"}
        </span>
      </div>
    </div>
  );
}

export default function KeywordTopPerformers({ keywords = [] }) {
  const [metric, setMetric] = useState("conversions");
  const [limit, setLimit] = useState(15);

  const activeMeta = METRICS.find((m) => m.key === metric) || METRICS[0];

  const aggregated = useMemo(() => {
    const map = new Map();
    keywords.forEach((k) => {
      const key = `${k.keyword}||${k.match_type}`;
      if (!map.has(key)) {
        map.set(key, { ...k, clicks: 0, impressions: 0, cost: 0, conversions: 0, _count: 0 });
      }
      const agg = map.get(key);
      agg.clicks      += Number(k.clicks || 0);
      agg.impressions += Number(k.impressions || 0);
      agg.cost        += Number(k.cost || 0);
      agg.conversions += Number(k.conversions || 0);
      agg._count++;
    });
    return Array.from(map.values()).map((k) => ({
      ...k,
      ctr: k.impressions > 0 ? (k.clicks / k.impressions) * 100 : 0,
      conversion_rate: k.clicks > 0 ? (k.conversions / k.clicks) * 100 : 0,
    }));
  }, [keywords]);

  const data = useMemo(() => {
    return [...aggregated]
      .sort((a, b) => Number(b[metric]) - Number(a[metric]))
      .slice(0, limit);
  }, [aggregated, metric, limit]);

  const MATCH_COLORS = { EXACT: "#10B981", PHRASE: "#A78BFA", BROAD: "#F59E0B", UNKNOWN: "#555" };

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#9B2423" }}>
            Top Keywords
          </span>
          <p className="text-[10px] mt-0.5" style={{ color: "#444" }}>
            Ranked by selected metric · {aggregated.length} unique keywords
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className="text-[10px] font-semibold px-3 py-1 rounded-lg border transition-all"
              style={
                metric === m.key
                  ? { background: m.color, color: "#000", borderColor: m.color }
                  : { background: "transparent", color: "#555", borderColor: "#2A2A2A" }
              }
            >
              {m.label}
            </button>
          ))}
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="text-[10px] rounded-lg px-2 py-1 outline-none border"
            style={{ background: "#1A1A1A", color: "#F3ECE0", borderColor: "#2A2A2A" }}
          >
            {[10, 15, 20].map((n) => <option key={n} value={n}>Top {n}</option>)}
          </select>
        </div>
      </div>

      <div className="h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 30, left: 8, bottom: 0 }}
          >
            <CartesianGrid stroke="#1A1A1A" strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              stroke="#333"
              tick={{ fill: "#555", fontSize: 10 }}
              tickFormatter={(v) => activeMeta.format(v).replace("₹", "").replace("%", "")}
            />
            <YAxis
              type="category"
              dataKey="keyword"
              width={130}
              stroke="#333"
              tick={{ fill: "#888", fontSize: 9 }}
              tickFormatter={(v) => (v?.length > 18 ? `${v.slice(0, 18)}…` : v)}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
            <Bar dataKey={metric} radius={[0, 6, 6, 0]} maxBarSize={18}>
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={MATCH_COLORS[d.match_type?.toUpperCase()] || activeMeta.color}
                  fillOpacity={0.9}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Match type legend */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {Object.entries(MATCH_COLORS).filter(([k]) => k !== "UNKNOWN").map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-[10px]" style={{ color: "#555" }}>{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
