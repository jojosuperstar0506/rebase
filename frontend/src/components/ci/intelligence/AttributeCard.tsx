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
}

export default function AttributeCard({ metricType, data, lang, C, isMobile }: AttributeCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [hovered, setHovered] = useState(false);
  const config = METRIC_CONFIG[metricType] || DEFAULT_CONFIG;
  const isPending = !data || data.score === 0;
  const score = data?.score ?? 0;
  const brandEntries = data ? Object.entries(data.brands) : [];

  // Get the top AI insight from the first brand that has one
  const topInsight = brandEntries.find(([, b]) => b.ai_narrative)?.[1]?.ai_narrative;

  const card: CSSProperties = {
    background: C.s1,
    border: `1px solid ${expanded ? config.color + '44' : hovered ? config.color + '33' : C.bd}`,
    borderRadius: 12,
    padding: isMobile ? 14 : 18,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    boxShadow: expanded ? `0 2px 12px ${config.color}15` : hovered ? `0 1px 6px ${config.color}10` : 'none',
    transform: hovered && !expanded ? 'translateY(-1px)' : 'none',
  };

  return (
    <div
      style={card}
      onClick={() => setExpanded(!expanded)}
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
            <span>{i + 1}. {(p.name || p.product_name || '').slice(0, 30)}</span>
            <span style={{ fontWeight: 600, color: C.tx }}>
              {p.price ? `¥${p.price}` : ''} {p.sales ? `· ${p.sales}销` : ''}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // Voice volume: show growth rates
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
