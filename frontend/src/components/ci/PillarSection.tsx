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
import { useApp } from '../../context/AppContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import IndexCard from './IndexCard';
import type { IndexName, PillarName, PillarConfig, IndicesResponse } from '../../services/ciIndices';

interface PillarSectionProps {
  pillarName: PillarName;
  pillarConfig: PillarConfig;
  data: IndicesResponse;
}

const PILLAR_ICONS: Record<PillarName, string> = {
  brand_equity: '🎯',
  marketing_engine: '📣',
  commerce_engine: '🚀',
};

const PILLAR_SUBTITLES: Record<PillarName, { zh: string; en: string }> = {
  brand_equity:     { zh: '消费者如何看待这个品牌',  en: 'How customers see them' },
  marketing_engine: { zh: '他们如何创造需求',       en: 'How they create demand' },
  commerce_engine:  { zh: '他们如何交付与销售',     en: 'What they ship + sell' },
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

  return (
    <section style={containerStyle}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>{PILLAR_ICONS[pillarName]}</span>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: C.tx, letterSpacing: -0.2 }}>
          {pillarLabel}
        </h3>
        <span style={{ fontSize: 12, color: C.t2 }}>
          · {lang === 'zh' ? PILLAR_SUBTITLES[pillarName].zh : PILLAR_SUBTITLES[pillarName].en}
        </span>
      </header>

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
