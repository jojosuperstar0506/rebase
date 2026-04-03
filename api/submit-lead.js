// POST /api/submit-lead
// Called when a user enters their name + contact on the calculator results page.
// 1. Saves lead to ECS (linked to their diagnosis session)
// 2. Emails Will + Joanna via Resend so they can follow up

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { sessionId, name, contact, company, employees, tier, tierLevel, score, savings, departments, cityTier } = req.body || {};
    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const results = [];

    // ── 1. Save lead to ECS ──
    const ecsUrl = process.env.ECS_URL;
    if (ecsUrl) {
      try {
        const ecsRes = await fetch(`${ecsUrl}/api/submit-lead`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rebase-secret": process.env.API_SECRET || "",
          },
          body: JSON.stringify(req.body),
        });
        results.push({ channel: "ecs", ok: ecsRes.ok, status: ecsRes.status });
      } catch (e) {
        console.warn("[submit-lead] ECS forward failed:", e.message);
        results.push({ channel: "ecs", ok: false });
      }
    }

    // ── 2. Email Will + Joanna via Resend ──
    const RESEND_KEY = process.env.RESEND_API_KEY;
    const NOTIFY_EMAIL = process.env.NOTIFICATION_EMAIL;
    if (RESEND_KEY && NOTIFY_EMAIL) {
      try {
        const html = `
          <h2>🔥 新联系请求 — AI诊断线索</h2>
          <p style="font-size:14px;color:#059669;font-weight:bold;">用户主动提交了联系方式，请尽快跟进！</p>
          <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px;width:100%;max-width:520px;">
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;width:120px;">称呼</td><td style="padding:8px 14px;">${name || "未填写"}</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">联系方式</td><td style="padding:8px 14px;">${contact || "未填写"}</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">公司</td><td style="padding:8px 14px;">${company || "未填写"}</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">规模</td><td style="padding:8px 14px;">${employees || "?"}人</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">城市级别</td><td style="padding:8px 14px;">${cityTier || "未知"}</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">AI成熟度</td><td style="padding:8px 14px;">L${tierLevel || "?"} ${tier || "未知"} (${score || "?"}分)</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">涉及部门</td><td style="padding:8px 14px;">${departments || "未知"}</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;color:#059669;">预计年度可释放</td><td style="padding:8px 14px;color:#059669;font-weight:bold;">¥${savings || "?"}万</td></tr>
            <tr><td style="padding:8px 14px;font-weight:bold;background:#f5f5f5;">提交时间</td><td style="padding:8px 14px;">${now}</td></tr>
          </table>
          <p style="margin-top:20px;font-size:13px;color:#6B7280;">跟进后，引导用户填写早期使用申请表：<a href="https://rebase-lac.vercel.app/onboarding">rebase-lac.vercel.app/onboarding</a></p>
        `;
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
          body: JSON.stringify({
            from: "Rebase AI诊断 <onboarding@resend.dev>",
            to: NOTIFY_EMAIL.split(",").map((e) => e.trim()),
            subject: `🔥 新线索: ${name || "匿名"} / ${company || "未知公司"} / ¥${savings || "?"}万可释放`,
            html,
          }),
        });
        const resendBody = await emailRes.text();
        if (emailRes.ok) {
          results.push({ channel: "email", ok: true });
        } else {
          console.error("[submit-lead] Resend error:", emailRes.status, resendBody);
          results.push({ channel: "email", ok: false, status: emailRes.status, error: resendBody });
        }
      } catch (e) {
        console.warn("[submit-lead] Resend failed:", e.message);
        results.push({ channel: "email", ok: false });
      }
    }

    console.log("[submit-lead] results:", JSON.stringify(results));
    return res.status(200).json({ ok: true, results });
  } catch (err) {
    console.error("[submit-lead] Handler error:", err);
    return res.status(200).json({ ok: true }); // always return 200 — user sees success regardless
  }
}
