import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { ProgressRail, STEP_ORDER, type StepKey } from "./ProgressRail";
import { AccountStep } from "./steps/AccountStep";
import { BrandStep } from "./steps/BrandStep";
import { CompetitorsStep } from "./steps/CompetitorsStep";
import { GoalsStep } from "./steps/GoalsStep";
import { StepIllustration } from "./illustrations";
import { getOnboardingState } from "@/services/onboardingApi";

function isValidStep(s: string | null): s is StepKey {
  return s === "account" || s === "brand" || s === "competitors" || s === "goals";
}

export default function SignupWizard() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stepParam = params.get("step");

  const [step, setStep] = useState<StepKey>(isValidStep(stepParam) ? stepParam : "account");
  const [completed, setCompleted] = useState<Set<StepKey>>(new Set());
  const [brandName, setBrandName] = useState<string>("");
  const [bootstrapping, setBootstrapping] = useState(true);

  // On mount: if a token exists, ask the backend where we are. Lets users
  // refresh mid-wizard or come back later and pick up where they left off.
  useEffect(() => {
    const token = localStorage.getItem("rebase_token");
    if (!token) {
      setBootstrapping(false);
      return;
    }
    getOnboardingState()
      .then((s) => {
        if (s.is_onboarded) {
          navigate("/ci", { replace: true });
          return;
        }
        setBrandName(s.brand_name);
        const nextStep =
          s.onboarding_step === "done"
            ? "goals"
            : (s.onboarding_step as StepKey);
        // Mark steps as completed for any data already filled in.
        const done = new Set<StepKey>();
        if (s.brand_name) done.add("account");
        if (s.filled.brand) done.add("brand");
        if (s.filled.competitors) done.add("competitors");
        setCompleted(done);
        // Trust the URL param if it's valid and not ahead of progress.
        const targetStep = isValidStep(stepParam) ? stepParam : nextStep;
        const targetIdx = STEP_ORDER.indexOf(targetStep);
        const allowedIdx = STEP_ORDER.indexOf(nextStep);
        const finalStep = targetIdx <= allowedIdx ? targetStep : nextStep;
        setStep(finalStep);
        setParams({ step: finalStep }, { replace: true });
      })
      .catch(() => {
        // Stale token — drop it and start fresh.
        localStorage.removeItem("rebase_token");
      })
      .finally(() => setBootstrapping(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goTo(next: StepKey) {
    setStep(next);
    setParams({ step: next }, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function markCompleteAnd(next: StepKey) {
    setCompleted((prev) => new Set(prev).add(step));
    goTo(next);
  }

  if (bootstrapping) {
    return (
      <div className="min-h-screen grid place-items-center bg-[var(--color-canvas)]">
        <span
          className="text-sm text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          // loading…
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[var(--color-canvas)] text-[var(--color-text-primary)]">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-hairline)] sticky top-0 z-10 bg-[var(--color-canvas)]">
        <Link
          to="/"
          className="text-base font-bold text-[var(--color-text-primary)] no-underline"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          rebase
          <span className="text-[var(--color-text-subtle)]">/</span>
          <span className="text-[var(--color-text-muted)]">signup</span>
        </Link>
        <Link
          to="/login"
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          have an account? log in →
        </Link>
      </header>

      {/* Progress rail */}
      <div className="px-6 py-4 border-b border-[var(--color-border-hairline)]">
        <div className="max-w-6xl mx-auto">
          <ProgressRail current={step} completed={completed} onJump={goTo} />
        </div>
      </div>

      {/* Body: form + right-side panel */}
      <div className="flex-1 grid lg:grid-cols-[1fr_minmax(0,460px)]">
        <Section scheme="canvas" size="lg" className="flex items-start">
          <div className="w-full max-w-2xl mx-auto pt-4">
            {step === "account" && (
              <AccountStep
                initialBrandName={brandName}
                onComplete={(b) => {
                  setBrandName(b);
                  markCompleteAnd("brand");
                }}
              />
            )}
            {step === "brand" && (
              <BrandStep
                brandName={brandName}
                onBack={() => goTo("account")}
                onComplete={() => markCompleteAnd("competitors")}
              />
            )}
            {step === "competitors" && (
              <CompetitorsStep
                onBack={() => goTo("brand")}
                onComplete={() => markCompleteAnd("goals")}
              />
            )}
            {step === "goals" && (
              <GoalsStep
                onBack={() => goTo("competitors")}
                onComplete={() => {
                  setCompleted((prev) => new Set(prev).add("goals"));
                  navigate("/ci", { replace: true });
                }}
              />
            )}
          </div>
        </Section>

        {/* Inverse side panel — what they get */}
        <Section
          scheme="inverse"
          size="lg"
          hairlineGrid
          className="hidden lg:flex items-start"
        >
          <div className="flex flex-col gap-6 max-w-sm pt-4">
            {/* Per-step illustration — a small Hex-style diagram that swaps
                with the active step (account / brand / competitors / goals).
                See ./illustrations.tsx. */}
            <StepIllustration step={step} className="w-full max-w-[280px]" />
            <div className="flex items-center gap-3">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: "var(--color-accent)" }}
              />
              <Eyebrow>// what you get</Eyebrow>
            </div>
            <Heading as={2} size="card">
              a brief, <Highlight color="amber">every {step === "goals" ? "week" : "monday"}</Highlight>.
            </Heading>
            <div
              className="flex flex-col gap-3 text-sm"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              <p>
                <span className="text-[var(--fg-muted)]">{">"}</span> 3-7 competitor signals worth acting on
              </p>
              <p>
                <span className="text-[var(--fg-muted)]">{">"}</span> pricing + product + content + sales
              </p>
              <p>
                <span className="text-[var(--fg-muted)]">{">"}</span> xhs + douyin + tmall coverage
              </p>
              <p>
                <span className="text-[var(--fg-muted)]">{">"}</span> 1-click drill-down on any signal
              </p>
            </div>
            <div
              className="mt-4 pt-4 border-t border-[var(--border)] text-xs text-[var(--fg-muted)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              // free during beta · no credit card · cancel anytime
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
