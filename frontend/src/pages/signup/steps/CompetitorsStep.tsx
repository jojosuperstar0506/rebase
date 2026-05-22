import { useState, useMemo } from "react";
import { useApp } from "../../../context/AppContext";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import {
  suggestCompetitors,
  saveCompetitorsStep,
  type CompetitorSuggestion,
} from "@/services/onboardingApi";

interface Props {
  onComplete: () => void;
  onBack: () => void;
}

interface Picked {
  brand_name: string;
  platform_ids: Record<string, string> | null;
}

const MIN_PICKED = 3;
const MAX_PICKED = 12;

export function CompetitorsStep({ onComplete, onBack }: Props) {
  const { lang } = useApp();

  const [picked, setPicked] = useState<Picked[]>([]);
  const [manualName, setManualName] = useState("");

  const [aiSuggestions, setAiSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiRan, setAiRan] = useState(false);
  const [aiMessage, setAiMessage] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const pickedNames = useMemo(
    () => new Set(picked.map((p) => p.brand_name.toLowerCase())),
    [picked]
  );

  function addCompetitor(brand_name: string, platform_ids: Record<string, string> | null) {
    const name = brand_name.trim();
    if (!name || pickedNames.has(name.toLowerCase()) || picked.length >= MAX_PICKED) return;
    setPicked((p) => [...p, { brand_name: name, platform_ids }]);
  }
  function removePicked(name: string) {
    setPicked((p) => p.filter((x) => x.brand_name !== name));
  }
  function addManual() {
    addCompetitor(manualName, null);
    setManualName("");
  }

  async function runAiSuggest() {
    setAiLoading(true);
    setAiMessage("");
    setError("");
    try {
      const res = await suggestCompetitors(lang === "zh" ? "zh" : "en");
      setAiSuggestions(res.suggestions || []);
      if (res.source === "error" || (res.suggestions || []).length === 0) {
        setAiMessage(
          res.message ||
            "AI couldn't suggest competitors right now — add them manually below."
        );
      }
    } catch (err) {
      setAiMessage(
        err instanceof Error ? err.message : "AI suggestions failed — add manually below."
      );
    } finally {
      setAiLoading(false);
      setAiRan(true);
    }
  }

  async function onContinue() {
    setError("");
    if (picked.length < MIN_PICKED) {
      setError(`Pick at least ${MIN_PICKED} competitors`);
      return;
    }
    setSubmitting(true);
    try {
      await saveCompetitorsStep(
        picked.map((p) => ({
          brand_name: p.brand_name,
          tier: "watchlist",
          platform_ids: p.platform_ids,
        }))
      );
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save competitors");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <Eyebrow>// step 03 · competitors</Eyebrow>
        <Heading as={1} size="hero">
          pick <Highlight color="amber">3 to 12</Highlight> to track
        </Heading>
        <p
          className="text-base text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          // type the brands you know, or let AI suggest them. add or remove anytime.
        </p>
      </div>

      {/* ── Manual entry ─────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <Eyebrow>add a competitor</Eyebrow>
        <div className="flex gap-2">
          <Input
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            placeholder="brand name (cn or en)"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addManual();
              }
            }}
            className="flex-1"
          />
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={addManual}
            disabled={!manualName.trim() || picked.length >= MAX_PICKED}
          >
            + add
          </Button>
        </div>
      </section>

      {/* ── AI suggest ───────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3 pt-4 border-t border-[var(--color-border-hairline)]">
        <div className="flex items-center justify-between">
          <Eyebrow>or — let AI suggest</Eyebrow>
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={runAiSuggest}
            disabled={aiLoading}
          >
            {aiLoading
              ? "thinking…"
              : aiRan
                ? "↻ regenerate"
                : "✦ suggest with AI"}
          </Button>
        </div>

        {!aiRan && !aiLoading && (
          <p
            className="text-xs text-[var(--color-text-subtle)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // AI reads your brand + category and recommends competitors worth tracking
          </p>
        )}

        {aiLoading && (
          <p
            className="text-sm text-[var(--color-text-muted)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // analyzing your category…
          </p>
        )}

        {aiMessage && (
          <p
            className="text-sm text-[var(--color-text-muted)] border-l-2 border-[var(--color-border-hairline)] pl-3 py-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // {aiMessage}
          </p>
        )}

        {aiSuggestions.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {aiSuggestions.map((s) => {
              const active = pickedNames.has(s.brand_name.toLowerCase());
              return (
                <button
                  key={s.brand_name}
                  type="button"
                  onClick={() =>
                    active
                      ? removePicked(s.brand_name)
                      : addCompetitor(s.brand_name, s.platform_ids || null)
                  }
                  className={cn(
                    "flex flex-col items-start gap-1 px-3 py-2.5 text-left",
                    "border rounded-[var(--radius-xs)] transition-all",
                    active
                      ? "border-[var(--color-text-primary)] bg-[var(--color-accent)] text-[var(--color-neutral-900)]"
                      : "border-[var(--color-border-hairline)] bg-[var(--color-raised)] hover:border-[var(--color-text-primary)]"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className="text-sm font-medium">{s.brand_name}</span>
                    {s.priority && (
                      <span
                        className={cn(
                          "text-[10px] uppercase tracking-wide px-1",
                          active
                            ? "text-[var(--color-neutral-900)]/70"
                            : "text-[var(--color-text-subtle)]"
                        )}
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {s.priority}
                      </span>
                    )}
                  </span>
                  {s.reason && (
                    <span
                      className={cn(
                        "text-xs leading-snug",
                        active
                          ? "text-[var(--color-neutral-900)]/75"
                          : "text-[var(--color-text-muted)]"
                      )}
                    >
                      {s.reason}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Watchlist ────────────────────────────────────────────────── */}
      {picked.length > 0 && (
        <section className="flex flex-col gap-3 pt-4 border-t border-[var(--color-border-hairline)]">
          <div className="flex items-center justify-between">
            <Eyebrow>your watchlist</Eyebrow>
            <span
              className="text-xs text-[var(--color-text-muted)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              {picked.length}/{MAX_PICKED}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {picked.map((p) => (
              <span
                key={p.brand_name}
                className="inline-flex items-center gap-2 pl-3 pr-1 py-1 border border-[var(--color-text-primary)] rounded-[var(--radius-pill)] text-sm"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {p.brand_name}
                <button
                  type="button"
                  onClick={() => removePicked(p.brand_name)}
                  className="grid place-items-center h-5 w-5 rounded-full hover:bg-[var(--color-neutral-200)] text-[var(--color-text-muted)]"
                  aria-label={`Remove ${p.brand_name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </section>
      )}

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
          type="button"
          variant="accent"
          size="lg"
          onClick={onContinue}
          disabled={picked.length < MIN_PICKED || submitting}
          className="flex-1 md:flex-none"
        >
          {submitting ? "saving…" : `→ continue (${picked.length})`}
        </Button>
      </div>
    </div>
  );
}
