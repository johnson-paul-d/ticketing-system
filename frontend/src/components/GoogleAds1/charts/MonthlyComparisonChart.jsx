// MonthlyComparisonChart.tsx
import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { fmt } from "../../utils/googleAdsMetrics";

interface TrendRow {
  report_date: string;
  cost: number;
  conversions: number;
  clicks: number;
  impressions: number;
}

interface MonthlyComparisonChartProps {
  trends: TrendRow[];
}

const MonthlyComparisonChart: React.FC<MonthlyComparisonChartProps> = ({ trends }) => {
  const chartData = useMemo(() => {
    if (!trends || trends.length === 0) return [];

    // Determine date range from trends
    const dates = trends.map(t => new Date(t.report_date)).sort((a, b) => a.getTime() - b.getTime());
    const latestDate = dates[dates.length - 1];
    const oldestDate = dates[0];

    // Define current period (last 30 days up to latest date)
    const currentStart = new Date(latestDate);
    currentStart.setDate(latestDate.getDate() - 29); // 30 days inclusive
    const currentPeriodTrends = trends.filter(t => {
      const d = new Date(t.report_date);
      return d >= currentStart && d <= latestDate;
    });

    // Previous period: same length, ending one day before current period start
    const prevEnd = new Date(currentStart);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevEnd.getDate() - 29);
    const prevPeriodTrends = trends.filter(t => {
      const d = new Date(t.report_date);
      return d >= prevStart && d <= prevEnd;
    });

    const aggregate = (periodTrends: TrendRow[]) => {
      let cost = 0, conversions = 0, clicks = 0, impressions = 0;
      periodTrends.forEach(t => {
        cost += t.cost || 0;
        conversions += t.conversions || 0;
        clicks += t.clicks || 0;
        impressions += t.impressions || 0;
      });
      const cpa = conversions > 0 ? cost / conversions : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
      return { cost, conversions, clicks, impressions, cpa, ctr, cvr };
    };

    const current = aggregate(currentPeriodTrends);
    const previous = aggregate(prevPeriodTrends);

    // Build data for bar chart: metrics to compare
    const metrics = [
      { name: "Spend (₹)", current: current.cost, previous: previous.cost, format: "currency" },
      { name: "Conversions", current: current.conversions, previous: previous.conversions, format: "number" },
      { name: "CPA (₹)", current: current.cpa, previous: previous.cpa, format: "currency" },
      { name: "CTR (%)", current: current.ctr, previous: previous.ctr, format: "percent" },
      { name: "CVR (%)", current: current.cvr, previous: previous.cvr, format: "percent" },
    ];

    return metrics.map(m => ({
      metric: m.name,
      Current: m.current,
      Previous: m.previous,
      change: m.current - m.previous,
      changePercent: m.previous !== 0 ? ((m.current - m.previous) / m.previous) * 100 : (m.current > 0 ? 100 : 0),
      format: m.format,
    }));
  }, [trends]);

  if (!chartData.length) {
    return (
      <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5 flex items-center justify-center h-80">
        <p className="text-slate-500">No trend data available for comparison</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-white mb-4">Monthly Comparison (Current vs Previous Period)</h3>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
          layout="vertical"
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis type="number" tick={{ fill: "#94a3b8" }} />
          <YAxis dataKey="metric" type="category" tick={{ fill: "#94a3b8" }} width={100} />
          <Tooltip
            formatter={(value: number, name: string, item: any) => {
              const format = item.payload.format;
              if (format === "currency") return [`₹${value.toLocaleString("en-IN")}`, name];
              if (format === "percent") return [`${value.toFixed(2)}%`, name];
              return [value.toLocaleString(), name];
            }}
            contentStyle={{ backgroundColor: "#0f172a", borderColor: "#334155", color: "#fff" }}
          />
          <Legend />
          <Bar dataKey="Current" fill="#3b82f6" radius={[0, 4, 4, 0]} />
          <Bar dataKey="Previous" fill="#64748b" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-3 text-xs text-slate-500 text-center">
        Based on {trends.length} daily records. Current period = last 30 days, Previous = prior 30 days.
      </div>
    </div>
  );
};

export default MonthlyComparisonChart;