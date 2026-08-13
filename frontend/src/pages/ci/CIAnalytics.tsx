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

import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CSSProperties } from 'react';
import { AlertTriangle, BarChart3, ListChecks, Tag, TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';
import { MetricIcon } from '../../utils/metricIcons';
import { useApp } from '../../context/AppContext';
import type { ColorSet } from '../../theme/colors';
import CISubNav from '../../components/ci/CISubNav';
import { CIPageHeader } from '../../components/ci/CIPageHeader';
import CIDrillDownModal from '../../components/ci/CIDrillDownModal';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCIData } from '../../hooks/useCIData';
import {
  getAnalytics,
  type AnalyticsData, type PriorityMetric, type WhiteSpace, type FullMetric,
  type MetricDomain,
} from '../../services/ciMocks';
import { getBrandInsights } from '../../services/ciApi';
import { getIndices, type IndicesResponse, type PillarName } from '../../services/ciIndices';
import PillarSection from '../../components/ci/PillarSection';
import IndexScatterPlot from '../../components/ci/IndexScatterPlot';

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
  const [searchParams, setSearchParams] = useSearchParams();
  // Cross-link from Brief moves: ?focus_brand=Songmont highlights + scrolls
  // to the matching AI insight card. Cleared once consumed so the URL
  // doesn't keep nagging the user with a stale highlight.
  const focusBrand = searchParams.get('focus_brand') || null;
  const insightCardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [data, setData] = useState<AnalyticsData | null>(null);
  const [insights, setInsights] = useState<Record<string, string>>({});
  const [indices, setIndices] = useState<IndicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [showAllMetrics, setShowAllMetrics] = useState(false);

  // After data + insights load, scroll the focused brand's card into view.
  useEffect(() => {
    if (!focusBrand) return;
    if (loading) return;
    const el = insightCardRefs.current[focusBrand];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusBrand, loading, insights]);

  // Drill-down state — a single slot for whatever the user clicked
  type DrillTarget =
    | { kind: 'metric'; metric: FullMetric }
    | { kind: 'priority'; metric: PriorityMetric }
    | { kind: 'whitespace'; item: WhiteSpace }
    | null;
  const [drill, setDrill] = useState<DrillTarget>(null);

  const workspaceId = workspace?.id || 'mock';

  useEffect(() => {
    // Don't fire API calls before workspace state hydrates.
    if (!workspace?.id || workspace.id === 'mock' || workspace.id === 'local') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    getAnalytics(workspaceId, lang).then(d => {
      setData(d);
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
    // brand_insight rows live in analysis_results.ai_narrative; the analytics
    // grid intentionally omits them (they're text, not scores). Surface them
    // alongside as a separate panel.
    if (workspaceId && workspaceId !== 'mock') {
      getBrandInsights(workspaceId, lang).then(setInsights).catch(() => setInsights({}));
      // Composite indices (3 pillars × 12 indices) — additive layer; fetched
      // alongside legacy analytics so the page degrades gracefully if the
      // /api/ci/indices endpoint is missing on an older backend. lang is
      // passed so the backend resolveLang() returns single-language strings
      // (PR #31 bilingual pattern).
      getIndices(workspaceId, lang).then(setIndices).catch(() => setIndices(null));
    } else {
      setInsights({});
      setIndices(null);
    }
  }, [workspaceId, lang]);

  // ─── Styles ────────────────────────────────────────────────────────────

  const pageStyle: CSSProperties = {
    background: C.bg, color: C.tx, minHeight: '100vh',
    padding: isMobile ? '16px 12px' : '32px 24px',
    fontFamily: 'var(--font-sans)',
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
            <AlertTriangle size={28} strokeWidth={1.75} color="#ef4444" style={{ marginBottom: 10 }} />
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
          <CIPageHeader
            eyebrow={lang === 'zh' ? '// 分析' : '// analytics'}
            title={lang === 'zh' ? '暂无分析数据' : 'No analytics yet'}
            subtitle={lang === 'zh'
              ? '// 竞品数据抓取并分析完成后，分析报告将显示在这里'
              : '// analytics appear here after your first data sync + analysis run'}
          />
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      <div style={container}>
        <CISubNav />

        <CIPageHeader
          eyebrow={lang === 'zh' ? '// 分析 · 竞争位置' : '// analytics · competitive position'}
          title={lang === 'zh' ? '分析' : 'Analytics'}
          subtitle={lang === 'zh'
            ? '// 本周竞争位置 + 各项指数与竞品对比'
            : '// your competitive position + per-index comparison vs competitors'}
        />

        {/* Cross-link banner — visible when arriving from a Brief move's
            brand chip click. Shows which brand we're focused on + a way
            to clear and see the full page. */}
        {focusBrand && (
          <div style={{
            background: `${C.ac}10`,
            border: `1px solid ${C.ac}40`,
            borderRadius: 8,
            padding: '10px 14px',
            marginBottom: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}>
            <div style={{ fontSize: 13, color: C.tx }}>
              {lang === 'zh' ? '正在聚焦于：' : 'Focusing on: '}
              <strong style={{ color: C.ac }}>{focusBrand}</strong>
              <span style={{ marginLeft: 8, fontSize: 12, color: C.t2 }}>
                {lang === 'zh' ? '（已自动滚动至该品牌的 AI 洞察卡片）' : '(scrolled to its AI insight card)'}
              </span>
            </div>
            <button
              onClick={() => {
                searchParams.delete('focus_brand');
                setSearchParams(searchParams, { replace: true });
              }}
              style={{
                fontSize: 11, color: C.t2, background: 'transparent',
                border: `1px solid ${C.bd}`, borderRadius: 6,
                padding: '4px 10px', cursor: 'pointer',
              }}
            >
              {lang === 'zh' ? '清除' : 'Clear'}
            </button>
          </div>
        )}

        {/* ─── §0a. Competitive map (scatter) — the page hero ────────────
             Analytics answers "where do I stand", and a 2-axis positioning
             matrix is the most direct answer to that: every brand plotted,
             quadrant lines at the midpoint, so an empty quadrant reads as
             white space you could move into.

             This lived on Brief until 2026-05-05. Moving it here restores
             the split: Brief = narrative (what happened, what to do),
             Analytics = position (where everyone sits, what is uncontested). */}
        {indices && Object.keys(indices.indices_by_competitor).length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <SectionHeader
              title={lang === 'zh' ? '竞争地图 · 白空间' : 'Competitive map · white space'}
              subtitle={lang === 'zh'
                ? '任选 2 项指数作为 X / Y 轴。空白象限 = 无人占据的位置 — 那是你可以进攻的地方。'
                : 'Pick any 2 indices as X / Y. An empty quadrant means nobody is there — that is where you can play.'}
              count={null}
              C={C}
            />
            <IndexScatterPlot data={indices} />
          </section>
        )}

        {/* ─── §0b. Scorecard ───────────────────────────────────────────
             "Where you stand at a glance" — the consultant-grade answer-first
             pattern. Computes ahead/behind/tied counts + strongest/weakest 3
             from the indices data. Defensive: renders nothing if own brand
             is missing from indices (e.g. compute_all_for_workspace hasn't
             run yet on this workspace). */}
        {indices && (
          <IndexScorecard indices={indices} C={C} lang={lang} isMobile={isMobile} />
        )}

        {/* ─── §0c. Composite indices (3 pillars × 12 indices) ──────────
             The detailed breakdown that backs up the scorecard. Each pillar
             carries its own description + methodology disclosure. */}
        {indices && Object.keys(indices.indices_by_competitor).length > 0 && (
          <section style={{ marginBottom: 28 }}>
            <SectionHeader
              title={lang === 'zh' ? '12 项指数 · 详细分解' : '12 Indices · Detail'}
              subtitle={lang === 'zh'
                ? '按 3 大支柱分组 · 点击「如何计算？」展开方法论 · 点击任一卡片查看输入与权重。'
                : 'Grouped by 3 pillars · click "How is this calculated?" for methodology · click any card for inputs + weights.'}
              count={null}
              C={C}
            />
            {(['brand_equity', 'marketing_engine', 'commerce_engine'] as PillarName[]).map(pillar => (
              <PillarSection
                key={pillar}
                pillarName={pillar}
                pillarConfig={indices.hierarchy.pillars[pillar]}
                data={indices}
              />
            ))}
          </section>
        )}

        {/* ─── §A. Priority metrics — REMOVED ──────────────────────────────
             The scorecard's "Watch:" pills cover the same ground (top
             negative-gap indices) without the duplicate card grid. If we
             ever bring this back, it should be a tighter inline list, not
             a 2-column card grid. */}

        {/* ─── §A.5 Brand insights (DeepSeek narratives per competitor) ──
            Always render the section when there's a workspace brand_name
            (we'll show an own-brand placeholder card even if no competitor
            insights exist yet — better than a missing section). */}
        {(Object.keys(insights).length > 0 || data.workspace_brand_name) && (
          <section style={{ marginBottom: 36 }}>
            <SectionHeader
              title={lang === 'zh' ? 'AI 品牌洞察' : 'AI brand insights'}
              subtitle={lang === 'zh'
                ? '每个品牌的 AI 综合诊断 · 点击展开。'
                : 'Per-brand AI diagnosis · click to expand.'}
              count={Object.keys(insights).length + (data.workspace_brand_name && !insights[data.workspace_brand_name] ? 1 : 0)}
              C={C}
            />
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 12,
            }}>
              {/* Own-brand card — pinned first when own-brand isn't in
                  insights (which is the common case after the OMI/Songmont
                  identity fix removed own brand from workspace_competitors).
                  Explains why and points the user to where their own analysis
                  lives. Closes coverage audit §8.3 #3. */}
              {data.workspace_brand_name && !insights[data.workspace_brand_name] && (
                <BrandInsightCard
                  key="__own__"
                  brand={data.workspace_brand_name}
                  isOwn
                  narrative={lang === 'zh'
                    ? '你的品牌还未生成 AI 综合诊断。AI 诊断目前仅对追踪的竞品自动生成；你的品牌的策略综合在「简报」页的 verdict 卡片中（每周更新）。'
                    : 'No AI brand-insight yet for your own brand — AI insights are auto-generated for tracked competitors only. Your brand\'s strategic synthesis lives on the Brief page\'s verdict card (refreshed weekly).'}
                  C={C}
                  lang={lang}
                  highlight={focusBrand === data.workspace_brand_name}
                  cardRef={el => { insightCardRefs.current[data.workspace_brand_name] = el; }}
                />
              )}
              {Object.entries(insights).map(([brand, narrative]) => (
                <BrandInsightCard
                  key={brand}
                  brand={brand}
                  isOwn={brand === data.workspace_brand_name}
                  narrative={narrative}
                  C={C}
                  lang={lang}
                  highlight={focusBrand === brand}
                  cardRef={el => { insightCardRefs.current[brand] = el; }}
                />
              ))}
            </div>
          </section>
        )}

        {/* ─── §B. White space — REMOVED from Analytics ───────────────────
             The strategic-opportunity content (channel / dimension / keyword
             bets) doesn't belong on a metrics-deep-dive page, and the card
             rendering currently leaks raw bilingual JSON for unresolved
             title / summary fields. Data still flows from /api/ci/brief —
             we just don't surface it here anymore. Future home: Library or
             a dedicated /ci/opportunity tab. */}

        {/* ─── §C. All 12 indices (collapsed) ────────────────────────────
             Flat-grid view of the 12 composite indices — same data the
             pillar grid above renders, but flat instead of grouped, for
             quick scanning. Used to source from data.all_metrics (the
             legacy raw-metric scores: Mindshare / Keywords / Hot
             Products / etc.); now sources from the composite indices
             so the names match the rest of the page (Brand Heat /
             Brand NPS / Pricing Power / etc.). */}
        {indices && Object.keys(indices.indices_by_competitor).length > 0 && (() => {
          const ownBrand = indices.workspace_brand_name;
          const ownEntries = indices.indices_by_competitor[ownBrand] || {};
          const allIndexNames = Object.keys(indices.index_labels) as Array<keyof typeof indices.index_labels>;
          const competitorBrands = Object.keys(indices.indices_by_competitor).filter(b => b !== ownBrand);

          return (
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
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <ListChecks size={14} strokeWidth={2} />
                  {lang === 'zh' ? '查看全部 12 项指数（平铺视图）' : 'See all 12 indices (flat view)'}
                  <span style={{ color: C.t3, marginLeft: 4 }}>· {allIndexNames.length}</span>
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
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(220px, 1fr))',
                  gap: 10,
                }}>
                  {allIndexNames.map(idxName => {
                    const labelEntry = indices.index_labels[idxName];
                    const ownVal = ownEntries[idxName];
                    // Best competitor on this index
                    let bestComp: { brand: string; score: number } | null = null;
                    for (const c of competitorBrands) {
                      const v = indices.indices_by_competitor[c]?.[idxName];
                      if (v && v.score !== null && v.score !== undefined) {
                        const s = Number(v.score);
                        if (!bestComp || s > bestComp.score) bestComp = { brand: c, score: s };
                      }
                    }
                    return (
                      <CompositeIndexMiniCard
                        key={idxName}
                        label={labelEntry?.label || String(idxName)}
                        pillar={labelEntry?.pillar || 'brand_equity'}
                        ownScore={ownVal?.score ?? null}
                        isProxy={Boolean(ownVal?.is_proxy)}
                        leader={bestComp}
                        C={C}
                        lang={lang}
                      />
                    );
                  })}
                </div>
              )}
            </section>
          );
        })()}
      </div>

      {/* ─── Drill-down modal ─────────────────────────────────────────── */}
      {drill?.kind === 'metric' && (
        <CIDrillDownModal
          open={true}
          onClose={() => setDrill(null)}
          title={lang === 'zh' ? drill.metric.label.zh : drill.metric.label.en}
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
          title={lang === 'zh' ? drill.metric.label.zh : drill.metric.label.en}
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
          title={drill.item.title}
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

/**
 * IndexScorecard — compact "where you stand" strip at the top of Analytics.
 *
 * Single horizontal band (~80px tall on desktop, stacks on mobile) showing:
 *   Trend pill · Ahead/Behind/Tied inline counts · Top 3 weakest indices
 *
 * Replaces the previous full-card scorecard which took ~600px of vertical
 * real estate for what is essentially a sentence's worth of information.
 *
 * Defensive: returns null if own brand is missing from indices (e.g. backend
 * hasn't computed indices for own brand yet).
 */
function IndexScorecard({ indices, C, lang, isMobile }: {
  indices: IndicesResponse; C: ColorSet; lang: string; isMobile: boolean;
}) {
  const ownBrand = indices.workspace_brand_name;
  const ownScores = indices.indices_by_competitor[ownBrand];
  if (!ownScores) return null;

  const allBrands = Object.keys(indices.indices_by_competitor);
  const competitors = allBrands.filter(b => b !== ownBrand);
  const indexNames = Object.keys(indices.index_labels);

  const positions: Array<{ idx: string; ownScore: number; bestComp: number; gap: number; label: string }> = [];
  for (const idx of indexNames) {
    const ownVal = ownScores[idx as keyof typeof ownScores];
    if (!ownVal || ownVal.score === null || ownVal.score === undefined) continue;
    const ownScore = Number(ownVal.score);

    let bestComp = 0;
    let bestSeen = false;
    for (const c of competitors) {
      const v = indices.indices_by_competitor[c]?.[idx as keyof typeof ownScores];
      if (v && v.score !== null && v.score !== undefined) {
        const s = Number(v.score);
        if (!bestSeen || s > bestComp) { bestComp = s; bestSeen = true; }
      }
    }
    if (!bestSeen) continue;

    positions.push({
      idx,
      ownScore,
      bestComp,
      gap: Math.round((ownScore - bestComp) * 10) / 10,
      label: indices.index_labels[idx as keyof typeof indices.index_labels]?.label || idx,
    });
  }

  if (positions.length === 0) return null;

  // ±2 tie threshold filters out noise so ahead/behind counts mean something.
  const TIE_THRESHOLD = 2;
  let ahead = 0, behind = 0, tied = 0;
  for (const p of positions) {
    if (Math.abs(p.gap) <= TIE_THRESHOLD) tied++;
    else if (p.gap > 0) ahead++;
    else behind++;
  }

  const sorted = [...positions].sort((a, b) => b.gap - a.gap);
  const weakest = [...sorted].reverse().filter(p => p.gap < -TIE_THRESHOLD).slice(0, 3);

  const netDirection = ahead > behind ? 'gaining' : ahead < behind ? 'losing' : 'steady';
  const trendC = netDirection === 'gaining' ? '#22c55e' : netDirection === 'losing' ? '#ef4444' : C.t3;
  const trendIcon = netDirection === 'gaining' ? <TrendingUp size={11} strokeWidth={2.5} />
                  : netDirection === 'losing' ? <TrendingDown size={11} strokeWidth={2.5} />
                  : <Minus size={11} strokeWidth={2.5} />;
  const trendLabelText = lang === 'zh'
    ? (netDirection === 'gaining' ? '净领先' : netDirection === 'losing' ? '净落后' : '势均力敌')
    : (netDirection === 'gaining' ? 'Net ahead' : netDirection === 'losing' ? 'Net behind' : 'Even');

  const tagStyle = (color: string): CSSProperties => ({
    display: 'inline-flex', alignItems: 'baseline', gap: 4,
    fontSize: 12, fontWeight: 600, color: C.t2,
    fontVariantNumeric: 'tabular-nums',
  });
  const numStyle = (color: string): CSSProperties => ({
    fontSize: 14, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums',
  });

  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{
        background: `linear-gradient(135deg, ${C.s1} 0%, ${trendC}08 100%)`,
        border: `1px solid ${trendC}44`,
        borderRadius: 10,
        padding: isMobile ? '12px 14px' : '14px 18px',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'flex-start' : 'center',
        gap: isMobile ? 10 : 18,
        flexWrap: 'wrap',
      }}>
        {/* Trend pill */}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          fontSize: 11, fontWeight: 700, color: trendC,
          background: `${trendC}18`, padding: '3px 9px', borderRadius: 16,
          letterSpacing: '0.05em', textTransform: 'uppercase', flexShrink: 0,
        }}>
          {trendIcon} {trendLabelText}
        </span>

        {/* Inline counts */}
        <div style={{ display: 'flex', gap: 14, alignItems: 'baseline' }}>
          <span style={tagStyle(C.t2)}>
            <span style={numStyle('#22c55e')}>{ahead}</span>
            <span>{lang === 'zh' ? '领先' : 'ahead'}</span>
          </span>
          <span style={{ color: C.bd }}>·</span>
          <span style={tagStyle(C.t2)}>
            <span style={numStyle('#ef4444')}>{behind}</span>
            <span>{lang === 'zh' ? '落后' : 'behind'}</span>
          </span>
          <span style={{ color: C.bd }}>·</span>
          <span style={tagStyle(C.t2)}>
            <span style={numStyle(C.t3)}>{tied}</span>
            <span>{lang === 'zh' ? '势均' : 'tied'}</span>
          </span>
          <span style={{ fontSize: 11, color: C.t3, marginLeft: 2 }}>
            {lang === 'zh' ? `/ ${positions.length} 项` : `/ ${positions.length}`}
          </span>
        </div>

        {/* Weakest 3 — inline pills */}
        {weakest.length > 0 && (
          <>
            {!isMobile && <span style={{ color: C.bd, marginLeft: 'auto' }}>·</span>}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontSize: 11, color: C.t3,
            }}>
              <span style={{ fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {lang === 'zh' ? '需关注' : 'Watch'}:
              </span>
              {weakest.map(w => (
                <span key={w.idx} style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 4,
                  fontSize: 12, fontWeight: 600, color: C.tx,
                }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }} title={w.label}>
                    {w.label}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: '#ef4444',
                    background: '#ef44441a', padding: '1px 6px', borderRadius: 8,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {w.gap}
                  </span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function SectionHeader({ title, subtitle, count, C }: {
  title: string; subtitle: string; count: number | null; C: ColorSet;
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 style={{ fontSize: 13, fontWeight: 700, color: C.t2, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
          {title}
        </h2>
        {count !== null && (
          <span style={{
            fontSize: 11, color: C.t3,
            background: C.s2, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
          }}>
            {count}
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
        {subtitle}
      </div>
    </div>
  );
}

/** First-paragraph extractor for AI insight previews. The seeder writes
 * narratives as `\n`-separated paragraphs (诊断 / 关键数据 / 用户语 /
 * TORY BURCH 应对). The first paragraph is always the diagnosis claim —
 * a perfect 1-line preview. Falls back to a hard truncation for long
 * single-paragraph narratives. */
function firstParagraph(text: string, maxChars = 220): string {
  if (!text) return '';
  const trimmed = text.trim();
  const para = (trimmed.split('\n')[0] || '').trim();
  const candidate = para || trimmed;
  if (candidate.length > maxChars) return candidate.slice(0, maxChars).trim() + '…';
  return candidate;
}

function BrandInsightCard({ brand, isOwn, narrative, C, lang, highlight, cardRef }: {
  brand: string; isOwn: boolean; narrative: string; C: ColorSet; lang: string;
  highlight?: boolean;
  cardRef?: (el: HTMLDivElement | null) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const preview = firstParagraph(narrative);
  const hasMore = preview.length < (narrative || '').trim().length;
  // When the cross-link from Brief targets this card, default to expanded
  // so the user sees the full diagnosis without an extra click.
  React.useEffect(() => {
    if (highlight) setExpanded(true);
  }, [highlight]);

  return (
    <div
      ref={cardRef}
      style={{
        background: C.s1,
        // When highlight=true (cross-linked from Brief), pulse a 2px outline
        // so the user spots which card the click landed on.
        border: `1px solid ${highlight ? C.ac : isOwn ? `${C.ac}55` : C.bd}`,
        outline: highlight ? `2px solid ${C.ac}55` : 'none',
        outlineOffset: 1,
        borderLeft: `4px solid ${isOwn ? C.ac : C.t3}`,
        borderRadius: 12,
        padding: 14,
        transition: 'outline 0.3s, border-color 0.3s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {isOwn && <Tag size={12} strokeWidth={2} color={C.ac} />}
        <span style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{brand}</span>
        {isOwn && (
          <span style={{
            fontSize: 10, fontWeight: 700, color: C.ac,
            background: `${C.ac}15`, padding: '2px 6px', borderRadius: 4,
            letterSpacing: '0.05em', textTransform: 'uppercase',
          }}>
            {lang === 'zh' ? '你的品牌' : 'You'}
          </span>
        )}
      </div>
      <p style={{ fontSize: 13, color: C.t2, margin: 0, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
        {expanded ? narrative : preview}
      </p>
      {hasMore && (
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            marginTop: 10,
            background: 'transparent',
            border: 'none',
            color: C.ac,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            padding: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span>{expanded
            ? (lang === 'zh' ? '收起' : 'Show less')
            : (lang === 'zh' ? '查看完整诊断' : 'Read full diagnosis')}</span>
          <ChevronDown
            size={12}
            strokeWidth={2.5}
            style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
          />
        </button>
      )}
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
        <MetricIcon name={metric.icon} size={16} color={C.ac} />
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

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11, color: C.ac, fontWeight: 600 }}>
          {lang === 'zh' ? '点击查看历史走势 →' : 'Click to see trend →'}
        </span>
        <span
          title={lang === 'zh'
            ? '点击展开后可查看支撑该指标分数的真实数据（生长率、声量份额、平台分布等）'
            : 'Click through to see the underlying inputs that produced each brand\'s score'}
          style={{
            fontSize: 10, fontWeight: 600, color: C.t3,
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', background: C.s2, borderRadius: 10,
            border: `1px solid ${C.bd}`,
          }}
        >
          ⓘ {lang === 'zh' ? '为什么是这个分数' : 'Why this score?'}
        </span>
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
          display: 'inline-flex', alignItems: 'center', gap: 5,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: 2, background: catColor, display: 'inline-block' }} />
          {lang === 'zh' ? catLabelMap[item.category].zh : catLabelMap[item.category].en}
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

// Metric_keys whose scoring pipelines exist but whose scraper inputs aren't
// captured yet (note-feed enrichment is paused post-burner). They show 0
// across every brand, which makes the product look broken — render an honest
// "coverage pending" pill instead. See METRIC-LOGIC-INVESTIGATION-2026-05-02.
const COVERAGE_PENDING_METRICS = new Set(['design_profile', 'kol_strategy']);

function isCoveragePending(metric: FullMetric): boolean {
  if (!COVERAGE_PENDING_METRICS.has(metric.metric_key)) return false;
  const scores = Object.values(metric.scores);
  if (scores.length === 0) return true;
  return scores.every(s => s === 0);
}

/**
 * Flat-grid mini-card for a single composite index. Used by the
 * "See all 12 indices" expandable on the Analytics page. Visual mirror
 * of AllMetricMiniCard (legacy) but reads from indices_by_competitor
 * data instead of FullMetric.
 *
 * Pillar dot color matches the pillar grid above (brand_equity = consumer
 * domain pink, marketing_engine = marketing domain blue, commerce_engine
 * = product domain orange) — keeps the visual language consistent.
 */
function CompositeIndexMiniCard({ label, pillar, ownScore, isProxy, leader, C, lang }: {
  label: string;
  pillar: PillarName;
  ownScore: number | null;
  isProxy: boolean;
  leader: { brand: string; score: number } | null;
  C: ColorSet;
  lang: string;
}) {
  const pending = ownScore === null || ownScore === undefined;
  const own = pending ? 0 : Math.round(Number(ownScore));
  const leaderScore = leader ? Math.round(leader.score) : null;
  const isLeading = !pending && leader ? own >= leaderScore! : !leader;
  const pillarLabel = pillar === 'brand_equity' ? (lang === 'zh' ? '品牌资产' : 'Brand Equity')
                    : pillar === 'marketing_engine' ? (lang === 'zh' ? '营销引擎' : 'Marketing Engine')
                    : (lang === 'zh' ? '商业引擎' : 'Commerce Engine');
  const pillarDotColor = pillar === 'brand_equity' ? C.domainConsumer
                       : pillar === 'marketing_engine' ? C.domainMarketing
                       : C.domainProduct;

  return (
    <div style={{
      background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
      padding: 12, opacity: pending ? 0.85 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, justifyContent: 'space-between' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, background: pillarDotColor, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: C.t3 }}>{pillarLabel}</span>
        </span>
        {isProxy && (
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 4,
            background: `${C.warning || '#f59e0b'}20`, color: C.warning || '#f59e0b', fontWeight: 600,
            letterSpacing: 0.5, textTransform: 'uppercase',
          }}>
            {lang === 'zh' ? '估算' : 'PROXY'}
          </span>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 6 }}>
        {label}
      </div>
      {pending ? (
        <div style={{
          display: 'inline-block', marginTop: 2,
          fontSize: 11, fontWeight: 600, color: C.t3,
          background: C.s2, border: `1px dashed ${C.bd}`,
          padding: '3px 9px', borderRadius: 12,
        }}>
          {lang === 'zh' ? '覆盖待补' : 'Coverage pending'}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={{
              fontSize: 22, fontWeight: 700,
              color: isLeading ? '#22c55e' : C.tx,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {own}
            </span>
            <span style={{ fontSize: 11, color: C.t3 }}>/ 100</span>
          </div>
          {leader && (
            <div style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
              {lang === 'zh' ? '领先者：' : 'Leader: '}
              {leader.brand} ({leaderScore})
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AllMetricMiniCard({ metric, ownBrand, onClick, C, lang }: {
  metric: FullMetric; ownBrand: string; onClick: () => void; C: ColorSet; lang: string;
}) {
  const pending = isCoveragePending(metric);
  const scores = Object.entries(metric.scores);
  const ownScore = metric.scores[ownBrand] ?? 0;
  const bestEntry = scores.filter(([n]) => n !== ownBrand).sort((a, b) => b[1] - a[1])[0];
  const leading = bestEntry ? ownScore >= bestEntry[1] : true;
  const dColor = deltaColor(metric.delta, C);

  const pendingTooltip = lang === 'zh'
    ? '该指标的评分管线已就绪，但所需的笔记/作者/材料数据尚未抓取。下个迭代恢复笔记流抓取后即可上线。'
    : 'Scoring pipeline is ready, but the underlying note-feed scrape (authors, materials, top notes) is paused. Coverage lands once the burner-account scraper resumes.';

  return (
    <div
      onClick={pending ? undefined : onClick}
      title={pending ? pendingTooltip : undefined}
      style={{
        background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
        padding: 12, cursor: pending ? 'help' : 'pointer', transition: 'all 0.15s',
        opacity: pending ? 0.85 : 1,
      }}
      onMouseEnter={e => { if (!pending) e.currentTarget.style.borderColor = `${C.ac}55`; }}
      onMouseLeave={e => { if (!pending) e.currentTarget.style.borderColor = C.bd; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, background: domainColor(metric.domain, C), borderRadius: 2 }} />
        <span style={{ fontSize: 11, color: C.t3 }}>{domainLabel(metric.domain, lang)}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <MetricIcon name={metric.icon} size={13} color={C.ac} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>
          {lang === 'zh' ? metric.label.zh : metric.label.en}
        </span>
      </div>
      {pending ? (
        <div style={{
          display: 'inline-block', marginTop: 2,
          fontSize: 11, fontWeight: 600, color: C.t3,
          background: C.s2, border: `1px dashed ${C.bd}`,
          padding: '3px 9px', borderRadius: 12,
        }}>
          {lang === 'zh' ? '数据抓取中（敬请期待）' : 'Coverage pending'}
        </div>
      ) : (
        <>
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
        </>
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
                display: 'inline-flex', alignItems: 'center', gap: 4,
              }}>
                {isOwn && <Tag size={11} strokeWidth={2} color={C.ac} />}
                {name}
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

      {/* "Why this score?" — closes Joanna's gap analysis #16.
          Displays the raw_inputs that fed each brand's score. The inputs
          come pre-attached on the FullMetric (backend passthrough from
          analysis_results.raw_inputs JSONB). Each brand's inputs are
          rendered as key-value pairs; we let the user expand per-brand
          to keep the default view clean. */}
      <WhyThisScore metric={metric} ownBrand={ownBrand} C={C} lang={lang} />
    </div>
  );
}

// Pretty-print a raw_inputs value: numbers get fixed precision, percent-
// like fields get a % suffix, nested objects collapse to JSON for the
// "more details" expandable. Leaves human-readable strings alone.
function formatRawValue(key: string, val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'number') {
    // Heuristic: keys with 'pct' / 'rate' / 'growth' / 'share' look like %
    if (/_pct$|_rate$|_share$|_growth$/i.test(key) || /_pct\b|growth_/i.test(key)) {
      return val.toFixed(1) + '%';
    }
    return Number.isInteger(val) ? String(val) : val.toFixed(2);
  }
  if (typeof val === 'string') return val;
  if (Array.isArray(val)) return JSON.stringify(val);
  if (typeof val === 'object') return JSON.stringify(val, null, 2);
  return String(val);
}

function WhyThisScore({ metric, ownBrand, C, lang }: {
  metric: FullMetric; ownBrand: string; C: ColorSet; lang: string;
}) {
  const [expandedBrand, setExpandedBrand] = useState<string | null>(ownBrand);
  const allInputs = metric.raw_inputs || {};
  const brandsWithInputs = Object.keys(allInputs).filter(
    b => allInputs[b] && Object.keys(allInputs[b] as object).length > 0
  );
  if (brandsWithInputs.length === 0) return null;

  // Skip noisy keys that aren't useful for human inspection
  const SKIP_KEYS = new Set(['error', 'reason', 'raw_dump', 'note_authors']);

  return (
    <div style={{ marginTop: 22, paddingTop: 16, borderTop: `1px solid ${C.bd}` }}>
      <h4 style={{ fontSize: 12, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
        {lang === 'zh' ? '这个分数是怎么算出来的' : 'Why this score?'}
      </h4>
      <div style={{ fontSize: 11, color: C.t3, marginBottom: 10, lineHeight: 1.6 }}>
        {lang === 'zh'
          ? '展开每个品牌查看支撑该指标得分的真实数据 (来自 analysis_results.raw_inputs)。'
          : 'Expand each brand to see the underlying inputs that produced its score (from analysis_results.raw_inputs).'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {brandsWithInputs.map(brand => {
          const inputs = allInputs[brand] as Record<string, unknown>;
          const isExpanded = expandedBrand === brand;
          const isOwn = brand === ownBrand;
          const entries = Object.entries(inputs).filter(([k]) => !SKIP_KEYS.has(k));
          return (
            <div key={brand} style={{
              background: C.s2, borderRadius: 6,
              border: `1px solid ${isOwn ? `${C.ac}33` : C.bd}`,
            }}>
              <button
                onClick={() => setExpandedBrand(isExpanded ? null : brand)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center',
                  justifyContent: 'space-between', padding: '8px 12px',
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: 12, color: C.tx, fontWeight: isOwn ? 700 : 500,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  {isOwn && <Tag size={11} strokeWidth={2} color={C.ac} />}
                  {brand}
                </span>
                <span style={{ fontSize: 10, color: C.t3 }}>
                  {entries.length} {lang === 'zh' ? '项输入' : 'inputs'} {isExpanded ? '▾' : '▸'}
                </span>
              </button>
              {isExpanded && (
                <div style={{
                  padding: '4px 12px 10px', borderTop: `1px solid ${C.bd}`,
                  display: 'grid', gridTemplateColumns: 'minmax(120px, max-content) 1fr',
                  columnGap: 12, rowGap: 4,
                  fontSize: 11, fontFamily: 'monospace',
                }}>
                  {entries.map(([k, v]) => (
                    <React.Fragment key={k}>
                      <span style={{ color: C.t3 }}>{k}</span>
                      <span style={{ color: C.tx, wordBreak: 'break-word' }}>
                        {formatRawValue(k, v)}
                      </span>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
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
