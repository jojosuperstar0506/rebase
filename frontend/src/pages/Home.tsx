import { useNavigate } from "react-router-dom";
import { Radar, Gauge, Compass, Rocket, ArrowRight, Sparkles } from "lucide-react";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";

const PILLAR_ICONS: Record<string, typeof Radar> = {
  Radar,
  Gauge,
  Compass,
  Rocket,
};

const MAX_W = 1200;

export default function Home() {
  const { colors: C, lang } = useApp();
  const navigate = useNavigate();
  const h = T.home;
  const isLoggedIn = !!localStorage.getItem("rebase_token") || !!localStorage.getItem("admin_authed");

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui, -apple-system, sans-serif", color: C.tx }}>

      {/* ── Hero ── */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "96px 32px 72px", textAlign: "center" }}>
        <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac, background: C.ac + "18", border: `1px solid ${C.ac}44`, borderRadius: 20, padding: "5px 16px", marginBottom: 28, textTransform: "uppercase" }}>
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
        <h1 style={{ fontSize: "clamp(38px, 6.5vw, 68px)", fontWeight: 800, lineHeight: 1.1, margin: "0 0 24px", letterSpacing: -1.5, maxWidth: 920, marginLeft: "auto", marginRight: "auto" }}>
          {t(h.heroTitle1, lang)}{" "}
          <span className="rebase-hero-grad">{t(h.heroTitle2, lang)}</span>
        </h1>
        <p style={{ fontSize: 18, color: C.t2, lineHeight: 1.7, maxWidth: 720, margin: "0 auto 40px" }}>
          {t(h.heroSubtitle, lang)}
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => navigate(isLoggedIn ? "/ci" : "/onboarding")} style={{ padding: "14px 32px", background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {t(isLoggedIn ? h.ctaContinue : h.ctaAccess, lang).replace(/\s*→\s*$/, "")}
            <ArrowRight size={16} strokeWidth={2.5} />
          </button>
          <a href="/calculator.html" style={{ padding: "14px 32px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 8, color: C.tx, fontWeight: 600, fontSize: 15, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <Sparkles size={15} />
            {t(h.ctaDiag, lang)}
          </a>
        </div>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 22 }}>{t(h.earlyAccess, lang)}</p>
      </div>

      <div style={{ borderTop: `1px solid ${C.bd}` }} />

      {/* ── Pillars ── */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac2, textTransform: "uppercase", marginBottom: 14 }}>{t(h.whatWeDoLabel, lang)}</div>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 36px)", fontWeight: 800, margin: "0 0 18px", letterSpacing: -0.5 }}>{t(h.whatWeDoTitle, lang)}</h2>
          <p style={{ fontSize: 16, color: C.t2, maxWidth: 640, margin: "0 auto", lineHeight: 1.65 }}>{t(h.whatWeDoSub, lang)}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
          {h.pillars.map((p) => {
            const Icon = PILLAR_ICONS[p.icon] || Radar;
            return (
              <div key={p.icon} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 28 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: C.ac + "14", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 18, color: C.ac }}>
                  <Icon size={22} strokeWidth={1.75} />
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{t(p.title, lang)}</div>
                <div style={{ fontSize: 12, color: C.ac, fontWeight: 600, marginBottom: 12 }}>{t(p.title, lang === "en" ? "zh" : "en")}</div>
                <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.65, margin: 0 }}>{t(p.desc, lang)}</p>
              </div>
            );
          })}
        </div>

        {/* CI vFinal spotlight card */}
        <div style={{
          background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14,
          padding: 28, textAlign: "center", marginTop: 24,
          borderTop: `3px solid ${C.ac}`,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac, textTransform: "uppercase", marginBottom: 10 }}>
            {lang === "zh" ? "现已上线" : "Now Live"}
          </div>
          <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
            {t(T.ci.homeTitle, lang)}
          </h3>
          <p style={{ color: C.t2, fontSize: 14, marginBottom: 18, maxWidth: 560, margin: "0 auto 18px", lineHeight: 1.65 }}>
            {t(T.ci.homeDesc, lang)}
          </p>
          <a href="/ci" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`,
            color: "#fff", padding: "10px 24px", borderRadius: 8,
            textDecoration: "none", fontWeight: 600, fontSize: 14,
          }}>
            {t(T.ci.homeButton, lang).replace(/\s*→\s*$/, "")}
            <ArrowRight size={14} strokeWidth={2.5} />
          </a>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.bd}` }} />

      {/* ── Diagnostic CTA ── */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 16, padding: "56px 44px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac, textTransform: "uppercase", marginBottom: 14 }}>{t(h.diagLabel, lang)}</div>
            <h2 style={{ fontSize: "clamp(22px, 2.6vw, 28px)", fontWeight: 800, margin: "0 0 14px", letterSpacing: -0.5 }}>{t(h.diagTitle, lang)}</h2>
            <p style={{ fontSize: 15, color: C.t2, lineHeight: 1.65, margin: 0 }}>{t(h.diagDesc, lang)}</p>
          </div>
          <div style={{ flexShrink: 0 }}>
            <a href="/calculator.html" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 28px", background: C.s1, border: `1px solid ${C.ac}`, borderRadius: 8, color: C.ac, fontWeight: 700, fontSize: 15, textDecoration: "none", whiteSpace: "nowrap" }}>
              {t(h.diagCta, lang).replace(/\s*→\s*$/, "")}
              <ArrowRight size={15} strokeWidth={2.5} />
            </a>
            <p style={{ fontSize: 12, color: C.t3, textAlign: "center", marginTop: 10 }}>{t(h.diagNote, lang)}</p>
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.bd}` }} />

      {/* ── How it Works ── */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac2, textTransform: "uppercase", marginBottom: 14 }}>{t(h.howLabel, lang)}</div>
          <h2 style={{ fontSize: "clamp(28px, 3.5vw, 36px)", fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>{t(h.howTitle, lang)}</h2>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 }}>
          {h.steps.map((s) => (
            <div key={s.step} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 30 }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: C.bd, marginBottom: 18, fontVariantNumeric: "tabular-nums" }}>{s.step}</div>
              <div style={{ fontSize: 17, fontWeight: 700, color: C.tx, marginBottom: 12 }}>{t(s.title, lang)}</div>
              <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.65, margin: 0 }}>{t(s.desc, lang)}</p>
            </div>
          ))}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${C.bd}` }} />

      {/* ── Founders ── */}
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "80px 32px" }}>
        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac2, textTransform: "uppercase", marginBottom: 14 }}>{t(h.foundersLabel, lang)}</div>
          <h2 style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 800, margin: "0 0 18px", letterSpacing: -0.5 }}>{t(h.foundersTitle, lang)}</h2>
          <p style={{ fontSize: 15, color: C.t2, maxWidth: 640, margin: "0 auto", lineHeight: 1.65 }}>{t(h.foundersSub, lang)}</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 20, maxWidth: 880, margin: "0 auto" }}>
          {h.founders.map((f) => (
            <div key={f.initial} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14, padding: 28, display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{
                flexShrink: 0,
                width: 56, height: 56, borderRadius: "50%",
                background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`,
                color: "#fff", fontSize: 22, fontWeight: 700,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {f.initial}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{t(f.name, lang)}</div>
                  <div style={{ fontSize: 12, color: C.ac, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>{t(f.role, lang)}</div>
                </div>
                <ul style={{ fontSize: 14, color: C.t2, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
                  {(f.bio[lang] as readonly string[]).map((point, idx) => (
                    <li key={idx} style={{ marginBottom: 4 }}>{point}</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Final CTA ── */}
      <div style={{ borderTop: `1px solid ${C.bd}` }} />
      <div style={{ maxWidth: MAX_W, margin: "0 auto", padding: "80px 32px", textAlign: "center" }}>
        <h2 style={{ fontSize: "clamp(26px, 3.2vw, 34px)", fontWeight: 800, margin: "0 0 18px", letterSpacing: -0.5 }}>{t(h.finalTitle, lang)}</h2>
        <p style={{ fontSize: 16, color: C.t2, marginBottom: 32 }}>{t(h.finalSub, lang)}</p>
        <button onClick={() => navigate(isLoggedIn ? "/ci" : "/onboarding")} style={{ padding: "16px 40px", background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`, border: "none", borderRadius: 8, color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {t(isLoggedIn ? h.ctaContinue : h.finalCta, lang).replace(/\s*→\s*$/, "")}
          <ArrowRight size={17} strokeWidth={2.5} />
        </button>
      </div>

      {/* ── Footer ── */}
      <div style={{ borderTop: `1px solid ${C.bd}`, padding: "28px", textAlign: "center" }}>
        <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>{t(h.footer, lang)}</p>
      </div>
    </div>
  );
}
