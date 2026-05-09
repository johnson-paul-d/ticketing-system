import {
  BrowserRouter,
  Routes,
  Route,
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import TicketDetails from "./pages/TicketDetails";
import CreateTicket from "./pages/CreateTicket";
import Kanban from "./pages/Kanban";
import Reports from "./pages/Reports";
import AdminPanel from "./pages/AdminPanel";

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

        {/* ADMIN PANEL */}
        <Route
          path="/admin"
          element={<AdminPanel />}
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;