import { useEffect, useState } from "react";
import Sidebar from "../components/Sidebar";
import api from "../services/api";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";

function TicketCalendar() {
  const [events, setEvents] = useState([]);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await api.get("/tickets");

      const calendarEvents = res.data
        .filter((ticket) => ticket.due_date)
        .map((ticket) => ({
          id: ticket.id,
          title: `${ticket.title} (${ticket.priority})`,
          date: ticket.due_date,
        }));

      setEvents(calendarEvents);
    } catch (err) {
      console.log(err);
    }
  };

  return (
    <div className="flex bg-gray-100 min-h-screen">
      <Sidebar />

      <div className="flex-1 p-6">
        <div className="bg-white rounded-xl shadow p-5">
          <h1 className="text-3xl font-bold mb-2">
            Ticket Calendar
          </h1>

          <p className="text-gray-500 mb-6">
            Jira style calendar view
          </p>

          <FullCalendar
            plugins={[
              dayGridPlugin,
              interactionPlugin,
            ]}
            initialView="dayGridMonth"
            height="80vh"
            events={events}
            eventColor="#dc2626"
          />
        </div>
      </div>
    </div>
  );
}

export default TicketCalendar;