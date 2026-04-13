import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface DesignAnalyticsProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function DesignAnalytics({ rawInputs, aiNarrative, score, C, lang }: DesignAnalyticsProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const styleTags: string[] = rawInputs.style_tags ?? [];
  const materialTags: string[] = rawInputs.material_tags ?? [];
  const dominantStyle: string = rawInputs.dominant_style ?? 'unknown';
  const styleConcentration: number = rawInputs.style_concentration ?? 0;
  const avgImages: number = rawInputs.avg_images_per_note ?? 0;
  const topTags: Array<{ tag: string; count: number }> = rawInputs.top_tags ?? [];
  const dataSource: string = rawInputs.data_source ?? 'hashtags';
  const notesAnalyzed: number = rawInputs.notes_analyzed ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge + data source indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricDesign, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
        <span style={{
          fontSize: 10, color: C.t3, background: C.s2,
          padding: '2px 8px', borderRadius: 4, marginLeft: 'auto',
        }}>
          {dataSource === 'vision' ? '🔬 Vision AI' : '🏷️ Hashtag-based'}
        </span>
      </div>

      {/* Hero stats */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: C.s2, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, lineHeight: 1.2 }}>{dominantStyle}</div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>
            {lang === 'zh' ? '主导风格' : 'Dominant Style'}
          </div>
        </div>
        <div style={{ flex: 1, background: C.s2, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1 }}>
            {Math.round(styleConcentration * 100)}%
          </div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>
            {lang === 'zh' ? '风格集中度' : 'Style Focus'}
          </div>
        </div>
        <div style={{ flex: 1, background: C.s2, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1 }}>
            {avgImages.toFixed(1)}
          </div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>
            {lang === 'zh' ? '篇均图片' : 'Imgs/Note'}
          </div>
        </div>
      </div>

      {/* Style tags */}
      {styleTags.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#8b5cf6', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {lang === 'zh' ? '风格标签' : 'Style Signals'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {styleTags.slice(0, 12).map(tag => (
              <span key={tag} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(139,92,246,0.1)', color: '#8b5cf6',
                border: '1px solid rgba(139,92,246,0.3)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Material tags */}
      {materialTags.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#f59e0b', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {lang === 'zh' ? '材质标签' : 'Material Signals'}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {materialTags.slice(0, 10).map(tag => (
              <span key={tag} style={{
                fontSize: 12, padding: '3px 10px', borderRadius: 20,
                background: 'rgba(245,158,11,0.1)', color: '#f59e0b',
                border: '1px solid rgba(245,158,11,0.3)',
              }}>
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Top tags frequency */}
      {topTags.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {lang === 'zh' ? '高频标签' : 'Top Tags'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topTags.slice(0, 6).map((item, i) => {
              const maxCount = topTags[0]?.count ?? 1;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 90, fontSize: 11, color: C.tx, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.tag}
                  </div>
                  <div style={{ flex: 1, height: 6, background: C.s2, borderRadius: 3 }}>
                    <div style={{
                      width: `${(item.count / maxCount) * 100}%`,
                      height: '100%', background: C.ac, borderRadius: 3,
                    }} />
                  </div>
                  <div style={{ width: 28, fontSize: 11, color: C.t2, textAlign: 'right' }}>{item.count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Notes analyzed footer */}
      <div style={{ fontSize: 10, color: C.t3, textAlign: 'right' }}>
        {lang === 'zh'
          ? `基于 ${notesAnalyzed} 篇笔记的标签分析`
          : `Based on ${notesAnalyzed} notes analyzed`}
        {dataSource === 'hashtags' && (
          <span style={{ marginLeft: 6, color: C.t3 }}>
            {lang === 'zh' ? '· 视觉AI升级即将上线' : '· Vision AI upgrade coming soon'}
          </span>
        )}
      </div>

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
