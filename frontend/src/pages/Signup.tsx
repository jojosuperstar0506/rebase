import { useState } from "react";
import type { FormEvent, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";

const INDUSTRIES = [
  { slug: "bag", label: "箱包 (Handbags & Accessories)" },
];

export default function Signup() {
  const { colors: C, theme, lang, setTheme, setLang } = useApp();
  const [form, setForm] = useState({
    email: "", password: "", confirmPassword: "",
    brand_name: "", brand_name_en: "", industry_slug: "bag",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const inputStyle: CSSProperties = {
    width: "100%", padding: "10px 12px", background: C.inputBg,
    border: `1px solid ${C.inputBd}`, borderRadius: 6,
    color: C.tx, fontSize: 14, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: CSSProperties = {
    fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 6, display: "block",
  };
  const fieldStyle: CSSProperties = { marginBottom: 16 };
  const btnStyle: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 6,
    padding: "5px 11px", cursor: "pointer", color: C.t2, fontSize: 12, fontWeight: 600,
  };

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!form.brand_name.trim()) {
      setError("Brand name is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/v2/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          brand_name: form.brand_name.trim(),
          brand_name_en: form.brand_name_en.trim(),
          industry_slug: form.industry_slug,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          setError("This email is already registered. Please log in instead.");
        } else {
          setError(data.detail || data.error || "Something went wrong");
        }
        return;
      }
      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  // ── Success state ────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: `1px solid ${C.bd}` }}>
          <Link to="/" style={{ textDecoration: "none", fontSize: 16, fontWeight: 800, color: C.ac }}>Rebase</Link>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ width: 420, background: C.s1, border: `1px solid ${C.success}44`, borderRadius: 12, padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.success, marginBottom: 12 }}>Application submitted!</div>
            <div style={{ fontSize: 14, color: C.t2, lineHeight: 1.6, marginBottom: 28 }}>
              We'll review your account within 24 hours.<br /><br />
              Once approved, you'll receive an <strong style={{ color: C.tx }}>invite code by email</strong>.<br />
              Use it at the <Link to="/login" style={{ color: C.ac, textDecoration: "none", fontWeight: 600 }}>login page</Link> to access your dashboard.
            </div>
            <Link to="/" style={{ display: "inline-block", padding: "10px 24px", background: C.ac, borderRadius: 6, color: "#000", fontWeight: 700, textDecoration: "none", fontSize: 14 }}>
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Signup form ───────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* Top bar */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 24px", borderBottom: `1px solid ${C.bd}` }}>
        <Link to="/" style={{ textDecoration: "none", fontSize: 16, fontWeight: 800, color: C.ac }}>Rebase</Link>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} style={btnStyle}>
            {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
          </button>
          <button onClick={() => setLang(lang === "en" ? "zh" : "en")} style={btnStyle}>
            {lang === "en" ? "中文" : "EN"}
          </button>
        </div>
      </div>

      {/* Form */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <div style={{ width: 420, background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 40 }}>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <div style={{ fontSize: 24, fontWeight: 700, color: C.tx, marginBottom: 6 }}>Create your account</div>
            <div style={{ fontSize: 13, color: C.t2 }}>Access the competitive intelligence platform</div>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={fieldStyle}>
              <label style={labelStyle}>Work Email</label>
              <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@company.com" style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Password <span style={{ fontWeight: 400 }}>(min. 8 characters)</span></label>
              <input type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Confirm Password</label>
              <input type="password" required value={form.confirmPassword} onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} placeholder="••••••••" style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Brand Name (Chinese)</label>
              <input type="text" required value={form.brand_name} onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))} placeholder="e.g. 拉菲斯特" style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Brand Name (English) <span style={{ fontWeight: 400 }}>— optional</span></label>
              <input type="text" value={form.brand_name_en} onChange={e => setForm(f => ({ ...f, brand_name_en: e.target.value }))} placeholder="e.g. La Festin" style={inputStyle} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Industry</label>
              <select value={form.industry_slug} onChange={e => setForm(f => ({ ...f, industry_slug: e.target.value }))} style={{ ...inputStyle, cursor: "pointer" }}>
                {INDUSTRIES.map(i => <option key={i.slug} value={i.slug}>{i.label}</option>)}
              </select>
            </div>

            {error && (
              <div style={{ fontSize: 13, color: C.danger, background: C.danger + "11", border: `1px solid ${C.danger}44`, borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{ width: "100%", padding: 12, background: loading ? C.bd : C.ac, border: "none", borderRadius: 6, color: loading ? C.t2 : "#000", fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer" }}>
              {loading ? "Submitting..." : "Request Access"}
            </button>
          </form>

          <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: C.t2 }}>
            Already approved?{" "}
            <Link to="/customer-login" style={{ color: C.ac, textDecoration: "none", fontWeight: 600 }}>Log in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
