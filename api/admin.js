// GET  /api/admin → list applicants (was /api/admin/applicants)
// POST /api/admin → approve applicant (was /api/admin/approve)
// Consolidated into one function to stay within Vercel Hobby plan's 12-function limit.

export default async function handler(req, res) {
  // ── GET: list applicants ─────────────────────────────────────────
  if (req.method === "GET") {
    const ecsUrl = process.env.ECS_URL;
    if (!ecsUrl) return res.status(500).json({ error: "Server configuration error: ECS_URL not set" });
    try {
      const response = await fetch(`${ecsUrl}/api/admin/applicants`, {
        method: "GET",
        headers: { "x-rebase-secret": process.env.API_SECRET || "" },
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (e) {
      return res.status(500).json({ error: "Failed to reach server: " + e.message });
    }
  }

  // ── POST: approve applicant ──────────────────────────────────────
  if (req.method === "POST") {
    try {
      const ecsUrl = process.env.ECS_URL;
      if (!ecsUrl) return res.status(500).json({ error: "ECS_URL not configured" });

      // Forward to ECS to generate invite code + mark approved
      const ecsRes = await fetch(`${ecsUrl}/api/admin/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rebase-secret": process.env.API_SECRET || "",
        },
        body: JSON.stringify(req.body),
      });

      if (!ecsRes.ok) {
        const err = await ecsRes.text();
        return res.status(ecsRes.status).json({ error: err });
      }

      const data = await ecsRes.json();
      const { inviteCode, user, company } = data;

      const RESEND_KEY = process.env.RESEND_API_KEY;
      const NOTIFY_EMAIL = process.env.NOTIFICATION_EMAIL;
      const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

      // Email Will + Joanna: approval confirmation
      if (RESEND_KEY && NOTIFY_EMAIL) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: "Rebase Admin <onboarding@resend.dev>",
              to: NOTIFY_EMAIL.split(",").map((e) => e.trim()),
              subject: `✅ 已批准: ${user} (${company || "未知公司"})`,
              html: `
                <h2>✅ 用户已批准</h2>
                <p><strong>${user}</strong> (${company || "未知公司"}) 已获批准。</p>
                <p>邀请码：<strong style="font-size:22px;letter-spacing:4px;color:#06b6d4">${inviteCode}</strong></p>
                <p>邀请邮件已自动发送给用户（如其填写了邮箱）。</p>
                <p style="color:#6B7280;font-size:12px;">${now}</p>
              `,
            }),
          });
        } catch (e) {
          console.warn("[admin/approve] Admin notify failed:", e.message);
        }
      }

      // Email the user their invite code
      const userEmail = req.body.email;
      if (RESEND_KEY && userEmail) {
        try {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
            body: JSON.stringify({
              from: "Rebase Team <onboarding@resend.dev>",
              to: [userEmail.trim()],
              subject: `🎉 欢迎加入 Rebase — 你的专属邀请码`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
                  <h2 style="color:#06b6d4;">🎉 恭喜！你已获得 Rebase 早期使用资格</h2>
                  <p>你好 ${user}，</p>
                  <p>感谢你申请 Rebase 早期使用。经过审核，我们很高兴地通知你已获批准！</p>
                  <div style="background:#f0fdfa;border:2px solid #06b6d4;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
                    <div style="font-size:13px;color:#6B7280;margin-bottom:8px;">你的专属邀请码</div>
                    <div style="font-size:28px;font-weight:800;letter-spacing:6px;color:#06b6d4;">${inviteCode}</div>
                  </div>
                  <p><strong>如何登录：</strong></p>
                  <ol style="font-size:14px;line-height:2;">
                    <li>访问 <a href="https://rebase-lac.vercel.app/login">rebase-lac.vercel.app/login</a></li>
                    <li>输入上方邀请码</li>
                    <li>即可进入你的专属 Rebase 工作台</li>
                  </ol>
                  <p style="font-size:13px;color:#6B7280;">如有问题，请直接回复此邮件联系我们。</p>
                  <p>— Rebase 团队</p>
                </div>
              `,
            }),
          });
        } catch (e) {
          console.warn("[admin/approve] User invite email failed:", e.message);
        }
      }

      return res.status(200).json(data);
    } catch (err) {
      console.error("[admin/approve] Handler error:", err);
      return res.status(500).json({ error: "Internal server error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
