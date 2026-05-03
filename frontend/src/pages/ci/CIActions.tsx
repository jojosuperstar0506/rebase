import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import CISubNav from '../../components/ci/CISubNav';
import ComingSoonHero from '../../components/ci/ComingSoonHero';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * CI / Actions tab — "what marketing material to post today".
 *
 * Currently a coming-soon scaffold. Real implementation will:
 *   - Generate ready-to-post Douyin scripts and XHS posts daily
 *   - Use yesterday's competitive moves + today's calendar context
 *     to produce platform-specific copy + hooks
 *   - Show approve / dismiss / regenerate per piece
 *
 * Why this is its own tab vs a section inside Brief: the Brief is a
 * weekly artifact — Actions is the DAILY morning briefing. Different
 * cadence = different surface.
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

  const cards = lang === 'zh'
    ? [
        {
          icon: '📱',
          badge: '抖音',
          title: '今日抖音脚本',
          description: '基于昨天竞品动态自动生成的 15 秒短视频脚本，包含开场钩子、主体内容、CTA 和话题标签。',
        },
        {
          icon: '📝',
          badge: '小红书',
          title: '今日小红书种草',
          description: '匹配今日热点的图文笔记草稿，标题 + 正文 + 标签 + 配图建议，复制即可发布。',
        },
        {
          icon: '💬',
          badge: '互动',
          title: '热评回复建议',
          description: '当日热门评论的智能回复模板，帮你在 5 分钟内完成评论区运营。',
        },
        {
          icon: '🎯',
          badge: '主动出击',
          title: '今日主动评论目标',
          description: '推荐 3-5 个值得评论的竞品账号 / 创作者帖子，帮你借势曝光。',
        },
      ]
    : [
        {
          icon: '📱',
          badge: 'Douyin',
          title: "Today's Douyin script",
          description: 'A ready-to-shoot 15-sec short video script — hook, body, CTA, and hashtags — based on yesterday\'s competitive moves.',
        },
        {
          icon: '📝',
          badge: 'XHS',
          title: "Today's Xiaohongshu post",
          description: 'A draft note matched to today\'s trending topics: title, body, tags, image suggestions. Copy-paste to publish.',
        },
        {
          icon: '💬',
          badge: 'Engagement',
          title: 'Top-comment reply templates',
          description: 'Smart reply templates for today\'s hot comments — finish your comment-section ops in 5 minutes.',
        },
        {
          icon: '🎯',
          badge: 'Outbound',
          title: 'Today\'s outbound targets',
          description: '3–5 competitor accounts / creator posts worth commenting on today, to ride their reach.',
        },
      ];

  const headline = lang === 'zh'
    ? '今日可发内容，5 分钟批准发布'
    : "Today's content, ready to post in 5 minutes";

  const tagline = lang === 'zh'
    ? '每天早上，AI 基于昨日竞品动态生成可直接发布的抖音脚本、小红书笔记和评论模板。你只需批准。'
    : 'Every morning, AI synthesizes yesterday\'s competitive moves into ready-to-publish Douyin scripts, XHS posts, and comment replies. You just approve.';

  const valueProp = lang === 'zh'
    ? '把每天 2 小时的内容头脑风暴变成 5 分钟的批准操作。这是 Rebase 的护城河 — 不仅告诉你发生了什么，更告诉你今天该做什么。'
    : 'Replace 2 hours of daily content brainstorming with 5 minutes of approval. This is Rebase\'s moat — not just telling you what happened, but exactly what to do today.';

  return (
    <div style={pageStyle}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />
        <ComingSoonHero
          pageIcon="🎯"
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
