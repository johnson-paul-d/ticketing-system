import { useEffect, useState } from "react";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import useAuthStore from "../store/authStore";

export default function Kanban() {

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

  const open =
    tickets.filter(
      (t) =>
        t.status === "Open"
    );

  const progress =
    tickets.filter(
      (t) =>
        t.status ===
        "In Progress"
    );

  const completed =
    tickets.filter(
      (t) =>
        t.status ===
        "Completed"
    );

  const Column = ({
    title,
    data,
    color,
  }) => (

    <div
      className={`rounded-3xl p-5 ${color}`}
    >

      <div className="flex justify-between mb-5">

        <h2 className="font-bold text-xl">
          {title}
        </h2>

        <div className="bg-black text-white w-8 h-8 rounded-full flex items-center justify-center">
          {data.length}
        </div>

      </div>

      <div className="space-y-4">

        {data.length === 0 ? (

          <div className="bg-white rounded-2xl p-5 text-center text-gray-400">
            No tickets
          </div>

        ) : (

          data.map((ticket) => (

            <div
              key={ticket.id}
              className="bg-white rounded-2xl p-5 shadow-sm"
            >

              <h3 className="font-semibold text-lg">
                {ticket.title}
              </h3>

              <p className="text-sm text-gray-500 mt-2">
                {ticket.category}
              </p>

              <div className="mt-4 flex justify-between">

                <span className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-full">
                  {ticket.priority}
                </span>

                <span className="text-xs bg-gray-100 px-3 py-1 rounded-full">
                  {ticket.division}
                </span>

              </div>

            </div>

          ))
        )}

      </div>

    </div>
  );

  return (

    <MainLayout>

      <h1 className="text-4xl font-bold mb-2">
        Kanban Board
      </h1>

      <p className="text-gray-500 mb-8">
        Track ticket workflow visually
      </p>

      <div className="grid grid-cols-3 gap-6">

        <Column
          title="Open"
          data={open}
          color="bg-red-50"
        />

        <Column
          title="In Progress"
          data={progress}
          color="bg-blue-50"
        />

        <Column
          title="Completed"
          data={completed}
          color="bg-green-50"
        />

      </div>

    </MainLayout>
  );
}