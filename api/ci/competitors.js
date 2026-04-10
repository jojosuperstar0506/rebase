export default async function handler(req, res) {
  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) return res.status(500).json({ error: 'ECS_URL not configured' });

  try {
    const url = new URL(`${ecsUrl}/api/ci/competitors`);

    // Forward query params for GET requests
    if (req.method === 'GET' && req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        url.searchParams.set(key, value);
      }
    }

    // Handle DELETE /api/ci/competitors?id=XXX
    // Vercel doesn't support path params in serverless, so we use query param
    let fetchUrl = url.toString();
    if (req.method === 'DELETE' && req.query.id) {
      fetchUrl = `${ecsUrl}/api/ci/competitors/${req.query.id}`;
    }

    const response = await fetch(fetchUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-rebase-secret': process.env.API_SECRET || '',
        'x-user-id': req.headers['x-user-id'] || '',
      },
      ...(req.method === 'POST' && { body: JSON.stringify(req.body) }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[proxy] ci/competitors error:', err.message);
    res.status(502).json({ error: 'Failed to reach backend' });
  }
}
