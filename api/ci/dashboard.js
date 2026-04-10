export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) return res.status(500).json({ error: 'ECS_URL not configured' });

  try {
    const url = new URL(`${ecsUrl}/api/ci/dashboard`);
    if (req.query) {
      for (const [key, value] of Object.entries(req.query)) {
        url.searchParams.set(key, value);
      }
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-rebase-secret': process.env.API_SECRET || '',
        'x-user-id': req.headers['x-user-id'] || '',
      },
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    console.error('[proxy] ci/dashboard error:', err.message);
    res.status(502).json({ error: 'Failed to reach backend' });
  }
}
