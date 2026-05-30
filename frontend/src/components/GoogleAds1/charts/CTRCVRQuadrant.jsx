import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from "recharts";

export default function CTRCVRQuadrant({
  campaigns = [],
}) {

  const data = campaigns.map((c) => ({
    campaign: c.campaign,
    ctr: c.ctr,
    cvr: c.conversion_rate,
  }));

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">

      <h3 className="text-sm font-bold text-white mb-4">
        CTR vs CVR Quadrant
      </h3>

      <div className="h-[420px]">

        <ResponsiveContainer
          width="100%"
          height="100%"
        >

          <ScatterChart>

            <CartesianGrid
              stroke="#1e293b"
            />

            <XAxis
              dataKey="ctr"
              name="CTR"
              unit="%"
              stroke="#94a3b8"
            />

            <YAxis
              dataKey="cvr"
              name="CVR"
              unit="%"
              stroke="#94a3b8"
            />

            <ReferenceLine
              x={2}
              stroke="#64748b"
            />

            <ReferenceLine
              y={5}
              stroke="#64748b"
            />

            <Tooltip
              formatter={(v) =>
                `${v.toFixed(2)}%`
              }
            />

            <Scatter
              data={data}
              fill="#6366f1"
            />

          </ScatterChart>

        </ResponsiveContainer>

      </div>

      <div className="grid grid-cols-2 gap-2 mt-4 text-xs">

        <div className="text-emerald-400">
          High CTR + High CVR → Scale
        </div>

        <div className="text-amber-400">
          High CTR + Low CVR → Landing Page
        </div>

        <div className="text-cyan-400">
          Low CTR + High CVR → Increase Traffic
        </div>

        <div className="text-red-400">
          Low CTR + Low CVR → Pause
        </div>

      </div>
    </div>
  );
}