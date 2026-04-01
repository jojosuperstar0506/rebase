import { useState, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";

const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || "rebase-admin-2026";

interface Applicant {
  name: string;
  phone: string;
  company?: string;
  industry: string;
  competitors?: string;
  goal?: string;
  email?: string;
  status: "pending" | "approved";
  submittedAt: string;
  approvedAt?: string;
  inviteCode?: string;
}

function Badge({ status, colors }: { status: string; colors: ReturnType<typeof useApp>["colors"] }) {
  const color = status === "approved" ? colors.success : "#f59e0b";
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, background: color + "22", padding: "2px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 1 }}>
      {status}
    </span>
  );
}

function CopyButton({ text, colors }: { text: string; colors: ReturnType<typeof useApp>["colors"] }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy} style={{ marginLeft: 8, fontSize: 12, padding: "3px 10px", background: copied ? colors.success + "22" : colors.bd, border: `1px solid ${copied ? colors.success : colors.bd}`, borderRadius: 4, color: copied ? colors.success : colors.t2, cursor: "pointer" }}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

function ApplicantCard({ applicant, onApprove, colors }: {
  applicant: Applicant;
  onApprove: (name: string, phone: string) => Promise<{ inviteCode: string } | null>;
  colors: ReturnType<typeof useApp>["colors"];
}) {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState(applicant.inviteCode || "");

  async function handleApprove() {
    setLoading(true);
    const result = await onApprove(applicant.name, applicant.phone);
    if (result) setCode(result.inviteCode);
    setLoading(false);
  }

  const isApproved = applicant.status === "approved" || !!code;

  return (
    <div style={{ background: colors.s2, border: `1px solid ${isApproved ? colors.success + "44" : colors.bd}`, borderRadius: 10, padding: 20, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.tx }}>{applicant.name}</div>
          <div style={{ fontSize: 13, color: colors.t2, marginTop: 2 }}>{applicant.company || "No company"} · {applicant.industry}</div>
        </div>
        <Badge status={isApproved ? "approved" : "pending"} colors={colors} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px", fontSize: 13, marginBottom: 14 }}>
        <div><span style={{ color: colors.t2 }}>Phone: </span><span style={{ color: colors.tx }}>{applicant.phone}</span></div>
        {applicant.email && <div><span style={{ color: colors.t2 }}>Email: </span><span style={{ color: colors.tx }}>{applicant.email}</span></div>}
        {applicant.competitors && <div style={{ gridColumn: "1/-1" }}><span style={{ color: colors.t2 }}>Competitors: </span><span style={{ color: colors.tx }}>{applicant.competitors}</span></div>}
        {applicant.goal && <div style={{ gridColumn: "1/-1" }}><span style={{ color: colors.t2 }}>Goal: </span><span style={{ color: colors.tx }}>{applicant.goal}</span></div>}
        <div><span style={{ color: colors.t2 }}>Applied: </span><span style={{ color: colors.tx }}>{new Date(applicant.submittedAt).toLocaleDateString("en-HK", { day: "numeric", month: "short", year: "numeric" })}</span></div>
      </div>

      {isApproved && code ? (
        <div style={{ background: colors.success + "11", border: `1px solid ${colors.success}44`, borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: colors.success, fontWeight: 600, marginBottom: 4 }}>INVITE CODE — share this with {applicant.name}</div>
            <span style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: colors.success, letterSpacing: 3 }}>{code}</span>
          </div>
          <CopyButton text={code} colors={colors} />
        </div>
      ) : (
        <button
          onClick={handleApprove}
          disabled={loading}
          style={{ padding: "8px 20px", background: loading ? colors.bd : colors.ac, border: "none", borderRadius: 6, color: loading ? colors.t2 : "#000", fontWeight: 700, fontSize: 13, cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "Approving..." : "✓ Approve & Generate Code"}
        </button>
      )}
    </div>
  );
}

export default function Admin() {
  const { colors: C } = useApp();
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [pwError, setPwError] = useState("");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("all");

  const fetchApplicants = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/applicants");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setApplicants(data.applicants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load applicants");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) fetchApplicants();
  }, [authed, fetchApplicants]);

  function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      setAuthed(true);
      setPwError("");
      localStorage.setItem("admin_authed", "true");
      window.dispatchEvent(new CustomEvent("rebase_auth_change"));
    } else {
      setPwError("Incorrect password");
    }
  }

  async function handleApprove(name: string, phone: string): Promise<{ inviteCode: string } | null> {
    try {
      const res = await fetch("/api/admin/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Approval failed");
      fetchApplicants();
      return { inviteCode: data.inviteCode };
    } catch (e) {
      alert(e instanceof Error ? e.message : "Approval failed");
      return null;
    }
  }

  const pending = applicants.filter((a) => a.status === "pending");
  const approved = applicants.filter((a) => a.status === "approved");
  const shown = filter === "all" ? applicants : filter === "pending" ? pending : approved;

  // ── Password gate ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "system-ui, sans-serif" }}>
        <div style={{ width: 360, background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 36 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: C.tx, marginBottom: 4 }}>Admin Panel</div>
          <div style={{ fontSize: 13, color: C.t2, marginBottom: 24 }}>Rebase — Applicant Management</div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setPwError(""); }}
              placeholder="Admin password"
              autoFocus
              style={{ width: "100%", padding: "10px 12px", background: C.inputBg, border: `1px solid ${pwError ? C.danger : C.inputBd}`, borderRadius: 6, color: C.tx, fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 8 }}
            />
            {pwError && <div style={{ color: C.danger, fontSize: 13, marginBottom: 8 }}>{pwError}</div>}
            <button type="submit" style={{ width: "100%", padding: "10px", background: C.ac, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main admin panel ───────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, fontFamily: "system-ui, sans-serif", padding: "32px 24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.tx }}>Applicant Management</div>
            <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>
              {pending.length} pending · {approved.length} approved
            </div>
          </div>
          <button onClick={fetchApplicants} style={{ padding: "8px 16px", background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 6, color: C.t2, fontSize: 13, cursor: "pointer" }}>
            ↻ Refresh
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["all", "pending", "approved"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{ padding: "6px 16px", borderRadius: 6, border: `1px solid ${filter === f ? C.ac : C.bd}`, background: filter === f ? C.ac + "22" : "transparent", color: filter === f ? C.ac : C.t2, fontSize: 13, fontWeight: 600, cursor: "pointer", textTransform: "capitalize" }}
            >
              {f === "all" ? `All (${applicants.length})` : f === "pending" ? `Pending (${pending.length})` : `Approved (${approved.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && <div style={{ color: C.t2, textAlign: "center", padding: 40 }}>Loading applicants...</div>}
        {error && <div style={{ color: C.danger, background: C.danger + "11", border: `1px solid ${C.danger}44`, borderRadius: 8, padding: 16, marginBottom: 16 }}>{error}</div>}

        {!loading && !error && shown.length === 0 && (
          <div style={{ color: C.t2, textAlign: "center", padding: 60, background: C.s1, borderRadius: 10, border: `1px solid ${C.bd}` }}>
            {filter === "pending" ? "No pending applicants right now." : filter === "approved" ? "No approved users yet." : "No applicants yet."}
          </div>
        )}

        {shown.map((a, i) => (
          <ApplicantCard key={i} applicant={a} onApprove={handleApprove} colors={C} />
        ))}
      </div>
    </div>
  );
}
