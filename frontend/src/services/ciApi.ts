import { getCIWorkspace, getCICompetitors, getCIConnections, saveCIWorkspace, saveCICompetitors } from '../utils/ciStorage';

const API_BASE = '/api/ci';

// Helper: get auth headers from JWT token
function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('rebase_token');
  let userId = '';
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      userId = payload.sub || payload.id || payload.email || '';
    } catch {}
  }
  return {
    'Content-Type': 'application/json',
    'x-user-id': userId,
  };
}

// Helper: try API call, return null on failure (don't throw)
async function tryApi<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: { ...getHeaders(), ...(options?.headers as Record<string, string> | undefined) },
    });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null; // Network error, API not available
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
}

export async function getWorkspace(): Promise<{ data: Workspace | null; source: 'api' | 'local' }> {
  // Try API first (maps to Vercel serverless: api/ci/workspace-me.js)
  const apiData = await tryApi<Workspace>('/workspace-me');
  if (apiData && apiData.id) {
    return { data: apiData, source: 'api' };
  }
  // Fall back to localStorage
  const local = getCIWorkspace();
  if (local) {
    return {
      data: {
        id: 'local',
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
  // Try API
  const apiData = await tryApi<Workspace>('/workspace', {
    method: 'POST',
    body: JSON.stringify(workspace),
  });
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

// ─── Competitors ──────────────────────────────────────────────────

export interface Competitor {
  id: string;
  workspace_id?: string;
  brand_name: string;
  tier: 'watchlist' | 'landscape';
  platform_ids: Record<string, string> | null;
  added_via: string;
  created_at: string;
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
  if (competitor.workspace_id && competitor.workspace_id !== 'local') {
    const apiData = await tryApi<Competitor>('/competitors', {
      method: 'POST',
      body: JSON.stringify(competitor),
    });
    if (apiData) return apiData;
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
    if (res !== null) return true;
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
}

// Stable name-based score — same brand name → same score on every page
export function stableScore(name: string, offset: number, min: number, range: number): number {
  const seed = name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.round(min + ((seed * offset) % range));
}

export async function getDashboard(workspaceId?: string): Promise<{ data: DashboardData; source: 'api' | 'local' | 'demo' }> {
  // Try API
  if (workspaceId && workspaceId !== 'local') {
    const apiData = await tryApi<DashboardData>(`/dashboard?workspace_id=${workspaceId}`);
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
    const apiData = await tryApi<PlatformConnection[]>(`/connections?workspace_id=${workspaceId}`);
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
    return await tryApi<PlatformConnection>('/connections', {
      method: 'POST',
      body: JSON.stringify({ workspace_id: workspaceId, platform, cookies }),
    });
  }
  return null;
}

// ─── TASK-19: Brand insights + score trends ────────────────────────

// TODO: Requires GET /api/ci/brand-insights endpoint (coordinate with William)
// Falls back to empty map if endpoint doesn't exist
export async function getBrandInsights(workspaceId: string): Promise<Record<string, string>> {
  const data = await tryApi<any[]>(
    `/brand-insights?workspace_id=${encodeURIComponent(workspaceId)}`
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

// TODO: Requires GET /api/ci/trends endpoint (TASK-23)
// Returns simulated data as fallback until real historical data is available
export async function getScoreTrends(
  workspaceId: string,
  competitor: string,
  metric: string,
  days: number
): Promise<{ data: TrendDataPoint[]; source: 'api' | 'simulated' }> {
  const apiData = await tryApi<TrendDataPoint[]>(
    `/trends?workspace_id=${encodeURIComponent(workspaceId)}&competitor=${encodeURIComponent(competitor)}&metric=${encodeURIComponent(metric)}&days=${days}`
  );
  if (apiData && apiData.length > 1) {
    return { data: apiData, source: 'api' };
  }
  // Simulated fallback — will be replaced when TASK-23 builds the trends API
  return { data: [], source: 'simulated' };
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
  const data = await tryApi<{ alerts: CIAlert[]; unread_count: number }>(`/alerts?${params}`);
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
