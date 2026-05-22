import type { CSSProperties } from 'react';
import {
  Map as MapIcon, CalendarDays, Target, Gem, Users,
  ShoppingBag, BarChart3,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CISubNav from '../../components/ci/CISubNav';
import ComingSoonHero from '../../components/ci/ComingSoonHero';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * CI / Opportunity tab — monthly GTM playbook surface.
 *
 * Each "card" represents a strategic-planning agent currently in
 * development. The agents take 30 days of competitive signals and
 * synthesize a board-ready monthly playbook covering launch calendar,
 * channel mix, pricing windows, KOL strategy, product concepts, and
 * last-month review.
 *
 * Why this is its own tab vs the white-space section in the Brief:
 * the Brief is a weekly tactical artifact for the brand director;
 * Opportunity is a monthly strategic artifact for the GM / founder
 * monthly planning meeting. Different cadence, different audience,
 * different output format.
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

  const cardIcon = (Icon: typeof CalendarDays) => <Icon size={22} strokeWidth={1.75} />;
  const agentStatusInDev = lang === 'zh' ? '研发中' : 'In development';

  const cards = lang === 'zh'
    ? [
        {
          icon: cardIcon(CalendarDays),
          badge: '本月',
          title: '上新日历智能体',
          description: '基于竞品上新节奏 + 品类季节性，识别本月 3-5 个最具差异化机会的上新窗口，附每个窗口的卡位建议。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Target),
          badge: '渠道',
          title: '渠道组合智能体',
          description: '过去 30 天各渠道 ROI 评估，给出本月预算重分配建议（例如「将抖音预算的 20% 转入小红书」），附具体百分比。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Gem),
          badge: '价位带',
          title: '价格窗口智能体',
          description: '识别本月最有切入机会的空白价位带，给出推荐的产品定位、SKU 数量和上市策略。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Users),
          badge: 'KOL',
          title: 'KOL 战略智能体',
          description: '本月该投头部还是中腰部？给出推荐合作清单、预算分配、内容方向，以及与下月 Brief 的衔接计划。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(ShoppingBag),
          badge: '产品',
          title: '产品概念评估智能体',
          description: '从过去 30 天 Brief 累积的产品机会中筛选 1-2 个最具差异化潜力的概念，输出完整可行性分析。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(BarChart3),
          badge: '复盘',
          title: '月度复盘智能体',
          description: '上月 GTM 计划实际表现如何？哪些假设被验证或推翻？本月的对应调整建议一并给出。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
      ]
    : [
        {
          icon: cardIcon(CalendarDays),
          badge: 'This month',
          title: 'Launch Calendar Agent',
          description: '3–5 launch windows recommended based on competitor cadence + category seasonality, each with a differentiation angle.',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Target),
          badge: 'Channels',
          title: 'Channel Mix Agent',
          description: '30-day ROI assessment per channel + specific budget shift recommendations (e.g. "shift 20% from Douyin → XHS this month").',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Gem),
          badge: 'Pricing',
          title: 'Pricing Window Agent',
          description: 'Identifies the most promising whitespace price band this month, with recommended positioning, SKU count, and go-to-market plan.',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Users),
          badge: 'KOL',
          title: 'KOL Strategy Agent',
          description: "Top-tier or mid-tier this month? Recommended creator list, budget allocation, content angles, and how it links to next month's Brief.",
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(ShoppingBag),
          badge: 'Product',
          title: 'Product Concept Agent',
          description: 'Picks 1–2 most differentiated concepts from the past 30 days of Briefs and produces a full feasibility analysis.',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(BarChart3),
          badge: 'Review',
          title: 'Monthly Review Agent',
          description: "How did last month's GTM plan perform? Which assumptions held or broke? What to adjust this month.",
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
      ];

  const headline = lang === 'zh'
    ? '本月 GTM 战略，一页读完'
    : "This month's GTM playbook in one page";

  const tagline = lang === 'zh'
    ? '每月第一天，一组战略规划智能体把过去 30 天的竞品信号合成为月度路线图——上新日历、渠道组合、价格窗口、KOL 战略、产品概念、上月复盘一次到位。'
    : "On the first of every month, a set of planning agents synthesize 30 days of competitive signals into a strategic roadmap — launch calendar, channel mix, pricing windows, KOL strategy, product concepts, and last-month review in one place.";

  const valueProp = lang === 'zh'
    ? '从数据到月度战略决策，单页输出。可以直接带进每月战略会议——所有数据来源都可追溯到本月已交付的 Brief 与原始抓取。'
    : 'From raw data to a monthly strategic decision in a single page — meeting-ready, with every claim traceable to the underlying Brief and source scrape.';

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />
        <ComingSoonHero
          pageIcon={<MapIcon size={isMobile ? 22 : 26} strokeWidth={1.75} color={C.ac} />}
          headline={headline}
          tagline={tagline}
          valueProp={valueProp}
          cards={cards}
          badgeText={lang === 'zh' ? '即将推出' : 'Coming Soon'}
          cardsHeading={lang === 'zh' ? '研发中的智能体' : 'Agents in development'}
        />
      </div>
    </div>
  );
}
