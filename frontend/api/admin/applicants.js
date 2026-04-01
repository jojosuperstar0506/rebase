// GET /api/admin/applicants
// Returns submitted onboarding applications.
// Primary: proxies to ECS backend (which has persistent storage).
// Fallback: returns empty list with a note.

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const ECS_URL = process.env.ECS_BACKEND_URL;
  const ECS_SECRET = process.env.ECS_API_SECRET;

  // ── Try ECS backend ──
  if (ECS_URL && ECS_SECRET) {
    try {
      const ecsRes = await fetch(`${ECS_URL}/api/admin/applicants`, {
        headers: { "x-rebase-secret": ECS_SECRET },
      });
      if (ecsRes.ok) {
        const data = await ecsRes.json();
        return res.status(200).json(data);
      }
    } catch (e) {
      console.warn("ECS admin/applicants failed:", e.message);
    }
  }

  // ── Fallback: empty list ──
  // Applications are emailed to NOTIFICATION_EMAIL — check your inbox.
  return res.status(200).json({
    applicants: [],
    _note: "ECS backend not configured. Applications are sent to your notification email. Set ECS_BACKEND_URL and ECS_API_SECRET to enable the admin panel.",
  });
}
