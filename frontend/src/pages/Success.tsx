import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";

export default function Success() {
  const { colors: C, lang } = useApp();
  const navigate = useNavigate();
  const s = T.success;

  // Check if user submitted competitors during onboarding
  const hasCompetitors = !!localStorage.getItem('rebase_submitted_competitors');

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui, sans-serif", color: C.tx }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "64px 24px" }}>

        {/* Badge */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: 3, color: C.success, background: C.success + "18", border: `1px solid ${C.success}44`, borderRadius: 20, padding: "5px 16px", marginBottom: 24, textTransform: "uppercase" }}>
            ✓ {t(s.badge, lang)}
          </div>
          <h1 style={{ fontSize: "clamp(28px, 5vw, 42px)", fontWeight: 800, margin: "0 0 18px", lineHeight: 1.2 }}>
            {t(s.title, lang)}
          </h1>
          <p style={{ fontSize: 17, color: C.t2, lineHeight: 1.7, maxWidth: 560, margin: "0 auto" }}>
            {t(s.subtitle, lang)}
          </p>
        </div>

        {/* What happens next */}
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 32, marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ac, letterSpacing: 2, textTransform: "uppercase", marginBottom: 20 }}>
            {t(s.whatNextTitle, lang)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {s.steps.map((step, i) => (
              <div key={i} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{ fontSize: 24, flexShrink: 0, width: 44, height: 44, background: C.s2, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {step.icon}
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{t(step.title, lang)}</div>
                  <div style={{ fontSize: 14, color: C.t2, lineHeight: 1.6 }}>{t(step.desc, lang)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* About Rebase */}
        <div style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 32, marginBottom: 32 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.ac2, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14 }}>
            {t(s.aboutTitle, lang)}
          </div>
          <p style={{ fontSize: 15, color: C.t2, lineHeight: 1.75, margin: 0 }}>
            {t(s.aboutDesc, lang)}
          </p>
        </div>

        {/* CI preview card — shown when competitors were submitted */}
        {hasCompetitors && (
          <div style={{
            background: C.s1,
            border: `1px solid ${C.ac}`,
            borderRadius: 12,
            padding: 24,
            marginBottom: 24,
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📊</div>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, marginTop: 0, color: C.tx }}>
              {t(T.ci.yourIntelReady, lang)}
            </h3>
            <p style={{ color: C.t2, fontSize: 14, lineHeight: 1.7, marginBottom: 16 }}>
              {t(T.ci.onboardingCIHint, lang)}
            </p>
            <a
              href="/ci"
              style={{
                display: 'inline-block',
                background: C.ac,
                color: '#fff',
                padding: '10px 24px',
                borderRadius: 8,
                textDecoration: 'none',
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {t(T.ci.viewDashboard, lang)} →
            </a>
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <button
            onClick={() => navigate("/")}
            style={{ background: "none", border: `1px solid ${C.bd}`, borderRadius: 8, padding: "10px 20px", color: C.t2, fontSize: 14, cursor: "pointer", fontWeight: 500 }}
          >
            {t(s.backHome, lang)}
          </button>
          <div style={{ fontSize: 14, color: C.t2 }}>
            {t(s.loginPrompt, lang)}{" "}
            <button
              onClick={() => navigate("/login")}
              style={{ background: "none", border: "none", color: C.ac, fontWeight: 700, fontSize: 14, cursor: "pointer", textDecoration: "underline", padding: 0 }}
            >
              {t(s.loginLink, lang)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
