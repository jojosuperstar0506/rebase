import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Card } from "@/components/ui/Card";
import { BrandChip } from "@/components/ui/BrandChip";

const colorTokens = [
  { name: "canvas", value: "#FCF8F8", role: "Primary surface" },
  { name: "raised", value: "#FFFFFF", role: "Cards on canvas" },
  { name: "sunken", value: "#F5F1F2", role: "Alt rows / inputs" },
  { name: "inverse", value: "#14141C", role: "Dark sections" },
  { name: "accent", value: "#C5E832", role: "Signature lime — builder accent" },
  { name: "accent-deep", value: "#1A2E05", role: "Pressed / hover state" },
  { name: "accent-soft", value: "#F0FADC", role: "Tinted bg" },
  { name: "highlight", value: "#FDE68A", role: "Marker · soft amber" },
  { name: "highlight-strong", value: "#FBBF24", role: "Marker · stronger amber" },
  { name: "data-blue", value: "#2563EB", role: "Charts · primary series" },
  { name: "data-cyan", value: "#06B6D4", role: "Charts · secondary series" },
  { name: "text-primary", value: "#1A1416", role: "Body text" },
];

const neutralRamp = [
  { step: 50, value: "#FCF8F8" },
  { step: 100, value: "#F5F1F2" },
  { step: 200, value: "#E8E0E2" },
  { step: 300, value: "#D4CACC" },
  { step: 400, value: "#B0A4A7" },
  { step: 500, value: "#8A7D80" },
  { step: 600, value: "#6B6266" },
  { step: 700, value: "#4F4548" },
  { step: 800, value: "#312A2C" },
  { step: 900, value: "#1A1416" },
  { step: 950, value: "#0D090A" },
];

const typeScale = [
  { name: "5xl / Display", size: "4.5rem", className: "text-[4.5rem]", weight: 700 },
  { name: "4xl / Hero", size: "3.5rem", className: "text-[3.5rem]", weight: 700 },
  { name: "3xl / Section", size: "2.5rem", className: "text-[2.5rem]", weight: 600 },
  { name: "2xl / Subsection", size: "2rem", className: "text-[2rem]", weight: 600 },
  { name: "xl / Card title", size: "1.5rem", className: "text-[1.5rem]", weight: 600 },
  { name: "base / Body", size: "1rem", className: "text-base", weight: 400 },
  { name: "sm / Small", size: "0.875rem", className: "text-sm", weight: 400 },
];

const radii = [
  { name: "xs", value: "2px" },
  { name: "sm", value: "4px" },
  { name: "md", value: "6px" },
  { name: "lg", value: "12px" },
  { name: "pill", value: "999px" },
];

function Swatch({ name, value, role }: { name: string; value: string; role: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="h-20 w-full rounded-[var(--radius-xs)] border border-[var(--color-border-hairline)]"
        style={{ background: value }}
      />
      <div className="flex flex-col gap-0.5">
        <span
          className="text-sm font-medium text-[var(--color-text-primary)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {name}
        </span>
        <span
          className="text-xs text-[var(--color-text-muted)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {value}
        </span>
        <span className="text-xs text-[var(--color-text-subtle)]">{role}</span>
      </div>
    </div>
  );
}

/** Tiny "code line" decoration — gives the builder/terminal feel */
function CodeLine({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-baseline gap-3 text-[0.8125rem] leading-relaxed text-[var(--fg)]"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      <span className="text-[var(--fg-muted)] select-none">{"//"}</span>
      <span>{children}</span>
    </div>
  );
}

export default function DesignSystem() {
  return (
    <div className="bg-[var(--color-canvas)] text-[var(--color-text-primary)] min-h-screen">
      {/* HERO — inverse scheme, mono display, lime highlight */}
      <Section scheme="inverse" size="xl" hairlineGrid>
        <div className="flex flex-col gap-8 max-w-3xl">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "var(--color-accent)" }}
            />
            <Eyebrow>rebase.design / v0.1.0</Eyebrow>
          </div>
          <Heading as={1} size="display" className="!font-normal">
            <span className="font-bold">build</span>
            <span className="text-[var(--fg-muted)]">.</span>
            <span className="font-bold">
              <Highlight color="amber">ship</Highlight>
            </span>
            <span className="text-[var(--fg-muted)]">.</span>
            <span className="font-bold">iterate</span>
          </Heading>
          <div className="flex flex-col gap-2">
            <CodeLine>a design system for intelligence work, not landing pages</CodeLine>
            <CodeLine>mono-driven, syntax-highlighter accents, no decorative fluff</CodeLine>
            <CodeLine>three swappable section schemes · zero shadows · hairline borders</CodeLine>
          </div>
          <div className="flex flex-wrap gap-3 pt-4">
            <Button variant="accent" size="lg">→ open brief</Button>
            <Button
              variant="outline"
              size="lg"
              className="text-[var(--fg)] border-[var(--fg)] hover:bg-[var(--bg-raised)]"
            >
              inspect tokens
            </Button>
          </div>
        </div>
      </Section>

      {/* COLOR */}
      <Section scheme="canvas" size="lg">
        <div className="flex flex-col gap-3 mb-12">
          <Eyebrow>01 / color</Eyebrow>
          <Heading as={2} size="section">
            <Highlight color="cyan">tinted neutrals</Highlight>, never pure.
          </Heading>
          <p className="text-base text-[var(--color-text-muted)] max-w-2xl">
            No #FFF, no #000. Warm off-white surface, warm near-black text.
            Lime as the signature highlight — gender-neutral, builder energy, pairs cleanly with charts.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-16">
          {colorTokens.map((t) => (
            <Swatch key={t.name} {...t} />
          ))}
        </div>

        <div className="flex flex-col gap-3 mb-6">
          <Eyebrow>neutral ramp · 11 steps</Eyebrow>
        </div>
        <div className="grid grid-cols-11 gap-0 mb-16 border border-[var(--color-border-hairline)] rounded-[var(--radius-xs)] overflow-hidden">
          {neutralRamp.map((n) => (
            <div key={n.step} className="flex flex-col">
              <div className="h-16" style={{ background: n.value }} />
              <div className="p-2 text-center bg-[var(--color-raised)]">
                <div
                  className="text-[10px] text-[var(--color-text-muted)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {n.step}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* TYPOGRAPHY */}
      <Section scheme="canvas" size="lg">
        <div className="flex flex-col gap-3 mb-12">
          <Eyebrow>02 / typography</Eyebrow>
          <Heading as={2} size="section">
            mono carries the brand.
          </Heading>
          <p className="text-base text-[var(--color-text-muted)] max-w-2xl">
            Display headlines are JetBrains Mono — code-editor energy, not marketing.
            Inter for body where mono would slow reading. No serif by default.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <Card>
            <Eyebrow>display / hero · jetbrains mono</Eyebrow>
            <div
              className="mt-4 text-[3rem] leading-none font-bold tracking-tight"
              style={{ fontFamily: "var(--font-display)" }}
            >
              build.<Highlight color="amber">ship</Highlight>
            </div>
            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
              Hero, section openers, brief titles. The monospace grid IS the visual rhythm.
            </p>
          </Card>
          <Card>
            <Eyebrow>body · inter</Eyebrow>
            <div
              className="mt-4 text-[1.5rem] leading-snug"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              The quick brown fox jumps over the lazy dog.
            </div>
            <p className="mt-4 text-sm text-[var(--color-text-muted)]">
              Long-form reading, form labels, paragraphs. Mono is for emphasis, not endurance.
            </p>
          </Card>
        </div>

        <div className="border-t border-[var(--color-border-hairline)] pt-12">
          <Eyebrow>scale</Eyebrow>
          <div className="mt-6 flex flex-col gap-4">
            {typeScale.map((s) => (
              <div
                key={s.name}
                className="flex items-baseline gap-6 border-b border-[var(--color-border-hairline)] pb-4"
              >
                <span
                  className="text-xs text-[var(--color-text-muted)] w-44 shrink-0"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {s.name}
                </span>
                <span
                  className={s.className}
                  style={{
                    fontFamily: "var(--font-display)",
                    fontWeight: s.weight,
                    lineHeight: 1.1,
                  }}
                >
                  build.ship
                </span>
                <span
                  className="text-xs text-[var(--color-text-subtle)] ml-auto"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {s.size}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* HIGHLIGHTS */}
      <Section scheme="canvas" size="lg">
        <div className="flex flex-col gap-3 mb-12">
          <Eyebrow>03 / highlights</Eyebrow>
          <Heading as={2} size="section">
            syntax-highlighter <Highlight color="amber">emphasis</Highlight>.
          </Heading>
          <p className="text-base text-[var(--color-text-muted)] max-w-2xl">
            Use Highlight to mark a phrase the way a builder marks code.
            Amber for "read this." Cyan for data callouts. Lime sparingly — saved for primary CTAs and "ready to ship" moments.
          </p>
        </div>

        <Card className="!p-8">
          <div className="flex flex-col gap-6 text-2xl leading-snug" style={{ fontFamily: "var(--font-display)" }}>
            <p>
              competitor X just shipped <Highlight color="amber">vegan leather</Highlight> on douyin
            </p>
            <p>
              your tmall ASP is <Highlight color="cyan">down 14%</Highlight> week-over-week
            </p>
            <p>
              <Highlight color="amber">3 new SKUs</Highlight> match your product fingerprint
            </p>
          </div>
        </Card>
      </Section>

      {/* PRIMITIVES */}
      <Section scheme="canvas" size="lg">
        <div className="flex flex-col gap-3 mb-12">
          <Eyebrow>04 / primitives</Eyebrow>
          <Heading as={2} size="section">
            buttons · inputs · cards · chips.
          </Heading>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <Eyebrow>buttons</Eyebrow>
            <div className="mt-5 flex flex-col gap-4">
              <div className="flex flex-wrap gap-3">
                <Button variant="primary">primary</Button>
                <Button variant="accent">→ accent</Button>
                <Button variant="outline">outline</Button>
                <Button variant="ghost">ghost</Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm">sm</Button>
                <Button size="md">md</Button>
                <Button size="lg">lg</Button>
                <Button size="pill" variant="accent">pill</Button>
              </div>
            </div>
          </Card>

          <Card>
            <Eyebrow>inputs</Eyebrow>
            <div className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ds-email">email</Label>
                <Input id="ds-email" type="email" placeholder="you@brand.com" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ds-brand">brand</Label>
                <Input id="ds-brand" placeholder="OMI Bags · 欧米箱包" />
              </div>
            </div>
          </Card>

          <Card>
            <Eyebrow>brand chip</Eyebrow>
            <div className="mt-5 flex flex-col gap-3 items-start">
              <BrandChip name="OMI Bags" category="bags · premium" />
              <BrandChip name="欧米" />
            </div>
          </Card>

          <Card>
            <Eyebrow>radii</Eyebrow>
            <div className="mt-5 grid grid-cols-5 gap-3">
              {radii.map((r) => (
                <div key={r.name} className="flex flex-col items-center gap-2">
                  <div
                    className="h-14 w-14 bg-[var(--color-neutral-200)] border border-[var(--color-border-hairline)]"
                    style={{ borderRadius: r.value }}
                  />
                  <span
                    className="text-xs text-[var(--color-text-muted)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {r.name}
                  </span>
                  <span
                    className="text-[10px] text-[var(--color-text-subtle)]"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {r.value}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </Section>

      {/* SCHEMES */}
      <Section scheme="canvas" size="lg">
        <div className="flex flex-col gap-3 mb-12">
          <Eyebrow>05 / section schemes</Eyebrow>
          <Heading as={2} size="section">
            three swappable schemes.
          </Heading>
        </div>
      </Section>

      <Section scheme="canvas" size="sm">
        <Eyebrow>scheme=canvas</Eyebrow>
        <p className="mt-2 text-lg" style={{ fontFamily: "var(--font-mono)" }}>
          // default surface. most pages live here.
        </p>
      </Section>

      <Section scheme="accent" size="sm">
        <Eyebrow>scheme=accent</Eyebrow>
        <p className="mt-2 text-lg" style={{ fontFamily: "var(--font-mono)" }}>
          // tinted lime — sparingly, for CTA blocks and "you're done" moments.
        </p>
      </Section>

      <Section scheme="inverse" size="sm">
        <Eyebrow>scheme=inverse</Eyebrow>
        <p className="mt-2 text-lg" style={{ fontFamily: "var(--font-mono)" }}>
          // dark inversion — hero, brief callouts, builder vibes.
        </p>
      </Section>

      {/* FOOTER */}
      <Section scheme="canvas" size="sm">
        <div className="border-t border-[var(--color-border-hairline)] pt-8 flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <Eyebrow>v0 · built {new Date().toLocaleDateString("en-CA")}</Eyebrow>
          <span
            className="text-sm text-[var(--color-text-muted)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            edit tokens in src/index.css + src/theme/tokens.ts
          </span>
        </div>
      </Section>
    </div>
  );
}
