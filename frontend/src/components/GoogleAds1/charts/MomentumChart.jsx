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
  // Calculate growth percentage for each campaign
  const data = campaigns.map((campaign) => {
    const currentConversions = Number(campaign.currentConversions || 0);
    const previousConversions = Number(campaign.previousConversions || 0);
    
    let growth = 0;
    
    if (previousConversions === 0) {
      // If previous was zero, growth is 100% if current > 0, else 0%
      growth = currentConversions > 0 ? 100 : 0;
    } else {
      growth = ((currentConversions - previousConversions) / previousConversions) * 100;
    }

    return {
      campaign: campaign.campaign || "Unknown",
      growth: Number(growth.toFixed(2)),
    };
  });

  // Determine color based on growth value
  const getBarColor = (growth) => {
    if (growth > 0) return "#10B981"; // Green for positive growth
    if (growth === 0) return "#F59E0B"; // Yellow for no growth
    return "#EF4444"; // Red for negative growth
  };

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
        Growth percentage by campaign (current vs. previous conversions)
      </p>

      <ResponsiveContainer
        width="100%"
        height={350}
      >
        <BarChart data={data}>
          <CartesianGrid stroke="#1E293B" />
          
          <XAxis
            dataKey="campaign"
            stroke="#94A3B8"
          />
          
          <YAxis
            stroke="#94A3B8"
            tickFormatter={(v) => `${v}%`}
          />
          
          <Tooltip
            formatter={(value) => [
              `${value}%`,
              "Growth",
            ]}
            labelFormatter={(label) => `Campaign: ${label}`}
          />
          
          <Bar
            dataKey="growth"
            radius={[8, 8, 0, 0]}
          >
            {data.map((entry, index) => (
              <Cell
                key={index}
                fill={getBarColor(entry.growth)}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}