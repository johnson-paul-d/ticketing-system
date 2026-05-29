import { useMemo } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ZAxis,
  Cell,
  ReferenceLine,
} from "recharts";

const USD_TO_INR = 1;

const fmt = {
  currency: (v) => {
    const inr = v * USD_TO_INR;
    if (inr >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(2)}Cr`;
    if (inr >= 100_000) return `₹${(inr / 100_000).toFixed(2)}L`;
    if (inr >= 1_000) return `₹${(inr / 1_000).toFixed(1)}K`;
    return `₹${inr.toFixed(2)}`;
  },
  pct: (v) => `${v.toFixed(2)}%`,
  num: (v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : Number(v).toLocaleString()),
};

const getEfficiencyScore = (cpc, ctr, cvr) => {
  if (!cpc || cpc <= 0) return 0;
  return (ctr * cvr) / cpc;
};

const getEfficiencyColor = (score) => {
  if (score >= 50) return "#10b981";
  if (score >= 20) return "#3b82f6";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
};

export default function CampaignEfficiencyMatrix({ campaigns }) {
  const chartData = useMemo(() => {
    if (!campaigns || campaigns.length === 0) return [];

    // Filter campaigns with at least some activity
    const activeCampaigns = campaigns.filter((c) => (c.impressions || 0) > 0 || (c.clicks || 0) > 0 || (c.cost || 0) > 0);

    return activeCampaigns.map((campaign) => {
      // Extract values – already in correct units
      const spend = Number(campaign.cost) || 0;
      const clicks = Number(campaign.clicks) || 0;
      const impressions = Number(campaign.impressions) || 0;
      const conversions = Number(campaign.conversions) || 0;

      // Derived metrics
      const cpc = clicks > 0 ? spend / clicks : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;      // already a percentage
      const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;           // already a percentage

      const efficiencyScore = getEfficiencyScore(cpc, ctr, cvr);
      const color = getEfficiencyColor(efficiencyScore);

      return {
        name: campaign.campaign,
        cpc,
        ctr,          // already correct (e.g., 5.2, not 520)
        cvr,
        spend,
        clicks,
        impressions,
        conversions,
        efficiencyScore,
        color,
        size: Math.min(Math.max(spend / 1000, 30), 200),
      };
    });
  }, [campaigns]);

  const maxCpc = Math.max(...chartData.map((d) => d.cpc), 50);
  const maxCtr = Math.max(...chartData.map((d) => d.ctr), 10);

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-[#0c1425] border border-slate-700 rounded-lg p-3 shadow-xl">
          <p className="text-white font-semibold text-sm mb-2 max-w-[200px] truncate">{data.name}</p>
          <div className="space-y-1 text-xs">
            <p className="text-slate-300">
              <span className="text-slate-500">CPC:</span> {fmt.currency(data.cpc)}
            </p>
            <p className="text-slate-300">
              <span className="text-slate-500">CTR:</span> {data.ctr.toFixed(2)}%
            </p>
            <p className="text-slate-300">
              <span className="text-slate-500">CVR:</span> {data.cvr.toFixed(2)}%
            </p>
            <p className="text-slate-300">
              <span className="text-slate-500">Spend:</span> {fmt.currency(data.spend)}
            </p>
            <p className="text-slate-300">
              <span className="text-slate-500">Conversions:</span> {data.conversions.toLocaleString()}
            </p>
            <div className="pt-1 mt-1 border-t border-slate-700">
              <p className="text-emerald-400 font-semibold">
                Efficiency: {data.efficiencyScore.toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  if (!chartData.length) {
    return (
      <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-6 text-center">
        <p className="text-slate-500">No campaign data available for efficiency matrix</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-4">
      <div className="mb-4">
        <h3 className="text-sm font-bold text-white">Campaign Efficiency Matrix</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          CPC vs CTR · Bubble size = spend · Color = efficiency score
        </p>
      </div>

      <div className="h-[500px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{ top: 20, right: 30, bottom: 20, left: 50 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              type="number"
              dataKey="cpc"
              name="CPC"
              unit="₹"
              domain={[0, maxCpc]}
              tickFormatter={(v) => fmt.currency(v)}
              label={{ value: "Cost Per Click (CPC)", position: "bottom", offset: 0, fill: "#64748b", fontSize: 11 }}
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="ctr"
              name="CTR"
              unit="%"
              domain={[0, maxCtr]}
              label={{ value: "Click-Through Rate (CTR)", angle: -90, position: "left", offset: 30, fill: "#64748b", fontSize: 11 }}
              stroke="#475569"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
            />
            <ZAxis type="number" dataKey="size" range={[40, 400]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            <ReferenceLine y={2} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "CTR 2%", fill: "#f59e0b", fontSize: 9 }} />
            <ReferenceLine y={5} stroke="#10b981" strokeDasharray="3 3" label={{ value: "CTR 5%", fill: "#10b981", fontSize: 9 }} />
            <ReferenceLine x={20} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: "₹20 CPC", fill: "#f59e0b", fontSize: 9 }} />
            <Scatter
              data={chartData}
              fill="#8884d8"
              shape="circle"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 mt-4 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500" />
          <span className="text-xs text-slate-400">Excellent (≥50)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span className="text-xs text-slate-400">Good (20-49)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-500" />
          <span className="text-xs text-slate-400">Moderate (5-19)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <span className="text-xs text-slate-400">Poor (&lt;5)</span>
        </div>
      </div>
    </div>
  );
}