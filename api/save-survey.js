// POST /api/save-survey
// Called automatically when a user completes the AI Diagnostics Calculator.
// Saves the full diagnosis result to ECS so Will/Joanna can review all leads.
// Fires silently — user never sees success/failure. No email sent here.

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const {
      sessionId, company, industry, employees, revenue, cityTier, cityTierRaw,
      tier, tierLevel, score, savings, departments,
      selectedDepts, deptHeadcounts, capAnswers, roleHeadcounts, deptResults,
    } = req.body || {};

    // ── Forward to ECS for persistent storage ──
    const ecsUrl = process.env.ECS_URL;
    if (ecsUrl) {
      try {
        await fetch(`${ecsUrl}/api/save-survey`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rebase-secret": process.env.API_SECRET || "",
          },
          body: JSON.stringify(req.body),
        });
      } catch (e) {
        console.warn("[save-survey] ECS forward failed:", e.message);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[save-survey] Handler error:", err);
    return res.status(200).json({ ok: true }); // always return 200 — silent background call
  }
}
