import type { TrendDataPoint } from '../../../services/ciApi';

interface ScoreTrendLineProps {
  data: TrendDataPoint[];
  color: string;
  height?: number;
  width?: number;
}

/**
 * SVG sparkline for a metric's score over time.
 * Degrades gracefully when data is empty or has < 2 points (renders dashed placeholder line).
 * Forward-compatible: auto-upgrades to real chart when TASK-23 /api/ci/trends endpoint lands.
 */
export default function ScoreTrendLine({ data, color, height = 32, width = 120 }: ScoreTrendLineProps) {
  if (data.length < 2) {
    // No data — show dashed neutral line
    return (
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <line
          x1={0} y1={height / 2}
          x2={width} y2={height / 2}
          stroke={color + '30'}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      </svg>
    );
  }

  const values = data.map(d => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const pad = 3;
  const usableH = height - pad * 2;
  const usableW = width;
  const stepX = usableW / (data.length - 1);

  const points = data.map((d, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((d.value - minVal) / range) * usableH;
    return `${x},${y}`;
  });

  const polyline = points.join(' ');

  // Area fill path (closed polygon back along bottom)
  const areaPoints = [
    `0,${height}`,
    ...points,
    `${usableW},${height}`,
  ].join(' ');

  const lastPoint = data[data.length - 1];
  const firstPoint = data[0];
  const trending = lastPoint.value >= firstPoint.value;

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {/* Area fill */}
      <polygon
        points={areaPoints}
        fill={color + '12'}
      />
      {/* Line */}
      <polyline
        points={polyline}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* End dot */}
      <circle
        cx={parseFloat(points[points.length - 1].split(',')[0])}
        cy={parseFloat(points[points.length - 1].split(',')[1])}
        r={2.5}
        fill={color}
      />
      {/* Trend arrow label */}
      <text
        x={width + 4}
        y={height / 2 + 4}
        fontSize={9}
        fill={trending ? '#22c55e' : '#ef4444'}
        fontWeight={600}
      >
        {trending ? '↑' : '↓'}
      </text>
    </svg>
  );
}
