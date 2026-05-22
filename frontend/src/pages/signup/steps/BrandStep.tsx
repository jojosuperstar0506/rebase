import { useState, type FormEvent } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { saveBrandStep } from "@/services/onboardingApi";

const CATEGORIES = [
  { value: "女包", label: "女包", en: "Women's Bags" },
  { value: "男包", label: "男包", en: "Men's Bags" },
  { value: "双肩包", label: "双肩包", en: "Backpacks" },
  { value: "钱包", label: "钱包", en: "Wallets" },
  { value: "行李箱", label: "行李箱", en: "Luggage" },
  { value: "其他", label: "其他", en: "Other" },
];

const PRICE_TIERS = [
  { value: "value", label: "value", range: "≤ ¥500", min: 0, max: 500 },
  { value: "mid", label: "mid-tier", range: "¥500 – ¥2,000", min: 500, max: 2000 },
  { value: "premium", label: "premium", range: "¥2,000 – ¥5,000", min: 2000, max: 5000 },
  { value: "luxury", label: "luxury", range: "¥5,000+", min: 5000, max: 99999 },
];

interface Props {
  brandName: string;
  onComplete: (category: string) => void;
  onBack: () => void;
}

export function BrandStep({ brandName, onComplete, onBack }: Props) {
  const [category, setCategory] = useState<string>("");
  const [priceTier, setPriceTier] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = category && priceTier && !submitting;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const tier = PRICE_TIERS.find((t) => t.value === priceTier);
      await saveBrandStep({
        brand_category: category,
        brand_price_range: tier
          ? { tier: tier.value, min: tier.min, max: tier.max }
          : null,
      });
      onComplete(category);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-7">
      <div className="flex flex-col gap-3">
        <Eyebrow>// step 02 · brand</Eyebrow>
        <Heading as={1} size="hero">
          tell us about <Highlight color="cyan">{brandName || "your brand"}</Highlight>
        </Heading>
        <p
          className="text-base text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          // category + price tier shape what we track and who we compare you against
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-8">
        <section className="flex flex-col gap-3">
          <Eyebrow>category</Eyebrow>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 px-4 py-3 text-left",
                    "border rounded-[var(--radius-xs)] transition-all",
                    active
                      ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-canvas)]"
                      : "border-[var(--color-border-hairline)] bg-[var(--color-raised)] hover:border-[var(--color-text-primary)]"
                  )}
                >
                  <span
                    className="text-base font-medium"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {c.label}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      active ? "text-[var(--color-canvas)]/70" : "text-[var(--color-text-subtle)]"
                    )}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {c.en}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <Eyebrow>price tier</Eyebrow>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PRICE_TIERS.map((t) => {
              const active = priceTier === t.value;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setPriceTier(t.value)}
                  className={cn(
                    "flex flex-col items-start gap-1 px-4 py-3 text-left",
                    "border rounded-[var(--radius-xs)] transition-all",
                    active
                      ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-[var(--color-canvas)]"
                      : "border-[var(--color-border-hairline)] bg-[var(--color-raised)] hover:border-[var(--color-text-primary)]"
                  )}
                >
                  <span
                    className="text-base font-medium lowercase"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {t.label}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      active ? "text-[var(--color-canvas)]/70" : "text-[var(--color-text-subtle)]"
                    )}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {t.range}
                  </span>
                </button>
              );
            })}
          </div>
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
            disabled={!canSubmit}
            className="flex-1 md:flex-none"
          >
            {submitting ? "saving…" : "→ continue"}
          </Button>
        </div>
      </form>
    </div>
  );
}
