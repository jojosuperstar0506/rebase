/**
 * CI vFinal — mock data for the Brief / Library rebuild.
 *
 * This file exists so the frontend can be built and reviewed BEFORE the
 * backend pipelines (brief_generator, gtm_content_pipeline,
 * product_opportunity_pipeline) are implemented. Every type defined here
 * is the final contract the real API will need to produce — swap the
 * imports below with real API calls once the backend ships.
 *
 * Design principles for the mock copy:
 *   - Tone matches what DeepSeek realistically produces on current scraped data
 *   - Numbers reference signals that actually exist in scraped_brand_profiles
 *     (follower counts, top videos, top creators — not fabricated product
 *     SKUs or hallucinated prices)
 *   - Chinese-first, since the primary user is a Chinese SMB owner
 */

// ─── Types (final API contract) ──────────────────────────────────────────

export type TrendDirection = 'gaining' | 'steady' | 'losing';
export type ImpactLevel = 'high' | 'medium' | 'low';

export interface BriefVerdict {
  /** 1-line hook that tops the brief. */
  headline: string;
  /** 1–2 sentence elaboration. Written in DeepSeek's voice. */
  sentence: string;
  /** Green up / yellow flat / red down arrow on the UI. */
  trend: TrendDirection;
  /** The single "if-you-only-do-one-thing" directive. */
  top_action: string;
}

export interface BriefMove {
  id: string;
  /** Which brand this event is about. Can be own_brand, a competitor, or the market. */
  brand: string;
  /** Short title — shows as card heading. */
  headline: string;
  /** Concrete evidence. One line of actual data. */
  detail: string;
  /** "So what" — why this matters to the user specifically. */
  so_what: string;
  /** Optional next-step prompt (not a promise the link works). */
  action: string;
  impact: ImpactLevel;
  /** Emoji badge for scannability. */
  icon: string;
}

export type ContentPlatform = 'douyin' | 'xhs';
export type ContentStatus = 'draft' | 'posted' | 'dismissed';

export interface ContentDraft {
  id: string;
  platform: ContentPlatform;
  /** Short internal label — shows as card title. */
  title: string;
  /** Platform-specific body. For Douyin, split into hook/main/CTA. */
  hook_3s?: string;
  main_15s?: string;
  cta_3s?: string;
  /** XHS-specific body (if platform === 'xhs'). */
  post_title?: string;
  post_body?: string;
  hashtags: string[];
  /** Why this content, why now — the competitive reasoning. */
  reasoning: string;
  why_now: string;
  status: ContentStatus;
  created_at: string;
  /** What signal or event this draft responds to. */
  based_on: string;
}

export type OpportunityStatus = 'proposed' | 'accepted' | 'dismissed';

export interface ProductOpportunity {
  id: string;
  concept_name: string;
  positioning: string;
  /** Why this window is open right now. */
  why_now: string;
  /** Concrete signals from scraped data that back the recommendation. */
  signals: Array<{ label: string; value: string }>;
  target_price: string;
  target_channels: string[];
  launch_timeline: string;
  status: OpportunityStatus;
  created_at: string;
}

export interface WeeklyBrief {
  week_of: string; // ISO date of Monday
  workspace_id: string;
  workspace_brand_name: string;
  verdict: BriefVerdict;
  moves: BriefMove[];
  content_drafts: ContentDraft[];
  product_opportunity: ProductOpportunity | null;
  /** ISO timestamp. Used for the freshness banner. */
  generated_at: string;
}

export interface LibraryEntry {
  week_of: string;
  verdict_headline: string;
  trend: TrendDirection;
  moves_count: number;
  content_drafts: ContentDraft[];
  product_opportunity: ProductOpportunity | null;
}

// ─── Mock: Nike workspace this week ──────────────────────────────────────

export const MOCK_BRIEF_NIKE: WeeklyBrief = {
  week_of: '2026-04-19',
  workspace_id: 'cfadc29c-3016-4177-afe9-b08cfc068a9b',
  workspace_brand_name: 'Nike',
  generated_at: new Date().toISOString(),

  verdict: {
    headline: '本周中国运动鞋市场保持稳定，你的核心阵地稳固。',
    sentence:
      'Adidas凭借Samba OG限量款在文化叙事上继续领跑，但你在中高端跑鞋与专业运动细分市场依然保持显著优势。李宁正在构建KOL矩阵，值得关注。',
    trend: 'steady',
    top_action: '本周以一支"专业性反差"Douyin短视频，回应Adidas的复古文化势能。',
  },

  moves: [
    {
      id: 'm1',
      brand: 'Adidas',
      icon: '🚀',
      headline: 'Adidas发布Samba OG限量款',
      detail: '4天前发布，抖音48小时内获得420万点赞，#Samba话题播放量1.2亿。',
      so_what: '限量复古系列正在蚕食¥700-1000价位的潮流用户流量。',
      action: '查看你目录中的跑鞋款式，评估是否需要做联合种草或差异化定位。',
      impact: 'high',
    },
    {
      id: 'm2',
      brand: '李宁',
      icon: '⚠️',
      headline: '李宁KOL投放激增 +43%',
      detail: '过去两周新增28名中腰部创作者（5-50万粉丝），覆盖运动、潮流、校园三个赛道。',
      so_what: '他们在构建一个自下而上的达人网络，这是目前你矩阵中较薄弱的环节。',
      action: '浏览李宁本周合作的前10大KOL，筛选2-3位候选加入你的下个brief。',
      impact: 'medium',
    },
    {
      id: 'm3',
      brand: 'Nike',
      icon: '📉',
      headline: '你的品牌声量 −3分',
      detail: '本周抖音视频发布量环比下降40%，总曝光量较上周下降约12%。',
      so_what: '内容节奏放缓正在让你损失日常心智曝光，竞品正好在此时加码。',
      action: '检查你的内容排期，本周至少补发2支达人合作视频。',
      impact: 'medium',
    },
  ],

  content_drafts: [
    {
      id: 'c1',
      platform: 'douyin',
      title: '回应Adidas Samba OG（专业性反差）',
      hook_3s: '朋友们，你们最近被Samba OG刷屏了吗？',
      main_15s:
        '经典款很帅，但我问你——你真的用它跑步吗？[切到跑步机镜头] 作为一个跑过三个全马的人告诉你，文化穿搭是一种选择，脚踝健康才是每天的刚需。[展示Air Max气垫+缓震测试]',
      cta_3s: '想知道真正为跑者设计的鞋长什么样？主页见。',
      hashtags: ['#Nike跑鞋', '#跑步装备', '#运动科学', '#跑者日常'],
      reasoning:
        '基于Adidas Samba本周的复古文化势能（420万点赞），用"文化vs功能"做差异化切入，强化你在专业性上的独特资产。',
      why_now: '竞品的文化叙事正热，是反向定位的最佳时间窗口——热度未消退，用户还在讨论。',
      status: 'draft',
      based_on: 'move m1: Adidas Samba OG发布',
      created_at: new Date().toISOString(),
    },
    {
      id: 'c2',
      platform: 'douyin',
      title: '回应李宁KOL扩张（权威感）',
      hook_3s: '你们最近有没有发现，抖音上李宁的测评突然变多了？',
      main_15s:
        '告诉你一个数据：他们两周投了28个达人。但测评多≠测评准。[切到Nike实验室画面] 我们有160年运动科学积累和专业跑步教练团队。[展示真实运动员穿Nike跑鞋训练]',
      cta_3s: '想看真正的专业测评？关注我。',
      hashtags: ['#跑鞋测评', '#运动科学', '#Nike', '#专业跑者'],
      reasoning:
        '针对李宁中腰部KOL的数量扩张，用"权威性"而非"数量"做差异化。用户对KOL矩阵已开始产生识别疲劳，权威叙事的信任度更高。',
      why_now: '李宁KOL内容本周达到峰值，用户注意力集中在此赛道。',
      status: 'draft',
      based_on: 'move m2: 李宁KOL扩张',
      created_at: new Date().toISOString(),
    },
  ],

  product_opportunity: {
    id: 'p1',
    concept_name: '轻量化复古跑鞋',
    positioning: '结合Nike运动科学内核与当代复古美学的中端跑鞋系列',
    why_now:
      '复古运动鞋搜索词环比+120%，但¥699-899价位带目前只有Adidas Samba一家独占。你具备在这个价位切入的产品组合能力和品牌信任度。',
    signals: [
      { label: '关键词趋势', value: '复古跑鞋 +120% (抖音搜索)' },
      { label: '价格带空缺', value: '¥699-899 缺少直接竞品' },
      { label: '话题热度', value: '#复古运动鞋 累计播放量2.1亿' },
      { label: '平台匹配', value: '小红书 + 抖音同步热度' },
    ],
    target_price: '¥699-899',
    target_channels: ['小红书种草', '天猫旗舰店首发', '抖音达人测评'],
    launch_timeline: '3-6个月',
    status: 'proposed',
    created_at: new Date().toISOString(),
  },
};

// ─── Mock: Library — past briefs for Nike ────────────────────────────────

export const MOCK_LIBRARY_NIKE: LibraryEntry[] = [
  {
    week_of: '2026-04-12',
    verdict_headline: '李宁上周联名动作引发热议，你的核心用户注意力出现分流。',
    trend: 'losing',
    moves_count: 3,
    content_drafts: [
      {
        id: 'c-hist-1',
        platform: 'douyin',
        title: '主推空军一号夏季穿搭',
        hook_3s: '夏天穿什么鞋显腿长？',
        main_15s: '三款Nike夏季穿搭演示...',
        cta_3s: '点主页看全部搭配',
        hashtags: ['#Nike穿搭', '#夏季', '#空军一号'],
        reasoning: '回应季节性搜索高峰',
        why_now: '夏季穿搭词周度+45%',
        status: 'posted',
        based_on: 'seasonal trend',
        created_at: '2026-04-12T09:00:00Z',
      },
    ],
    product_opportunity: {
      id: 'p-hist-1',
      concept_name: '透气网面运动凉鞋',
      positioning: '夏季专用半凉运动鞋',
      why_now: '夏季透气鞋搜索词环比+68%',
      signals: [{ label: '关键词', value: '透气运动鞋 +68%' }],
      target_price: '¥499-699',
      target_channels: ['抖音', '天猫'],
      launch_timeline: '6个月',
      status: 'dismissed',
      created_at: '2026-04-12T09:00:00Z',
    },
  },
  {
    week_of: '2026-04-05',
    verdict_headline: '你在专业跑鞋赛道继续占优，Adidas进入篮球潮流领域。',
    trend: 'gaining',
    moves_count: 2,
    content_drafts: [
      {
        id: 'c-hist-2',
        platform: 'douyin',
        title: '马拉松训练装备推荐',
        hook_3s: '你知道PB（个人最佳）需要什么装备吗？',
        main_15s: '跑鞋+压缩衣+手表，Nike都有...',
        cta_3s: '3件套全家桶主页查看',
        hashtags: ['#马拉松', '#跑步装备', '#Nike'],
        reasoning: '北马预热期',
        why_now: '北马报名开启后跑步搜索词+28%',
        status: 'posted',
        based_on: 'seasonal',
        created_at: '2026-04-05T09:00:00Z',
      },
    ],
    product_opportunity: null,
  },
  {
    week_of: '2026-03-29',
    verdict_headline: '市场热度平稳，你的新品测评ROI高于行业均值。',
    trend: 'steady',
    moves_count: 2,
    content_drafts: [],
    product_opportunity: null,
  },
];

// ─── Mock: Domain scores (used in "See all metrics" collapsible) ─────────

export interface DomainScores {
  consumer: { own: number; competitors: Record<string, number> };
  product: { own: number; competitors: Record<string, number> };
  marketing: { own: number; competitors: Record<string, number> };
}

export const MOCK_DOMAIN_SCORES_NIKE: DomainScores = {
  consumer: { own: 72, competitors: { Adidas: 78, 安踏: 61, 李宁: 68 } },
  product: { own: 81, competitors: { Adidas: 76, 安踏: 58, 李宁: 65 } },
  marketing: { own: 69, competitors: { Adidas: 74, 安踏: 62, 李宁: 71 } },
};

// ─── Mock API functions (feature-flag gated) ─────────────────────────────

const USE_MOCKS = true; // flip to false once real backend lands

export async function getBrief(_workspaceId: string): Promise<WeeklyBrief | null> {
  if (!USE_MOCKS) {
    // TODO: real API call when brief_generator_pipeline.py ships
    return null;
  }
  return new Promise(resolve => setTimeout(() => resolve(MOCK_BRIEF_NIKE), 300));
}

export async function getLibrary(_workspaceId: string): Promise<LibraryEntry[]> {
  if (!USE_MOCKS) return [];
  return new Promise(resolve => setTimeout(() => resolve(MOCK_LIBRARY_NIKE), 200));
}

export async function getDomainScores(_workspaceId: string): Promise<DomainScores> {
  if (!USE_MOCKS) {
    return { consumer: { own: 0, competitors: {} }, product: { own: 0, competitors: {} }, marketing: { own: 0, competitors: {} } };
  }
  return new Promise(resolve => setTimeout(() => resolve(MOCK_DOMAIN_SCORES_NIKE), 200));
}

// Status mutations — for now just touch localStorage so buttons have feedback
export function markContentStatus(id: string, status: ContentStatus): void {
  try {
    const raw = localStorage.getItem('rebase_ci_content_status') || '{}';
    const map = JSON.parse(raw) as Record<string, ContentStatus>;
    map[id] = status;
    localStorage.setItem('rebase_ci_content_status', JSON.stringify(map));
  } catch { /* quota */ }
}

export function getContentStatus(id: string): ContentStatus | null {
  try {
    const raw = localStorage.getItem('rebase_ci_content_status') || '{}';
    const map = JSON.parse(raw) as Record<string, ContentStatus>;
    return map[id] ?? null;
  } catch { return null; }
}

export function markOpportunityStatus(id: string, status: OpportunityStatus): void {
  try {
    const raw = localStorage.getItem('rebase_ci_opportunity_status') || '{}';
    const map = JSON.parse(raw) as Record<string, OpportunityStatus>;
    map[id] = status;
    localStorage.setItem('rebase_ci_opportunity_status', JSON.stringify(map));
  } catch { /* quota */ }
}

export function getOpportunityStatus(id: string): OpportunityStatus | null {
  try {
    const raw = localStorage.getItem('rebase_ci_opportunity_status') || '{}';
    const map = JSON.parse(raw) as Record<string, OpportunityStatus>;
    return map[id] ?? null;
  } catch { return null; }
}
