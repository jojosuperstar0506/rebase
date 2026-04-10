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
}

export interface CIConnection {
  platform: 'sycm' | 'xhs_analytics' | 'douyin_compass';
  status: 'connected' | 'not_connected';
  connected_at: string | null;
}

export function getCIWorkspace(): CIWorkspace | null {
  const raw = localStorage.getItem('rebase_ci_workspace');
  return raw ? JSON.parse(raw) : null;
}

export function saveCIWorkspace(data: CIWorkspace) {
  localStorage.setItem('rebase_ci_workspace', JSON.stringify(data));
  notifyCIUpdate();
}

export function getCICompetitors(): CICompetitor[] {
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
