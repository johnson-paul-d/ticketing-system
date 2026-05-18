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

  const [tickets, setTickets] = useState([]);

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("All");

  const [
    priorityFilter,
    setPriorityFilter,
  ] = useState("All");

  const [
    divisionFilter,
    setDivisionFilter,
  ] = useState("All");

  const [loading, setLoading] =
    useState(true);

  /*
  =====================================================
  SORT CONFIG
  =====================================================
  */
  const [sortConfig, setSortConfig] =
    useState({
      key: "due_date",
      direction: "asc",
    });

  /*
  =====================================================
  FETCH TICKETS
  =====================================================
  */
  const fetchTickets = async () => {

    try {

      setLoading(true);

      const res = await api.get(
        "/tickets"
      );

      setTickets(res.data);

    } catch (error) {

      console.error(
        "Fetch tickets error:",
        error
      );

    } finally {

      setLoading(false);
    }
  };

  /*
  =====================================================
  SORT HANDLER
  =====================================================
  */
  const handleSort = (key) => {

    let direction = "asc";

    if (
      sortConfig.key === key &&
      sortConfig.direction === "asc"
    ) {

      direction = "desc";
    }

    setSortConfig({
      key,
      direction,
    });
  };

  /*
  =====================================================
  SOCKET EVENTS
  =====================================================
  */
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

  /*
  =====================================================
  FILTER + SORT
  =====================================================
  */
  const filteredTickets = tickets

    .filter((ticket) => {

      const matchesSearch =

        ticket.title
          ?.toLowerCase()
          .includes(
            search.toLowerCase()
          ) ||

        ticket.description
          ?.toLowerCase()
          .includes(
            search.toLowerCase()
          );

      const matchesStatus =

        statusFilter === "All" ||

        ticket.status ===
          statusFilter;

      const matchesPriority =

        priorityFilter === "All" ||

        ticket.priority ===
          priorityFilter;

      const matchesDivision =

        divisionFilter === "All" ||

        ticket.division ===
          divisionFilter;

      return (

        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesDivision
      );
    })

    /*
    =====================================================
    DYNAMIC SORT
    =====================================================
    */
    .sort((a, b) => {

      const key = sortConfig.key;

      let aValue = a[key];

      let bValue = b[key];

      /*
      =====================================================
      HANDLE DATES
      =====================================================
      */
      if (
        key === "due_date" ||
        key === "createdAt"
      ) {

        aValue = aValue
          ? new Date(aValue)
          : new Date(0);

        bValue = bValue
          ? new Date(bValue)
          : new Date(0);
      }

      /*
      =====================================================
      HANDLE STRINGS
      =====================================================
      */
      if (
        typeof aValue ===
          "string" &&
        typeof bValue ===
          "string"
      ) {

        aValue =
          aValue.toLowerCase();

        bValue =
          bValue.toLowerCase();
      }

      if (aValue < bValue) {

        return sortConfig.direction ===
          "asc"
          ? -1
          : 1;
      }

      if (aValue > bValue) {

        return sortConfig.direction ===
          "asc"
          ? 1
          : -1;
      }

      return 0;
    });

  /*
  =====================================================
  PRIORITY STYLES
  =====================================================
  */
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

  /*
  =====================================================
  STATUS STYLES
  =====================================================
  */
  const getStatusClass = (
    status
  ) => {

    switch (status) {

      case "Open":
        return "bg-yellow-100 text-yellow-700";

      case "In Progress":
        return "bg-blue-100 text-blue-700";

      case "Pending Approval":
        return "bg-orange-100 text-orange-700";

      case "Waiting For Sources":
        return "bg-purple-100 text-purple-700";

      case "Waiting For Approval":
        return "bg-orange-100 text-orange-700";

      case "Completed":
        return "bg-green-100 text-green-700";

      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  /*
  =====================================================
  DASHBOARD STATS
  =====================================================
  */
  const stats = {

    total: tickets.length,

    open: tickets.filter(
      (t) =>
        t.status === "Open"
    ).length,

    inProgress: tickets.filter(
      (t) =>
        t.status ===
        "In Progress"
    ).length,

    pendingApproval:
      tickets.filter(
        (t) =>
          t.status ===
            "Pending Approval" ||
          t.status ===
            "Waiting For Approval"
      ).length,

    completed: tickets.filter(
      (t) =>
        t.status ===
        "Completed"
    ).length,
  };

  return (

    <MainLayout>

      {/* HEADER */}
      <div className="
        flex
        flex-col
        lg:flex-row
        lg:justify-between
        lg:items-center
        gap-4
        mb-8
      ">

        <div>

          <h1 className="
            text-3xl
            font-bold
          ">
            Tickets
          </h1>

          <p className="
            text-gray-500
            mt-1
          ">
            Manage and track support tickets
          </p>
        </div>

        <button
          onClick={() =>
            navigate(
              "/create-ticket"
            )
          }
          className="
            bg-black
            text-white
            px-5
            py-3
            rounded-xl
            w-full
            lg:w-auto
            hover:bg-gray-800
          "
        >
          + Create Ticket
        </button>
      </div>

      {/* STATS */}
      <div className="
        grid
        grid-cols-5
        gap-6
        mb-8
      ">

        <StatCard
          title="Total"
          value={stats.total}
        />

        <StatCard
          title="Open"
          value={stats.open}
        />

        <StatCard
          title="In Progress"
          value={stats.inProgress}
        />

        <StatCard
          title="Pending Approval"
          value={
            stats.pendingApproval
          }
        />

        <StatCard
          title="Completed"
          value={
            stats.completed
          }
        />
      </div>

      {/* FILTERS */}
      <div className="
        bg-white
        rounded-2xl
        shadow-sm
        p-5
        mb-6
      ">

        <div className="
          grid
          grid-cols-1
          sm:grid-cols-2
          lg:grid-cols-4
          gap-4
        ">

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
            className="
              border
              p-3
              rounded-xl
            "
          />

          {/* STATUS */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(
                e.target.value
              )
            }
            className="
              border
              p-3
              rounded-xl
            "
          >
            <option>All</option>
            <option>Open</option>
            <option>
              In Progress
            </option>
            <option>
              Pending Approval
            </option>
            <option>
              Waiting For Sources
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
            value={priorityFilter}
            onChange={(e) =>
              setPriorityFilter(
                e.target.value
              )
            }
            className="
              border
              p-3
              rounded-xl
            "
          >
            <option>All</option>
            <option>
              Critical
            </option>
            <option>High</option>
            <option>
              Medium
            </option>
            <option>Low</option>
          </select>

          {/* DIVISION */}
          <select
            value={divisionFilter}
            onChange={(e) =>
              setDivisionFilter(
                e.target.value
              )
            }
            className="
              border
              p-3
              rounded-xl
            "
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

            <option value="All User">
              All User
            </option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="
        bg-white
        rounded-2xl
        shadow-sm
        overflow-x-auto
      ">

        <table className="w-full">

          {/* HEADER */}
          <thead className="
            bg-gray-50
          ">

            <tr className="
              text-left
            ">

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "title"
                  )
                }
              >
                Title
              </th>

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "division"
                  )
                }
              >
                Division
              </th>

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "category"
                  )
                }
              >
                Category
              </th>

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "priority"
                  )
                }
              >
                Priority
              </th>

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "due_date"
                  )
                }
              >
                Due Date
              </th>

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "createdAt"
                  )
                }
              >
                Created Date
              </th>

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "status"
                  )
                }
              >
                Status
              </th>

              <th
                className="
                  p-5
                  cursor-pointer
                "
                onClick={() =>
                  handleSort(
                    "assigned_to_name"
                  )
                }
              >
                Assigned
              </th>

              <th className="p-5">
                Action
              </th>
            </tr>
          </thead>

          {/* BODY */}
          <tbody>

            {filteredTickets.map(
              (ticket) => {

                const isOverdue =

                  ticket.due_date &&

                  new Date(
                    ticket.due_date
                  ) < new Date() &&

                  ticket.status !==
                    "Completed";

                return (

                  <tr
                    key={ticket.id}
                    className={`
                      border-t
                      hover:bg-gray-50
                      ${
                        isOverdue
                          ? "bg-red-50"
                          : ""
                      }
                    `}
                  >

                    {/* TITLE */}
                    <td className="p-5">

                      <div>

                        <p className="
                          font-semibold
                        ">
                          {
                            ticket.title
                          }
                        </p>

                        <p className="
                          text-sm
                          text-gray-500
                        ">
                          {
                            ticket.description
                          }
                        </p>
                      </div>
                    </td>

                    {/* DIVISION */}
                    <td className="p-5">
                      {
                        ticket.division
                      }
                    </td>

                    {/* CATEGORY */}
                    <td className="p-5">
                      {
                        ticket.category
                      }
                    </td>

                    {/* PRIORITY */}
                    <td className="p-5">

                      <span
                        className={`
                          px-3
                          py-1
                          rounded-full
                          text-sm
                          ${getPriorityClass(
                            ticket.priority
                          )}
                        `}
                      >
                        {
                          ticket.priority
                        }
                      </span>
                    </td>

                    {/* DUE DATE */}
                    <td className="p-5">

                      {ticket.due_date ? (

                        <span
                          className={
                            isOverdue
                              ? "text-red-600 font-semibold"
                              : ""
                          }
                        >

                          {new Date(
                            ticket.due_date
                          ).toLocaleDateString()}

                        </span>

                      ) : (

                        <span className="
                          text-gray-400
                        ">
                          No Due Date
                        </span>
                      )}
                    </td>

                    {/* CREATED DATE */}
                    <td className="p-5">

                      {ticket.createdAt ? (

                        new Date(
                          ticket.createdAt
                        ).toLocaleDateString()

                      ) : (

                        <span className="
                          text-gray-400
                        ">
                          —
                        </span>
                      )}
                    </td>

                    {/* STATUS */}
                    <td className="p-5">

                      <span
                        className={`
                          px-3
                          py-1
                          rounded-full
                          text-sm
                          ${getStatusClass(
                            ticket.status
                          )}
                        `}
                      >
                        {
                          ticket.status
                        }
                      </span>
                    </td>

                    {/* ASSIGNED */}
                    <td className="p-5">

                      {
                        ticket.assigned_to_name ||

                        ticket.assigned_to ||

                        "Unassigned"
                      }
                    </td>

                    {/* ACTION */}
                    <td className="p-5">

                      <button
                        onClick={() =>
                          navigate(
                            `/tickets/${ticket.id}`
                          )
                        }
                        className="
                          bg-black
                          text-white
                          px-4
                          py-2
                          rounded-lg
                          hover:bg-gray-800
                        "
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              }
            )}
          </tbody>
        </table>

        {/* EMPTY */}
        {!loading &&
          filteredTickets.length ===
            0 && (

          <div className="
            p-10
            text-center
            text-gray-500
          ">
            No tickets found
          </div>
        )}

        {/* LOADING */}
        {loading && (

          <div className="
            p-10
            text-center
            text-gray-500
          ">
            Loading tickets...
          </div>
        )}
      </div>
    </MainLayout>
  );
}

/*
=====================================================
STAT CARD
=====================================================
*/
function StatCard({
  title,
  value,
}) {

  return (

    <div className="
      bg-white
      rounded-2xl
      p-6
      shadow-sm
    ">

      <p className="
        text-gray-500
        text-sm
      ">
        {title}
      </p>

      <h2 className="
        text-3xl
        font-bold
        mt-2
      ">
        {value}
      </h2>
    </div>
  );
}