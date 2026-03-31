import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

const BG = "#0c0c14";
const S1 = "#14141e";
const S2 = "#1c1c28";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

function Field({ label, value, onChange, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; type?: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", padding: "10px 12px", background: BG, border: `1px solid ${BD}`, borderRadius: 6, color: TX, fontSize: 14, outline: "none", boxSizing: "border-box" }}
      />
    </div>
  );
}

function TextArea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        style={{ width: "100%", padding: "10px 12px", background: BG, border: `1px solid ${BD}`, borderRadius: 6, color: TX, fontSize: 14, outline: "none", resize: "vertical", boxSizing: "border-box" }}
      />
    </div>
  );
}

export default function Onboarding() {
  const [form, setForm] = useState({ name: "", phone: "", company: "", industry: "", competitors: "", email: "", goal: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const navigate = useNavigate();

  function set(field: string) { return (v: string) => setForm((f) => ({ ...f, [field]: v })); }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!form.name || !form.phone || !form.industry) {
      setErrorMsg("Please fill in Name, Phone, and Industry at minimum.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setStatus("success");
      // Redirect to login after 1.5s with phone pre-filled
      setTimeout(() => navigate("/login", { state: { phone: form.phone } }), 1500);
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  if (status === "success") {
    return (
      <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ width: 500, background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: TX, marginBottom: 12 }}>You're all set!</div>
          <div style={{ fontSize: 14, color: T2, lineHeight: 1.7 }}>
            Taking you to login... you'll receive a code at <span style={{ color: AC }}>{form.phone}</span>.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, fontFamily: "system-ui, sans-serif", padding: "40px 20px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: AC, marginBottom: 8 }}>Rebase</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: TX, marginBottom: 8 }}>Request Early Access</div>
          <div style={{ fontSize: 14, color: T2 }}>Tell us about your business and what you want to track. We'll get back to you within 24 hours.</div>
        </div>

        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 36 }}>
          <form onSubmit={handleSubmit}>
            <Field label="FULL NAME *" value={form.name} onChange={set("name")} placeholder="Your name" />
            <Field label="PHONE NUMBER *" value={form.phone} onChange={set("phone")} placeholder="+86 138 0000 0000" type="tel" />
            <Field label="EMAIL" value={form.email} onChange={set("email")} placeholder="you@company.com" type="email" />
            <Field label="COMPANY NAME" value={form.company} onChange={set("company")} placeholder="Your company" />
            <Field label="INDUSTRY *" value={form.industry} onChange={set("industry")} placeholder="e.g. 电商 / 零售 / SaaS / 消费品" />
            <Field label="COMPETITORS TO TRACK" value={form.competitors} onChange={set("competitors")} placeholder="e.g. 竞品A, 竞品B, 竞品C (comma separated)" />

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>WHAT DO YOU WANT FROM REBASE?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {["竞品监控", "内容生成", "市场分析", "商业决策支持"].map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => set("goal")(form.goal === opt ? "" : opt)}
                    style={{ padding: "6px 14px", borderRadius: 20, border: `1px solid ${form.goal === opt ? AC : BD}`, background: form.goal === opt ? AC + "22" : S2, color: form.goal === opt ? AC : T2, fontSize: 13, cursor: "pointer" }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <TextArea label="ANYTHING ELSE?" value={form.goal.length > 10 ? form.goal : ""} onChange={set("goal")} placeholder="Tell us more about your goals or specific needs..." />

            {errorMsg && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>{errorMsg}</div>}

            <button
              type="submit"
              disabled={status === "loading"}
              style={{ width: "100%", padding: "12px", background: status === "loading" ? BD : AC, border: "none", borderRadius: 6, color: status === "loading" ? T2 : "#000", fontWeight: 700, fontSize: 14, cursor: status === "loading" ? "not-allowed" : "pointer" }}
            >
              {status === "loading" ? "Submitting..." : "Request Access →"}
            </button>
          </form>
        </div>

        <div style={{ textAlign: "center", marginTop: 20, fontSize: 13, color: T2 }}>
          Already have an access code?{" "}
          <a href="/login" style={{ color: AC, textDecoration: "none" }}>Log in here</a>
        </div>
      </div>
    </div>
  );
}
