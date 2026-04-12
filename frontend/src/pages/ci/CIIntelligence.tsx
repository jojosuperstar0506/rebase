import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import { useCIData } from '../../hooks/useCIData';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { getIntelligence, type IntelligenceData, type MetricData } from '../../services/ciApi';
import AttributeCard, { METRIC_CONFIG } from '../../components/ci/intelligence/AttributeCard';
import KeywordCloud from '../../components/ci/intelligence/KeywordCloud';
import SentimentPanel from '../../components/ci/intelligence/SentimentPanel';
import ProductRanking from '../../components/ci/intelligence/ProductRanking';
import PriceMap from '../../components/ci/intelligence/PriceMap';
import LaunchTimeline from '../../components/ci/intelligence/LaunchTimeline';
import VoiceVolume from '../../components/ci/intelligence/VoiceVolume';
import ContentLabels from '../../components/ci/intelligence/ContentLabels';
import KOLTracker from '../../components/ci/intelligence/KOLTracker';
import DesignAnalytics from '../../components/ci/intelligence/DesignAnalytics';

// ── Domain config ────────────────────────────────────────────────

interface DomainConfig {
  key: string;
  label: { en: string; zh: string };
  icon: string;
  metrics: string[]; // ordered metric_type keys
  color: string;
}

const DOMAINS: DomainConfig[] = [
  {
    key: 'consumer',
    label: { en: 'Consumer Insights', zh: '消费者洞察' },
    icon: '🧠',
    metrics: ['consumer_mindshare', 'keywords'],
    color: '#ec4899',
  },
  {
    key: 'product',
    label: { en: 'Product Intelligence', zh: '产品情报' },
    icon: '📦',
    metrics: ['trending_products', 'design_profile', 'price_positioning', 'launch_frequency'],
    color: '#f97316',
  },
  {
    key: 'marketing',
    label: { en: 'Marketing & Voice', zh: '营销与声量' },
    icon: '📢',
    metrics: ['voice_volume', 'content_strategy', 'kol_strategy'],
    color: '#0ea5e9',
  },
];

// Core metrics to show in the summary bar
const CORE_METRICS = ['momentum', 'threat', 'wtp'];

// Wave 4 metrics — not yet built by William
const WAVE4_METRICS = new Set(['design_profile', 'kol_strategy']);

// Detail view map — metric_type → rich visualization component
type DetailProps = { rawInputs: any; aiNarrative: string; score: number; C: any; lang: any };
const DETAIL_VIEWS: Record<string, React.ComponentType<DetailProps>> = {
  keywords: KeywordCloud,
  consumer_mindshare: SentimentPanel,
  trending_products: ProductRanking,
  price_positioning: PriceMap,
  launch_frequency: LaunchTimeline,
  voice_volume: VoiceVolume,
  content_strategy: ContentLabels,
  kol_strategy: KOLTracker,
  design_profile: DesignAnalytics,
};

// ── Skeleton ─────────────────────────────────────────────────────

function IntelligenceSkeleton({ C }: { C: Record<string, string> }) {
  const shimmer: CSSProperties = {
    background: `linear-gradient(90deg, ${C.s2} 25%, ${C.bd}40 50%, ${C.s2} 75%)`,
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s ease-in-out infinite',
    borderRadius: 8,
  };
  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <CISubNav />
      <style>{`@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
      <div style={{ ...shimmer, height: 32, width: 240, marginBottom: 24 }} />
      <div style={{ ...shimmer, height: 100, marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} style={{ ...shimmer, height: 120 }} />
        ))}
      </div>
    </div>
  );
}

// ── Compare mode ─────────────────────────────────────────────────

function CompareSelector({ brands, selected, onChange, C, lang }: {
  brands: string[];
  selected: [string, string];
  onChange: (pair: [string, string]) => void;
  C: Record<string, string>;
  lang: string;
}) {
  const selectStyle: CSSProperties = {
    background: C.inputBg, border: `1px solid ${C.inputBd}`, borderRadius: 8,
    padding: '6px 12px', color: C.tx, fontSize: 13, outline: 'none', minWidth: 140,
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      padding: '12px 16px', background: C.s2, borderRadius: 10, marginBottom: 20,
    }}>
      <span style={{ fontSize: 13, color: C.t2, fontWeight: 600 }}>
        {lang === 'zh' ? '品牌对比：' : 'Compare:'}
      </span>
      <select
        style={selectStyle}
        value={selected[0]}
        onChange={e => onChange([e.target.value, selected[1]])}
      >
        {brands.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <span style={{ color: C.t3, fontSize: 13 }}>vs.</span>
      <select
        style={selectStyle}
        value={selected[1]}
        onChange={e => onChange([selected[0], e.target.value])}
      >
        {brands.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────

export default function CIIntelligence() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { workspace, competitors, loading } = useCIData();

  const [intel, setIntel] = useState<IntelligenceData | null>(null);
  const [intelLoading, setIntelLoading] = useState(true);
  const [comparePair, setComparePair] = useState<[string, string]>(['', '']);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>('');

  // Fetch intelligence data
  useEffect(() => {
    const wsId = workspace?.id;
    if (!wsId || wsId === 'local') { setIntelLoading(false); return; }

    setIntelLoading(true);
    getIntelligence(wsId)
      .then(data => { setIntel(data); })
      .catch(() => { console.warn('[CI] Failed to fetch intelligence data'); })
      .finally(() => { setIntelLoading(false); });
  }, [workspace?.id]);

  // Brand names for compare selector
  const brandNames = useMemo(() => {
    return competitors.map(c => c.brand_name);
  }, [competitors]);

  // Initialize compare pair (only once when brands load)
  const comparePairInitialized = useRef(false);
  useEffect(() => {
    if (brandNames.length >= 2 && !comparePairInitialized.current) {
      setComparePair([brandNames[0], brandNames[1]]);
      comparePairInitialized.current = true;
    }
  }, [brandNames]);

  // Build metric data map from intelligence response
  const metricMap = useMemo(() => {
    const map: Record<string, MetricData | null> = {};
    if (!intel?.domains) return map;

    for (const domain of Object.values(intel.domains)) {
      for (const [metricType, metricData] of Object.entries(domain.metrics)) {
        map[metricType] = metricData;
      }
    }
    return map;
  }, [intel]);

  // Handle metric card expand — sets active metric + default brand
  const handleMetricExpand = (metric: string, expanded: boolean) => {
    setSelectedMetric(expanded ? metric : null);
    if (expanded) {
      const data = metricMap[metric];
      const firstBrand = data
        ? (Object.entries(data.brands).find(([, b]) => b.raw_inputs)?.[0] ?? Object.keys(data.brands)[0] ?? '')
        : '';
      setSelectedBrand(firstBrand);
    }
  };

  // Available metric count
  const availableCount = intel?.available_metrics?.length ?? 0;
  const totalPossible = DOMAINS.reduce((sum, d) => sum + d.metrics.length, 0) + CORE_METRICS.length;

  if (loading || intelLoading) return <IntelligenceSkeleton C={C as unknown as Record<string, string>} />;

  const isLocal = workspace?.id === 'local' || !workspace?.id;

  // Styles
  const card: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
    padding: isMobile ? 14 : 20, marginBottom: 20,
  };

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: isMobile ? '16px 12px' : '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />

        {/* Header */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 6, marginTop: 0 }}>
            {lang === 'zh' ? '竞品洞察' : 'Intelligence'}
          </h1>
          <p style={{ color: C.t2, fontSize: 14, margin: 0 }}>
            {lang === 'zh'
              ? `${availableCount}/${totalPossible} 项分析指标已就绪 — 点击卡片查看详情`
              : `${availableCount}/${totalPossible} metrics available — click any card for details`}
          </p>
        </div>

        {/* AI Executive Summary */}
        {intel?.domains?.core?.metrics?.momentum && (
          <div style={{
            ...card, background: `linear-gradient(135deg, ${C.s1} 0%, ${C.ac}08 100%)`,
            borderColor: C.ac + '33',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 16 }}>✨</span>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: C.ac }}>
                {lang === 'zh' ? 'AI 战略摘要' : 'AI Executive Summary'}
              </h2>
            </div>
            <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
              {(() => {
                // Find the first brand with an AI narrative
                const insights = Object.values(intel?.domains ?? {})
                  .flatMap(d => Object.values(d.metrics))
                  .flatMap(m => Object.values(m.brands))
                  .filter(b => b.ai_narrative)
                  .map(b => b.ai_narrative);
                return insights[0] || (lang === 'zh'
                  ? '分析正在生成中...首次分析可能需要1-2分钟。'
                  : 'Analysis is being generated... First analysis may take 1-2 minutes.');
              })()}
            </div>
          </div>
        )}

        {/* No data state */}
        {isLocal && (
          <div style={{
            ...card, textAlign: 'center', padding: 40,
            border: `2px dashed ${C.bd}`,
          }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, marginTop: 0 }}>
              {lang === 'zh' ? '情报层需要后端连接' : 'Intelligence requires backend connection'}
            </h3>
            <p style={{ fontSize: 13, color: C.t3, margin: 0, maxWidth: 400, marginLeft: 'auto', marginRight: 'auto' }}>
              {lang === 'zh'
                ? '请先在"设置"页面运行分析。数据将在后端完成评分后显示在此页面。'
                : 'Run analysis in Settings first. Data will appear here after backend scoring completes.'}
            </p>
          </div>
        )}

        {/* Core metrics compact bar (these are already on Dashboard — show mini version) */}
        {!isLocal && (
          <div style={{
            display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap',
          }}>
            {CORE_METRICS.map(metric => {
              const data = metricMap[metric];
              const config = METRIC_CONFIG[metric];
              const avgScore = data?.score ?? 0;
              return (
                <div key={metric} style={{
                  flex: '1 1 100px', minWidth: 100,
                  background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
                  padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 14 }}>{config?.icon}</span>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: config?.color || C.ac, lineHeight: 1 }}>
                      {avgScore || '—'}
                    </div>
                    <div style={{ fontSize: 10, color: C.t3, marginTop: 2 }}>
                      {lang === 'zh' ? config?.label.zh : config?.label.en}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Progress indicator for pending metrics */}
        {!isLocal && availableCount < totalPossible && availableCount > 0 && (
          <div style={{
            background: `${C.ac}08`, border: `1px solid ${C.ac}22`, borderRadius: 10,
            padding: '10px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', border: `2px solid ${C.ac}`, borderTopColor: 'transparent', animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <span style={{ fontSize: 12, color: C.t2 }}>
              {lang === 'zh'
                ? `${availableCount} 项指标已完成，${totalPossible - availableCount} 项正在计算中...`
                : `${availableCount} metrics ready, ${totalPossible - availableCount} still computing...`}
            </span>
          </div>
        )}

        {/* Domain groups */}
        {!isLocal && DOMAINS.map(domain => {
          const metricsWithData = domain.metrics.filter(m => metricMap[m]);
          const hasAnyData = metricsWithData.length > 0;
          const pendingCount = domain.metrics.length - metricsWithData.length;

          return (
            <div key={domain.key} style={{ marginBottom: 28 }}>
              {/* Domain header */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14,
                paddingBottom: 8, borderBottom: `2px solid ${domain.color}33`,
              }}>
                <span style={{ fontSize: 18 }}>{domain.icon}</span>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: C.tx }}>
                  {lang === 'zh' ? domain.label.zh : domain.label.en}
                </h2>
                <span style={{
                  fontSize: 11, color: hasAnyData ? domain.color : C.t3,
                  background: hasAnyData ? domain.color + '15' : C.s2,
                  padding: '2px 8px', borderRadius: 4, marginLeft: 'auto',
                }}>
                  {hasAnyData
                    ? `${metricsWithData.length}/${domain.metrics.length}`
                    : (lang === 'zh' ? '待分析' : 'Pending')}
                </span>
              </div>

              {/* Metric cards grid — show data cards + compact pending placeholders */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(domain.metrics.length, 2)}, 1fr)`,
                gap: 12,
              }}>
                {domain.metrics.map(metric => (
                  <AttributeCard
                    key={metric}
                    metricType={metric}
                    data={metricMap[metric] ?? null}
                    lang={lang}
                    C={C as unknown as Record<string, string>}
                    isMobile={isMobile}
                    isWave4={WAVE4_METRICS.has(metric)}
                    onExpand={handleMetricExpand}
                    trendData={[]}
                  />
                ))}
              </div>
            </div>
          );
        })}

        {/* Compare mode */}
        {!isLocal && brandNames.length >= 2 && (
          <div style={card}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, marginTop: 0 }}>
              {lang === 'zh' ? '品牌对比' : 'Brand Comparison'}
            </h2>
            <CompareSelector
              brands={brandNames}
              selected={comparePair}
              onChange={setComparePair}
              C={C as unknown as Record<string, string>}
              lang={lang}
            />

            {/* Comparison table */}
            {comparePair[0] && comparePair[1] && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 12px', color: C.t3, fontSize: 11, borderBottom: `1px solid ${C.bd}` }}>
                        {lang === 'zh' ? '指标' : 'Metric'}
                      </th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', color: C.t2, fontWeight: 600, borderBottom: `1px solid ${C.bd}` }}>
                        {comparePair[0]}
                      </th>
                      <th style={{ textAlign: 'center', padding: '8px 12px', color: C.t2, fontWeight: 600, borderBottom: `1px solid ${C.bd}` }}>
                        {comparePair[1]}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...CORE_METRICS, ...DOMAINS.flatMap(d => d.metrics)].map(metric => {
                      const metricData = metricMap[metric];
                      if (!metricData) return null;
                      const scoreA = metricData.brands[comparePair[0]]?.score ?? null;
                      const scoreB = metricData.brands[comparePair[1]]?.score ?? null;
                      if (scoreA === null && scoreB === null) return null;

                      const config = METRIC_CONFIG[metric];
                      const winner = scoreA !== null && scoreB !== null
                        ? (scoreA > scoreB ? 'a' : scoreB > scoreA ? 'b' : 'tie')
                        : null;

                      return (
                        <tr key={metric}>
                          <td style={{ padding: '8px 12px', borderBottom: `1px solid ${C.bd}08`, color: C.t2 }}>
                            {config?.icon} {lang === 'zh' ? config?.label.zh : config?.label.en}
                          </td>
                          <td style={{
                            textAlign: 'center', padding: '8px 12px', borderBottom: `1px solid ${C.bd}08`,
                            fontWeight: winner === 'a' ? 700 : 400,
                            color: winner === 'a' ? '#22c55e' : C.tx,
                          }}>
                            {scoreA ?? '—'}
                          </td>
                          <td style={{
                            textAlign: 'center', padding: '8px 12px', borderBottom: `1px solid ${C.bd}08`,
                            fontWeight: winner === 'b' ? 700 : 400,
                            color: winner === 'b' ? '#22c55e' : C.tx,
                          }}>
                            {scoreB ?? '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Rich Detail Panel ── */}
        {selectedMetric && !WAVE4_METRICS.has(selectedMetric) && (() => {
          const DetailView = DETAIL_VIEWS[selectedMetric];
          if (!DetailView) return null;
          const metricData: MetricData | null = metricMap[selectedMetric] ?? null;
          const brandEntries = metricData ? Object.entries(metricData.brands) : [];
          // Active brand: use selectedBrand if valid, else fall back to first brand with raw_inputs
          const activeBrandData = (selectedBrand && metricData?.brands[selectedBrand])
            ? metricData.brands[selectedBrand]
            : brandEntries.find(([, b]) => b.raw_inputs)?.[1] ?? brandEntries[0]?.[1];
          const rawInputs = activeBrandData?.raw_inputs ?? null;
          const aiNarrative = activeBrandData?.ai_narrative ?? '';
          const score = activeBrandData?.score ?? metricData?.score ?? 0;
          const config = METRIC_CONFIG[selectedMetric];
          return (
            <div style={{
              marginTop: 28, background: C.s1,
              border: `1px solid ${config?.color ?? C.ac}44`,
              borderRadius: 12, padding: 24, position: 'relative',
            }}>
              {/* Panel header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ fontSize: 18 }}>{config?.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>
                  {lang === 'zh' ? config?.label.zh : config?.label.en}
                </span>
                <span style={{
                  fontSize: 12, fontWeight: 700, color: config?.color, marginLeft: 4,
                  background: (config?.color ?? C.ac) + '15', borderRadius: 6, padding: '2px 8px',
                }}>
                  {score}
                </span>
                <button
                  onClick={() => setSelectedMetric(null)}
                  style={{
                    marginLeft: 'auto', background: 'transparent', border: 'none',
                    cursor: 'pointer', fontSize: 18, color: C.t2, padding: '4px 8px', lineHeight: 1,
                  }}
                  aria-label="Close detail panel"
                >
                  ✕
                </button>
              </div>
              {/* Brand tabs — interactive, switches which brand's data the detail view shows */}
              {brandEntries.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
                  {brandEntries.slice(0, 6).map(([name]) => {
                    const isActive = selectedBrand === name || (!selectedBrand && name === brandEntries[0]?.[0]);
                    return (
                      <button
                        key={name}
                        onClick={() => setSelectedBrand(name)}
                        style={{
                          padding: '4px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer',
                          background: isActive ? (config?.color ?? C.ac) + '20' : C.s2,
                          color: isActive ? (config?.color ?? C.ac) : C.t2,
                          border: `1px solid ${isActive ? (config?.color ?? C.ac) + '55' : C.bd}`,
                          fontWeight: isActive ? 600 : 400,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
              <DetailView
                rawInputs={rawInputs}
                aiNarrative={aiNarrative}
                score={score}
                C={C}
                lang={lang}
              />
            </div>
          );
        })()}
      </div>
    </div>
  );
}
