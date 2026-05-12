import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";

import Login from "./pages/login";
import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import TicketDetails from "./pages/TicketDetails";
import CreateTicket from "./pages/CreateTicket";
import EditTicket from "./pages/EditTicket";
import Kanban from "./pages/Kanban";
import Reports from "./pages/Reports";
import AdminPanel from "./pages/AdminPanel";
import TicketCalendar from "./pages/TicketCalendar";

function App() {
  return (
    <BrowserRouter>

      <Routes>

        {/* LOGIN */}
        <Route
          path="/"
          element={<Login />}
        />

        {/* DASHBOARD */}
        <Route
          path="/dashboard"
          element={<Dashboard />}
        />

        {/* TICKETS */}
        <Route
          path="/tickets"
          element={<Tickets />}
        />

        {/* TICKET DETAILS */}
        <Route
          path="/tickets/:id"
          element={<TicketDetails />}
        />

        {/* EDIT TICKET */}
        <Route
          path="/tickets/edit/:id"
          element={<EditTicket />}
        />

        {/* CREATE TICKET */}
        <Route
          path="/create-ticket"
          element={<CreateTicket />}
        />

        {/* KANBAN */}
        <Route
          path="/kanban"
          element={<Kanban />}
        />

        {/* REPORTS */}
        <Route
          path="/reports"
          element={<Reports />}
        />

        {/* CALENDAR */}
        <Route
          path="/calendar"
          element={<TicketCalendar />}
        />

        {/* ADMIN PANEL */}
        <Route
          path="/admin"
          element={<AdminPanel />}
        />

        {/* FALLBACK */}
        <Route
          path="*"
          element={
            <Navigate to="/" />
          }
        />

      </Routes>

    </BrowserRouter>
  );
}

export default App;