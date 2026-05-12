import { useEffect, useState } from "react";

import {
  Calendar,
  momentLocalizer,
} from "react-big-calendar";

import moment from "moment";

import "react-big-calendar/lib/css/react-big-calendar.css";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

const localizer =
  momentLocalizer(moment);

export default function TicketCalendar() {

  const [events, setEvents] =
    useState([]);

  useEffect(() => {

    fetchTickets();

  }, []);

  const fetchTickets =
    async () => {

      try {

        const res =
          await api.get(
            "/tickets"
          );

        const formatted =
          res.data.map(
            (ticket) => ({
              title:
                ticket.title,

              start: new Date(
                ticket.due_date
              ),

              end: new Date(
                ticket.due_date
              ),

              allDay: true,
            })
          );

        setEvents(formatted);

      } catch (error) {

        console.log(error);
      }
    };

  return (
    <MainLayout>

      <div className="bg-white p-6 rounded-2xl h-[80vh]">

        <h1 className="text-3xl font-bold mb-6">
          Ticket Calendar
        </h1>

        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{
            height: "100%",
          }}
        />

      </div>

    </MainLayout>
  );
}