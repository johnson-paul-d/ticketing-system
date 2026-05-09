import {
  useEffect,
  useMemo,
  useState,
} from "react";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import useAuthStore from "../store/authStore";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const COLORS = [
  "#2563eb",
  "#16a34a",
  "#dc2626",
  "#ca8a04",
  "#7c3aed",
  "#0891b2",
  "#9333ea",
];

export default function Dashboard() {
  const user = useAuthStore(
    (state) => state.user
  );

  const [tickets, setTickets] =
    useState([]);

  const [chartType, setChartType] =
    useState("bar");

  const [xAxis, setXAxis] =
    useState("division");

  const [
    divisionFilter,
    setDivisionFilter,
  ] = useState("All");

  const [
    categoryFilter,
    setCategoryFilter,
  ] = useState("All");

  const [dateFilter, setDateFilter] =
    useState("All");

  // FETCH
  const fetchTickets = async () => {
    try {
      const res = await api.get(
        "/tickets"
      );

      let data = res.data;

      // ADMIN
      if (
        user.role === "Admin"
      ) {
        data = data;
      }

      // TEAM MEMBER
      else if (
        user.role ===
        "Team Member"
      ) {
        data = data.filter(
          (t) =>
            t.assigned ===
            user.name
        );
      }

      // USER
      else {
        data = data.filter(
          (t) =>
            t.createdBy ===
            user.email
        );
      }

      setTickets(data);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  // DATE FILTER
  const checkDateFilter = (
    dueDate
  ) => {
    if (
      !dueDate ||
      dateFilter === "All"
    )
      return true;

    const now = new Date();

    const date =
      new Date(dueDate);

    const startOfWeek =
      new Date(now);

    startOfWeek.setDate(
      now.getDate() -
        now.getDay()
    );

    const endOfWeek =
      new Date(startOfWeek);

    endOfWeek.setDate(
      startOfWeek.getDate() +
        6
    );

    const lastWeekStart =
      new Date(startOfWeek);

    lastWeekStart.setDate(
      startOfWeek.getDate() -
        7
    );

    const lastWeekEnd =
      new Date(endOfWeek);

    lastWeekEnd.setDate(
      endOfWeek.getDate() -
        7
    );

    const nextWeekStart =
      new Date(startOfWeek);

    nextWeekStart.setDate(
      startOfWeek.getDate() +
        7
    );

    const nextWeekEnd =
      new Date(endOfWeek);

    nextWeekEnd.setDate(
      endOfWeek.getDate() +
        7
    );

    switch (dateFilter) {
      case "Today":
        return (
          date.toDateString() ===
          now.toDateString()
        );

      case "Yesterday":
        const yesterday =
          new Date(now);

        yesterday.setDate(
          now.getDate() - 1
        );

        return (
          date.toDateString() ===
          yesterday.toDateString()
        );

      case "This Week":
        return (
          date >=
            startOfWeek &&
          date <= endOfWeek
        );

      case "Last Week":
        return (
          date >=
            lastWeekStart &&
          date <= lastWeekEnd
        );

      case "Next Week":
        return (
          date >=
            nextWeekStart &&
          date <= nextWeekEnd
        );

      case "This Month":
        return (
          date.getMonth() ===
            now.getMonth() &&
          date.getFullYear() ===
            now.getFullYear()
        );

      case "Last Month":
        return (
          date.getMonth() ===
            now.getMonth() -
              1 &&
          date.getFullYear() ===
            now.getFullYear()
        );

      case "This Quarter":
        return (
          Math.floor(
            date.getMonth() /
              3
          ) ===
          Math.floor(
            now.getMonth() / 3
          )
        );

      case "Last Quarter":
        return (
          Math.floor(
            date.getMonth() /
              3
          ) ===
          Math.floor(
            now.getMonth() / 3
          ) -
            1
        );

      case "This Year":
        return (
          date.getFullYear() ===
          now.getFullYear()
        );

      case "Last Year":
        return (
          date.getFullYear() ===
          now.getFullYear() -
            1
        );

      default:
        return true;
    }
  };

  // FILTERED DATA
  const filteredTickets =
    useMemo(() => {
      return tickets.filter(
        (ticket) => {
          const divisionMatch =
            divisionFilter ===
              "All" ||
            ticket.division ===
              divisionFilter;

          const categoryMatch =
            categoryFilter ===
              "All" ||
            ticket.category ===
              categoryFilter;

          const dateMatch =
            checkDateFilter(
              ticket.dueDate
            );

          return (
            divisionMatch &&
            categoryMatch &&
            dateMatch
          );
        }
      );
    }, [
      tickets,
      divisionFilter,
      categoryFilter,
      dateFilter,
    ]);

  // CUSTOM CHART DATA
  const chartData =
    useMemo(() => {
      const grouped = {};

      filteredTickets.forEach(
        (ticket) => {
          const key =
            ticket[xAxis] ||
            "Unknown";

          if (!grouped[key]) {
            grouped[key] = 0;
          }

          grouped[key]++;
        }
      );

      return Object.keys(
        grouped
      ).map((key) => ({
        name: key,
        value: grouped[key],
      }));
    }, [
      filteredTickets,
      xAxis,
    ]);

  // STATUS DATA
  const statusChartData = [
    {
      name: "Open",
      value:
        filteredTickets.filter(
          (t) =>
            t.status ===
            "Open"
        ).length,
    },

    {
      name: "In Progress",
      value:
        filteredTickets.filter(
          (t) =>
            t.status ===
            "In Progress"
        ).length,
    },

    {
      name:
        "Waiting Approval",
      value:
        filteredTickets.filter(
          (t) =>
            t.status ===
            "Waiting For Approval"
        ).length,
    },

    {
      name: "Completed",
      value:
        filteredTickets.filter(
          (t) =>
            t.status ===
            "Completed"
        ).length,
    },
  ];

  return (
    <MainLayout>
      {/* HEADER */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold">
          Dashboard
        </h1>

        <p className="text-gray-500 mt-1">
          Enterprise analytics dashboard
        </p>
      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-2xl shadow-sm p-6 mb-8">
        <div className="grid grid-cols-5 gap-4">

          {/* DIVISION */}
          <select
            className="border p-3 rounded-xl"
            value={divisionFilter}
            onChange={(e) =>
              setDivisionFilter(
                e.target.value
              )
            }
          >
            <option value="All">
              All Divisions
            </option>

            <option value="CPS">
              CPS
            </option>

            <option value="TMD">
              TMD
            </option>

            <option value="ASTOR">
              ASTOR
            </option>
          </select>

          {/* CATEGORY */}
          <select
            className="border p-3 rounded-xl"
            value={categoryFilter}
            onChange={(e) =>
              setCategoryFilter(
                e.target.value
              )
            }
          >
            <option value="All">
              All Categories
            </option>

            <option>
              Salesforce
            </option>

            <option>
              Website
            </option>

            <option>
              Branding
            </option>

            <option>
              Reports
            </option>
          </select>

          {/* DATE */}
          <select
            className="border p-3 rounded-xl"
            value={dateFilter}
            onChange={(e) =>
              setDateFilter(
                e.target.value
              )
            }
          >
            <option value="All">
              All Dates
            </option>

            <option>
              Today
            </option>

            <option>
              Yesterday
            </option>

            <option>
              This Week
            </option>

            <option>
              Last Week
            </option>

            <option>
              Next Week
            </option>

            <option>
              This Month
            </option>

            <option>
              Last Month
            </option>

            <option>
              This Quarter
            </option>

            <option>
              Last Quarter
            </option>

            <option>
              This Year
            </option>

            <option>
              Last Year
            </option>
          </select>

          {/* CHART TYPE */}
          <select
            className="border p-3 rounded-xl"
            value={chartType}
            onChange={(e) =>
              setChartType(
                e.target.value
              )
            }
          >
            <option value="bar">
              Bar
            </option>

            <option value="line">
              Line
            </option>

            <option value="pie">
              Pie
            </option>
          </select>

          {/* X AXIS */}
          <select
            className="border p-3 rounded-xl"
            value={xAxis}
            onChange={(e) =>
              setXAxis(
                e.target.value
              )
            }
          >
            <option value="division">
              Division
            </option>

            <option value="category">
              Category
            </option>

            <option value="priority">
              Priority
            </option>

            <option value="status">
              Status
            </option>

            <option value="assigned">
              Assigned
            </option>
          </select>
        </div>
      </div>

      {/* METRICS */}
      <div className="grid grid-cols-4 gap-6 mb-8">
        <MetricCard
          title="Total Tickets"
          value={
            filteredTickets.length
          }
        />

        <MetricCard
          title="Open"
          value={
            filteredTickets.filter(
              (t) =>
                t.status ===
                "Open"
            ).length
          }
        />

        <MetricCard
          title="In Progress"
          value={
            filteredTickets.filter(
              (t) =>
                t.status ===
                "In Progress"
            ).length
          }
        />

        <MetricCard
          title="Completed"
          value={
            filteredTickets.filter(
              (t) =>
                t.status ===
                "Completed"
            ).length
          }
        />
      </div>

      {/* FIRST ROW */}
      <div className="grid grid-cols-2 gap-6 mb-8">

        {/* STATUS */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6">
            Ticket Status Distribution
          </h2>

          <div className="h-[350px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <PieChart>
                <Pie
                  data={
                    statusChartData
                  }
                  dataKey="value"
                  nameKey="name"
                  outerRadius={120}
                  label
                >
                  {statusChartData.map(
                    (
                      entry,
                      index
                    ) => (
                      <Cell
                        key={index}
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
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* PRIORITY */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6">
            Priority Distribution
          </h2>

          <div className="h-[350px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={[
                  {
                    name: "Low",
                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) =>
                          t.priority ===
                          "Low"
                      ).length,
                  },

                  {
                    name:
                      "Medium",
                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) =>
                          t.priority ===
                          "Medium"
                      ).length,
                  },

                  {
                    name:
                      "High",
                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) =>
                          t.priority ===
                          "High"
                      ).length,
                  },

                  {
                    name:
                      "Critical",
                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) =>
                          t.priority ===
                          "Critical"
                      ).length,
                  },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="name" />

                <YAxis />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="value"
                  fill="#dc2626"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECOND ROW */}
      <div className="grid grid-cols-2 gap-6 mb-8">

        {/* DIVISION */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6">
            Division Analytics
          </h2>

          <div className="h-[350px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={[
                  {
                    name: "CPS",
                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) =>
                          t.division ===
                          "CPS"
                      ).length,
                  },

                  {
                    name: "TMD",
                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) =>
                          t.division ===
                          "TMD"
                      ).length,
                  },

                  {
                    name:
                      "ASTOR",
                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) =>
                          t.division ===
                          "ASTOR"
                      ).length,
                  },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="name" />

                <YAxis />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="value"
                  fill="#7c3aed"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TEAM */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6">
            Team Workload
          </h2>

          <div className="h-[350px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={Object.entries(
                  filteredTickets.reduce(
                    (
                      acc,
                      ticket
                    ) => {
                      const assigned =
                        ticket.assigned ||
                        "Unassigned";

                      acc[
                        assigned
                      ] =
                        (acc[
                          assigned
                        ] || 0) + 1;

                      return acc;
                    },
                    {}
                  )
                ).map(
                  ([
                    key,
                    value,
                  ]) => ({
                    name: key,
                    value,
                  })
                )}
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="name" />

                <YAxis />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="value"
                  fill="#2563eb"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* THIRD ROW */}
      <div className="grid grid-cols-2 gap-6 mb-8">

        {/* CATEGORY */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6">
            Category Analytics
          </h2>

          <div className="h-[350px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <PieChart>
                <Pie
                  data={Object.entries(
                    filteredTickets.reduce(
                      (
                        acc,
                        ticket
                      ) => {
                        const category =
                          ticket.category ||
                          "Others";

                        acc[
                          category
                        ] =
                          (acc[
                            category
                          ] || 0) + 1;

                        return acc;
                      },
                      {}
                    )
                  ).map(
                    ([
                      key,
                      value,
                    ]) => ({
                      name: key,
                      value,
                    })
                  )}
                  dataKey="value"
                  nameKey="name"
                  outerRadius={120}
                  label
                >
                  {COLORS.map(
                    (
                      color,
                      index
                    ) => (
                      <Cell
                        key={index}
                        fill={color}
                      />
                    )
                  )}
                </Pie>

                <Tooltip />

                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* SLA */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-6">
            SLA Risk Analytics
          </h2>

          <div className="h-[350px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={[
                  {
                    name:
                      "Overdue",

                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) => {
                          if (
                            !t.dueDate
                          )
                            return false;

                          return (
                            new Date(
                              t.dueDate
                            ) <
                              new Date() &&
                            t.status !==
                              "Completed"
                          );
                        }
                      ).length,
                  },

                  {
                    name:
                      "Due Today",

                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) => {
                          if (
                            !t.dueDate
                          )
                            return false;

                          return (
                            new Date(
                              t.dueDate
                            ).toDateString() ===
                            new Date().toDateString()
                          );
                        }
                      ).length,
                  },

                  {
                    name:
                      "Healthy",

                    value:
                      filteredTickets.filter(
                        (
                          t
                        ) => {
                          if (
                            !t.dueDate
                          )
                            return false;

                          return (
                            new Date(
                              t.dueDate
                            ) >
                            new Date()
                          );
                        }
                      ).length,
                  },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="name" />

                <YAxis />

                <Tooltip />

                <Legend />

                <Bar
                  dataKey="value"
                  fill="#ca8a04"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* WEEKLY TREND */}
      {/* WEEK NUMBER TREND */}
<div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
  <h2 className="text-2xl font-bold mb-6">
    Incoming Tickets - Week Wise Trend
  </h2>

  <div className="h-[400px]">
    <ResponsiveContainer
      width="100%"
      height="100%"
    >
      <LineChart
        data={Object.entries(
          filteredTickets.reduce(
            (
              acc,
              ticket
            ) => {

              const created =
                new Date(
                  ticket.createdAt
                );

              // YEAR
              const year =
                created.getFullYear();

              // WEEK NUMBER
              const firstDay =
                new Date(
                  year,
                  0,
                  1
                );

              const days =
                Math.floor(
                  (
                    created -
                    firstDay
                  ) /
                    (
                      24 *
                      60 *
                      60 *
                      1000
                    )
                );

              const weekNumber =
                Math.ceil(
                  (
                    days +
                    firstDay.getDay() +
                    1
                  ) / 7
                );

              const label =
                `${year} - W${weekNumber}`;

              acc[label] =
                (acc[label] ||
                  0) + 1;

              return acc;
            },
            {}
          )
        )
          .map(
            ([
              key,
              value,
            ]) => ({
              name: key,
              value,
            })
          )
          .sort(
            (a, b) =>
              a.name.localeCompare(
                b.name
              )
          )}
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis dataKey="name" />

        <YAxis />

        <Tooltip />

        <Legend />

        <Line
          type="monotone"
          dataKey="value"
          stroke="#2563eb"
          strokeWidth={4}
        />
      </LineChart>
    </ResponsiveContainer>
  </div>
</div>

{/* MONTHLY STATUS TREND */}
<div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
  <h2 className="text-2xl font-bold mb-6">
    Monthly Ticket Trend By Status
  </h2>

  <div className="h-[450px]">
    <ResponsiveContainer
      width="100%"
      height="100%"
    >
      <BarChart
        data={Object.values(
          filteredTickets.reduce(
            (
              acc,
              ticket
            ) => {

              const created =
                new Date(
                  ticket.createdAt
                );

              const month =
                created.toLocaleString(
                  "default",
                  {
                    month:
                      "short",
                  }
                );

              const year =
                created.getFullYear();

              const key =
                `${month} ${year}`;

              if (!acc[key]) {
                acc[key] = {
                  month: key,

                  Open: 0,

                  "In Progress":
                    0,

                  "Waiting For Approval":
                    0,

                  Completed: 0,
                };
              }

              const status =
                ticket.status ||
                "Open";

              if (
                acc[key][
                  status
                ] !== undefined
              ) {
                acc[key][
                  status
                ] += 1;
              }

              return acc;
            },
            {}
          )
        )}
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis dataKey="month" />

        <YAxis />

        <Tooltip />

        <Legend />

        <Bar
          dataKey="Open"
          stackId="a"
          fill="#facc15"
        />

        <Bar
          dataKey="In Progress"
          stackId="a"
          fill="#2563eb"
        />

        <Bar
          dataKey="Waiting For Approval"
          stackId="a"
          fill="#f97316"
        />

        <Bar
          dataKey="Completed"
          stackId="a"
          fill="#16a34a"
        />
      </BarChart>
    </ResponsiveContainer>
  </div>
</div>
      {/* CUSTOM CHART */}
      <div className="bg-white rounded-2xl p-6 shadow-sm mb-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">
            Custom Analytics Builder
          </h2>
        </div>

        <div className="h-[500px]">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <>
              {chartType ===
                "bar" && (
                <BarChart
                  data={
                    chartData
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis dataKey="name" />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Bar
                    dataKey="value"
                    fill="#2563eb"
                  />
                </BarChart>
              )}

              {chartType ===
                "line" && (
                <LineChart
                  data={
                    chartData
                  }
                >
                  <CartesianGrid strokeDasharray="3 3" />

                  <XAxis dataKey="name" />

                  <YAxis />

                  <Tooltip />

                  <Legend />

                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="#16a34a"
                    strokeWidth={3}
                  />
                </LineChart>
              )}

              {chartType ===
                "pie" && (
                <PieChart>
                  <Pie
                    data={
                      chartData
                    }
                    dataKey="value"
                    nameKey="name"
                    outerRadius={180}
                    label
                  >
                    {chartData.map(
                      (
                        entry,
                        index
                      ) => (
                        <Cell
                          key={index}
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

                  <Legend />
                </PieChart>
              )}
            </>
          </ResponsiveContainer>
        </div>
      </div>
    </MainLayout>
  );
}

// METRIC CARD
function MetricCard({
  title,
  value,
}) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm">
      <p className="text-gray-500 text-sm">
        {title}
      </p>

      <h2 className="text-3xl font-bold mt-2">
        {value}
      </h2>
    </div>
  );
}
