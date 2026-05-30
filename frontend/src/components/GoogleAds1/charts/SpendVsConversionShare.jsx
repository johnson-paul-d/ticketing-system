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

export default function SpendVsConversionShare({
  campaigns = [],
}) {

  const data = useMemo(() => {

    const totalSpend =
      campaigns.reduce(
        (s, c) => s + c.cost,
        0
      );

    const totalConv =
      campaigns.reduce(
        (s, c) => s + c.conversions,
        0
      );

    return campaigns
      .slice(0, 10)
      .map((c) => ({
        campaign:
          c.campaign.substring(0, 15),

        spendShare:
          totalSpend > 0
            ? (c.cost / totalSpend) * 100
            : 0,

        convShare:
          totalConv > 0
            ? (c.conversions / totalConv) * 100
            : 0,
      }));
  }, [campaigns]);

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">

      <h3 className="text-sm font-bold text-white mb-4">
        Spend Share vs Conversion Share
      </h3>

      <div className="h-[350px]">

        <ResponsiveContainer width="100%" height="100%">

          <BarChart data={data}>

            <CartesianGrid
              stroke="#1e293b"
            />

            <XAxis
              dataKey="campaign"
              stroke="#94a3b8"
            />

            <YAxis
              stroke="#94a3b8"
            />

            <Tooltip />

            <Legend />

            <Bar
              dataKey="spendShare"
              fill="#3b82f6"
              name="Spend %"
            />

            <Bar
              dataKey="convShare"
              fill="#10b981"
              name="Conversion %"
            />

          </BarChart>

        </ResponsiveContainer>

      </div>
    </div>
  );
}