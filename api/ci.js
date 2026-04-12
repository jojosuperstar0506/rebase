// Unified CI proxy — all /api/ci/* routes handled by this single serverless function
// This keeps us under the Vercel Hobby plan 12-function limit.

export default async function handler(req, res) {
  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) return res.status(500).json({ error: 'ECS_URL not configured' });

  // Extract the sub-path: /api/ci/dashboard → /api/ci/dashboard
  // Vercel rewrites /api/ci/xxx to /api/ci?path=xxx
  // :path* may come as a string or array for nested paths like deep-dive/status
  const rawPath = req.query.path;
  const subPath = Array.isArray(rawPath) ? rawPath.join('/') : (rawPath || '');
  const backendPath = `/api/ci/${subPath}`;

  // Build query string (exclude our routing param)
  const query = { ...req.query };
  delete query.path;
  const qs = new URLSearchParams(query).toString();
  const url = `${ecsUrl}${backendPath}${qs ? '?' + qs : ''}`;

  try {
    const fetchOpts = {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-rebase-secret': process.env.API_SECRET || '',
        'x-user-id': req.headers['x-user-id'] || '',
      },
    };

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      fetchOpts.body = JSON.stringify(req.body);
    }

    const response = await fetch(url, fetchOpts);
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error(`[proxy] ci/${subPath} error:`, err.message);
    res.status(502).json({ error: 'Failed to reach backend' });
  }
}
