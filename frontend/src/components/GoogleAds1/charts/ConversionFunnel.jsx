import {
  FunnelChart,
  Funnel,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from "recharts";

export default function ConversionFunnel({ overview }) {
  const data = [
    {
      name: "Impressions",
      value: overview.totalImpressions || 0,
    },
    {
      name: "Clicks",
      value: overview.totalClicks || 0,
    },
    {
      name: "Conversions",
      value: overview.totalConversions || 0,
    },
  ];

  return (
    <div className="bg-[#0c1425] border border-slate-800 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-white mb-4">
        Conversion Funnel
      </h3>

      <div className="h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <FunnelChart>
            <Tooltip />
            <Funnel
              dataKey="value"
              data={data}
              isAnimationActive
            >
              <LabelList
                position="right"
                fill="#cbd5e1"
                stroke="none"
              />
            </Funnel>
          </FunnelChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}