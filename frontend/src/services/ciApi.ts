import {
  getCIWorkspace, getCICompetitors, getCIConnections, saveCIWorkspace, saveCICompetitors,
  getActiveWorkspaceId, getKnownWorkspaces, addKnownWorkspace,
} from '../utils/ciStorage';

const API_BASE = '/api/ci';

// Demo mode — when VITE_DEMO_MODE=true, tryApi and tryApiVerbose short-circuit
// to null / empty result immediately instead of hitting the backend. This
// avoids 30-second timeout stalls when ECS is intentionally stopped for cost
// saving. Callers already handle null gracefully (they fall through to mocks
// or empty states). See ciMocks.ts USE_MOCKS + Login.tsx auto-bypass.
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

// JWT.sub for invite-code users is the uppercase invite code (e.g. "RB-TORYBU-841E").
// Older tokens minted before the auth refactor had sub = phone or email — those are
// stale: workspaces now key on the invite code, so a phone-keyed sub silently lands
// on an empty workspace. We treat anything that doesn't look like a valid account
// identifier as stale and clear the token, falling back to anon (which is the
// pre-login state). This forces those users to re-login and get a fresh JWT.
function isValidAccountSub(sub: string): boolean {
  if (!sub) return false;
  // Email format → stale
  if (sub.includes('@')) return false;
  // Phone-only digits (with optional + and spaces/dashes) → stale
  if (/^[+\-\s()0-9]+$/.test(sub)) return false;
  // Anon-prefixed IDs from this same client → valid (anon-keyed workspace path)
  if (sub.startsWith('anon-')) return true;
  // Invite-code shape (RB-XXXXX-XXXX) or any uppercase alphanumeric token → valid
  return /^[A-Z0-9_-]{3,}$/.test(sub);
}

// Helper: get auth headers.
//
// PHASE 4 (Epic #85 / #142 final): Bearer-only. We no longer send the
// legacy x-user-id header — the backend ignores it. If there's no valid
// JWT in localStorage, calls go out without an Authorization header and
// the server returns 401 (which tryApi handles by returning null, leaving
// the UI in its empty state).
//
// EXCEPTION: POST /api/ci/workspace stays unauthenticated by design (it
// creates the workspace BEFORE the user has a JWT — anonymous onboarding).
// That call site reads the anon id from localStorage directly via
// getAnonId() below and sends it in the request body, NOT a header.
function getAnonId(): string {
  let anonId = localStorage.getItem('rebase_anon_id');
  if (!anonId) {
    anonId = 'anon-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem('rebase_anon_id', anonId);
  }
  return anonId;
}

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('rebase_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!token) return headers;

  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const candidate = (payload.sub || payload.id || payload.email || '').toString();
    if (isValidAccountSub(candidate)) {
      headers['Authorization'] = `Bearer ${token}`;
    } else if (candidate) {
      // Stale token from before the auth refactor — clear it so next login
      // mints a fresh JWT with sub = invite code.
      console.warn('[CI API] Stale JWT detected (sub format invalid). Clearing token; please log in again.');
      localStorage.removeItem('rebase_token');
    }
  } catch {
    console.warn('[CI API] Malformed JWT in localStorage; clearing it.');
    localStorage.removeItem('rebase_token');
  }
  return headers;
}

// Helper: try API call, return null on failure (don't throw)
async function tryApi<T>(path: string, options?: RequestInit): Promise<T | null> {
  // Demo mode: skip network entirely (backend is intentionally off).
  if (DEMO_MODE) return null;
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...getHeaders(), ...(options?.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      console.warn(`[CI API] ${options?.method || 'GET'} ${path} → ${res.status}`, errorText.slice(0, 200));
      return null;
    }
    return await res.json() as T;
  } catch (err) {
    console.warn(`[CI API] ${options?.method || 'GET'} ${path} → network error`, (err as Error).message);
    return null; // Network error, API not available
  }
}

// ─── Request dedupe + min-interval cache (Fixes #132) ─────────────
// Several read endpoints (/dashboard, /connections, /alerts) are called
// by multiple components on the same page AND re-fire on every parent
// re-render because consumers pass array props in useEffect deps. The
// result is dozens of parallel hits → backend 429s → "Could not start
// analysis" errors in the UI.
//
// `cachedGet` solves this at the API layer:
//   1. **Dedupe** — concurrent calls for the same path share one promise.
//   2. **Cache** — within `minIntervalMs` of the last successful fetch,
//      return the cached value instead of hitting the server.
//   3. **429 backoff** — on rate-limit, return cached and apply a quiet
//      window before re-fetching (no retry storm).
//
// Mutations call `invalidateCiCache(prefix)` to drop stale entries.

type CacheEntry<T> = {
  data: T | null;
  fetchedAt: number;
  inFlight: Promise<T | null> | null;
};

const responseCache = new Map<string, CacheEntry<unknown>>();

async function cachedGet<T>(path: string, minIntervalMs: number): Promise<T | null> {
  // Demo mode: skip the network. This path is separate from tryApi and feeds
  // /dashboard, /alerts and /connections — without the guard those three
  // still hit the (intentionally stopped) backend and log proxy errors.
  if (DEMO_MODE) return null;
  const now = Date.now();
  const entry = responseCache.get(path) as CacheEntry<T> | undefined;

  // 1. Dedupe: a fetch is already in flight for this path
  if (entry?.inFlight) return entry.inFlight;

  // 2. Cache hit: recent successful response, return it
  if (entry && entry.data !== null && now - entry.fetchedAt < minIntervalMs) {
    return entry.data;
  }

  // 3. Fire a fresh request
  const promise: Promise<T | null> = (async () => {
    try {
      const res = await fetch(`${API_BASE}${path}`, { headers: getHeaders() });

      // 429: don't retry, hold the cache, log loudly
      if (res.status === 429) {
        console.warn(`[CI API] GET ${path} → 429 (rate limited; using cached for ${minIntervalMs}ms)`);
        responseCache.set(path, {
          data: entry?.data ?? null,
          fetchedAt: now,            // bumps the cache window forward → no immediate retry
          inFlight: null,
        });
        return entry?.data ?? null;
      }

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[CI API] GET ${path} → ${res.status}`, errorText.slice(0, 200));
        // Don't cache failures; just clear in-flight
        const cur = responseCache.get(path);
        if (cur) cur.inFlight = null;
        return null;
      }

      const data = (await res.json()) as T;
      responseCache.set(path, { data, fetchedAt: now, inFlight: null });
      return data;
    } catch (err) {
      console.warn(`[CI API] GET ${path} → network error`, (err as Error).message);
      const cur = responseCache.get(path);
      if (cur) cur.inFlight = null;
      return entry?.data ?? null;     // degrade to last-known-good, not null
    }
  })();

  responseCache.set(path, {
    data: entry?.data ?? null,
    fetchedAt: entry?.fetchedAt ?? 0,
    inFlight: promise,
  });

  return promise;
}

/**
 * Drop cached entries whose path starts with `prefix` (or all if omitted).
 * Call after mutations that invalidate cached state so the next read goes
 * to the server. Example: `invalidateCiCache('/competitors')` after adding
 * or removing a competitor.
 */
export function invalidateCiCache(prefix?: string): void {
  if (!prefix) {
    responseCache.clear();
    return;
  }
  for (const k of Array.from(responseCache.keys())) {
    if (k.startsWith(prefix)) responseCache.delete(k);
  }
}

// Min-interval windows per endpoint family. Picked to match the issue's
// acceptance criteria: /alerts ≥30s, /connections ≥60s. Dashboard is
// heavier and changes slowly → 30s. These are dedupe windows, not polling
// schedules — actual polling cadence stays whatever each consumer set
// (e.g. useCIAlertCount still polls every 5 min, just gets dedupe for free).
const CACHE_MS = {
  dashboard: 30_000,
  connections: 60_000,
  alerts: 30_000,
} as const;

// Verbose variant — same fetch logic, but returns status + body so the UI
// can distinguish "auth failed" / "backend down" / "valid response, empty
// payload" / "LLM upstream error" instead of conflating them all into
// "feature unavailable." Use this for any UX surface where the user sees
// an explicit error message (loadAiSuggestions, brief refresh failures).
//
// Shape:
//   { ok: true,  status: 2xx, data: T }
//   { ok: false, status: number, message?: string }   // server-shaped error (4xx/5xx with body)
//   { ok: false, status: 0,      message?: string }   // network / abort / no-response
export type ApiResult<T> =
  | { ok: true;  status: number; data: T }
  | { ok: false; status: number; message?: string };

async function tryApiVerbose<T>(path: string, options?: RequestInit): Promise<ApiResult<T>> {
  // Demo mode: skip network. Match the "backend unreachable" branch below so
  // consumers get the same shape they'd see if ECS were down for real.
  if (DEMO_MODE) return { ok: false, status: 0, message: 'demo-mode-bypass' };
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...getHeaders(), ...(options?.headers as Record<string, string> | undefined) },
    });
    // Try JSON first; fall back to text. Backend errors are usually JSON
    // ({"error": "..."}), but a Vercel proxy 502 returns plain text/HTML.
    const ct = res.headers.get('content-type') || '';
    let body: any = null;
    let bodyText: string | null = null;
    if (ct.includes('application/json')) {
      body = await res.json().catch(() => null);
    } else {
      bodyText = await res.text().catch(() => null);
    }
    if (!res.ok) {
      const message = (body && (body.error || body.message))
        || (bodyText && bodyText.slice(0, 200))
        || `HTTP ${res.status}`;
      console.warn(`[CI API] ${options?.method || 'GET'} ${path} → ${res.status}`, message);
      return { ok: false, status: res.status, message };
    }
    return { ok: true, status: res.status, data: body as T };
  } catch (err) {
    const e = err as Error;
    console.warn(`[CI API] ${options?.method || 'GET'} ${path} → network error`, e.message);
    return { ok: false, status: 0, message: e.message || 'Network error' };
  }
}

// ─── Workspace ────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  user_id: string;
  brand_name: string;
  brand_category: string | null;
  brand_price_range: { min: number; max: number } | null;
  brand_platforms: Record<string, string> | null;
  watchlist_count?: number;
  total_competitors?: number;
  /**
   * True for curated demo workspaces populated by demo_seeder.py.
   * Frontend gates Settings interactions (add/remove competitors) on
   * this so screen-recording demos can't be broken by accidental clicks.
   * Default false; backend migration 009 added the column.
   */
  is_demo?: boolean;
}

export async function getWorkspace(): Promise<{ data: Workspace | null; source: 'api' | 'local' }> {
  // Try API first — backend route is /api/ci/workspace/me
  const apiData = await tryApi<Workspace>('/workspace/me');
  if (apiData && apiData.id) {
    // Cache so the workspace switcher can list it later
    addKnownWorkspace({
      id: apiData.id,
      brand_name: apiData.brand_name,
      brand_category: apiData.brand_category,
    });
    // Honor an explicit active-workspace selection that differs from the
    // backend default. The backend has no by-id workspace endpoint today,
    // so we hydrate from the local cache. All downstream calls already
    // accept ?workspace_id= so they pivot correctly.
    const activeId = getActiveWorkspaceId();
    if (activeId && activeId !== apiData.id) {
      const cached = getKnownWorkspaces().find(w => w.id === activeId);
      if (cached) {
        return {
          data: {
            ...apiData,
            id: cached.id,
            brand_name: cached.brand_name,
            brand_category: cached.brand_category,
          },
          source: 'api',
        };
      }
    }
    return { data: apiData, source: 'api' };
  }
  // Fall back to localStorage. In demo mode, mint a synthetic id so the CI
  // pages don't short-circuit on the usual 'local' / 'mock' guards — they'll
  // call getBrief/getAnalytics/etc., ciMocks short-circuits the network call
  // via USE_MOCKS, and mock fixtures render.
  const local = getCIWorkspace();
  if (local) {
    return {
      data: {
        id: DEMO_MODE ? 'demo-mock-workspace' : 'local',
        user_id: 'local',
        brand_name: local.brand_name,
        brand_category: local.brand_category ?? null,
        brand_price_range: local.price_range ?? null,
        brand_platforms: null,
      },
      source: 'local',
    };
  }
  return { data: null, source: 'local' };
}

export async function saveWorkspace(workspace: Partial<Workspace>): Promise<Workspace | null> {
  // W7: backend split POST (insert) and PATCH /:id (update). Pick the right
  // verb based on whether the caller passed an existing workspace.id —
  // PATCH if so, POST otherwise. The previous upsert behavior silently
  // overwrote an existing workspace whenever the caller passed new data,
  // making multi-workspace impossible.
  const hasId = workspace.id && workspace.id !== 'local';

  // PHASE 4: POST /api/ci/workspace is unauthenticated (anonymous onboarding
  // creates the workspace BEFORE the user has a JWT). With x-user-id header
  // gone, we now pass the anon id in the request body so the backend has
  // something to assign workspaces.user_id to. PATCH path uses JWT-derived
  // ownership and doesn't need user_id in body.
  const bodyObj = hasId
    ? workspace
    : { ...workspace, user_id: (workspace as any).user_id || getAnonId() };

  const apiData = await tryApi<Workspace>(
    hasId ? `/workspace/${encodeURIComponent(workspace.id!)}` : '/workspace',
    {
      method: hasId ? 'PATCH' : 'POST',
      body: JSON.stringify(bodyObj),
    }
  );
  if (apiData) return apiData;
  // Fall back: save locally (map Workspace fields to CIWorkspace fields)
  saveCIWorkspace({
    brand_name: workspace.brand_name ?? '',
    brand_category: workspace.brand_category ?? '',
    price_range: workspace.brand_price_range ?? { min: 0, max: 0 },
    platforms: [],
  });
  return { id: 'local', user_id: 'local', ...workspace } as Workspace;
}

/**
 * GET /api/ci/workspaces — list every workspace owned by the current user.
 * Used by the workspace switcher dropdown (PR #29).
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  const data = await tryApi<Workspace[]>('/workspaces');
  return Array.isArray(data) ? data : [];
}

// ─── Competitors ──────────────────────────────────────────────────

export interface Competitor {
  id: string;
  workspace_id?: string;
  brand_name: string;
  tier: 'watchlist' | 'landscape';
  platform_ids: Record<string, string> | null;
  added_via: string;
  created_at: string;
  /**
   * Canonical XHS profile URL for this competitor. Auto-populated by
   * addCompetitor() when platform_ids.xhs is present in the brand registry
   * lookup — replaces the manual /admin paste step. Stored in
   * workspace_competitors.xhs_profile_url. Falls back to NULL when the
   * brand isn't in the registry → admin can still paste manually.
   */
  xhs_profile_url?: string | null;
  /**
   * #18: per-brand data freshness. Latest scrape timestamp from
   * scraped_brand_profiles for this competitor (any platform). Null when
   * no scrape data exists yet. Surfaced on the Brief workspace context
   * block so users can see e.g. "Songmont scraped 12d ago, CASSILE 2d ago"
   * — different freshness per brand vs the brief's own age.
   */
  last_scraped_at?: string | null;
  last_scrape_platform?: string | null;
}

/**
 * Build the canonical XHS profile URL from a brand's XHS user id. The id
 * comes from the brand registry (BrandResolution.platform_ids.xhs) — when
 * present, the scraper can run immediately, no admin paste needed.
 *
 * Returns null when the id is missing or doesn't match the XHS UID shape
 * (hex, 16-32 chars). Caller falls back to manual paste flow.
 *
 * Pure function — testable in isolation. Lives here (not in CISettings.tsx)
 * so any future competitor-add path (onboarding, AI suggest, link paste)
 * automatically benefits via addCompetitor() below.
 */
export function buildXhsProfileUrl(xhsUserId: string | undefined | null): string | null {
  if (!xhsUserId || typeof xhsUserId !== 'string') return null;
  if (!/^[a-f0-9]{16,32}$/i.test(xhsUserId)) return null;
  return `https://www.rednote.com/user/profile/${xhsUserId}`;
}

export async function getCompetitors(workspaceId?: string): Promise<{ data: Competitor[]; source: 'api' | 'local' }> {
  if (workspaceId && workspaceId !== 'local') {
    const apiData = await tryApi<Competitor[]>(`/competitors?workspace_id=${workspaceId}`);
    if (apiData && Array.isArray(apiData)) {
      return { data: apiData, source: 'api' };
    }
  }
  const local = getCICompetitors();
  return { data: local, source: 'local' };
}

export async function addCompetitor(competitor: Partial<Competitor> & { workspace_id?: string }): Promise<Competitor | null> {
  // Auto-populate xhs_profile_url from platform_ids.xhs when missing.
  // Without this, every newly-added competitor would need a separate admin
  // /admin manual-paste step before the scraper could touch them — friction
  // we explicitly built /admin to handle, but the registry already knows
  // the XHS UID for any brand it has in its DB, so the manual paste is
  // unnecessary 90% of the time. Caller can still pass an explicit
  // xhs_profile_url to override (e.g., admin manual flow for off-registry brands).
  if (!competitor.xhs_profile_url && competitor.platform_ids && typeof competitor.platform_ids === 'object') {
    const xhsId = (competitor.platform_ids as Record<string, string>).xhs;
    const url = buildXhsProfileUrl(xhsId);
    if (url) competitor.xhs_profile_url = url;
  }

  if (competitor.workspace_id && competitor.workspace_id !== 'local') {
    const apiData = await tryApi<Competitor>('/competitors', {
      method: 'POST',
      body: JSON.stringify(competitor),
    });
    if (apiData) {
      // Adding a competitor changes the dashboard + competitor list
      invalidateCiCache('/competitors');
      invalidateCiCache('/dashboard');
      return apiData;
    }
  }
  // Fall back: save locally
  const local = getCICompetitors();
  const newComp = {
    id: `local-${Date.now()}`,
    brand_name: competitor.brand_name || '',
    tier: (competitor.tier || 'watchlist') as 'watchlist' | 'landscape',
    platform_ids: competitor.platform_ids || {},
    added_via: (competitor.added_via || 'manual') as 'manual' | 'link_paste' | 'ai_suggestion' | 'onboarding',
    created_at: new Date().toISOString(),
  };
  local.push(newComp);
  saveCICompetitors(local);
  return newComp;
}

export async function removeCompetitor(id: string, workspaceId?: string): Promise<boolean> {
  if (workspaceId && workspaceId !== 'local') {
    const res = await tryApi(`/competitors/${id}`, { method: 'DELETE' });
    if (res !== null) {
      invalidateCiCache('/competitors');
      invalidateCiCache('/dashboard');
      return true;
    }
  }
  // Fall back: remove locally
  const local = getCICompetitors();
  saveCICompetitors(local.filter(c => c.id !== id));
  return true;
}

// ─── Dashboard ────────────────────────────────────────────────────

export interface BrandScore {
  brand_name: string;
  group: string;
  momentum_score: number;
  threat_index: number;
  wtp_score: number;
  trend_signals: string[];
}

export interface DashboardData {
  narrative: string;
  last_updated: string;
  brands: BrandScore[];
  action_items: Array<{
    title: string;
    description: string;
    dept: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  analysis_pending?: boolean;
}

// Stable name-based score — same brand name → same score on every page
export function stableScore(name: string, offset: number, min: number, range: number): number {
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.round(min + ((seed * offset) % range));
}

export async function getDashboard(workspaceId?: string): Promise<{ data: DashboardData; source: 'api' | 'local' | 'demo' }> {
  // Try API (cached + deduped — Fixes #132)
  if (workspaceId && workspaceId !== 'local') {
    const apiData = await cachedGet<DashboardData>(`/dashboard?workspace_id=${workspaceId}`, CACHE_MS.dashboard);
    if (apiData && apiData.brands) {
      return { data: apiData, source: 'api' };
    }
  }
  // Fall back: build from localStorage
  const competitors = getCICompetitors();
  if (competitors.length > 0) {
    const brands: BrandScore[] = competitors.map((comp) => ({
      brand_name: comp.brand_name,
      group: comp.tier === 'watchlist' ? 'C' : 'B',
      momentum_score: stableScore(comp.brand_name, 7, 30, 60),
      threat_index: stableScore(comp.brand_name, 13, 20, 70),
      wtp_score: stableScore(comp.brand_name, 11, 25, 65),
      trend_signals: [],
    }));
    return {
      data: {
        narrative: '',
        last_updated: new Date().toISOString(),
        brands,
        action_items: generateActionItems(brands),
      },
      source: 'local',
    };
  }
  // Fall back: demo
  return { data: DEMO_DATA, source: 'demo' };
}

function generateActionItems(brands: BrandScore[]): DashboardData['action_items'] {
  const items: DashboardData['action_items'] = [];
  const highThreat = [...brands].sort((a, b) => b.threat_index - a.threat_index)[0];
  const highMomentum = [...brands].sort((a, b) => b.momentum_score - a.momentum_score)[0];
  if (highThreat) {
    items.push({
      title: `Monitor ${highThreat.brand_name}`,
      description: `Threat index of ${highThreat.threat_index} — review their pricing and channel strategy`,
      dept: '电商部',
      priority: highThreat.threat_index > 70 ? 'high' : 'medium',
    });
  }
  if (highMomentum && highMomentum.brand_name !== highThreat?.brand_name) {
    items.push({
      title: `Study ${highMomentum.brand_name}'s growth`,
      description: `Momentum score of ${highMomentum.momentum_score} — analyze their content and KOL strategy`,
      dept: '品牌部',
      priority: 'medium',
    });
  }
  return items;
}

// ─── Platform Connections ─────────────────────────────────────────

export interface PlatformConnection {
  id: string;
  platform: string;
  status: 'active' | 'expiring' | 'expired' | 'error';
  last_successful_scrape: string | null;
  connected_at?: string;
}

export async function getConnections(workspaceId?: string): Promise<{ data: PlatformConnection[]; source: 'api' | 'local' }> {
  if (workspaceId && workspaceId !== 'local') {
    // Cached + deduped (Fixes #132) — multiple components reading this
    // share one in-flight request and the result is cached for 60s.
    const apiData = await cachedGet<PlatformConnection[]>(`/connections?workspace_id=${workspaceId}`, CACHE_MS.connections);
    if (apiData && Array.isArray(apiData)) {
      return { data: apiData, source: 'api' };
    }
  }
  const local = getCIConnections();
  const mapped: PlatformConnection[] = local.map(c => ({
    id: c.platform,
    platform: c.platform,
    status: c.status === 'connected' ? 'active' : 'expired',
    last_successful_scrape: null,
    connected_at: c.connected_at ?? undefined,
  }));
  return { data: mapped, source: 'local' };
}

export async function saveConnection(workspaceId: string, platform: string, cookies: string): Promise<PlatformConnection | null> {
  if (workspaceId && workspaceId !== 'local') {
    const result = await tryApi<PlatformConnection>('/connections', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, platform, cookies }),
    });
    if (result) invalidateCiCache('/connections');
    return result;
  }
  return null;
}

// ─── TASK-19: Brand insights + score trends ────────────────────────

// TODO: Requires GET /api/ci/brand-insights endpoint (coordinate with William)
// Falls back to empty map if endpoint doesn't exist
export async function getBrandInsights(workspaceId: string, lang: string = 'zh'): Promise<Record<string, string>> {
  const data = await tryApi<any[]>(
    `/brand-insights?workspace_id=${encodeURIComponent(workspaceId)}&lang=${lang}`
  );
  if (!data) return {};
  const map: Record<string, string> = {};
  for (const row of data) {
    if (row.competitor_name && row.ai_narrative) {
      map[row.competitor_name] = row.ai_narrative;
    }
  }
  return map;
}

export interface TrendDataPoint {
  date: string;   // ISO 8601 date string, e.g. "2026-03-11"
  value: number;  // 0-100 score
}

// GET /api/ci/trends — historical score data for trend sparklines
// Backend returns { competitor, metric, days, data: TrendDataPoint[], count }
export async function getScoreTrends(
  workspaceId: string,
  competitor: string,
  metric: string,
  days: number
): Promise<{ data: TrendDataPoint[]; source: 'api' | 'simulated' }> {
  const resp = await tryApi<{ data: TrendDataPoint[]; count: number }>(
    `/trends?workspace_id=${encodeURIComponent(workspaceId)}&competitor=${encodeURIComponent(competitor)}&metric=${encodeURIComponent(metric)}&days=${days}`
  );
  if (resp?.data && resp.data.length > 1) {
    return { data: resp.data, source: 'api' };
  }
  // Fallback — no historical data yet (scores need ≥2 daily runs to show trend)
  return { data: [], source: 'simulated' };
}

// ─── TASK-28: Brand resolution + AI suggestions ───────────────────

export interface BrandResolution {
  brand_name: string;
  platform_ids: Record<string, string | null>;
  source: 'database' | 'registry' | 'default';
  badge?: string;
}

export interface ParsedLink {
  parsed: boolean;
  platform?: string;
  identifier?: string;
  brand_name?: string;
  platform_ids?: Record<string, string>;
  /**
   * Where the resolved brand_name came from:
   *   'url_keyword'   — extracted directly from a search/keyword URL
   *   'url_subdomain' — extracted from a Tmall/Taobao subdomain
   *   'database'      — found in workspace_competitors via platform_id reverse lookup
   *   'registry'      — matched a known brand in KNOWN_BRANDS
   *   'page_title'    — pulled from og:title / <title> by fetching the page
   *   null            — couldn't resolve; frontend prompts the user
   */
  resolved_via?: 'url_keyword' | 'url_subdomain' | 'database' | 'registry' | 'page_title' | null;
  error?: string;
}

export interface CompetitorSuggestion {
  brand_name: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  group: 'direct' | 'aspirational' | 'emerging';
  platform_ids?: Record<string, string>;
  badge?: string;
}

export async function resolveBrand(brandName: string): Promise<BrandResolution | null> {
  return await tryApi<BrandResolution>('/resolve-brand', {
    method: 'POST',
    body: JSON.stringify({ brand_name: brandName }),
  });
}

export async function parseLink(url: string): Promise<ParsedLink | null> {
  return await tryApi<ParsedLink>('/parse-link', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

/**
 * Result of suggestCompetitors. Always carries `suggestions` (possibly empty)
 * plus an optional human-readable `message` from the backend (e.g. fallback
 * source explanation, LLM upstream error) and `error` shape when the request
 * itself failed (auth/network/proxy). The UI uses these to show the actual
 * cause instead of a generic "AI unavailable" placeholder.
 */
export interface SuggestCompetitorsResult {
  suggestions: CompetitorSuggestion[];
  /** 'llm' | 'fallback' | 'error' — where the result came from */
  source: 'llm' | 'fallback' | 'error';
  /** Backend-supplied or client-derived message; safe to show to the user */
  message?: string;
  /** HTTP status of the underlying request (0 for network errors). */
  status: number;
}

export async function suggestCompetitors(
  brandName: string,
  category: string,
  priceRange?: { min: number; max: number },
  lang: string = 'zh'
): Promise<SuggestCompetitorsResult> {
  const result = await tryApiVerbose<{
    suggestions: CompetitorSuggestion[];
    source?: 'llm' | 'fallback';
    message?: string;
  }>('/suggest-competitors', {
    method: 'POST',
    body: JSON.stringify({
      brand_name: brandName,
      brand_category: category,
      brand_price_range: priceRange,
      lang,
    }),
  });

  if (!result.ok) {
    // Distinguish ECS-reachable failures from the proxy/network layer so the
    // UI can offer the right next-step (try again vs check connection).
    return {
      suggestions: [],
      source: 'error',
      status: result.status,
      message: result.message
        || (result.status === 0
          ? 'Could not reach the server. Please check your connection and try again.'
          : `Request failed (HTTP ${result.status})`),
    };
  }

  return {
    suggestions: result.data?.suggestions || [],
    source: result.data?.source || 'llm',
    status: result.status,
    message: result.data?.message,
  };
}

// ─── Brief draft (execution layer) ────────────────────────────────
// AI-Native Agency thesis on screen: generate a publish-ready XHS post
// from this week's top Brief move. Demoed at /agents/xhs-content for
// is_demo workspaces; backend accepts any workspace so the gate can
// widen later by removing one frontend conditional.

export interface BriefDraftResponse {
  channel: string;
  based_on: {
    move_index: number;
    move_headline: string;
    /** Optional EN version of the move headline. Lets the panel subtitle
     *  flip when the operator toggles content language. */
    move_headline_en?: string;
  };
  draft: { title: string; body: string; tags: string[]; image_concept: string };
  en_translation?: {
    title: string;
    body: string;
    image_concept: string;
    /** Optional EN-translated tags. Used for the Warroom's panel-local
     *  content toggle so YC reviewers see English everywhere when they
     *  flip the panel. NOTE: when widening to real customers, copy-to-
     *  clipboard should still emit the Chinese tags from `draft.tags`
     *  for actual publish — XHS hashtags are platform-native. */
    tags?: string[];
  };
  /** Optional bilingual chain-of-reasoning callout: WHY this draft exists.
   *  Surfaces the connection from competitive intel → playbook → content.
   *  Currently set on the prebaked demo draft; live LLM path can populate
   *  this in a future iteration to make the AI-Native Agency thesis
   *  legible in the UI. */
  rationale?: { zh: string; en: string };
}

export interface BriefDraftResult {
  ok: boolean;
  data?: BriefDraftResponse;
  status: number;
  message?: string;
}

export async function generateBriefDraft(
  workspaceId: string,
  moveIndex: number = 0,
  lang: string = 'zh',
  channel: 'xhs' = 'xhs',
): Promise<BriefDraftResult> {
  const result = await tryApiVerbose<BriefDraftResponse>('/brief/draft', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId, move_index: moveIndex, channel, lang }),
  });
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      message: result.message
        || (result.status === 0
          ? (lang === 'zh' ? '无法连接服务器,请重试' : 'Could not reach the server, try again')
          : `Request failed (HTTP ${result.status})`),
    };
  }
  return { ok: true, data: result.data, status: result.status };
}

export async function searchBrands(query: string): Promise<BrandResolution[]> {
  if (query.length < 1) return [];
  const data = await tryApi<{ brands: BrandResolution[] }>(`/brands/search?q=${encodeURIComponent(query)}`);
  return data?.brands || [];
}

// ─── TASK-26: Deep Dive ───────────────────────────────────────────

export interface DeepDiveJob {
  job_id: string;
  brand_name: string;
  status: 'queued' | 'scraping' | 'scoring' | 'narrating' | 'complete' | 'failed' | 'none';
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  result_summary: any;
}

export interface DeepDiveResult {
  brand_name: string;
  profile: any | null;
  products: any[];
  scores: Record<string, { score: number; raw_inputs: any; ai_narrative: string }>;
  insight: string | null;
  raw_dimensions: any | null;
  last_deep_dive: string | null;
}

export async function requestDeepDive(workspaceId: string, brandName: string): Promise<DeepDiveJob | null> {
  return await tryApi<DeepDiveJob>('/deep-dive', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId, brand_name: brandName }),
  });
}

export async function getDeepDiveStatus(workspaceId: string, brandName: string): Promise<DeepDiveJob | null> {
  return await tryApi<DeepDiveJob>(
    `/deep-dive/status?workspace_id=${encodeURIComponent(workspaceId)}&brand_name=${encodeURIComponent(brandName)}`
  );
}

export async function getDeepDiveResult(workspaceId: string, brandName: string): Promise<DeepDiveResult | null> {
  return await tryApi<DeepDiveResult>(
    `/deep-dive/result?workspace_id=${encodeURIComponent(workspaceId)}&brand_name=${encodeURIComponent(brandName)}`
  );
}

// ─── TASK-36: Analysis Job Tracking ──────────────────────────────

export interface AnalysisJob {
  job_id: string;
  status: 'none' | 'queued' | 'scoring' | 'narrating' | 'complete' | 'failed';
  total_brands: number;
  completed_brands: number;
  current_brand: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  message?: string;
}

export async function runAnalysis(workspaceId: string): Promise<AnalysisJob | null> {
  return await tryApi<AnalysisJob>('/run-analysis', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId }),
  });
}

export async function getAnalysisStatus(workspaceId: string): Promise<AnalysisJob | null> {
  return await tryApi<AnalysisJob>(`/analysis/status?workspace_id=${encodeURIComponent(workspaceId)}`);
}

// ─── Intelligence Layer ─────────────────────────────────────────

/**
 * Per-metric status — tells the UI whether this score is trustworthy.
 *
 * - 'computed': pipeline ran and produced a real, non-trivial score.
 * - 'pending': no analysis row yet (first-time user or analysis still running).
 * - 'no_data': pipeline ran but had no scrape data to chew on.
 * - 'not_applicable': this metric structurally can't be computed from the
 *   connected data sources (e.g. price analysis when only Douyin is connected —
 *   Douyin doesn't expose product prices to public scraping).
 */
export type MetricStatus = 'computed' | 'pending' | 'no_data' | 'not_applicable';

export interface MetricBrandData {
  score: number;
  status: MetricStatus;
  raw_inputs: Record<string, any> | null;
  ai_narrative: string | null;
  analyzed_at: string;
  /** Human-readable reason for non-computed statuses. E.g. "Connect XHS to unlock pricing." */
  status_reason?: string;
}

export interface MetricData {
  score: number;
  status: MetricStatus;
  brands: Record<string, MetricBrandData>;
}

export interface IntelligenceDomain {
  label: string;
  metrics: Record<string, MetricData>;
}

export interface IntelligenceData {
  workspace_id: string;
  last_updated: string;
  domains: Record<string, IntelligenceDomain>;
  available_metrics: string[];
  total_metrics: number;
}

export async function getIntelligence(workspaceId: string): Promise<IntelligenceData | null> {
  return await tryApi<IntelligenceData>(`/intelligence?workspace_id=${encodeURIComponent(workspaceId)}`);
}

// ─── TASK-25: Alerts ──────────────────────────────────────────────

export interface CIAlert {
  id: string;
  competitor_name: string;
  alert_type: string;
  metric_type: string | null;
  previous_value: number | null;
  current_value: number | null;
  change_amount: number | null;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  is_read: boolean;
  created_at: string;
}

export async function getAlerts(
  workspaceId: string,
  unreadOnly: boolean = false
): Promise<{ alerts: CIAlert[]; unread_count: number }> {
  const params = `workspace_id=${encodeURIComponent(workspaceId)}${unreadOnly ? '&unread_only=true' : ''}`;
  // Cached + deduped (Fixes #132). CIAlertFeed previously fetched on every
  // parent render because `competitors` was in the useEffect deps as an
  // array — that's fixed there too, but the cache makes the bug impossible
  // to reintroduce.
  const data = await cachedGet<{ alerts: CIAlert[]; unread_count: number }>(`/alerts?${params}`, CACHE_MS.alerts);
  return data || { alerts: [], unread_count: 0 };
}

export async function getAlertCount(workspaceId: string): Promise<number> {
  const data = await tryApi<{ unread_count: number }>(
    `/alerts/count?workspace_id=${encodeURIComponent(workspaceId)}`
  );
  return data?.unread_count || 0;
}

export async function markAlertsRead(workspaceId: string, alertIds?: string[]): Promise<void> {
  await tryApi('/alerts/read', {
    method: 'POST',
    body: JSON.stringify({ workspace_id: workspaceId, alert_ids: alertIds }),
  });
  // Read status changed → drop cached alerts/count so the next read reflects it
  invalidateCiCache('/alerts');
}

// ─── Demo Data (last resort fallback) ─────────────────────────────

const DEMO_DATA: DashboardData = {
  narrative: 'This is demo data. Add competitors in Settings to see your competitive intelligence.',
  last_updated: new Date().toISOString(),
  brands: [
    { brand_name: 'Competitor A', group: 'C', momentum_score: 72, threat_index: 65, wtp_score: 58, trend_signals: ['内容矩阵扩张'] },
    { brand_name: 'Competitor B', group: 'C', momentum_score: 45, threat_index: 80, wtp_score: 71, trend_signals: ['直播销量增长'] },
    { brand_name: 'Competitor C', group: 'B', momentum_score: 88, threat_index: 42, wtp_score: 65, trend_signals: ['KOL合作增加'] },
  ],
  action_items: [
    { title: 'Monitor Competitor B pricing', description: 'High threat index — review their strategy', dept: '电商部', priority: 'high' },
  ],
};
