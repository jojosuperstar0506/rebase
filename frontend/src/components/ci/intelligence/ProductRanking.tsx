import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface ProductRankingProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function ProductRanking({ rawInputs, aiNarrative, score, C, lang }: ProductRankingProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const products: Array<{ title: string; likes: number; comments?: number }> =
    rawInputs.top_products ?? [];
  const maxLikes = products.reduce((m, p) => Math.max(m, p.likes ?? 0), 1);

  const rankColors = [C.ac, '#f59e0b', '#8b5cf6', C.t2, C.t2];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricHotProducts, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {products.length === 0 ? (
        <div style={{ color: C.t2, fontSize: 13 }}>No product data yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {products.slice(0, 5).map((p, i) => {
            const title = p.title.length > 32 ? p.title.slice(0, 29) + '…' : p.title;
            const barWidth = `${((p.likes ?? 0) / maxLikes) * 100}%`;
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {/* Rank number */}
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: rankColors[i] + '22',
                    color: rankColors[i],
                    fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    {i + 1}
                  </span>
                  {/* Title */}
                  <span style={{ fontSize: 13, color: C.tx, flex: 1 }}>{title}</span>
                  {/* Likes */}
                  <span style={{ fontSize: 11, color: C.t2, flexShrink: 0 }}>
                    ♥ {(p.likes ?? 0).toLocaleString()}
                  </span>
                </div>
                {/* Bar */}
                <div style={{ marginLeft: 32, height: 4, background: C.s2, borderRadius: 2 }}>
                  <div style={{ width: barWidth, height: '100%', background: rankColors[i], borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
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
