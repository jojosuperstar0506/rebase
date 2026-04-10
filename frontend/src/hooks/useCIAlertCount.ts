import { useState, useEffect } from 'react';
import { getAlertCount } from '../services/ciApi';

export function useCIAlertCount(workspaceId: string | null): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!workspaceId) return;

    const check = async () => {
      const n = await getAlertCount(workspaceId);
      setCount(n);
    };

    check();
    // Poll every 5 minutes
    const interval = setInterval(check, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  return count;
}
