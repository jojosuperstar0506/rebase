/**
 * IndexCard — single composite-index card.
 *
 * Two visual sizes:
 *  - hero  : large number, optional direction arrow + delta, expandable Why
 *  - small : compact one-liner used for supporting indices in a pillar grid
 *
 * Each card surfaces:
 *  - own-brand vs best-competitor
 *  - drill-down "Explain this score" expandable (inputs + weights)
 *  - "Coverage pending" state when score is null (proxy or no data yet)
 *
 * Spec: SPEC-COMPOSITE-INDICES-V1.md §8
 */

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import {
  formatScore, directionArrow, type IndexName, type IndexValue,
} from '../../services/ciIndices';

interface IndexCardProps {
  indexName: IndexName;
  /** Resolved single-language label from backend resolveLang(). */
  label: string;
  ownValue: IndexValue | undefined;
  competitorValues: Array<{ brand: string; value: IndexValue }>;
  size?: 'hero' | 'small';
  workspaceBrandName: string;
}

export default function IndexCard({
  indexName, label, ownValue, competitorValues, size = 'small', workspaceBrandName,
}: IndexCardProps) {
  const { colors: C, lang } = useApp();
  const [expanded, setExpanded] = useState(false);

  const isHero = size === 'hero';
  const ownScore = ownValue?.score ?? null;
  const isCoveragePending = !ownValue || ownScore === null;
  const isProxy = Boolean(ownValue?.is_proxy);

  // Best competitor (excluding own brand)
  const sortedComp = [...competitorValues]
    .filter(c => c.value.score !== null)
    .sort((a, b) => (b.value.score ?? 0) - (a.value.score ?? 0));
  const bestComp = sortedComp[0];

  // Direction color
  const direction = ownValue?.direction || null;
  const delta = ownValue?.delta;
  const dirColor = direction === 'gaining' ? '#22c55e'
                 : direction === 'losing'  ? '#ef4444'
                 : C.t3;

  // Density pass: tighter padding + smaller numbers so 12 cards across the
  // page stop dominating screen real estate. Hero numbers were 36px; small
  // were 22px — both felt oversized for a consultant dashboard. New: 26px
  // hero, 18px small. Padding 18→14 (hero) and 12→10 (small).
  const containerStyle: CSSProperties = {
    background: C.s1,
    border: `1px solid ${C.bd}`,
    borderRadius: 10,
    padding: isHero ? 14 : 10,
    display: 'flex',
    flexDirection: 'column',
    gap: isHero ? 6 : 4,
    cursor: ownValue ? 'pointer' : 'default',
    transition: 'border-color .15s ease',
  };

  const labelStyle: CSSProperties = {
    fontSize: isHero ? 12 : 11,
    color: C.t2,
    fontWeight: 600,
    letterSpacing: 0.2,
    margin: 0,
  };

  const scoreStyle: CSSProperties = {
    fontSize: isHero ? 26 : 18,
    fontWeight: 800,
    color: isCoveragePending ? C.t3 : C.tx,
    lineHeight: 1,
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
  };

  const labelText = label;

  return (
    <div
      style={containerStyle}
      onClick={() => ownValue && setExpanded(e => !e)}
      onMouseEnter={(e) => { if (ownValue) (e.currentTarget.style.borderColor = C.ac); }}
      onMouseLeave={(e) => { (e.currentTarget.style.borderColor = C.bd); }}
    >
      {/* Header: label + (HERO badge) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={labelStyle}>{labelText}</span>
        {isProxy && (
          <span style={{
            fontSize: 9, padding: '2px 6px', borderRadius: 4,
            background: `${C.warning}20`, color: C.warning, fontWeight: 600,
          }}>
            {lang === 'zh' ? '估算' : 'PROXY'}
          </span>
        )}
      </div>

      {/* Score row */}
      {isCoveragePending ? (
        <div style={{ fontSize: isHero ? 13 : 12, color: C.t3, fontStyle: 'italic' }}>
          {lang === 'zh' ? '覆盖待补 (尚无数据)' : 'Coverage pending'}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={scoreStyle}>{formatScore(ownScore, indexName)}</span>
          {direction && (
            <span style={{ fontSize: isHero ? 18 : 13, color: dirColor, fontWeight: 700 }}>
              {directionArrow(direction)}
              {delta !== null && delta !== undefined && (
                <span style={{ marginLeft: 4 }}>{delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)}</span>
              )}
            </span>
          )}
          {/* Baseline subtitle (week-1 state) intentionally suppressed —
              previously read "baseline (Δ next week)" on every card before
              week-2 data arrives. That's noise repeated 12 times across
              the page; the Δ arrow appears organically once history
              accumulates. */}
        </div>
      )}

      {/* Best competitor comparison (hero only, when we have data) — also
          surface the gap so the user can read the position without doing
          mental math. Smaller font now since the hero number is also
          smaller; the comparison line should feel like supporting
          context, not a co-equal stat. */}
      {isHero && !isCoveragePending && bestComp && bestComp.brand !== workspaceBrandName && (
        <div style={{ fontSize: 11, color: C.t2 }}>
          {lang === 'zh' ? '榜首: ' : 'Leader: '}
          <strong style={{ color: C.tx }}>{bestComp.brand}</strong>{' '}
          <span style={{ color: C.t3, fontVariantNumeric: 'tabular-nums' }}>
            {formatScore(bestComp.value.score, indexName)}
          </span>
          {(() => {
            if (typeof ownScore !== 'number' || typeof bestComp.value.score !== 'number') return null;
            const gap = Math.round((ownScore - bestComp.value.score) * 10) / 10;
            const gapColor = gap > 0 ? '#22c55e' : gap < 0 ? '#ef4444' : C.t3;
            const sign = gap > 0 ? '+' : '';
            return (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 700, color: gapColor,
                background: `${gapColor}1a`, padding: '1px 6px', borderRadius: 8,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {sign}{gap}
              </span>
            );
          })()}
        </div>
      )}

      {/* Drill-down */}
      {expanded && ownValue && (
        <div style={{
          marginTop: 6, paddingTop: 10, borderTop: `1px solid ${C.bd}`,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.t2, letterSpacing: 0.4 }}>
            {lang === 'zh' ? '为什么是这个分数？' : 'Why this score?'}
          </span>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {ownValue.explain_text.map((line, i) => (
              <li key={i} style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>· {line}</li>
            ))}
          </ul>
          <span style={{ fontSize: 10, color: C.t3, marginTop: 4 }}>
            {ownValue.version}
          </span>
        </div>
      )}
    </div>
  );
}
