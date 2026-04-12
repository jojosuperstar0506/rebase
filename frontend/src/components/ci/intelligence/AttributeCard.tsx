import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';
import type { MetricSummary } from '../../../services/ciApi';

interface AttributeCardProps {
  metricType: string;
  label: string;
  metric: MetricSummary | null;
  isWave4?: boolean;
  isSelected?: boolean;
  onClick: () => void;
  C: ColorSet;
  lang: Lang;
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * (score / 100);
  return (
    <svg width={44} height={44} style={{ flexShrink: 0 }}>
      {/* track */}
      <circle cx={22} cy={22} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={4} />
      {/* fill — rotate -90deg so it starts at top */}
      <circle
        cx={22}
        cy={22}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeLinecap="round"
        transform="rotate(-90 22 22)"
      />
      <text
        x={22}
        y={26}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill={color}
      >
        {score}
      </text>
    </svg>
  );
}

export default function AttributeCard({
  label,
  metric,
  isWave4 = false,
  isSelected = false,
  onClick,
  C,
  lang,
}: AttributeCardProps) {
  const scoreColor =
    metric === null
      ? C.t2
      : metric.score >= 70
      ? C.success
      : metric.score >= 40
      ? '#f59e0b'
      : C.danger;

  const cardStyle: React.CSSProperties = {
    width: 160,
    minHeight: 180,
    border: `1px solid ${isSelected ? C.ac : C.bd}`,
    borderRadius: 10,
    padding: '14px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    cursor: isWave4 ? 'default' : 'pointer',
    background: isWave4 ? 'transparent' : isSelected ? C.s2 : C.s1,
    opacity: isWave4 ? 0.55 : 1,
    transition: 'border-color 0.15s, background 0.15s',
    flexShrink: 0,
  };

  // Wave 4 locked state
  if (isWave4) {
    return (
      <div style={cardStyle}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.t2 }}>{label}</div>
        <div style={{ fontSize: 22, color: C.t2, lineHeight: 1 }}>🔒</div>
        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.4 }}>
          {t(T.ci.wave4Coming, lang)}
        </div>
      </div>
    );
  }

  // No data state
  if (metric === null) {
    return (
      <div style={cardStyle} onClick={onClick}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: C.t2, lineHeight: 1 }}>—</div>
        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.4 }}>
          {t(T.ci.runDeepDiveToUnlock, lang)}
        </div>
      </div>
    );
  }

  // Data available
  const snippet =
    metric.ai_narrative.length > 58
      ? metric.ai_narrative.slice(0, 55) + '…'
      : metric.ai_narrative;

  return (
    <div
      style={cardStyle}
      onClick={onClick}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = C.ac;
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLDivElement).style.borderColor = C.bd;
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: C.tx }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <ScoreRing score={metric.score} color={scoreColor} />
        <div style={{ fontSize: 32, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>
          {metric.score}
        </div>
      </div>
      {snippet && (
        <div style={{ fontSize: 11, color: C.t2, lineHeight: 1.45, flexGrow: 1 }}>
          {snippet}
        </div>
      )}
      <div style={{ fontSize: 11, color: C.ac, marginTop: 'auto', paddingTop: 4 }}>
        {t(T.ci.viewDetails, lang)}
      </div>
    </div>
  );
}
