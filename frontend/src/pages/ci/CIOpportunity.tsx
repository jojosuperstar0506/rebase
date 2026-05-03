import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import CISubNav from '../../components/ci/CISubNav';
import ComingSoonHero from '../../components/ci/ComingSoonHero';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * CI / Opportunity tab — "this month's GTM playbook".
 *
 * Currently a coming-soon scaffold. Real implementation will:
 *   - Synthesize 30 days of competitive signals into a strategic
 *     monthly GTM plan (launch calendar, channel mix, pricing windows,
 *     KOL strategy, white-space concepts to evaluate)
 *   - Update the 1st of each month with month-ahead projections
 *   - Be the artifact the user takes into their monthly board / planning
 *     meeting — board-ready in one page
 *
 * Why this is its own tab vs the existing white-space / opportunity
 * sections in Brief: the Brief is weekly tactical, this is monthly
 * strategic. The user mental model and the artifact format are
 * meaningfully different.
 */
export default function CIOpportunity() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const pageStyle: CSSProperties = {
    background: C.bg,
    color: C.tx,
    minHeight: '100vh',
    padding: isMobile ? '16px 12px' : '32px 24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };

  const cards = lang === 'zh'
    ? [
        {
          icon: '📅',
          badge: '本月',
          title: '本月新品发布日历',
          description: '基于竞品上新节奏 + 行业季节性识别的 3-5 个上新窗口建议，附带每个窗口的差异化定位思路。',
        },
        {
          icon: '🎯',
          badge: '渠道',
          title: '渠道组合优化',
          description: '过去 30 天每个渠道的 ROI 评估，建议本月增加 / 减少哪个渠道的预算占比，附具体百分比。',
        },
        {
          icon: '💎',
          badge: '价位带',
          title: '价格窗口分析',
          description: '识别本月最有切入机会的空白价位带，并给出推荐的产品定位、SKU 和上市策略。',
        },
        {
          icon: '👥',
          badge: 'KOL',
          title: '本月 KOL 战略',
          description: '该投头部还是中腰部？建议的合作清单、预算分配、内容方向，及与下月 brief 的衔接。',
        },
        {
          icon: '🛍️',
          badge: '产品',
          title: '本月产品概念评估',
          description: '从过去 30 天 brief 累积的产品机会中挑选 1-2 个最具差异化潜力的概念，做完整的可行性 brief。',
        },
        {
          icon: '📊',
          badge: '复盘',
          title: '上月复盘 + 本月调整',
          description: '上月推出的 GTM 计划实际表现如何？哪些假设被验证 / 推翻？本月的调整建议。',
        },
      ]
    : [
        {
          icon: '📅',
          badge: 'This month',
          title: "Launch calendar",
          description: '3–5 launch windows recommended based on competitor cadence + category seasonality, each with a differentiation angle.',
        },
        {
          icon: '🎯',
          badge: 'Channels',
          title: 'Channel mix optimization',
          description: '30-day ROI assessment per channel, with specific budget shift recommendations (e.g. "shift 20% from Douyin → XHS this month").',
        },
        {
          icon: '💎',
          badge: 'Pricing',
          title: 'Pricing window analysis',
          description: 'Identifies the most promising whitespace price band this month, with recommended positioning, SKU, and go-to-market plan.',
        },
        {
          icon: '👥',
          badge: 'KOL',
          title: "This month's KOL strategy",
          description: 'Top-tier or mid-tier? Recommended creator list, budget allocation, content angles, and how it links to next month\'s brief.',
        },
        {
          icon: '🛍️',
          badge: 'Product',
          title: 'Product concept evaluation',
          description: 'Picks 1–2 most differentiated concepts from the past 30 days of briefs and produces a full feasibility brief.',
        },
        {
          icon: '📊',
          badge: 'Review',
          title: 'Last month review + this month\'s pivot',
          description: 'How did last month\'s GTM plan perform? Which assumptions held / broke? What to adjust this month.',
        },
      ];

  const headline = lang === 'zh'
    ? '本月 GTM 战略，一页读完'
    : "This month's GTM playbook, one page";

  const tagline = lang === 'zh'
    ? '每月第一天，AI 把过去 30 天的竞品信号合成为本月的战略路线图 — 发布日历、渠道组合、价格窗口、KOL 战略一次到位。'
    : 'On the first of every month, AI synthesizes 30 days of competitive signals into a strategic roadmap — launch calendar, channel mix, pricing windows, KOL strategy in one place.';

  const valueProp = lang === 'zh'
    ? '从数据到决策，一页搞定。这是你每月战略会议上拿来汇报的"董事会级"GTM 计划 — Rebase 不只是观察工具，更是你的战略副驾。'
    : 'From data to decision in one page. The board-ready GTM plan you walk into your monthly strategy meeting with — Rebase isn\'t just an observer, it\'s your strategic copilot.';

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />
        <ComingSoonHero
          pageIcon="🗺️"
          headline={headline}
          tagline={tagline}
          valueProp={valueProp}
          cards={cards}
          badgeText={lang === 'zh' ? '即将推出' : 'Coming Soon'}
          cardsHeading={lang === 'zh' ? '即将推出的内容' : "What's coming"}
        />
      </div>
    </div>
  );
}
