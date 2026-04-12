import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface ContentLabelsProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function ContentLabels({ rawInputs, aiNarrative, score, C, lang }: ContentLabelsProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const totalPosts: number = rawInputs.total_posts ?? 0;
  const engPerPost: number = rawInputs.engagement_per_post ?? 0;
  const contentTypeCount: Record<string, number> = rawInputs.content_type_count ?? {};
  const topContent: Array<{ title: string; likes: number }> = rawInputs.top_content ?? [];

  const totalTypes = Object.values(contentTypeCount).reduce((s, v) => s + v, 0) || 1;
  const typeEntries = Object.entries(contentTypeCount).sort((a, b) => b[1] - a[1]);

  const TYPE_COLORS = [C.ac, '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', C.t2];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricContent, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {/* 2 stat boxes */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: C.s2, borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: C.tx }}>{totalPosts}</div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>Total Posts</div>
        </div>
        <div style={{ flex: 1, background: C.s2, borderRadius: 8, padding: '12px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.tx }}>
            {engPerPost >= 1000 ? `${(engPerPost / 1000).toFixed(1)}k` : Math.round(engPerPost)}
          </div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>Eng / Post</div>
        </div>
      </div>

      {/* Content type breakdown */}
      {typeEntries.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Content Mix
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {typeEntries.slice(0, 6).map(([type, count], i) => (
              <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 80, fontSize: 11, color: C.tx, textTransform: 'capitalize' }}>{type}</div>
                <div style={{ flex: 1, height: 8, background: C.s2, borderRadius: 4 }}>
                  <div style={{
                    width: `${(count / totalTypes) * 100}%`,
                    height: '100%', background: TYPE_COLORS[i % TYPE_COLORS.length], borderRadius: 4,
                  }} />
                </div>
                <div style={{ width: 36, fontSize: 11, color: C.t2, textAlign: 'right' }}>
                  {Math.round((count / totalTypes) * 100)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top content */}
      {topContent.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Top Content
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topContent.slice(0, 3).map((item, i) => {
              const title = item.title.length > 40 ? item.title.slice(0, 37) + '…' : item.title;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: C.s2, borderRadius: 6 }}>
                  <span style={{ fontSize: 11, color: C.t2, flexShrink: 0 }}>#{i + 1}</span>
                  <span style={{ fontSize: 12, color: C.tx, flex: 1 }}>{title}</span>
                  <span style={{ fontSize: 11, color: C.t2, flexShrink: 0 }}>♥ {(item.likes ?? 0).toLocaleString()}</span>
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
