import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import { useCIData } from '../../hooks/useCIData';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrandScore {
  brand_name: string;
  group: string;
  momentum_score: number;
  threat_index: number;
  wtp_score: number;
  trend_signals: string[];
  tier: 'watchlist' | 'landscape';
}

interface ActionItem {
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  dept?: string;
}

interface LocalDashboardData {
  narrative: string;
  last_updated: string;
  brands: BrandScore[];
  action_items: ActionItem[];
}

// ── Demo data (always-available fallback) ─────────────────────────────────────

const DEMO_DATA: LocalDashboardData = {
  narrative: 'This is demo data. Add competitors in Settings to see your competitive landscape.',
  last_updated: new Date().toISOString(),
  brands: [
    { brand_name: 'Competitor A', group: 'C', momentum_score: 72, threat_index: 65, wtp_score: 58, trend_signals: ['内容矩阵扩张', '价格策略调整'], tier: 'watchlist' },
    { brand_name: 'Competitor B', group: 'C', momentum_score: 45, threat_index: 80, wtp_score: 71, trend_signals: ['直播销量增长'], tier: 'watchlist' },
    { brand_name: 'Competitor C', group: 'B', momentum_score: 88, threat_index: 42, wtp_score: 65, trend_signals: ['KOL合作增加', '新品发布'], tier: 'watchlist' },
  ],
  action_items: [
    { title: 'Monitor Competitor B pricing', description: "Competitor B's threat index is high — review their pricing strategy", dept: '电商部', priority: 'high' },
    { title: 'Analyze Competitor C content', description: "Competitor C shows strong momentum — study their XHS content strategy", dept: '品牌部', priority: 'medium' },
  ],
};

// ── Chart helpers ─────────────────────────────────────────────────────────────

// Chart area: x in [60, 660], y in [20, 380] for a 680×420 viewBox
const CHART_LEFT = 60;
const CHART_RIGHT = 660;
const CHART_TOP = 20;
const CHART_BOTTOM = 380;
const CHART_W = CHART_RIGHT - CHART_LEFT;
const CHART_H = CHART_BOTTOM - CHART_TOP;

function cx(threatIndex: number) { return CHART_LEFT + (threatIndex / 100) * CHART_W; }
function cy(momentumScore: number) { return CHART_BOTTOM - (momentumScore / 100) * CHART_H; }
function bubbleR(wtpScore: number) { return 16 + (wtpScore / 100) * 20; }

function bubbleColor(b: BrandScore, C: Record<string, string>): string {
  const hi = b.momentum_score >= 50;
  const ht = b.threat_index >= 50;
  if (hi && ht) return C.danger;
  if (hi && !ht) return C.ac;
  if (!hi && ht) return '#f59e0b';
  return C.t3;
}

type SortKey = 'brand_name' | 'momentum_score' | 'threat_index' | 'wtp_score';
type SortDir = 'asc' | 'desc';

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, C }: { value: number; C: Record<string, string> }) {
  const color = value >= 70 ? C.danger : value >= 40 ? '#f59e0b' : C.success;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: C.bd, borderRadius: 3, overflow: 'hidden', minWidth: 48 }}>
        <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 28 }}>{value}</span>
    </div>
  );
}

// ── Quick stat card ────────────────────────────────────────────────────────────

function StatCard({ label, value, C }: { label: string; value: string | number; C: Record<string, string> }) {
  return (
    <div style={{
      background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
      padding: '16px 20px', flex: 1, minWidth: 140,
    }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.ac, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.t2, marginTop: 6 }}>{label}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CIDashboard() {
  const { colors: C, lang } = useApp();
  const { dashboard, source: ciSource, workspace, competitors, connections } = useCIData();

  const [hoveredBubble, setHoveredBubble] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('threat_index');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Enrich dashboard brands with tier from competitors list
  const data: LocalDashboardData = useMemo(() => {
    if (!dashboard) return DEMO_DATA;
    return {
      ...dashboard,
      action_items: dashboard.action_items.map(a => ({ ...a, dept: a.dept ?? '' })),
      brands: dashboard.brands.map(b => {
        const comp = competitors.find(c => c.brand_name === b.brand_name);
        return { ...b, tier: comp?.tier ?? 'watchlist' } as BrandScore;
      }),
    };
  }, [dashboard, competitors]);

  const source = ciSource === 'api' ? 'live' : ciSource;
  const connectedCount = connections.filter(c => c.status === 'active').length;

  // Quick stats
  const watchlistBrands = data.brands.filter(b => b.tier === 'watchlist');
  const avgThreat = watchlistBrands.length
    ? Math.round(watchlistBrands.reduce((s, b) => s + b.threat_index, 0) / watchlistBrands.length)
    : 0;
  const highestMomBrand = data.brands.length
    ? [...data.brands].sort((a, b) => b.momentum_score - a.momentum_score)[0]
    : null;

  // Your brand simulated position (center-ish)
  const yourBrandX = cx(40);
  const yourBrandY = cy(55);

  // Sorting
  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }
  const sortedBrands = [...data.brands].sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    if (typeof av === 'string' && typeof bv === 'string')
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
  });

  // Styles
  const card: CSSProperties = { background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 24, marginBottom: 24 };
  const sectionTitle: CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${C.bd}` };
  const thStyle: CSSProperties = {
    padding: '10px 12px', fontSize: 11, fontWeight: 700, color: C.t2,
    textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
    cursor: 'pointer', userSelect: 'none', borderBottom: `1px solid ${C.bd}`,
    background: C.s2, whiteSpace: 'nowrap',
  };
  const tdStyle: CSSProperties = {
    padding: '10px 12px', fontSize: 13, color: C.tx,
    borderBottom: `1px solid ${C.bd}`, verticalAlign: 'middle',
  };

  const bannerText = source === 'live'
    ? t(T.ci.dataSource, lang)
    : source === 'local'
    ? t(T.ci.localData, lang)
    : t(T.ci.demoHint, lang);
  const bannerColor = source === 'live' ? C.success : source === 'local' ? C.ac : C.t3;

  // Quadrant label positions
  const midX = (CHART_LEFT + CHART_RIGHT) / 2;
  const midY = (CHART_TOP + CHART_BOTTOM) / 2;

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
            {t(T.ci.title, lang)}
          </h1>
          <p style={{ color: C.t2, fontSize: 14, margin: 0 }}>{t(T.ci.subtitle, lang)}</p>
        </div>

        {/* Status banner */}
        <div style={{
          background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
          padding: '10px 20px', marginBottom: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontSize: 13, color: C.t2,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: bannerColor, display: 'inline-block' }} />
            <span>{bannerText}</span>
          </div>
          <span>{t(T.ci.lastUpdated, lang)}: {new Date(data.last_updated).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</span>
        </div>

        {/* Quick stats row */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
          <StatCard label={t(T.ci.competitorsTracked, lang)} value={data.brands.length} C={C as unknown as Record<string, string>} />
          <StatCard label={t(T.ci.avgThreat, lang)} value={avgThreat} C={C as unknown as Record<string, string>} />
          <StatCard label={t(T.ci.highestMomentum, lang)} value={highestMomBrand?.brand_name ?? '—'} C={C as unknown as Record<string, string>} />
          <StatCard label={t(T.ci.platformsConnected, lang)} value={`${connectedCount}/3`} C={C as unknown as Record<string, string>} />
        </div>

        {/* Empty state */}
        {source === 'demo' && (
          <div style={{ ...card, textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
            <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
              {t(T.ci.noCompetitors, lang)}
            </p>
            <Link to="/ci/settings" style={{
              display: 'inline-block', background: C.ac, color: '#fff',
              padding: '10px 24px', borderRadius: 8, fontSize: 14, fontWeight: 600,
              textDecoration: 'none', marginTop: 8,
            }}>
              {t(T.ci.goToSettings, lang)}
            </Link>
          </div>
        )}

        {/* Bubble chart */}
        {data.brands.length > 0 && (
          <div style={card}>
            <div style={sectionTitle}>
              {lang === 'zh' ? '竞品态势图' : 'Competitive Landscape'}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 20, marginBottom: 16, flexWrap: 'wrap' }}>
              {[
                { color: C.danger, label: t(T.ci.highPriority, lang) },
                { color: C.ac, label: t(T.ci.risingFast, lang) },
                { color: '#f59e0b', label: t(T.ci.nicheThreat, lang) },
                { color: C.t3, label: t(T.ci.lowActivity, lang) },
              ].map(({ color, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.t2 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                  {label}
                </div>
              ))}
              {workspace?.brand_name && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.t2 }}>
                  <div style={{ width: 10, height: 10, background: 'none', border: `2px solid ${C.ac}`, transform: 'rotate(45deg)' }} />
                  {workspace.brand_name} (you)
                </div>
              )}
            </div>

            <div style={{ overflowX: 'auto' }}>
              <svg viewBox="0 0 700 420" width="100%" style={{ display: 'block' }}>

                {/* Quadrant backgrounds */}
                <rect x={CHART_LEFT} y={CHART_TOP} width={CHART_W / 2} height={CHART_H / 2} fill={C.ac} opacity={0.04} />
                <rect x={midX} y={CHART_TOP} width={CHART_W / 2} height={CHART_H / 2} fill={C.danger} opacity={0.04} />
                <rect x={CHART_LEFT} y={midY} width={CHART_W / 2} height={CHART_H / 2} fill={C.t3} opacity={0.04} />
                <rect x={midX} y={midY} width={CHART_W / 2} height={CHART_H / 2} fill="#f59e0b" opacity={0.04} />

                {/* Grid lines */}
                {[25, 50, 75].map(v => (
                  <g key={v}>
                    <line x1={cx(v)} y1={CHART_TOP} x2={cx(v)} y2={CHART_BOTTOM}
                      stroke={C.bd} strokeWidth={v === 50 ? 1 : 0.5} strokeDasharray={v === 50 ? undefined : '4,4'} opacity={v === 50 ? 0.5 : 0.3} />
                    <line x1={CHART_LEFT} y1={cy(v)} x2={CHART_RIGHT} y2={cy(v)}
                      stroke={C.bd} strokeWidth={v === 50 ? 1 : 0.5} strokeDasharray={v === 50 ? undefined : '4,4'} opacity={v === 50 ? 0.5 : 0.3} />
                  </g>
                ))}

                {/* Axes */}
                <line x1={CHART_LEFT} y1={CHART_TOP} x2={CHART_LEFT} y2={CHART_BOTTOM} stroke={C.bd} strokeWidth={1} />
                <line x1={CHART_LEFT} y1={CHART_BOTTOM} x2={CHART_RIGHT} y2={CHART_BOTTOM} stroke={C.bd} strokeWidth={1} />

                {/* Tick labels */}
                {[0, 25, 50, 75, 100].map(v => (
                  <g key={v}>
                    <text x={cx(v)} y={CHART_BOTTOM + 16} textAnchor="middle" fill={C.t2} fontSize={9}>{v}</text>
                    <text x={CHART_LEFT - 6} y={cy(v) + 4} textAnchor="end" fill={C.t2} fontSize={9}>{v}</text>
                  </g>
                ))}

                {/* Axis labels */}
                <text x={(CHART_LEFT + CHART_RIGHT) / 2} y={414} textAnchor="middle" fill={C.t2} fontSize={11}>
                  {t(T.ci.threat, lang)} →
                </text>
                <text x={14} y={(CHART_TOP + CHART_BOTTOM) / 2} textAnchor="middle" fill={C.t2} fontSize={11}
                  transform={`rotate(-90, 14, ${(CHART_TOP + CHART_BOTTOM) / 2})`}>
                  {t(T.ci.momentum, lang)} →
                </text>

                {/* Quadrant labels */}
                <text x={(CHART_LEFT + midX) / 2} y={CHART_TOP + 14} textAnchor="middle" fill={C.t3} fontSize={9}>{t(T.ci.risingFast, lang)}</text>
                <text x={(midX + CHART_RIGHT) / 2} y={CHART_TOP + 14} textAnchor="middle" fill={C.t3} fontSize={9}>{t(T.ci.highPriority, lang)}</text>
                <text x={(CHART_LEFT + midX) / 2} y={CHART_BOTTOM - 8} textAnchor="middle" fill={C.t3} fontSize={9}>{t(T.ci.lowActivity, lang)}</text>
                <text x={(midX + CHART_RIGHT) / 2} y={CHART_BOTTOM - 8} textAnchor="middle" fill={C.t3} fontSize={9}>{t(T.ci.nicheThreat, lang)}</text>

                {/* Your brand marker (diamond) */}
                {workspace?.brand_name && (
                  <g>
                    <polygon
                      points={`${yourBrandX},${yourBrandY - 10} ${yourBrandX + 10},${yourBrandY} ${yourBrandX},${yourBrandY + 10} ${yourBrandX - 10},${yourBrandY}`}
                      fill="none" stroke={C.ac} strokeWidth={2}
                    />
                    <text x={yourBrandX} y={yourBrandY + 22} textAnchor="middle" fill={C.ac} fontSize={9} fontWeight={700}>
                      {workspace.brand_name}
                    </text>
                  </g>
                )}

                {/* Competitor bubbles */}
                {data.brands.map((brand, i) => {
                  const bx = cx(brand.threat_index);
                  const by = cy(brand.momentum_score);
                  const r = bubbleR(brand.wtp_score);
                  const color = bubbleColor(brand, C as unknown as Record<string, string>);
                  const isHovered = hoveredBubble === i;
                  const tipX = bx + r + 4 + 168 > CHART_RIGHT ? bx - r - 172 : bx + r + 4;

                  return (
                    <g key={`${brand.brand_name}-${i}`}
                      onMouseEnter={() => setHoveredBubble(i)}
                      onMouseLeave={() => setHoveredBubble(null)}
                      style={{ cursor: 'pointer' }}
                    >
                      <circle
                        cx={bx} cy={by} r={isHovered ? r + 3 : r}
                        fill={color} fillOpacity={isHovered ? 0.85 : 0.6}
                        stroke={color} strokeWidth={isHovered ? 2 : 1}
                      />
                      <text x={bx} y={by + r + 13} textAnchor="middle" fill={C.tx}
                        fontSize={isHovered ? 11 : 9} fontWeight={isHovered ? 700 : 400}>
                        {brand.brand_name}
                      </text>

                      {isHovered && (
                        <g>
                          <rect x={tipX} y={by - 42} width={168} height={82} rx={5} ry={5}
                            fill={C.s1} stroke={color} strokeWidth={1} />
                          <text x={tipX + 10} y={by - 25} fill={C.tx} fontSize={11} fontWeight={700}>
                            {brand.brand_name}
                          </text>
                          <text x={tipX + 10} y={by - 10} fill={C.t2} fontSize={10}>
                            {t(T.ci.momentum, lang)}: {brand.momentum_score}
                          </text>
                          <text x={tipX + 10} y={by + 5} fill={C.t2} fontSize={10}>
                            {t(T.ci.threat, lang)}: {brand.threat_index}
                          </text>
                          <text x={tipX + 10} y={by + 20} fill={C.t2} fontSize={10}>
                            {t(T.ci.wtp, lang)}: {brand.wtp_score}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
            <div style={{ fontSize: 11, color: C.t3, marginTop: 8 }}>
              {lang === 'zh'
                ? '气泡大小代表 WTP 评分。悬停查看详情。'
                : 'Bubble size represents WTP score. Hover for details.'}
            </div>
          </div>
        )}

        {/* Rankings table */}
        {data.brands.length > 0 && (
          <div style={card}>
            <div style={sectionTitle}>
              {lang === 'zh' ? '竞品评分排名' : 'Competitor Rankings'}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {([
                      ['brand_name', lang === 'zh' ? '品牌' : 'Brand'],
                      ['momentum_score', t(T.ci.momentum, lang)],
                      ['threat_index', t(T.ci.threat, lang)],
                      ['wtp_score', t(T.ci.wtp, lang)],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key} style={thStyle} onClick={() => handleSort(key)}>
                        {label} {sortKey === key ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
                      </th>
                    ))}
                    <th style={{ ...thStyle, cursor: 'default' }}>
                      {lang === 'zh' ? '信号' : 'Signals'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBrands.map((brand, i) => (
                    <tr key={`${brand.brand_name}-${i}`}
                      style={{ background: i % 2 === 0 ? 'transparent' : `${C.s2}55` }}>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 600 }}>{brand.brand_name}</div>
                        <span style={{
                          fontSize: 10, padding: '1px 7px', borderRadius: 4, fontWeight: 600,
                          background: brand.tier === 'watchlist' ? `${C.ac}22` : C.s2,
                          color: brand.tier === 'watchlist' ? C.ac : C.t2,
                          border: `1px solid ${brand.tier === 'watchlist' ? C.ac : C.bd}`,
                        }}>
                          {brand.tier === 'watchlist' ? t(T.ci.watchlist, lang) : t(T.ci.landscapeTier, lang)}
                        </span>
                      </td>
                      <td style={tdStyle}>
                        <ScoreBar value={brand.momentum_score} C={C as unknown as Record<string, string>} />
                      </td>
                      <td style={tdStyle}>
                        <ScoreBar value={brand.threat_index} C={C as unknown as Record<string, string>} />
                      </td>
                      <td style={tdStyle}>
                        <ScoreBar value={brand.wtp_score} C={C as unknown as Record<string, string>} />
                      </td>
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {brand.trend_signals.slice(0, 3).map((sig, j) => (
                            <span key={j} style={{
                              fontSize: 11, background: C.s2, border: `1px solid ${C.bd}`,
                              borderRadius: 4, padding: '2px 6px', color: C.t2, whiteSpace: 'nowrap',
                            }}>{sig}</span>
                          ))}
                          {brand.trend_signals.length === 0 && <span style={{ fontSize: 11, color: C.t3 }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Action items */}
        {data.action_items.length > 0 && (
          <div style={card}>
            <div style={sectionTitle}>
              {lang === 'zh' ? '行动建议' : 'Action Items'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {data.action_items.map((item, i) => {
                const pColor = item.priority === 'high' ? C.danger : item.priority === 'medium' ? C.ac : C.t2;
                return (
                  <div key={i} style={{
                    display: 'flex', gap: 14, padding: '14px 16px',
                    background: C.s2, borderRadius: 8, border: `1px solid ${C.bd}`,
                    borderLeft: `3px solid ${pColor}`,
                  }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: pColor,
                        background: `${pColor}18`, border: `1px solid ${pColor}44`,
                        borderRadius: 4, padding: '2px 8px',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                      }}>
                        {item.priority}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>{item.description}</div>
                    </div>
                    {item.dept && <span style={{ fontSize: 12, color: C.t3, flexShrink: 0 }}>[{item.dept}]</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
