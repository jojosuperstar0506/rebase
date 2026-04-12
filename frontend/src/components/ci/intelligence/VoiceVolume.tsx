import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface VoiceVolumeProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function VoiceVolume({ rawInputs, aiNarrative, score, C, lang }: VoiceVolumeProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const growthRate: number = rawInputs.growth_rate ?? 0;
  const voiceSharePct: number = rawInputs.voice_share_pct ?? 0;
  const platformBreakdown: Record<string, number> = rawInputs.platform_breakdown ?? {};

  const growthPositive = growthRate >= 0;
  const growthPct = Math.round(growthRate * 100);

  // Platform split — XHS teal, Douyin near-black
  const PLATFORM_STYLES: Record<string, { label: string; color: string }> = {
    xhs: { label: 'XHS', color: '#e91e63' },
    douyin: { label: 'Douyin', color: '#010101' },
  };

  const platforms = Object.entries(platformBreakdown);
  const totalPlatformShare = platforms.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricVoice, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {/* Growth rate hero */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{
          flex: 1, background: growthPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${growthPositive ? C.success : C.danger}30`,
          borderRadius: 10, padding: '16px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: growthPositive ? C.success : C.danger, lineHeight: 1 }}>
            {growthPositive ? '+' : ''}{growthPct}%
          </div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 6 }}>Follower Growth</div>
        </div>
        <div style={{ background: C.s2, borderRadius: 10, padding: '16px 20px', flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.tx, lineHeight: 1 }}>{voiceSharePct.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: C.t2, marginTop: 6 }}>Voice Share</div>
        </div>
      </div>

      {/* Platform split */}
      {platforms.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Platform Split
          </div>
          <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden' }}>
            {platforms.map(([platform, share]) => {
              const style = PLATFORM_STYLES[platform] ?? { label: platform, color: C.ac };
              return (
                <div
                  key={platform}
                  style={{
                    width: `${(share / totalPlatformShare) * 100}%`,
                    background: style.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    overflow: 'hidden',
                  }}
                  title={`${style.label}: ${Math.round((share / totalPlatformShare) * 100)}%`}
                />
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {platforms.map(([platform, share]) => {
              const style = PLATFORM_STYLES[platform] ?? { label: platform, color: C.ac };
              return (
                <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: style.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: C.t2 }}>
                    {style.label} {Math.round((share / totalPlatformShare) * 100)}%
                  </span>
                </div>
              );
            })}
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
