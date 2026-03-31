import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    // No Supabase configured → open access mode, let everyone through
    if (!supabase) {
      setAuthenticated(true);
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthenticated(!!session);
      setLoading(false);
    });
  }, []);

  if (loading) return null;
  if (!authenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
