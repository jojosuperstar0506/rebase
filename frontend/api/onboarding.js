// POST /api/onboarding
// Receives early-access applications from the Onboarding form.
// Sends email notification via Resend + WeChat webhook if configured.
// Proxies to ECS backend if ECS_BACKEND_URL is set (for persistent storage & admin panel).

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { name, phone, email, company, industry, competitors, goal } = req.body;

    if (!name || !phone || !industry) {
      return res.status(400).json({ error: "Name, phone, and industry are required." });
    }

    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

    // DEBUG: confirm env vars are present at runtime
    console.log("[onboarding] env check — RESEND_KEY:", !!process.env.RESEND_API_KEY, "| NOTIFY_EMAIL:", process.env.NOTIFICATION_EMAIL || "NOT SET");

    const results = [];

    // ── 1. Forward to ECS backend for persistent storage (admin panel reads from there) ──
    const ECS_URL = process.env.ECS_BACKEND_URL;
    const ECS_SECRET = process.env.ECS_API_SECRET;
    if (ECS_URL && ECS_SECRET) {
      try {
        const ecsRes = await fetch(`${ECS_URL}/api/onboarding`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-rebase-secret": ECS_SECRET },
          body: JSON.stringify({ name, phone, email, company, industry, competitors, goal }),
        });
        results.push({ channel: "ecs", ok: ecsRes.ok, status: ecsRes.status });
      } catch (e) {
        console.warn("ECS forward failed:", e.message);
        results.push({ channel: "ecs", ok: false });
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
          console.error("[onboarding] Resend error:", emailRes.status, resendBody);
          results.push({ channel: "email", ok: false, status: emailRes.status, error: resendBody });
        }
      } catch (e) {
        console.warn("Resend failed:", e.message);
        results.push({ channel: "email", ok: false });
      }
    }

    // ── 3. WeChat Work webhook ──
    const WX_HOOK = process.env.WECHAT_WEBHOOK_URL;
    if (WX_HOOK) {
      try {
        const md = [
          `## 🎉 新申请 — Rebase 早期使用`,
          `> **姓名**: ${name}`,
          `> **手机号**: ${phone}`,
          email ? `> **邮箱**: ${email}` : "",
          company ? `> **公司**: ${company}` : "",
          `> **行业**: ${industry}`,
          competitors ? `> **竞品**: ${competitors}` : "",
          goal ? `> **目标**: ${goal}` : "",
          `> **时间**: ${now}`,
        ].filter(Boolean).join("\n");

        await fetch(WX_HOOK, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ msgtype: "markdown", markdown: { content: md } }),
        });
        results.push({ channel: "wechat", ok: true });
      } catch (e) {
        results.push({ channel: "wechat", ok: false });
      }
    }

    console.log("Onboarding submission results:", JSON.stringify(results));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Onboarding handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
