import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import { useCIData } from '../../hooks/useCIData';
import { LANDSCAPE_SEED } from '../../data/ci/landscapeSeed';
import { CILandscapeSkeleton } from '../../components/ci/CISkeleton';
import { useBreakpoint } from '../../hooks/useBreakpoint';

// ── Types ──────────────────────────────────────────────────────────────────────

interface PlotBrand {
  brand_name: string;
  group: string;
  avg_price: number;
  est_monthly_volume: number;
  positioning: string;
  isWatchlist: boolean;
  isYourBrand: boolean;
}

type SortKey = 'brand_name' | 'avg_price' | 'est_monthly_volume';
type SortDir = 'asc' | 'desc';

// ── Price zone config ──────────────────────────────────────────────────────────

const PRICE_ZONES = [
  { key: 'entry',   maxPrice: 200,  labelKey: 'entry'    as const },
  { key: 'mid',     maxPrice: 500,  labelKey: 'midRange' as const },
  { key: 'premium', maxPrice: 1000, labelKey: 'premium'  as const },
  { key: 'luxury',  maxPrice: Infinity, labelKey: 'luxury' as const },
];

function getPriceZone(price: number): string {
  if (price <= 200) return 'entry';
  if (price <= 500) return 'mid';
  if (price <= 1000) return 'premium';
  return 'luxury';
}

// ── Chart layout constants ────────────────────────────────────────────────────

const VB_W = 720;
const VB_H = 440;
const PAD_L = 64;   // space for Y-axis labels
const PAD_R = 20;
const PAD_T = 30;   // space for price zone labels
const PAD_B = 44;   // space for X-axis labels

const CHART_W = VB_W - PAD_L - PAD_R;
const CHART_H = VB_H - PAD_T - PAD_B;

// ── Seeded random for stable volumes on user competitors ──────────────────────

function seededVal(seed: number, min: number, max: number): number {
  const x = Math.sin(seed + 42) * 10000;
  return Math.round(min + (x - Math.floor(x)) * (max - min));
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtVol(v: number): string {
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CILandscape() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { workspace, competitors: userCompetitors, loading } = useCIData();

  // ── ALL HOOKS MUST BE ABOVE ANY EARLY RETURN (React Rules of Hooks) ────────

  const watchlistNames = useMemo(
    () => new Set(userCompetitors.filter(c => c.tier === 'watchlist').map(c => c.brand_name)),
    [userCompetitors]
  );

  // Build merged brand list: seed + user competitors (user overrides seed entries)
  const allBrands = useMemo<PlotBrand[]>(() => {
    const seedMap = new Map(LANDSCAPE_SEED.map(b => [b.brand_name, { ...b }]));

    // Merge user competitors on top
    userCompetitors.forEach((comp, i) => {
      const existing = seedMap.get(comp.brand_name);
      if (!existing) {
        seedMap.set(comp.brand_name, {
          brand_name: comp.brand_name,
          group: comp.tier === 'watchlist' ? 'C' : 'B',
          avg_price: seededVal(i * 7, 150, 1500),
          est_monthly_volume: seededVal(i * 7 + 3, 500, 12000),
          positioning: '',
          category: '',
        });
      }
    });

    return Array.from(seedMap.values()).map(b => ({
      ...b,
      isWatchlist: watchlistNames.has(b.brand_name),
      isYourBrand: false,
    }));
  }, [userCompetitors, watchlistNames]);

  // Your brand (only shown if workspace has price range)
  const yourBrand: PlotBrand | null = workspace?.brand_name && workspace.brand_price_range
    ? {
        brand_name: workspace.brand_name,
        group: 'YOU',
        avg_price: Math.round((workspace.brand_price_range.min + workspace.brand_price_range.max) / 2) || 400,
        est_monthly_volume: 2000,
        positioning: '',
        isWatchlist: false,
        isYourBrand: true,
      }
    : null;

  // ── Filters ────────────────────────────────────────────────────────────────

  const [activeZones, setActiveZones] = useState<Set<string>>(new Set(['entry', 'mid', 'premium', 'luxury']));
  const [activeGroups, setActiveGroups] = useState<Set<string>>(new Set(['D', 'C', 'B']));
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('avg_price');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);

  // ── Early return AFTER all hooks ────────────────────────────────────────────
  if (loading) return <CILandscapeSkeleton />;

  function toggleZone(z: string) {
    setActiveZones(s => { const n = new Set(s); n.has(z) ? n.delete(z) : n.add(z); return n; });
  }
  function toggleGroup(g: string) {
    setActiveGroups(s => { const n = new Set(s); n.has(g) ? n.delete(g) : n.add(g); return n; });
  }

  const visibleBrands = useMemo(() => {
    return allBrands.filter(b => {
      if (!activeZones.has(getPriceZone(b.avg_price))) return false;
      if (!b.isWatchlist && !activeGroups.has(b.group)) return false;
      return true;
    });
  }, [allBrands, activeZones, activeGroups]);

  // ── Auto-scale axes ────────────────────────────────────────────────────────

  const allForScale = [...visibleBrands, ...(yourBrand ? [yourBrand] : [])];
  const prices = allForScale.map(b => b.avg_price);
  const vols   = allForScale.map(b => b.est_monthly_volume);

  const minP = prices.length ? Math.max(0, Math.min(...prices) * 0.85) : 0;
  const maxP = prices.length ? Math.max(...prices) * 1.12 : 3000;
  const minV = 0;
  const maxV = vols.length ? Math.max(...vols) * 1.15 : 20000;

  function scaleX(price: number) {
    return PAD_L + ((price - minP) / (maxP - minP)) * CHART_W;
  }
  function scaleY(vol: number) {
    return PAD_T + CHART_H - ((vol - minV) / (maxV - minV)) * CHART_H;
  }

  // ── Price zone band X-positions ────────────────────────────────────────────

  const zoneBreaks = [0, 200, 500, 1000];
  function zoneX(price: number) {
    return scaleX(Math.max(minP, Math.min(maxP, price)));
  }

  // ── Dot style by group ──────────────────────────────────────────────────────

  function dotColor(b: PlotBrand): string {
    if (b.isYourBrand) return C.ac;
    if (b.isWatchlist) return C.danger;
    if (b.group === 'B') return C.ac;
    if (b.group === 'C') return '#f59e0b';
    return C.t3;
  }
  function dotR(b: PlotBrand): number {
    if (b.isYourBrand) return 14;
    if (b.isWatchlist) return 12;
    return b.group === 'D' ? 6 : 8;
  }
  function dotOpacity(b: PlotBrand): number {
    if (b.isYourBrand || b.isWatchlist) return 1;
    if (b.group === 'D') return 0.4;
    return 0.7;
  }

  // ── Search dim logic ────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  function isMatch(b: PlotBrand) { return !q || b.brand_name.toLowerCase().includes(q); }
  function dotFinalOpacity(b: PlotBrand) {
    const base = dotOpacity(b);
    if (!q) return base;
    return isMatch(b) ? Math.max(base, 0.9) : 0.12;
  }

  // ── Summary stats ──────────────────────────────────────────────────────────

  const userPrice = yourBrand?.avg_price ?? (workspace?.brand_price_range
    ? Math.round(((workspace.brand_price_range.min ?? 0) + (workspace.brand_price_range.max ?? 0)) / 2)
    : null);

  const allSorted = [...allBrands].sort((a, b) => a.avg_price - b.avg_price);
  const userZone = userPrice ? getPriceZone(userPrice) : null;
  const brandsInUserZone = userZone ? allBrands.filter(b => getPriceZone(b.avg_price) === userZone).length : 0;
  const rankByPrice = userPrice
    ? allSorted.findIndex(b => b.avg_price >= userPrice) + 1
    : null;
  const pctByPrice = rankByPrice ? Math.round((rankByPrice / allSorted.length) * 100) : null;
  const watchlistPrices = allBrands.filter(b => b.isWatchlist).map(b => b.avg_price);
  const nearestGap = userPrice && watchlistPrices.length
    ? Math.min(...watchlistPrices.map(p => Math.abs(p - userPrice)))
    : null;

  // ── Table ──────────────────────────────────────────────────────────────────

  const tableData = useMemo(() => {
    return [...visibleBrands, ...(yourBrand && activeZones.has(getPriceZone(yourBrand.avg_price)) ? [yourBrand] : [])]
      .sort((a, b) => {
        const av = a[sortKey], bv = b[sortKey];
        if (typeof av === 'string' && typeof bv === 'string')
          return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
      });
  }, [visibleBrands, yourBrand, activeZones, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  // ── Tick helpers ────────────────────────────────────────────────────────────

  function priceTicks(): number[] {
    const step = maxP <= 600 ? 100 : maxP <= 1500 ? 250 : maxP <= 3000 ? 500 : 1000;
    const ticks: number[] = [];
    let v = Math.ceil(minP / step) * step;
    while (v <= maxP) { ticks.push(v); v += step; }
    return ticks;
  }
  function volTicks(): number[] {
    const step = maxV <= 5000 ? 1000 : maxV <= 15000 ? 2500 : 5000;
    const ticks: number[] = [];
    let v = 0;
    while (v <= maxV) { ticks.push(v); v += step; }
    return ticks;
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const card: CSSProperties = { background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 20, marginBottom: 20 };
  const thStyle: CSSProperties = {
    padding: '9px 12px', fontSize: 11, fontWeight: 700, color: C.t2,
    textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
    cursor: 'pointer', userSelect: 'none', borderBottom: `1px solid ${C.bd}`,
    background: C.s2, whiteSpace: 'nowrap',
  };
  const tdStyle: CSSProperties = {
    padding: '9px 12px', fontSize: 13, color: C.tx,
    borderBottom: `1px solid ${C.bd}`, verticalAlign: 'middle',
  };

  const filterBtn = (active: boolean): CSSProperties => ({
    padding: '5px 13px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    border: `1px solid ${active ? C.ac : C.bd}`,
    background: active ? `${C.ac}22` : 'transparent',
    color: active ? C.ac : C.t2,
    cursor: 'pointer',
  });

  const ZONE_COLORS: Record<string, string> = {
    entry: '#22c55e', mid: '#3b82f6', premium: '#8b5cf6', luxury: '#f59e0b',
  };
  const GROUP_LABEL: Record<string, string> = { D: 'D', C: 'C', B: 'B' };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: isMobile ? '16px 12px' : '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />

        <div style={{ marginBottom: isMobile ? 16 : 24 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
            {t(T.ci.landscape, lang)}
          </h1>
          <p style={{ color: C.t2, fontSize: 14, margin: 0 }}>
            {t(T.ci.landscapeSubtitle, lang)}
          </p>
        </div>

        {/* Banner when user has no competitors yet */}
        {userCompetitors.length === 0 && (
          <div style={{
            background: `${C.ac}10`, border: `1px solid ${C.ac}33`,
            borderRadius: 10, padding: '12px 18px', marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.t2,
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', display: 'inline-block', flexShrink: 0 }} />
            <span>
              {lang === 'zh'
                ? '在「设置」中添加竞品后，您的竞品将以红点显示在图上。'
                : 'Your competitors will appear as red dots after you add them in Settings.'}
            </span>
            <a href="/ci/settings" style={{ color: C.ac, fontWeight: 600, textDecoration: 'none', marginLeft: 'auto', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {lang === 'zh' ? '前往设置 →' : 'Go to Settings →'}
            </a>
          </div>
        )}

        {/* Summary stats — stack vertically on mobile */}
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 10 : 16, marginBottom: isMobile ? 14 : 20 }}>
          <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ac }}>
              {userZone ? `${brandsInUserZone}` : '—'}
            </div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
              {t(T.ci.marketDensity, lang)}
              {userZone ? ` · ${userZone}` : ''}
            </div>
          </div>
          <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ac }}>
              {pctByPrice !== null ? `Top ${pctByPrice}%` : '—'}
            </div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
              {t(T.ci.yourPosition, lang)} {t(T.ci.topByPrice, lang)}
            </div>
          </div>
          <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10, padding: '14px 18px', flex: 1, minWidth: 160 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: C.ac }}>
              {nearestGap !== null ? `¥${nearestGap}` : '—'}
            </div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 4 }}>
              {t(T.ci.priceGap, lang)}
            </div>
          </div>
        </div>

        {/* Filters */}
        <div style={{ ...card, padding: '14px 20px' }}>
          <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: isMobile ? 10 : 16, alignItems: isMobile ? 'stretch' : 'center' }}>
            {/* Price zone toggles — row 1 on mobile */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: C.t3 }}>{t(T.ci.priceSegment, lang)}:</span>
              {PRICE_ZONES.map(z => (
                <button key={z.key} style={filterBtn(activeZones.has(z.key))} onClick={() => toggleZone(z.key)}>
                  {t(T.ci[z.labelKey], lang)}
                </button>
              ))}
            </div>

            {/* Group toggles — row 2 on mobile */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: C.t3 }}>{t(T.ci.allGroups, lang)}:</span>
              {['D', 'C', 'B'].map(g => (
                <button key={g} style={filterBtn(activeGroups.has(g))} onClick={() => toggleGroup(g)}>
                  {GROUP_LABEL[g]}
                </button>
              ))}
            </div>

            {/* Search — full width below on mobile */}
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t(T.ci.searchBrand, lang)}
              style={{
                background: C.inputBg, border: `1px solid ${C.inputBd}`, borderRadius: 8,
                padding: '6px 12px', color: C.tx, fontSize: 13, outline: 'none',
                width: isMobile ? '100%' : 180,
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        {/* Scatter plot */}
        <div style={card}>
          <div style={{ overflowX: 'auto', minHeight: isMobile ? 300 : undefined }}>
            <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ display: 'block', minWidth: 480 }}>

              {/* Price zone bands */}
              {(() => {
                const zones = [
                  { lo: 0, hi: 200, color: '#22c55e', labelKey: 'entry' as const },
                  { lo: 200, hi: 500, color: '#3b82f6', labelKey: 'midRange' as const },
                  { lo: 500, hi: 1000, color: '#8b5cf6', labelKey: 'premium' as const },
                  { lo: 1000, hi: Infinity, color: '#f59e0b', labelKey: 'luxury' as const },
                ];
                return zones.map(z => {
                  const x1 = zoneX(Math.max(minP, z.lo));
                  const x2 = zoneX(Math.min(maxP, z.hi === Infinity ? maxP : z.hi));
                  if (x2 <= x1) return null;
                  const w = x2 - x1;
                  return (
                    <g key={z.labelKey}>
                      <rect x={x1} y={PAD_T} width={w} height={CHART_H} fill={z.color} opacity={0.04} />
                      {!isMobile && (
                        <text x={x1 + w / 2} y={PAD_T - 6} textAnchor="middle" fill={C.t3} fontSize={9}>
                          {t(T.ci[z.labelKey], lang)}
                        </text>
                      )}
                    </g>
                  );
                });
              })()}

              {/* Grid lines */}
              {priceTicks().map(p => (
                <line key={`pg-${p}`} x1={scaleX(p)} y1={PAD_T} x2={scaleX(p)} y2={PAD_T + CHART_H}
                  stroke={C.bd} strokeWidth={0.4} strokeDasharray="3,3" opacity={0.4} />
              ))}
              {volTicks().map(v => (
                <line key={`vg-${v}`} x1={PAD_L} y1={scaleY(v)} x2={PAD_L + CHART_W} y2={scaleY(v)}
                  stroke={C.bd} strokeWidth={0.4} strokeDasharray="3,3" opacity={0.4} />
              ))}

              {/* Price zone dividers */}
              {zoneBreaks.slice(1).map(p => {
                if (p < minP || p > maxP) return null;
                return <line key={`zd-${p}`} x1={zoneX(p)} y1={PAD_T} x2={zoneX(p)} y2={PAD_T + CHART_H}
                  stroke={C.bd} strokeWidth={1} opacity={0.25} />;
              })}

              {/* Axes */}
              <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CHART_H} stroke={C.bd} strokeWidth={1} />
              <line x1={PAD_L} y1={PAD_T + CHART_H} x2={PAD_L + CHART_W} y2={PAD_T + CHART_H} stroke={C.bd} strokeWidth={1} />

              {/* X-axis ticks */}
              {priceTicks().map(p => (
                <text key={`pt-${p}`} x={scaleX(p)} y={PAD_T + CHART_H + 14} textAnchor="middle" fill={C.t2} fontSize={9}>
                  ¥{p >= 1000 ? `${p / 1000}k` : p}
                </text>
              ))}

              {/* Y-axis ticks */}
              {volTicks().map(v => (
                <text key={`vt-${v}`} x={PAD_L - 6} y={scaleY(v) + 4} textAnchor="end" fill={C.t2} fontSize={9}>
                  {fmtVol(v)}
                </text>
              ))}

              {/* Axis labels */}
              <text x={PAD_L + CHART_W / 2} y={VB_H - 4} textAnchor="middle" fill={C.t2} fontSize={10}>
                {t(T.ci.avgPrice, lang)} (¥) →
              </text>
              <text x={12} y={PAD_T + CHART_H / 2} textAnchor="middle" fill={C.t2} fontSize={10}
                transform={`rotate(-90, 12, ${PAD_T + CHART_H / 2})`}>
                {t(T.ci.estVolume, lang)} →
              </text>

              {/* Dots — render D (gray/faded) first, then C/B, then watchlist on top */}
              {(['D', 'C', 'B'] as const).map(grp =>
                visibleBrands
                  .filter(b => b.group === grp && !b.isWatchlist)
                  .map(b => {
                    const bx = scaleX(b.avg_price);
                    const by = scaleY(b.est_monthly_volume);
                    const r = dotR(b);
                    const color = dotColor(b);
                    const opacity = dotFinalOpacity(b);
                    const isH = hoveredBrand === b.brand_name;
                    const tipRight = bx + r + 4 + 160 > PAD_L + CHART_W;
                    const tipX = tipRight ? bx - r - 170 : bx + r + 6;
                    const tipY = Math.min(by - 10, PAD_T + CHART_H - 80);

                    return (
                      <g key={b.brand_name}
                        onMouseEnter={() => setHoveredBrand(b.brand_name)}
                        onMouseLeave={() => setHoveredBrand(null)}
                        style={{ cursor: 'pointer' }}
                        opacity={opacity}
                      >
                        <circle cx={bx} cy={by} r={isH ? r + 2 : r}
                          fill={color} stroke={color} strokeWidth={isH ? 2 : 1} fillOpacity={0.65} />
                        {isH && <circle cx={bx} cy={by} r={r + 6} fill="none" stroke={color} strokeWidth={1} opacity={0.3} />}
                        {(isH || q) && isMatch(b) && (
                          <text x={bx} y={by + r + 11} textAnchor="middle" fill={C.tx} fontSize={9} fontWeight={600}
                            style={{ pointerEvents: 'none' }}>
                            {b.brand_name}
                          </text>
                        )}
                        {isH && (
                          <g style={{ pointerEvents: 'none' }}>
                            <rect x={tipX} y={tipY} width={162} height={72} rx={5} fill={C.s1} stroke={color} strokeWidth={1} />
                            <text x={tipX + 10} y={tipY + 16} fill={C.tx} fontSize={11} fontWeight={700}>{b.brand_name}</text>
                            <text x={tipX + 10} y={tipY + 31} fill={C.t2} fontSize={10}>¥{b.avg_price} · {fmtVol(b.est_monthly_volume)}/mo</text>
                            <text x={tipX + 10} y={tipY + 46} fill={C.t2} fontSize={10}>{b.positioning}</text>
                            <text x={tipX + 10} y={tipY + 61} fill={color} fontSize={10} fontWeight={600}>
                              {b.group === 'D' ? t(T.ci.international, lang) : b.group === 'C' ? t(T.ci.valueChallengers, lang) : t(T.ci.risingDomestic, lang)}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })
              )}

              {/* Watchlist dots on top */}
              {visibleBrands.filter(b => b.isWatchlist).map(b => {
                const bx = scaleX(b.avg_price);
                const by = scaleY(b.est_monthly_volume);
                const r = dotR(b);
                const color = dotColor(b);
                const isH = hoveredBrand === b.brand_name;
                const tipRight = bx + r + 4 + 160 > PAD_L + CHART_W;
                const tipX = tipRight ? bx - r - 170 : bx + r + 6;
                const tipY = Math.min(by - 10, PAD_T + CHART_H - 80);
                const opacity = dotFinalOpacity(b);

                return (
                  <g key={`wl-${b.brand_name}`}
                    onMouseEnter={() => setHoveredBrand(b.brand_name)}
                    onMouseLeave={() => setHoveredBrand(null)}
                    style={{ cursor: 'pointer' }}
                    opacity={opacity}
                  >
                    <circle cx={bx} cy={by} r={isH ? r + 2 : r}
                      fill={color} stroke={color} strokeWidth={2} fillOpacity={0.8} />
                    {isH && <circle cx={bx} cy={by} r={r + 7} fill="none" stroke={color} strokeWidth={1.5} opacity={0.3} />}
                    <text x={bx} y={by + r + 12} textAnchor="middle" fill={C.tx} fontSize={9} fontWeight={700}
                      style={{ pointerEvents: 'none' }}>
                      {b.brand_name}
                    </text>
                    {isH && (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={tipX} y={tipY} width={162} height={80} rx={5} fill={C.s1} stroke={color} strokeWidth={1} />
                        <text x={tipX + 10} y={tipY + 16} fill={C.tx} fontSize={11} fontWeight={700}>{b.brand_name}</text>
                        <text x={tipX + 10} y={tipY + 31} fill={C.t2} fontSize={10}>¥{b.avg_price} · {fmtVol(b.est_monthly_volume)}/mo</text>
                        <text x={tipX + 10} y={tipY + 46} fill={C.t2} fontSize={10}>{b.positioning}</text>
                        <text x={tipX + 10} y={tipY + 61} fill={color} fontSize={10} fontWeight={600}>{t(T.ci.yourWatchlist, lang)}</text>
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Your brand diamond */}
              {yourBrand && (() => {
                const bx = scaleX(yourBrand.avg_price);
                const by = scaleY(yourBrand.est_monthly_volume);
                const s = 13;
                const isH = hoveredBrand === yourBrand.brand_name;
                return (
                  <g onMouseEnter={() => setHoveredBrand(yourBrand.brand_name)}
                    onMouseLeave={() => setHoveredBrand(null)}
                    style={{ cursor: 'pointer' }}>
                    <polygon
                      points={`${bx},${by - s} ${bx + s},${by} ${bx},${by + s} ${bx - s},${by}`}
                      fill={isH ? `${C.ac}33` : 'none'} stroke={C.ac} strokeWidth={2.5} />
                    <text x={bx} y={by + s + 12} textAnchor="middle" fill={C.ac} fontSize={9} fontWeight={700}>
                      {yourBrand.brand_name}
                    </text>
                    {isH && (
                      <g style={{ pointerEvents: 'none' }}>
                        <rect x={bx + s + 4} y={by - 30} width={162} height={62} rx={5} fill={C.s1} stroke={C.ac} strokeWidth={1} />
                        <text x={bx + s + 14} y={by - 14} fill={C.tx} fontSize={11} fontWeight={700}>{yourBrand.brand_name}</text>
                        <text x={bx + s + 14} y={by + 1} fill={C.t2} fontSize={10}>¥{yourBrand.avg_price} (avg range)</text>
                        <text x={bx + s + 14} y={by + 16} fill={C.ac} fontSize={10} fontWeight={600}>{t(T.ci.yourBrand, lang)}</text>
                      </g>
                    )}
                  </g>
                );
              })()}
            </svg>
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 20, marginTop: 16, flexWrap: 'wrap', borderTop: `1px solid ${C.bd}`, paddingTop: 14 }}>
            {[
              { shape: 'circle', color: C.t3, r: 5, opacity: 0.4, label: t(T.ci.international, lang) },
              { shape: 'circle', color: '#f59e0b', r: 7, opacity: 0.7, label: t(T.ci.valueChallengers, lang) },
              { shape: 'circle', color: C.ac, r: 7, opacity: 0.7, label: t(T.ci.risingDomestic, lang) },
              { shape: 'circle', color: C.danger, r: 10, opacity: 1, label: t(T.ci.yourWatchlist, lang) },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.t2 }}>
                <svg width={item.r * 2 + 2} height={item.r * 2 + 2}>
                  <circle cx={item.r + 1} cy={item.r + 1} r={item.r}
                    fill={item.color} fillOpacity={item.opacity} stroke={item.color} strokeWidth={1} />
                </svg>
                {item.label}
              </div>
            ))}
            {yourBrand && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.t2 }}>
                <svg width={18} height={18}>
                  <polygon points="9,1 17,9 9,17 1,9" fill="none" stroke={C.ac} strokeWidth={2} />
                </svg>
                {t(T.ci.yourBrand, lang)}
              </div>
            )}
          </div>
        </div>

        {/* Brand positioning table */}
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${C.bd}` }}>
            {lang === 'zh' ? '品牌定位表' : 'Brand Positioning Table'}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {([
                    ['brand_name', lang === 'zh' ? '品牌' : 'Brand'],
                    ['avg_price', t(T.ci.avgPrice, lang)],
                    ...(!isMobile ? [['est_monthly_volume', t(T.ci.estVolume, lang)]] as [SortKey, string][] : []),
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th key={key} style={thStyle} onClick={() => handleSort(key)}>
                      {label} {sortKey === key ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                    </th>
                  ))}
                  {!isMobile && <th style={{ ...thStyle, cursor: 'default' }}>{t(T.ci.priceSegment, lang)}</th>}
                  <th style={{ ...thStyle, cursor: 'default' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {tableData.map((b, i) => {
                  const zone = getPriceZone(b.avg_price);
                  const zoneColor = ZONE_COLORS[zone];
                  const isTracked = b.isWatchlist || watchlistNames.has(b.brand_name);
                  return (
                    <tr key={`${b.brand_name}-${i}`} style={{ background: i % 2 === 0 ? 'transparent' : `${C.s2}55` }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{b.brand_name}</div>
                        <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
                          {!b.isYourBrand && (
                            <span style={{
                              fontSize: 10, padding: '1px 6px', borderRadius: 4,
                              background: b.group === 'D' ? `${C.t3}22` : b.group === 'C' ? '#f59e0b22' : `${C.ac}22`,
                              color: b.group === 'D' ? C.t3 : b.group === 'C' ? '#f59e0b' : C.ac,
                              border: `1px solid ${b.group === 'D' ? C.bd : b.group === 'C' ? '#f59e0b' : C.ac}`,
                              fontWeight: 600,
                            }}>
                              Group {b.group}
                            </span>
                          )}
                          {b.positioning && <span style={{ fontSize: 11, color: C.t3 }}>{b.positioning}</span>}
                        </div>
                      </td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>¥{b.avg_price.toLocaleString()}</td>
                      {!isMobile && <td style={tdStyle}>{b.est_monthly_volume.toLocaleString()}/mo</td>}
                      {!isMobile && (
                        <td style={tdStyle}>
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                            background: `${zoneColor}22`, color: zoneColor, border: `1px solid ${zoneColor}55`,
                          }}>
                            {t(T.ci[PRICE_ZONES.find(z => z.key === zone)!.labelKey], lang)}
                          </span>
                        </td>
                      )}
                      <td style={tdStyle}>
                        {b.isYourBrand ? (
                          <span style={{ fontSize: 11, color: C.ac, fontWeight: 600 }}>{t(T.ci.yourBrand, lang)}</span>
                        ) : isTracked ? (
                          <span style={{ fontSize: 11, color: C.danger, fontWeight: 600 }}>{t(T.ci.tracking, lang)}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
