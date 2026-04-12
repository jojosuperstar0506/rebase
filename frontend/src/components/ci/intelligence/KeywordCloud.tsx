import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface KeywordCloudProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function KeywordCloud({ rawInputs, aiNarrative, score, C, lang }: KeywordCloudProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const keywordCloud: Record<string, number> = rawInputs.keyword_cloud ?? {};
  const trending: string[] = rawInputs.trending ?? [];
  const categories: Record<string, number> = rawInputs.categories ?? {};

  const words = Object.entries(keywordCloud).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const maxCount = words[0]?.[1] ?? 1;
  const catTotal = Object.values(categories).reduce((s, v) => s + v, 0) || 1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricKeywords, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700, color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {/* Keyword cloud */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Top Keywords
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {words.map(([word, count]) => {
            const size = 12 + Math.round((count / maxCount) * 10);
            return (
              <span
                key={word}
                style={{
                  fontSize: size,
                  padding: '3px 10px',
                  borderRadius: 20,
                  background: C.s2,
                  color: C.tx,
                  border: `1px solid ${C.bd}`,
                  lineHeight: 1.5,
                }}
              >
                {word}
                <span style={{ fontSize: 10, color: C.t2, marginLeft: 4 }}>{count}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Trending */}
      {trending.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            ↑ Trending
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {trending.map(kw => (
              <span key={kw} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(245,158,11,0.12)', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.3)',
              }}>
                ↑ {kw}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Categories */}
      {Object.keys(categories).length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Content Categories
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Object.entries(categories).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cat, count]) => (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 80, fontSize: 11, color: C.tx }}>{cat}</div>
                <div style={{ flex: 1, height: 6, background: C.s2, borderRadius: 3 }}>
                  <div style={{
                    width: `${(count / catTotal) * 100}%`,
                    height: '100%', background: C.ac, borderRadius: 3,
                  }} />
                </div>
                <div style={{ width: 30, fontSize: 11, color: C.t2, textAlign: 'right' }}>{count}</div>
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
