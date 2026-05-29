import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
} from "recharts";

export default function ExecutiveScoreCard({
  score,
  efficiencyIndex = 0,    // e.g., conversions per ₹1000
  activeRate = 0,         // active campaign rate (%)
  wasteSpend = 0,         // total waste spend amount
}) {
  const data = [
    {
      name: "Score",
      value: score,
      fill: "#10B981",
    },
  ];

  // Determine performance label
  const getPerformanceLabel = () => {
    if (score >= 80) return "Excellent Performance";
    if (score >= 60) return "Good Performance";
    return "Needs Optimization";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6">
      <h2 className="text-2xl font-bold text-white mb-5">
        Executive Performance Score
      </h2>

      <ResponsiveContainer width="100%" height={300}>
        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={180}
          endAngle={0}
        >
          <RadialBar background dataKey="value" />
        </RadialBarChart>
      </ResponsiveContainer>

      <div className="text-center -mt-10">
        <h1 className="text-6xl font-black text-white">{score}</h1>

        {/* New subtitle based on score */}
        <p className="text-slate-400 text-sm mt-2">
          {getPerformanceLabel()}
        </p>
      </div>

      {/* New KPI summary row */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        <div>
          <p className="text-slate-500 text-xs">Efficiency</p>
          <p className="text-white font-bold">
            {typeof efficiencyIndex === 'number' 
              ? efficiencyIndex.toFixed(1) 
              : efficiencyIndex}
          </p>
        </div>

        <div>
          <p className="text-slate-500 text-xs">Active Rate</p>
          <p className="text-white font-bold">
            {typeof activeRate === 'number' 
              ? `${activeRate.toFixed(1)}%` 
              : `${activeRate}%`}
          </p>
        </div>

        <div>
          <p className="text-slate-500 text-xs">Waste Spend</p>
          <p className="text-white font-bold">
            ₹{Number(wasteSpend).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}