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

export default function MatchTypeAnalytics({
  keywords = [],
}) {

  // =====================================================
  // GROUP MATCH TYPES
  // =====================================================

  const grouped = {};

 (keywords || []).forEach((keyword) => {

    const matchType =
      keyword.match_type || "UNKNOWN";

    if (!grouped[matchType]) {

      grouped[matchType] = {

        matchType,

        clicks: 0,
        impressions: 0,
        cost: 0,
        conversions: 0,

      };
    }

    grouped[matchType].clicks +=
      Number(keyword.clicks || 0);

    grouped[matchType].impressions +=
      Number(keyword.impressions || 0);

    grouped[matchType].cost +=
      Number(keyword.cost || 0);

    grouped[matchType].conversions +=
      Number(keyword.conversions || 0);

  });

  // =====================================================
  // CALCULATE METRICS
  // =====================================================

  const data = Object.values(grouped)
    .map((m) => {

      const ctr =
        m.impressions > 0
          ? (m.clicks / m.impressions) * 100
          : 0;

      const conversionRate =
        m.clicks > 0
          ? (m.conversions / m.clicks) * 100
          : 0;

      const cpa =
        m.conversions > 0
          ? m.cost / m.conversions
          : 0;

      const efficiency =
        (ctr * conversionRate) /
        Math.max(cpa, 1);

      return {

        ...m,

        ctr:
          Number(ctr.toFixed(2)),

        conversionRate:
          Number(
            conversionRate.toFixed(2)
          ),

        cpa:
          Number(cpa.toFixed(2)),

        efficiency:
          Number(
            efficiency.toFixed(2)
          ),

      };
    })

    .sort(
      (a, b) =>
        b.conversions - a.conversions
    );

  // =====================================================
  // COLORS
  // =====================================================

  const COLORS = {
    EXACT: "#10B981",
    PHRASE: "#6366F1",
    BROAD: "#F59E0B",
    UNKNOWN: "#EF4444",
  };

  // =====================================================
  // TOOLTIP
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

      const d = payload[0].payload;

      return (

        <div className="
          bg-slate-950
          border border-slate-700
          rounded-2xl
          p-4
          min-w-[260px]
        ">

          <h3 className="
            text-white
            font-bold
            text-lg
            mb-4
          ">
            {d.matchType} MATCH
          </h3>

          <div className="
            space-y-2 text-sm
          ">

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Spend
              </span>

              <span className="text-white">
                ₹{d.cost.toLocaleString()}
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Clicks
              </span>

              <span className="text-white">
                {d.clicks.toLocaleString()}
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Conversions
              </span>

              <span className="text-white">
                {d.conversions}
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                CTR
              </span>

              <span className="text-white">
                {d.ctr}%
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                Conversion Rate
              </span>

              <span className="text-white">
                {d.conversionRate}%
              </span>
            </div>

            <div className="
              flex justify-between
            ">
              <span className="text-slate-400">
                CPA
              </span>

              <span className="text-white">
                ₹{d.cpa}
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
                Efficiency
              </span>

              <span className="
                text-emerald-400
                font-bold
              ">
                {d.efficiency}
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
            Match Type Analytics
          </h2>

          <p className="
            text-slate-400
            mt-1
          ">
            Targeting strategy performance intelligence
          </p>

        </div>

      </div>

      {/* Custom legend — Spend bars are colored per match type via Cell; Conversions is fixed green */}
      <div className="flex flex-wrap gap-4 mb-3">
        <span className="text-xs text-slate-500 self-center">Spend:</span>
        {Object.entries(COLORS).map(([type, color]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: color }} />
            <span className="text-xs text-slate-400">{type}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-slate-700">
          <span className="w-3 h-3 rounded-sm inline-block" style={{ background: "#10B981" }} />
          <span className="text-xs text-slate-400">Conversions</span>
        </div>
      </div>

      {/* =====================================================
          CHART
      ===================================================== */}

      <ResponsiveContainer
        width="100%"
        height={420}
      >

        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 20,
            left: 0,
            bottom: 20,
          }}
        >

          <CartesianGrid
            stroke="#1E293B"
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey="matchType"
            stroke="#94A3B8"
            tick={{
              fill: "#94A3B8",
            }}
          />

          <YAxis
            stroke="#94A3B8"
            tick={{
              fill: "#94A3B8",
            }}
          />

          <Tooltip
            content={<CustomTooltip />}
          />

          {/* =====================================================
              SPEND
          ===================================================== */}

          <Bar
            dataKey="cost"
            name="Spend"
            radius={[8, 8, 0, 0]}
          >

            {data.map((entry, index) => (

              <Cell
                key={index}
                fill={
                  COLORS[
                    entry.matchType
                  ] || "#6366F1"
                }
              />

            ))}

          </Bar>

          {/* =====================================================
              CONVERSIONS
          ===================================================== */}

          <Bar
            dataKey="conversions"
            name="Conversions"
            fill="#10B981"
            radius={[8, 8, 0, 0]}
          />

        </BarChart>

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

        {/* =====================================================
            EXACT
        ===================================================== */}

        <div className="
          bg-emerald-500/10
          border border-emerald-500/20
          rounded-2xl
          p-4
        ">

          <h3 className="
            text-emerald-400
            font-semibold
            mb-2
          ">
            Exact Match
          </h3>

          <p className="
            text-slate-300
            text-sm
            leading-6
          ">
            Best for high-intent targeting
            and conversion efficiency.
            Recommended for scaling
            profitable campaigns.
          </p>

        </div>

        {/* =====================================================
            PHRASE
        ===================================================== */}

        <div className="
          bg-indigo-500/10
          border border-indigo-500/20
          rounded-2xl
          p-4
        ">

          <h3 className="
            text-indigo-400
            font-semibold
            mb-2
          ">
            Phrase Match
          </h3>

          <p className="
            text-slate-300
            text-sm
            leading-6
          ">
            Balanced targeting strategy
            with strong discovery potential
            and moderate efficiency.
          </p>

        </div>

        {/* =====================================================
            BROAD
        ===================================================== */}

        <div className="
          bg-yellow-500/10
          border border-yellow-500/20
          rounded-2xl
          p-4
        ">

          <h3 className="
            text-yellow-400
            font-semibold
            mb-2
          ">
            Broad Match
          </h3>

          <p className="
            text-slate-300
            text-sm
            leading-6
          ">
            Higher reach but potentially
            lower efficiency. Requires
            tighter waste spend monitoring.
          </p>

        </div>

      </div>

    </div>
  );
}