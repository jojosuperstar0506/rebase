export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let body;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { name, contact, company, notes, workflowName } = body ?? {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  if (!contact || typeof contact !== "string" || !contact.trim()) {
    return res.status(400).json({ error: "contact is required" });
  }

  // v1: log to console — email/CRM integration added later
  console.log("[workflow-lead]", {
    timestamp: new Date().toISOString(),
    name: name.trim(),
    contact: contact.trim(),
    company: company?.trim() || null,
    notes: notes?.trim() || null,
    workflowName: workflowName?.trim() || null,
  });

  return res.status(200).json({ success: true });
}
