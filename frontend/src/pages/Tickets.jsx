import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import socket from "../services/socket";
import useAuthStore from "../store/authStore";
import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

export default function Tickets() {

  const navigate = useNavigate();

  const user = useAuthStore(
    (state) => state.user
  );

  const [tickets, setTickets] =
    useState([]);

  const [search, setSearch] =
    useState("");

  const [statusFilter,
    setStatusFilter,
  ] = useState("All");

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState("All");

  const [divisionFilter,
    setDivisionFilter,
  ] = useState("All");

  const [loading, setLoading] =
    useState(true);

  // =====================================
  // FETCH TICKETS
  // =====================================

  const fetchTickets = async () => {

    try {

      setLoading(true);

      const res = await api.get(
        "/tickets"
      );

      let data = res.data || [];

      // ADMIN
      if (
        user?.role === "Admin"
      ) {

        data = data;
      }

      // TEAM MEMBER
      else if (
        user?.role ===
        "Team Member"
      ) {

        data = data.filter(
          (t) =>
            t.assigned_to ===
            user.id
        );
      }

      // NORMAL USER
      else {

        data = data.filter(
          (t) =>
            t.created_by_id ===
            user.id
        );
      }

      setTickets(data);

    } catch (error) {

      console.log(error);

    } finally {

      setLoading(false);
    }
  };

  // =====================================
  // SOCKETS
  // =====================================

  useEffect(() => {

    fetchTickets();

    socket.on(
      "ticketCreated",
      fetchTickets
    );

    socket.on(
      "ticketUpdated",
      fetchTickets
    );

    socket.on(
      "ticketDeleted",
      fetchTickets
    );

    return () => {

      socket.off(
        "ticketCreated",
        fetchTickets
      );

      socket.off(
        "ticketUpdated",
        fetchTickets
      );

      socket.off(
        "ticketDeleted",
        fetchTickets
      );
    };

  }, []);

  // =====================================
  // FILTERS
  // =====================================

  const filteredTickets =
    tickets.filter((ticket) => {

      const matchesSearch =

        ticket.title
          ?.toLowerCase()
          .includes(
            search.toLowerCase()
          )

        ||

        ticket.description
          ?.toLowerCase()
          .includes(
            search.toLowerCase()
          );

      const matchesStatus =

        statusFilter ===
          "All"

        ||

        ticket.status ===
          statusFilter;

      const matchesPriority =

        priorityFilter ===
          "All"

        ||

        ticket.priority ===
          priorityFilter;

      const matchesDivision =

        divisionFilter ===
          "All"

        ||

        ticket.division ===
          divisionFilter;

      return (

        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesDivision
      );
    });

  // =====================================
  // PRIORITY COLORS
  // =====================================

  const getPriorityClass = (
    priority
  ) => {

    switch (priority) {

      case "Critical":
        return "bg-red-200 text-red-700";

      case "High":
        return "bg-red-100 text-red-600";

      case "Medium":
        return "bg-yellow-100 text-yellow-700";

      case "Low":
        return "bg-green-100 text-green-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  // =====================================
  // STATUS COLORS
  // =====================================

  const getStatusClass = (
    status
  ) => {

    switch (status) {

      case "Open":
        return "bg-yellow-100 text-yellow-700";

      case "In Progress":
        return "bg-blue-100 text-blue-700";

      case "Waiting For Approval":
        return "bg-orange-100 text-orange-700";

      case "Completed":
        return "bg-green-100 text-green-700";

      case "Resolved":
        return "bg-purple-100 text-purple-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (

    <MainLayout>

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">

        <div>

          <h1 className="text-3xl font-bold">
            Tickets
          </h1>

          <p className="text-gray-500 mt-1">
            Manage and track support tickets
          </p>

        </div>

        <button
          onClick={() =>
            navigate(
              "/create-ticket"
            )
          }
          className="bg-black text-white px-5 py-3 rounded-xl hover:bg-gray-800"
        >
          + Create Ticket
        </button>

      </div>

      {/* STATS */}
      <div className="grid grid-cols-5 gap-6 mb-8">

        <StatCard
          title="Total"
          value={tickets.length}
        />

        <StatCard
          title="Open"
          value={
            tickets.filter(
              (t) =>
                t.status ===
                "Open"
            ).length
          }
        />

        <StatCard
          title="In Progress"
          value={
            tickets.filter(
              (t) =>
                t.status ===
                "In Progress"
            ).length
          }
        />

        <StatCard
          title="Waiting Approval"
          value={
            tickets.filter(
              (t) =>
                t.status ===
                "Waiting For Approval"
            ).length
          }
        />

        <StatCard
          title="Completed"
          value={
            tickets.filter(
              (t) =>
                t.status ===
                "Completed"
            ).length
          }
        />

      </div>

      {/* FILTERS */}
      <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">

        <div className="grid grid-cols-4 gap-4">

          {/* SEARCH */}
          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
          />

          {/* STATUS */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
          >

            <option>
              All
            </option>

            <option>
              Open
            </option>

            <option>
              In Progress
            </option>

            <option>
              Waiting For Approval
            </option>

            <option>
              Completed
            </option>

          </select>

          {/* PRIORITY */}
          <select
            value={
              priorityFilter
            }
            onChange={(e) =>
              setPriorityFilter(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
          >

            <option>
              All
            </option>

            <option>
              Critical
            </option>

            <option>
              High
            </option>

            <option>
              Medium
            </option>

            <option>
              Low
            </option>

          </select>

          {/* DIVISION */}
          <select
            value={
              divisionFilter
            }
            onChange={(e) =>
              setDivisionFilter(
                e.target.value
              )
            }
            className="border p-3 rounded-xl"
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

        </div>

      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">

        <table className="w-full">

          <thead className="bg-gray-50">

            <tr className="text-left">

              <th className="p-5">
                Title
              </th>

              <th className="p-5">
                Division
              </th>

              <th className="p-5">
                Category
              </th>

              <th className="p-5">
                Priority
              </th>

              <th className="p-5">
                Status
              </th>

              <th className="p-5">
                Assigned
              </th>

              <th className="p-5">
                Action
              </th>

            </tr>

          </thead>

          <tbody>

            {filteredTickets.map(
              (ticket) => (

                <tr
                  key={ticket.id}
                  className="border-t hover:bg-gray-50"
                >

                  <td className="p-5">

                    <div>

                      <p className="font-semibold">
                        {ticket.title}
                      </p>

                      <p className="text-sm text-gray-500">
                        {ticket.description}
                      </p>

                    </div>

                  </td>

                  <td className="p-5">
                    {ticket.division}
                  </td>

                  <td className="p-5">
                    {ticket.category}
                  </td>

                  <td className="p-5">

                    <span
                      className={`px-3 py-1 rounded-full text-sm ${getPriorityClass(
                        ticket.priority
                      )}`}
                    >
                      {ticket.priority}
                    </span>

                  </td>

                  <td className="p-5">

                    <span
                      className={`px-3 py-1 rounded-full text-sm ${getStatusClass(
                        ticket.status
                      )}`}
                    >
                      {ticket.status}
                    </span>

                  </td>

                  <td className="p-5">
                    {ticket.assigned_to_name ||
                      "Unassigned"}
                  </td>

                  <td className="p-5">

                    <button
                      onClick={() =>
                        navigate(
                          `/tickets/${ticket.id}`
                        )
                      }
                      className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800"
                    >
                      View
                    </button>

                  </td>

                </tr>
              )
            )}

          </tbody>

        </table>

        {!loading &&
          filteredTickets.length ===
            0 && (

            <div className="p-10 text-center text-gray-500">
              No tickets found
            </div>
          )}

        {loading && (

          <div className="p-10 text-center text-gray-500">
            Loading tickets...
          </div>
        )}

      </div>

    </MainLayout>
  );
}

// =====================================
// STAT CARD
// =====================================

function StatCard({
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