export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const {
      sessionId, company, industry, employees, revenue, cityTier, cityTierRaw,
      tier, tierLevel, score, savings, departments,
      selectedDepts, deptHeadcounts, capAnswers, roleHeadcounts, deptResults,
    } = req.body;

    const now = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
    const results = [];

    // ── Google Sheets storage (via Apps Script web app) ──
    const SHEETS_WEBHOOK_URL = process.env.GOOGLE_SHEETS_WEBHOOK_URL;

    if (SHEETS_WEBHOOK_URL) {
      try {
        const sheetRow = {
          sessionId: sessionId || "",
          timestamp: now,
          name: "",           // filled later if they contact us
          contact: "",        // filled later if they contact us
          contacted: "否",    // updated to 是 if they submit the lead form
          company: company || "",
          industry: industry || "",
          employees: employees || "",
          revenue: revenue || "",
          cityTier: cityTier || "",
          cityTierRaw: cityTierRaw || "",
          overallTier: `L${tierLevel || "?"} ${tier || "未知"} (${score || "?"}分)`,
          tierLevel: tierLevel || "",
          maturityScore: score || "",
          departments: departments || "",
          savingsFullAI: savings || "",
          deptResults: JSON.stringify(deptResults || []),
          capAnswers: JSON.stringify(capAnswers || {}),
          deptHeadcounts: JSON.stringify(deptHeadcounts || {}),
          roleHeadcounts: JSON.stringify(roleHeadcounts || {}),
        };

        const sheetsRes = await fetch(SHEETS_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save_survey", ...sheetRow }),
        });
        results.push({ channel: "sheets", ok: sheetsRes.ok });
      } catch (sheetsErr) {
        console.error("Google Sheets auto-save failed:", sheetsErr);
        results.push({ channel: "sheets", ok: false });
      }
    }

    console.log("Survey auto-save results:", JSON.stringify(results));
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Survey auto-save failed:", err);
    return res.status(200).json({ ok: true });
  }
}
