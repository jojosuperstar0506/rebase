import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface LaunchTimelineProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function LaunchTimeline({ rawInputs, aiNarrative, score, C, lang }: LaunchTimelineProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const total: number = rawInputs.total_launches_90d ?? 0;
  const avgPerWeek: number = rawInputs.avg_per_week ?? 0;
  const acceleration: number = rawInputs.acceleration_pct ?? 0;
  const weeklyBreakdown: Record<string, number> = rawInputs.weekly_breakdown ?? {};

  const weeks = Object.entries(weeklyBreakdown)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-13); // last 13 weeks max

  const maxWeekCount = weeks.reduce((m, [, c]) => Math.max(m, c), 1);
  const accelPositive = acceleration >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricLaunch, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {/* Hero stats */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ background: C.s2, borderRadius: 8, padding: '12px 14px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.tx, lineHeight: 1 }}>{total}</div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>Launches in 90d</div>
        </div>
        <div style={{ background: C.s2, borderRadius: 8, padding: '12px 14px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1 }}>{avgPerWeek.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>Per week avg</div>
        </div>
        <div style={{ background: accelPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', borderRadius: 8, padding: '12px 14px', flex: 1, textAlign: 'center', border: `1px solid ${accelPositive ? C.success : C.danger}30` }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: accelPositive ? C.success : C.danger, lineHeight: 1 }}>
            {accelPositive ? '↑' : '↓'}{Math.abs(acceleration)}%
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>Acceleration</div>
        </div>
      </div>

      {/* Weekly sparkline */}
      {weeks.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Weekly Launch Pace
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 48 }}>
            {weeks.map(([week, count]) => {
              const barH = Math.max(4, Math.round((count / maxWeekCount) * 44));
              const shortLabel = week.replace(/\d{4}-/, ''); // show "W14" not "2025-W14"
              return (
                <div key={week} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, flex: 1 }}>
                  <div
                    style={{
                      width: '100%', height: barH, background: C.ac,
                      borderRadius: '3px 3px 0 0', opacity: 0.8,
                    }}
                    title={`${shortLabel}: ${count}`}
                  />
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
            {weeks.map(([week]) => (
              <div key={week} style={{ flex: 1, fontSize: 9, color: C.t2, textAlign: 'center', overflow: 'hidden' }}>
                {week.replace(/\d{4}-W/, 'W')}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI narrative */}
      {aiNarrative && (
        <div style={{ borderTop: `1px solid ${C.bd}`, paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.ac, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {t(T.ci.aiInsight, lang)}
          </div>
          <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>{aiNarrative}</div>
        </div>
      )}
    </div>
  );
}
