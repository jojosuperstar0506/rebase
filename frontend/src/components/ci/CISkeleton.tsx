import { useEffect } from 'react';
import { useApp } from '../../context/AppContext';

// Inject shimmer keyframe once
function injectShimmerStyle() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ci-shimmer-keyframes')) return;
  const el = document.createElement('style');
  el.id = 'ci-shimmer-keyframes';
  el.textContent = `
    @keyframes ci-shimmer {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.45; }
    }
  `;
  document.head.appendChild(el);
}

// Single shimmer bar
function Bar({ w = '100%', h = 16, mb = 0, r = 6 }: { w?: string | number; h?: number; mb?: number; r?: number }) {
  const { colors: C } = useApp();
  return (
    <div style={{
      width: w,
      height: h,
      borderRadius: r,
      background: C.s2,
      marginBottom: mb,
      animation: 'ci-shimmer 1.5s ease-in-out infinite',
    }} />
  );
}

// Generic skeleton wrapper
function SkeletonCard({ children, mb = 24 }: { children: React.ReactNode; mb?: number }) {
  const { colors: C } = useApp();
  return (
    <div style={{
      background: C.s1,
      border: `1px solid ${C.bd}`,
      borderRadius: 12,
      padding: 24,
      marginBottom: mb,
    }}>
      {children}
    </div>
  );
}

// ── Dashboard skeleton ────────────────────────────────────────────────────────

export function CIDashboardSkeleton() {
  useEffect(() => { injectShimmerStyle(); }, []);
  const { colors: C } = useApp();

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* SubNav placeholder */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${C.bd}` }}>
          {[80, 110, 90, 70].map((w, i) => <Bar key={i} w={w} h={28} r={6} />)}
        </div>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <Bar w={280} h={32} mb={10} />
          <Bar w={380} h={16} />
        </div>

        {/* Status banner */}
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '10px 20px', marginBottom: 24 }}>
          <Bar w={260} h={14} />
        </div>

        {/* Stat cards row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4].map(i => (
            <SkeletonCard key={i} mb={0}>
              <Bar w={40} h={28} mb={8} />
              <Bar w={120} h={12} />
            </SkeletonCard>
          ))}
        </div>

        {/* Chart area */}
        <SkeletonCard>
          <Bar w={200} h={18} mb={16} />
          <div style={{
            height: 280,
            background: C.s2,
            borderRadius: 8,
            animation: 'ci-shimmer 1.5s ease-in-out infinite',
          }} />
        </SkeletonCard>

        {/* Table */}
        <SkeletonCard>
          <Bar w={200} h={18} mb={20} />
          {[1, 2, 3, 4].map(i => (
            <div key={i} style={{ display: 'flex', gap: 16, marginBottom: 14, alignItems: 'center' }}>
              <Bar w="30%" h={14} />
              <Bar w="20%" h={10} />
              <Bar w="20%" h={10} />
              <Bar w="20%" h={10} />
            </div>
          ))}
        </SkeletonCard>
      </div>
    </div>
  );
}

// ── Landscape skeleton ────────────────────────────────────────────────────────

export function CILandscapeSkeleton() {
  useEffect(() => { injectShimmerStyle(); }, []);
  const { colors: C } = useApp();

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* SubNav */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${C.bd}` }}>
          {[80, 110, 90, 70].map((w, i) => <Bar key={i} w={w} h={28} r={6} />)}
        </div>
        {/* Header */}
        <Bar w={240} h={32} mb={10} />
        <Bar w={360} h={16} mb={24} />

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {[1, 2, 3].map(i => (
            <SkeletonCard key={i} mb={0}>
              <Bar w={40} h={24} mb={6} />
              <Bar w={100} h={12} />
            </SkeletonCard>
          ))}
        </div>

        {/* Filter bar */}
        <SkeletonCard mb={20}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Bar w={180} h={32} r={8} />
            {[70, 60, 80, 65].map((w, i) => <Bar key={i} w={w} h={28} r={6} />)}
          </div>
        </SkeletonCard>

        {/* Chart */}
        <SkeletonCard>
          <div style={{
            height: 340,
            background: C.s2,
            borderRadius: 8,
            animation: 'ci-shimmer 1.5s ease-in-out infinite',
          }} />
        </SkeletonCard>
      </div>
    </div>
  );
}

// ── Competitors skeleton ──────────────────────────────────────────────────────

export function CICompetitorsSkeleton() {
  useEffect(() => { injectShimmerStyle(); }, []);
  const { colors: C } = useApp();

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* SubNav */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${C.bd}` }}>
          {[80, 110, 90, 70].map((w, i) => <Bar key={i} w={w} h={28} r={6} />)}
        </div>
        <Bar w={220} h={32} mb={10} />
        <Bar w={340} h={16} mb={24} />

        {/* Controls bar */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
          <Bar w={180} h={34} r={8} />
          <Bar w={90} h={34} r={8} />
          <Bar w={120} h={34} r={8} />
          <Bar w={100} h={34} r={8} />
        </div>

        {/* Cards grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {[1, 2, 3].map(i => (
            <SkeletonCard key={i} mb={0}>
              <Bar w="60%" h={22} mb={12} />
              <Bar w="80%" h={12} mb={20} />
              {[1, 2, 3].map(j => (
                <div key={j} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Bar w="40%" h={10} />
                    <Bar w="15%" h={10} />
                  </div>
                  <Bar w="100%" h={6} r={3} />
                </div>
              ))}
              <div style={{ borderTop: `1px solid ${C.bd}`, marginTop: 12, paddingTop: 12 }}>
                <Bar w="50%" h={10} mb={8} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <Bar w="48%" h={32} r={8} />
                  <Bar w="48%" h={32} r={8} />
                </div>
              </div>
            </SkeletonCard>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Settings skeleton ─────────────────────────────────────────────────────────

export function CISettingsSkeleton() {
  useEffect(() => { injectShimmerStyle(); }, []);
  const { colors: C } = useApp();

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        {/* SubNav */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, paddingBottom: 12, borderBottom: `1px solid ${C.bd}` }}>
          {[80, 110, 90, 70].map((w, i) => <Bar key={i} w={w} h={28} r={6} />)}
        </div>
        <Bar w={160} h={32} mb={10} />
        <Bar w={300} h={16} mb={28} />

        {/* Section 1 */}
        <SkeletonCard>
          <Bar w={180} h={20} mb={20} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[1, 2, 3, 4].map(i => (
              <div key={i}>
                <Bar w="60%" h={12} mb={6} />
                <Bar w="100%" h={38} r={8} />
              </div>
            ))}
          </div>
          <Bar w={140} h={38} r={8} mb={0} />
        </SkeletonCard>

        {/* Section 2 */}
        <SkeletonCard>
          <Bar w={200} h={20} mb={20} />
          {[1, 2, 3].map(i => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: `1px solid ${C.bd}` }}>
              <Bar w={32} h={32} r={6} />
              <div style={{ flex: 1 }}>
                <Bar w="40%" h={14} mb={6} />
                <Bar w="60%" h={10} />
              </div>
              <Bar w={80} h={30} r={8} />
            </div>
          ))}
        </SkeletonCard>

        {/* Section 3 */}
        <SkeletonCard>
          <Bar w={220} h={20} mb={20} />
          {[1, 2, 3].map(i => (
            <div key={i} style={{ padding: '16px', background: C.s2, borderRadius: 10, marginBottom: 12 }}>
              <Bar w="50%" h={14} mb={6} />
              <Bar w="80%" h={11} />
            </div>
          ))}
        </SkeletonCard>
      </div>
    </div>
  );
}
