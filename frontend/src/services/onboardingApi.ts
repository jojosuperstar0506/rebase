/**
 * Onboarding API client — talks to the v2 wizard endpoints in backend/server.js.
 *
 * Auth flow:
 *   1. /signup wizard step 1 calls signup() with email + password + brand_name.
 *   2. signup() stores the JWT in localStorage['rebase_token'] and returns it.
 *   3. All subsequent calls use authHeaders() which sends x-user-id (= JWT.sub).
 *
 * This matches the pattern used by src/services/ciApi.ts.
 */

const TOKEN_KEY = "rebase_token";

export interface Workspace {
  id: string;
  brand_name: string;
  brand_category?: string | null;
  is_onboarded: boolean;
  onboarding_step: "account" | "brand" | "competitors" | "goals" | "done";
}

export interface OnboardingState {
  workspace_id: string;
  brand_name: string;
  is_onboarded: boolean;
  onboarding_step: Workspace["onboarding_step"];
  filled: { brand: boolean; competitors: boolean; goals: boolean };
}

export interface CompetitorSuggestion {
  brand_name: string;
  reason?: string;
  priority?: "high" | "medium" | "low";
  group?: string;
  badge?: string | null;
  platform_ids?: Record<string, string> | null;
  tier?: string;
}

export interface Goals {
  tracking: string[];
  cadence: "weekly" | "monthly";
  email_notifications: boolean;
  notes?: string;
}

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function authSubject(): string | null {
  const token = getToken();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.sub || null;
  } catch {
    return null;
  }
}

function authHeaders(): HeadersInit {
  const sub = authSubject();
  return {
    "Content-Type": "application/json",
    ...(sub ? { "x-user-id": sub } : {}),
  };
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data && (data.error || data.detail)) || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data as T;
}

// ── Public auth ────────────────────────────────────────────────────────────

export async function signup(input: {
  email: string;
  password: string;
  brand_name: string;
}): Promise<{ token: string; workspace: Workspace }> {
  const res = await fetch("/api/v2/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow<{ token: string; workspace: Workspace }>(res);
  localStorage.setItem(TOKEN_KEY, data.token);
  window.dispatchEvent(new CustomEvent("rebase_auth_change"));
  return data;
}

export async function emailLogin(input: {
  email: string;
  password: string;
}): Promise<{ token: string; workspace: Workspace }> {
  const res = await fetch("/api/v2/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await jsonOrThrow<{ token: string; workspace: Workspace }>(res);
  localStorage.setItem(TOKEN_KEY, data.token);
  window.dispatchEvent(new CustomEvent("rebase_auth_change"));
  return data;
}

// ── Authed wizard endpoints ────────────────────────────────────────────────

export async function getOnboardingState(): Promise<OnboardingState> {
  const res = await fetch("/api/v2/onboarding/state", { headers: authHeaders() });
  return jsonOrThrow<OnboardingState>(res);
}

export async function saveBrandStep(input: {
  brand_name?: string;
  brand_category_l1: string;
  brand_subcategories: string[];
  brand_price_range?: { min?: number; max?: number; tier?: string } | null;
  brand_platforms?: Record<string, string> | null;
}): Promise<{ workspace: Workspace }> {
  const res = await fetch("/api/v2/onboarding/brand", {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  return jsonOrThrow(res);
}

export async function saveCompetitorsStep(
  competitors: Array<{ brand_name: string; tier?: string; platform_ids?: Record<string, string> | null }>
): Promise<{ competitors: Array<{ id: string; brand_name: string; tier: string; platform_ids: unknown }> }> {
  const res = await fetch("/api/v2/onboarding/competitors", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ competitors }),
  });
  return jsonOrThrow(res);
}

export async function saveGoalsStep(goals: Goals): Promise<{ workspace: Workspace }> {
  const res = await fetch("/api/v2/onboarding/goals", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ goals }),
  });
  return jsonOrThrow(res);
}

/**
 * AI-generated competitor suggestions. The backend reads brand name +
 * category + price range from the workspace and asks the LLM — works for
 * any vertical. Returns `source: 'error'` + a `message` if the LLM is down,
 * in which case the caller should fall back to manual entry.
 */
export async function suggestCompetitors(
  lang: "en" | "zh" = "en"
): Promise<{ suggestions: CompetitorSuggestion[]; source?: string; message?: string }> {
  const res = await fetch("/api/v2/onboarding/suggest-competitors", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ lang }),
  });
  return jsonOrThrow(res);
}
