import { Treemap, ResponsiveContainer, Tooltip } from "recharts";

const getColor = (score) => {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
};

export default function CampaignHealthTreemap({
  campaigns = [],
}) {

  const data = campaigns.map((c) => {

    const ctr = Number(c.ctr || 0);
    const cvr = Number(c.conversion_rate || 0);
    const cpa = Number(c.cpa || 0);

    const score =
      ctr * 4 +
      cvr * 5 +
      Math.max(0, 30 - cpa / 50);

    return {
      name: c.campaign,
      size: Number(c.cost || 0),
      score,
      fill: getColor(score),
    };
  });

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">

      <h3 className="text-sm font-bold text-white mb-4">
        Campaign Health Treemap
      </h3>

      <div className="h-[500px]">

        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            stroke="#0f172a"
            fill="#3b82f6"
          >
            <Tooltip />
          </Treemap>
        </ResponsiveContainer>

      </div>

    </div>
  );
}