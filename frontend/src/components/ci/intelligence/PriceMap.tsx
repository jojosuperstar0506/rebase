import { t, T } from '../../../i18n';
import type { Lang } from '../../../i18n';
import type { ColorSet } from '../../../theme/colors';

interface PriceMapProps {
  rawInputs: any;
  aiNarrative: string;
  score: number;
  C: ColorSet;
  lang: Lang;
}

const LEVEL_COLORS: Record<string, string> = {
  entry: '#10b981',
  'mid-range': '#3b82f6',
  premium: '#8b5cf6',
  luxury: '#f59e0b',
};

export default function PriceMap({ rawInputs, aiNarrative, score, C, lang }: PriceMapProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const priceLevel: string = rawInputs.price_level ?? 'mid-range';
  const priceBands: Record<string, number> = rawInputs.price_bands ?? {};
  const discountDepth: number = rawInputs.discount_depth ?? 0;
  const avgPrice: number = rawInputs.avg_price ?? 0;

  const bands = Object.entries(priceBands).sort((a, b) => {
    // Try to sort by numeric prefix
    const aNum = parseInt(a[0].replace(/[^0-9]/g, '')) || 0;
    const bNum = parseInt(b[0].replace(/[^0-9]/g, '')) || 0;
    return aNum - bNum;
  });
  const maxCount = bands.reduce((m, [, c]) => Math.max(m, c), 1);
  const levelColor = LEVEL_COLORS[priceLevel] ?? C.ac;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricPrice, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {/* 3 stat pills */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ background: C.s2, borderRadius: 8, padding: '10px 14px', textAlign: 'center', minWidth: 90 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>¥{avgPrice.toLocaleString()}</div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>Avg Price</div>
        </div>
        <div style={{ background: `${levelColor}18`, border: `1px solid ${levelColor}40`, borderRadius: 8, padding: '10px 14px', textAlign: 'center', minWidth: 90 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: levelColor, textTransform: 'capitalize' }}>{priceLevel}</div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>Positioning</div>
        </div>
        <div style={{ background: C.s2, borderRadius: 8, padding: '10px 14px', textAlign: 'center', minWidth: 90 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: discountDepth > 0.2 ? C.danger : C.tx }}>
            {Math.round(discountDepth * 100)}%
          </div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>Avg Discount</div>
        </div>
      </div>

      {/* Price band chart */}
      {bands.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            Price Distribution
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {bands.map(([band, count]) => (
              <div key={band} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 75, fontSize: 11, color: C.t2, flexShrink: 0 }}>{band}</div>
                <div style={{ flex: 1, height: 10, background: C.s2, borderRadius: 5 }}>
                  <div style={{
                    width: `${(count / maxCount) * 100}%`,
                    height: '100%', background: levelColor, borderRadius: 5, transition: 'width 0.4s',
                  }} />
                </div>
                <div style={{ width: 24, fontSize: 11, color: C.tx, textAlign: 'right' }}>{count}</div>
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
