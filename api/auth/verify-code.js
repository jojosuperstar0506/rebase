export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const ecsUrl = process.env.ECS_URL;
  if (!ecsUrl) return res.status(500).json({ error: "Server configuration error: ECS_URL not set" });
  try {
    const response = await fetch(`${ecsUrl}/api/auth/verify-code`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-rebase-secret": process.env.API_SECRET || "",
      },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (e) {
    return res.status(500).json({ error: "Failed to reach server: " + e.message });
  }
}
