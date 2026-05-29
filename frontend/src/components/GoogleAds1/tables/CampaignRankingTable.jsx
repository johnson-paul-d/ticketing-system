export default function CampaignRankingTable({
  campaigns = [],
}) {

  const ranked = [...campaigns]
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 10);

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
        mb-6
      ">
        Campaign Ranking
      </h2>

      <table className="w-full text-sm">

        <thead>
          <tr className="border-b border-slate-800">
            <th className="text-left py-3 text-slate-400">Rank</th>
            <th className="text-left py-3 text-slate-400">Campaign</th>
            <th className="text-right py-3 text-slate-400">Conversions</th>
            <th className="text-right py-3 text-slate-400">Spend</th>
          </tr>
        </thead>

        <tbody>
          {ranked.map((row, index) => (
            <tr
              key={index}
              className="border-b border-slate-800/50"
            >
              <td className="py-3 text-white">
                #{index + 1}
              </td>

              <td className="py-3 text-white">
                {row.campaign}
              </td>

              <td className="py-3 text-right text-emerald-400">
                {Number(row.conversions || 0).toFixed(0)}
              </td>

              <td className="py-3 text-right text-slate-300">
                ₹{Number(row.cost || 0).toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>

      </table>
    </div>
  );
}