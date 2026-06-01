import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import Dashboard from "./pages/Dashboard";
import Tickets from "./pages/Tickets";
import CreateTicket from "./pages/CreateTicket";
import TicketDetails from "./pages/TicketDetails";
import EditTicket from "./pages/EditTicket";
import Kanban from "./pages/Kanban";
import TicketCalendar from "./pages/TicketCalendar";
import AdminPanel from "./pages/AdminPanel";
import Reports from "./pages/Reports";
import ProtectedRoute from "./components/ProtectedRoute";
import TicketTimeline from "./pages/TicketTimeTracker";
import AdminAnalytics from "./pages/AdminAnalytics";
import GoogleAdsDashboard from "./pages/GoogleAdsDashboard";
import useAuthStore from "./store/authStore";

function App() {
  const user = useAuthStore((state) => state.user);
  console.log("APP USER:", user);
console.log(
  "Google Ads Access:",
  user?.role === "Admin" ||
  user?.email?.toLowerCase() === "digitalmarketing@siegerglobal.net"
);
const canAccessGoogleAds =
  user?.role === "Admin" ||
  user?.email?.toLowerCase() === "digitalmarketing@siegerglobal.net";

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tickets"
          element={
            <ProtectedRoute>
              <Tickets />
            </ProtectedRoute>
          }
        />

        <Route
          path="/create-ticket"
          element={
            <ProtectedRoute allowedRoles={["Admin", "User"]}>
              <CreateTicket />
            </ProtectedRoute>
          }
        />

        <Route
          path="/tickets/:id"
          element={
            <ProtectedRoute>
              <TicketDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="/edit-ticket/:id"
          element={
            <ProtectedRoute allowedRoles={["Admin"]}>
              <EditTicket />
            </ProtectedRoute>
          }
        />

        <Route
          path="/kanban"
          element={
            <ProtectedRoute>
              <Kanban />
            </ProtectedRoute>
          }
        />

        <Route
          path="/calendar"
          element={
            <ProtectedRoute>
              <TicketCalendar />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["Admin"]}>
              <AdminPanel />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Reports />
            </ProtectedRoute>
          }
        />

        <Route path="/admin-analytics" element={<AdminAnalytics />} />

<Route
  path="/google-ads"
  element={
    <ProtectedRoute>
      {canAccessGoogleAds ? (
        <GoogleAdsDashboard />
      ) : (
        <Navigate to="/dashboard" replace />
      )}
    </ProtectedRoute>
  }
/>

        <Route
          path="/timeline"
          element={
            <ProtectedRoute>
              <TicketTimeline />
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;