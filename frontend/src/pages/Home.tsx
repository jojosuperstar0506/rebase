import { useNavigate } from "react-router-dom";

const BG = "#0c0c14";
const S1 = "#14141e";
const S2 = "#1a1a28";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const AC2 = "#8b5cf6";
const TX = "#e4e4ec";
const T2 = "#9898a8";
const T3 = "#5a5a72";

const PILLARS = [
  {
    icon: "📡",
    title: "Market Intelligence",
    titleCn: "市场情报",
    description:
      "Daily AI-powered reports aggregating competitor moves, industry trends, and opportunity signals across 6 data sources — delivered before you start your day.",
  },
  {
    icon: "🎯",
    title: "Competitor Tracking",
    titleCn: "竞品追踪",
    description:
      "7-dimension brand equity tracking across your key competitors on XHS, Douyin, and Tmall. Updated every 3 days. Know their next move before they make it.",
  },
  {
    icon: "✍️",
    title: "Content Creation",
    titleCn: "内容创作",
    description:
      "From competitor analysis to publish-ready XHS notes in minutes. AI-powered pipeline that understands Chinese consumer psychology and platform algorithms.",
  },
  {
    icon: "⚙️",
    title: "Operations Automation",
    titleCn: "运营自动化",
    description:
      "AI agents that handle order syncing, inventory tracking, reconciliation, and invoicing — so your team focuses on growth, not admin.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Tell us about your business",
    description: "Fill out a short profile — your industry, competitors, and goals. Takes 2 minutes.",
  },
  {
    step: "02",
    title: "We review and approve",
    description: "Will and Joanna personally review each application and send you a unique access code.",
  },
  {
    step: "03",
    title: "Access your AI workspace",
    description: "Log in with your code. Every agent is pre-configured with your business context.",
  },
];

export default function Home() {
  const navigate = useNavigate();

  return (
    <div style={{ background: BG, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: TX }}>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px 64px", textAlign: "center" }}>
        <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: 3, color: AC, background: AC + "18", border: `1px solid ${AC}44`, borderRadius: 20, padding: "5px 16px", marginBottom: 28, textTransform: "uppercase" }}>
          AI Intelligence Platform for Chinese SMBs
        </div>

        <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 800, lineHeight: 1.15, margin: "0 0 24px", letterSpacing: -1 }}>
          Your business,{" "}
          <span style={{ background: `linear-gradient(135deg, ${AC}, ${AC2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            powered by AI
          </span>
        </h1>

        <p style={{ fontSize: 18, color: T2, lineHeight: 1.7, maxWidth: 620, margin: "0 auto 40px" }}>
          Rebase gives Chinese SMBs a dedicated AI team — market intelligence, competitor tracking, content creation, and operations automation — all in one workspace built around your business.
        </p>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => navigate("/onboarding")}
            style={{ padding: "14px 32px", background: `linear-gradient(135deg, ${AC}, ${AC2})`, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", letterSpacing: 0.3 }}
          >
            Request Access →
          </button>
          <a
            href="/calculator.html"
            style={{ padding: "14px 32px", background: "transparent", border: `1px solid ${BD}`, borderRadius: 8, color: TX, fontWeight: 600, fontSize: 15, textDecoration: "none", display: "inline-block" }}
          >
            Run AI Diagnostic
          </a>
        </div>

        <p style={{ fontSize: 13, color: T3, marginTop: 18 }}>
          Early access · Invite only · Personally reviewed by Will & Joanna
        </p>
      </div>

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${BD}` }} />

      {/* ── What is Rebase ────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: AC2, textTransform: "uppercase", marginBottom: 14 }}>What We Do</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 16px" }}>Four AI agents. One workspace.</h2>
          <p style={{ fontSize: 16, color: T2, maxWidth: 520, margin: "0 auto" }}>
            Each agent is pre-loaded with your company profile so it works for your business from day one — not a generic tool you have to train.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
          {PILLARS.map((p) => (
            <div key={p.title} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 28 }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{p.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: TX, marginBottom: 4 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: AC, fontWeight: 600, marginBottom: 12 }}>{p.titleCn}</div>
              <p style={{ fontSize: 14, color: T2, lineHeight: 1.65, margin: 0 }}>{p.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${BD}` }} />

      {/* ── AI Diagnostic CTA ─────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ background: S2, border: `1px solid ${BD}`, borderRadius: 16, padding: "48px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: AC, textTransform: "uppercase", marginBottom: 14 }}>Free Tool</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 14px" }}>How much could AI unlock for your business?</h2>
            <p style={{ fontSize: 15, color: T2, lineHeight: 1.65, margin: 0 }}>
              Answer 10 questions about your operations. Our diagnostic calculates your AI opportunity — in hours saved, cost reduced, and revenue unlocked.
            </p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <a
              href="/calculator.html"
              style={{ display: "block", padding: "14px 32px", background: S1, border: `1px solid ${AC}`, borderRadius: 8, color: AC, fontWeight: 700, fontSize: 15, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap" }}
            >
              Run Free Diagnostic →
            </a>
            <p style={{ fontSize: 12, color: T3, textAlign: "center", marginTop: 10 }}>No account needed</p>
          </div>
        </div>
      </div>

      {/* ── Divider ───────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${BD}` }} />

      {/* ── How it Works ──────────────────────────────────────────── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: AC2, textTransform: "uppercase", marginBottom: 14 }}>How It Works</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>From application to AI workspace in 24 hours</h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {HOW_IT_WORKS.map((s) => (
            <div key={s.step} style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 28 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: BD, marginBottom: 16 }}>{s.step}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 10 }}>{s.title}</div>
              <p style={{ fontSize: 14, color: T2, lineHeight: 1.65, margin: 0 }}>{s.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Final CTA ─────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${BD}` }} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 16px" }}>Ready to see what AI can do for your business?</h2>
        <p style={{ fontSize: 16, color: T2, marginBottom: 32 }}>Early access is limited. We personally onboard every client.</p>
        <button
          onClick={() => navigate("/onboarding")}
          style={{ padding: "16px 40px", background: `linear-gradient(135deg, ${AC}, ${AC2})`, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}
        >
          Apply for Early Access →
        </button>
      </div>

      {/* ── Footer ────────────────────────────────────────────────── */}
      <div style={{ borderTop: `1px solid ${BD}`, padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: T3, margin: 0 }}>© 2026 Rebase · AI Intelligence for Chinese SMBs · Built by Will & Joanna</p>
      </div>

    </div>
  );
}
