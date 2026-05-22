import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function Home() {
  const { lang, setLang } = useApp();
  const navigate = useNavigate();
  const h = T.home;
  const isLoggedIn =
    !!localStorage.getItem("rebase_token") || !!localStorage.getItem("admin_authed");
  const primaryHref = isLoggedIn ? "/ci" : "/signup";

  return (
    <div className="bg-[var(--color-canvas)] text-[var(--color-text-primary)] min-h-screen">
      {/* ── Own header ── */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-hairline)] sticky top-0 z-20 bg-[var(--color-canvas)]">
        <Link
          to="/"
          className="text-base font-bold text-[var(--color-text-primary)] no-underline"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          rebase
        </Link>
        <nav className="flex items-center gap-2" style={{ fontFamily: "var(--font-mono)" }}>
          <a
            href="/calculator.html"
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-3 py-1.5"
          >
            diagnostics
          </a>
          <button
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-3 py-1.5 border border-[var(--color-border-hairline)] rounded-[var(--radius-xs)]"
          >
            {lang === "en" ? "中文" : "EN"}
          </button>
          {!isLoggedIn && (
            <Link
              to="/login"
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-3 py-1.5"
            >
              log in
            </Link>
          )}
          <Button size="sm" variant="accent" onClick={() => navigate(primaryHref)}>
            {isLoggedIn ? "dashboard →" : "start free →"}
          </Button>
        </nav>
      </header>

      {/* ── Hero ── */}
      <Section scheme="inverse" size="md" hairlineGrid>
        <div className="flex flex-col gap-7 max-w-3xl">
          <div className="flex items-center gap-3">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ background: "var(--color-accent)" }}
            />
            <Eyebrow>// {t(h.badge, lang)}</Eyebrow>
          </div>
          <Heading as={1} size="display">
            {t(h.heroTitle1, lang)}{" "}
            <Highlight color="amber">{t(h.heroTitle2, lang)}</Highlight>
          </Heading>
          <p className="text-lg text-[var(--fg-muted)] max-w-2xl leading-relaxed">
            {t(h.heroSubtitle, lang)}
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button variant="accent" size="lg" onClick={() => navigate(primaryHref)}>
              {t(isLoggedIn ? h.ctaContinue : h.ctaAccess, lang)}
            </Button>
            <a href="/calculator.html">
              <Button
                variant="outline"
                size="lg"
                className="text-[var(--fg)] border-[var(--fg)] hover:bg-[var(--bg-raised)]"
              >
                {t(h.ctaDiag, lang)}
              </Button>
            </a>
          </div>
          <p
            className="text-sm text-[var(--fg-muted)] pt-1"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // {t(h.earlyAccess, lang)}
          </p>
        </div>
      </Section>

      {/* ── Pillars ── */}
      <Section scheme="canvas" size="lg">
        <div className="flex flex-col gap-3 mb-12">
          <Eyebrow>01 / {t(h.whatWeDoLabel, lang)}</Eyebrow>
          <Heading as={2} size="section">
            {t(h.whatWeDoTitle, lang)}
          </Heading>
          <p className="text-base text-[var(--color-text-muted)] max-w-2xl">
            {t(h.whatWeDoSub, lang)}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {h.pillars.map((p, i) => (
            <Card key={i} className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span
                  className="text-base font-semibold"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {t(p.title, lang)}
                </span>
                <span
                  className="text-xs text-[var(--color-text-subtle)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  0{i + 1}
                </span>
              </div>
              <span
                className="text-xs text-[var(--color-text-muted)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {t(p.title, lang === "en" ? "zh" : "en")}
              </span>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                {t(p.desc, lang)}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── CI spotlight ── */}
      <Section scheme="accent" size="md">
        <div className="flex flex-col md:flex-row md:items-center gap-6 justify-between">
          <div className="flex flex-col gap-3 max-w-xl">
            <Eyebrow>// {lang === "zh" ? "现已上线" : "now live"}</Eyebrow>
            <Heading as={3} size="card">
              {t(T.ci.homeTitle, lang)}
            </Heading>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              {t(T.ci.homeDesc, lang)}
            </p>
          </div>
          <a href="/ci" className="flex-shrink-0">
            <Button variant="primary" size="lg">
              {t(T.ci.homeButton, lang)}
            </Button>
          </a>
        </div>
      </Section>

      {/* ── Diagnostic CTA ── */}
      <Section scheme="canvas" size="md">
        <Card className="flex flex-col md:flex-row md:items-center gap-6 justify-between !p-8 md:!p-10">
          <div className="flex flex-col gap-3 max-w-xl">
            <Eyebrow>02 / {t(h.diagLabel, lang)}</Eyebrow>
            <Heading as={2} size="card">
              {t(h.diagTitle, lang)}
            </Heading>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              {t(h.diagDesc, lang)}
            </p>
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0">
            <a href="/calculator.html">
              <Button variant="outline" size="lg" className="w-full">
                {t(h.diagCta, lang)}
              </Button>
            </a>
            <span
              className="text-xs text-[var(--color-text-subtle)] text-center"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              // {t(h.diagNote, lang)}
            </span>
          </div>
        </Card>
      </Section>

      {/* ── How it works ── */}
      <Section scheme="canvas" size="lg">
        <div className="flex flex-col gap-3 mb-12">
          <Eyebrow>03 / {t(h.howLabel, lang)}</Eyebrow>
          <Heading as={2} size="section">
            {t(h.howTitle, lang)}
          </Heading>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {h.steps.map((s) => (
            <Card key={s.step} className="flex flex-col gap-3">
              <span
                className="text-3xl font-bold text-[var(--color-accent)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {s.step}
              </span>
              <span
                className="text-base font-semibold"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {t(s.title, lang)}
              </span>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                {t(s.desc, lang)}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ── Final CTA ── */}
      <Section scheme="inverse" size="lg" hairlineGrid>
        <div className="flex flex-col items-start gap-6 max-w-2xl">
          <Heading as={2} size="section">
            {t(h.finalTitle, lang)}
          </Heading>
          <p
            className="text-base text-[var(--fg-muted)]"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            // {t(h.finalSub, lang)}
          </p>
          <Button variant="accent" size="lg" onClick={() => navigate(primaryHref)}>
            {t(isLoggedIn ? h.ctaContinue : h.finalCta, lang)}
          </Button>
        </div>
      </Section>

      {/* ── Footer ── */}
      <Section scheme="canvas" size="sm">
        <div
          className="border-t border-[var(--color-border-hairline)] pt-8 text-sm text-[var(--color-text-subtle)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {t(h.footer, lang)}
        </div>
      </Section>
    </div>
  );
}
