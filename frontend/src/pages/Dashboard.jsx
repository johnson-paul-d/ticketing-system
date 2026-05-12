import { useEffect, useState } from "react";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import useAuthStore from "../store/authStore";

export default function Dashboard() {

  const user =
    useAuthStore(
      (state) => state.user
    );

  const [tickets, setTickets] =
    useState([]);

  useEffect(() => {

    fetchTickets();

  }, []);

  const fetchTickets =
    async () => {

      try {

        const res =
          await api.get("/tickets");

        let filtered =
          res.data;

        // TEAM MEMBER FILTER
        if (
          user?.role ===
          "Team Member"
        ) {

          filtered =
            res.data.filter(
              (ticket) =>
                ticket.assigned_to_name ===
                user.name
            );
        }

        setTickets(filtered);

      } catch (error) {

        console.log(error);
      }
    };

  const openTickets =
    tickets.filter(
      (t) =>
        t.status === "Open"
    );

  const progressTickets =
    tickets.filter(
      (t) =>
        t.status ===
        "In Progress"
    );

  const completedTickets =
    tickets.filter(
      (t) =>
        t.status ===
        "Completed"
    );

  return (

    <MainLayout>

      <h1 className="text-4xl font-bold mb-2">
        Dashboard
      </h1>

      <p className="text-gray-500 mb-8">
        Enterprise analytics dashboard
      </p>

      <div className="grid grid-cols-4 gap-6">

        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-gray-500">
            Total Tickets
          </p>

          <h2 className="text-4xl font-bold mt-2">
            {tickets.length}
          </h2>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-gray-500">
            Open
          </p>

          <h2 className="text-4xl font-bold mt-2">
            {openTickets.length}
          </h2>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-gray-500">
            In Progress
          </p>

          <h2 className="text-4xl font-bold mt-2">
            {progressTickets.length}
          </h2>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm">
          <p className="text-gray-500">
            Completed
          </p>

          <h2 className="text-4xl font-bold mt-2">
            {completedTickets.length}
          </h2>
        </div>

      </div>

    </MainLayout>
  );
}