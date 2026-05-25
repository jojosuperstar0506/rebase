/**
 * IndexScatterPlot — pick any 2 of the 12 indices for X/Y, plot every
 * brand in the workspace as a point. Own brand is highlighted; competitors
 * are colored deterministically by name.
 *
 * Built as raw SVG (no charting dep). Hover any dot to see the brand name
 * and exact (x, y) values. Quadrant lines drawn at 50/50 (or 0/0 for NPS).
 *
 * Spec: SPEC-COMPOSITE-INDICES-V1.md (this is an addition by Will/Joanna
 * 2026-05-04 to allow comparative positioning across any two indices).
 */

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import {
  formatScore, indexRange,
  type IndexName, type IndicesResponse,
} from '../../services/ciIndices';

interface IndexScatterPlotProps {
  data: IndicesResponse;
}

// Deterministic HSL hue per brand name (mirrors brandColorHsl from CIBrief)
function brandColorHsl(name: string, sat = 65, light = 55): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, ${sat}%, ${light}%)`;
}

const INDEX_OPTIONS: IndexName[] = [
  'brand_heat', 'brand_nps', 'pricing_power_index', 'loyalty_index',
  'content_velocity_index', 'influencer_footprint', 'search_dominance',
  'hero_product_index', 'launch_cadence', 'trend_capture_index',
  'innovation_score', 'promotional_discipline',
];

export default function IndexScatterPlot({ data }: IndexScatterPlotProps) {
  const { colors: C, lang } = useApp();
  const [xAxis, setXAxis] = useState<IndexName>('brand_heat');
  const [yAxis, setYAxis] = useState<IndexName>('hero_product_index');
  const [hoveredBrand, setHoveredBrand] = useState<string | null>(null);

  const { workspace_brand_name, indices_by_competitor, index_labels } = data;
  const xRange = indexRange(xAxis);
  const yRange = indexRange(yAxis);

  // Layout
  const W = 640;
  const H = 420;
  const PAD = { top: 24, right: 24, bottom: 56, left: 60 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  // Convert (x, y) score to SVG coordinates
  const sx = (v: number) => PAD.left + ((v - xRange.min) / (xRange.max - xRange.min)) * plotW;
  const sy = (v: number) => PAD.top + (1 - (v - yRange.min) / (yRange.max - yRange.min)) * plotH;

  // Build points — one per brand that has BOTH x and y scores
  const points = useMemo(() => {
    const result: Array<{ brand: string; x: number; y: number; isOwn: boolean }> = [];
    for (const [brand, byIdx] of Object.entries(indices_by_competitor)) {
      const xv = byIdx[xAxis]?.score;
      const yv = byIdx[yAxis]?.score;
      if (xv === null || xv === undefined || yv === null || yv === undefined) continue;
      result.push({ brand, x: xv, y: yv, isOwn: brand === workspace_brand_name });
    }
    return result;
  }, [indices_by_competitor, xAxis, yAxis, workspace_brand_name]);

  // Axis ticks (5 evenly spaced)
  const xTicks = useMemo(() => {
    const step = (xRange.max - xRange.min) / 4;
    return [0, 1, 2, 3, 4].map(i => xRange.min + i * step);
  }, [xRange.min, xRange.max]);
  const yTicks = useMemo(() => {
    const step = (yRange.max - yRange.min) / 4;
    return [0, 1, 2, 3, 4].map(i => yRange.min + i * step);
  }, [yRange.min, yRange.max]);

  // Quadrant midlines: 50 for 0..100 axes, 0 for -100..100 (NPS)
  const xMid = xRange.min < 0 ? 0 : (xRange.min + xRange.max) / 2;
  const yMid = yRange.min < 0 ? 0 : (yRange.min + yRange.max) / 2;

  const selectStyle: CSSProperties = {
    background: C.s1, color: C.tx, border: `1px solid ${C.bd}`,
    borderRadius: 6, padding: '6px 10px', fontSize: 13, cursor: 'pointer',
    fontFamily: 'inherit',
  };

  // index_labels values are already resolved single-language strings (backend
  // ran resolveLang based on ?lang=). Just read .label.
  const xLabel = index_labels[xAxis].label;
  const yLabel = index_labels[yAxis].label;

  return (
    <div style={{
      background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10, padding: 16,
    }}>
      {/* Header + axis pickers */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.tx }}>
          {lang === 'zh' ? '指标定位散点图' : 'Index Positioning Map'}
        </h3>
        <span style={{ flex: 1 }} />
        <label style={{ fontSize: 12, color: C.t2, display: 'flex', gap: 6, alignItems: 'center' }}>
          {lang === 'zh' ? 'X 轴' : 'X axis'}
          <select value={xAxis} onChange={e => setXAxis(e.target.value as IndexName)} style={selectStyle}>
            {INDEX_OPTIONS.map(idx => (
              <option key={idx} value={idx}>
                {index_labels[idx].label}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: C.t2, display: 'flex', gap: 6, alignItems: 'center' }}>
          {lang === 'zh' ? 'Y 轴' : 'Y axis'}
          <select value={yAxis} onChange={e => setYAxis(e.target.value as IndexName)} style={selectStyle}>
            {INDEX_OPTIONS.map(idx => (
              <option key={idx} value={idx}>
                {index_labels[idx].label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Plot */}
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Plot background */}
          <rect x={PAD.left} y={PAD.top} width={plotW} height={plotH}
                fill="transparent" stroke={C.bd} strokeWidth={1} />

          {/* Quadrant midlines */}
          <line x1={sx(xMid)} y1={PAD.top} x2={sx(xMid)} y2={PAD.top + plotH}
                stroke={C.bd} strokeDasharray="3 4" />
          <line x1={PAD.left} y1={sy(yMid)} x2={PAD.left + plotW} y2={sy(yMid)}
                stroke={C.bd} strokeDasharray="3 4" />

          {/* X-axis ticks + labels */}
          {xTicks.map((tick, i) => (
            <g key={`xt-${i}`}>
              <line x1={sx(tick)} y1={PAD.top + plotH} x2={sx(tick)} y2={PAD.top + plotH + 4}
                    stroke={C.t3} />
              <text x={sx(tick)} y={PAD.top + plotH + 18} fontSize={10} fill={C.t2}
                    textAnchor="middle">{Math.round(tick)}</text>
            </g>
          ))}

          {/* Y-axis ticks + labels */}
          {yTicks.map((tick, i) => (
            <g key={`yt-${i}`}>
              <line x1={PAD.left - 4} y1={sy(tick)} x2={PAD.left} y2={sy(tick)} stroke={C.t3} />
              <text x={PAD.left - 8} y={sy(tick) + 3} fontSize={10} fill={C.t2}
                    textAnchor="end">{Math.round(tick)}</text>
            </g>
          ))}

          {/* Axis titles */}
          <text x={PAD.left + plotW / 2} y={H - 14} fontSize={12} fontWeight={600} fill={C.tx}
                textAnchor="middle">{xLabel}</text>
          <text x={16} y={PAD.top + plotH / 2} fontSize={12} fontWeight={600} fill={C.tx}
                textAnchor="middle" transform={`rotate(-90, 16, ${PAD.top + plotH / 2})`}>{yLabel}</text>

          {/* Points */}
          {points.map(p => {
            const cx = sx(p.x);
            const cy = sy(p.y);
            const isHovered = hoveredBrand === p.brand;
            const fill = p.isOwn ? C.ac : brandColorHsl(p.brand);
            const r = p.isOwn ? 11 : 8;
            return (
              <g key={p.brand} style={{ cursor: 'pointer' }}
                 onMouseEnter={() => setHoveredBrand(p.brand)}
                 onMouseLeave={() => setHoveredBrand(null)}>
                {/* Halo for own brand */}
                {p.isOwn && (
                  <circle cx={cx} cy={cy} r={r + 4} fill={fill} opacity={0.22} />
                )}
                <circle cx={cx} cy={cy} r={isHovered ? r + 2 : r}
                        fill={fill}
                        stroke={p.isOwn ? C.ac : C.s1}
                        strokeWidth={p.isOwn ? 2 : 1.5} />
                {/* Labels: ALWAYS show own brand (it's the anchor reference).
                    For competitors, show only on hover — when many brands
                    cluster (common in early-data scenarios where everyone's
                    bunched near the origin), always-on labels overlap and
                    become unreadable. Hover gives precision without visual
                    chaos. Caught 2026-05-26: 7 OMI competitors clustered,
                    labels were illegible (URBAN REVIVO became "URB...VIVO"). */}
                {(p.isOwn || isHovered) && (
                  <text x={cx} y={cy - r - 6} fontSize={p.isOwn ? 12 : 11}
                        fontWeight={p.isOwn ? 800 : 600}
                        fill={p.isOwn ? C.ac : C.tx}
                        textAnchor="middle">{p.brand}</text>
                )}
                {isHovered && (
                  <text x={cx} y={cy + r + 14} fontSize={10} fill={C.t2}
                        textAnchor="middle">
                    ({formatScore(p.x, xAxis)}, {formatScore(p.y, yAxis)})
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Empty state */}
      {points.length === 0 && (
        <div style={{
          padding: 18, textAlign: 'center', fontSize: 13, color: C.t2,
          background: C.s2, borderRadius: 8, marginTop: 8,
        }}>
          {lang === 'zh'
            ? '所选两项指标暂无数据组合 — 请试试其他指标。'
            : 'No brands have scores for both selected indices yet — try a different pair.'}
        </div>
      )}

      {/* Legend hint */}
      <div style={{ marginTop: 10, fontSize: 11, color: C.t3, lineHeight: 1.5 }}>
        {lang === 'zh'
          ? '点 = 品牌; 蓝色高亮 = 你的品牌; 虚线 = 中位分隔线 (50 或 0). 鼠标悬停查看品牌名和精确分数.'
          : 'Each dot = a brand; blue halo = your brand; dashed lines = midpoint (50 or 0). Hover any dot to see the brand name + exact scores.'}
      </div>
    </div>
  );
}
