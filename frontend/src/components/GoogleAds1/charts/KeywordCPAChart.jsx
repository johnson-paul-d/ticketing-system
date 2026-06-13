import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
} from "recharts";

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div
      className="rounded-xl p-3 text-xs shadow-2xl min-w-[200px]"
      style={{ background: "#111", border: "1px solid #2A2A2A", color: "#CCC", lineHeight: 1.6 }}
    >
      <div className="font-bold mb-2 truncate" style={{ color: "#F3ECE0" }}>{d.keyword}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span style={{ color: "#666" }}>Match Type</span>
        <span style={{ color: "#AAA" }}>{d.match_type}</span>
        <span style={{ color: "#666" }}>CPA</span>
        <span style={{ color: d.cpa > d.avgCPA ? "#9B2423" : "#10B981", fontWeight: 700 }}>
          ₹{d.cpa.toFixed(0)}
        </span>
        <span style={{ color: "#666" }}>Avg CPA</span>
        <span style={{ color: "#888" }}>₹{d.avgCPA?.toFixed(0)}</span>
        <span style={{ color: "#666" }}>Conversions</span>
        <span style={{ color: "#10B981" }}>{d.conversions.toFixed(1)}</span>
        <span style={{ color: "#666" }}>Spend</span>
        <span style={{ color: "#F59E0B" }}>₹{Number(d.cost).toLocaleString()}</span>
      </div>
      <div className="mt-2 text-[10px]" style={{ color: d.cpa > d.avgCPA ? "#9B2423" : "#10B981" }}>
        {d.cpa > d.avgCPA
          ? `⚠ ${((d.cpa / d.avgCPA - 1) * 100).toFixed(0)}% above avg — review bids`
          : `✓ ${((1 - d.cpa / d.avgCPA) * 100).toFixed(0)}% below avg — efficient`}
      </div>
    </div>
  );
}

export default function KeywordCPAChart({ keywords = [] }) {
  const { data, avgCPA } = useMemo(() => {
    const map = new Map();
    keywords.forEach((k) => {
      const key = `${k.keyword}||${k.match_type}`;
      if (!map.has(key)) map.set(key, { ...k, cost: 0, conversions: 0 });
      const agg = map.get(key);
      agg.cost        += Number(k.cost || 0);
      agg.conversions += Number(k.conversions || 0);
    });

    const withConv = Array.from(map.values()).filter((k) => k.conversions > 0);
    const totalCost = withConv.reduce((s, k) => s + k.cost, 0);
    const totalConv = withConv.reduce((s, k) => s + k.conversions, 0);
    const avg = totalConv > 0 ? totalCost / totalConv : 0;

    const ranked = withConv
      .map((k) => ({ ...k, cpa: k.cost / k.conversions, avgCPA: avg }))
      .sort((a, b) => a.cpa - b.cpa)
      .slice(0, 20);

    return { data: ranked, avgCPA: avg };
  }, [keywords]);

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      <div className="mb-4">
        <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#9B2423" }}>
          Keyword CPA Efficiency
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: "#444" }}>
          Top 20 converting keywords by cost-per-acquisition · dashed line = portfolio average
        </p>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 text-xs" style={{ color: "#444" }}>
          No keywords with conversions in the selected period.
        </div>
      ) : (
        <div className="h-[380px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout="vertical"
              margin={{ top: 0, right: 50, left: 8, bottom: 0 }}
            >
              <CartesianGrid stroke="#1A1A1A" strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                stroke="#333"
                tick={{ fill: "#555", fontSize: 10 }}
                tickFormatter={(v) => `₹${v.toLocaleString()}`}
              />
              <YAxis
                type="category"
                dataKey="keyword"
                width={130}
                stroke="#333"
                tick={{ fill: "#888", fontSize: 9 }}
                tickFormatter={(v) => (v?.length > 18 ? `${v.slice(0, 18)}…` : v)}
              />
              {avgCPA > 0 && (
                <ReferenceLine
                  x={avgCPA}
                  stroke="#F3ECE0"
                  strokeDasharray="4 4"
                  strokeOpacity={0.4}
                  label={{ value: `Avg ₹${avgCPA.toFixed(0)}`, position: "top", fill: "#888", fontSize: 9 }}
                />
              )}
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Bar dataKey="cpa" radius={[0, 6, 6, 0]} maxBarSize={16}>
                {data.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.cpa <= avgCPA ? "#10B981" : d.cpa <= avgCPA * 1.5 ? "#F59E0B" : "#9B2423"}
                    fillOpacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {[
          { color: "#10B981", label: "Below average CPA (efficient)" },
          { color: "#F59E0B", label: "Up to 1.5× avg CPA" },
          { color: "#9B2423", label: "Above 1.5× avg CPA (review)" },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
            <span className="text-[10px]" style={{ color: "#555" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
