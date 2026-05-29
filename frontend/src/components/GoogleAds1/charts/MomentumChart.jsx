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
  campaigns = [],
}) {

  const data = campaigns.map((campaign) => {

    const clicks =
      Number(campaign.clicks || 0);

    const conversions =
      Number(campaign.conversions || 0);

    const conversionRate =
      clicks > 0
        ? (conversions / clicks) * 100
        : 0;

    return {
      campaign:
        campaign.campaign ||
        "Unknown",

      momentum:
        Number(
          conversionRate.toFixed(2)
        ),
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
        text-2xl
        font-bold
        text-white
        mb-2
      ">
        Campaign Momentum
      </h2>

      <p className="
        text-slate-400
        mb-6
      ">
        Conversion rate performance by campaign
      </p>

      <ResponsiveContainer
        width="100%"
        height={350}
      >

        <BarChart
          data={data}
        >

          <CartesianGrid
            stroke="#1E293B"
          />

          <XAxis
            dataKey="campaign"
            stroke="#94A3B8"
          />

          <YAxis
            stroke="#94A3B8"
            tickFormatter={(v) =>
              `${v}%`
            }
          />

          <Tooltip
            formatter={(value) => [
              `${value}%`,
              "Conversion Rate",
            ]}
          />

          <Bar
            dataKey="momentum"
            radius={[8, 8, 0, 0]}
          >

            {data.map(
              (entry, index) => (

                <Cell
                  key={index}
                  fill={
                    entry.momentum >= 3
                      ? "#10B981"
                      : entry.momentum >= 1
                      ? "#F59E0B"
                      : "#EF4444"
                  }
                />

              )
            )}

          </Bar>

        </BarChart>

      </ResponsiveContainer>

    </div>

  );
}