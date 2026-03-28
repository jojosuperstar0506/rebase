export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const WEBHOOK_URL = process.env.WECHAT_WEBHOOK_URL;
  if (!WEBHOOK_URL) {
    console.error("WECHAT_WEBHOOK_URL environment variable not set");
    return res.status(200).json({ ok: true }); // Don't expose config errors to client
  }

  try {
    const { name, contact, company, employees, tier, tierLevel, score, savings, departments, cityTier } = req.body;

    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

    const content = [
      `## 新AI诊断线索`,
      `> **称呼**: ${name || "未填写"}`,
      `> **联系方式**: ${contact || "未填写"}`,
      `> **公司**: ${company || "未填写"}`,
      `> **规模**: ${employees || "?"}人`,
      `> **城市级别**: ${cityTier || "未知"}`,
      `> **AI成熟度**: L${tierLevel || "?"} ${tier || "未知"} (${score || "?"}分)`,
      `> **涉及部门**: ${departments || "未知"}`,
      `> **预计年度可释放**: ¥${savings || "?"}万`,
      `> **诊断时间**: ${now}`,
    ].join("\n");

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msgtype: "markdown", markdown: { content } }),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook send failed:", err);
    return res.status(200).json({ ok: true }); // Still return success to client
  }
}
