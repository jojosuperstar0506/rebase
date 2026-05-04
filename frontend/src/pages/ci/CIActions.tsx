import type { CSSProperties } from 'react';
import { Target, Smartphone, PenLine, MessageSquare } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import CISubNav from '../../components/ci/CISubNav';
import ComingSoonHero from '../../components/ci/ComingSoonHero';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * CI / Actions tab — daily content surface.
 *
 * Each "card" represents an agent currently in development that turns the
 * weekly Brief + yesterday's scrape into ready-to-publish marketing
 * material. The agents share Rebase's existing internal naming (e.g. the
 * XHS Content Warroom that already exists in the AgentMonitor) so the
 * surface reads as a coherent product, not separate features.
 *
 * Why this is its own tab vs a section inside Brief: the Brief is a
 * weekly artifact; Actions is a DAILY morning surface. Different cadence,
 * different review pattern, different audience (the Brief is for the
 * brand director on Monday; Actions is for the social-media operator on
 * Tuesday-Friday).
 */
export default function CIActions() {
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

  const cardIcon = (Icon: typeof Smartphone) => <Icon size={22} strokeWidth={1.75} />;

  // 4 agents in development. Status: all "in development" today; the
  // XHS Content Warroom is the most progressed (already has a v0.1
  // internal build per AgentMonitor).
  const agentStatusInDev = lang === 'zh' ? '研发中' : 'In development';
  const agentStatusV01 = lang === 'zh' ? 'v0.1 内测' : 'v0.1 internal';

  const cards = lang === 'zh'
    ? [
        {
          icon: cardIcon(Smartphone),
          badge: '抖音',
          title: 'Douyin 内容智能体',
          description: '每日基于昨日竞品动作生成 15 秒短视频脚本——开场 hook、主体、CTA、话题标签全部就位。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(PenLine),
          badge: '小红书',
          title: '小红书内容作战室',
          description: '当日热点话题驱动的图文笔记草稿——标题、正文、标签、配图建议，复制即可发布。',
          status: { label: agentStatusV01, color: 'cyan' as const },
        },
        {
          icon: cardIcon(MessageSquare),
          badge: '互动',
          title: '评论回复智能体',
          description: '当日热评智能回复模板——评论区运营从一小时压缩到五分钟。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Target),
          badge: '主动出击',
          title: '主动评论目标智能体',
          description: '每日推荐 3-5 个值得评论的竞品账号 / 创作者帖子，借势曝光。',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
      ]
    : [
        {
          icon: cardIcon(Smartphone),
          badge: 'Douyin',
          title: 'Douyin Content Agent',
          description: "Daily 15-sec short-video script driven by yesterday's competitive moves — hook, body, CTA, and hashtags all in place.",
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(PenLine),
          badge: 'XHS',
          title: 'XHS Content Warroom',
          description: "Trend-matched draft note — title, body, tags, image suggestions. Copy-paste to publish.",
          status: { label: agentStatusV01, color: 'cyan' as const },
        },
        {
          icon: cardIcon(MessageSquare),
          badge: 'Engagement',
          title: 'Comment Reply Agent',
          description: "Smart reply templates for today's top comments — comment-section ops compressed from one hour to five minutes.",
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
        {
          icon: cardIcon(Target),
          badge: 'Outbound',
          title: 'Outbound Targeting Agent',
          description: '3–5 competitor accounts and creator posts worth commenting on today, to ride their reach.',
          status: { label: agentStatusInDev, color: 'amber' as const },
        },
      ];

  const headline = lang === 'zh'
    ? '从昨日数据到今日上线内容——5 分钟内完成审批'
    : "From yesterday's data to today's published content — approved in five minutes";

  const tagline = lang === 'zh'
    ? '每天早上，一组专属智能体把昨日的竞品动作 + 当日热点合成为可发布的 Douyin 脚本、小红书笔记、评论模板和借势目标。运营人只需审批。'
    : 'Each morning, a set of dedicated agents synthesize yesterday\'s competitive moves and today\'s trends into publish-ready Douyin scripts, XHS posts, comment templates, and engagement targets. The operator only approves.';

  const valueProp = lang === 'zh'
    ? '把每日 2 小时的内容头脑风暴换成 5 分钟的审批流——审批的是已经基于本周简报数据准备好的具体方案，而不是从零开始。'
    : 'Trade two hours of daily content brainstorming for five minutes of approval — and what you approve is grounded in this week\'s Brief data, not built from scratch.';

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />
        <ComingSoonHero
          pageIcon={<Target size={isMobile ? 22 : 26} strokeWidth={1.75} color={C.ac} />}
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
