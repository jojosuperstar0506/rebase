// Shared JWT decode utility
// JWT uses base64url encoding (- and _ instead of + and /)
// atob() requires standard base64 — must convert first

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const base64url = token.split(".")[1];
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "==".slice(0, (4 - (base64.length % 4)) % 4);
  return JSON.parse(atob(padded));
}

export function isTokenValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = decodeJwtPayload(token);
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}
