import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";

const BG = "#0c0c14";
const S1 = "#14141e";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

export default function Login() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

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
      navigate("/agents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: 420, background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 40 }}>

        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: AC, marginBottom: 8 }}>Rebase</div>
          <div style={{ fontSize: 14, color: T2 }}>Enter your invite code to access your workspace</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>INVITE CODE</div>
            <input
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
              placeholder="RB-YOURCO-XXXX"
              required
              autoFocus
              autoComplete="off"
              style={{
                width: "100%", padding: "10px 12px", background: BG,
                border: `1px solid ${error ? "#f87171" : BD}`, borderRadius: 6,
                color: TX, fontSize: 18, letterSpacing: 4, textAlign: "center",
                outline: "none", boxSizing: "border-box",
                fontFamily: "monospace",
              }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16, textAlign: "center" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !code.trim()}
            style={{
              width: "100%", padding: "12px",
              background: loading || !code.trim() ? BD : AC,
              border: "none", borderRadius: 6,
              color: loading || !code.trim() ? T2 : "#000",
              fontWeight: 700, fontSize: 14,
              cursor: loading || !code.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Checking..." : "Enter Rebase →"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: T2 }}>
          Don't have a code?{" "}
          <a href="/onboarding" style={{ color: AC, textDecoration: "none" }}>Request access</a>
        </div>
      </div>
    </div>
  );
}
