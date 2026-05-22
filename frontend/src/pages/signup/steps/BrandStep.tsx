import { useState, useMemo, type FormEvent } from "react";
import { useApp } from "../../../context/AppContext";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { saveBrandStep } from "@/services/onboardingApi";
import { CATEGORY_TAXONOMY, type MajorCategory } from "@/data/categoryTaxonomy";

const PRICE_TIERS = [
  { value: "value", label: "value", range: "≤ ¥500", min: 0, max: 500 },
  { value: "mid", label: "mid-tier", range: "¥500 – ¥2,000", min: 500, max: 2000 },
  { value: "premium", label: "premium", range: "¥2,000 – ¥5,000", min: 2000, max: 5000 },
  { value: "luxury", label: "luxury", range: "¥5,000+", min: 5000, max: 99999 },
];

const PLATFORMS = [
  { value: "xhs", en: "Xiaohongshu", zh: "小红书" },
  { value: "douyin", en: "Douyin", zh: "抖音" },
  { value: "tmall", en: "Tmall", zh: "天猫" },
  { value: "taobao", en: "Taobao", zh: "淘宝" },
  { value: "jd", en: "JD.com", zh: "京东" },
  { value: "kuaishou", en: "Kuaishou", zh: "快手" },
];

interface Props {
  brandName: string;
  onComplete: () => void;
  onBack: () => void;
}

export function BrandStep({ brandName, onComplete, onBack }: Props) {
  const { lang } = useApp();
  const isZh = lang === "zh";

  const [majorValue, setMajorValue] = useState<string>("");
  const [subs, setSubs] = useState<string[]>([]);
  const [priceTier, setPriceTier] = useState<string>("");
  const [platforms, setPlatforms] = useState<string[]>(["xhs", "douyin", "tmall"]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const major: MajorCategory | undefined = useMemo(
    () => CATEGORY_TAXONOMY.find((m) => m.value === majorValue),
    [majorValue]
  );

  const canSubmit =
    majorValue && subs.length > 0 && priceTier && platforms.length > 0 && !submitting;

  function selectMajor(value: string) {
    setMajorValue(value);
    setSubs([]); // sub-categories belong to a major — reset on change
  }
  function toggleSub(value: string) {
    setSubs((s) => (s.includes(value) ? s.filter((x) => x !== value) : [...s, value]));
  }
  function togglePlatform(value: string) {
    setPlatforms((p) =>
      p.includes(value) ? p.filter((x) => x !== value) : [...p, value]
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const tier = PRICE_TIERS.find((t) => t.value === priceTier);
      await saveBrandStep({
        brand_category_l1: majorValue,
        brand_subcategories: subs,
        brand_price_range: tier
          ? { tier: tier.value, min: tier.min, max: tier.max }
          : null,
        brand_platforms: Object.fromEntries(platforms.map((p) => [p, ""])),
      });
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
        <Eyebrow>// step 02 · brand</Eyebrow>
        <Heading as={1} size="hero">
          tell us about <Highlight color="cyan">{brandName || "your brand"}</Highlight>
        </Heading>
        <p
          className="text-base text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          // category, price tier + platforms shape what we track and who we compare you against
        </p>
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-8">
        {/* ── Major category ─────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <Eyebrow>category</Eyebrow>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {CATEGORY_TAXONOMY.map((m) => {
              const active = majorValue === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => selectMajor(m.value)}
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
                    {isZh ? m.zh : m.en}
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      active
                        ? "text-[var(--color-canvas)]/70"
                        : "text-[var(--color-text-subtle)]"
                    )}
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {isZh ? m.en : m.zh}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Sub-categories (multi-select, appears after a major pick) ─ */}
        {major && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Eyebrow>sub-categories · pick all that apply</Eyebrow>
              <span
                className="text-xs text-[var(--color-text-muted)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {subs.length} selected
              </span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {major.subcategories.map((s) => {
                const active = subs.includes(s.value);
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => toggleSub(s.value)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2.5 text-left",
                      "border rounded-[var(--radius-xs)] transition-all",
                      active
                        ? "border-[var(--color-text-primary)] bg-[var(--color-accent-soft)]"
                        : "border-[var(--color-border-hairline)] bg-[var(--color-raised)] hover:border-[var(--color-text-primary)]"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-grid place-items-center w-4 h-4 rounded-[2px] border flex-shrink-0 text-[11px]",
                        active
                          ? "bg-[var(--color-text-primary)] border-[var(--color-text-primary)] text-[var(--color-accent)]"
                          : "bg-transparent border-[var(--color-border-strong)]"
                      )}
                    >
                      {active ? "✓" : ""}
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-sm font-medium">{isZh ? s.zh : s.en}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Price tier ─────────────────────────────────────────────── */}
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
                      active
                        ? "text-[var(--color-canvas)]/70"
                        : "text-[var(--color-text-subtle)]"
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

        {/* ── Platforms ──────────────────────────────────────────────── */}
        <section className="flex flex-col gap-3">
          <Eyebrow>platforms to track</Eyebrow>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {PLATFORMS.map((p) => {
              const active = platforms.includes(p.value);
              return (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => togglePlatform(p.value)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2.5 text-left",
                    "border rounded-[var(--radius-xs)] transition-all",
                    active
                      ? "border-[var(--color-text-primary)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-border-hairline)] bg-[var(--color-raised)] hover:border-[var(--color-text-primary)]"
                  )}
                >
                  <span
                    className={cn(
                      "inline-grid place-items-center w-4 h-4 rounded-[2px] border flex-shrink-0 text-[11px]",
                      active
                        ? "bg-[var(--color-text-primary)] border-[var(--color-text-primary)] text-[var(--color-accent)]"
                        : "bg-transparent border-[var(--color-border-strong)]"
                    )}
                  >
                    {active ? "✓" : ""}
                  </span>
                  <span className="text-sm font-medium">{isZh ? p.zh : p.en}</span>
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
