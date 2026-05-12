import { useEffect, useState } from "react";

import MainLayout from "../layouts/MainLayout";

import api from "../services/api";

import {
  Calendar,
  momentLocalizer,
} from "react-big-calendar";

import moment from "moment";

import "react-big-calendar/lib/css/react-big-calendar.css";

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
          res.data
            .filter(
              (ticket) =>
                ticket.due_date
            )
            .map((ticket) => ({

              title:
                `${ticket.title} (${ticket.priority})`,

              start:
                new Date(
                  ticket.due_date
                ),

              end:
                new Date(
                  ticket.due_date
                ),

              allDay: true,

            }));

        setEvents(
          formatted
        );

      } catch (err) {

        console.log(
          err
        );
      }
    };

  return (

    <MainLayout>

      <div className="p-6">

        <div className="mb-6">

          <h1 className="text-3xl font-bold">
            Ticket Calendar
          </h1>

          <p className="text-gray-500">
            Jira style due-date calendar
          </p>

        </div>

        <div className="bg-white p-5 rounded-2xl shadow">

          <div
            style={{
              height: "80vh",
            }}
          >

            <Calendar
              localizer={
                localizer
              }
              events={events}
              startAccessor="start"
              endAccessor="end"
              views={[
                "month",
                "week",
                "day",
                "agenda",
              ]}
            />

          </div>

        </div>

      </div>

    </MainLayout>
  );
}