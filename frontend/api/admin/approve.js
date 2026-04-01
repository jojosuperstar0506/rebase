// POST /api/admin/approve
// Approves an applicant and returns/emails their invite code.
// The invite code = ACCESS_CODE env var (shared master code for all approved users).
// Optionally sends code via Resend email to applicant if their email is known.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { name, phone } = req.body || {};
    if (!name || !phone) return res.status(400).json({ error: "name and phone are required" });

    const ACCESS_CODE = process.env.ACCESS_CODE || process.env.VITE_ACCESS_CODE;
    if (!ACCESS_CODE) {
      return res.status(500).json({ error: "ACCESS_CODE env var not configured" });
    }

    const ECS_URL = process.env.ECS_BACKEND_URL;
    const ECS_SECRET = process.env.ECS_API_SECRET;

    // ── 1. Forward to ECS backend to mark as approved & get code ──
    if (ECS_URL && ECS_SECRET) {
      try {
        const ecsRes = await fetch(`${ECS_URL}/api/admin/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-rebase-secret": ECS_SECRET },
          body: JSON.stringify({ name, phone, inviteCode: ACCESS_CODE }),
        });
        if (ecsRes.ok) {
          const data = await ecsRes.json();
          return res.status(200).json({ inviteCode: data.inviteCode || ACCESS_CODE });
        }
      } catch (e) {
        console.warn("ECS approve failed:", e.message);
      }
    }

    // ── 2. Fallback: just return the master code ──
    // Will / Joanna copy this code and send it to the applicant manually.
    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

    // Notify via Resend that an approval was made
    const RESEND_KEY = process.env.RESEND_API_KEY;
    const NOTIFY_EMAIL = process.env.NOTIFICATION_EMAIL;
    if (RESEND_KEY && NOTIFY_EMAIL) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
          body: JSON.stringify({
            from: "Rebase Admin <onboarding@resend.dev>",
            to: NOTIFY_EMAIL.split(",").map((e) => e.trim()),
            subject: `✅ 已批准: ${name} — 邀请码已生成`,
            html: `<p>已批准 <strong>${name}</strong> (${phone})</p>
                   <p>邀请码：<strong style="font-size:20px;letter-spacing:3px">${ACCESS_CODE}</strong></p>
                   <p>请通过微信或短信将邀请码发送给该用户。</p>
                   <p style="color:#6B7280;font-size:12px;">${now}</p>`,
          }),
        });
      } catch (e) {
        console.warn("Resend notify failed:", e.message);
      }
    }

    return res.status(200).json({ inviteCode: ACCESS_CODE });
  } catch (err) {
    console.error("Approve handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
