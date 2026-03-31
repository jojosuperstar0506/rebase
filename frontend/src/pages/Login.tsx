import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase";

const BG = "#0c0c14";
const S1 = "#14141e";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

export default function Login() {
  const location = useLocation();
  const prefilled = (location.state as { email?: string } | null)?.email || "";

  const [email, setEmail] = useState(prefilled);
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function handleSendCode(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    // No Supabase configured → open access mode, let everyone in
    if (!supabase) {
      localStorage.setItem("rebase_access", "true");
      navigate("/agents");
      return;
    }

    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (err) {
      setError(err.message);
    } else {
      setStep("otp");
    }
  }

  async function handleVerifyOtp(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: "email",
    });
    setLoading(false);
    if (err) {
      setError("Invalid or expired code. Please try again.");
    } else {
      localStorage.setItem("rebase_access", "true");
      navigate("/agents");
    }
  }

  const inputStyle = {
    width: "100%",
    padding: "10px 12px",
    background: BG,
    border: `1px solid ${BD}`,
    borderRadius: 6,
    color: TX,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box" as const,
  };

  const btnStyle = {
    width: "100%",
    padding: "12px",
    background: loading ? BD : AC,
    border: "none",
    borderRadius: 6,
    color: loading ? T2 : "#000",
    fontWeight: 700,
    fontSize: 14,
    cursor: loading ? "not-allowed" : "pointer",
  };

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: 420, background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 40 }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: AC, marginBottom: 8 }}>Rebase</div>
          {step === "email" ? (
            <div style={{ fontSize: 14, color: T2 }}>Enter your email to receive a login code</div>
          ) : (
            <div style={{ fontSize: 14, color: T2 }}>
              Code sent to <span style={{ color: TX }}>{email}</span>
            </div>
          )}
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 8, marginBottom: 28 }}>
          {["Email", "Verify"].map((label, i) => (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                height: 3,
                borderRadius: 2,
                background: (step === "email" && i === 0) || (step === "otp" && i <= 1) ? AC : BD,
                marginBottom: 4,
                transition: "background 0.3s",
              }} />
              <div style={{ fontSize: 11, color: step === "email" && i === 0 ? AC : step === "otp" && i === 1 ? AC : T2 }}>
                {label}
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Email */}
        {step === "email" && (
          <form onSubmit={handleSendCode}>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>EMAIL ADDRESS</div>
              <input
                type="email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(""); }}
                placeholder="you@company.com"
                required
                style={inputStyle}
              />
            </div>
            {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? "Sending..." : "Send Login Code →"}
            </button>
          </form>
        )}

        {/* Step 2: OTP */}
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
                style={{ ...inputStyle, fontSize: 22, letterSpacing: 8, textAlign: "center" }}
              />
              <div style={{ fontSize: 12, color: T2, marginTop: 8 }}>Check your inbox — code expires in 10 minutes</div>
            </div>
            {error && <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>{error}</div>}
            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? "Verifying..." : "Verify & Enter →"}
            </button>
            <button
              type="button"
              onClick={() => { setStep("email"); setOtp(""); setError(""); }}
              style={{ width: "100%", marginTop: 10, padding: "10px", background: "none", border: `1px solid ${BD}`, borderRadius: 6, color: T2, fontSize: 13, cursor: "pointer" }}
            >
              ← Use a different email
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
