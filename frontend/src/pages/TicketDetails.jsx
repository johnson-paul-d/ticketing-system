import { useEffect, useState } from "react";

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

  const user = useAuthStore(
    (state) => state.user
  );

  const [ticket, setTicket] =
    useState(null);

  const [teamMembers, setTeamMembers] =
    useState([]);

  const [selectedMember, setSelectedMember] =
    useState("");

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  // =====================================
  // FETCH TICKET
  // =====================================
  const fetchTicket = async () => {

    try {

      const res = await api.get(
        `/tickets/${id}`
      );

      setTicket(res.data);

    } catch (error) {

      console.log(
        "Ticket fetch error:",
        error
      );

      setError(
        error?.response?.data
          ?.message ||
          "Failed to load ticket"
      );

    } finally {

      setLoading(false);
    }
  };

  // =====================================
  // FETCH TEAM MEMBERS
  // =====================================
  const fetchTeamMembers =
    async () => {

      try {

        const res =
          await api.get(
            "/auth/team-members"
          );

        if (
          Array.isArray(
            res.data
          )
        ) {

          setTeamMembers(
            res.data
          );

        } else {

          setTeamMembers([]);
        }

      } catch (error) {

        console.log(
          "Team member error:",
          error
        );

        setTeamMembers([]);
      }
    };

  useEffect(() => {

    fetchTicket();

    fetchTeamMembers();

  }, []);

  // =====================================
  // ASSIGN TICKET
  // =====================================
  const assignTicket =
    async () => {

      if (!selectedMember) {

        alert(
          "Select team member"
        );

        return;
      }

      try {

        const member =
          teamMembers.find(
            (m) =>
              m.id ===
              selectedMember
          );

        await api.put(
          `/tickets/${id}/assign`,
          {
            assigned_to:
              member.id,

            assigned_to_name:
              member.name,
          }
        );

        alert(
          "Ticket assigned"
        );

        fetchTicket();

      } catch (error) {

        console.log(error);

        alert(
          "Assign failed"
        );
      }
    };

  // =====================================
  // UNASSIGN
  // =====================================
  const unassignTicket =
    async () => {

      try {

        await api.put(
          `/tickets/${id}/unassign`
        );

        alert(
          "Ticket unassigned"
        );

        fetchTicket();

      } catch (error) {

        console.log(error);

        alert(
          "Failed to unassign"
        );
      }
    };

  // =====================================
  // DELETE TICKET
  // =====================================
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
          `/tickets/${id}`
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

  // =====================================
  // LOADING
  // =====================================
  if (loading) {

    return (
      <MainLayout>
        <div className="p-10">
          Loading ticket...
        </div>
      </MainLayout>
    );
  }

  // =====================================
  // ERROR
  // =====================================
  if (error) {

    return (
      <MainLayout>
        <div className="p-10 text-red-500">
          {error}
        </div>
      </MainLayout>
    );
  }

  // =====================================
  // NO TICKET
  // =====================================
  if (!ticket) {

    return (
      <MainLayout>
        <div className="p-10">
          Ticket not found
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>

      <div className="bg-white rounded-2xl shadow-sm p-8">

        <div className="mb-10 flex justify-between items-start">

          <div>

            <h1 className="text-3xl font-bold">
              {ticket?.title}
            </h1>

            <p className="text-gray-500 mt-2">
              Ticket ID:
              {" "}
              {ticket?.id}
            </p>

          </div>

          {user?.role ===
            "Admin" && (

            <button
              onClick={
                deleteTicket
              }
              className="bg-red-500 hover:bg-red-600 text-white px-5 py-3 rounded-xl"
            >
              Delete Ticket
            </button>
          )}

        </div>

        <div className="grid grid-cols-2 gap-10">

          <div className="space-y-6">

            <div>

              <h2 className="font-semibold mb-2">
                Description
              </h2>

              <p>
                {ticket?.description}
              </p>

            </div>

            <div>

              <h2 className="font-semibold mb-2">
                Priority
              </h2>

              <p>
                {ticket?.priority}
              </p>

            </div>

            <div>

              <h2 className="font-semibold mb-2">
                Category
              </h2>

              <p>
                {ticket?.category}
              </p>

            </div>

          </div>

          <div className="space-y-6">

            <div>

              <h2 className="font-semibold mb-2">
                Assigned To
              </h2>

              <p>
                {ticket?.assigned_to_name ||
                  "Unassigned"}
              </p>

            </div>

            <div>

              <h2 className="font-semibold mb-2">
                Status
              </h2>

              <p>
                {ticket?.status}
              </p>

            </div>

            <div>

              <h2 className="font-semibold mb-2">
                Created By
              </h2>

              <p>
                {ticket?.created_by_name}
              </p>

            </div>

          </div>

        </div>

        {user?.role ===
          "Admin" && (

          <div className="mt-10 border-t pt-8">

            <h2 className="text-2xl font-semibold mb-5">
              Assign Ticket
            </h2>

            <div className="flex gap-4 items-center">

              <select
                value={
                  selectedMember
                }
                onChange={(e) =>
                  setSelectedMember(
                    e.target.value
                  )
                }
                className="border p-3 rounded-xl min-w-[300px]"
              >

                <option value="">
                  Select Team Member
                </option>

                {teamMembers.map(
                  (member) => (

                    <option
                      key={
                        member.id
                      }
                      value={
                        member.id
                      }
                    >
                      {member.name}
                      {" - "}
                      {member.email}
                    </option>
                  )
                )}

              </select>

              <button
                onClick={
                  assignTicket
                }
                className="bg-black text-white px-6 py-3 rounded-xl"
              >
                Assign
              </button>

              <button
                onClick={
                  unassignTicket
                }
                className="border px-6 py-3 rounded-xl"
              >
                Unassign
              </button>

            </div>

          </div>
        )}

      </div>

    </MainLayout>
  );
}