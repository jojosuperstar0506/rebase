import { useState } from "react";
import { useNavigate } from "react-router-dom";

const BG = "#0c0c14";
const S1 = "#14141e";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

export default function Login() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validCode = import.meta.env.VITE_ACCESS_CODE;
    if (!validCode || code.trim() === validCode) {
      localStorage.setItem("rebase_access", "true");
      navigate("/agents");
    } else {
      setError("Invalid access code. Please contact the Rebase team.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: BG, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ width: 420, background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 40 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: AC, marginBottom: 8 }}>Rebase</div>
          <div style={{ fontSize: 14, color: T2 }}>Enter your access code to continue</div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: T2, fontWeight: 600, marginBottom: 6 }}>ACCESS CODE</div>
            <input
              type="password"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(""); }}
              placeholder="Enter your access code"
              style={{ width: "100%", padding: "10px 12px", background: BG, border: `1px solid ${BD}`, borderRadius: 6, color: TX, fontSize: 14, outline: "none", boxSizing: "border-box" }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 13, color: "#f87171", marginBottom: 16 }}>{error}</div>
          )}

          <button
            type="submit"
            style={{ width: "100%", padding: "12px", background: AC, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
          >
            Enter Platform
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 24, fontSize: 13, color: T2 }}>
          Don't have an access code?{" "}
          <a href="/onboarding" style={{ color: AC, textDecoration: "none" }}>Request access</a>
        </div>
      </div>
    </div>
  );
}
