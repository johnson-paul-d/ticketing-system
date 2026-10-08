import { Navigate, useLocation } from "react-router-dom";
import useAuthStore from "../store/authStore";
import { isAdmin, isTeamMember } from "../constants/roles";

// Legacy allowedRoles tokens are matched by role *family*, so the team-suffixed
// roles (e.g. "Admin - Marketing") satisfy an "Admin" requirement.
const roleMatchers = {
  Admin: (u) => isAdmin(u),
  "Super Admin": (u) => u?.role === "Super Admin",
  "Team Member": (u) => isTeamMember(u),
  User: (u) => !isAdmin(u) && !isTeamMember(u),
};

export default function ProtectedRoute({ children, allowedRoles, requireAdmin, allow }) {
  const user = useAuthStore((state) => state.user);
  const { pathname } = useLocation();
  if (!user) return <Navigate to="/" />;
  // A sign-in with a temporary password goes to one page until a password of
  // the person's own is set; the server refuses everything else anyway.
  if (user.mustChangePassword && pathname !== "/change-password") return <Navigate to="/change-password" />;
  if (allow && !allow(user)) return <Navigate to="/dashboard" />;
  if (requireAdmin && !isAdmin(user)) return <Navigate to="/dashboard" />;
  if (allowedRoles) {
    const ok = allowedRoles.some((r) =>
      roleMatchers[r] ? roleMatchers[r](user) : user?.role === r
    );
    if (!ok) return <Navigate to="/dashboard" />;
  }
  return children;
}