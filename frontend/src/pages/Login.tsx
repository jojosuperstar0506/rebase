import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const BG = "#0c0c14";
const S1 = "#14141e";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

export default function Login() {
  const location = useLocation();
  const prefilled = (location.state as { phone?: string } | null)?.phone || "";

  const [phone, setPhone] = useState(prefilled);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send code");
      setStep("otp");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    }
    setLoading(false);
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: otp.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid code");
      localStorage.setItem("rebase_token", data.token);
      navigate("/agents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    }
    setLoading(false);
  }

  const inputStyle = {
    width: "100%", padding: "10px 12px", background: BG,
    border: `1px solid ${BD}`, borderRadius: 6, color: TX,
    fontSize: 14, outline: "none", boxSizing: "border-box" as const,
  };

  const btnStyle = {
    width: "100%", padding: "12px", background: loading ? BD : AC,
    border: "none", borderRadius: 6, color: loading ? T2 : "#000",
    fontWeight: 700, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: 420, background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 40 }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: AC, marginBottom: 8 }}>Rebase</div>
          {step === "phone"
            ? <div style={{ fontSize: 14, color: T2 }}>Enter your phone number to receive a login code</div>
            : <div style={{ fontSize: 14, color: T2 }}>Code sent to <span style={{ color: TX }}>{phone}</span></div>
          }
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {["Phone", "Verify"].map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 3, borderRadius: 2, marginBottom: 4, transition: "background 0.3s",
                background: (step === "phone" && i === 0) || (step === "otp") ? AC : BD }} />
              <div style={{ fontSize: 11, color: (step === "phone" && i === 0) || (step === "otp" && i === 1) ? AC : T2 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {step === "phone" && (
          <form onSubmit={handleSendCode}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>PHONE NUMBER</div>
              <input
                type="tel"
                value={phone}
                onChange={(e) => { setPhone(e.target.value); setError(""); }}
                placeholder="+86 138 0000 0000"
                required
                autoFocus
                style={inputStyle}
              />
              <div style={{ fontSize: 11, color: T2, marginTop: 6 }}>Include country code, e.g. +86 for China</div>
            </div>
            {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? "Sending..." : "Send Login Code →"}
            </button>
          </form>
        )}

        {step === "otp" && (
          <form onSubmit={handleVerifyOtp}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>6-DIGIT CODE</div>
              <input
                type="text"
                value={otp}
                onChange={(e) => { setOtp(e.target.value); setError(""); }}
                placeholder="123456"
                maxLength={6}
                required
                autoFocus
                style={{ ...inputStyle, fontSize: 24, letterSpacing: 10, textAlign: "center" }}
              />
              <div style={{ fontSize: 12, color: T2, marginTop: 6 }}>Check your messages — code expires in 10 minutes</div>
            </div>
            {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? "Verifying..." : "Verify & Enter →"}
            </button>
            <button type="button" onClick={() => { setStep("phone"); setOtp(""); setError(""); }}
              style={{ width: "100%", marginTop: 10, padding: 10, background: "none", border: `1px solid ${BD}`, borderRadius: 6, color: T2, fontSize: 13, cursor: "pointer" }}>
              ← Use a different number
            </button>
          </form>
        )}

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: T2 }}>
          Don't have an account?{" "}
          <a href="/onboarding" style={{ color: AC, textDecoration: "none" }}>Request access</a>
        </div>
      </div>
    </div>
  );
}
