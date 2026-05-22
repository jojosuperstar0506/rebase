import { useState, type FormEvent } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { saveGoalsStep, type Goals } from "@/services/onboardingApi";

const TRACKING_OPTIONS = [
  { id: "pricing", label: "pricing shifts", desc: "asp drops, promo blitzes, sku repricing" },
  { id: "launches", label: "new product launches", desc: "competitor skus, materials, drops" },
  { id: "content", label: "content trends", desc: "xhs + douyin viral moments" },
  { id: "velocity", label: "sales velocity", desc: "tmall ranking, gmv signal" },
  { id: "influencers", label: "influencer activity", desc: "kol partnerships + spend" },
];

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

export function GoalsStep({ onComplete, onBack }: Props) {
  const [tracking, setTracking] = useState<string[]>(["pricing", "launches", "content"]);
  const [cadence, setCadence] = useState<"weekly" | "monthly">("weekly");
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleTracking(id: string) {
    setTracking((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (tracking.length === 0) {
      setError("Pick at least one signal to track");
      return;
    }
    setSubmitting(true);
    try {
      const goals: Goals = {
        tracking,
        cadence,
        email_notifications: emailNotifications,
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await saveGoalsStep(goals);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <Eyebrow>// step 04 · goals</Eyebrow>
        <Heading as={1} size="hero">
          what should we <Highlight color="amber">watch for</Highlight>?
        </Heading>
        <p
          className="text-base text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          // your brief surfaces what you select. defaults are sensible — tweak anything.
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <Eyebrow>signals to track</Eyebrow>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {TRACKING_OPTIONS.map((opt) => {
              const active = tracking.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleTracking(opt.id)}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 text-left",
                    "border rounded-[var(--radius-xs)] transition-all",
                    active
                      ? "border-[var(--color-text-primary)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-border-hairline)] bg-[var(--color-raised)] hover:border-[var(--color-text-primary)]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block w-4 h-4 rounded-[2px] border mt-0.5 flex-shrink-0 grid place-items-center text-[11px]",
                      active
                        ? "bg-[var(--color-text-primary)] border-[var(--color-text-primary)] text-[var(--color-accent)]"
                        : "bg-transparent border-[var(--color-border-strong)]"
                    )}
                  >
                    {active ? "✓" : ""}
                  </span>
                  <div className="flex flex-col gap-1 min-w-0">
                    <span
                      className="text-sm font-medium"
                      style={{ fontFamily: "var(--font-display)" }}
                    >
                      {opt.label}
                    </span>
                    <span
                      className="text-xs text-[var(--color-text-muted)]"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {opt.desc}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Eyebrow>cadence</Eyebrow>
          <div className="flex gap-2">
            {(["weekly", "monthly"] as const).map((c) => {
              const active = cadence === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCadence(c)}
                  className={cn(
                    "px-4 py-2 border rounded-[var(--radius-xs)] text-sm transition-all",
                    active
                      ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-canvas)]"
                      : "border-[var(--color-border-hairline)] hover:border-[var(--color-text-primary)]"
                  )}
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={emailNotifications}
            onClick={() => setEmailNotifications((v) => !v)}
            className={cn(
              "relative inline-block h-6 w-11 rounded-full transition-colors",
              emailNotifications
                ? "bg-[var(--color-text-primary)]"
                : "bg-[var(--color-neutral-300)]"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-[var(--color-canvas)] transition-transform",
                emailNotifications && "translate-x-5"
              )}
            />
          </button>
          <label
            className="text-sm cursor-pointer select-none"
            onClick={() => setEmailNotifications((v) => !v)}
          >
            <span style={{ fontFamily: "var(--font-mono)" }}>// </span>
            email me when the brief is ready
          </label>
        </section>

        <section className="flex flex-col gap-2">
          <Eyebrow>anything else? (optional)</Eyebrow>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="// e.g. focus on douyin live commerce, ignore taobao"
            className={cn(
              "w-full min-h-[80px] px-3 py-2 text-sm leading-relaxed",
              "bg-[var(--color-raised)] border border-[var(--color-border-hairline)] rounded-[var(--radius-xs)]",
              "placeholder:text-[var(--color-text-subtle)]",
              "focus:outline-none focus:border-[var(--color-text-primary)]"
            )}
            style={{ fontFamily: "var(--font-mono)" }}
          />
        </section>

        {error && (
          <div
            className="text-sm text-[var(--color-danger)] border-l-2 border-[var(--color-danger)] pl-3 py-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // {error}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" size="lg" onClick={onBack}>
            ← back
          </Button>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            disabled={submitting}
            className="flex-1 md:flex-none"
          >
            {submitting ? "finalizing…" : "→ launch dashboard"}
          </Button>
        </div>
      </form>
    </div>
  );
}
