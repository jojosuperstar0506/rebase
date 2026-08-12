import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";
import { Section } from "@/components/ui/Section";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { Heading } from "@/components/ui/Heading";
import { Highlight } from "@/components/ui/Highlight";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";

// Demo mode — when VITE_DEMO_MODE=true, skip the invite-code verify call and
// route straight to /ci. Paired with USE_MOCKS in ciMocks.ts so the whole
// dashboard renders off local fixtures with no backend involvement.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

// A minted unsigned JWT with sub matching the invite-code shape and a
// far-future exp. isTokenValid checks exp only (no signature verify), and
// downstream JWT-sanity guards check sub matches /^[A-Z][A-Z0-9-]{3,}$/.
// The signature segment is intentionally the string "demo" — no key involved.
// Backend never sees this token (tryApi short-circuits in demo mode).
function mintDemoJwt(): string {
  const header = { alg: 'none', typ: 'JWT' };
  const payload = { sub: 'RB-DEMO-TB01', exp: 9999999999 };
  const b64u = (obj: object) =>
    btoa(JSON.stringify(obj))
      .replace(/=+$/, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  return `${b64u(header)}.${b64u(payload)}.demo`;
}

export default function Login() {
  const { lang, setLang } = useApp();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const s = T.login;
  const nav = T.nav;

  // In demo mode, auto-enter the app on mount without asking for a code.
  useEffect(() => {
    if (!DEMO_MODE) return;
    localStorage.setItem("rebase_token", mintDemoJwt());
    window.dispatchEvent(new CustomEvent("rebase_auth_change"));
    navigate("/ci", { replace: true });
  }, [navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      localStorage.setItem("rebase_token", data.token);
      window.dispatchEvent(new CustomEvent("rebase_auth_change"));
      navigate("/ci");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[var(--color-canvas)] text-[var(--color-text-primary)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border-hairline)]">
        <Link
          to="/"
          className="text-base font-bold text-[var(--color-text-primary)] no-underline"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          rebase
          <span className="text-[var(--color-text-subtle)]">/</span>
          <span className="text-[var(--color-text-muted)]">login</span>
        </Link>
        <button
          onClick={() => setLang(lang === "en" ? "zh" : "en")}
          className="text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] px-3 py-1.5 border border-[var(--color-border-hairline)] rounded-[var(--radius-xs)]"
          style={{ fontFamily: "var(--font-mono)" }}
        >
          {lang === "en" ? "中文" : "EN"}
        </button>
      </div>

      {/* Two-column: left form, right inverse panel */}
      <div className="flex-1 grid lg:grid-cols-[1fr_1fr]">
        {/* Form column */}
        <Section scheme="canvas" size="lg" className="flex items-center">
          <div className="w-full max-w-md mx-auto flex flex-col gap-8">
            <div className="flex flex-col gap-3">
              <Eyebrow>// auth · invite-only access</Eyebrow>
              <Heading as={1} size="hero">
                welcome <Highlight color="amber">back</Highlight>
              </Heading>
              <p
                className="text-base text-[var(--color-text-muted)]"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                {t(s.subtitle, lang)}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <Label htmlFor="invite-code">{t(s.label, lang)}</Label>
                <Input
                  id="invite-code"
                  type="text"
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setError("");
                  }}
                  placeholder={t(s.placeholder, lang)}
                  required
                  autoFocus
                  autoComplete="off"
                  className="text-lg tracking-[0.3em] text-center !h-14"
                  style={{
                    fontFamily: "var(--font-mono)",
                    borderColor: error ? "var(--color-danger)" : undefined,
                  }}
                />
              </div>

              {error && (
                <div
                  className="text-sm text-[var(--color-danger)] border-l-2 border-[var(--color-danger)] pl-3 py-1"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  // {error}
                </div>
              )}

              <Button
                type="submit"
                variant="accent"
                size="lg"
                disabled={loading || !code.trim()}
                className="w-full"
              >
                {loading ? t(s.loading, lang) : `→ ${t(s.button, lang)}`}
              </Button>
            </form>

            <div
              className="text-sm text-[var(--color-text-muted)] pt-4 border-t border-[var(--color-border-hairline)]"
              style={{ fontFamily: "var(--font-mono)" }}
            >
              // {t(s.noCode, lang)}{" "}
              <Link
                to="/signup"
                className="text-[var(--color-text-primary)] font-medium hover:underline"
              >
                {t(s.requestLink, lang)} →
              </Link>
            </div>
          </div>
        </Section>

        {/* Inverse side panel — desktop only */}
        <Section
          scheme="inverse"
          size="lg"
          hairlineGrid
          className="hidden lg:flex items-center"
        >
          <div className="flex flex-col gap-6 max-w-md">
            <div className="flex items-center gap-3">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: "var(--color-accent)" }}
              />
              <Eyebrow>// status · live</Eyebrow>
            </div>
            <Heading as={2} size="hero" className="!font-bold">
              your brief is <Highlight color="amber">waiting</Highlight>.
            </Heading>
            <div className="flex flex-col gap-3 text-base" style={{ fontFamily: "var(--font-mono)" }}>
              <p>
                <span className="text-[var(--fg-muted)]">{">"}</span> 3 new competitor signals this week
              </p>
              <p>
                <span className="text-[var(--fg-muted)]">{">"}</span> 12 SKUs analyzed across xhs + douyin
              </p>
              <p>
                <span className="text-[var(--fg-muted)]">{">"}</span> 1 pricing shift worth acting on
              </p>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
