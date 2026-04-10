// GET /api/ci/workspace-me
// Proxies to ECS backend: GET /api/ci/workspace/me
// Returns the workspace for the authenticated user (identified by x-user-id header)
export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) {
    // Backend not configured — return 404 so frontend falls back to localStorage
    return res.status(404).json({ error: 'Backend not configured' });
  }

  try {
    const userId = req.headers['x-user-id'] || '';
    const response = await fetch(`${ecsUrl}/api/ci/workspace/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-rebase-secret': process.env.API_SECRET || '',
        'x-user-id': userId,
      },
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    console.error('[proxy] ci/workspace-me error:', err.message);
    return res.status(503).json({ error: 'Backend unavailable: ' + err.message });
  }
}
