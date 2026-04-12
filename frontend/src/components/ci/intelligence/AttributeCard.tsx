import { useState } from 'react';
import type { CSSProperties } from 'react';
import type { MetricData } from '../../../services/ciApi';

// ── Metric display config ────────────────────────────────────────

interface MetricConfig {
  label: { en: string; zh: string };
  icon: string;
  color: string;
  description: { en: string; zh: string };
}

export const METRIC_CONFIG: Record<string, MetricConfig> = {
  // Core
  momentum:   { label: { en: 'Momentum', zh: '增长势能' },     icon: '🚀', color: '#3b82f6', description: { en: 'Brand growth speed', zh: '品牌增长速度' } },
  threat:     { label: { en: 'Threat Index', zh: '威胁指数' },  icon: '⚡', color: '#ef4444', description: { en: 'Competition risk level', zh: '竞争风险等级' } },
  wtp:        { label: { en: 'Price Power', zh: '溢价能力' },   icon: '💎', color: '#8b5cf6', description: { en: 'Price premium command', zh: '价格溢价能力' } },
  // Consumer
  consumer_mindshare: { label: { en: 'Mindshare', zh: '消费心智' }, icon: '🧠', color: '#ec4899', description: { en: 'Consumer perception', zh: '消费者认知分析' } },
  keywords:   { label: { en: 'Keywords', zh: '关键词分析' },    icon: '🔍', color: '#06b6d4', description: { en: 'Keyword trends & cloud', zh: '关键词趋势与词云' } },
  // Product
  trending_products: { label: { en: 'Hot Products', zh: '热门商品' }, icon: '🔥', color: '#f97316', description: { en: 'Top sellers & new launches', zh: '畅销品与新品动态' } },
  design_profile:    { label: { en: 'Design DNA', zh: '设计分析' },  icon: '🎨', color: '#a855f7', description: { en: 'Visual style taxonomy', zh: '视觉风格分类' } },
  price_positioning: { label: { en: 'Pricing', zh: '价格定位' },    icon: '💰', color: '#22c55e', description: { en: 'Price band analysis', zh: '价格带分析' } },
  launch_frequency:  { label: { en: 'Launch Pace', zh: '新品频率' }, icon: '📦', color: '#64748b', description: { en: 'Product launch cadence', zh: '新品上架节奏' } },
  // Marketing
  voice_volume:     { label: { en: 'Voice Volume', zh: '品牌声量' },  icon: '📢', color: '#0ea5e9', description: { en: 'Social media reach growth', zh: '社交媒体声量增长' } },
  content_strategy: { label: { en: 'Content', zh: '内容策略' },      icon: '📝', color: '#14b8a6', description: { en: 'Brand vs consumer labels', zh: '品牌与消费者标签' } },
  kol_strategy:     { label: { en: 'KOL Strategy', zh: 'KOL策略' },  icon: '👥', color: '#f43f5e', description: { en: 'KOL partnerships & ROI', zh: 'KOL合作与投资回报' } },
};

const DEFAULT_CONFIG: MetricConfig = {
  label: { en: 'Metric', zh: '指标' },
  icon: '📊',
  color: '#6b7280',
  description: { en: 'Analysis metric', zh: '分析指标' },
};

// ── Score ring (circular progress) ────────────────────────────────

function ScoreRing({ score, color, size = 56 }: { score: number; color: string; size?: number }) {
  const r = (size - 8) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (score / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color + '20'} strokeWidth={4} />
      <circle
        cx={size / 2} cy={size / 2} r={r} fill="none"
        stroke={color} strokeWidth={4} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text
        x={size / 2} y={size / 2}
        textAnchor="middle" dominantBaseline="central"
        style={{ transform: 'rotate(90deg)', transformOrigin: 'center', fontSize: size * 0.3, fontWeight: 700, fill: color }}
      >
        {score}
      </text>
    </svg>
  );
}

// ── Main AttributeCard ────────────────────────────────────────────

interface AttributeCardProps {
  metricType: string;
  data: MetricData | null;
  lang: string;
  C: Record<string, string>;
  isMobile?: boolean;
  /** Wave 4 — pipeline not built yet; shows locked placeholder */
  isWave4?: boolean;
  /** Called when card is expanded/selected (optional parent callback) */
  onExpand?: (metricType: string, expanded: boolean) => void;
}

export default function AttributeCard({ metricType, data, lang, C, isMobile, isWave4 = false, onExpand }: AttributeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const config = METRIC_CONFIG[metricType] || DEFAULT_CONFIG;
  const isPending = isWave4 || !data || data.score === 0;
  const score = data?.score ?? 0;
  const brandEntries = data ? Object.entries(data.brands) : [];

  // Get the top AI insight from the first brand that has one
  const topInsight = brandEntries.find(([, b]) => b.ai_narrative)?.[1]?.ai_narrative;

  const card: CSSProperties = {
    background: C.s1,
    border: `1px solid ${expanded ? config.color + '44' : hovered ? config.color + '33' : C.bd}`,
    borderRadius: 12,
    padding: isMobile ? 14 : 18,
    cursor: isWave4 ? 'default' : 'pointer',
    transition: 'all 0.2s ease',
    opacity: isWave4 ? 0.6 : 1,
    boxShadow: expanded ? `0 2px 12px ${config.color}15` : hovered ? `0 1px 6px ${config.color}10` : 'none',
    transform: hovered && !expanded && !isWave4 ? 'translateY(-1px)' : 'none',
  };

  // Wave 4 locked card
  if (isWave4) {
    return (
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: C.s2, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
          }}>🔒</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 15 }}>{config.icon}</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>{lang === 'zh' ? config.label.zh : config.label.en}</span>
            </div>
            <div style={{ fontSize: 11, color: C.t3 }}>{lang === 'zh' ? 'Wave 4 即将上线' : 'Coming in Wave 4'}</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={card}
      onClick={() => {
        const next = !expanded;
        setExpanded(next);
        onExpand?.(metricType, next);
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Score ring or pending indicator */}
        {isPending ? (
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: C.s2, border: `2px dashed ${C.bd}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 12, color: C.t3, fontStyle: 'italic',
          }}>
            —
          </div>
        ) : (
          <ScoreRing score={score} color={config.color} />
        )}

        {/* Label + description */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 15 }}>{config.icon}</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: C.tx }}>
              {lang === 'zh' ? config.label.zh : config.label.en}
            </span>
          </div>
          <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.4 }}>
            {isPending
              ? (lang === 'zh' ? '分析待计算' : 'Analysis pending')
              : (lang === 'zh' ? config.description.zh : config.description.en)}
          </div>
        </div>

        {/* Expand indicator */}
        <span style={{
          fontSize: 11, color: C.t3, transition: 'transform 0.2s',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>
          ▼
        </span>
      </div>

      {/* One-line insight (always visible if available) */}
      {topInsight && !expanded && (
        <div style={{
          marginTop: 10, fontSize: 12, color: C.t2, lineHeight: 1.5,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {topInsight.slice(0, 80)}{topInsight.length > 80 ? '...' : ''}
        </div>
      )}

      {/* Expanded detail view */}
      {expanded && !isPending && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${C.bd}`, paddingTop: 14 }}>
          {/* Per-brand breakdown */}
          {brandEntries.map(([brandName, brandData]) => (
            <div key={brandName} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0', borderBottom: `1px solid ${C.bd}08`,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.tx, minWidth: 80 }}>
                {brandName}
              </span>
              {/* Mini score bar */}
              <div style={{ flex: 1, height: 4, background: C.bd, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  width: `${brandData.score}%`, height: '100%', background: config.color,
                  borderRadius: 2, transition: 'width 0.5s ease',
                }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: config.color, minWidth: 28, textAlign: 'right' }}>
                {brandData.score}
              </span>
            </div>
          ))}

          {/* AI narrative for this metric (from first brand) */}
          {topInsight && (
            <div style={{
              marginTop: 10, padding: '10px 12px', borderRadius: 8,
              background: config.color + '08', fontSize: 12, color: C.t2, lineHeight: 1.6,
            }}>
              {topInsight}
            </div>
          )}

          {/* Raw data preview */}
          {brandEntries[0]?.[1]?.raw_inputs && (
            <RawDataPreview rawInputs={brandEntries[0][1].raw_inputs} config={config} C={C} lang={lang} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Metric-specific data previews ────────────────────────────────

function RawDataPreview({ rawInputs, config, C, lang }: {
  rawInputs: Record<string, any>;
  config: MetricConfig;
  C: Record<string, string>;
  lang: string;
}) {
  if (!rawInputs) return null;

  // Keywords: show top keywords as tags
  if (rawInputs.keyword_cloud) {
    const entries = Object.entries(rawInputs.keyword_cloud as Record<string, number>)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 12);

    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>
          {lang === 'zh' ? '高频关键词' : 'Top Keywords'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {entries.map(([word, count]) => (
            <span key={word} style={{
              padding: '3px 8px', borderRadius: 4, fontSize: 11,
              background: config.color + '15', color: config.color, fontWeight: 500,
            }}>
              {word} ({count})
            </span>
          ))}
        </div>
      </div>
    );
  }

  // Trending products: show top 3
  if (rawInputs.top_products) {
    const products = (rawInputs.top_products as any[]).slice(0, 3);
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>
          {lang === 'zh' ? '热门商品 Top 3' : 'Top 3 Products'}
        </div>
        {products.map((p: any, i: number) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '4px 0', fontSize: 12, color: C.t2,
          }}>
            <span>{i + 1}. {(p.product_name || p.name || '').slice(0, 30)}</span>
            <span style={{ fontWeight: 600, color: C.tx }}>
              {p.price ? `¥${p.price}` : ''} {p.sales ? `· ${p.sales}销` : ''}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Voice volume: show growth rates
  if (rawInputs.follower_growth !== undefined && rawInputs.voice_share_pct !== undefined) {
    return (
      <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12 }}>
        <GrowthStat label={lang === 'zh' ? '粉丝增长' : 'Followers'} value={rawInputs.follower_growth} color={config.color} C={C} />
        <GrowthStat label={lang === 'zh' ? '内容增长' : 'Content'} value={rawInputs.content_growth} color={config.color} C={C} />
        <GrowthStat label={lang === 'zh' ? '互动增长' : 'Engagement'} value={rawInputs.engagement_growth} color={config.color} C={C} />
      </div>
    );
  }

  // Price positioning: show price band distribution + key stats
  if (rawInputs.price_band_distribution) {
    const bands = rawInputs.price_band_distribution as Record<string, number>;
    const maxBand = Math.max(...Object.values(bands), 1);
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>
          {lang === 'zh' ? '价格带分布' : 'Price Band Distribution'}
        </div>
        <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end', height: 36, marginBottom: 6 }}>
          {Object.entries(bands).map(([band, count]) => (
            <div key={band} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{
                width: '100%', background: config.color,
                height: Math.max(2, (count / maxBand) * 30), borderRadius: 2,
                opacity: count > 0 ? 1 : 0.15,
              }} />
              <span style={{ fontSize: 8, color: C.t3 }}>{band.replace('-', '–')}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 11, color: C.t2 }}>
          <span>{lang === 'zh' ? '均价' : 'Avg'}: <b style={{ color: C.tx }}>¥{rawInputs.avg_price}</b></span>
          <span>{lang === 'zh' ? '溢价占比' : 'Premium'}: <b style={{ color: config.color }}>{rawInputs.premium_ratio}%</b></span>
          <span>{lang === 'zh' ? '折扣深度' : 'Discount'}: <b style={{ color: rawInputs.avg_discount_depth > 20 ? '#ef4444' : '#22c55e' }}>{rawInputs.avg_discount_depth}%</b></span>
        </div>
      </div>
    );
  }

  // Launch frequency: show recent launches + pace
  if (rawInputs.total_launches_90d !== undefined) {
    const recent = (rawInputs.recent_launches as any[] || []).slice(0, 4);
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 14, fontSize: 11, color: C.t2, marginBottom: 6 }}>
          <span>{lang === 'zh' ? '90天新品' : '90d Launches'}: <b style={{ color: C.tx }}>{rawInputs.total_launches_90d}</b></span>
          <span>{lang === 'zh' ? '周均' : 'Avg/wk'}: <b style={{ color: C.tx }}>{rawInputs.avg_per_week}</b></span>
          <span style={{ color: rawInputs.acceleration_pct > 0 ? '#22c55e' : rawInputs.acceleration_pct < -10 ? '#ef4444' : C.t3 }}>
            {rawInputs.acceleration_pct > 0 ? '↑' : rawInputs.acceleration_pct < -10 ? '↓' : '→'} {rawInputs.acceleration_pct}%
          </span>
        </div>
        {recent.length > 0 && (
          <div style={{ fontSize: 11 }}>
            {recent.map((r: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: C.t2 }}>
                <span>{(r.name || '').slice(0, 35)}{(r.name || '').length > 35 ? '...' : ''}</span>
                <span style={{ color: C.t3, fontSize: 10 }}>{r.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Consumer mindshare: show social engagement + sentiment
  if (rawInputs.engagement_share_pct !== undefined) {
    const sentimentPct = Math.round((rawInputs.sentiment_ratio || 0.5) * 100);
    const posKw = (rawInputs.positive_keywords as string[] || []).slice(0, 4);
    const negKw = (rawInputs.negative_keywords as string[] || []).slice(0, 3);
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 6 }}>
          <div>
            <div style={{ color: C.t3, fontSize: 11 }}>{lang === 'zh' ? '互动占比' : 'Engagement Share'}</div>
            <div style={{ fontWeight: 600, color: config.color, fontSize: 13 }}>{rawInputs.engagement_share_pct}%</div>
          </div>
          <div>
            <div style={{ color: C.t3, fontSize: 11 }}>{lang === 'zh' ? '好感度' : 'Sentiment'}</div>
            <div style={{ fontWeight: 600, color: sentimentPct >= 60 ? '#22c55e' : sentimentPct >= 40 ? '#f59e0b' : '#ef4444', fontSize: 13 }}>
              {sentimentPct}% {sentimentPct >= 60 ? '👍' : sentimentPct >= 40 ? '😐' : '👎'}
            </div>
          </div>
          <div>
            <div style={{ color: C.t3, fontSize: 11 }}>{lang === 'zh' ? '篇均评论' : 'Avg Comments'}</div>
            <div style={{ fontWeight: 600, color: C.tx, fontSize: 13 }}>{rawInputs.avg_comments_per_note || 0}</div>
          </div>
        </div>
        {(posKw.length > 0 || negKw.length > 0) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, fontSize: 10 }}>
            {posKw.map((k: string) => (
              <span key={k} style={{ padding: '2px 6px', borderRadius: 3, background: '#22c55e18', color: '#22c55e' }}>{k}</span>
            ))}
            {negKw.map((k: string) => (
              <span key={k} style={{ padding: '2px 6px', borderRadius: 3, background: '#ef444418', color: '#ef4444' }}>{k}</span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Content strategy: show engagement efficiency + content types
  if (rawInputs.engagement_per_note !== undefined && rawInputs.total_notes !== undefined) {
    const topContent = (rawInputs.top_content as any[] || []).slice(0, 3);
    return (
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, marginBottom: 6 }}>
          <div>
            <div style={{ color: C.t3, fontSize: 11 }}>{lang === 'zh' ? '内容总数' : 'Posts'}</div>
            <div style={{ fontWeight: 600, color: C.tx, fontSize: 13 }}>{rawInputs.total_notes.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: C.t3, fontSize: 11 }}>{lang === 'zh' ? '篇均互动' : 'Eng/Post'}</div>
            <div style={{ fontWeight: 600, color: config.color, fontSize: 13 }}>{Math.round(rawInputs.engagement_per_note).toLocaleString()}</div>
          </div>
          <div>
            <div style={{ color: C.t3, fontSize: 11 }}>{lang === 'zh' ? '内容类型' : 'Types'}</div>
            <div style={{ fontWeight: 600, color: C.tx, fontSize: 13 }}>{rawInputs.n_content_types || 0}</div>
          </div>
        </div>
        {topContent.length > 0 && (
          <div style={{ fontSize: 11 }}>
            <div style={{ color: C.t3, marginBottom: 3 }}>{lang === 'zh' ? '热门内容' : 'Top Content'}</div>
            {topContent.map((c: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: C.t2 }}>
                <span>{(c.title || '').slice(0, 30)}{(c.title || '').length > 30 ? '...' : ''}</span>
                <span style={{ color: config.color, fontWeight: 600, fontSize: 10 }}>♥ {c.likes || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback: voice volume growth without share (backwards compat)
  if (rawInputs.follower_growth !== undefined) {
    return (
      <div style={{ marginTop: 10, display: 'flex', gap: 16, fontSize: 12 }}>
        <GrowthStat label={lang === 'zh' ? '粉丝增长' : 'Followers'} value={rawInputs.follower_growth} color={config.color} C={C} />
        <GrowthStat label={lang === 'zh' ? '内容增长' : 'Content'} value={rawInputs.content_growth} color={config.color} C={C} />
        <GrowthStat label={lang === 'zh' ? '互动增长' : 'Engagement'} value={rawInputs.engagement_growth} color={config.color} C={C} />
      </div>
    );
  }

  return null;
}

function GrowthStat({ label, value, color, C }: { label: string; value: number | undefined; color: string; C: Record<string, string> }) {
  if (value === undefined) return null;
  const isPositive = value > 0;
  return (
    <div>
      <div style={{ color: C.t3, fontSize: 11 }}>{label}</div>
      <div style={{ fontWeight: 600, color: isPositive ? '#22c55e' : '#ef4444', fontSize: 13 }}>
        {isPositive ? '+' : ''}{typeof value === 'number' ? value.toFixed(1) : value}%
      </div>
    </div>
  );
}
