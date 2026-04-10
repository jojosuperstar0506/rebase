import { useState } from 'react';
import type { TrendDataPoint } from '../../services/ciApi';

// ── Props ──────────────────────────────────────────────────────────────────────

interface TrendChartProps {
  data: TrendDataPoint[];
  label: string;
  color: string;
  height?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const VB_W = 600;
const VB_H = 200;
const PAD_L = 32;
const PAD_R = 12;
const PAD_T = 12;
const PAD_B = 28;

const CHART_W = VB_W - PAD_L - PAD_R;
const CHART_H = VB_H - PAD_T - PAD_B;

const GRIDLINES = [25, 50, 75];

// ── Scale helpers ─────────────────────────────────────────────────────────────

function scaleX(i: number, total: number): number {
  if (total <= 1) return PAD_L;
  return PAD_L + (i / (total - 1)) * CHART_W;
}

function scaleY(value: number): number {
  // Y is inverted in SVG (0 at top)
  return PAD_T + CHART_H - (value / 100) * CHART_H;
}

// ── Mini chart (no axes, compact, for dashboard trend cards) ──────────────────

interface MiniTrendChartProps {
  data: TrendDataPoint[];
  color: string;
  width?: number;
  height?: number;
}

export function MiniTrendChart({ data, color, width = 120, height = 60 }: MiniTrendChartProps) {
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={0} y1={height / 2} x2={width} y2={height / 2}
          stroke={color} strokeWidth={1} strokeDasharray="4,3" opacity={0.3} />
      </svg>
    );
  }

  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * (width - 4) + 2;
    const y = height - 4 - ((d.value / 100) * (height - 8));
    return { x, y };
  });

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${height - 2} L${pts[0].x.toFixed(1)},${height - 2} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`mini-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <path d={areaPath} fill={`url(#mini-grad-${color.replace('#', '')})`} />
      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {/* Terminal dot */}
      <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={3} fill={color} />
    </svg>
  );
}

// ── Full trend chart ──────────────────────────────────────────────────────────

export default function CITrendChart({ data, label, color, height = 200 }: TrendChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (!data || data.length === 0) {
    return (
      <svg viewBox={`0 0 ${VB_W} ${VB_H}`} width="100%" style={{ display: 'block' }}>
        <text x={VB_W / 2} y={VB_H / 2} textAnchor="middle" fill="#94a3b8" fontSize={12}>
          {label} — no data
        </text>
      </svg>
    );
  }

  const pts = data.map((d, i) => ({
    x: scaleX(i, data.length),
    y: scaleY(d.value),
    date: d.date,
    value: d.value,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${(PAD_T + CHART_H).toFixed(1)} L${PAD_L.toFixed(1)},${(PAD_T + CHART_H).toFixed(1)} Z`;

  const hovPt = hovered !== null ? pts[hovered] : null;
  const hovData = hovered !== null ? data[hovered] : null;

  // Tooltip x position — flip to left side if near right edge
  function tipX(px: number): number {
    return px + 80 > PAD_L + CHART_W ? px - 88 : px + 8;
  }

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      width="100%"
      style={{ display: 'block', height }}
    >
      <defs>
        <linearGradient id={`grad-${label.replace(/\s/g, '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Y gridlines at 25 / 50 / 75 */}
      {GRIDLINES.map(v => (
        <g key={v}>
          <line
            x1={PAD_L} y1={scaleY(v)} x2={PAD_L + CHART_W} y2={scaleY(v)}
            stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="4,4" opacity={0.35}
          />
          <text x={PAD_L - 4} y={scaleY(v) + 4} textAnchor="end" fill="#94a3b8" fontSize={9}>
            {v}
          </text>
        </g>
      ))}

      {/* Axes */}
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + CHART_H} stroke="#94a3b8" strokeWidth={0.8} opacity={0.4} />
      <line x1={PAD_L} y1={PAD_T + CHART_H} x2={PAD_L + CHART_W} y2={PAD_T + CHART_H} stroke="#94a3b8" strokeWidth={0.8} opacity={0.4} />

      {/* X-axis labels — first and last only */}
      {data.length > 0 && (
        <>
          <text x={PAD_L} y={PAD_T + CHART_H + 14} textAnchor="start" fill="#94a3b8" fontSize={9}>
            {data[0].date}
          </text>
          <text x={PAD_L + CHART_W} y={PAD_T + CHART_H + 14} textAnchor="end" fill="#94a3b8" fontSize={9}>
            {data[data.length - 1].date}
          </text>
        </>
      )}

      {/* Area fill */}
      <path d={areaPath} fill={`url(#grad-${label.replace(/\s/g, '')})`} />

      {/* Line */}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Hover interaction strip — invisible wide rects per data point */}
      {pts.map((p, i) => {
        const halfGap = CHART_W / (data.length - 1) / 2;
        return (
          <rect
            key={i}
            x={Math.max(PAD_L, p.x - halfGap)}
            y={PAD_T}
            width={Math.min(halfGap * 2, CHART_W)}
            height={CHART_H}
            fill="transparent"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            style={{ cursor: 'crosshair' }}
          />
        );
      })}

      {/* Dots — always show first, last, and hovered */}
      {pts.map((p, i) => {
        const isEdge = i === 0 || i === pts.length - 1;
        const isHov = i === hovered;
        if (!isEdge && !isHov) return null;
        return (
          <circle
            key={i}
            cx={p.x} cy={p.y}
            r={isHov ? 5 : 3}
            fill={color}
            stroke="white"
            strokeWidth={isHov ? 1.5 : 1}
          />
        );
      })}

      {/* Hover tooltip */}
      {hovPt && hovData && (
        <g>
          {/* Vertical crosshair */}
          <line
            x1={hovPt.x} y1={PAD_T}
            x2={hovPt.x} y2={PAD_T + CHART_H}
            stroke={color} strokeWidth={0.8} strokeDasharray="3,2" opacity={0.5}
          />
          {/* Tooltip box */}
          <rect
            x={tipX(hovPt.x)} y={hovPt.y - 28}
            width={80} height={36}
            rx={4}
            fill="rgba(0,0,0,0.75)"
          />
          <text x={tipX(hovPt.x) + 8} y={hovPt.y - 12} fill="white" fontSize={10} fontWeight={700}>
            {hovData.value}
          </text>
          <text x={tipX(hovPt.x) + 8} y={hovPt.y + 2} fill="#94a3b8" fontSize={9}>
            {hovData.date}
          </text>
        </g>
      )}
    </svg>
  );
}
