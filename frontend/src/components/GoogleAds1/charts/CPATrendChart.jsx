import { useMemo } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export default function CPATrendChart({
  trends = [],
}) {

  const data = useMemo(() => {

    const grouped = {};

    trends.forEach((t) => {

      const date =
        t.report_date;

      if (!grouped[date]) {

        grouped[date] = {
          date,
          cost: 0,
          conversions: 0,
        };
      }

      grouped[date].cost +=
        Number(t.cost || 0);

      grouped[date].conversions +=
        Number(
          t.conversions || 0
        );
    });

    return Object.values(grouped)
      .map((d) => ({
        date: d.date,

        cpa:
          d.conversions > 0
            ? d.cost /
              d.conversions
            : 0,
      }))
      .sort(
        (a,b)=>
          new Date(a.date) -
          new Date(b.date)
      );

  }, [trends]);

  return (

    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">

      <h3 className="text-sm font-bold text-white mb-4">
        CPA Trend
      </h3>

      <div className="h-[380px]">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <LineChart data={data}>

            <CartesianGrid
              stroke="#1e293b"
            />

            <XAxis
              dataKey="date"
              stroke="#94a3b8"
            />

            <YAxis
              stroke="#94a3b8"
            />

            <Tooltip />

            <Line
              dataKey="cpa"
              stroke="#f59e0b"
              strokeWidth={3}
              dot={false}
            />

          </LineChart>

        </ResponsiveContainer>

      </div>

    </div>
  );
}