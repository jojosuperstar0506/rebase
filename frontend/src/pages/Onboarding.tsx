import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";

export default function Onboarding() {
  const { colors: C, lang, theme, setTheme, setLang } = useApp();
  const [form, setForm] = useState({ name: "", phone: "", company: "", industry: "", competitors: "", email: "" });
  const [goalPreset, setGoalPreset] = useState("");   // which quick-select button is active
  const [goalCustom, setGoalCustom] = useState("");   // free-form textarea content
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();
  const s = T.onboarding;
  const nav = T.nav;

  function set(field: string) { return (v: string) => setForm((f) => ({ ...f, [field]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name || !form.phone || !form.industry) {
      setErrorMsg(t(s.validation, lang));
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, goal: goalPreset || goalCustom }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Submission failed");
      navigate("/success");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : t(s.error, lang));
    }
  }

  function Field({ fieldKey, type = "text" }: { fieldKey: keyof typeof s.fields; type?: string }) {
    return (
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 6 }}>{t(s.fields[fieldKey], lang)}</div>
        <input
          type={type}
          value={form[fieldKey as keyof typeof form]}
          onChange={(e) => set(fieldKey)(e.target.value)}
          placeholder={t(s.placeholders[fieldKey], lang)}
          style={{ width: "100%", padding: "10px 12px", background: C.inputBg, border: `1px solid ${C.inputBd}`, borderRadius: 6, color: C.tx, fontSize: 14, outline: "none", boxSizing: "border-box" }}
        />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "system-ui, sans-serif" }}>

      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: `1px solid ${C.bd}` }}>
        <a href="/" style={{ fontSize: 16, fontWeight: 800, color: C.ac, textDecoration: "none" }}>Rebase</a>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 6, padding: "5px 11px", cursor: "pointer", color: C.t2, fontSize: 12, fontWeight: 600 }}>
            {theme === "dark" ? "☀️ " + t(nav.lightMode, lang) : "🌙 " + t(nav.darkMode, lang)}
          </button>
          <button onClick={() => setLang(lang === "en" ? "zh" : "en")} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 6, padding: "5px 11px", cursor: "pointer", color: C.t2, fontSize: 12, fontWeight: 600 }}>
            {lang === "en" ? "中文" : "EN"}
          </button>
        </div>
      </div>

      <div style={{ padding: "40px 20px" }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 40 }}>
            <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac, background: C.ac + "18", border: `1px solid ${C.ac}44`, borderRadius: 20, padding: "5px 14px", marginBottom: 16, textTransform: "uppercase" }}>
              {t(s.badge, lang)}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.tx, marginBottom: 8 }}>{t(s.title, lang)}</div>
            <div style={{ fontSize: 14, color: C.t2 }}>{t(s.subtitle, lang)}</div>
          </div>

          <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 36 }}>
            <form onSubmit={handleSubmit}>
              <Field fieldKey="name" />
              <Field fieldKey="phone" type="tel" />
              <Field fieldKey="email" type="email" />
              <Field fieldKey="company" />
              <Field fieldKey="industry" />
              <Field fieldKey="competitors" />

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 6 }}>{t(s.fields.goal, lang)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {(lang === "zh"
                    ? ["竞品监控", "内容生成", "市场分析", "商业决策支持"]
                    : ["Competitor tracking", "Content creation", "Market analysis", "Business insights"]
                  ).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        setGoalPreset((prev) => (prev === opt ? "" : opt));
                        setGoalCustom("");
                      }}
                      style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${goalPreset === opt ? C.ac : C.bd}`, background: goalPreset === opt ? C.ac + "22" : C.s2, color: goalPreset === opt ? C.ac : C.t2, fontSize: 13, cursor: "pointer" }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <textarea
                  value={goalCustom}
                  onChange={(e) => { setGoalCustom(e.target.value); setGoalPreset(""); }}
                  placeholder={t(s.placeholders.goal, lang)}
                  rows={3}
                  style={{ width: "100%", padding: "10px 12px", background: C.inputBg, border: `1px solid ${C.inputBd}`, borderRadius: 6, color: C.tx, fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }}
                />
              </div>

              {errorMsg && <div style={{ fontSize: 13, color: C.danger, marginBottom: 16 }}>{errorMsg}</div>}

              <button
                type="submit"
                disabled={status === "loading"}
                style={{ width: "100%", padding: "12px", background: status === "loading" ? C.bd : C.ac, border: "none", borderRadius: 6, color: status === "loading" ? C.t2 : "#000", fontWeight: 700, fontSize: 14, cursor: status === "loading" ? "not-allowed" : "pointer" }}
              >
                {status === "loading" ? t(s.submitting, lang) : t(s.submit, lang)}
              </button>
            </form>
          </div>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: C.t2 }}>
            {t(T.login.noCode, lang)}{" "}
            <a href="/login" style={{ color: C.ac, textDecoration: "none", fontWeight: 600 }}>{t(T.login.requestLink, lang)}</a>
          </div>
        </div>
      </div>
    </div>
  );
}
