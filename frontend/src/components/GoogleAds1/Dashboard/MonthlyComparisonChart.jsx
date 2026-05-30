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
} from "recharts";

const MonthlyComparisonChart = ({ trends = [] }) => {
  const chartData = useMemo(() => {
    if (!trends || trends.length === 0) return [];

    const dates = trends
      .map((t) => new Date(t.report_date))
      .sort((a, b) => a.getTime() - b.getTime());

    if (dates.length === 0) return [];

    const latestDate = dates[dates.length - 1];

    const currentStart = new Date(latestDate);
    currentStart.setDate(currentStart.getDate() - 29);

    const currentPeriodTrends = trends.filter((t) => {
      const d = new Date(t.report_date);
      return d >= currentStart && d <= latestDate;
    });

    const prevEnd = new Date(currentStart);
    prevEnd.setDate(prevEnd.getDate() - 1);

    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - 29);

    const prevPeriodTrends = trends.filter((t) => {
      const d = new Date(t.report_date);
      return d >= prevStart && d <= prevEnd;
    });

    const aggregate = (periodTrends) => {
      let cost = 0;
      let conversions = 0;
      let clicks = 0;
      let impressions = 0;

      periodTrends.forEach((t) => {
        cost += Number(t.cost || 0);
        conversions += Number(t.conversions || 0);
        clicks += Number(t.clicks || 0);
        impressions += Number(t.impressions || 0);
      });

      const cpa =
        conversions > 0
          ? cost / conversions
          : 0;

      const ctr =
        impressions > 0
          ? (clicks / impressions) * 100
          : 0;

      const cvr =
        clicks > 0
          ? (conversions / clicks) * 100
          : 0;

      return {
        cost,
        conversions,
        clicks,
        impressions,
        cpa,
        ctr,
        cvr,
      };
    };

    const current = aggregate(currentPeriodTrends);
    const previous = aggregate(prevPeriodTrends);

    return [
      {
        metric: "Spend",
        Current: current.cost,
        Previous: previous.cost,
        format: "currency",
      },
      {
        metric: "Conversions",
        Current: current.conversions,
        Previous: previous.conversions,
        format: "number",
      },
      {
        metric: "CPA",
        Current: current.cpa,
        Previous: previous.cpa,
        format: "currency",
      },
      {
        metric: "CTR",
        Current: current.ctr,
        Previous: previous.ctr,
        format: "percent",
      },
      {
        metric: "CVR",
        Current: current.cvr,
        Previous: previous.cvr,
        format: "percent",
      },
    ];
  }, [trends]);

  if (!chartData.length) {
    return (
      <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5 flex items-center justify-center h-[380px]">
        <p className="text-slate-500">
          No trend data available for comparison
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-white mb-4">
        Monthly Comparison
      </h3>

      <ResponsiveContainer width="100%" height={350}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{
            top: 20,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1e293b"
          />

          <XAxis
            type="number"
            tick={{ fill: "#94a3b8" }}
          />

          <YAxis
            dataKey="metric"
            type="category"
            width={100}
            tick={{ fill: "#94a3b8" }}
          />

          <Tooltip
            formatter={(value, name, item) => {
              const format = item.payload.format;

              if (format === "currency") {
                return [
                  `₹${Number(value).toLocaleString("en-IN")}`,
                  name,
                ];
              }

              if (format === "percent") {
                return [
                  `${Number(value).toFixed(2)}%`,
                  name,
                ];
              }

              return [
                Number(value).toLocaleString(),
                name,
              ];
            }}
            contentStyle={{
              backgroundColor: "#0f172a",
              borderColor: "#334155",
              color: "#fff",
            }}
          />

          <Legend />

          <Bar
            dataKey="Current"
            fill="#3b82f6"
            radius={[0, 4, 4, 0]}
          />

          <Bar
            dataKey="Previous"
            fill="#64748b"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

      <div className="mt-3 text-xs text-slate-500 text-center">
        Comparing latest 30-day period against the previous 30-day period
      </div>
    </div>
  );
};

export default MonthlyComparisonChart;