export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { name, phone, email, company, industry, competitors, goal } = req.body || {};
  if (!name || !phone || !industry) {
    return res.status(400).json({ error: "Name, phone, and industry are required." });
  }

  const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const results = [];

  // ── 1. Forward to ECS backend for persistent storage ──
  const ecsUrl = process.env.ECS_URL;
  if (ecsUrl) {
    try {
      const ecsRes = await fetch(`${ecsUrl}/api/onboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rebase-secret": process.env.API_SECRET || "",
        },
        body: JSON.stringify(req.body),
      });
      results.push({ channel: "ecs", ok: ecsRes.ok, status: ecsRes.status });
    } catch (e) {
      results.push({ channel: "ecs", ok: false, error: e.message });
    }
  }

  // ── 2. Email notification via Resend ──
  const RESEND_KEY = process.env.RESEND_API_KEY;
  const NOTIFY_EMAIL = process.env.NOTIFICATION_EMAIL;
  if (RESEND_KEY && NOTIFY_EMAIL) {
    try {
      const html = `
        <h2>🎉 新申请 — Rebase 早期使用</h2>
        <p style="color:#2563EB;font-weight:bold;font-size:15px;">有新用户申请早期使用，请及时审核！</p>
        <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%;max-width:520px;">
          <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;width:110px;">姓名</td><td style="padding:8px 14px;">${name}</td></tr>
          <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">手机号</td><td style="padding:8px 14px;">${phone}</td></tr>
          ${email ? `<tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">邮箱</td><td style="padding:8px 14px;">${email}</td></tr>` : ""}
          ${company ? `<tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">公司</td><td style="padding:8px 14px;">${company}</td></tr>` : ""}
          <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">行业</td><td style="padding:8px 14px;">${industry}</td></tr>
          ${competitors ? `<tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">竞品</td><td style="padding:8px 14px;">${competitors}</td></tr>` : ""}
          ${goal ? `<tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">目标</td><td style="padding:8px 14px;">${goal}</td></tr>` : ""}
          <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">申请时间</td><td style="padding:8px 14px;">${now}</td></tr>
        </table>
        <p style="margin-top:20px;font-size:13px;color:#6B7280;">审核后，前往 <a href="https://rebase-lac.vercel.app/admin">Admin Panel</a> 生成邀请码发给该用户。</p>
      `;
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
        body: JSON.stringify({
          from: "Rebase Early Access <onboarding@resend.dev>",
          to: NOTIFY_EMAIL.split(",").map((e) => e.trim()),
          subject: `🎉 新申请: ${name} / ${company || "未填写"} / ${industry}`,
          html,
        }),
      });
      const resendBody = await emailRes.text();
      if (emailRes.ok) {
        results.push({ channel: "email", ok: true });
      } else {
        results.push({ channel: "email", ok: false, status: emailRes.status, error: resendBody });
      }
    } catch (e) {
      results.push({ channel: "email", ok: false, error: e.message });
    }
  }

  return res.status(200).json({
    success: true,
    message: "Application received",
    results,
    _debug: {
      resendKeyPresent: !!process.env.RESEND_API_KEY,
      notifyEmailPresent: !!process.env.NOTIFICATION_EMAIL,
    },
  });
}
