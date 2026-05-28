import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

export default function SpendTrendChart({
  trends,
}) {

  // =====================================================
  // FORMAT DATA
  // =====================================================

  const data = (trends || []).map((t) => ({

    date: new Date(
      t.report_date
    ).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    }),

    spend:
      Number(t.cost || 0),

    conversions:
      Number(t.conversions || 0),

    clicks:
      Number(t.clicks || 0),

  }));

  // =====================================================
  // CUSTOM TOOLTIP
  // =====================================================

  const CustomTooltip = ({
    active,
    payload,
    label,
  }) => {

    if (
      active &&
      payload &&
      payload.length
    ) {

      return (

        <div className="
          bg-slate-950
          border border-slate-700
          rounded-2xl
          p-4
          min-w-[220px]
        ">

          <h3 className="
            text-white
            font-bold
            mb-3
          ">
            {label}
          </h3>

          <div className="
            space-y-2 text-sm
          ">

            <div className="
              flex justify-between
            ">

              <span className="
                text-slate-400
              ">
                Spend
              </span>

              <span className="
                text-indigo-400
                font-semibold
              ">
                ₹{payload[0].value.toLocaleString()}
              </span>

            </div>

            <div className="
              flex justify-between
            ">

              <span className="
                text-slate-400
              ">
                Conversions
              </span>

              <span className="
                text-emerald-400
                font-semibold
              ">
                {payload[1].value}
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
      p-5
      h-full
    ">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="
        flex items-start
        justify-between
        mb-5
      ">

        <div>

          <h2 className="
            text-xl
            font-bold
            text-white
          ">
            Spend vs Conversion Trend
          </h2>

          <p className="
            text-slate-400
            text-sm
            mt-1
          ">
            Budget efficiency over time
          </p>

        </div>

        <div className="
          flex gap-2
        ">

          <div className="
            bg-indigo-500/10
            text-indigo-400
            px-3 py-1
            rounded-full
            text-xs
            font-medium
          ">
            Spend
          </div>

          <div className="
            bg-emerald-500/10
            text-emerald-400
            px-3 py-1
            rounded-full
            text-xs
            font-medium
          ">
            Conversions
          </div>

        </div>

      </div>

      {/* =====================================================
          CHART
      ===================================================== */}

      <ResponsiveContainer
        width="100%"
        height={360}
      >

        <AreaChart
          data={data}
        >

          <defs>

            <linearGradient
              id="spendGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >

              <stop
                offset="5%"
                stopColor="#6366F1"
                stopOpacity={0.4}
              />

              <stop
                offset="95%"
                stopColor="#6366F1"
                stopOpacity={0}
              />

            </linearGradient>

            <linearGradient
              id="conversionGradient"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >

              <stop
                offset="5%"
                stopColor="#10B981"
                stopOpacity={0.4}
              />

              <stop
                offset="95%"
                stopColor="#10B981"
                stopOpacity={0}
              />

            </linearGradient>

          </defs>

          <CartesianGrid
            stroke="#1E293B"
            strokeDasharray="3 3"
          />

          <XAxis
            dataKey="date"
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

          {/* =====================================================
              SPEND
          ===================================================== */}

          <Area
            type="monotone"
            dataKey="spend"
            stroke="#6366F1"
            fill="url(#spendGradient)"
            strokeWidth={3}
          />

          {/* =====================================================
              CONVERSIONS
          ===================================================== */}

          <Area
            type="monotone"
            dataKey="conversions"
            stroke="#10B981"
            fill="url(#conversionGradient)"
            strokeWidth={3}
          />

        </AreaChart>

      </ResponsiveContainer>

      {/* =====================================================
          INSIGHTS
      ===================================================== */}

      <div className="
        grid grid-cols-2
        gap-4
        mt-5
      ">

        <div className="
          bg-slate-950
          border border-slate-800
          rounded-2xl
          p-4
        ">

          <div className="
            text-slate-400
            text-xs
            mb-1
          ">
            Budget Trend
          </div>

          <div className="
            text-white
            font-bold
            text-lg
          ">
            Stable Growth
          </div>

        </div>

        <div className="
          bg-slate-950
          border border-slate-800
          rounded-2xl
          p-4
        ">

          <div className="
            text-slate-400
            text-xs
            mb-1
          ">
            Conversion Momentum
          </div>

          <div className="
            text-emerald-400
            font-bold
            text-lg
          ">
            +18.2%
          </div>

        </div>

      </div>

    </div>
  );
}