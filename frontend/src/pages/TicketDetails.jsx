import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
  useNavigate,
} from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import useAuthStore from "../store/authStore";

export default function TicketDetails() {

  const { id } = useParams();

  const navigate = useNavigate();

  const user =
    useAuthStore(
      (state) => state.user
    );

  const [ticket, setTicket] =
    useState(null);

  const [users, setUsers] =
    useState([]);

  const [selectedUser, setSelectedUser] =
    useState("");

  const [dueDate, setDueDate] =
    useState("");

  const [history, setHistory] =
    useState([]);

  useEffect(() => {

    fetchTicket();

    fetchUsers();

  }, []);

  // FETCH TICKET
  const fetchTicket =
    async () => {

      try {

        const res =
          await api.get(
            `/tickets/${id}`
          );

        setTicket(res.data);

        setDueDate(
          res.data.due_date || ""
        );

        setHistory(
          res.data.history || []
        );

      } catch (error) {

        console.log(error);
      }
    };

  // FETCH USERS
  const fetchUsers =
    async () => {

      try {

        const res =
          await api.get("/users");

        setUsers(res.data);

      } catch (error) {

        console.log(error);
      }
    };

  // ASSIGN TICKET
  const assignTicket =
    async () => {

      if (!selectedUser) {

        alert(
          "Select a team member"
        );

        return;
      }

      try {

        const selected =
          users.find(
            (u) =>
              u.id === selectedUser
          );

        await api.put(
          `/tickets/${ticket.id}/assign`,
          {
            assigned_to:
              selected.id,

            assigned_to_name:
              selected.name,
          }
        );

        alert(
          "Ticket assigned"
        );

        fetchTicket();

      } catch (error) {

        console.log(error);

        alert(
          "Assignment failed"
        );
      }
    };

  // DELETE TICKET
  const deleteTicket =
    async () => {

      const confirmDelete =
        window.confirm(
          "Delete this ticket?"
        );

      if (!confirmDelete)
        return;

      try {

        await api.delete(
          `/tickets/${ticket.id}`
        );

        alert(
          "Ticket deleted"
        );

        navigate("/tickets");

      } catch (error) {

        console.log(error);

        alert(
          "Delete failed"
        );
      }
    };

  // UPDATE DUE DATE
  const updateDueDate =
    async () => {

      try {

        // EXISTING HISTORY
        const existingHistory =
          ticket.history || [];

        // NEW HISTORY ENTRY
        const historyEntry = {
          action:
            `Due date changed to ${dueDate}`,

          user:
            user?.name,

          date:
            new Date().toLocaleString(),
        };

        const updatedHistory = [
          ...existingHistory,
          historyEntry,
        ];

        // UPDATE TICKET
        const res =
          await api.put(
            `/tickets/${ticket.id}`,
            {
              due_date:
                dueDate,

              history:
                updatedHistory,
            }
          );

        setTicket(res.data);

        setHistory(
          updatedHistory
        );

        alert(
          "Due date updated"
        );

      } catch (error) {

        console.log(error);

        alert(
          "Failed to update due date"
        );
      }
    };

  if (!ticket) {

    return (
      <MainLayout>
        Loading...
      </MainLayout>
    );
  }

  return (

    <MainLayout>

      <div className="bg-white rounded-3xl shadow-sm p-8">

        {/* HEADER */}
        <div className="flex justify-between items-start">

          <div>

            <h1 className="text-5xl font-bold">
              {ticket.title}
            </h1>

            <p className="text-gray-500 mt-2">
              Ticket ID:
              {" "}
              {ticket.id}
            </p>

          </div>

          {user?.role ===
            "Admin" && (

            <button
              onClick={
                deleteTicket
              }
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 rounded-2xl font-semibold"
            >
              Delete Ticket
            </button>

          )}

        </div>

        {/* DETAILS */}
        <div className="grid grid-cols-2 gap-12 mt-12">

          {/* LEFT */}
          <div className="space-y-8">

            <div>
              <p className="font-semibold text-gray-500">
                Description
              </p>

              <p className="text-xl font-medium mt-2">
                {ticket.description}
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-500">
                Priority
              </p>

              <p className="text-xl font-medium mt-2">
                {ticket.priority}
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-500">
                Category
              </p>

              <p className="text-xl font-medium mt-2">
                {ticket.category}
              </p>
            </div>

          </div>

          {/* RIGHT */}
          <div className="space-y-8">

            <div>
              <p className="font-semibold text-gray-500">
                Assigned To
              </p>

              <p className="text-xl font-medium mt-2">
                {ticket.assigned_to_name ||
                  "Unassigned"}
              </p>
            </div>

            <div>
              <p className="font-semibold text-gray-500">
                Status
              </p>

              <p className="text-xl font-medium mt-2">
                {ticket.status}
              </p>
            </div>

            {/* DUE DATE */}
            <div>

              <p className="font-semibold text-gray-500">
                Due Date
              </p>

              <div className="flex gap-4 mt-3">

                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) =>
                    setDueDate(
                      e.target.value
                    )
                  }
                  className="border rounded-xl px-4 py-3"
                />

                <button
                  onClick={
                    updateDueDate
                  }
                  className="bg-black text-white px-5 py-3 rounded-xl"
                >
                  Update
                </button>

              </div>

              {ticket.due_date && (

                <p className="text-sm text-gray-500 mt-3">
                  Current Due Date:
                  {" "}
                  {ticket.due_date}
                </p>

              )}

            </div>

          </div>

        </div>

        {/* ASSIGN */}
        <div className="mt-16 border-t pt-10">

          <h2 className="text-3xl font-bold mb-6">
            Assign Ticket
          </h2>

          <div className="flex gap-4">

            <select
              value={selectedUser}
              onChange={(e) =>
                setSelectedUser(
                  e.target.value
                )
              }
              className="border px-5 py-3 rounded-xl w-96"
            >

              <option value="">
                Select Team Member
              </option>

              {users.map((u) => (

                <option
                  key={u.id}
                  value={u.id}
                >
                  {u.name}
                </option>

              ))}

            </select>

            <button
              onClick={assignTicket}
              className="bg-black text-white px-8 py-3 rounded-xl"
            >
              Assign
            </button>

          </div>

        </div>

        {/* HISTORY */}
        <div className="mt-16 border-t pt-10">

          <h2 className="text-3xl font-bold mb-8">
            Ticket History
          </h2>

          <div className="space-y-5">

            {history.length ===
            0 ? (

              <div className="text-gray-400">
                No history available
              </div>

            ) : (

              history
                .slice()
                .reverse()
                .map(
                  (
                    item,
                    index
                  ) => (

                    <div
                      key={index}
                      className="bg-gray-50 rounded-2xl p-5 border"
                    >

                      <p className="font-semibold">
                        {item.action}
                      </p>

                      <div className="flex gap-4 text-sm text-gray-500 mt-2">

                        <span>
                          {item.user}
                        </span>

                        <span>
                          {item.date}
                        </span>

                      </div>

                    </div>

                  )
                )
            )}

          </div>

        </div>

      </div>

    </MainLayout>
  );
}