import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { isTokenValid } from "../utils/jwt";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("rebase_token");
  if (!isTokenValid(token)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
