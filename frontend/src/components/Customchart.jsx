import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

export default function CustomChart({
  title,
  data,
  type,
  xKey,
  dataKey,
}) {
  const COLORS = [
    "#3b82f6",
    "#16a34a",
    "#f59e0b",
    "#ef4444",
  ];

  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <h2 className="text-xl font-semibold mb-6">
        {title}
      </h2>

      <ResponsiveContainer
        width="100%"
        height={350}
      >
        <>
          {type ===
            "bar" && (
            <BarChart
              data={data}
            >
              <XAxis
                dataKey={xKey}
              />

              <YAxis />

              <Tooltip />

              <Bar
                dataKey={
                  dataKey
                }
                fill="#000"
              />
            </BarChart>
          )}

          {type ===
            "line" && (
            <LineChart
              data={data}
            >
              <XAxis
                dataKey={xKey}
              />

              <YAxis />

              <Tooltip />

              <Line
                type="monotone"
                dataKey={
                  dataKey
                }
                stroke="#000"
              />
            </LineChart>
          )}

          {type ===
            "pie" && (
            <PieChart>
              <Pie
                data={data}
                dataKey={
                  dataKey
                }
                label
              >
                {data.map(
                  (
                    entry,
                    index
                  ) => (
                    <Cell
                      key={
                        index
                      }
                      fill={
                        COLORS[
                          index %
                            COLORS.length
                        ]
                      }
                    />
                  )
                )}
              </Pie>

              <Tooltip />
            </PieChart>
          )}
        </>
      </ResponsiveContainer>
    </div>
  );
}