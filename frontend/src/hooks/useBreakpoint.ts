import { useState, useEffect } from 'react';

export type Breakpoint = 'mobile' | 'tablet' | 'desktop';

function getBreakpoint(): Breakpoint {
  const w = window.innerWidth;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

export function useBreakpoint(): Breakpoint {
  const [bp, setBp] = useState<Breakpoint>(getBreakpoint);

  useEffect(() => {
    const handler = () => setBp(getBreakpoint());
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return bp;
}

/** Returns true when viewport is < 640px */
export function useIsMobile(): boolean {
  return useBreakpoint() === 'mobile';
}

/** Returns true when viewport is < 1024px (mobile OR tablet) */
export function useIsNarrow(): boolean {
  const bp = useBreakpoint();
  return bp === 'mobile' || bp === 'tablet';
}
