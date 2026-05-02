import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";

export default function Home() {
  const { colors: C, lang } = useApp();
  const navigate = useNavigate();
  const h = T.home;
  const isLoggedIn = !!localStorage.getItem("rebase_token") || !!localStorage.getItem("admin_authed");

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: C.tx }}>

      {/* ── Hero ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px 64px", textAlign: "center" }}>
        <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: 3, color: C.ac, background: C.ac + "18", border: `1px solid ${C.ac}44`, borderRadius: 20, padding: "5px 16px", marginBottom: 28, textTransform: "uppercase" }}>
          {t(h.badge, lang)}
        </div>
        <style>{`
          .rebase-hero-grad {
            background: linear-gradient(135deg, ${C.ac}, ${C.ac2});
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            color: transparent;
          }
        `}</style>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 800, lineHeight: 1.15, margin: "0 0 24px", letterSpacing: -1 }}>
          {t(h.heroTitle1, lang)}{" "}
          <span className="rebase-hero-grad">{t(h.heroTitle2, lang)}</span>
        </h1>
        <p style={{ fontSize: 18, color: C.t2, lineHeight: 1.7, maxWidth: 620, margin: "0 auto 40px" }}>
          {t(h.heroSubtitle, lang)}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate(isLoggedIn ? "/ci" : "/onboarding")} style={{ padding: "14px 32px", background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" }}>
            {t(isLoggedIn ? h.ctaContinue : h.ctaAccess, lang)}
          </button>
          <a href="/calculator.html" style={{ padding: "14px 32px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontWeight: 600, fontSize: 15, textDecoration: "none", display: "inline-block" }}>
            {t(h.ctaDiag, lang)}
          </a>
        </div>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 18 }}>{t(h.earlyAccess, lang)}</p>
      </div>

      <div style={{ borderTop: `1px solid ${C.bd}` }} />

      {/* ── Pillars ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: C.ac2, textTransform: "uppercase", marginBottom: 14 }}>{t(h.whatWeDoLabel, lang)}</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 16px" }}>{t(h.whatWeDoTitle, lang)}</h2>
          <p style={{ fontSize: 16, color: C.t2, maxWidth: 520, margin: "0 auto" }}>{t(h.whatWeDoSub, lang)}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 16 }}>
          {h.pillars.map((p) => (
            <div key={p.icon} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 28 }}>
              <div style={{ fontSize: 28, marginBottom: 14 }}>{p.icon}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{t(p.title, lang)}</div>
              <div style={{ fontSize: 12, color: C.ac, fontWeight: 600, marginBottom: 12 }}>{t(p.title, lang === "en" ? "zh" : "en")}</div>
              <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.65, margin: 0 }}>{t(p.desc, lang)}</p>
            </div>
          ))}
        </div>

        {/* CI vFinal spotlight card */}
        <div style={{
          background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
          padding: 24, textAlign: "center", marginTop: 24,
          borderTop: `3px solid ${C.ac}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac, textTransform: "uppercase", marginBottom: 10 }}>
            {lang === "zh" ? "现已上线" : "Now Live"}
          </div>
          <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
            {t(T.ci.homeTitle, lang)}
          </h3>
          <p style={{ color: C.t2, fontSize: 14, marginBottom: 16, maxWidth: 480, margin: "0 auto 16px", lineHeight: 1.65 }}>
            {t(T.ci.homeDesc, lang)}
          </p>
          <a href="/ci" style={{
            display: "inline-block",
            background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`,
            color: "#fff", padding: "10px 24px", borderRadius: 8,
            textDecoration: "none", fontWeight: 600, fontSize: 14,
          }}>
            {t(T.ci.homeButton, lang)}
          </a>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.bd}` }} />

      {/* ── Diagnostic CTA ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 16, padding: "48px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: C.ac, textTransform: "uppercase", marginBottom: 14 }}>{t(h.diagLabel, lang)}</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 14px" }}>{t(h.diagTitle, lang)}</h2>
            <p style={{ fontSize: 15, color: C.t2, lineHeight: 1.65, margin: 0 }}>{t(h.diagDesc, lang)}</p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <a href="/calculator.html" style={{ display: "block", padding: "14px 32px", background: C.s1, border: `1px solid ${C.ac}`, borderRadius: 8, color: C.ac, fontWeight: 700, fontSize: 15, textDecoration: "none", textAlign: "center", whiteSpace: "nowrap" }}>
              {t(h.diagCta, lang)}
            </a>
            <p style={{ fontSize: 12, color: C.t3, textAlign: "center", marginTop: 10 }}>{t(h.diagNote, lang)}</p>
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.bd}` }} />

      {/* ── How it Works ── */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 3, color: C.ac2, textTransform: "uppercase", marginBottom: 14 }}>{t(h.howLabel, lang)}</div>
          <h2 style={{ fontSize: 32, fontWeight: 800, margin: 0 }}>{t(h.howTitle, lang)}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {h.steps.map((s) => (
            <div key={s.step} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 28 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: C.bd, marginBottom: 16 }}>{s.step}</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 10 }}>{t(s.title, lang)}</div>
              <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.65, margin: 0 }}>{t(s.desc, lang)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Final CTA ── */}
      <div style={{ borderTop: `1px solid ${C.bd}` }} />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "64px 24px", textAlign: "center" }}>
        <h2 style={{ fontSize: 28, fontWeight: 800, margin: "0 0 16px" }}>{t(h.finalTitle, lang)}</h2>
        <p style={{ fontSize: 16, color: C.t2, marginBottom: 32 }}>{t(h.finalSub, lang)}</p>
        <button onClick={() => navigate(isLoggedIn ? "/ci" : "/onboarding")} style={{ padding: "16px 40px", background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer" }}>
          {t(isLoggedIn ? h.ctaContinue : h.finalCta, lang)}
        </button>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: `1px solid ${C.bd}`, padding: "24px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>{t(h.footer, lang)}</p>
      </div>
    </div>
  );
}
