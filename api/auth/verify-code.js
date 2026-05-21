// POST /api/auth/verify-code
// Thin proxy: forwards invite-code verification to the ECS backend.
//
// Hardened against the Vercel Hobby plan's 10s function limit. Without a
// timeout, a slow ECS call (or a slow cold start) lets the whole function
// get killed by the platform, which returns an EMPTY body. The browser then
// throws "Unexpected end of JSON input" on res.json() — an undebuggable
// failure with no error message. Every path below returns valid JSON.

// Make the function's time budget explicit (Hobby plan ceiling is 10s).
export const config = { maxDuration: 10 };

// Cap the upstream call below maxDuration so we ALWAYS have time to return
// a JSON error inside the budget. Overridable via env for tests.
const UPSTREAM_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS) || 8000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) {
    return res.status(500).json({ error: "Server configuration error: ECS_URL not set" });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const response = await fetch(`${ecsUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rebase-secret": process.env.API_SECRET || "",
      },
      body: JSON.stringify(req.body || {}),
      signal: controller.signal,
    });

    // Read as text first: an empty or non-JSON upstream body must not throw.
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(502).json({
        error: "Login service returned an invalid response. Please try again.",
      });
    }
    return res.status(response.status).json(data);
  } catch (e) {
    const timedOut = e && e.name === "AbortError";
    return res.status(timedOut ? 504 : 502).json({
      error: timedOut
        ? "Login service timed out. Please try again in a moment."
        : "Failed to reach login service: " + (e && e.message ? e.message : "unknown error"),
    });
  } finally {
    clearTimeout(timer);
  }
}
