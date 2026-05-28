
import {
  calculateCPA,
  calculateEfficiencyScore,
} from "../../../utils/metrics";

import {
  calculateOpportunityScore,
  calculatePerformanceScore,
} from "../../../utils/scoring";

export default function CampaignIntelligenceTable({
  campaigns = [],
}) {

  // =====================================================
  // SAFE DATA FORMAT
  // =====================================================

  const data = (campaigns || [])

    .map((campaign) => {

      const ctr =
        Number(campaign?.ctr || 0) * 100;

      const conversionRate =
        Number(
          campaign?.conversion_rate || 0
        );

      const cost =
        Number(campaign?.cost || 0);

      const conversions =
        Number(
          campaign?.conversions || 0
        );

      const avgCpc =
        Number(campaign?.avg_cpc || 0);

      // =====================================================
      // METRICS
      // =====================================================

      const cpa =
        calculateCPA(
          cost,
          conversions
        );

      const efficiency =
        calculateEfficiencyScore(
          ctr,
          conversionRate,
          avgCpc
        );

      const opportunity =
        calculateOpportunityScore(
          campaign
        );

      const performance =
        calculatePerformanceScore(
          campaign
        );

      // =====================================================
      // EXECUTIVE STATUS
      // =====================================================

      let status = "Monitor";

      // HIGH SPEND NO CONVERSIONS

      if (
        conversions === 0 &&
        cost > 1000
      ) {

        status = "Pause";

      }

      // HIGH PERFORMANCE

      else if (
        efficiency > 1.5 &&
        conversions > 0
      ) {

        status = "Scale";

      }

      // HIGH CTR LOW CONVERSIONS

      else if (
        ctr > 5 &&
        conversions === 0
      ) {

        status = "Optimize";

      }

      return {

        campaign:
          campaign?.campaign ||
          "Unknown Campaign",

        spend: cost,

        ctr,

        conversionRate,

        conversions,

        cpa,

        efficiency,

        opportunity,

        performance,

        status,

      };
    })

    .sort(
      (a, b) =>
        b.performance -
        a.performance
    );

  // =====================================================
  // STATUS STYLES
  // =====================================================

  const getStatusStyles = (
    status
  ) => {

    switch (status) {

      case "Scale":

        return `
          bg-emerald-500/20
          text-emerald-400
          border border-emerald-500/20
        `;

      case "Optimize":

        return `
          bg-yellow-500/20
          text-yellow-400
          border border-yellow-500/20
        `;

      case "Pause":

        return `
          bg-red-500/20
          text-red-400
          border border-red-500/20
        `;

      default:

        return `
          bg-slate-500/20
          text-slate-300
          border border-slate-700
        `;
    }
  };

  // =====================================================
  // EMPTY STATE
  // =====================================================

  if (!data.length) {

    return (

      <div className="
        bg-slate-900
        border border-slate-800
        rounded-3xl
        p-8
        text-center
      ">

        <h2 className="
          text-white
          text-xl
          font-bold
          mb-2
        ">
          Campaign Intelligence
        </h2>

        <p className="
          text-slate-400
        ">
          No campaign data available
        </p>

      </div>
    );
  }

  // =====================================================
  // MAIN UI
  // =====================================================

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-3xl
      p-5
    ">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="
        flex items-start
        justify-between
        mb-6
      ">

        <div>

          <h2 className="
            text-xl
            font-bold
            text-white
          ">
            Campaign Intelligence
          </h2>

          <p className="
            text-slate-400
            text-sm
            mt-1
          ">
            Executive performance diagnostics & optimization recommendations
          </p>

        </div>

      </div>

      {/* =====================================================
          TABLE
      ===================================================== */}

      <div className="
        overflow-auto
      ">

        <table className="
          w-full
          text-sm
        ">

          {/* =====================================================
              HEADER
          ===================================================== */}

          <thead>

            <tr className="
              border-b border-slate-800
            ">

              <th className="
                py-4 text-left
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                Campaign
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                Spend
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                CTR
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                Conv Rate
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                Conversions
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                CPA
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                Efficiency
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                Opportunity
              </th>

              <th className="
                py-4 text-right
                text-slate-400
                uppercase tracking-wider
                text-xs
              ">
                Action
              </th>

            </tr>

          </thead>

          {/* =====================================================
              BODY
          ===================================================== */}

          <tbody>

            {data.map(
              (row, index) => (

                <tr
                  key={index}
                  className="
                    border-b
                    border-slate-800/50
                    hover:bg-slate-800/30
                    transition-all
                    duration-200
                  "
                >

                  {/* =====================================================
                      CAMPAIGN
                  ===================================================== */}

                  <td className="
                    py-5
                  ">

                    <div>

                      <div className="
                        text-white
                        font-semibold
                      ">
                        {row.campaign}
                      </div>

                      <div className="
                        text-slate-500
                        text-xs
                        mt-1
                      ">
                        Performance Score:
                        {" "}
                        {row.performance}
                      </div>

                    </div>

                  </td>

                  {/* =====================================================
                      SPEND
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                    text-white
                    font-medium
                  ">

                    ₹
                    {row.spend.toLocaleString()}

                  </td>

                  {/* =====================================================
                      CTR
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                  ">

                    <span className="
                      text-cyan-400
                      font-semibold
                    ">

                      {row.ctr.toFixed(2)}%

                    </span>

                  </td>

                  {/* =====================================================
                      CONVERSION RATE
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                  ">

                    <span className="
                      text-emerald-400
                      font-semibold
                    ">

                      {row.conversionRate.toFixed(2)}%

                    </span>

                  </td>

                  {/* =====================================================
                      CONVERSIONS
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                    text-white
                  ">

                    {row.conversions}

                  </td>

                  {/* =====================================================
                      CPA
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                  ">

                    <span className="
                      text-orange-400
                      font-semibold
                    ">

                      ₹
                      {row.cpa.toFixed(0)}

                    </span>

                  </td>

                  {/* =====================================================
                      EFFICIENCY
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                  ">

                    <span className="
                      text-indigo-400
                      font-bold
                    ">

                      {row.efficiency.toFixed(2)}

                    </span>

                  </td>

                  {/* =====================================================
                      OPPORTUNITY
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                  ">

                    <span className="
                      text-purple-400
                      font-bold
                    ">

                      {row.opportunity}

                    </span>

                  </td>

                  {/* =====================================================
                      STATUS
                  ===================================================== */}

                  <td className="
                    py-5
                    text-right
                  ">

                    <span className={`
                      px-3 py-1
                      rounded-full
                      text-xs
                      font-semibold
                      ${getStatusStyles(
                        row.status
                      )}
                    `}>

                      {row.status}

                    </span>

                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}