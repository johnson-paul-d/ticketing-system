import { useEffect, useState } from "react";

import { useParams } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import useAuthStore from "../store/authStore";

export default function TicketDetails() {

  const { id } = useParams();

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

      console.log(
        "Fetching ticket:",
        id
      );

      const res = await api.get(
        `/api/tickets/${id}`
      );

      console.log(
        "Ticket response:",
        res.data
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
            "/api/auth/team-members"
          );

        console.log(
          "Team members:",
          res.data
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

        await api.put(
          `/api/tickets/${id}`,
          {
            assigned:
              selectedMember,

            changedBy:
              user?.name,

            role:
              user?.role,
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
          `/api/tickets/${id}`,
          {
            assigned:
              "Unassigned",

            changedBy:
              user?.name,

            role:
              user?.role,
          }
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

        <div className="mb-10">

          <h1 className="text-3xl font-bold">
            {ticket?.title}
          </h1>

          <p className="text-gray-500 mt-2">
            Ticket ID:
            {" "}
            {ticket?._id ||
              ticket?.id}
          </p>

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
                {ticket?.assigned ||
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
                {ticket?.createdByName}
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
                        member._id
                      }
                      value={
                        member.email
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