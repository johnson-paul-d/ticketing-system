import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export default function ParetoChart({ campaigns = [] }) {
  const data = useMemo(() => {
    const sorted = [...campaigns]
      .sort((a, b) => b.conversions - a.conversions)
      .slice(0, 15);

    const totalConversions =
      sorted.reduce((s, c) => s + c.conversions, 0);

    let running = 0;

    return sorted.map((c) => {
      running += c.conversions;

      return {
        campaign: c.campaign.substring(0, 15),
        conversions: c.conversions,
        cumulative:
          totalConversions > 0
            ? (running / totalConversions) * 100
            : 0,
      };
    });
  }, [campaigns]);

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-white mb-4">
        Pareto Analysis (80/20)
      </h3>

      <div className="h-[420px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data}>
            <CartesianGrid stroke="#1e293b" />

            <XAxis
              dataKey="campaign"
              stroke="#94a3b8"
            />

            <YAxis
              yAxisId="left"
              stroke="#94a3b8"
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              domain={[0, 100]}
              stroke="#10b981"
            />

            <Tooltip />
            <Legend />

            <Bar
              yAxisId="left"
              dataKey="conversions"
              fill="#3b82f6"
              name="Conversions"
            />

            <Line
              yAxisId="right"
              dataKey="cumulative"
              stroke="#10b981"
              strokeWidth={3}
              name="Cumulative %"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}