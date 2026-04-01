// POST /api/auth/verify-code
// Validates an invite code against ACCESS_CODE env var.
// Returns a signed JWT (HS256) valid for 30 days.

import crypto from "crypto";

function base64url(str) {
  return Buffer.from(str)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function createJWT(payload, secret) {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(JSON.stringify(payload));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
  return `${header}.${body}.${sig}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Code is required" });

  const ACCESS_CODE = process.env.ACCESS_CODE || process.env.VITE_ACCESS_CODE;
  if (!ACCESS_CODE) {
    console.error("ACCESS_CODE env var not set");
    return res.status(500).json({ error: "Server configuration error" });
  }

  // Case-insensitive comparison
  if (code.trim().toUpperCase() !== ACCESS_CODE.trim().toUpperCase()) {
    return res.status(401).json({ error: "Invalid invite code. Please check and try again." });
  }

  const JWT_SECRET = process.env.JWT_SECRET || process.env.ACCESS_CODE || "rebase-jwt-secret-2026";
  const now = Math.floor(Date.now() / 1000);
  const token = createJWT(
    { sub: "user", iat: now, exp: now + 30 * 24 * 60 * 60 }, // 30-day expiry
    JWT_SECRET
  );

  return res.status(200).json({ token });
}
