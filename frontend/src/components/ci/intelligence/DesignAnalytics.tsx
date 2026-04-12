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

export default function DesignAnalytics({ C, lang }: DesignAnalyticsProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: '40px 24px', textAlign: 'center', opacity: 0.7,
    }}>
      <div style={{ fontSize: 32 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>{t(T.ci.metricDesign, lang)}</div>
      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, maxWidth: 300 }}>
        {t(T.ci.wave4Coming, lang)}.
        {' '}William's <code style={{ fontSize: 12, color: C.ac }}>design_vision_pipeline</code> will use
        Claude Vision (Sonnet) to analyze product images and extract dominant shapes, materials,
        colors, and aesthetic style.
      </div>
      <div style={{
        marginTop: 8, fontSize: 11, color: C.t2, background: C.s2,
        padding: '6px 14px', borderRadius: 20, border: `1px solid ${C.bd}`,
      }}>
        Expected: Wave 4 sprint · ~¥1/brand/month
      </div>
    </div>
  );
}
