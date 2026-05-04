/**
 * PillarSection — one of the 3 pillars (Brand Equity / Marketing Engine /
 * Commerce Engine).
 *
 * Layout:
 *   ┌─ Pillar header (icon + title + subtitle)
 *   ├─ Hero index card (large)
 *   └─ Supporting indices grid (small cards, 2-4 per row)
 *
 * Spec: SPEC-COMPOSITE-INDICES-V1.md §8
 */

import type { CSSProperties } from 'react';
import { Crosshair, Megaphone, ShoppingBag, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import IndexCard from './IndexCard';
import type { IndexName, PillarName, PillarConfig, IndicesResponse } from '../../services/ciIndices';

interface PillarSectionProps {
  pillarName: PillarName;
  pillarConfig: PillarConfig;
  data: IndicesResponse;
}

const PILLAR_ICONS: Record<PillarName, LucideIcon> = {
  brand_equity: Crosshair,
  marketing_engine: Megaphone,
  commerce_engine: ShoppingBag,
};

// Each pillar has a longer "what this measures" description plus a
// "where Tory Burch stands" sentence customised to the workspace's own
// brand. The own-brand sentence is interpolated at render-time using the
// 12-index data (which we have) — so the text reads as a synthesis of
// the actual scores, not a hardcoded line. Demo workspace gets demo
// copy; real workspaces get the same template with their brand name.
const PILLAR_DESCRIPTIONS: Record<PillarName, { zh: string; en: string }> = {
  brand_equity: {
    zh: '消费者眼中这个品牌的资产与认知——综合声量份额、UGC 情绪极性、溢价支付意愿、回购话语密度等信号。这是品牌过去多年沉淀下来的"软资产"，决定消费者是否会为同等价格选择你。',
    en: "What customers carry around about this brand — composed of voice share, UGC sentiment polarity, premium-pricing willingness, and rebuy phrase density. The 'soft asset' that decides whether customers pick you over the next brand at the same price.",
  },
  marketing_engine: {
    zh: '品牌创造需求的执行引擎——内容产出节奏与互动效率、达人矩阵的广度与层级、关键词搜索可见度。这是"今天投多少 / 投得多准"的指标，决定下一季的客流量来自哪里。',
    en: "The execution engine that turns budget into demand — content output cadence and engagement efficiency, breadth and tier-mix of the KOL matrix, organic search visibility. The 'how much / how well are you spending right now' indicator that decides where next quarter's traffic comes from.",
  },
  commerce_engine: {
    zh: '产品与销售执行——爆款表现、上新节奏与一致性、趋势捕捉速度、设计与材料多样性、定价 / 折扣纪律。这是"产品 - 价格 - 渠道"的耦合，决定品牌资产能否变现。',
    en: 'The product-and-sell engine — hero-product traction, launch cadence and consistency, trend-capture speed, design / material diversity, pricing-and-discount discipline. The product × price × channel coupling that decides whether brand equity converts to revenue.',
  },
};

// "Where the workspace's own brand stands" per pillar. Computed lazily at
// render time from the indices data so we don't have to keep this in sync
// with the seeder. Falls back to a generic placeholder if the own brand is
// missing from indices (e.g. compute_all_for_workspace hasn't run yet).
function ownPositionSentence(
  pillar: PillarName,
  ownBrand: string,
  ownAhead: number,
  ownBehind: number,
  ownTied: number,
  totalForPillar: number,
  lang: string,
): string {
  if (totalForPillar === 0) {
    return lang === 'zh'
      ? `${ownBrand} 在该支柱下尚无指数计算结果。`
      : `${ownBrand} has no computed indices in this pillar yet.`;
  }
  const dominant = ownAhead > ownBehind ? 'leading' : ownBehind > ownAhead ? 'trailing' : 'mixed';
  if (lang === 'zh') {
    if (dominant === 'leading') {
      return `${ownBrand} 在该支柱表现强势——${totalForPillar} 项中领先 ${ownAhead} 项 / 落后 ${ownBehind} 项 / 持平 ${ownTied} 项。`;
    }
    if (dominant === 'trailing') {
      return `${ownBrand} 在该支柱整体落后——${totalForPillar} 项中领先 ${ownAhead} 项 / 落后 ${ownBehind} 项 / 持平 ${ownTied} 项。`;
    }
    return `${ownBrand} 在该支柱表现中性——${totalForPillar} 项中领先 ${ownAhead} 项 / 落后 ${ownBehind} 项 / 持平 ${ownTied} 项。`;
  }
  if (dominant === 'leading') {
    return `${ownBrand} is strong in this pillar — leading on ${ownAhead}, trailing on ${ownBehind}, tied on ${ownTied} of ${totalForPillar}.`;
  }
  if (dominant === 'trailing') {
    return `${ownBrand} is trailing in this pillar — leading on ${ownAhead}, trailing on ${ownBehind}, tied on ${ownTied} of ${totalForPillar}.`;
  }
  return `${ownBrand} is mixed in this pillar — leading on ${ownAhead}, trailing on ${ownBehind}, tied on ${ownTied} of ${totalForPillar}.`;
}

// Per-index methodology shown in the collapsible "How is this calculated?".
// Each line: index_label = key inputs (weights). Demo-grade explanation —
// not the literal Python formula but the directional logic each compute_*
// function in services/competitor_intel/composite_indices.py applies.
const PILLAR_METHODOLOGY: Record<PillarName, { zh: string[]; en: string[] }> = {
  brand_equity: {
    zh: [
      'Brand Heat = 声量 × 情绪极性 × 单帖互动量 (40 / 30 / 30)',
      'Brand NPS = 正面 UGC 密度 − 负面 UGC 密度 (上下限 ±100)',
      'Pricing Power Index = 平均成交价相对类目均值 × 0 折销售份额 (60 / 40)',
      'Loyalty Index = 回购话语密度 × 粉丝粘性 (70 / 30)',
    ],
    en: [
      'Brand Heat = voice volume × sentiment polarity × engagement per post (40 / 30 / 30)',
      'Brand NPS = positive UGC density − negative UGC density (capped at ±100)',
      'Pricing Power Index = avg sale price vs category mean × 0-discount sales share (60 / 40)',
      'Loyalty Index = rebuy phrase density × follower stickiness (70 / 30)',
    ],
  },
  marketing_engine: {
    zh: [
      'Content Velocity = 周帖量 × 单帖互动 × 跨平台一致性',
      'Influencer Footprint = KOL 总数 × 层级多样性 × 投放频率',
      'Search Dominance = 自然搜索量 × 关键词排名 × 声量份额',
    ],
    en: [
      'Content Velocity = posts/wk × engagement-per-post × cross-platform consistency',
      'Influencer Footprint = total KOL count × tier diversity × campaign frequency',
      'Search Dominance = organic search volume × keyword rank × share of voice',
    ],
  },
  commerce_engine: {
    zh: [
      'Hero Product Index = 顶级 SKU GMV × 集中度 × 同比增长',
      'Launch Cadence = 新品速度 × 一致性 (CV)',
      'Trend Capture = 趋势峰值至上市的滞后时间 × 接入深度',
      'Innovation Score = 材料 / 廓形多样性 × 标志设计密度',
      'Promotional Discipline = 全价销售份额 × 折扣深度方差',
    ],
    en: [
      'Hero Product Index = top-SKU GMV × concentration × YoY growth',
      'Launch Cadence = new-SKU velocity × consistency (CV)',
      'Trend Capture = trend-peak-to-launch lag × adoption depth',
      'Innovation Score = material / silhouette diversity × signature-design density',
      'Promotional Discipline = full-price share × discount-depth variance',
    ],
  },
};

export default function PillarSection({ pillarName, pillarConfig, data }: PillarSectionProps) {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const { workspace_brand_name, indices_by_competitor, index_labels, pillar_labels } = data;

  // pillar_labels values are already resolved single-language strings
  // (backend ran resolveLang based on ?lang=).
  const pillarLabel = pillar_labels[pillarName];
  const ownEntries = indices_by_competitor[workspace_brand_name] || {};
  const allCompetitors = Object.keys(indices_by_competitor);

  const valuesFor = (idx: IndexName) => allCompetitors
    .filter(b => b !== workspace_brand_name)
    .map(brand => ({ brand, value: indices_by_competitor[brand]?.[idx] }))
    .filter((c): c is { brand: string; value: NonNullable<typeof c.value> } => Boolean(c.value));

  const pillarColor = pillarName === 'brand_equity'     ? C.domainConsumer
                    : pillarName === 'marketing_engine' ? C.domainMarketing
                    :                                     C.domainProduct;

  const containerStyle: CSSProperties = {
    background: C.s1,
    border: `1px solid ${C.bd}`,
    borderLeft: `4px solid ${pillarColor}`,
    borderRadius: 10,
    padding: 18,
    marginBottom: 16,
  };

  const description = PILLAR_DESCRIPTIONS[pillarName];
  const methodology = PILLAR_METHODOLOGY[pillarName];

  // Compute the workspace's own ahead/behind/tied within this pillar so we
  // can render a "where TORY BURCH stands" sentence without hardcoding it
  // in the seeder. ±2-point tie threshold matches the scorecard logic.
  const TIE = 2;
  let ownAhead = 0, ownBehind = 0, ownTied = 0, totalForPillar = 0;
  const pillarIndices: IndexName[] = [pillarConfig.hero, ...pillarConfig.supporting];
  for (const idx of pillarIndices) {
    const ownVal = ownEntries[idx];
    if (!ownVal || ownVal.score === null || ownVal.score === undefined) continue;
    const ownScore = Number(ownVal.score);
    const compValues = valuesFor(idx);
    let bestComp = 0; let bestSeen = false;
    for (const c of compValues) {
      if (c.value.score === null || c.value.score === undefined) continue;
      const s = Number(c.value.score);
      if (!bestSeen || s > bestComp) { bestComp = s; bestSeen = true; }
    }
    if (!bestSeen) continue;
    const gap = ownScore - bestComp;
    totalForPillar++;
    if (Math.abs(gap) <= TIE) ownTied++;
    else if (gap > 0) ownAhead++;
    else ownBehind++;
  }
  const positionLine = workspace_brand_name
    ? ownPositionSentence(pillarName, workspace_brand_name, ownAhead, ownBehind, ownTied, totalForPillar, lang)
    : '';

  return (
    <section style={containerStyle}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {(() => { const PillarIcon = PILLAR_ICONS[pillarName]; return <PillarIcon size={18} strokeWidth={1.75} color={pillarColor} />; })()}
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.tx, letterSpacing: -0.2 }}>
          {pillarLabel}
        </h3>
      </header>
      {/* Long-form "what this measures" description + own-brand position line.
          Stacked on separate lines so each can run a full thought without
          crowding the icon/title. The methodology disclosure stays collapsed —
          analysts who want the formula click in. */}
      <p style={{ fontSize: 12.5, color: C.t2, margin: '0 0 8px', lineHeight: 1.6 }}>
        {lang === 'zh' ? description.zh : description.en}
      </p>
      {positionLine ? (
        <p style={{
          fontSize: 12, color: C.tx, margin: '0 0 10px', lineHeight: 1.55,
          padding: '6px 10px', background: `${pillarColor}10`,
          borderLeft: `3px solid ${pillarColor}`, borderRadius: 4,
        }}>
          {positionLine}
        </p>
      ) : null}
      <details style={{ marginBottom: 14 }}>
        <summary style={{
          fontSize: 11, color: C.t3, cursor: 'pointer', userSelect: 'none',
          letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600,
          outline: 'none',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          listStyle: 'none',
        }}>
          <ChevronDown size={11} strokeWidth={2.5} className="pillar-disclosure-chevron" />
          {lang === 'zh' ? '如何计算？' : 'How is this calculated?'}
        </summary>
        <ul style={{
          margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: C.t3,
          lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 3,
        }}>
          {(lang === 'zh' ? methodology.zh : methodology.en).map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>

      {/* Hero */}
      <div style={{ marginBottom: 12 }}>
        <IndexCard
          indexName={pillarConfig.hero}
          label={index_labels[pillarConfig.hero].label}
          ownValue={ownEntries[pillarConfig.hero]}
          competitorValues={valuesFor(pillarConfig.hero)}
          size="hero"
          workspaceBrandName={workspace_brand_name}
        />
      </div>

      {/* Supporting — responsive grid:
          mobile  → 1 col (everything stacks)
          tablet  → 2 cols
          desktop → up to 4 cols (capped to supporting.length so 2 supporting
                    don't stretch into 4 sparse columns) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns:
          bp === 'mobile'  ? '1fr' :
          bp === 'tablet'  ? 'repeat(2, 1fr)' :
                             `repeat(${Math.min(pillarConfig.supporting.length, 4)}, 1fr)`,
        gap: 10,
      }}>
        {pillarConfig.supporting.map(idxName => (
          <IndexCard
            key={idxName}
            indexName={idxName}
            label={index_labels[idxName].label}
            ownValue={ownEntries[idxName]}
            competitorValues={valuesFor(idxName)}
            size="small"
            workspaceBrandName={workspace_brand_name}
          />
        ))}
      </div>
    </section>
  );
}
