import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const hasAccess = localStorage.getItem("rebase_access") === "true";
  if (!hasAccess) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
