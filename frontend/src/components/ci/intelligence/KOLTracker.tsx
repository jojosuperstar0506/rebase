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

const TIER_COLORS: Record<string, string> = {
  macro: '#f59e0b',
  mid: '#8b5cf6',
  micro: '#3b82f6',
  nano: '#6b7280',
};

const TIER_LABELS: Record<string, { en: string; zh: string }> = {
  macro: { en: 'Macro (1M+)', zh: '头部 (100万+)' },
  mid: { en: 'Mid (200K–1M)', zh: '中腰部 (20–100万)' },
  micro: { en: 'Micro (50K–200K)', zh: '微型 (5–20万)' },
  nano: { en: 'Nano (10K–50K)', zh: '素人 (1–5万)' },
};

export default function KOLTracker({ rawInputs, aiNarrative, score, C, lang }: KOLTrackerProps) {
  if (!rawInputs) {
    return (
      <div style={{ color: C.t2, fontSize: 13, padding: '24px 0' }}>
        {t(T.ci.detailLoading, lang)}
      </div>
    );
  }

  const kolCount: number = rawInputs.kol_count ?? 0;
  const totalReach: number = rawInputs.total_reach ?? 0;
  const tierMix: Record<string, number> = rawInputs.tier_mix ?? {};
  const sponsoredRatio: number = rawInputs.sponsored_ratio ?? 0;
  const topKols: Array<{ nickname: string; followers: number; tier: string }> = rawInputs.top_kols ?? [];
  const activeTiers: number = rawInputs.active_tiers ?? 0;

  const totalTierCount = Object.values(tierMix).reduce((s, v) => s + v, 0) || 1;

  const formatFollowers = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return String(n);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, color: C.t2 }}>{t(T.ci.metricKol, lang)}</span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: score >= 70 ? C.success : score >= 40 ? '#f59e0b' : C.danger,
          background: C.s2, borderRadius: 6, padding: '2px 8px',
        }}>{score}</span>
      </div>

      {/* Hero stats */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: C.s2, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.tx, lineHeight: 1 }}>{kolCount}</div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>
            {lang === 'zh' ? 'KOL总数' : 'Total KOLs'}
          </div>
        </div>
        <div style={{ flex: 1, background: C.s2, borderRadius: 8, padding: '12px 14px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: C.tx, lineHeight: 1 }}>
            {formatFollowers(totalReach)}
          </div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>
            {lang === 'zh' ? '总触达' : 'Total Reach'}
          </div>
        </div>
        <div style={{
          flex: 1, borderRadius: 8, padding: '12px 14px', textAlign: 'center',
          background: sponsoredRatio > 0.1 ? 'rgba(16,185,129,0.1)' : C.s2,
          border: sponsoredRatio > 0.1 ? `1px solid ${C.success}30` : 'none',
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: sponsoredRatio > 0.1 ? C.success : C.tx, lineHeight: 1 }}>
            {Math.round(sponsoredRatio * 100)}%
          </div>
          <div style={{ fontSize: 10, color: C.t2, marginTop: 4 }}>
            {lang === 'zh' ? '赞助占比' : 'Sponsored'}
          </div>
        </div>
      </div>

      {/* Tier distribution */}
      {Object.keys(tierMix).length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {lang === 'zh' ? 'KOL 层级分布' : 'Tier Distribution'}
          </div>
          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: 8 }}>
            {['macro', 'mid', 'micro', 'nano'].map(tier => {
              const count = tierMix[tier] ?? 0;
              if (count === 0) return null;
              return (
                <div
                  key={tier}
                  style={{
                    width: `${(count / totalTierCount) * 100}%`,
                    background: TIER_COLORS[tier],
                    transition: 'width 0.4s',
                  }}
                  title={`${(TIER_LABELS[tier] || { en: tier })[lang === 'zh' ? 'zh' : 'en']}: ${count}`}
                />
              );
            })}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {['macro', 'mid', 'micro', 'nano'].map(tier => {
              const count = tierMix[tier] ?? 0;
              if (count === 0) return null;
              const label = TIER_LABELS[tier] || { en: tier, zh: tier };
              return (
                <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: TIER_COLORS[tier] }} />
                  <span style={{ fontSize: 11, color: C.t2 }}>
                    {lang === 'zh' ? label.zh : label.en}: {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top KOLs */}
      {topKols.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t2, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {lang === 'zh' ? '头部KOL' : 'Top KOLs'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {topKols.slice(0, 5).map((kol, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 10px', background: C.s2, borderRadius: 6,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, color: TIER_COLORS[kol.tier] || C.t2,
                  background: (TIER_COLORS[kol.tier] || C.t2) + '18',
                  padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase',
                }}>
                  {kol.tier}
                </span>
                <span style={{ fontSize: 12, color: C.tx, flex: 1 }}>
                  {kol.nickname}
                </span>
                <span style={{ fontSize: 11, color: C.t2 }}>
                  {formatFollowers(kol.followers)}
                </span>
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
