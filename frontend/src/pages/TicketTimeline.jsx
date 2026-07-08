import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

import {
  Gantt,
  ViewMode,
} from "gantt-task-react";

import "gantt-task-react/dist/index.css";

// =====================================================
// TICKET TIMELINE / GANTT CHART
// =====================================================

export default function TicketTimeline() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] =
    useState(true);

  useEffect(() => {
    fetchTickets();
  }, []);

  // =====================================================
  // FETCH TICKETS
  // =====================================================

  const fetchTickets = async () => {
    try {
      setLoading(true);

      const res = await api.get(
        "/tickets"
      );

      // =====================================================
      // SAFE FORMAT
      // =====================================================

      const formatted = res.data

        // FILTER INVALID TICKETS
        .filter((ticket) => {
          return (
            ticket.work_start_time ||
            ticket.created_at ||
            ticket.due_date
          );
        })

        .map((ticket) => {
          // =====================================================
          // START DATE
          // =====================================================

          let start;

          if (
            ticket.work_start_time
          ) {
            start = new Date(
              ticket.work_start_time
            );
          } else if (
            ticket.created_at
          ) {
            start = new Date(
              ticket.created_at
            );
          } else {
            start = new Date(
              ticket.due_date
            );
          }

          // =====================================================
          // INVALID DATE FIX
          // =====================================================

          if (
            isNaN(start.getTime())
          ) {
            start = new Date();
          }

          // =====================================================
          // DURATION
          // =====================================================

          const duration =
            ticket.time_spent_minutes ||
            60;

          const end = new Date(
            start
          );

          end.setMinutes(
            end.getMinutes() +
              duration
          );

          // =====================================================
          // INVALID END FIX
          // =====================================================

          if (
            isNaN(end.getTime())
          ) {
            end.setHours(
              start.getHours() + 1
            );
          }

          // =====================================================
          // PROGRESS
          // =====================================================

          let progress = 0;

          if (
            ticket.status ===
            "Completed"
          ) {
            progress = 100;
          } else if (
            ticket.status ===
            "In Progress"
          ) {
            progress = 60;
          } else if (
            ticket.status ===
            "Pending Approval"
          ) {
            progress = 90;
          }

          // =====================================================
          // BAR COLORS
          // =====================================================

          let progressColor =
            "#3b82f6";

          if (
            ticket.priority ===
            "High"
          ) {
            progressColor =
              "#ef4444";
          } else if (
            ticket.priority ===
            "Medium"
          ) {
            progressColor =
              "#f59e0b";
          } else if (
            ticket.priority ===
            "Low"
          ) {
            progressColor =
              "#22c55e";
          }

          return {
            id: String(
              ticket.id
            ),

            name:
              ticket.title ||
              "Untitled Ticket",

            start,

            end,

            type: "task",

            progress,

            isDisabled: false,

            styles: {
              progressColor,

              progressSelectedColor:
                progressColor,
            },
          };
        });

      setTasks(formatted);
    } catch (err) {
      console.error(
        "Timeline error:",
        err
      );
    } finally {
      setLoading(false);
    }
  };

  // =====================================================
  // HANDLE DRAG / RESIZE
  // =====================================================

  const handleTaskChange =
    async (task) => {
      try {
        // =====================================================
        // UPDATE UI
        // =====================================================

        setTasks((prev) =>
          prev.map((t) =>
            t.id === task.id
              ? task
              : t
          )
        );

        // =====================================================
        // CALCULATE DURATION
        // =====================================================

        const duration =
          Math.round(
            (task.end -
              task.start) /
              60000
          );

        // =====================================================
        // SAVE TO BACKEND
        // =====================================================

        await api.put(
          `/tickets/${task.id}`,
          {
            work_start_time:
              task.start,

            time_spent_minutes:
              duration,
          }
        );
      } catch (err) {
        console.error(
          "Task update failed:",
          err
        );
      }
    };

  // =====================================================
  // DELETE TASK
  // =====================================================

  const handleTaskDelete =
    (task) => {
      setTasks((prev) =>
        prev.filter(
          (t) =>
            t.id !== task.id
        )
      );
    };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10">
          <div className="text-xl font-semibold">
            Loading timeline...
          </div>
        </div>
      </MainLayout>
    );
  }

  // =====================================================
  // MAIN UI
  // =====================================================

  return (
    <MainLayout>
      <div className="p-4 lg:p-6">
        {/* ===================================================== */}
        {/* HEADER */}
        {/* ===================================================== */}

        <div className="mb-8">
          <h1 className="text-4xl font-bold">
            Ticket Timeline
          </h1>

          <p className="text-gray-500 mt-2">
            Jira-style Gantt chart
            planning board
          </p>
        </div>

        {/* ===================================================== */}
        {/* LEGEND */}
        {/* ===================================================== */}

        <div className="flex flex-wrap gap-3 mb-6">
          <Legend
            color="bg-red-500"
            label="High Priority"
          />

          <Legend
            color="bg-orange-500"
            label="Medium Priority"
          />

          <Legend
            color="bg-green-500"
            label="Low Priority"
          />
        </div>

        {/* ===================================================== */}
        {/* EMPTY STATE */}
        {/* ===================================================== */}

        {tasks.length === 0 ? (
          <div className="bg-white rounded-3xl border p-10 text-center">
            <h2 className="text-2xl font-bold mb-2">
              No Timeline Data
            </h2>

            <p className="text-gray-500">
              Create tickets and
              allocate work time to
              see timeline planning
            </p>
          </div>
        ) : (
          // =====================================================
          // GANTT CHART
          // =====================================================

          <div className="bg-white rounded-3xl shadow-sm border overflow-hidden">
            <div
              style={{
                width: "100%",
                height: "80vh",
              }}
            >
              <Gantt
                tasks={tasks}

                // =====================================================
                // VIEW
                // =====================================================

                viewMode={
                  ViewMode.Day
                }

                // =====================================================
                // DRAG / RESIZE
                // =====================================================

                onDateChange={
                  handleTaskChange
                }

                onDelete={
                  handleTaskDelete
                }

                // =====================================================
                // UI
                // =====================================================

                listCellWidth="260px"

                columnWidth={80}

                rowHeight={52}

                barCornerRadius={8}

                todayColor="rgba(59,130,246,0.12)"

                // =====================================================
                // TOOLTIP
                // =====================================================

                TooltipContent={({
                  task,
                }) => (
                  <div className="bg-black text-white p-3 rounded-xl shadow-lg text-sm">
                    <div className="font-bold mb-1">
                      {task.name}
                    </div>

                    <div>
                      Start:{" "}
                      {task.start.toLocaleString()}
                    </div>

                    <div>
                      End:{" "}
                      {task.end.toLocaleString()}
                    </div>

                    <div>
                      Progress:{" "}
                      {task.progress}
                      %
                    </div>
                  </div>
                )}
              />
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}

// =====================================================
// LEGEND COMPONENT
// =====================================================

function Legend({
  color,
  label,
}) {
  return (
    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-2xl border">
      <div
        className={`w-4 h-4 rounded-full ${color}`}
      ></div>

      <span className="text-sm font-medium">
        {label}
      </span>
    </div>
  );
}