
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

import {
  movingAverageForecast,
} from "../../../utils/forecasting";

export default function ForecastChart({
  trends,
}) {

  const conversions =
    (trends || []).map((t) =>
      Number(t.conversions || 0)
    );

const forecastValue =
  movingAverageForecast(conversions,7);

const data = trends.map((t,index) => ({
  date: t.report_date,
  actual: Number(t.conversions || 0),
  forecast:
    index >= trends.length - 7
      ? forecastValue
      : null,
}));  

  return (

    <div className="
      bg-slate-900
      border border-slate-800
      rounded-3xl
      p-6
    ">

      <h2 className="
        text-2xl font-bold
        text-white mb-2
      ">
        Forecast Trend
      </h2>

      <p className="
        text-slate-400 mb-6
      ">
        Predicted conversion trajectory
      </p>

      <ResponsiveContainer
        width="100%"
        height={350}
      >

        <LineChart data={data}>

          <CartesianGrid
            stroke="#1E293B"
          />

          <XAxis
            dataKey="date"
            stroke="#94A3B8"
          />

          <YAxis
            stroke="#94A3B8"
          />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="actual"
            stroke="#6366F1"
            strokeWidth={3}
          />

          <Line
            type="monotone"
            dataKey="forecast"
            stroke="#10B981"
            strokeDasharray="5 5"
            strokeWidth={3}
          />

        </LineChart>

      </ResponsiveContainer>

    </div>
  );
}