import { useState, useEffect, useMemo } from "react";
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
  category: string;
  onComplete: () => void;
  onBack: () => void;
}

interface PickedCompetitor {
  brand_name: string;
  platform_ids: Record<string, string> | null;
  source: "suggested" | "manual";
}

const MIN_PICKED = 3;
const MAX_PICKED = 12;

export function CompetitorsStep({ category, onComplete, onBack }: Props) {
  const [suggestions, setSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [picked, setPicked] = useState<PickedCompetitor[]>([]);
  const [manualName, setManualName] = useState("");
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    suggestCompetitors({ category })
      .then((r) => {
        if (!cancelled) setSuggestions(r.suggestions);
      })
      .catch((e) => !cancelled && setError(e?.message || "Failed to load suggestions"))
      .finally(() => !cancelled && setLoadingSuggestions(false));
    return () => {
      cancelled = true;
    };
  }, [category]);

  const pickedNames = useMemo(
    () => new Set(picked.map((p) => p.brand_name.toLowerCase())),
    [picked]
  );

  function togglePick(s: CompetitorSuggestion) {
    const key = s.brand_name.toLowerCase();
    if (pickedNames.has(key)) {
      setPicked((p) => p.filter((x) => x.brand_name.toLowerCase() !== key));
    } else if (picked.length < MAX_PICKED) {
      setPicked((p) => [
        ...p,
        { brand_name: s.brand_name, platform_ids: s.platform_ids, source: "suggested" },
      ]);
    }
  }

  function addManual() {
    const name = manualName.trim();
    if (!name || pickedNames.has(name.toLowerCase())) return;
    if (picked.length >= MAX_PICKED) return;
    setPicked((p) => [...p, { brand_name: name, platform_ids: null, source: "manual" }]);
    setManualName("");
  }

  function removePicked(name: string) {
    setPicked((p) => p.filter((x) => x.brand_name !== name));
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
          // we'll watch these on xhs, douyin, and tmall. you can add or remove anytime.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Eyebrow>suggestions · {category}</Eyebrow>
          <span
            className="text-xs text-[var(--color-text-muted)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {picked.length}/{MAX_PICKED} picked
          </span>
        </div>
        {loadingSuggestions ? (
          <p
            className="text-sm text-[var(--color-text-subtle)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // loading…
          </p>
        ) : suggestions.length === 0 ? (
          <p
            className="text-sm text-[var(--color-text-subtle)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // no suggestions for this category yet — add competitors manually below.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {suggestions.map((s) => {
              const active = pickedNames.has(s.brand_name.toLowerCase());
              return (
                <button
                  key={s.brand_name}
                  type="button"
                  onClick={() => togglePick(s)}
                  className={cn(
                    "flex flex-col items-start gap-1 px-3 py-2.5 text-left",
                    "border rounded-[var(--radius-xs)] transition-all",
                    active
                      ? "border-[var(--color-text-primary)] bg-[var(--color-accent)] text-[var(--color-neutral-900)]"
                      : "border-[var(--color-border-hairline)] bg-[var(--color-raised)] hover:border-[var(--color-text-primary)]"
                  )}
                >
                  <span className="text-sm font-medium">{s.brand_name}</span>
                  {(s.brand_name_en || s.badge) && (
                    <span
                      className={cn(
                        "text-[10px] leading-tight",
                        active
                          ? "text-[var(--color-neutral-900)]/70"
                          : "text-[var(--color-text-subtle)]"
                      )}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {s.brand_name_en} {s.brand_name_en && s.badge && "· "}
                      {s.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 pt-4 border-t border-[var(--color-border-hairline)]">
        <Eyebrow>add manually</Eyebrow>
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
            variant="outline"
            size="md"
            onClick={addManual}
            disabled={!manualName.trim() || picked.length >= MAX_PICKED}
          >
            + add
          </Button>
        </div>
      </section>

      {picked.length > 0 && (
        <section className="flex flex-col gap-3">
          <Eyebrow>your watchlist</Eyebrow>
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
