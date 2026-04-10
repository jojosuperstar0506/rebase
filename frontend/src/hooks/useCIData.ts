import { useState, useEffect, useCallback } from 'react';
import {
  getWorkspace, getCompetitors, getDashboard, getConnections,
  saveWorkspace, addCompetitor,
} from '../services/ciApi';
import { getCIWorkspace, getCICompetitors } from '../utils/ciStorage';
import type { Workspace, Competitor, DashboardData, PlatformConnection } from '../services/ciApi';

interface CIDataState {
  workspace: Workspace | null;
  competitors: Competitor[];
  dashboard: DashboardData | null;
  connections: PlatformConnection[];
  /** Where the dashboard data came from */
  source: 'api' | 'local' | 'demo';
  /** Where the workspace specifically came from */
  workspaceSource: 'api' | 'local';
  /** True when localStorage has data but API workspace doesn't exist yet */
  needsSync: boolean;
  loading: boolean;
  refresh: () => void;
  /** Sync localStorage workspace + competitors up to the API */
  syncToApi: () => Promise<void>;
}

export function useCIData(): CIDataState {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [source, setSource] = useState<'api' | 'local' | 'demo'>('demo');
  const [workspaceSource, setWorkspaceSource] = useState<'api' | 'local'>('local');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);

    const ws = await getWorkspace();
    setWorkspace(ws.data);
    setWorkspaceSource(ws.source);

    const comps = await getCompetitors(ws.data?.id);
    setCompetitors(comps.data);

    const dash = await getDashboard(ws.data?.id);
    setDashboard(dash.data);
    setSource(dash.source);

    const conns = await getConnections(ws.data?.id);
    setConnections(conns.data);

    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Listen for localStorage changes (from settings page or other tabs)
  useEffect(() => {
    const handler = () => loadAll();
    window.addEventListener('storage', handler);
    window.addEventListener('ci-data-updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('ci-data-updated', handler);
    };
  }, [loadAll]);

  // needsSync: API workspace is absent but localStorage has meaningful data
  const localWorkspace = getCIWorkspace();
  const localCompetitors = getCICompetitors();
  const needsSync =
    workspaceSource === 'local' &&
    workspace?.id !== 'local' === false &&  // id IS 'local' → no real API workspace
    !!(localWorkspace?.brand_name || localCompetitors.length > 0);

  // Cleaner: needsSync = API not available + local data exists
  const hasLocalData = !!(localWorkspace?.brand_name || localCompetitors.length > 0);
  const apiWorkspaceAbsent = workspaceSource === 'local';
  const needsSyncFinal = !loading && apiWorkspaceAbsent && hasLocalData;

  // Sync localStorage → API
  const syncToApi = useCallback(async () => {
    const localWs = getCIWorkspace();
    const localComps = getCICompetitors();

    if (!localWs) return;

    // 1. Create workspace via API
    const apiWs = await saveWorkspace({
      brand_name: localWs.brand_name,
      brand_category: localWs.brand_category || null,
      brand_price_range: localWs.price_range || null,
      brand_platforms: null,
    });

    if (!apiWs || apiWs.id === 'local') return; // API still not available

    // 2. Add each local competitor to the API workspace
    for (const comp of localComps) {
      await addCompetitor({
        workspace_id: apiWs.id,
        brand_name: comp.brand_name,
        tier: comp.tier,
        platform_ids: comp.platform_ids || {},
        added_via: comp.added_via,
        created_at: comp.created_at,
      });
    }

    // 3. Reload everything fresh from API
    await loadAll();
  }, [loadAll]);

  return {
    workspace,
    competitors,
    dashboard,
    connections,
    source,
    workspaceSource,
    needsSync: needsSyncFinal,
    loading,
    refresh: loadAll,
    syncToApi,
  };
}
