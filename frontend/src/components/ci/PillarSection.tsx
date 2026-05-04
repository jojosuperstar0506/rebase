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

// 1-line "what this measures" — visible by default after the pillar header.
const PILLAR_DESCRIPTIONS: Record<PillarName, { zh: string; en: string }> = {
  brand_equity: {
    zh: '消费者眼中这个品牌的认知与偏好——基于声量、情绪、溢价意愿与回购信号。',
    en: 'How customers see this brand — synthesizing voice volume, sentiment, premium-pricing willingness, and rebuy signals.',
  },
  marketing_engine: {
    zh: '需求创造引擎的强度——内容产出节奏、达人合作广度、搜索可见度。',
    en: 'How loud and effective the demand-gen engine is — content cadence, influencer breadth, search visibility.',
  },
  commerce_engine: {
    zh: '产品上市与销售引擎——爆款拉动力、上新节奏、趋势捕捉、设计多样性、定价纪律。',
    en: 'How the product engine ships and sells — hero traction, launch cadence, trend capture, design diversity, pricing discipline.',
  },
};

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

  return (
    <section style={containerStyle}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        {(() => { const PillarIcon = PILLAR_ICONS[pillarName]; return <PillarIcon size={18} strokeWidth={1.75} color={pillarColor} />; })()}
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.tx, letterSpacing: -0.2 }}>
          {pillarLabel}
        </h3>
      </header>
      {/* 1-line description + methodology disclosure. The description sits on
          its own line so it can run a full sentence without crowding the
          icon/title. The disclosure stays collapsed by default — analysts
          who want the formula click in. */}
      <p style={{ fontSize: 12, color: C.t2, margin: '0 0 10px', lineHeight: 1.55 }}>
        {lang === 'zh' ? description.zh : description.en}
      </p>
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
