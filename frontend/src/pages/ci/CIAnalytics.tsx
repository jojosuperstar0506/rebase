/**
 * CIAnalytics — the analyst-view drill-down.
 *
 * The Brief is for decision-makers who want "what do I do". Analytics is for
 * the moment someone wants to verify or dig deeper — typically the founder
 * on a Tuesday after reading the Brief on Monday.
 *
 * Three sections, in priority order:
 *   §A. Priority metrics this week — 3-5 metrics the AI flagged as most
 *       important (by |delta| × gap_to_leader). Each drills down to a
 *       trend line + per-brand comparison.
 *   §B. White space opportunities — uncontested dimensions / price bands /
 *       keyword pockets. The most differentiated output Rebase produces.
 *   §C. All 12 metrics — collapsed by default, shown as a grid of compact
 *       cards. Click any to drill down.
 *
 * Data from ciMocks.ts today; final shape will land when the backend
 * brief_generator + white_space pipelines ship.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import type { ColorSet } from '../../theme/colors';
import CISubNav from '../../components/ci/CISubNav';
import CIDrillDownModal from '../../components/ci/CIDrillDownModal';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCIData } from '../../hooks/useCIData';
import {
  getAnalytics,
  type AnalyticsData, type PriorityMetric, type WhiteSpace, type FullMetric,
  type MetricDomain,
} from '../../services/ciMocks';

// ─── Helpers ─────────────────────────────────────────────────────────────

function deltaColor(d: number | null, C: ColorSet): string {
  if (d === null || d === 0) return C.t3;
  return d > 0 ? '#22c55e' : '#ef4444';
}
function deltaStr(d: number | null): string {
  if (d === null) return '—';
  if (d === 0)   return '0';
  return d > 0 ? `+${d}` : `${d}`;
}
function domainColor(d: MetricDomain, C: ColorSet): string {
  return d === 'consumer' ? C.domainConsumer
       : d === 'product'  ? C.domainProduct
       : C.domainMarketing;
}
function domainLabel(d: MetricDomain, lang: string): string {
  if (d === 'consumer')  return lang === 'zh' ? '消费者' : 'Consumer';
  if (d === 'product')   return lang === 'zh' ? '产品'   : 'Product';
  return lang === 'zh' ? '营销' : 'Marketing';
}

// ─── Component ───────────────────────────────────────────────────────────

export default function CIAnalytics() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { workspace } = useCIData();

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  // Drill-down state — a single slot for whatever the user clicked
  type DrillTarget =
    | { kind: 'metric'; metric: FullMetric }
    | { kind: 'priority'; metric: PriorityMetric }
    | { kind: 'whitespace'; item: WhiteSpace }
    | null;
  const [drill, setDrill] = useState<DrillTarget>(null);

  const workspaceId = workspace?.id || 'mock';

  useEffect(() => {
    setLoading(true);
    setError(false);
    getAnalytics(workspaceId).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, [workspaceId]);

  // ─── Styles ────────────────────────────────────────────────────────────

  const pageStyle: CSSProperties = {
    background: C.bg, color: C.tx, minHeight: '100vh',
    padding: isMobile ? '16px 12px' : '32px 24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const container: CSSProperties = { maxWidth: 960, margin: '0 auto' };
  const card: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
    padding: isMobile ? 14 : 18,
  };

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div style={{ ...card, textAlign: 'center', padding: 50, marginTop: 20 }}>
            <div style={{ fontSize: 13, color: C.t2 }}>
              {lang === 'zh' ? '加载分析数据…' : 'Loading analytics…'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div style={{ ...card, textAlign: 'center', padding: 50, marginTop: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>
              {lang === 'zh' ? '加载失败' : 'Could not load analytics'}
            </h3>
            <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>
              {lang === 'zh' ? '请稍后重试。' : 'Check your connection and try again.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div style={{ ...card, textAlign: 'center', padding: 50, marginTop: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>
              {lang === 'zh' ? '暂无分析数据' : 'No analytics yet'}
            </h3>
            <p style={{ fontSize: 12, color: C.t3, margin: 0, lineHeight: 1.6 }}>
              {lang === 'zh'
                ? '竞品数据抓取并分析完成后，分析报告将显示在这里。'
                : 'Analytics will appear here after your first data sync and analysis run.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      <div style={container}>
        <CISubNav />

        {/* Header */}
        <header style={{ margin: '20px 0 24px' }}>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            {lang === 'zh' ? '分析' : 'Analytics'}
          </h1>
          <p style={{ color: C.t2, fontSize: 14, margin: '6px 0 0', lineHeight: 1.6 }}>
            {lang === 'zh'
              ? `本周优先指标 · 市场空白机会 · 全部12项指标深度分析`
              : 'Priority metrics · white space opportunities · all-12 deep dive'}
          </p>
        </header>

        {/* ─── §A. Priority metrics this week ──────────────────────────── */}
        <section style={{ marginBottom: 36 }}>
          <SectionHeader
            title={lang === 'zh' ? '本周优先指标' : "This week's priority metrics"}
            subtitle={lang === 'zh'
              ? '按照"变化幅度 × 与领先者差距"自动排序，优先级最高的3-5项。'
              : "Ranked by |delta| × gap_to_leader. The metrics most likely to shift your verdict."}
            count={data.priority_metrics.length}
            C={C}
          />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)', gap: 12 }}>
            {data.priority_metrics.map((m, i) => (
              <PriorityMetricCard
                key={m.metric_key}
                metric={m}
                rank={i + 1}
                onClick={() => setDrill({ kind: 'priority', metric: m })}
                C={C}
                lang={lang}
              />
            ))}
          </div>
        </section>

        {/* ─── §B. White space opportunities ───────────────────────────── */}
        <section style={{ marginBottom: 36 }}>
          <SectionHeader
            title={lang === 'zh' ? '市场空白机会' : 'White space opportunities'}
            subtitle={lang === 'zh'
              ? '竞品集中没有人占领的维度、价位带或关键词领域。这是Rebase的独特分析输出。'
              : "Uncontested dimensions, price bands, or keyword pockets — Rebase's most differentiated output."}
            count={data.white_space.length}
            C={C}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {data.white_space.map(ws => (
              <WhiteSpaceCard
                key={ws.id}
                item={ws}
                onClick={() => setDrill({ kind: 'whitespace', item: ws })}
                C={C}
                lang={lang}
                isMobile={isMobile}
              />
            ))}
          </div>
        </section>

        {/* ─── §C. All 12 metrics (collapsed) ──────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <button
            onClick={() => setShowAllMetrics(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 10,
              padding: '12px 16px', color: C.t2, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', marginBottom: showAllMetrics ? 14 : 0,
            }}
          >
            <span>
              📋 {lang === 'zh' ? `查看全部12项指标详情` : `See all 12 metrics`}
              <span style={{ color: C.t3, marginLeft: 8 }}>· {data.all_metrics.length}</span>
            </span>
            <span style={{
              fontSize: 11, color: C.t3,
              transform: showAllMetrics ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s',
            }}>
              ▼
            </span>
          </button>

          {showAllMetrics && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
            }}>
              {data.all_metrics.map(m => (
                <AllMetricMiniCard
                  key={m.metric_key}
                  metric={m}
                  ownBrand={data.workspace_brand_name}
                  onClick={() => setDrill({ kind: 'metric', metric: m })}
                  C={C}
                  lang={lang}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ─── Drill-down modal ─────────────────────────────────────────── */}
      {drill?.kind === 'metric' && (
        <CIDrillDownModal
          open={true}
          onClose={() => setDrill(null)}
          title={`${drill.metric.icon} ${lang === 'zh' ? drill.metric.label.zh : drill.metric.label.en}`}
          subtitle={lang === 'zh' ? drill.metric.description.zh : drill.metric.description.en}
          size="md"
        >
          <MetricDetailView
            metric={drill.metric}
            ownBrand={data.workspace_brand_name}
            trends={data.trends[drill.metric.metric_key]}
            C={C}
            lang={lang}
          />
        </CIDrillDownModal>
      )}

      {drill?.kind === 'priority' && (
        <CIDrillDownModal
          open={true}
          onClose={() => setDrill(null)}
          title={`${drill.metric.icon} ${lang === 'zh' ? drill.metric.label.zh : drill.metric.label.en}`}
          subtitle={lang === 'zh' ? '本周优先指标 · 深度分析' : "Priority metric · deep dive"}
          size="md"
        >
          <PriorityMetricDetailView
            metric={drill.metric}
            trend={data.trends[drill.metric.metric_key]}
            C={C}
            lang={lang}
          />
        </CIDrillDownModal>
      )}

      {drill?.kind === 'whitespace' && (
        <CIDrillDownModal
          open={true}
          onClose={() => setDrill(null)}
          title={`🟩 ${drill.item.title}`}
          subtitle={drill.item.summary}
          size="lg"
        >
          <WhiteSpaceDetailView item={drill.item} C={C} lang={lang} />
        </CIDrillDownModal>
      )}
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function SectionHeader({ title, subtitle, count, C }: {
  title: string; subtitle: string; count: number; C: ColorSet;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: C.t2, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
          {title}
        </h2>
        <span style={{
          fontSize: 11, color: C.t3,
          background: C.s2, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
        }}>
          {count}
        </span>
      </div>
      <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
        {subtitle}
      </div>
    </div>
  );
}

function PriorityMetricCard({ metric, rank, onClick, C, lang }: {
  metric: PriorityMetric; rank: number; onClick: () => void; C: ColorSet; lang: string;
}) {
  const gap = metric.best_competitor.score - metric.your_score;
  const dColor = deltaColor(metric.delta, C);
  return (
    <div
      onClick={onClick}
      style={{
        background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
        padding: 16, cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${C.ac}55`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C.bd)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: '0.05em' }}>
          #{rank}
        </span>
        <span style={{ fontSize: 18 }}>{metric.icon}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: C.tx, flex: 1 }}>
          {lang === 'zh' ? metric.label.zh : metric.label.en}
        </span>
        <span style={{
          fontSize: 11, fontWeight: 700, color: dColor,
          background: `${dColor}15`, padding: '2px 8px', borderRadius: 10,
        }}>
          Δ {deltaStr(metric.delta)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <ScorePill label={lang === 'zh' ? '你的' : 'You'} value={metric.your_score} color={C.ac} C={C} />
        <ScorePill label={lang === 'zh' ? '领先者' : 'Leader'} value={metric.best_competitor.score} sub={metric.best_competitor.name} color={C.t2} C={C} />
        <ScorePill label={lang === 'zh' ? '差距' : 'Gap'} value={gap > 0 ? `-${gap}` : '+0'} color={gap > 0 ? '#ef4444' : '#22c55e'} C={C} />
      </div>

      <div style={{
        fontSize: 12, color: C.t2, lineHeight: 1.6,
        paddingTop: 10, borderTop: `1px solid ${C.bd}`,
      }}>
        {metric.priority_rationale}
      </div>

      <div style={{ marginTop: 10, fontSize: 11, color: C.ac, fontWeight: 600 }}>
        {lang === 'zh' ? '点击查看历史走势 →' : 'Click to see trend →'}
      </div>
    </div>
  );
}

function ScorePill({ label, value, sub, color, C }: {
  label: string; value: number | string; sub?: string; color: string; C: ColorSet;
}) {
  return (
    <div style={{ padding: '6px 8px', background: C.s2, borderRadius: 6, textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: C.t3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: C.t3, marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function WhiteSpaceCard({ item, onClick, C, lang, isMobile }: {
  item: WhiteSpace; onClick: () => void; C: ColorSet; lang: string; isMobile: boolean;
}) {
  const categoryColor: Record<WhiteSpace['category'], string> = {
    dimension: '#22c55e', pricing: '#f59e0b', keyword: '#0ea5e9', channel: '#a855f7',
  };
  const catColor = categoryColor[item.category];
  const catLabelMap: Record<WhiteSpace['category'], { en: string; zh: string }> = {
    dimension: { en: 'Dimension', zh: '指标维度' },
    pricing:   { en: 'Pricing',   zh: '价位带'   },
    keyword:   { en: 'Keyword',   zh: '关键词'   },
    channel:   { en: 'Channel',   zh: '渠道'     },
  };

  return (
    <div
      onClick={onClick}
      style={{
        background: C.s1, border: `1px solid ${catColor}33`, borderLeft: `4px solid ${catColor}`,
        borderRadius: 12, padding: isMobile ? 14 : 18, cursor: 'pointer',
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
      onMouseLeave={e => (e.currentTarget.style.background = C.s1)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, color: catColor,
          background: `${catColor}18`, padding: '3px 8px', borderRadius: 4,
          letterSpacing: '0.05em', textTransform: 'uppercase',
        }}>
          🟩 {lang === 'zh' ? catLabelMap[item.category].zh : catLabelMap[item.category].en}
        </span>
        <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>
          {lang === 'zh' ? '机会分' : 'Opportunity'} {item.opportunity_score}/100
        </span>
      </div>
      <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.4 }}>
        {item.title}
      </h3>
      <p style={{ fontSize: 13, color: C.t2, margin: 0, lineHeight: 1.6 }}>
        {item.summary}
      </p>
      <div style={{ marginTop: 10, fontSize: 11, color: catColor, fontWeight: 600 }}>
        {lang === 'zh' ? '查看完整分析 →' : 'See full analysis →'}
      </div>
    </div>
  );
}

function AllMetricMiniCard({ metric, ownBrand, onClick, C, lang }: {
  metric: FullMetric; ownBrand: string; onClick: () => void; C: ColorSet; lang: string;
}) {
  const scores = Object.entries(metric.scores);
  const ownScore = metric.scores[ownBrand] ?? 0;
  const bestEntry = scores.filter(([n]) => n !== ownBrand).sort((a, b) => b[1] - a[1])[0];
  const leading = bestEntry ? ownScore >= bestEntry[1] : true;
  const dColor = deltaColor(metric.delta, C);

  return (
    <div
      onClick={onClick}
      style={{
        background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
        padding: 12, cursor: 'pointer', transition: 'all 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = `${C.ac}55`)}
      onMouseLeave={e => (e.currentTarget.style.borderColor = C.bd)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, background: domainColor(metric.domain, C), borderRadius: 2 }} />
        <span style={{ fontSize: 11, color: C.t3 }}>{domainLabel(metric.domain, lang)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 14 }}>{metric.icon}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>
          {lang === 'zh' ? metric.label.zh : metric.label.en}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: leading ? '#22c55e' : C.tx }}>
          {ownScore}
        </span>
        <span style={{ fontSize: 11, color: C.t3 }}>/ 100</span>
        {metric.delta !== null && (
          <span style={{ fontSize: 11, fontWeight: 700, color: dColor, marginLeft: 'auto' }}>
            {deltaStr(metric.delta)}
          </span>
        )}
      </div>
      {bestEntry && (
        <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
          {lang === 'zh' ? '领先者：' : 'Leader: '}
          {bestEntry[0]} ({bestEntry[1]})
        </div>
      )}
    </div>
  );
}

// ─── Drill-down views ────────────────────────────────────────────────────

function MetricDetailView({ metric, ownBrand, trends, C, lang }: {
  metric: FullMetric;
  ownBrand: string;
  trends: Array<{ week_of: string; score: number }> | undefined;
  C: ColorSet;
  lang: string;
}) {
  const scores = Object.entries(metric.scores).sort((a, b) => b[1] - a[1]);
  const maxScore = Math.max(...scores.map(s => s[1]), 100);

  return (
    <div>
      {/* Per-brand comparison */}
      <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
        {lang === 'zh' ? '品牌对比' : 'Brand comparison'}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {scores.map(([name, score]) => {
          const isOwn = name === ownBrand;
          return (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span style={{
                width: 84, color: isOwn ? C.tx : C.t2,
                fontWeight: isOwn ? 700 : 400, flexShrink: 0,
              }}>
                {isOwn && '🏷️ '}{name}
              </span>
              <div style={{ flex: 1, height: 10, background: C.s2, borderRadius: 5, overflow: 'hidden' }}>
                <div style={{
                  width: `${(score / maxScore) * 100}%`, height: '100%',
                  background: isOwn ? C.ac : `${C.ac}66`,
                  borderRadius: 5,
                }} />
              </div>
              <span style={{
                width: 36, textAlign: 'right',
                color: isOwn ? C.tx : C.t2,
                fontWeight: isOwn ? 700 : 400,
              }}>
                {score}
              </span>
            </div>
          );
        })}
      </div>

      {/* Historical trend */}
      {trends && trends.length > 1 && (
        <>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
            {lang === 'zh' ? '8周走势（你的分数）' : '8-week trend (your score)'}
          </h4>
          <TrendLine data={trends} color={C.ac} C={C} />
        </>
      )}
    </div>
  );
}

function PriorityMetricDetailView({ metric, trend, C, lang }: {
  metric: PriorityMetric;
  trend: Array<{ week_of: string; score: number }> | undefined;
  C: ColorSet;
  lang: string;
}) {
  return (
    <div>
      <div style={{
        padding: '12px 14px', background: `${C.ac}10`, borderLeft: `3px solid ${C.ac}`,
        borderRadius: 6, marginBottom: 18,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          {lang === 'zh' ? '本周为什么优先' : 'Why priority this week'}
        </div>
        <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.6 }}>
          {metric.priority_rationale}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
        <div style={{ padding: 12, background: C.s2, borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>{lang === 'zh' ? '你的当前分' : 'Your score'}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.ac }}>{metric.your_score}</div>
        </div>
        <div style={{ padding: 12, background: C.s2, borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 4 }}>
            {lang === 'zh' ? '领先者' : 'Leader'} — {metric.best_competitor.name}
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.tx }}>{metric.best_competitor.score}</div>
        </div>
      </div>

      {trend && (
        <>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
            {lang === 'zh' ? '你的8周走势' : 'Your 8-week trend'}
          </h4>
          <TrendLine data={trend} color={C.ac} C={C} />
        </>
      )}
    </div>
  );
}

function WhiteSpaceDetailView({ item, C, lang }: {
  item: WhiteSpace; C: ColorSet; lang: string;
}) {
  return (
    <div>
      {/* Opportunity score */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 18, padding: '10px 12px',
        background: C.s2, borderRadius: 8,
      }}>
        <span style={{ fontSize: 10, color: C.t3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {lang === 'zh' ? '机会评分' : 'Opportunity score'}
        </span>
        <div style={{ flex: 1, height: 8, background: C.bd, borderRadius: 4, overflow: 'hidden' }}>
          <div style={{
            width: `${item.opportunity_score}%`, height: '100%',
            background: '#22c55e', borderRadius: 4,
          }} />
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>
          {item.opportunity_score}/100
        </span>
      </div>

      {/* Reasoning */}
      <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 6px' }}>
        {lang === 'zh' ? '为什么是空白' : 'Why this is white space'}
      </h4>
      <p style={{ fontSize: 13, color: C.tx, margin: '0 0 18px', lineHeight: 1.7 }}>
        {item.reasoning}
      </p>

      {/* Supporting data */}
      <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
        {lang === 'zh' ? '支撑数据' : 'Supporting evidence'}
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
        {item.supporting_data.map((d, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, alignItems: 'flex-start',
            padding: '8px 12px', background: C.s2, borderRadius: 6,
            fontSize: 13,
          }}>
            <span style={{ color: C.t3, minWidth: 110 }}>{d.label}</span>
            <span style={{ color: C.tx, flex: 1 }}>
              {d.value}
              {d.source_url && (
                <a
                  href={d.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.ac, marginLeft: 6, fontSize: 11, textDecoration: 'none' }}
                >
                  {lang === 'zh' ? '来源 ↗' : 'source ↗'}
                </a>
              )}
            </span>
          </div>
        ))}
      </div>

      {/* Suggested action */}
      <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 6px' }}>
        {lang === 'zh' ? '建议行动' : 'Suggested action'}
      </h4>
      <div style={{
        padding: '12px 14px', background: `${C.ac}10`, borderLeft: `3px solid ${C.ac}`, borderRadius: 6,
        fontSize: 13, color: C.tx, lineHeight: 1.7,
      }}>
        {item.suggested_action}
      </div>
    </div>
  );
}

function TrendLine({ data, color, C }: {
  data: Array<{ week_of: string; score: number }>; color: string; C: ColorSet;
}) {
  if (data.length < 2) return null;
  const w = 560;
  const h = 110;
  const pad = 10;
  const values = data.map(d => d.score);
  const min = Math.min(...values) - 5;
  const max = Math.max(...values) + 5;
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);

  const points = data.map((d, i) => {
    const x = pad + i * stepX;
    const y = pad + (h - pad * 2) - ((d.score - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const polyline = points.map(p => p.join(',')).join(' ');
  const areaPoints = [
    `${pad},${h - pad}`,
    ...points.map(p => p.join(',')),
    `${pad + (data.length - 1) * stepX},${h - pad}`,
  ].join(' ');

  return (
    <div style={{
      padding: 12, background: C.s2, borderRadius: 8,
      overflow: 'auto',
    }}>
      <svg viewBox={`0 0 ${w} ${h + 20}`} width="100%" style={{ display: 'block', minWidth: 480 }}>
        <polygon points={areaPoints} fill={`${color}15`} />
        <polyline points={polyline} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={3} fill={color} />
        ))}
        {data.map((d, i) => (
          <text
            key={i} x={points[i][0]} y={h + 14}
            fontSize={9} fill={C.t3} textAnchor="middle"
          >
            {d.week_of.slice(5)}
          </text>
        ))}
        {data.map((d, i) => (
          <text
            key={`v-${i}`} x={points[i][0]} y={points[i][1] - 6}
            fontSize={9} fill={C.t2} textAnchor="middle" fontWeight={600}
          >
            {d.score}
          </text>
        ))}
      </svg>
    </div>
  );
}
