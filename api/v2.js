// Unified v2 proxy — all /api/v2/* routes handled by one serverless function.
// Mirrors api/ci.js; keeps us under the Vercel Hobby plan's 12-function limit.
//
// The onboarding wizard (signup, login, brand/competitors/goals steps) calls
// /api/v2/* endpoints that live in the Express backend on ECS. This proxy
// forwards them. Vercel rewrites /api/v2/xxx -> /api/v2?path=xxx (vercel.json).
//
// Hardened like api/auth/verify-code.js: an empty or non-JSON upstream body
// must never throw "Unexpected end of JSON input" in the browser — every
// path below returns valid JSON within the function's time budget.

export const config = { maxDuration: 10 };

// Cap the upstream call below maxDuration so we always have time to return
// a JSON error inside the budget.
const UPSTREAM_TIMEOUT_MS = Number(process.env.PROXY_TIMEOUT_MS) || 8000;

export default async function handler(req, res) {
  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) {
    return res.status(500).json({ error: 'Server configuration error: ECS_URL not set' });
  }

  // Vercel rewrites /api/v2/auth/signup -> /api/v2?path=auth/signup.
  // :path* may arrive as a string or an array for nested paths.
  const rawPath = req.query.path;
  const subPath = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath || '');
  if (!subPath) {
    return res.status(400).json({ error: 'Missing v2 route path' });
  }

  // Forward any remaining query params (e.g. ?category=) — minus our router key.
  const query = { ...req.query };
  delete query.path;
  const qs = new URLSearchParams(query).toString();
  const url = `${ecsUrl}/api/v2/${subPath}${qs ? '?' + qs : ''}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const fetchOpts = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-rebase-secret': process.env.API_SECRET || '',
        'x-user-id': req.headers['x-user-id'] || '',
      },
      signal: controller.signal,
    };
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      fetchOpts.body = JSON.stringify(req.body || {});
    }

    const response = await fetch(url, fetchOpts);

    // Read as text first — an empty/non-JSON upstream body must not throw.
    const raw = await response.text();
    let data;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(502).json({
        error: 'The onboarding service returned an invalid response. Please try again.',
      });
    }
    return res.status(response.status).json(data);
  } catch (err) {
    const aborted = err && err.name === 'AbortError';
    console.error(`[proxy] v2/${subPath} error:`, err && err.message);
    return res.status(aborted ? 504 : 502).json({
      error: aborted
        ? 'The onboarding service timed out. Please try again.'
        : 'Failed to reach the onboarding service.',
    });
  } finally {
    clearTimeout(timer);
  }
}
