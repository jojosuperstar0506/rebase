import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface SentimentPanelProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function SentimentPanel({ rawInputs, aiNarrative, score, C, lang }: SentimentPanelProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const engagementShare: number = rawInputs.engagement_share_pct ?? 0;
  const ugcRatio: number = rawInputs.ugc_ratio ?? 0;
  const avgComments: number = rawInputs.avg_comments ?? 0;
  const positiveKws: string[] = rawInputs.positive_keywords ?? [];
  const negativeKws: string[] = rawInputs.negative_keywords ?? [];
  const totalKws = positiveKws.length + negativeKws.length || 1;
  const posRatio = positiveKws.length / totalKws;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricMindshare, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {/* 3 stat boxes */}
      <div style={{ display: 'flex', gap: 10 }}>
        {[
          { label: 'Engagement Share', value: `${engagementShare.toFixed(1)}%` },
          { label: 'UGC Ratio', value: `${Math.round(ugcRatio * 100)}%` },
          { label: 'Avg Comments', value: avgComments.toFixed(1) },
        ].map(stat => (
          <div key={stat.label} style={{
            flex: 1, background: C.s2, borderRadius: 8, padding: '12px 10px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.tx }}>{stat.value}</div>
            <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Sentiment ratio bar */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Sentiment Split
        </div>
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 }}>
          <div style={{ width: `${posRatio * 100}%`, background: C.success, transition: 'width 0.4s' }} />
          <div style={{ flex: 1, background: C.danger }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: C.success }}>😊 {positiveKws.length} positive</span>
          <span style={{ fontSize: 11, color: C.danger }}>😞 {negativeKws.length} negative</span>
        </div>
      </div>

      {/* Positive keywords */}
      {positiveKws.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.success, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            + Positive
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {positiveKws.slice(0, 12).map(kw => (
              <span key={kw} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(16,185,129,0.1)', color: C.success,
                border: `1px solid ${C.success}40`,
              }}>{kw}</span>
            ))}
          </div>
        </div>
      )}

      {/* Negative keywords */}
      {negativeKws.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.danger, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            − Negative
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {negativeKws.slice(0, 12).map(kw => (
              <span key={kw} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(239,68,68,0.1)', color: C.danger,
                border: `1px solid ${C.danger}40`,
              }}>{kw}</span>
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
