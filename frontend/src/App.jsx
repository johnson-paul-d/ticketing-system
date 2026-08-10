import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import Login from "./pages/login";
import ProtectedRoute from "./components/ProtectedRoute";
import useAuthStore from "./store/authStore";
import { canAccessAbm } from "./constants/abm";
import { canAccessGoogleAds, canAccessLinkedIn } from "./constants/roles";

const Dashboard          = lazy(() => import("./pages/Dashboard"));
const Tickets            = lazy(() => import("./pages/Tickets"));
const CreateTicket       = lazy(() => import("./pages/CreateTicket"));
const TicketDetails      = lazy(() => import("./pages/TicketDetails"));
const EditTicket         = lazy(() => import("./pages/EditTicket"));
const Kanban             = lazy(() => import("./pages/Kanban"));
const TicketCalendar     = lazy(() => import("./pages/TicketCalendar"));
const AdminPanel         = lazy(() => import("./pages/AdminPanel"));
const PendingApprovals   = lazy(() => import("./pages/PendingApprovals"));
const Projects           = lazy(() => import("./pages/Projects"));
const ProjectDetails     = lazy(() => import("./pages/ProjectDetails"));
const CompletionReport   = lazy(() => import("./pages/CompletionReport"));
const OpenTicketsReport  = lazy(() => import("./pages/OpenTicketsReport"));
const Reports            = lazy(() => import("./pages/Reports"));
const TicketTimeline     = lazy(() => import("./pages/TicketTimeTracker"));
const AdminAnalytics     = lazy(() => import("./pages/AdminAnalytics"));
const GoogleAdsDashboard = lazy(() => import("./pages/GoogleAdsDashboard"));
const LinkedInDashboard  = lazy(() => import("./pages/LinkedInDashboard"));
const LinkedInCallback   = lazy(() => import("./pages/LinkedInCallback"));
const AbmDashboard       = lazy(() => import("./pages/AbmDashboard"));
const AbmAccounts        = lazy(() => import("./pages/AbmAccounts"));
const AbmAccountDetails  = lazy(() => import("./pages/AbmAccountDetails"));
const AbmToday           = lazy(() => import("./pages/AbmToday"));

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-gray-400 gap-2">
      <Loader2 size={20} className="animate-spin" /> Loading…
    </div>
  );
}

function App() {
  const user = useAuthStore((state) => state.user);

  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
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
            path="/projects"
            element={
              <ProtectedRoute>
                <Projects />
              </ProtectedRoute>
            }
          />

          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectDetails />
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
            path="/pending-approvals"
            element={
              <ProtectedRoute allowedRoles={["Admin"]}>
                <PendingApprovals />
              </ProtectedRoute>
            }
          />

          <Route
            path="/completion-report"
            element={
              <ProtectedRoute allowedRoles={["Admin"]}>
                <CompletionReport />
              </ProtectedRoute>
            }
          />

          <Route
            path="/open-tickets-report"
            element={
              <ProtectedRoute allowedRoles={["Admin"]}>
                <OpenTicketsReport />
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

          <Route
            path="/admin-analytics"
            element={
              // Open to every role on purpose: the page scopes its data to the
              // viewer's own tickets for non-admins, and the server already
              // limits GET /tickets the same way. The sidebar links it for
              // everyone, so gating it here would dead-end that link.
              <ProtectedRoute>
                <AdminAnalytics />
              </ProtectedRoute>
            }
          />

          <Route
            path="/google-ads"
            element={
              <ProtectedRoute>
                {canAccessGoogleAds(user) ? (
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

          <Route
            path="/linkedin"
            element={
              <ProtectedRoute>
                {canAccessLinkedIn(user) ? (
                  <LinkedInDashboard />
                ) : (
                  <Navigate to="/dashboard" replace />
                )}
              </ProtectedRoute>
            }
          />

          {/* Guarded because /linkedin/exchange-token needs the JWT — an
              unauthenticated callback would fail with a silent 401. */}
          <Route
            path="/auth/linkedin/callback"
            element={
              <ProtectedRoute>
                <LinkedInCallback />
              </ProtectedRoute>
            }
          />

          <Route
            path="/abm"
            element={
              <ProtectedRoute>
                {canAccessAbm(user) ? <AbmDashboard /> : <Navigate to="/dashboard" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/abm/accounts"
            element={
              <ProtectedRoute>
                {canAccessAbm(user) ? <AbmAccounts /> : <Navigate to="/dashboard" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/abm/accounts/:id"
            element={
              <ProtectedRoute>
                {canAccessAbm(user) ? <AbmAccountDetails /> : <Navigate to="/dashboard" replace />}
              </ProtectedRoute>
            }
          />
          <Route
            path="/abm/today"
            element={
              <ProtectedRoute>
                {canAccessAbm(user) ? <AbmToday /> : <Navigate to="/dashboard" replace />}
              </ProtectedRoute>
            }
          />

        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
