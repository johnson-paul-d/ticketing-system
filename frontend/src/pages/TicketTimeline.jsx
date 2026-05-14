import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

import {
  Gantt,
  ViewMode,
} from "gantt-task-react";

import "gantt-task-react/dist/index.css";

export default function TicketTimeline() {
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    fetchTickets();
  }, []);

  // =====================================================
  // FETCH TICKETS
  // =====================================================

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");

      const formatted = res.data.map(
        (ticket) => {
          const start =
            ticket.work_start_time
              ? new Date(
                  ticket.work_start_time
                )
              : new Date(ticket.created_at);

          const duration =
            ticket.time_spent_minutes || 60;

          const end = new Date(start);

          end.setMinutes(
            end.getMinutes() + duration
          );

          let progress = 0;

          if (
            ticket.status === "Completed"
          ) {
            progress = 100;
          } else if (
            ticket.status === "In Progress"
          ) {
            progress = 60;
          } else if (
            ticket.status ===
            "Pending Approval"
          ) {
            progress = 90;
          }

          return {
            id: String(ticket.id),

            name: ticket.title,

            start,

            end,

            type: "task",

            progress,

            isDisabled: false,

            styles: {
              progressColor:
                ticket.priority === "High"
                  ? "#ef4444"
                  : "#3b82f6",

              progressSelectedColor:
                "#2563eb",
            },
          };
        }
      );

      setTasks(formatted);
    } catch (err) {
      console.error(err);
    }
  };

  // =====================================================
  // MOVE TASK
  // =====================================================

  const handleTaskChange = async (
    task
  ) => {
    try {
      const duration =
        (task.end - task.start) / 60000;

      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? task : t
        )
      );

      await api.put(
        `/tickets/${task.id}`,
        {
          work_start_time: task.start,
          time_spent_minutes:
            Math.round(duration),
        }
      );
    } catch (err) {
      console.error(err);
    }
  };

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
            Jira-style Gantt planning
            board
          </p>
        </div>

        {/* ===================================================== */}
        {/* TIMELINE */}
        {/* ===================================================== */}

        <div className="bg-white rounded-3xl shadow-sm border p-4 overflow-hidden">
          <div
            style={{
              width: "100%",
              height: "80vh",
            }}
          >
            <Gantt
              tasks={tasks}
              viewMode={ViewMode.Day}

              onDateChange={
                handleTaskChange
              }

              listCellWidth="240px"

              columnWidth={80}

              rowHeight={52}

              barCornerRadius={8}

              todayColor="rgba(59,130,246,0.12)"
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}