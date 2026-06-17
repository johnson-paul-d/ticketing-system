import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const spend   = payload.find((p) => p.dataKey === "spendShare");
  const conv    = payload.find((p) => p.dataKey === "convShare");
  const raw     = spend?.payload;
  return (
    <div
      className="rounded-xl p-3 text-xs shadow-2xl min-w-[200px]"
      style={{ background: "#111", border: "1px solid #2A2A2A", color: "#CCC", lineHeight: 1.6 }}
    >
      <div className="font-bold mb-2" style={{ color: "#F3ECE0" }}>{raw?.fullName || label}</div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <span style={{ color: "#666" }}>Spend Share</span>
        <span style={{ color: "#3b82f6", fontWeight: 700 }}>{spend?.value?.toFixed(1)}%</span>
        <span style={{ color: "#666" }}>Spend (₹)</span>
        <span style={{ color: "#F3ECE0" }}>₹{Number(raw?.cost ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}</span>
        <span style={{ color: "#666" }}>Conv Share</span>
        <span style={{ color: "#10b981", fontWeight: 700 }}>{conv?.value?.toFixed(1)}%</span>
        <span style={{ color: "#666" }}>Conversions</span>
        <span style={{ color: "#F3ECE0" }}>{Number(raw?.conversions ?? 0).toFixed(2)}</span>
      </div>
      {raw && raw.spendShare > 0 && raw.convShare < raw.spendShare && (
        <div className="mt-2 text-[10px]" style={{ color: "#9B2423" }}>
          ⚠ Spend outpaces conversions
        </div>
      )}
    </div>
  );
}

export default function SpendVsConversionShare({ campaigns = [] }) {
  const data = useMemo(() => {
    // Always sort by cost descending so top spenders are shown
    const sorted = [...campaigns].sort((a, b) => b.cost - a.cost);
    const top = sorted.slice(0, 10);

    const totalSpend = campaigns.reduce((s, c) => s + c.cost, 0);
    const totalConv  = campaigns.reduce((s, c) => s + c.conversions, 0);

    return top.map((c) => ({
      campaign:   c.campaign.length > 15 ? `${c.campaign.slice(0, 15)}…` : c.campaign,
      fullName:   c.campaign,
      cost:       c.cost,
      conversions: c.conversions,
      spendShare: totalSpend > 0 ? Number(((c.cost / totalSpend) * 100).toFixed(2)) : 0,
      convShare:  totalConv  > 0 ? Number(((c.conversions / totalConv) * 100).toFixed(2)) : 0,
    }));
  }, [campaigns]);

  return (
    <div
      className="rounded-2xl p-5 border"
      style={{ background: "#111111", borderColor: "#1E1E1E" }}
    >
      <div className="mb-4">
        <span className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: "#9B2423" }}>
          Spend Share vs Conversion Share
        </span>
        <p className="text-[10px] mt-0.5" style={{ color: "#444" }}>
          Top 10 campaigns by spend · % of total portfolio spend &amp; conversions
        </p>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-10 text-xs" style={{ color: "#444" }}>
          No campaign data in the selected period.
        </div>
      ) : (
        <div className="h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid stroke="#1A1A1A" strokeDasharray="3 3" />
              <XAxis
                dataKey="campaign"
                stroke="#333"
                tick={{ fill: "#666", fontSize: 9 }}
                angle={-30}
                textAnchor="end"
                height={60}
                interval={0}
              />
              <YAxis
                stroke="#333"
                tick={{ fill: "#555", fontSize: 10 }}
                tickFormatter={(v) => `${v}%`}
                domain={[0, 100]}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <Legend
                wrapperStyle={{ fontSize: 10, color: "#666", paddingTop: 8 }}
              />
              <Bar dataKey="spendShare"  name="Spend %"      fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={24} />
              <Bar dataKey="convShare"   name="Conversion %"  fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={24} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
