import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";

import {
  calculateEfficiencyScore,
} from "../../../utils/metrics";

export default function CampaignEfficiencyMatrix({
  campaigns,
}) {

  // =====================================================
  // FORMAT DATA
  // =====================================================

  googleAds1const formattedData = (campaigns || []).map(
    (campaign) => {

      const ctr =
        Number(campaign.ctr || 0) * 100;

      const conversionRate =
        Number(
          campaign.conversion_rate || 0
        );

      const spend =
        Number(campaign.cost || 0);

      const avgCpc =
        Number(campaign.avg_cpc || 1);

      const efficiency =
        calculateEfficiencyScore(
          ctr,
          conversionRate,
          avgCpc
        );

      return {
        campaign: campaign.campaign,

        ctr,

        conversionRate,

        spend,

        efficiency,

        conversions:
          Number(
            campaign.conversions || 0
          ),

        avgCpc,
      };
    }
  );

  // =====================================================
  // COLOR LOGIC
  // =====================================================

  const getBubbleColor = (
    efficiency
  ) => {

    if (efficiency >= 1.5) {
      return "#10B981";
    }

    if (efficiency >= 0.7) {
      return "#F59E0B";
    }

    return "#EF4444";
  };

  // =====================================================
  // CUSTOM TOOLTIP
  // =====================================================

  const CustomTooltip = ({
    active,
    payload,
  }) => {

    if (
      active &&
      payload &&
      payload.length
    ) {

      const data = payload[0].payload;

      return (

        <div className="
          bg-slate-950
          border border-slate-700
          rounded-2xl
          p-4
          shadow-2xl
          min-w-[260px]
        ">

          <h3 className="
            text-white
            font-bold
            text-lg
            mb-3
          ">
            {data.campaign}
          </h3>

          <div className="
            space-y-2
            text-sm
          ">

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                CTR
              </span>

              <span className="text-white">
                {data.ctr.toFixed(2)}%
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Conversion Rate
              </span>

              <span className="text-white">
                {data.conversionRate.toFixed(2)}%
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Spend
              </span>

              <span className="text-white">
                ₹{data.spend.toLocaleString()}
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Conversions
              </span>

              <span className="text-white">
                {data.conversions}
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Avg CPC
              </span>

              <span className="text-white">
                ₹{data.avgCpc.toFixed(2)}
              </span>
            </div>

            <div className="
              flex justify-between
              pt-2
              border-t border-slate-700
            ">
              <span className="
                text-slate-300
                font-medium
              ">
                Efficiency Score
              </span>

              <span className="
                text-emerald-400
                font-bold
              ">
                {data.efficiency.toFixed(2)}
              </span>
            </div>

          </div>

        </div>
      );
    }

    return null;
  };

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-3xl
      p-6
      h-full
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
            text-2xl
            font-bold
            text-white
          ">
            Campaign Efficiency Matrix
          </h2>

          <p className="
            text-slate-400
            mt-1
          ">
            CTR vs Conversion Rate vs Spend
          </p>

        </div>

        <div className="
          flex gap-3
          text-xs
        ">

          <div className="
            flex items-center gap-2
          ">
            <div className="
              w-3 h-3 rounded-full
              bg-green-500
            " />

            <span className="text-slate-400">
              Efficient
            </span>
          </div>

          <div className="
            flex items-center gap-2
          ">
            <div className="
              w-3 h-3 rounded-full
              bg-yellow-500
            " />

            <span className="text-slate-400">
              Average
            </span>
          </div>

          <div className="
            flex items-center gap-2
          ">
            <div className="
              w-3 h-3 rounded-full
              bg-red-500
            " />

            <span className="text-slate-400">
              Poor
            </span>
          </div>

        </div>

      </div>

      {/* =====================================================
          CHART
      ===================================================== */}

      <ResponsiveContainer
        width="100%"
        height={500}
      >

        <ScatterChart
          margin={{
            top: 20,
            right: 20,
            bottom: 20,
            left: 20,
          }}
        >

          <CartesianGrid
            stroke="#1E293B"
            strokeDasharray="3 3"
          />

          {/* =====================================================
              QUADRANT LINES
          ===================================================== */}

          <ReferenceLine
            x={5}
            stroke="#475569"
            strokeDasharray="5 5"
          />

          <ReferenceLine
            y={3}
            stroke="#475569"
            strokeDasharray="5 5"
          />

          {/* =====================================================
              X AXIS
          ===================================================== */}

          <XAxis
            type="number"
            dataKey="ctr"
            name="CTR"
            unit="%"
            stroke="#94A3B8"
            tick={{ fill: "#94A3B8" }}
            label={{
              value: "Click Through Rate (%)",
              position: "insideBottom",
              fill: "#94A3B8",
            }}
          />

          {/* =====================================================
              Y AXIS
          ===================================================== */}

          <YAxis
            type="number"
            dataKey="conversionRate"
            name="Conversion Rate"
            unit="%"
            stroke="#94A3B8"
            tick={{ fill: "#94A3B8" }}
            label={{
              value:
                "Conversion Rate (%)",
              angle: -90,
              position: "insideLeft",
              fill: "#94A3B8",
            }}
          />

          {/* =====================================================
              BUBBLE SIZE
          ===================================================== */}

          <ZAxis
            type="number"
            dataKey="spend"
            range={[120, 1000]}
          />

          {/* =====================================================
              TOOLTIP
          ===================================================== */}

          <Tooltip
            content={<CustomTooltip />}
            cursor={{
              strokeDasharray: "3 3",
            }}
          />

          {/* =====================================================
              SCATTER
          ===================================================== */}

          <Scatter
            data={formattedData}
          >

            {formattedData.map(
              (entry, index) => (

                <Cell
                  key={index}
                  fill={getBubbleColor(
                    entry.efficiency
                  )}
                />

              )
            )}

          </Scatter>

        </ScatterChart>

      </ResponsiveContainer>

      {/* =====================================================
          EXECUTIVE INSIGHTS
      ===================================================== */}

      <div className="
        grid grid-cols-1
        md:grid-cols-3
        gap-4
        mt-6
      ">

        <div className="
          bg-emerald-500/10
          border border-emerald-500/20
          rounded-2xl
          p-4
        ">

          <h3 className="
            text-emerald-400
            font-semibold
            mb-1
          ">
            Scale Opportunity
          </h3>

          <p className="
            text-slate-300
            text-sm
          ">
            Campaigns in the top-right quadrant
            are generating strong engagement
            and conversion efficiency.
          </p>

        </div>

        <div className="
          bg-yellow-500/10
          border border-yellow-500/20
          rounded-2xl
          p-4
        ">

          <h3 className="
            text-yellow-400
            font-semibold
            mb-1
          ">
            Optimization Required
          </h3>

          <p className="
            text-slate-300
            text-sm
          ">
            High CTR but low conversion campaigns
            may require landing page optimization.
          </p>

        </div>

        <div className="
          bg-red-500/10
          border border-red-500/20
          rounded-2xl
          p-4
        ">

          <h3 className="
            text-red-400
            font-semibold
            mb-1
          ">
            Waste Spend Risk
          </h3>

          <p className="
            text-slate-300
            text-sm
          ">
            Bottom-left quadrant campaigns
            indicate inefficient budget allocation.
          </p>

        </div>

      </div>

    </div>
  );
}