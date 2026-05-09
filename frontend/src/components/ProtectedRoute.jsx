import { Navigate } from "react-router-dom";

import useAuthStore from "../store/authStore";

export default function ProtectedRoute({
  children,
  allowedRoles,
}) {
  const user = useAuthStore(
    (state) => state.user
  );

  // NOT LOGGED IN
  if (!user) {
    return <Navigate to="/" />;
  }

  // ROLE CHECK
  if (
    allowedRoles &&
    !allowedRoles.includes(user.role)
  ) {
    return <Navigate to="/dashboard" />;
  }

  return children;
}