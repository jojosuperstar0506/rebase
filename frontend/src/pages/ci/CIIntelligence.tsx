import { useState, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import { useCIData } from '../../hooks/useCIData';
import CISubNav from '../../components/ci/CISubNav';
import AttributeCard from '../../components/ci/intelligence/AttributeCard';
import KeywordCloud from '../../components/ci/intelligence/KeywordCloud';
import SentimentPanel from '../../components/ci/intelligence/SentimentPanel';
import ProductRanking from '../../components/ci/intelligence/ProductRanking';
import PriceMap from '../../components/ci/intelligence/PriceMap';
import LaunchTimeline from '../../components/ci/intelligence/LaunchTimeline';
import VoiceVolume from '../../components/ci/intelligence/VoiceVolume';
import ContentLabels from '../../components/ci/intelligence/ContentLabels';
import KOLTracker from '../../components/ci/intelligence/KOLTracker';
import DesignAnalytics from '../../components/ci/intelligence/DesignAnalytics';
import {
  getIntelligenceSummary,
  getIntelligenceDetail,
  type IntelligenceSummary,
  type MetricDetail,
  type MetricSummary,
} from '../../services/ciApi';

// ─── Metric config ───────────────────────────────────────────────────────────

interface MetricConfig {
  metricType: string;
  labelKey: { en: string; zh: string };
  isWave4?: boolean;
}

const METRIC_GROUPS: Array<{
  groupKey: string;
  labelKey: { en: string; zh: string };
  metrics: MetricConfig[];
}> = [
  {
    groupKey: 'consumer',
    labelKey: T.ci.consumerIntel,
    metrics: [
      { metricType: 'consumer_mindshare', labelKey: T.ci.metricMindshare },
      { metricType: 'keywords', labelKey: T.ci.metricKeywords },
    ],
  },
  {
    groupKey: 'product',
    labelKey: T.ci.productIntel,
    metrics: [
      { metricType: 'trending_products', labelKey: T.ci.metricHotProducts },
      { metricType: 'price_positioning', labelKey: T.ci.metricPrice },
      { metricType: 'launch_frequency', labelKey: T.ci.metricLaunch },
      { metricType: 'design_profile', labelKey: T.ci.metricDesign, isWave4: true },
    ],
  },
  {
    groupKey: 'marketing',
    labelKey: T.ci.marketingIntel,
    metrics: [
      { metricType: 'voice_volume', labelKey: T.ci.metricVoice },
      { metricType: 'content_strategy', labelKey: T.ci.metricContent },
      { metricType: 'kol_strategy', labelKey: T.ci.metricKol, isWave4: true },
    ],
  },
];

// ─── Detail view map ─────────────────────────────────────────────────────────

type DetailViewProps = {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: any;
  lang: any;
};

const DETAIL_MAP: Record<string, React.ComponentType<DetailViewProps>> = {
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

// ─── Component ───────────────────────────────────────────────────────────────

export default function CIIntelligence() {
  const { colors: C, lang } = useApp();
  const { workspace, competitors, loading: ciLoading, source } = useCIData();

  const [intelligence, setIntelligence] = useState<IntelligenceSummary | null>(null);
  const [detail, setDetail] = useState<Record<string, MetricDetail> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<string>('');
  const [intelLoading, setIntelLoading] = useState(true);

  // Load intelligence summary
  useEffect(() => {
    if (ciLoading) return;
    setIntelLoading(true);
    getIntelligenceSummary(workspace?.id).then(data => {
      setIntelligence(data);
      // Default selected competitor to first one
      if (data && data.competitors.length > 0 && !selectedCompetitor) {
        setSelectedCompetitor(data.competitors[0].brand_name);
      }
      setIntelLoading(false);
    });
  }, [ciLoading, workspace?.id]);

  // Load detail when user selects a card
  const handleCardClick = useCallback(async (metricType: string, brandName: string) => {
    if (selectedMetric === metricType && selectedCompetitor === brandName) {
      // Toggle off
      setSelectedMetric(null);
      setDetail(null);
      return;
    }
    setSelectedMetric(metricType);
    setSelectedCompetitor(brandName);
    setDetail(null);
    if (workspace?.id) {
      setDetailLoading(true);
      const d = await getIntelligenceDetail(workspace.id, brandName);
      setDetail(d);
      setDetailLoading(false);
    }
  }, [selectedMetric, selectedCompetitor, workspace?.id]);

  // Competitor tabs in detail panel
  const competitorNames = intelligence?.competitors.map(c => c.brand_name) ?? competitors.map(c => c.brand_name);

  const getMetricForCompetitor = (metricType: string, brandName: string): MetricSummary | null => {
    if (!intelligence) return null;
    const comp = intelligence.competitors.find(c => c.brand_name === brandName);
    return comp?.metrics[metricType] ?? null;
  };

  // Detail view data
  const selectedMetricDetail = detail && selectedMetric ? detail[selectedMetric] : null;
  const selectedMetricSummary = selectedMetric && selectedCompetitor
    ? getMetricForCompetitor(selectedMetric, selectedCompetitor)
    : null;
  const DetailView = selectedMetric ? DETAIL_MAP[selectedMetric] : null;

  // Empty state — no competitors
  if (!ciLoading && competitors.length === 0) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 20px 40px' }}>
        <CISubNav />
        <div style={{
          textAlign: 'center', padding: '60px 24px',
          color: C.t2, fontSize: 14, lineHeight: 1.6,
        }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>📊</div>
          <div style={{ fontWeight: 600, color: C.tx, marginBottom: 8 }}>
            {t(T.ci.intelligenceTitle, lang)}
          </div>
          <div>{t(T.ci.noIntelligenceData, lang)}</div>
          <a
            href="/ci/settings"
            style={{
              display: 'inline-block', marginTop: 20,
              padding: '10px 20px', borderRadius: 8,
              background: C.ac, color: '#fff',
              fontSize: 13, fontWeight: 600, textDecoration: 'none',
            }}
          >
            {t(T.ci.settings, lang)} →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 20px 60px' }}>
      <CISubNav />

      {/* ── AI Executive Summary ── */}
      <div style={{
        background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
        padding: '20px 24px', marginBottom: 28,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
            {t(T.ci.executiveSummary, lang)}
          </span>
          {intelligence?.last_updated && (
            <span style={{ fontSize: 11, color: C.t2, marginLeft: 'auto' }}>
              {t(T.ci.lastUpdated, lang)} {new Date(intelligence.last_updated).toLocaleDateString()}
            </span>
          )}
        </div>
        {intelLoading ? (
          <div style={{ height: 16, background: C.s2, borderRadius: 4, width: '75%' }} />
        ) : intelligence?.executive_summary ? (
          <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.65 }}>
            {intelligence.executive_summary}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: C.t2, fontStyle: 'italic' }}>
            {source === 'api'
              ? 'Analysis running — narrative will appear here when complete.'
              : t(T.ci.noIntelligenceData, lang)}
          </div>
        )}
      </div>

      {/* ── Competitor selector (when data exists) ── */}
      {!intelLoading && intelligence && intelligence.competitors.length > 1 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: C.t2, alignSelf: 'center', marginRight: 4 }}>Showing:</span>
          {competitorNames.map(name => (
            <button
              key={name}
              onClick={() => setSelectedCompetitor(name)}
              style={{
                padding: '5px 14px', borderRadius: 20, fontSize: 12,
                border: `1px solid ${selectedCompetitor === name ? C.ac : C.bd}`,
                background: selectedCompetitor === name ? C.s2 : 'transparent',
                color: selectedCompetitor === name ? C.ac : C.t2,
                cursor: 'pointer', fontWeight: selectedCompetitor === name ? 600 : 400,
              }}
            >
              {name}
            </button>
          ))}
        </div>
      )}

      {/* ── Metric groups ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
        {METRIC_GROUPS.map(group => (
          <div key={group.groupKey}>
            {/* Group label */}
            <div style={{
              fontSize: 11, fontWeight: 700, color: C.t2,
              textTransform: 'uppercase', letterSpacing: '0.1em',
              marginBottom: 14, paddingBottom: 8,
              borderBottom: `1px solid ${C.bd}`,
            }}>
              {t(group.labelKey, lang)}
            </div>
            {/* Cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
              {group.metrics.map(({ metricType, labelKey, isWave4 }) => {
                const metric = selectedCompetitor
                  ? getMetricForCompetitor(metricType, selectedCompetitor)
                  : null;
                return (
                  <AttributeCard
                    key={metricType}
                    metricType={metricType}
                    label={t(labelKey, lang)}
                    metric={intelLoading ? null : metric}
                    isWave4={isWave4}
                    isSelected={selectedMetric === metricType && !isWave4}
                    onClick={() => !isWave4 && selectedCompetitor && handleCardClick(metricType, selectedCompetitor)}
                    C={C}
                    lang={lang}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Detail panel ── */}
      {selectedMetric && DetailView && (
        <div style={{
          marginTop: 32,
          background: C.s1, border: `1px solid ${C.ac}40`,
          borderRadius: 12, padding: '24px',
          position: 'relative',
        }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            {/* Competitor tabs */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
              {competitorNames.slice(0, 6).map(name => (
                <button
                  key={name}
                  onClick={() => handleCardClick(selectedMetric, name)}
                  style={{
                    padding: '4px 12px', borderRadius: 16, fontSize: 12,
                    border: `1px solid ${selectedCompetitor === name ? C.ac : C.bd}`,
                    background: selectedCompetitor === name ? C.ac : 'transparent',
                    color: selectedCompetitor === name ? '#fff' : C.t2,
                    cursor: 'pointer', fontWeight: selectedCompetitor === name ? 600 : 400,
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            {/* Close */}
            <button
              onClick={() => { setSelectedMetric(null); setDetail(null); }}
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                fontSize: 18, color: C.t2, padding: '4px 8px', lineHeight: 1,
              }}
              aria-label="Close detail panel"
            >
              ✕
            </button>
          </div>

          {/* Detail content */}
          {detailLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '16px 0' }}>
              {[75, 55, 85, 45].map(w => (
                <div key={w} style={{ height: 14, background: C.s2, borderRadius: 4, width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <DetailView
              rawInputs={selectedMetricDetail?.raw_inputs ?? null}
              aiNarrative={selectedMetricDetail?.ai_narrative ?? selectedMetricSummary?.ai_narrative ?? ''}
              score={selectedMetricDetail?.score ?? selectedMetricSummary?.score ?? 0}
              C={C}
              lang={lang}
            />
          )}
        </div>
      )}
    </div>
  );
}
