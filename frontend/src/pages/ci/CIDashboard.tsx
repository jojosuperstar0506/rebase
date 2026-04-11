import { useState, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import { useCIData } from '../../hooks/useCIData';
import { CIDashboardSkeleton } from '../../components/ci/CISkeleton';
import CIWelcomeBanner from '../../components/ci/CIWelcomeBanner';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { exportDashboardCSV, exportDashboardPDF, showExportToast } from '../../utils/ciExport';
import { MiniTrendChart } from '../../components/ci/CITrendChart';
import CIAlertFeed from '../../components/ci/CIAlertFeed';

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

// ── AI sparkle icon ───────────────────────────────────────────────────────────

const AIIcon = ({ color }: { color: string }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
    <path d="M8 1L9.5 5.5L14 7L9.5 8.5L8 13L6.5 8.5L2 7L6.5 5.5Z" fill={color} />
  </svg>
);

// ── Simulated trend data generator ────────────────────────────────────────────
// NOTE: Generates plausible 30/90-day history ending at current score.
// Will be replaced when TASK-23 builds the real trends API.

function generateTrendData(
  currentScore: number,
  days: number = 30
): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const noise = Math.sin(i * 0.5) * 8 + Math.cos(i * 0.3) * 5;
    const value = Math.max(0, Math.min(100, Math.round(currentScore - i * 0.3 + noise)));
    result.push({ date: date.toISOString().slice(0, 10), value });
  }
  return result;
}

// ── Score bar ─────────────────────────────────────────────────────────────────

function ScoreBar({ value, pending, C }: { value: number; pending?: boolean; C: Record<string, string> }) {
  if (pending || value === 0) {
    return (
      <span style={{ fontSize: 12, color: C.t3, fontWeight: 500, fontStyle: 'italic' }}>—</span>
    );
  }
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
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const {
    dashboard, source: ciSource, workspace, competitors, connections,
    loading, refresh, needsSync, syncToApi,
  } = useCIData();

  const [hoveredBubble, setHoveredBubble] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('threat_index');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);
  const [trendDays, setTrendDays] = useState<30 | 90>(30);

  // Enrich dashboard brands with tier from competitors list
  // TASK-32: Never show DEMO_DATA when workspace/competitors exist. Only use DEMO_DATA for true no-workspace state.
  const data: LocalDashboardData = useMemo(() => {
    // Workspace exists but no API data yet → show local competitor list with pending scores
    if (!dashboard || ciSource === 'demo') {
      if (workspace || competitors.length > 0) {
        // Build from local competitors — pending state (scores will show as 0 = "—")
        const localBrands: BrandScore[] = competitors.map(comp => ({
          brand_name: comp.brand_name,
          group: 'C',
          momentum_score: 0,
          threat_index: 0,
          wtp_score: 0,
          trend_signals: [],
          tier: (comp.tier ?? 'watchlist') as 'watchlist' | 'landscape',
        }));
        return {
          narrative: '',
          last_updated: new Date().toISOString(),
          brands: localBrands,
          action_items: [],
        };
      }
      return DEMO_DATA;
    }
    return {
      ...dashboard,
      action_items: dashboard.action_items.map(a => ({ ...a, dept: a.dept ?? '' })),
      brands: dashboard.brands.map(b => {
        const comp = competitors.find(c => c.brand_name === b.brand_name);
        return { ...b, tier: comp?.tier ?? 'watchlist' } as BrandScore;
      }),
    };
  }, [dashboard, ciSource, competitors, workspace]);

  const source = ciSource; // 'api' | 'local' | 'demo'

  // TASK-32/35: Real scores only when API responded AND scoring pipeline has completed.
  const hasRealScores = source === 'api' && !dashboard?.analysis_pending;

  // Clear analysis_started flag once real data is in
  if (hasRealScores) localStorage.removeItem('rebase_ci_analysis_started');
  const analysisStarted = localStorage.getItem('rebase_ci_analysis_started') === 'true';
  const connectedCount = connections.filter(c => c.status === 'active').length;

  async function handleSync() {
    setSyncing(true);
    await syncToApi();
    setSyncing(false);
    setSyncDone(true);
    setTimeout(() => setSyncDone(false), 3000);
  }

  function handleExportCSV() {
    exportDashboardCSV(data.brands);
    showExportToast(t(T.ci.csvExported, lang), C as unknown as Record<string, string>);
  }

  function handleExportPDF() {
    showExportToast(t(T.ci.openingPrint, lang), C as unknown as Record<string, string>);
    setTimeout(() => exportDashboardPDF(), 400);
  }

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
  const card: CSSProperties = { background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: isMobile ? 14 : 24, marginBottom: isMobile ? 16 : 24 };
  const sectionTitle: CSSProperties = { fontSize: isMobile ? 15 : 15, fontWeight: 700, marginBottom: 16, paddingBottom: 10, borderBottom: `1px solid ${C.bd}` };
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

  const bannerText = source === 'api'
    ? t(T.ci.liveDataFrom, lang)
    : source === 'local'
    ? t(T.ci.localOnly, lang)
    : t(T.ci.demoHint, lang);
  const bannerColor = source === 'api' ? C.success : source === 'local' ? C.ac : C.t3;

  // Quadrant label positions
  const midX = (CHART_LEFT + CHART_RIGHT) / 2;
  const midY = (CHART_TOP + CHART_BOTTOM) / 2;

  if (loading) return <CIDashboardSkeleton />;

  // New user: no workspace AND no competitors — redirect to settings (TASK-32)
  if (!workspace && competitors.length === 0) {
    return <Navigate to="/ci/settings" replace />;
  }

  // Shared export button style
  const exportBtnStyle: CSSProperties = {
    background: 'transparent',
    border: `1px solid ${C.bd}`,
    color: C.t2,
    padding: isMobile ? '8px 12px' : '6px 14px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    minHeight: isMobile ? 44 : 32,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
  };

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: isMobile ? '16px 12px' : '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {/* Sub-nav is outside the print area */}
        <div data-no-print>
          <CISubNav />
        </div>

        {/* Print area — everything inside here is exported to PDF */}
        <div id="ci-print-area">

          {/* Print-only report header (hidden on screen) */}
          <div data-print-only style={{ display: 'none', marginBottom: 20 }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, marginTop: 0 }}>
              {t(T.ci.reportTitle, lang)}
            </h1>
            <p style={{ fontSize: 12, color: '#666', marginBottom: 0 }}>
              {workspace?.brand_name ? `${workspace.brand_name} · ` : ''}{t(T.ci.generatedOn, lang)} {new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')} · Rebase
            </p>
          </div>

          {/* Header */}
          <div style={{ marginBottom: isMobile ? 16 : 24 }}>
            <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
              {t(T.ci.title, lang)}
            </h1>
            <p style={{ color: C.t2, fontSize: 14, margin: 0 }}>{t(T.ci.subtitle, lang)}</p>
          </div>

          {/* First-visit welcome banner (no-print) */}
          <div data-no-print>
            <CIWelcomeBanner />
          </div>

          {/* Sync banner (no-print) */}
          <div data-no-print>
            {needsSync && !syncDone && (
              <div style={{
                background: `${C.ac}15`, border: `1px solid ${C.ac}44`, borderRadius: 10,
                padding: '10px 20px', marginBottom: 12,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: 13,
              }}>
                <span style={{ color: C.t2 }}>{t(T.ci.unsyncedData, lang)}</span>
                <button
                  onClick={handleSync}
                  disabled={syncing}
                  style={{
                    background: C.ac, border: 'none', borderRadius: 6,
                    padding: '5px 14px', color: '#fff', fontSize: 12, fontWeight: 600,
                    cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.7 : 1, flexShrink: 0, marginLeft: 12,
                  }}
                >
                  {syncing ? t(T.ci.syncing, lang) : t(T.ci.syncNow, lang)}
                </button>
              </div>
            )}
            {syncDone && (
              <div style={{
                background: `${C.success}15`, border: `1px solid ${C.success}44`, borderRadius: 10,
                padding: '10px 20px', marginBottom: 12, fontSize: 13, color: C.success,
              }}>
                ✓ {t(T.ci.syncComplete, lang)}
              </div>
            )}
          </div>

          {/* Status banner */}
          <div style={{
            background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
            padding: '10px 20px', marginBottom: 12,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontSize: 13, color: C.t2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: bannerColor, display: 'inline-block', flexShrink: 0 }} />
              <span>{bannerText}</span>
              {source === 'local' && (
                <span style={{ color: C.t3, fontSize: 11 }}>· {lang === 'zh' ? '数据仅保存在本设备' : 'Data saved on this device only'}</span>
              )}
            </div>
            <div data-no-print style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <span style={{ color: C.t3, fontSize: 12 }}>
                {t(T.ci.lastUpdated, lang)}: {new Date(data.last_updated).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
              </span>
              {/* Refresh button — SVG circular arrow */}
              <button
                onClick={() => refresh()}
                title={t(T.ci.refresh, lang)}
                style={{
                  background: 'none', border: `1px solid ${C.bd}`, borderRadius: '50%',
                  width: 28, height: 28, cursor: 'pointer', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', padding: 0, color: C.t2,
                  flexShrink: 0,
                }}
              >
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10" />
                  <polyline points="1 20 1 14 7 14" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </button>
            </div>
          </div>

          {/* Export bar (no-print) */}
          <div data-no-print style={{
            display: 'flex', gap: 8, marginBottom: 24,
            flexWrap: 'wrap' as CSSProperties['flexWrap'],
          }}>
            <button onClick={handleExportCSV} style={exportBtnStyle} title={t(T.ci.exportCSV, lang)}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {t(T.ci.exportCSV, lang)}
            </button>
            <button onClick={handleExportPDF} style={exportBtnStyle} title={t(T.ci.exportPDF, lang)}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
              </svg>
              {t(T.ci.exportPDF, lang)}
            </button>
          </div>

          {/* ── TASK-32 NEW ORDER: AI Analysis + Action Items FIRST ─── */}

          {/* Analysis in progress banner */}
          {analysisStarted && !hasRealScores && (
            <div style={{
              background: `${C.ac}12`, border: `1px solid ${C.ac}44`, borderRadius: 10,
              padding: '12px 20px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: C.t2,
            }}>
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={C.ac} strokeWidth={2.5} strokeLinecap="round" style={{ flexShrink: 0, animation: 'spin 1.5s linear infinite' }}>
                <circle cx={12} cy={12} r={10} strokeDasharray="31.4" strokeDashoffset="10" />
              </svg>
              <span><strong style={{ color: C.ac }}>{t(T.ci.analysisInProgress, lang)}</strong> — {t(T.ci.analysisStartedBanner, lang)}</span>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* AI Strategic Analysis — HERO POSITION (TASK-32) */}
          {(() => {
            const narrative = data.narrative ?? '';
            const TRUNCATE = 200;
            const isLong = narrative.length > TRUNCATE;
            const displayText = isLong && !narrativeExpanded
              ? narrative.slice(0, TRUNCATE).trimEnd() + '…'
              : narrative;

            if (!hasRealScores) {
              // No real data yet — show CTA to run first analysis
              return (
                <div style={{
                  ...card,
                  borderLeft: `3px solid ${C.ac}`,
                  padding: isMobile ? '16px' : '24px',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>✨</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 8 }}>
                    {t(T.ci.aiAnalysis, lang)}
                  </div>
                  <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.7, marginBottom: 16, maxWidth: 460, margin: '0 auto 16px' }}>
                    {t(T.ci.runFirstAnalysis, lang)}
                  </p>
                  <Link to="/ci/settings" style={{
                    display: 'inline-block', background: C.ac, color: '#fff',
                    padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    textDecoration: 'none',
                  }}>
                    {t(T.ci.goToSettings, lang)} →
                  </Link>
                </div>
              );
            }

            return (
              <div style={{
                ...card,
                borderLeft: `3px solid ${C.ac}`,
                padding: isMobile ? '14px 16px' : '20px 24px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AIIcon color={C.ac} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>
                      {t(T.ci.aiAnalysis, lang)}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: C.t3 }}>
                    {new Date(data.last_updated).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                {narrative ? (
                  <>
                    <p style={{ fontSize: 14, color: C.tx, lineHeight: 1.8, margin: 0, marginBottom: isLong ? 12 : 0 }}>
                      {displayText}
                    </p>
                    {isLong && (
                      <button
                        onClick={() => setNarrativeExpanded(e => !e)}
                        style={{ background: 'none', border: 'none', padding: 0, color: C.ac, fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                      >
                        {narrativeExpanded ? t(T.ci.collapse, lang) : t(T.ci.readMore, lang)}
                      </button>
                    )}
                  </>
                ) : (
                  <p style={{ fontSize: 13, color: C.t3, fontStyle: 'italic', margin: 0 }}>
                    {t(T.ci.noAnalysisYet, lang)}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Action Items — HERO POSITION (TASK-32) */}
          {hasRealScores && data.action_items.length > 0 && (
            <div style={card}>
              <div style={sectionTitle}>
                {t(T.ci.actionItems, lang)}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {data.action_items.map((item, i) => {
                  const pColor = item.priority === 'high' ? C.danger : item.priority === 'medium' ? C.ac : C.t2;
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 14, padding: isMobile ? '10px 12px' : '14px 16px',
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

          {/* ── Divider to "Show me the data" section ──────────── */}

        {/* Quick stats row — 2x2 grid on mobile, 4-in-a-row on desktop */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
          gap: isMobile ? 12 : 16,
          marginBottom: isMobile ? 16 : 24,
        }}>
          <StatCard label={t(T.ci.competitorsTracked, lang)} value={data.brands.length} C={C as unknown as Record<string, string>} />
          <StatCard label={t(T.ci.avgThreat, lang)} value={hasRealScores ? avgThreat : '—'} C={C as unknown as Record<string, string>} />
          <StatCard label={t(T.ci.highestMomentum, lang)} value={hasRealScores && highestMomBrand ? highestMomBrand.brand_name : '—'} C={C as unknown as Record<string, string>} />
          <StatCard label={t(T.ci.platformsConnected, lang)} value={`${connectedCount}/3`} C={C as unknown as Record<string, string>} />
        </div>

        {/* Analysis not run state — show competitor list with pending indicators */}
        {!hasRealScores && data.brands.length > 0 && (
          <div style={{ ...card, marginBottom: isMobile ? 16 : 24 }}>
            <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{lang === 'zh' ? '竞品列表' : 'Tracked Competitors'}</span>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
                background: `${C.ac}15`, color: C.ac, border: `1px solid ${C.ac}33`,
              }}>
                {t(T.ci.analysisNotRun, lang)}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.brands.map((brand, i) => (
                <div key={`${brand.brand_name}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', background: C.s2,
                  border: `1px solid ${C.bd}`, borderRadius: 8,
                }}>
                  <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{brand.brand_name}</span>
                  <span style={{
                    fontSize: 11, color: C.t3, fontStyle: 'italic',
                    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 4, padding: '2px 8px',
                  }}>
                    {t(T.ci.pendingAnalysis, lang)}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Link to="/ci/settings" style={{
                display: 'inline-block', background: C.ac, color: '#fff',
                padding: '9px 22px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                textDecoration: 'none',
              }}>
                {t(T.ci.goToSettingsToStart, lang)} →
              </Link>
            </div>
          </div>
        )}

        {/* Bubble chart — only when real scores available */}
        {hasRealScores && data.brands.length > 0 && (
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

            <div style={{ overflowX: 'auto', minHeight: isMobile ? 280 : 400 }}>
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

        {/* Rankings table — only when real scores available */}
        {hasRealScores && data.brands.length > 0 && (
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
                      ['momentum_score', isMobile ? (lang === 'zh' ? '势能' : 'Mom.') : t(T.ci.momentum, lang)],
                      ['threat_index', isMobile ? (lang === 'zh' ? '威胁' : 'Thr.') : t(T.ci.threat, lang)],
                      ['wtp_score', t(T.ci.wtp, lang)],
                    ] as [SortKey, string][]).map(([key, label]) => (
                      <th key={key} style={thStyle} onClick={() => handleSort(key)}>
                        {label} {sortKey === key ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
                      </th>
                    ))}
                    {!isMobile && (
                      <th style={{ ...thStyle, cursor: 'default' }}>
                        {lang === 'zh' ? '信号' : 'Signals'}
                      </th>
                    )}
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
                          background: `${C.success}18`,
                          color: C.success,
                          border: `1px solid ${C.success}44`,
                        }}>
                          ✓ {t(T.ci.tracking, lang)}
                        </span>
                      </td>
                      <td style={{ ...tdStyle, fontSize: isMobile ? 12 : 13 }}>
                        <ScoreBar value={brand.momentum_score} pending={!hasRealScores} C={C as unknown as Record<string, string>} />
                      </td>
                      <td style={{ ...tdStyle, fontSize: isMobile ? 12 : 13 }}>
                        <ScoreBar value={brand.threat_index} pending={!hasRealScores} C={C as unknown as Record<string, string>} />
                      </td>
                      <td style={{ ...tdStyle, fontSize: isMobile ? 12 : 13 }}>
                        <ScoreBar value={brand.wtp_score} pending={!hasRealScores} C={C as unknown as Record<string, string>} />
                      </td>
                      {!isMobile && (
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
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Score Trends ────────────────────────────────────── */}
        {hasRealScores && data.brands.length > 0 && (
          <div style={card}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={sectionTitle as CSSProperties}>
                {t(T.ci.scoreTrends, lang)}
                <span style={{ fontSize: 11, color: C.t3, fontWeight: 400, marginLeft: 8 }}>
                  ({lang === 'zh' ? '模拟数据' : 'simulated'})
                </span>
              </div>
              {/* Time range toggle */}
              <div style={{ display: 'flex', gap: 6 }}>
                {([30, 90] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => setTrendDays(d)}
                    style={{
                      padding: '4px 12px', borderRadius: 6, fontSize: 12, fontWeight: trendDays === d ? 700 : 400,
                      border: `1px solid ${trendDays === d ? C.ac : C.bd}`,
                      background: trendDays === d ? `${C.ac}22` : 'transparent',
                      color: trendDays === d ? C.ac : C.t2,
                      cursor: 'pointer',
                    }}
                  >
                    {d === 30 ? t(T.ci.days30, lang) : t(T.ci.days90, lang)}
                  </button>
                ))}
              </div>
            </div>

            {/* Mini trend cards — horizontal scroll on mobile, 3-column grid on desktop */}
            <div style={{
              display: isMobile ? 'flex' : 'grid',
              gridTemplateColumns: isMobile ? undefined : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
              overflowX: isMobile ? 'auto' : undefined,
              scrollSnapType: isMobile ? 'x mandatory' : undefined,
              WebkitOverflowScrolling: isMobile ? 'touch' as any : undefined,
              paddingBottom: isMobile ? 8 : 0,
            }}>
              {data.brands.map(brand => {
                const trendData = generateTrendData(brand.momentum_score, trendDays);
                const score7dAgo = trendData[Math.max(0, trendData.length - 8)]?.value ?? brand.momentum_score;
                const diff = brand.momentum_score - score7dAgo;
                const isRising = diff > 2;
                const isFalling = diff < -2;
                const arrowColor = isRising ? C.success : isFalling ? C.danger : C.t3;
                const arrowLabel = isRising
                  ? `↑${diff} ${t(T.ci.rising, lang)}`
                  : isFalling
                  ? `↓${Math.abs(diff)} ${t(T.ci.falling, lang)}`
                  : `→ ${t(T.ci.stable, lang)}`;

                return (
                  <div
                    key={brand.brand_name}
                    style={{
                      background: C.s2,
                      border: `1px solid ${C.bd}`,
                      borderRadius: 10,
                      padding: '14px 16px',
                      minWidth: isMobile ? 240 : undefined,
                      scrollSnapAlign: isMobile ? 'start' : undefined,
                      flexShrink: isMobile ? 0 : undefined,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2, color: C.tx }}>
                      {brand.brand_name}
                    </div>
                    <div style={{ fontSize: 11, color: C.t2, marginBottom: 10 }}>
                      {t(T.ci.momentum, lang)}
                    </div>
                    <MiniTrendChart data={trendData} color={C.ac} width={200} height={56} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: C.ac }}>{brand.momentum_score}</span>
                      <span style={{ fontSize: 12, color: arrowColor, fontWeight: 600 }}>{arrowLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Alert Feed */}
        <CIAlertFeed
          workspaceId={workspace?.id || ''}
          competitors={data.brands}
          source={source}
        />

        </div>{/* end ci-print-area */}
      </div>
    </div>
  );
}
