export default async function handler(req, res) {
  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) return res.status(500).json({ error: 'ECS_URL not configured' });

  try {
    const url = new URL(`${ecsUrl}/api/ci/workspace`);

    const response = await fetch(url, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'x-rebase-secret': process.env.API_SECRET || '',
        'x-user-id': req.headers['x-user-id'] || '',
      },
      ...(req.method !== 'GET' && { body: JSON.stringify(req.body) }),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[proxy] ci/workspace error:', err.message);
    res.status(502).json({ error: 'Failed to reach backend' });
  }
}
