function notifyCIUpdate() {
  window.dispatchEvent(new CustomEvent('ci-data-updated'));
}

export interface CIWorkspace {
  brand_name: string;
  brand_category: string;
  price_range: { min: number; max: number };
  platforms: string[];
}

export interface CICompetitor {
  id: string;
  brand_name: string;
  tier: 'watchlist' | 'landscape';
  platform_ids: Record<string, string>;
  added_via: 'manual' | 'link_paste' | 'ai_suggestion' | 'onboarding';
  created_at: string;
  /** Optional fields returned by GET /api/ci/competitors when present.
   *  - xhs_profile_url: set by addCompetitor() auto-populate from registry,
   *    or by admin via PATCH /api/admin/competitors/:id/xhs-url. Drives the
   *    DataSourcesStatus state machine in CISettings.
   *  - last_scraped_at: lateral-join freshness from scraped_brand_profiles
   *    (#18). Null when no scrape data exists yet.
   *  Both optional because localStorage-only rows (offline mode) won't
   *  carry them; only API-hydrated rows will. */
  xhs_profile_url?: string | null;
  last_scraped_at?: string | null;
}

export interface CIConnection {
  platform: 'sycm' | 'xhs_analytics' | 'douyin_compass';
  status: 'connected' | 'not_connected';
  connected_at: string | null;
}

// Demo-mode seed values. Kept here (rather than imported from demoFixtures)
// so ciStorage stays dependency-free — it is imported by nearly everything.
const DEMO_SEED_WORKSPACE: CIWorkspace = {
  brand_name: 'TORY BURCH',
  brand_category: '女包',
  price_range: { min: 1200, max: 4800 },
  platforms: ['小红书', '抖音'],
};

const DEMO_SEED_COMPETITORS: CICompetitor[] = [
  'COACH', '古良吉吉', 'MICHAEL KORS', 'MCM', 'Dissona',
].map((brand_name, i) => ({
  id: `demo-c${i + 1}`,
  brand_name,
  tier: 'watchlist' as const,
  platform_ids: {},
  added_via: 'onboarding' as const,
  created_at: '2026-05-04T00:00:00.000Z',
}));

// Bump this whenever the demo dataset changes. Any browser holding an older
// version gets its demo workspace + competitors replaced on next load.
//
// Why a version rather than "seed only when empty": anyone who opened the app
// before the handbag dataset shipped has a stale workspace cached (a Nike one,
// from the old sneaker fixtures). Seed-if-empty would never replace it, so
// they would keep seeing the wrong brand forever with no way to fix it short
// of clearing site data by hand.
const DEMO_SEED_VERSION = '2026-05-05.handbag.1';
const DEMO_SEED_VERSION_KEY = 'rebase_ci_demo_seed_version';

/**
 * Install (or refresh) the demo dataset in localStorage.
 *
 * Runs at most once per seed version per browser. After it stamps the version
 * key, the prospect's own edits — renaming the brand, adding or removing
 * competitors — persist normally and are never clobbered.
 */
function ensureDemoSeed(): void {
  if (import.meta.env.VITE_DEMO_MODE !== 'true') return;
  if (localStorage.getItem(DEMO_SEED_VERSION_KEY) === DEMO_SEED_VERSION) return;
  localStorage.setItem('rebase_ci_workspace', JSON.stringify(DEMO_SEED_WORKSPACE));
  localStorage.setItem('rebase_ci_competitors', JSON.stringify(DEMO_SEED_COMPETITORS));
  localStorage.setItem(DEMO_SEED_VERSION_KEY, DEMO_SEED_VERSION);
}

export function getCIWorkspace(): CIWorkspace | null {
  ensureDemoSeed();
  const raw = localStorage.getItem('rebase_ci_workspace');
  return raw ? JSON.parse(raw) : null;
}

export function saveCIWorkspace(data: CIWorkspace) {
  localStorage.setItem('rebase_ci_workspace', JSON.stringify(data));
  notifyCIUpdate();
}

export function getCICompetitors(): CICompetitor[] {
  ensureDemoSeed();
  const raw = localStorage.getItem('rebase_ci_competitors');
  return raw ? JSON.parse(raw) : [];
}

export function saveCICompetitors(competitors: CICompetitor[]) {
  localStorage.setItem('rebase_ci_competitors', JSON.stringify(competitors));
  notifyCIUpdate();
}

export function getCIConnections(): CIConnection[] {
  const raw = localStorage.getItem('rebase_ci_connections');
  return raw ? JSON.parse(raw) : [];
}

export function saveCIConnections(connections: CIConnection[]) {
  localStorage.setItem('rebase_ci_connections', JSON.stringify(connections));
  notifyCIUpdate();
}

// ── Multi-workspace switching ─────────────────────────────────────
// The backend currently only returns the user's latest workspace from
// /api/ci/workspace/me (LIMIT 1) — no list endpoint exists yet. To support
// switching between known workspaces, we cache each workspace's metadata
// locally as the user visits it, and store an "active" id that overrides
// the backend default for downstream calls (analytics, brief, etc — all
// already accept ?workspace_id=).
export interface KnownWorkspace {
  id: string;
  brand_name: string;
  brand_category: string | null;
  cached_at: string;
}

export function getKnownWorkspaces(): KnownWorkspace[] {
  // Demo mode: the switcher lists exactly one workspace — the demo brand.
  // Without this, stale entries cached from earlier sessions (notably an old
  // "OMI" workspace from prior testing) show up in the dropdown and make the
  // demo look like someone else's account.
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    return [{
      id: 'demo-mock-workspace',
      brand_name: 'TORY BURCH',
      brand_category: '女包',
      cached_at: new Date().toISOString(),
    }];
  }
  const raw = localStorage.getItem('rebase_ci_known_workspaces');
  return raw ? JSON.parse(raw) : [];
}

export function addKnownWorkspace(ws: Omit<KnownWorkspace, 'cached_at'>) {
  if (!ws.id || ws.id === 'local' || ws.id === 'mock') return;
  const existing = getKnownWorkspaces();
  const prior = existing.find(w => w.id === ws.id);
  // Skip the write (and the ci-data-updated event) when nothing user-visible
  // changed — getWorkspace() runs this on every load, so an unconditional
  // notify creates a refetch loop with useCIData.
  if (prior && prior.brand_name === ws.brand_name && prior.brand_category === ws.brand_category) {
    return;
  }
  const list = existing.filter(w => w.id !== ws.id);
  list.unshift({ ...ws, cached_at: new Date().toISOString() });
  localStorage.setItem('rebase_ci_known_workspaces', JSON.stringify(list));
  notifyCIUpdate();
}

export function removeKnownWorkspace(id: string) {
  const list = getKnownWorkspaces().filter(w => w.id !== id);
  localStorage.setItem('rebase_ci_known_workspaces', JSON.stringify(list));
  if (getActiveWorkspaceId() === id) setActiveWorkspaceId(null);
  else notifyCIUpdate();
}

export function getActiveWorkspaceId(): string | null {
  return localStorage.getItem('rebase_ci_active_workspace_id');
}

export function setActiveWorkspaceId(id: string | null) {
  if (id) localStorage.setItem('rebase_ci_active_workspace_id', id);
  else localStorage.removeItem('rebase_ci_active_workspace_id');
  notifyCIUpdate();
}

export function parsePlatformFromUrl(url: string): { platform: string; identifier: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname;
    const pathParts = u.pathname.split('/').filter(Boolean);
    const identifier = pathParts[pathParts.length - 1] || u.searchParams.get('id') || url;

    if (host.includes('xiaohongshu.com') || host.includes('xhs.link')) {
      return { platform: 'xhs', identifier };
    }
    if (host.includes('taobao.com') || host.includes('tmall.com')) {
      return { platform: 'taobao', identifier };
    }
    if (host.includes('douyin.com')) {
      return { platform: 'douyin', identifier };
    }
    if (host.includes('jd.com')) {
      return { platform: 'jd', identifier };
    }
    return null;
  } catch {
    return null;
  }
}
