import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  Cell,
} from "recharts";

export default function MatchTypeAnalytics({
  keywords = [],
}) {

  // =====================================================
  // GROUP MATCH TYPES (NORMALIZED)
  // =====================================================

  const grouped = {};

  (keywords || []).forEach((keyword) => {

const matchType = String(
  keyword.match_type ||
  keyword.keyword_match_type ||
  keyword.matchType ||
  keyword.matchtype ||
  "UNKNOWN"
)
  .toUpperCase()
  .trim();

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
  // CALCULATE METRICS (IMPROVED EFFICIENCY)
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

      // New: Conversions per ₹1000 spend
      const efficiency =
        m.cost > 0
          ? (m.conversions / m.cost) * 1000
          : 0;

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
  // EXECUTIVE KPIs (BEST CPA, CVR, SPEND)
  // =====================================================

  const bestCPA = [...data]
    .filter(d => d.conversions > 0)
    .sort((a,b) => a.cpa - b.cpa)[0];

  const bestCVR = [...data]
    .sort(
      (a,b) =>
        b.conversionRate -
        a.conversionRate
    )[0];

  const highestSpend = [...data]
    .sort(
      (a,b) =>
        b.cost - a.cost
    )[0];

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

      {/* =====================================================
          EXECUTIVE KPI CARDS (ABOVE CHART)
      ===================================================== */}

      <div className="
        grid grid-cols-1
        md:grid-cols-3
        gap-4
        mb-6
      ">

        {/* Lowest CPA Card */}

        <div className="
          bg-slate-950
          border border-slate-800
          rounded-2xl
          p-4
        ">
          <div className="text-slate-400 text-sm">
            Lowest CPA
          </div>

          <div className="
            text-white
            text-xl
            font-bold
          ">
            {bestCPA?.matchType || "—"}
          </div>

          <div className="
            text-emerald-400
          ">
            ₹{bestCPA?.cpa?.toFixed(0) || "0"}
          </div>
        </div>

        {/* Best CVR Card */}

        <div className="
          bg-slate-950
          border border-slate-800
          rounded-2xl
          p-4
        ">
          <div className="text-slate-400 text-sm">
            Best CVR
          </div>

          <div className="
            text-white
            text-xl
            font-bold
          ">
            {bestCVR?.matchType || "—"}
          </div>

          <div className="
            text-cyan-400
          ">
            {bestCVR?.conversionRate?.toFixed(1) || "0"}%
          </div>
        </div>

        {/* Highest Spend Card */}

        <div className="
          bg-slate-950
          border border-slate-800
          rounded-2xl
          p-4
        ">
          <div className="text-slate-400 text-sm">
            Highest Spend
          </div>

          <div className="
            text-white
            text-xl
            font-bold
          ">
            {highestSpend?.matchType || "—"}
          </div>

          <div className="
            text-yellow-400
          ">
            ₹{highestSpend?.cost?.toLocaleString() || "0"}
          </div>
        </div>

      </div>

      {/* =====================================================
          CHART (SINGLE EFFICIENCY BAR)
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

          <Legend />

          <Bar
            dataKey="efficiency"
            name="Efficiency Score"
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

        </BarChart>

      </ResponsiveContainer>

      {/* =====================================================
          EXECUTIVE INSIGHTS (STRATEGIC RECOMMENDATIONS)
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