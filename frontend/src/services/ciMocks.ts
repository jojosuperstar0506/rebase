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

// ─── Analytics types (for the new /ci/analytics tab) ─────────────────────

export type MetricDomain = 'consumer' | 'product' | 'marketing';

/**
 * A single metric's scores across all brands in the workspace, with metadata.
 * This is what the analytics tab renders one row per.
 */
export interface FullMetric {
  metric_key: string;             // 'voice_volume', 'kol_strategy', etc.
  label: { en: string; zh: string };
  icon: string;
  domain: MetricDomain;
  /** Per-brand score. Keyed by brand_name; 'own' is a reserved key for the user's brand. */
  scores: Record<string, number>;
  /** Direction of change vs last week. Null for week 1. */
  delta: number | null;
  /** One-line description of what this metric measures. */
  description: { en: string; zh: string };
}

/**
 * Priority metric = a metric the AI flagged as most important this week.
 * Picked by (|delta| × gap_to_leader). Up to 5 per brief.
 */
export interface PriorityMetric {
  metric_key: string;
  label: { en: string; zh: string };
  icon: string;
  your_score: number;
  best_competitor: { name: string; score: number };
  delta: number | null;       // week-over-week change, null for week 1
  priority_rationale: string; // AI: "Why this metric matters THIS week"
  domain: MetricDomain;
}

/**
 * A white-space opportunity: a dimension where the competitive set is
 * uncontested — nobody is winning. The most differentiated analytical output
 * Rebase produces. Every other CI tool shows "here are scores"; Rebase says
 * "here's where no one is playing."
 */
export type WhiteSpaceCategory = 'dimension' | 'pricing' | 'keyword' | 'channel';

export interface WhiteSpace {
  id: string;
  title: string;
  category: WhiteSpaceCategory;
  /** 1-line teaser shown on the card. */
  summary: string;
  /** 2-3 sentence elaboration for the drill-down view. */
  reasoning: string;
  /** Concrete next step the user could take. */
  suggested_action: string;
  /** Supporting data points with source links where applicable. */
  supporting_data: Array<{ label: string; value: string; source_url?: string }>;
  /** 0-100 opportunity score — bigger = more empty white space. */
  opportunity_score: number;
}

export interface AnalyticsData {
  week_of: string;
  workspace_brand_name: string;
  priority_metrics: PriorityMetric[];
  white_space: WhiteSpace[];
  all_metrics: FullMetric[];
  /** Optional historical trend for the drill-down view — 6-8 weeks of priority metrics. */
  trends: Record<string, Array<{ week_of: string; score: number }>>;
}

/**
 * SignalSource — what backs a specific claim in the brief or library.
 * When a user clicks "复古跑鞋 +120%" or "Adidas Samba launched" they see
 * this data to verify where the number came from.
 */
export type SignalSourceType = 'douyin_video' | 'xhs_post' | 'keyword_trend' | 'kol_profile' | 'product_catalog';

export interface SignalSource {
  type: SignalSourceType;
  title: string;
  description: string;
  /** Sample items that back the signal (e.g., the top 5 videos for a trend). */
  items: Array<{
    title: string;
    url?: string;          // link out to the actual post if available
    creator?: string;
    stats?: string;        // e.g., "420万点赞"
    posted_at?: string;
  }>;
}

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

// Default ON until brand_positioning_pipeline + the 6am cron have a verified
// run on ECS. After that, flip to false in a follow-up commit so the Brief
// shows real DeepSeek output instead of the hand-written mock.
const USE_MOCKS = true;

/**
 * Try GET /api/ci/brief; returns null on 404/network error so callers can
 * decide whether to fall back to a mock or render an empty state.
 * Kept local to ciMocks (rather than reaching into ciApi.tryApi) so the
 * mock layer stays a single self-contained file the way it was designed.
 */
async function _fetchBriefFromApi(workspaceId: string): Promise<WeeklyBrief | null> {
  try {
    const res = await fetch(`/api/ci/brief?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !data.verdict) return null; // shape sanity check
    return data as WeeklyBrief;
  } catch {
    return null;
  }
}

export async function getBrief(workspaceId: string): Promise<WeeklyBrief | null> {
  // Skip the network call for the synthetic "local" workspace_id used when
  // a user hasn't completed onboarding yet — there's no row to fetch.
  if (workspaceId && workspaceId !== 'local') {
    const real = await _fetchBriefFromApi(workspaceId);
    if (real) return real;
    // No brief on the backend yet — fall through to mock-or-null below
  }
  if (!USE_MOCKS) return null;
  return new Promise(resolve => setTimeout(() => resolve(MOCK_BRIEF_NIKE), 300));
}

/** Try GET /api/ci/library; null on 404/network/empty so callers can fall back to mock. */
async function _fetchLibraryFromApi(workspaceId: string): Promise<LibraryEntry[] | null> {
  try {
    const res = await fetch(`/api/ci/library?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data)) return null;
    if (data.length === 0) return null; // empty library → let mock show until first brief lands
    return data as LibraryEntry[];
  } catch {
    return null;
  }
}

export async function getLibrary(workspaceId: string): Promise<LibraryEntry[]> {
  if (workspaceId && workspaceId !== 'local') {
    const real = await _fetchLibraryFromApi(workspaceId);
    if (real) return real;
  }
  if (!USE_MOCKS) return [];
  return new Promise(resolve => setTimeout(() => resolve(MOCK_LIBRARY_NIKE), 200));
}

/** Try GET /api/ci/domain-scores; null on 404/network/empty. */
async function _fetchDomainScoresFromApi(workspaceId: string): Promise<DomainScores | null> {
  try {
    const res = await fetch(`/api/ci/domain-scores?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    // Shape sanity check — must have all 3 domain keys.
    if (!data || !data.consumer || !data.product || !data.marketing) return null;
    // If every domain came back empty (no scores yet), prefer mock
    // so the "See all metrics" panel isn't blank.
    const totalCompetitors =
      Object.keys(data.consumer.competitors || {}).length +
      Object.keys(data.product.competitors || {}).length +
      Object.keys(data.marketing.competitors || {}).length;
    if (totalCompetitors === 0 && data.consumer.own === 0 && data.product.own === 0 && data.marketing.own === 0) {
      return null;
    }
    return data as DomainScores;
  } catch {
    return null;
  }
}

export async function getDomainScores(workspaceId: string): Promise<DomainScores> {
  if (workspaceId && workspaceId !== 'local') {
    const real = await _fetchDomainScoresFromApi(workspaceId);
    if (real) return real;
  }
  if (!USE_MOCKS) {
    return { consumer: { own: 0, competitors: {} }, product: { own: 0, competitors: {} }, marketing: { own: 0, competitors: {} } };
  }
  return new Promise(resolve => setTimeout(() => resolve(MOCK_DOMAIN_SCORES_NIKE), 200));
}

// Status mutations — localStorage-backed so buttons have instant feedback.
// Keys are namespaced by workspaceId so dismiss/post in workspace A
// does not bleed into workspace B.
export function markContentStatus(id: string, status: ContentStatus, workspaceId?: string): void {
  try {
    const key = workspaceId ? `rebase_ci_content_status_${workspaceId}` : 'rebase_ci_content_status';
    const raw = localStorage.getItem(key) || '{}';
    const map = JSON.parse(raw) as Record<string, ContentStatus>;
    map[id] = status;
    localStorage.setItem(key, JSON.stringify(map));
  } catch { /* quota exceeded — silently skip */ }
}

export function getContentStatus(id: string, workspaceId?: string): ContentStatus | null {
  try {
    const key = workspaceId ? `rebase_ci_content_status_${workspaceId}` : 'rebase_ci_content_status';
    const raw = localStorage.getItem(key) || '{}';
    const map = JSON.parse(raw) as Record<string, ContentStatus>;
    return map[id] ?? null;
  } catch { return null; }
}

export function markOpportunityStatus(id: string, status: OpportunityStatus, workspaceId?: string): void {
  try {
    const key = workspaceId ? `rebase_ci_opportunity_status_${workspaceId}` : 'rebase_ci_opportunity_status';
    const raw = localStorage.getItem(key) || '{}';
    const map = JSON.parse(raw) as Record<string, OpportunityStatus>;
    map[id] = status;
    localStorage.setItem(key, JSON.stringify(map));
  } catch { /* quota exceeded — silently skip */ }
}

export function getOpportunityStatus(id: string, workspaceId?: string): OpportunityStatus | null {
  try {
    const key = workspaceId ? `rebase_ci_opportunity_status_${workspaceId}` : 'rebase_ci_opportunity_status';
    const raw = localStorage.getItem(key) || '{}';
    const map = JSON.parse(raw) as Record<string, OpportunityStatus>;
    return map[id] ?? null;
  } catch { return null; }
}

// ─── Mock: Analytics for Nike workspace ──────────────────────────────────

/**
 * All 12 metrics with scores per brand.
 * Scores are in the same range as the old pipelines (0-100).
 * Keyed by brand_name; 'Nike' is the user's own brand row.
 */
export const MOCK_ALL_METRICS_NIKE: FullMetric[] = [
  // ── Consumer domain ────────────────────────────────────────────────
  {
    metric_key: 'consumer_mindshare', domain: 'consumer',
    label: { en: 'Mindshare', zh: '消费心智' }, icon: '🧠',
    description: { en: 'Share of consumer conversation', zh: '消费者对话份额' },
    scores: { Nike: 68, Adidas: 77, '安踏': 54, '李宁': 62 },
    delta: -2,
  },
  {
    metric_key: 'keywords', domain: 'consumer',
    label: { en: 'Keywords', zh: '关键词' }, icon: '🔍',
    description: { en: 'Brand keyword strength vs category', zh: '品牌关键词强度' },
    scores: { Nike: 72, Adidas: 81, '安踏': 58, '李宁': 65 },
    delta: 1,
  },
  // ── Product domain ─────────────────────────────────────────────────
  {
    metric_key: 'trending_products', domain: 'product',
    label: { en: 'Hot Products', zh: '热门商品' }, icon: '🔥',
    description: { en: 'Top-selling + new launch momentum', zh: '畅销品与新品势能' },
    scores: { Nike: 78, Adidas: 85, '安踏': 60, '李宁': 68 },
    delta: -1,
  },
  {
    metric_key: 'design_profile', domain: 'product',
    label: { en: 'Design DNA', zh: '设计分析' }, icon: '🎨',
    description: { en: 'Visual style + material innovation signals', zh: '视觉风格与材质创新信号' },
    scores: { Nike: 41, Adidas: 38, '安踏': 32, '李宁': 35 },
    delta: 0,
  },
  {
    metric_key: 'price_positioning', domain: 'product',
    label: { en: 'Pricing', zh: '价格定位' }, icon: '💰',
    description: { en: 'Price band coverage and premium power', zh: '价格带覆盖与溢价能力' },
    scores: { Nike: 82, Adidas: 79, '安踏': 55, '李宁': 63 },
    delta: 0,
  },
  {
    metric_key: 'launch_frequency', domain: 'product',
    label: { en: 'Launch Pace', zh: '新品频率' }, icon: '📦',
    description: { en: 'New SKU cadence over 90 days', zh: '90天新品上架节奏' },
    scores: { Nike: 64, Adidas: 74, '安踏': 71, '李宁': 69 },
    delta: -3,
  },
  // ── Marketing domain ───────────────────────────────────────────────
  {
    metric_key: 'voice_volume', domain: 'marketing',
    label: { en: 'Voice Volume', zh: '品牌声量' }, icon: '📢',
    description: { en: 'Total social reach + growth rate', zh: '社交总曝光与增长率' },
    scores: { Nike: 68, Adidas: 81, '安踏': 64, '李宁': 71 },
    delta: -3,
  },
  {
    metric_key: 'content_strategy', domain: 'marketing',
    label: { en: 'Content', zh: '内容策略' }, icon: '📝',
    description: { en: 'Post cadence + engagement efficiency', zh: '发布节奏与互动效率' },
    scores: { Nike: 62, Adidas: 70, '安踏': 58, '李宁': 65 },
    delta: -4,
  },
  {
    metric_key: 'kol_strategy', domain: 'marketing',
    label: { en: 'KOL Strategy', zh: 'KOL策略' }, icon: '👥',
    description: { en: 'Creator partnership depth and breadth', zh: '创作者合作的深度与广度' },
    scores: { Nike: 52, Adidas: 68, '安踏': 59, '李宁': 71 },
    delta: -9,   // This is the one the brief called out — 李宁 surge
  },
  // ── Core composites (momentum / threat / wtp) ──────────────────────
  {
    metric_key: 'momentum', domain: 'marketing',
    label: { en: 'Momentum', zh: '增长势能' }, icon: '🚀',
    description: { en: 'Composite growth indicator', zh: '综合增长指标' },
    scores: { Nike: 71, Adidas: 78, '安踏': 62, '李宁': 66 },
    delta: -2,
  },
  {
    metric_key: 'threat', domain: 'consumer',
    label: { en: 'Threat Index', zh: '威胁指数' }, icon: '⚡',
    description: { en: 'How much pressure competitors put on you', zh: '竞品施压程度' },
    scores: { Nike: 0, Adidas: 72, '安踏': 58, '李宁': 64 },  // threat doesn't apply to self
    delta: null,
  },
  {
    metric_key: 'wtp', domain: 'product',
    label: { en: 'Price Power', zh: '溢价能力' }, icon: '💎',
    description: { en: 'Willingness-to-pay above category avg', zh: '超越品类均价的意愿' },
    scores: { Nike: 74, Adidas: 78, '安踏': 52, '李宁': 58 },
    delta: 0,
  },
];

export const MOCK_PRIORITY_METRICS_NIKE: PriorityMetric[] = [
  {
    metric_key: 'kol_strategy', domain: 'marketing',
    label: { en: 'KOL Strategy', zh: 'KOL策略' }, icon: '👥',
    your_score: 52,
    best_competitor: { name: '李宁', score: 71 },
    delta: -9,
    priority_rationale:
      '李宁本周新增28名中腰部创作者，你的KOL矩阵密度差距从6分拉大到19分。若不在2周内响应，心智份额流失风险显著。',
  },
  {
    metric_key: 'voice_volume', domain: 'marketing',
    label: { en: 'Voice Volume', zh: '品牌声量' }, icon: '📢',
    your_score: 68,
    best_competitor: { name: 'Adidas', score: 81 },
    delta: -3,
    priority_rationale:
      '本周内容发布量下降40%导致声量分降3分，Adidas借Samba热度同期上升2分。这直接驱动了本周Verdict中的"稳定"结论。',
  },
  {
    metric_key: 'content_strategy', domain: 'marketing',
    label: { en: 'Content Strategy', zh: '内容策略' }, icon: '📝',
    your_score: 62,
    best_competitor: { name: 'Adidas', score: 70 },
    delta: -4,
    priority_rationale:
      '互动率（点赞/观看）下降5%，内容节奏放缓是主因。补发专业向内容可在7天内回正。',
  },
  {
    metric_key: 'launch_frequency', domain: 'product',
    label: { en: 'Launch Pace', zh: '新品频率' }, icon: '📦',
    your_score: 64,
    best_competitor: { name: 'Adidas', score: 74 },
    delta: -3,
    priority_rationale:
      'Adidas本周发布了限量款，你最近30天无重大新品。每周差距平均+1分，是慢性风险。',
  },
];

export const MOCK_WHITE_SPACE_NIKE: WhiteSpace[] = [
  {
    id: 'ws-1',
    title: '设计创新：无人占领的差异化轴',
    category: 'dimension',
    summary: '整个竞品集在 design_vision 平均仅37分 — 市场上没有品牌在"视觉独特性"上建立优势。',
    reasoning:
      'Nike(41) / Adidas(38) / 安踏(32) / 李宁(35) 四个品牌在设计创新指标上都处于中低水平，行业平均37分。消费者对于运动鞋的"辨识度"需求正在上升（复古潮回潮是一个证据），但当前没有品牌以"独特设计语言"作为核心心智。这是一个结构性空白。',
    suggested_action: '考虑推出一个具备强视觉标志性的独立系列（不走主线），以设计师合作或艺术家联名为切入点，在小红书+抖音并行种草。',
    supporting_data: [
      { label: '竞品集平均分', value: '37/100 (design_vision)' },
      { label: '你的当前分', value: '41 — 微弱领先' },
      { label: '相关关键词增长', value: '"独特设计" +82% 过去30天' },
      { label: '参考案例', value: 'Songmont（非同业）以设计心智获得1200万+粉丝' },
    ],
    opportunity_score: 82,
  },
  {
    id: 'ws-2',
    title: '高端跑步细分：¥1000-1400 价位无竞品',
    category: 'pricing',
    summary: '在¥1000-1400价位带，你的竞品集中没有品牌有跑鞋产品presence — 高端运动鞋买家被迫选择国际品牌。',
    reasoning:
      'Adidas 的旗舰跑鞋定价¥1500+，安踏李宁主力¥400-800。¥1000-1400是真正专业跑者愿意付但目前国内竞品未覆盖的价位带。同时小红书"专业跑鞋推荐"相关笔记月均点赞120万+，搜索意图强。',
    suggested_action: '评估推出一款针对马拉松跑者的¥1199旗舰跑鞋。定价策略：明显低于Adidas旗舰，但材料和科技配置接近。',
    supporting_data: [
      { label: '竞品集¥1000-1400跑鞋', value: '0 款' },
      { label: '小红书相关笔记月点赞', value: '120万+' },
      { label: 'Adidas 最低价旗舰跑鞋', value: '¥1599 (Boston 12)' },
      { label: '安踏/李宁跑鞋价格上限', value: '¥799' },
    ],
    opportunity_score: 75,
  },
  {
    id: 'ws-3',
    title: '女性跑步社群：低密度高需求',
    category: 'channel',
    summary: '"女生跑鞋"相关关键词流量上涨68%，但所有竞品的女性向KOL合作占比不足20%。',
    reasoning:
      '女性运动鞋市场增速高于整体市场，"姐姐们跑起来"、"女生专业跑鞋"等话题在小红书+抖音双平台持续升温。竞品现有KOL池中女性向占比偏低（Adidas 18% / 安踏 22% / 李宁 15%），且多为泛运动生活方式，非专业运动领域。',
    suggested_action: '建立一个专属女性运动KOL合作小组（8-12人），主打"专业女跑者"定位。预算参考：¥80-120万/季。',
    supporting_data: [
      { label: '"女生跑鞋"关键词增长', value: '+68% (抖音30天)' },
      { label: '竞品集女性KOL平均占比', value: '18%' },
      { label: '相关话题播放量', value: '3.4亿 (30天)' },
    ],
    opportunity_score: 64,
  },
];

/**
 * Mock historical trends for priority metrics (last 8 weeks).
 * These would come from a future time-series query of analysis_results.
 */
export const MOCK_TRENDS_NIKE: Record<string, Array<{ week_of: string; score: number }>> = {
  voice_volume: [
    { week_of: '2026-03-01', score: 70 }, { week_of: '2026-03-08', score: 72 },
    { week_of: '2026-03-15', score: 71 }, { week_of: '2026-03-22', score: 69 },
    { week_of: '2026-03-29', score: 70 }, { week_of: '2026-04-05', score: 72 },
    { week_of: '2026-04-12', score: 71 }, { week_of: '2026-04-19', score: 68 },
  ],
  kol_strategy: [
    { week_of: '2026-03-01', score: 58 }, { week_of: '2026-03-08', score: 60 },
    { week_of: '2026-03-15', score: 61 }, { week_of: '2026-03-22', score: 59 },
    { week_of: '2026-03-29', score: 60 }, { week_of: '2026-04-05', score: 62 },
    { week_of: '2026-04-12', score: 61 }, { week_of: '2026-04-19', score: 52 },
  ],
  content_strategy: [
    { week_of: '2026-03-01', score: 68 }, { week_of: '2026-03-08', score: 67 },
    { week_of: '2026-03-15', score: 66 }, { week_of: '2026-03-22', score: 65 },
    { week_of: '2026-03-29', score: 66 }, { week_of: '2026-04-05', score: 67 },
    { week_of: '2026-04-12', score: 66 }, { week_of: '2026-04-19', score: 62 },
  ],
  launch_frequency: [
    { week_of: '2026-03-01', score: 69 }, { week_of: '2026-03-08', score: 68 },
    { week_of: '2026-03-15', score: 67 }, { week_of: '2026-03-22', score: 66 },
    { week_of: '2026-03-29', score: 67 }, { week_of: '2026-04-05', score: 66 },
    { week_of: '2026-04-12', score: 67 }, { week_of: '2026-04-19', score: 64 },
  ],
};

export const MOCK_ANALYTICS_NIKE: AnalyticsData = {
  week_of: '2026-04-19',
  workspace_brand_name: 'Nike',
  priority_metrics: MOCK_PRIORITY_METRICS_NIKE,
  white_space: MOCK_WHITE_SPACE_NIKE,
  all_metrics: MOCK_ALL_METRICS_NIKE,
  trends: MOCK_TRENDS_NIKE,
};

// ─── Mock: Signal sources (for Library + Brief drill-downs) ──────────────

/**
 * Signal sources backing specific items in the brief. When a user clicks
 * a signal pill (e.g., "Samba OG launch") they see these sources.
 * Keyed by a string identifier embedded in the move / content / signal.
 */
export const MOCK_SIGNAL_SOURCES: Record<string, SignalSource> = {
  'adidas-samba-launch': {
    type: 'douyin_video',
    title: 'Adidas Samba OG 限量款 — 抖音热门视频',
    description: '本周抖音上关于Adidas Samba OG发布的热度数据。这些是按点赞量排序的Top 5视频。',
    items: [
      {
        title: 'Adidas Samba OG秒杀实录！这个配色太绝了',
        creator: '@潮流探店王',
        stats: '248万点赞 · 4天前',
        url: 'https://www.douyin.com/video/example1',
      },
      {
        title: '为什么Samba突然这么火？',
        creator: '@球鞋江湖',
        stats: '89万点赞 · 3天前',
        url: 'https://www.douyin.com/video/example2',
      },
      {
        title: '上脚实测｜Samba OG值不值这个价',
        creator: '@穿搭小姐姐',
        stats: '58万点赞 · 2天前',
        url: 'https://www.douyin.com/video/example3',
      },
      {
        title: '三双Samba OG对比，哪个最值得买',
        creator: '@鞋评专业户',
        stats: '25万点赞 · 1天前',
        url: 'https://www.douyin.com/video/example4',
      },
    ],
  },
  'lining-kol-surge': {
    type: 'kol_profile',
    title: '李宁本周合作的新增KOL（28位）',
    description: '通过提及李宁的视频创作者数据抓取。这里是本周新增的中腰部KOL（5-50万粉丝）列表的前10位。',
    items: [
      { title: '@运动日常阿凯', stats: '42万粉丝 · 3条李宁合作视频', creator: '男性 · 健身赛道' },
      { title: '@校园跑者小米', stats: '18万粉丝 · 2条李宁合作视频', creator: '大学生 · 跑步赛道' },
      { title: '@型格男孩Terry', stats: '35万粉丝 · 2条李宁合作视频', creator: '潮流穿搭赛道' },
      { title: '@女跑团主理人', stats: '12万粉丝 · 1条李宁合作视频', creator: '女性跑步社群' },
      { title: '@篮球教练老董', stats: '28万粉丝 · 1条李宁合作视频', creator: '篮球教学赛道' },
    ],
  },
  'retro-running-keyword': {
    type: 'keyword_trend',
    title: '关键词趋势：复古跑鞋',
    description: '"复古跑鞋" 关键词在抖音的搜索量在过去30天上涨120%。以下是权重最高的5条相关内容。',
    items: [
      { title: '#复古跑鞋穿搭 总播放量2.1亿', stats: '30天增长 +88%' },
      { title: '复古Adidas Samba限量款盘点', creator: '@潮流探店王', stats: '248万点赞' },
      { title: '90年代跑鞋复兴！这几双值得收藏', creator: '@球鞋档案馆', stats: '62万点赞' },
      { title: 'Y2K复古穿搭 跑鞋选什么', creator: '@穿搭博主Lily', stats: '34万点赞' },
    ],
  },
  'your-voice-drop': {
    type: 'douyin_video',
    title: '你本周发布的抖音视频 — 声量下降分析',
    description: '本周Nike品牌发布的视频数量环比下降40%。以下是本周发布的所有视频及其表现。',
    items: [
      { title: 'Air Max 新配色上脚', creator: '@Nike', stats: '8.2万点赞 · 5天前', url: 'https://www.douyin.com/user/nike' },
      { title: '跑者故事 第12集', creator: '@Nike', stats: '3.1万点赞 · 3天前', url: 'https://www.douyin.com/user/nike' },
      { title: '周末运动指南', creator: '@Nike', stats: '1.8万点赞 · 1天前', url: 'https://www.douyin.com/user/nike' },
    ],
  },
};

// ─── Mock API — analytics ────────────────────────────────────────────────

/** Try GET /api/ci/analytics; null on 404/network/empty so callers can fall back to mock. */
async function _fetchAnalyticsFromApi(workspaceId: string): Promise<AnalyticsData | null> {
  try {
    const res = await fetch(`/api/ci/analytics?workspace_id=${encodeURIComponent(workspaceId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.all_metrics)) return null; // shape sanity
    // If the workspace has no metric data at all, fall through to mock
    // rather than render a fully blank Analytics tab.
    const hasAnyScores = data.all_metrics.some(
      (m: FullMetric) => m.scores && Object.keys(m.scores).length > 0
    );
    if (!hasAnyScores) return null;
    return data as AnalyticsData;
  } catch {
    return null;
  }
}

export async function getAnalytics(workspaceId: string): Promise<AnalyticsData | null> {
  if (workspaceId && workspaceId !== 'local') {
    const real = await _fetchAnalyticsFromApi(workspaceId);
    if (real) return real;
  }
  if (!USE_MOCKS) return null;
  return new Promise(resolve => setTimeout(() => resolve(MOCK_ANALYTICS_NIKE), 250));
}

export async function getSignalSource(key: string): Promise<SignalSource | null> {
  if (!USE_MOCKS) return null;
  return new Promise(resolve => setTimeout(() => resolve(MOCK_SIGNAL_SOURCES[key] || null), 100));
}

/** Lookup the full brief by week_of (for Library drill-down). */
export async function getBriefByWeek(_workspaceId: string, _weekOf: string): Promise<WeeklyBrief | null> {
  if (!USE_MOCKS) return null;
  // For mocks, we only return the current week's brief if it matches
  return new Promise(resolve => setTimeout(() => resolve(MOCK_BRIEF_NIKE), 150));
}
