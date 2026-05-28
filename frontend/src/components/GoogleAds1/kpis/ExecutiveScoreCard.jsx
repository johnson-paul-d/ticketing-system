import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
} from "recharts";

export default function ExecutiveScoreCard({
  score,
}) {

  const data = [
    {
      name: "Score",
      value: score,
      fill: "#10B981",
    },
  ];

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
        mb-5
      ">
        Executive Performance Score
      </h2>

      <ResponsiveContainer
        width="100%"
        height={300}
      >

        <RadialBarChart
          innerRadius="70%"
          outerRadius="100%"
          data={data}
          startAngle={180}
          endAngle={0}
        >

          <RadialBar
            background
            dataKey="value"
          />

        </RadialBarChart>

      </ResponsiveContainer>

      <div className="
        text-center
        -mt-10
      ">

        <h1 className="
          text-6xl
          font-black
          text-white
        ">
          {score}
        </h1>

      </div>

    </div>
  );
}