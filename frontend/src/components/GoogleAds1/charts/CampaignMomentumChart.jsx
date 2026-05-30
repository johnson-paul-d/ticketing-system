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

export default function CampaignMomentumChart({
  campaigns = [],
}) {

  const data = campaigns
    .map((c) => ({
      campaign:
        c.campaign.substring(0, 18),

      growth:
        Number(c.growth || 0),
    }))
    .sort(
      (a, b) =>
        b.growth - a.growth
    )
    .slice(0, 15);

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">

      <h3 className="text-sm font-bold text-white mb-4">
        Campaign Momentum
      </h3>

      <div className="h-[420px]">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

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

            <Bar
              dataKey="growth"
              radius={[4,4,0,0]}
            >
              {data.map((entry,index)=>(
                <Cell
                  key={index}
                  fill={
                    entry.growth >= 0
                      ? "#10b981"
                      : "#ef4444"
                  }
                />
              ))}
            </Bar>

          </BarChart>

        </ResponsiveContainer>

      </div>
    </div>
  );
}