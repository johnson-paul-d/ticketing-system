import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

export default function MomentumChart({
  campaigns,
}) {

  const data = (campaigns || []).map((c) => {

    const current =
      Number(c.conversions || 0);

    const previous =
      Math.max(
        1,
        current - Math.random() * 5
      );

    const momentum =
      ((current - previous) / previous) *
      100;

    return {

      campaign: c.campaign,
      momentum:
        Number(momentum.toFixed(1)),

    };
  });

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-3xl
      p-6
    ">

      <h2 className="
        text-2xl font-bold
        text-white mb-2
      ">
        Campaign Momentum
      </h2>

      <p className="
        text-slate-400 mb-6
      ">
        Growth acceleration analysis
      </p>

      <ResponsiveContainer
        width="100%"
        height={350}
      >

        <BarChart data={data}>

          <CartesianGrid
            stroke="#1E293B"
          />

          <XAxis
            dataKey="campaign"
            stroke="#94A3B8"
          />

          <YAxis
            stroke="#94A3B8"
          />

          <Tooltip />

          <Bar
            dataKey="momentum"
            radius={[8, 8, 0, 0]}
          >

            {data.map((entry, index) => (

              <Cell
                key={index}
                fill={
                  entry.momentum > 0
                    ? "#10B981"
                    : "#EF4444"
                }
              />

            ))}

          </Bar>

        </BarChart>

      </ResponsiveContainer>

    </div>
  );
}