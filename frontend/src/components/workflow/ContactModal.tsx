import { useState, useEffect } from "react";
import { useApp } from "../../context/AppContext";

interface ContactModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflowName: string;
}

interface FormState { name: string; contact: string; company: string; notes: string; }
type SubmitStatus = "idle" | "submitting" | "success" | "error";

export default function ContactModal({ isOpen, onClose, workflowName }: ContactModalProps) {
  const { colors: C } = useApp();
  const [form, setForm] = useState<FormState>({ name: "", contact: "", company: "", notes: "" });
  const [errors, setErrors] = useState<Partial<FormState>>({});
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (submitStatus !== "success") return;
    const t = setTimeout(() => {
      onClose();
      setTimeout(() => { setForm({ name: "", contact: "", company: "", notes: "" }); setSubmitStatus("idle"); setSubmitError(null); }, 300);
    }, 3000);
    return () => clearTimeout(t);
  }, [submitStatus, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  function validate(): boolean {
    const errs: Partial<FormState> = {};
    if (!form.name.trim()) errs.name = "请填写姓名";
    if (!form.contact.trim()) errs.contact = "请填写手机号或微信";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitStatus("submitting");
    setSubmitError(null);
    try {
      const res = await fetch("/api/workflow-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), contact: form.contact.trim(), company: form.company.trim() || undefined, notes: form.notes.trim() || undefined, workflowName }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`); }
      setSubmitStatus("success");
    } catch (err: unknown) {
      setSubmitStatus("error");
      setSubmitError(err instanceof Error ? err.message : "提交失败，请稍后重试或直接联系 hello@rebase.ai");
    }
  }

  function update(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((f) => ({ ...f, [field]: e.target.value }));
      if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }));
    };
  }

  const inputStyle = (hasError: boolean): React.CSSProperties => ({
    width: "100%", background: C.inputBg, border: `1px solid ${hasError ? C.danger : C.inputBd}`,
    borderRadius: 8, padding: "10px 12px", color: C.tx, fontSize: 14,
    fontFamily: "system-ui, sans-serif", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s",
  });

  const labelStyle: React.CSSProperties = { display: "block", fontSize: 12, color: C.t2, fontWeight: 600, marginBottom: 6 };
  const fieldStyle: React.CSSProperties = { marginBottom: 16 };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "16px" }}
    >
      <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 36, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
        <button onClick={onClose} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", color: C.t2, fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "4px 8px" }} aria-label="Close">×</button>

        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.tx, margin: "0 0 4px" }}>获取实施方案</h2>
          <div style={{ fontSize: 14, color: C.t2, marginBottom: 12 }}>Get Implementation Plan</div>
          <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.6, margin: 0 }}>基于您的「{workflowName}」分析结果，我们的顾问团队将为您定制自动化实施方案。</p>
        </div>

        {submitStatus === "success" ? (
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.tx, marginBottom: 8 }}>提交成功！</div>
            <div style={{ fontSize: 14, color: C.t2, lineHeight: 1.6 }}>我们的顾问将在24小时内联系您。<br />Our consultant will contact you within 24 hours.</div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div style={fieldStyle}>
              <label style={labelStyle}>姓名 <span style={{ color: C.danger }}>*</span><span style={{ fontWeight: 400, marginLeft: 8 }}>Name</span></label>
              <input type="text" value={form.name} onChange={update("name")} placeholder="您的姓名" style={inputStyle(!!errors.name)} onFocus={(e) => { e.currentTarget.style.borderColor = C.ac; }} onBlur={(e) => { e.currentTarget.style.borderColor = errors.name ? C.danger : C.inputBd; }} />
              {errors.name && <div style={{ color: C.danger, fontSize: 12, marginTop: 4 }}>{errors.name}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>手机号或微信 <span style={{ color: C.danger }}>*</span><span style={{ fontWeight: 400, marginLeft: 8 }}>Phone or WeChat</span></label>
              <input type="text" value={form.contact} onChange={update("contact")} placeholder="138xxxx xxxx 或微信号" style={inputStyle(!!errors.contact)} onFocus={(e) => { e.currentTarget.style.borderColor = C.ac; }} onBlur={(e) => { e.currentTarget.style.borderColor = errors.contact ? C.danger : C.inputBd; }} />
              {errors.contact && <div style={{ color: C.danger, fontSize: 12, marginTop: 4 }}>{errors.contact}</div>}
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>公司名称<span style={{ fontWeight: 400, marginLeft: 8 }}>Company (optional)</span></label>
              <input type="text" value={form.company} onChange={update("company")} placeholder="您的公司名称" style={inputStyle(false)} onFocus={(e) => { e.currentTarget.style.borderColor = C.ac; }} onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBd; }} />
            </div>

            <div style={fieldStyle}>
              <label style={labelStyle}>补充说明<span style={{ fontWeight: 400, marginLeft: 8 }}>Additional notes (optional)</span></label>
              <textarea rows={3} value={form.notes} onChange={update("notes")} placeholder="如：主要痛点、团队规模、期望时间..." style={{ ...inputStyle(false), resize: "vertical", lineHeight: 1.6 }} onFocus={(e) => { e.currentTarget.style.borderColor = C.ac; }} onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBd; }} />
            </div>

            {submitStatus === "error" && submitError && (
              <div style={{ color: C.danger, fontSize: 13, marginBottom: 12, lineHeight: 1.5 }}>⚠ {submitError}</div>
            )}

            <button type="submit" disabled={submitStatus === "submitting"} style={{ width: "100%", minHeight: 44, padding: "12px 24px", background: submitStatus === "submitting" ? `${C.ac}80` : C.ac, border: "none", borderRadius: 8, color: "#000", fontSize: 15, fontWeight: 700, cursor: submitStatus === "submitting" ? "not-allowed" : "pointer", fontFamily: "system-ui, sans-serif", transition: "background 0.2s" }}>
              {submitStatus === "submitting" ? "提交中..." : "提交咨询请求 →"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
