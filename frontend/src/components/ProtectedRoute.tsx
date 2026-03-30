import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const hasAccess = localStorage.getItem("rebase_access") === "true";
  if (!hasAccess) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
