import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";

export default function Login() {
  const { colors: C, lang, theme, setTheme, setLang } = useApp();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const s = T.login;
  const nav = T.nav;

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
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>

      {/* Minimal top bar with toggles */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: `1px solid ${C.bd}` }}>
        <span style={{ fontSize: 16, fontWeight: 800, color: C.ac }}>Rebase</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 6, padding: "5px 11px", cursor: "pointer", color: C.t2, fontSize: 12, fontWeight: 600 }}>
            {theme === "dark" ? "☀️ " + t(nav.lightMode, lang) : "🌙 " + t(nav.darkMode, lang)}
          </button>
          <button onClick={() => setLang(lang === "en" ? "zh" : "en")} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 6, padding: "5px 11px", cursor: "pointer", color: C.t2, fontSize: 12, fontWeight: 600 }}>
            {lang === "en" ? "中文" : "EN"}
          </button>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}>
        <div style={{ width: 420, background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 40 }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: C.ac, marginBottom: 8 }}>Rebase</div>
            <div style={{ fontSize: 14, color: C.t2 }}>{t(s.subtitle, lang)}</div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 6 }}>{t(s.label, lang)}</div>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
                placeholder={t(s.placeholder, lang)}
                required autoFocus autoComplete="off"
                style={{ width: "100%", padding: "10px 12px", background: C.inputBg, border: `1px solid ${error ? C.danger : C.inputBd}`, borderRadius: 6, color: C.tx, fontSize: 18, letterSpacing: 4, textAlign: "center", outline: "none", boxSizing: "border-box", fontFamily: "monospace" }}
              />
            </div>

            {error && <div style={{ fontSize: 13, color: C.danger, marginBottom: 16, textAlign: "center" }}>{error}</div>}

            <button type="submit" disabled={loading || !code.trim()} style={{ width: "100%", padding: "12px", background: loading || !code.trim() ? C.bd : C.ac, border: "none", borderRadius: 6, color: loading || !code.trim() ? C.t2 : "#000", fontWeight: 700, fontSize: 14, cursor: loading || !code.trim() ? "not-allowed" : "pointer" }}>
              {loading ? t(s.loading, lang) : t(s.button, lang)}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: C.t2 }}>
            {t(s.noCode, lang)}{" "}
            <a href="/onboarding" style={{ color: C.ac, textDecoration: "none", fontWeight: 600 }}>{t(s.requestLink, lang)}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
