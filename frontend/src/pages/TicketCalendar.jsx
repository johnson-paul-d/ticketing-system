import { useEffect, useState } from "react";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

import Timeline from "react-calendar-timeline";

import moment from "moment";

import "react-calendar-timeline/style.css";

// =====================================================
// PERSON COLORS
// =====================================================

const userColors = {
  Kavinraj: "#3b82f6",
  "Johnson Paul D": "#10b981",
  "Karthick R": "#8b5cf6",
  Default: "#6b7280",
};

// =====================================================
// PRIORITY COLORS
// =====================================================

const priorityBorders = {
  High: "#ef4444",
  Medium: "#f59e0b",
  Low: "#22c55e",
};

export default function TicketTimeline() {
  const [groups, setGroups] =
    useState([]);

  const [items, setItems] =
    useState([]);

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
      // CREATE USER GROUPS
      // =====================================================

      const users = [
        ...new Set(
          res.data.map(
            (ticket) =>
              ticket.assigned_to_name ||
              "Unassigned"
          )
        ),
      ];

      const formattedGroups =
        users.map((user, index) => ({
          id: index + 1,

          title: user,
        }));

      // =====================================================
      // CREATE ITEMS
      // =====================================================

      const formattedItems =
        res.data.map(
          (ticket, index) => {
            const assignedUser =
              ticket.assigned_to_name ||
              "Unassigned";

            const group =
              formattedGroups.find(
                (g) =>
                  g.title ===
                  assignedUser
              );

            // =====================================================
            // START TIME
            // =====================================================

            let start;

            if (
              ticket.work_start_time
            ) {
              start =
                moment(
                  ticket.work_start_time
                ).valueOf();
            } else if (
              ticket.due_date
            ) {
              start = moment(
                ticket.due_date
              )
                .hour(9)
                .minute(0)
                .valueOf();
            } else {
              start =
                moment().valueOf();
            }

            // =====================================================
            // DURATION
            // =====================================================

            const duration =
              ticket.time_spent_minutes ||
              60;

            const end =
              moment(start)
                .add(
                  duration,
                  "minutes"
                )
                .valueOf();

            // =====================================================
            // COLORS
            // =====================================================

            const backgroundColor =
              userColors[
                assignedUser
              ] ||
              userColors.Default;

            const borderColor =
              priorityBorders[
                ticket.priority
              ] || "#d1d5db";

            return {
              id: ticket.id,

              group: group?.id,

              title: `
${ticket.title}

👤 ${assignedUser}
⚡ ${ticket.priority}
⏱ ${duration} mins
              `,

              start_time: start,

              end_time: end,

              canMove: true,

              canResize: "both",

              canChangeGroup: false,

              itemProps: {
                style: {
                  background:
                    backgroundColor,

                  color: "#fff",

                  border: `3px solid ${borderColor}`,

                  borderRadius:
                    "12px",

                  fontSize: "12px",

                  fontWeight:
                    "600",

                  padding:
                    "6px",

                  boxShadow:
                    "0 2px 8px rgba(0,0,0,0.15)",
                },
              },
            };
          }
        );

      setGroups(
        formattedGroups
      );

      setItems(
        formattedItems
      );
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
  // MOVE / RESIZE
  // =====================================================

  const handleItemMove =
    async (
      itemId,
      dragTime,
      newGroupOrder
    ) => {
      try {
        const updatedItems =
          items.map((item) => {
            if (
              item.id === itemId
            ) {
              const duration =
                item.end_time -
                item.start_time;

              return {
                ...item,

                start_time:
                  dragTime,

                end_time:
                  dragTime +
                  duration,
              };
            }

            return item;
          });

        setItems(updatedItems);

        const movedItem =
          updatedItems.find(
            (i) =>
              i.id === itemId
          );

        const durationMinutes =
          Math.round(
            (movedItem.end_time -
              movedItem.start_time) /
              60000
          );

        await api.put(
          `/tickets/${itemId}`,
          {
            work_start_time:
              new Date(
                movedItem.start_time
              ).toISOString(),

            time_spent_minutes:
              durationMinutes,
          }
        );
      } catch (err) {
        console.error(err);
      }
    };

  // =====================================================
  // RESIZE
  // =====================================================

  const handleItemResize =
    async (
      itemId,
      time,
      edge
    ) => {
      try {
        const updatedItems =
          items.map((item) => {
            if (
              item.id === itemId
            ) {
              if (
                edge === "left"
              ) {
                return {
                  ...item,

                  start_time:
                    time,
                };
              }

              return {
                ...item,

                end_time:
                  time,
              };
            }

            return item;
          });

        setItems(updatedItems);

        const resizedItem =
          updatedItems.find(
            (i) =>
              i.id === itemId
          );

        const durationMinutes =
          Math.round(
            (resizedItem.end_time -
              resizedItem.start_time) /
              60000
          );

        await api.put(
          `/tickets/${itemId}`,
          {
            work_start_time:
              new Date(
                resizedItem.start_time
              ).toISOString(),

            time_spent_minutes:
              durationMinutes,
          }
        );
      } catch (err) {
        console.error(err);
      }
    };

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <MainLayout>
        <div className="p-10">
          <div className="text-xl font-semibold">
            Loading team
            planner...
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
            Team Timeline
          </h1>

          <p className="text-gray-500 mt-2">
            Jira-style resource
            planner with
            swimlanes
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
        {/* WORKLOAD */}
        {/* ===================================================== */}

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {groups.map((group) => {
            const userItems =
              items.filter(
                (i) =>
                  i.group ===
                  group.id
              );

            const totalMinutes =
              userItems.reduce(
                (sum, item) =>
                  sum +
                  (item.end_time -
                    item.start_time) /
                    60000,
                0
              );

            return (
              <div
                key={group.id}
                className="bg-white rounded-2xl border p-4 shadow-sm"
              >
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{
                      background:
                        userColors[
                          group.title
                        ] ||
                        "#6b7280",
                    }}
                  ></div>

                  <h3 className="font-bold">
                    {group.title}
                  </h3>
                </div>

                <div className="text-sm text-gray-500">
                  Tickets:{" "}
                  {
                    userItems.length
                  }
                </div>

                <div className="text-sm text-gray-500">
                  Workload:{" "}
                  {Math.round(
                    totalMinutes /
                      60
                  )}
                  h
                </div>
              </div>
            );
          })}
        </div>

        {/* ===================================================== */}
        {/* TIMELINE */}
        {/* ===================================================== */}

        <div className="bg-white rounded-3xl border shadow-sm overflow-hidden">
          <div
            style={{
              width: "100%",
              height: "80vh",
            }}
          >
            <Timeline
              groups={groups}

              items={items}

              defaultTimeStart={moment()
                .startOf("day")
                .add(8, "hours")}

              defaultTimeEnd={moment()
                .startOf("day")
                .add(20, "hours")}

              canMove

              canResize="both"

              stackItems

              lineHeight={70}

              itemHeightRatio={
                0.75
              }

              sidebarWidth={220}

              itemTouchSendsClick={
                false
              }

              onItemMove={
                handleItemMove
              }

              onItemResize={
                handleItemResize
              }
            />
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

// =====================================================
// LEGEND
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