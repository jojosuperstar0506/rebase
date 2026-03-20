export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { name, contact, company, employees, tier, tierLevel, score, savings, departments, cityTier } = req.body;
    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

    // Shared formatted content
    const summary = {
      name: name || "未填写",
      contact: contact || "未填写",
      company: company || "未填写",
      employees: employees || "?",
      cityTier: cityTier || "未知",
      tier: `L${tierLevel || "?"} ${tier || "未知"} (${score || "?"}分)`,
      departments: departments || "未知",
      savings: savings || "?",
      time: now,
    };

    const results = [];

    // ── Email notification (via Resend) ──
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL;

    if (RESEND_API_KEY && NOTIFICATION_EMAIL) {
      try {
        const emailHtml = `
          <h2>新AI诊断线索</h2>
          <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;">
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">称呼</td><td style="padding:6px 12px;">${summary.name}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">联系方式</td><td style="padding:6px 12px;">${summary.contact}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">公司</td><td style="padding:6px 12px;">${summary.company}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">规模</td><td style="padding:6px 12px;">${summary.employees}人</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">城市级别</td><td style="padding:6px 12px;">${summary.cityTier}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">AI成熟度</td><td style="padding:6px 12px;">${summary.tier}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">涉及部门</td><td style="padding:6px 12px;">${summary.departments}</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">预计年度可释放</td><td style="padding:6px 12px;color:#059669;font-weight:bold;">¥${summary.savings}万</td></tr>
            <tr><td style="padding:6px 12px;font-weight:bold;background:#f5f5f5;">诊断时间</td><td style="padding:6px 12px;">${summary.time}</td></tr>
          </table>
        `;

        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Rebase AI诊断 <onboarding@resend.dev>",
            to: NOTIFICATION_EMAIL.split(",").map(e => e.trim()),
            subject: `新线索: ${summary.name} / ${summary.company} / ${summary.tier}`,
            html: emailHtml,
          }),
        });
        results.push({ channel: "email", ok: emailRes.ok });
      } catch (emailErr) {
        console.error("Email send failed:", emailErr);
        results.push({ channel: "email", ok: false });
      }
    }

    // ── WeChat Work webhook ──
    const WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL;

    if (WEBHOOK_URL) {
      try {
        const markdown = [
          `## 新AI诊断线索`,
          `> **称呼**: ${summary.name}`,
          `> **联系方式**: ${summary.contact}`,
          `> **公司**: ${summary.company}`,
          `> **规模**: ${summary.employees}人`,
          `> **城市级别**: ${summary.cityTier}`,
          `> **AI成熟度**: ${summary.tier}`,
          `> **涉及部门**: ${summary.departments}`,
          `> **预计年度可释放**: ¥${summary.savings}万`,
          `> **诊断时间**: ${summary.time}`,
        ].join("\n");

        const wechatRes = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ msgtype: "markdown", markdown: { content: markdown } }),
        });
        results.push({ channel: "wechat", ok: wechatRes.ok });
      } catch (wechatErr) {
        console.error("WeChat webhook failed:", wechatErr);
        results.push({ channel: "wechat", ok: false });
      }
    }

    if (results.length === 0) {
      console.warn("No notification channels configured. Set RESEND_API_KEY + NOTIFICATION_EMAIL and/or WECHAT_WEBHOOK_URL.");
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Lead submission failed:", err);
    return res.status(200).json({ ok: true }); // Still return success to client
  }
}
