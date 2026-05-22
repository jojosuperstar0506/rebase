import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isTokenValid } from "../utils/jwt";
import { getOnboardingState } from "@/services/onboardingApi";

/**
 * Gate every protected route on TWO things:
 *   1. Valid auth token (or legacy admin_authed flag)
 *   2. is_onboarded === true on the user's workspace
 *
 * If signed in but the wizard isn't done, kick them back to /signup at the
 * right step. Legacy invite-code accounts were backfilled to is_onboarded=true
 * by migration 010 so they sail through.
 *
 * We cache the onboarded check per session (sessionStorage) to avoid hitting
 * /api/v2/onboarding/state on every nav. Cleared on logout.
 */

type GateState =
  | { kind: "loading" }
  | { kind: "ok" }
  | { kind: "redirect"; to: string };

const ONBOARDED_KEY = "rebase_onboarded";

function readCached(): boolean | null {
  const v = sessionStorage.getItem(ONBOARDED_KEY);
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function writeCached(v: boolean) {
  sessionStorage.setItem(ONBOARDED_KEY, v ? "true" : "false");
}

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const location = useLocation();
  const token = localStorage.getItem("rebase_token");
  const adminAuthed = !!localStorage.getItem("admin_authed");

  const [gate, setGate] = useState<GateState>(() => {
    if (!isTokenValid(token) && !adminAuthed) {
      return { kind: "redirect", to: "/login" };
    }
    // Admins bypass onboarding entirely.
    if (adminAuthed) return { kind: "ok" };
    const cached = readCached();
    if (cached === true) return { kind: "ok" };
    if (cached === false) {
      return { kind: "redirect", to: "/signup" };
    }
    return { kind: "loading" };
  });

  useEffect(() => {
    if (gate.kind !== "loading") return;
    let cancelled = false;
    getOnboardingState()
      .then((s) => {
        if (cancelled) return;
        writeCached(s.is_onboarded);
        if (s.is_onboarded) {
          setGate({ kind: "ok" });
        } else {
          const step =
            s.onboarding_step === "done" ? "goals" : s.onboarding_step;
          setGate({ kind: "redirect", to: `/signup?step=${step}` });
        }
      })
      .catch(() => {
        // Backend unreachable or stale token. If we have ANY token,
        // assume legacy (invite-code) login and let them through —
        // CI pages handle their own data fallbacks.
        if (!cancelled) {
          writeCached(true);
          setGate({ kind: "ok" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [gate.kind]);

  if (gate.kind === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--color-canvas)]">
        <span
          className="text-sm text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          // loading workspace…
        </span>
      </div>
    );
  }

  if (gate.kind === "redirect") {
    return <Navigate to={gate.to} replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
