import {
  calculateOpportunityScore,
} from "../../../utils/scoring";

export default function OpportunityTable({
  campaigns,
}) {

  const data = campaigns
    .map((c) => ({

      ...c,

      opportunity:
        calculateOpportunityScore(c),

    }))

    .sort(
      (a, b) =>
        b.opportunity - a.opportunity
    )

    .slice(0, 8);

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-3xl
      p-6
    ">

      <div className="
        flex items-center
        justify-between
        mb-6
      ">

        <div>

          <h2 className="
            text-2xl font-bold
            text-white
          ">
            Opportunity Intelligence
          </h2>

          <p className="
            text-slate-400 mt-1
          ">
            Campaign scaling recommendations
          </p>

        </div>

      </div>

      <div className="overflow-auto">

        <table className="
          w-full text-sm
        ">

          <thead>

            <tr className="
              border-b border-slate-800
            ">

              <th className="
                text-left py-4
                text-slate-400
              ">
                Campaign
              </th>

              <th className="
                text-right py-4
                text-slate-400
              ">
                Conversions
              </th>

              <th className="
                text-right py-4
                text-slate-400
              ">
                CTR
              </th>

              <th className="
                text-right py-4
                text-slate-400
              ">
                Opportunity
              </th>

              <th className="
                text-right py-4
                text-slate-400
              ">
                Action
              </th>

            </tr>

          </thead>

          <tbody>

            {data.map((row, index) => (

              <tr
                key={index}
                className="
                  border-b border-slate-800/50
                "
              >

                <td className="
                  py-4 text-white
                  font-medium
                ">
                  {row.campaign}
                </td>

                <td className="
                  py-4 text-right
                  text-slate-300
                ">
                  {row.conversions}
                </td>

                <td className="
                  py-4 text-right
                  text-slate-300
                ">
                  {(
                    Number(row.ctr || 0) * 100
                  ).toFixed(2)}%
                </td>

                <td className="
                  py-4 text-right
                  text-emerald-400
                  font-bold
                ">
                  {row.opportunity}
                </td>

                <td className="
                  py-4 text-right
                ">

                  <span className="
                    bg-emerald-500/20
                    text-emerald-400
                    px-3 py-1
                    rounded-full
                    text-xs
                    font-semibold
                  ">

                    Scale

                  </span>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}