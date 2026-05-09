import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import MainLayout from "../layouts/MainLayout";
import api from "../services/api";

import useAuthStore from "../store/authStore";

export default function Kanban() {
  const navigate = useNavigate();

  const user = useAuthStore(
    (state) => state.user
  );

  const [tickets, setTickets] = useState([]);

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");

      let data = res.data;

      // TEAM MEMBER -> assigned only
      if (user?.role === "Team Member") {
        data = data.filter(
          (t) => t.assigned === user.name
        );
      }

      setTickets(data);
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, []);

  const openTickets = tickets.filter(
    (t) => t.status === "Open"
  );

  const progressTickets = tickets.filter(
    (t) => t.status === "In Progress"
  );

  const resolvedTickets = tickets.filter(
    (t) => t.status === "Resolved"
  );

  const renderCard = (ticket) => (
    <div
      key={ticket.id}
      onClick={() =>
        navigate(`/tickets/${ticket.id}`)
      }
      className="bg-white rounded-2xl p-4 shadow-sm mb-4 cursor-pointer hover:shadow-lg transition"
    >
      <div className="flex justify-between items-start">
        <h3 className="font-semibold text-lg">
          {ticket.title}
        </h3>

        <span
          className={`text-xs px-3 py-1 rounded-full ${
            ticket.priority === "High"
              ? "bg-red-100 text-red-600"
              : ticket.priority === "Medium"
              ? "bg-yellow-100 text-yellow-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {ticket.priority}
        </span>
      </div>

      <p className="text-gray-500 text-sm mt-3 line-clamp-3">
        {ticket.description}
      </p>

      <div className="mt-5 flex justify-between items-center">
        <span className="text-sm text-gray-500">
          {ticket.assigned}
        </span>

        <span className="text-xs text-gray-400">
          {ticket.id}
        </span>
      </div>
    </div>
  );

  const renderColumn = (
    title,
    tickets,
    bgColor
  ) => (
    <div className={`${bgColor} rounded-2xl p-4`}>
      <div className="flex justify-between items-center mb-5">
        <h2 className="font-bold text-lg">
          {title}
        </h2>

        <span className="bg-black text-white text-sm px-3 py-1 rounded-full">
          {tickets.length}
        </span>
      </div>

      {tickets.length > 0 ? (
        tickets.map(renderCard)
      ) : (
        <div className="bg-white rounded-xl p-6 text-center text-gray-400">
          No tickets
        </div>
      )}
    </div>
  );

  return (
    <MainLayout>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">
            Kanban Board
          </h1>

          <p className="text-gray-500 mt-1">
            Track ticket workflow visually
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {renderColumn(
          "Open",
          openTickets,
          "bg-gray-100"
        )}

        {renderColumn(
          "In Progress",
          progressTickets,
          "bg-blue-50"
        )}

        {renderColumn(
          "Resolved",
          resolvedTickets,
          "bg-green-50"
        )}
      </div>
    </MainLayout>
  );
}