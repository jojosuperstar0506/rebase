import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";

function decodeJwtPayload(token: string): Record<string, unknown> {
  // JWT uses base64url encoding (- and _ instead of + and /)
  // atob() requires standard base64 — must convert first
  const base64url = token.split(".")[1];
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = decodeJwtPayload(token);
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const token = localStorage.getItem("rebase_token");
  if (!isTokenValid(token)) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
