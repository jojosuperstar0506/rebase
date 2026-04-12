import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface KOLTrackerProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

export default function KOLTracker({ C, lang }: KOLTrackerProps) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: '40px 24px', textAlign: 'center', opacity: 0.7,
    }}>
      <div style={{ fontSize: 32 }}>🔒</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: C.tx }}>{t(T.ci.metricKol, lang)}</div>
      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6, maxWidth: 280 }}>
        {t(T.ci.wave4Coming, lang)}.
        {' '}William's <code style={{ fontSize: 12, color: C.ac }}>kol_tracker_pipeline</code> will scrape
        KOL counts, tier mix, and campaign data from XHS and Douyin.
      </div>
      <div style={{
        marginTop: 8, fontSize: 11, color: C.t2, background: C.s2,
        padding: '6px 14px', borderRadius: 20, border: `1px solid ${C.bd}`,
      }}>
        Expected: Wave 4 sprint
      </div>
    </div>
  );
}
