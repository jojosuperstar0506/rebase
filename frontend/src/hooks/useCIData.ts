import { useState, useEffect, useCallback } from 'react';
import { getWorkspace, getCompetitors, getDashboard, getConnections } from '../services/ciApi';
import type { Workspace, Competitor, DashboardData, PlatformConnection } from '../services/ciApi';

interface CIDataState {
  workspace: Workspace | null;
  competitors: Competitor[];
  dashboard: DashboardData | null;
  connections: PlatformConnection[];
  source: 'api' | 'local' | 'demo';
  loading: boolean;
  refresh: () => void;
}

export function useCIData(): CIDataState {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [connections, setConnections] = useState<PlatformConnection[]>([]);
  const [source, setSource] = useState<'api' | 'local' | 'demo'>('demo');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);

    const ws = await getWorkspace();
    setWorkspace(ws.data);

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
    // Also listen for custom event from same-tab changes
    window.addEventListener('ci-data-updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('ci-data-updated', handler);
    };
  }, [loadAll]);

  return { workspace, competitors, dashboard, connections, source, loading, refresh: loadAll };
}
