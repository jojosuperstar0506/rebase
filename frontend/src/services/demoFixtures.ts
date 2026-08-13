/**
 * demoFixtures — bags-category demo dataset (TORY BURCH).
 *
 * WHY THIS FILE EXISTS
 * The original mock fixtures in ciMocks.ts are Nike/Adidas sneaker data.
 * When demo mode shows a handbag workspace, the header said "Tory Burch"
 * while every body panel said "Nike" — a category mismatch that made the
 * demo read as broken.
 *
 * This file is the single source of demo truth for the handbag vertical:
 * one coherent story across Brief, Analytics, Library, and Evaluation, all
 * keyed to the same six brands. Nike fixtures stay in ciMocks.ts untouched
 * (still used as the generic fallback when no demo workspace is set).
 *
 * THE STORY (deliberately consistent across every surface)
 *   TORY BURCH is squeezed. COACH owns brand equity at the top; 古良吉吉
 *   is a guochao challenger taking trend + hero-product ground from below.
 *   MICHAEL KORS and MCM are both fading. Dissona is spiking on NPS.
 *   The white space: nobody owns "premium pricing power + fast trend
 *   capture" simultaneously — that quadrant is empty on the scatter plot,
 *   and it is exactly where Tory Burch's existing assets could reach.
 *
 * Numbers are illustrative and hand-authored for the demo. They are
 * internally consistent (indices reconcile with the narrative, the
 * evaluation layer's findings reference real values in this file) so a
 * prospect clicking around never hits a contradiction.
 */

import type {
  WeeklyBrief, LibraryEntry, AnalyticsData, DomainScores,
} from './ciMocks';
import type {
  IndicesResponse, IndexName, IndexValue, PillarName,
} from './ciIndices';

// ─── Cast of brands ───────────────────────────────────────────────────────

export const DEMO_OWN_BRAND = 'TORY BURCH';

export const DEMO_COMPETITORS = [
  'COACH',
  '古良吉吉',
  'MICHAEL KORS',
  'MCM',
  'Dissona',
] as const;

export const DEMO_ALL_BRANDS = [DEMO_OWN_BRAND, ...DEMO_COMPETITORS];

export const DEMO_WORKSPACE = {
  brand_name: DEMO_OWN_BRAND,
  brand_category: '女包',
  price_range: { min: 1200, max: 4800 },
  platforms: ['小红书', '抖音'],
};

// ─── Memoization ──────────────────────────────────────────────────────────
//
// Every demo getter is memoized per language. Two reasons:
//   1. Stable object identity means React sees the same reference on repeat
//      visits, so navigating away from Analytics and back does not remount
//      or re-render the whole tree.
//   2. `generated_at: new Date()` would otherwise move on every call, making
//      the freshness line ("updated just now") flicker between tabs.
// Callers must treat the returned objects as read-only.
function memo1<T>(fn: (lang: 'zh' | 'en') => T): (lang: 'zh' | 'en') => T {
  const cache = new Map<string, T>();
  return (lang) => {
    const hit = cache.get(lang);
    if (hit !== undefined) return hit;
    const value = fn(lang);
    cache.set(lang, value);
    return value;
  };
}

// ─── Brief ────────────────────────────────────────────────────────────────

export const demoBrief = memo1(buildDemoBrief);

function buildDemoBrief(lang: 'zh' | 'en'): WeeklyBrief {
  const zh = lang === 'zh';
  return {
    week_of: '2026-05-04',
    workspace_id: 'demo-mock-workspace',
    workspace_brand_name: DEMO_OWN_BRAND,
    generated_at: new Date().toISOString(),
    verdict: {
      trend: 'losing',
      headline: zh
        ? '古良吉吉正在从下方蚕食你的心智，COACH 仍压在上方'
        : '古良吉吉 is taking mindshare from below while COACH holds the ceiling',
      summary: zh
        ? '你的溢价能力依然是品类第一（82），但趋势捕捉只有 41 分——这正是被夹击的原因。'
        : 'Your pricing power still leads the category (82), but trend capture sits at 41 — that gap is why you are being squeezed.',
      sentence: zh
        ? '古良吉吉本周声量 +23%，爆品指数升至 79，主打「东方极简」叙事，正在 ¥1,200-2,000 价位带承接从你这里流失的客群。COACH 在品牌热度上保持 88 分的领先。你的溢价能力（82）和忠诚度（71）依然稳固，但内容速度（46）和趋势捕捉（41）连续三周低于品类中位数。'
        : '古良吉吉 gained 23% voice volume this week and pushed Hero Product Index to 79 on an "Eastern minimalism" narrative, absorbing customers in the ¥1,200-2,000 band. COACH holds Brand Heat at 88. Your Pricing Power (82) and Loyalty (71) remain solid, but Content Velocity (46) and Trend Capture (41) have sat below category median for three straight weeks.',
      top_action: zh
        ? '把「东方极简」这个叙事从古良吉吉手里抢回来——你有工艺资产，他们只有设计语言。'
        : 'Take the "Eastern minimalism" narrative back from 古良吉吉 — you have the craft assets, they only have the design language.',
      pressure_points: [
        {
          brand: '古良吉吉',
          badge: zh ? '趋势 +5' : 'Trend +5',
          headline: zh
            ? '以「东方极简」叙事快速承接热点流量'
            : 'Riding trend cycles fast on an "Eastern minimalism" narrative',
          evidence: [
            zh ? '趋势捕捉 76 vs 你 41' : 'Trend Capture 76 vs your 41',
            zh ? '平均比品类早 4.2 天进入热门话题' : 'Enters trending topics 4.2 days ahead of category',
            zh ? '内容速度 84（你 46）' : 'Content Velocity 84 (you: 46)',
          ],
          source: zh ? '小红书热榜追踪 · 30 天' : 'Xiaohongshu trending tracker · 30d',
        },
        {
          brand: 'COACH',
          badge: zh ? '热度 88' : 'Heat 88',
          headline: zh
            ? '品牌热度天花板未松动，压制你的上行空间'
            : 'Brand-heat ceiling unmoved, capping your upside',
          evidence: [
            zh ? '品牌热度 88（品类最高）' : 'Brand Heat 88 (category high)',
            zh ? '声量份额 31%' : '31% share of voice',
            zh ? 'KOL 足迹 84，投放密度是你的 1.6 倍' : 'Influencer Footprint 84, 1.6× your density',
          ],
          source: zh ? '抖音电商罗盘 · 女包类目' : 'Douyin Compass · handbag category',
        },
        {
          brand: 'Dissona',
          badge: 'NPS +23',
          headline: zh
            ? '中端口碑异动，「性价比」心智正在被抢占'
            : 'Mid-market word-of-mouth spiking on a value narrative',
          evidence: [
            zh ? 'NPS 从 38 跳到 61' : 'NPS jumped 38 → 61',
            zh ? '「性价比」提及量翻倍' : '"Value for money" mentions doubled',
            zh ? '爆品指数 +6 至 61' : 'Hero Product Index +6 to 61',
          ],
          source: zh ? '小红书 UGC 情感分析' : 'Xiaohongshu UGC sentiment analysis',
        },
      ],
      at_risk: {
        metric: zh ? '12 个月 GMV 风险敞口' : '12-month GMV at risk',
        magnitude: '¥18.4M',
        narrative: zh
          ? '按 ¥1,200-2,000 价位带当前流失速率（周环比 -1.8% 声量份额）线性外推 12 个月。'
          : 'Linear projection of current ¥1,200-2,000 band leakage (-1.8% share of voice WoW) over 12 months.',
      },
      sources: [
        zh ? '小红书品牌号数据 · 2026-04-27 至 05-03' : 'Xiaohongshu brand account data · 2026-04-27 to 05-03',
        zh ? '抖音电商罗盘 · 女包类目周报' : 'Douyin E-commerce Compass · handbag category weekly',
        zh ? '天猫生意参谋 · 竞品监控' : 'Tmall Shengyi Canmou · competitor monitoring',
      ],
    },
    moves: [
      {
        id: 'm1',
        brand: '古良吉吉',
        icon: '🚀',
        headline: zh ? '古良吉吉「东方极简」系列引爆' : '古良吉吉 "Eastern minimalism" line breaks out',
        detail: zh
          ? '爆品指数 71 → 79。主推款「云肩」小红书笔记 30 天内 4.2 万赞，62% 为自然种草（非投放）。'
          : 'Hero Product Index 71 → 79. Lead SKU "云肩" hit 42K likes on Xiaohongshu in 30 days, 62% organic (non-paid).',
        so_what: zh
          ? '他们用设计语言拿下了你的工艺该拿的心智。自然种草比例高说明这不是买量买出来的。'
          : 'They captured with design language the mindshare your craftsmanship should own. The high organic ratio means this was not bought.',
        action: zh
          ? '拆解他们的笔记结构，用你的皮料工艺做对位内容'
          : 'Deconstruct their post structure, counter with your leather-craft assets',
        impact: 'high',
      },
      {
        id: 'm2',
        brand: DEMO_OWN_BRAND,
        icon: '📉',
        headline: zh ? '你的内容速度连续三周低于中位数' : 'Your content velocity below median three weeks running',
        detail: zh
          ? '内容速度指数 46（品类中位 63）。周均发布 4.1 条，古良吉吉 11.3 条。'
          : 'Content Velocity Index 46 (category median 63). 4.1 posts/week vs 古良吉吉 at 11.3.',
        so_what: zh
          ? '溢价品牌不需要发得最多，但 2.7 倍的差距会让你在算法分发上持续吃亏。'
          : 'A premium brand does not need the highest volume, but a 2.7× gap compounds against you in algorithmic distribution.',
        action: zh ? '把发布节奏提到周 8 条，优先短视频' : 'Lift cadence to 8 posts/week, prioritize short video',
        impact: 'high',
      },
      {
        id: 'm3',
        brand: 'MICHAEL KORS',
        icon: '📊',
        headline: zh ? 'MICHAEL KORS 继续退场，腾出中高端空位' : 'MICHAEL KORS keeps receding, vacating upper-mid space',
        detail: zh
          ? '品牌热度 61 → 54，促销纪律 38（半数周次在打折）。¥1,500-2,500 带声量份额下降 4.1%。'
          : 'Brand Heat 61 → 54, Promotional Discipline at 38 (on sale half of all weeks). Lost 4.1% share of voice in the ¥1,500-2,500 band.',
        so_what: zh
          ? '这是你最容易接手的份额——同价位、同客群、他们在主动放弃。'
          : 'This is the most winnable share available — same price band, same customer, and they are actively abandoning it.',
        action: zh ? '针对 MK 流失客群做定向内容' : 'Run targeted content at the MK defector segment',
        impact: 'medium',
      },
    ],
    content_drafts: [
      {
        id: 'cd1',
        platform: 'xhs',
        title: zh ? '工艺对位：回应「东方极简」' : 'Craft counter: answering "Eastern minimalism"',
        post_title: zh
          ? '极简不是少做，是每一处都做对'
          : 'Minimalism is not doing less — it is getting every detail right',
        post_body: zh
          ? '最近很多人问东方极简的包该怎么挑。我的答案是：看边油。\n\n一条手工封边要过 7 道，机器压边 1 道就完事。远看一样，用三个月就分出来了。\n\n[展示 Tory Burch 手工封边工艺特写]\n\n极简的门槛不在设计，在你敢不敢把成本花在看不见的地方。'
          : 'A lot of people are asking how to choose an Eastern-minimalist bag. My answer: look at the edge paint.\n\nHand-finished edges take seven passes. Machine-pressed takes one. They look identical on day one — three months in, they do not.\n\n[Close-up of Tory Burch hand-finished edge]\n\nThe barrier in minimalism is not design. It is whether you will spend on what nobody sees.',
        hashtags: ['#东方极简', '#包包测评', '#手工工艺', '#轻奢包'],
        reasoning: zh
          ? '古良吉吉靠设计语言拿下叙事，但没有工艺资产可展示。用可验证的工艺细节做对位，是他们无法跟进的角度。'
          : '古良吉吉 owns the narrative through design language but has no craft assets to show. Countering with verifiable construction detail is an angle they cannot follow.',
        why_now: zh
          ? '「东方极简」搜索量本周 +23%，热度窗口开着，现在切入成本最低。'
          : '"Eastern minimalism" search volume +23% this week — the window is open and entry cost is lowest now.',
        status: 'draft',
        created_at: new Date().toISOString(),
        based_on: zh ? 'move m1：古良吉吉爆品' : 'move m1: 古良吉吉 hero product',
      },
      {
        id: 'cd2',
        platform: 'douyin',
        title: zh ? '15 秒工艺对比（承接 MK 流失客群）' : '15-sec craft comparison (catch MK defectors)',
        hook_3s: zh
          ? '一千八的包和三千八的包，差在哪？'
          : 'What is the difference between an ¥1,800 bag and a ¥3,800 bag?',
        main_15s: zh
          ? '[两只包并排] 看起来差不多对吧。[镜头推到边缘] 这里，手工封边七道工序。[展示内衬] 这里，全皮内衬不是绒布。[提起] 这里，五金件是实心不是空心。差的不是logo，是你用两年之后它还是不是原来的样子。'
          : '[Two bags side by side] They look similar, right? [Push in on edge] Here — seven-pass hand-finished edge. [Show lining] Here — full leather lining, not flocking. [Lift] Here — solid hardware, not hollow. The difference is not the logo. It is whether it still looks like this in two years.',
        cta_3s: zh ? '评论区告诉我你在用第几年' : 'Tell me in the comments what year you are on',
        hashtags: ['#包包知识', '#轻奢', '#工艺'],
        reasoning: zh
          ? 'MK 客群正在寻找替代品，他们对价格敏感但仍要品质背书。工艺对比同时回应了「为什么更贵」。'
          : 'MK customers are shopping for replacements — price-sensitive but still want a quality signal. The craft comparison answers "why costs more" at the same time.',
        why_now: zh ? 'MK 品牌热度本周再跌 7 分，流失正在发生' : 'MK Brand Heat dropped another 7 points this week — defection is happening now',
        status: 'draft',
        created_at: new Date().toISOString(),
        based_on: zh ? 'move m3：MK 退场' : 'move m3: MK receding',
      },
    ],
    product_opportunity: {
      id: 'po1',
      concept_name: zh ? '「续」通勤系列 — 可修复设计' : 'CONTINUE Commuter Line — repairable by design',
      positioning: zh
        ? '把「用得久」从隐性工艺变成显性卖点：可更换肩带、可翻新边油、终身保养。溢价能力 × 趋势捕捉的空白象限。'
        : 'Turn "lasts longer" from hidden craft into an explicit product promise: replaceable straps, refinishable edges, lifetime servicing. Fills the empty pricing-power × trend-capture quadrant.',
      why_now: zh
        ? '「可持续」在女包类目搜索 +64%，但价位带 ¥2,000+ 无人认领——古良吉吉做不到（无服务网络），COACH 不愿意做（伤复购）。'
        : 'Sustainability search +64% in handbags, but nobody owns it above ¥2,000 — 古良吉吉 cannot (no service network), COACH will not (cannibalizes repeat purchase).',
      signals: [
        { label: zh ? '「可持续」搜索增长' : 'Sustainability search growth', value: '+64% (90d)' },
        { label: zh ? '该价位带竞品数' : 'Competitors in band', value: zh ? '0 家' : '0' },
        { label: zh ? '你的售后网络覆盖' : 'Your service network', value: zh ? '37 城' : '37 cities' },
        { label: zh ? '估算首年 GMV' : 'Est. first-year GMV', value: '¥22-28M' },
        { label: zh ? '投资回收期' : 'Payback period', value: zh ? '14-18 个月' : '14-18 months' },
      ],
      target_price: '¥2,400 - 3,200',
      target_channels: [zh ? '小红书' : 'Xiaohongshu', zh ? '天猫旗舰店' : 'Tmall flagship', zh ? '线下精品店' : 'Retail boutiques'],
      launch_timeline: zh ? '2026 Q4（赶秋冬季）' : 'Q4 2026 (autumn/winter window)',
      status: 'proposed',
      created_at: new Date().toISOString(),
    },
  };
}

// ─── Indices (12 × 6 brands) ──────────────────────────────────────────────

/**
 * Score matrix. Hand-tuned so the scatter plot tells a story:
 *   - Plot pricing_power_index (X) vs trend_capture_index (Y)
 *   - COACH + TORY BURCH sit right but low  (premium, slow)
 *   - 古良吉吉 sits left but high            (accessible, fast)
 *   - Upper-right quadrant is EMPTY          ← the white space
 */
const SCORES: Record<string, Record<IndexName, number>> = {
  'TORY BURCH': {
    brand_heat: 64, brand_nps: 58, pricing_power_index: 82, loyalty_index: 71,
    content_velocity_index: 46, influencer_footprint: 52, search_dominance: 57,
    hero_product_index: 55, launch_cadence: 61, trend_capture_index: 41,
    innovation_score: 49, promotional_discipline: 78,
  },
  'COACH': {
    brand_heat: 88, brand_nps: 66, pricing_power_index: 74, loyalty_index: 79,
    content_velocity_index: 71, influencer_footprint: 84, search_dominance: 81,
    hero_product_index: 72, launch_cadence: 68, trend_capture_index: 58,
    innovation_score: 54, promotional_discipline: 62,
  },
  '古良吉吉': {
    brand_heat: 77, brand_nps: 69, pricing_power_index: 48, loyalty_index: 63,
    content_velocity_index: 84, influencer_footprint: 66, search_dominance: 62,
    hero_product_index: 79, launch_cadence: 82, trend_capture_index: 76,
    innovation_score: 73, promotional_discipline: 55,
  },
  'MICHAEL KORS': {
    brand_heat: 54, brand_nps: 41, pricing_power_index: 51, loyalty_index: 48,
    content_velocity_index: 52, influencer_footprint: 47, search_dominance: 55,
    hero_product_index: 43, launch_cadence: 49, trend_capture_index: 38,
    innovation_score: 34, promotional_discipline: 38,
  },
  'MCM': {
    brand_heat: 49, brand_nps: 44, pricing_power_index: 63, loyalty_index: 45,
    content_velocity_index: 41, influencer_footprint: 39, search_dominance: 44,
    hero_product_index: 38, launch_cadence: 42, trend_capture_index: 35,
    innovation_score: 41, promotional_discipline: 51,
  },
  'Dissona': {
    brand_heat: 58, brand_nps: 61, pricing_power_index: 44, loyalty_index: 57,
    content_velocity_index: 67, influencer_footprint: 51, search_dominance: 49,
    hero_product_index: 61, launch_cadence: 64, trend_capture_index: 59,
    innovation_score: 52, promotional_discipline: 47,
  },
};

const DELTAS: Record<string, Partial<Record<IndexName, number>>> = {
  'TORY BURCH':   { brand_heat: -3, trend_capture_index: -2, content_velocity_index: -4, pricing_power_index: +1 },
  'COACH':        { brand_heat: +1, influencer_footprint: +3, search_dominance: +2 },
  '古良吉吉':      { brand_heat: +8, hero_product_index: +8, trend_capture_index: +5, content_velocity_index: +6 },
  'MICHAEL KORS': { brand_heat: -7, promotional_discipline: -5, hero_product_index: -4 },
  'MCM':          { brand_heat: -4, loyalty_index: -3 },
  'Dissona':      { brand_nps: +23, hero_product_index: +6, content_velocity_index: +4 },
};

const INDEX_META: Record<IndexName, { pillar: PillarName; zh: string; en: string }> = {
  brand_heat:              { pillar: 'brand_equity',     zh: '品牌热度',   en: 'Brand Heat' },
  brand_nps:               { pillar: 'brand_equity',     zh: '品牌 NPS',   en: 'Brand NPS' },
  pricing_power_index:     { pillar: 'brand_equity',     zh: '溢价能力',   en: 'Pricing Power' },
  loyalty_index:           { pillar: 'brand_equity',     zh: '忠诚度',     en: 'Loyalty Index' },
  content_velocity_index:  { pillar: 'marketing_engine', zh: '内容速度',   en: 'Content Velocity' },
  influencer_footprint:    { pillar: 'marketing_engine', zh: 'KOL 足迹',   en: 'Influencer Footprint' },
  search_dominance:        { pillar: 'marketing_engine', zh: '搜索话语权', en: 'Search Dominance' },
  hero_product_index:      { pillar: 'commerce_engine',  zh: '爆品指数',   en: 'Hero Product Index' },
  launch_cadence:          { pillar: 'commerce_engine',  zh: '上新节奏',   en: 'Launch Cadence' },
  trend_capture_index:     { pillar: 'commerce_engine',  zh: '趋势捕捉',   en: 'Trend Capture' },
  innovation_score:        { pillar: 'commerce_engine',  zh: '创新评分',   en: 'Innovation Score' },
  promotional_discipline:  { pillar: 'commerce_engine',  zh: '促销纪律',   en: 'Promotional Discipline' },
};

const ALL_INDEX_NAMES = Object.keys(INDEX_META) as IndexName[];

function dirFromDelta(d: number | null): IndexValue['direction'] {
  if (d === null) return null;
  if (d >= 3) return 'gaining';
  if (d <= -3) return 'losing';
  return 'steady';
}

export const demoIndices = memo1(buildDemoIndices);

function buildDemoIndices(lang: 'zh' | 'en'): IndicesResponse {
  const zh = lang === 'zh';
  const now = new Date().toISOString();

  const indices_by_competitor: IndicesResponse['indices_by_competitor'] = {};
  for (const brand of DEMO_ALL_BRANDS) {
    const row: Partial<Record<IndexName, IndexValue>> = {};
    for (const name of ALL_INDEX_NAMES) {
      const score = SCORES[brand][name];
      const delta = DELTAS[brand]?.[name] ?? null;
      row[name] = {
        score,
        version: 'v1.0',
        pillar: INDEX_META[name].pillar,
        direction: dirFromDelta(delta),
        delta,
        inputs: {
          voice_share_pct: Math.round(score * 0.42 * 10) / 10,
          engagement_rate: Math.round(score * 0.06 * 100) / 100,
          sample_posts: 40 + (score % 37),
        },
        weights: { voice_share_pct: 0.4, engagement_rate: 0.35, sample_posts: 0.25 },
        explain_text: [
          zh
            ? `声量份额 ${Math.round(score * 0.42 * 10) / 10}%（权重 40%）`
            : `Voice share ${Math.round(score * 0.42 * 10) / 10}% (weight 40%)`,
          zh
            ? `互动率 ${Math.round(score * 0.06 * 100) / 100}%（权重 35%）`
            : `Engagement rate ${Math.round(score * 0.06 * 100) / 100}% (weight 35%)`,
          zh
            ? `样本量 ${40 + (score % 37)} 条笔记（权重 25%）`
            : `Sample size ${40 + (score % 37)} posts (weight 25%)`,
        ],
        is_proxy: false,
        computed_at: now,
      };
    }
    indices_by_competitor[brand] = row;
  }

  const index_labels = {} as IndicesResponse['index_labels'];
  for (const name of ALL_INDEX_NAMES) {
    index_labels[name] = {
      label: zh ? INDEX_META[name].zh : INDEX_META[name].en,
      pillar: INDEX_META[name].pillar,
    };
  }

  return {
    workspace_brand_name: DEMO_OWN_BRAND,
    brand_category: '女包',
    lang,
    hierarchy: {
      pillars: {
        brand_equity: {
          hero: 'brand_heat',
          supporting: ['brand_nps', 'pricing_power_index', 'loyalty_index'],
        },
        marketing_engine: {
          hero: 'content_velocity_index',
          supporting: ['influencer_footprint', 'search_dominance'],
        },
        commerce_engine: {
          hero: 'hero_product_index',
          supporting: ['launch_cadence', 'trend_capture_index', 'innovation_score', 'promotional_discipline'],
        },
      },
    },
    pillar_labels: {
      brand_equity:     zh ? '品牌资产' : 'Brand Equity',
      marketing_engine: zh ? '营销引擎' : 'Marketing Engine',
      commerce_engine:  zh ? '商业引擎' : 'Commerce Engine',
    },
    index_labels,
    indices_by_competitor,
    computed_at: now,
  };
}

// ─── Domain scores ────────────────────────────────────────────────────────

export function demoDomainScores(): DomainScores {
  return {
    consumer:  { own: 64, competitors: { COACH: 84, '古良吉吉': 71, 'MICHAEL KORS': 48, MCM: 46, Dissona: 59 } },
    product:   { own: 62, competitors: { COACH: 70, '古良吉吉': 78, 'MICHAEL KORS': 41, MCM: 39, Dissona: 61 } },
    marketing: { own: 52, competitors: { COACH: 79, '古良吉吉': 74, 'MICHAEL KORS': 51, MCM: 41, Dissona: 56 } },
  };
}

// ─── Library ──────────────────────────────────────────────────────────────

export const demoLibrary = memo1(buildDemoLibrary);

function buildDemoLibrary(lang: 'zh' | 'en'): LibraryEntry[] {
  const zh = lang === 'zh';
  const current = demoBrief(lang);
  return [
    {
      week_of: '2026-05-04',
      verdict_headline: current.verdict.headline,
      trend: 'losing',
      moves_count: 3,
      content_drafts: current.content_drafts,
      product_opportunity: current.product_opportunity,
    },
    {
      week_of: '2026-04-27',
      verdict_headline: zh
        ? 'COACH 春季营销投放加码，你的搜索份额被压缩'
        : 'COACH escalated spring spend — your search share compressed',
      trend: 'losing',
      moves_count: 3,
      content_drafts: [],
      product_opportunity: null,
    },
    {
      week_of: '2026-04-20',
      verdict_headline: zh
        ? '溢价能力回升至 81，高端客群基本盘稳固'
        : 'Pricing Power recovered to 81 — premium base holding',
      trend: 'steady',
      moves_count: 2,
      content_drafts: [],
      product_opportunity: null,
    },
  ];
}

// ─── Analytics ────────────────────────────────────────────────────────────

const DOMAIN_OF: Record<PillarName, 'consumer' | 'product' | 'marketing'> = {
  brand_equity: 'consumer',
  commerce_engine: 'product',
  marketing_engine: 'marketing',
};

const INDEX_ICON: Record<IndexName, string> = {
  brand_heat: '🔥', brand_nps: '💬', pricing_power_index: '💰', loyalty_index: '🔁',
  content_velocity_index: '⚡', influencer_footprint: '📣', search_dominance: '🔍',
  hero_product_index: '🏆', launch_cadence: '🚀', trend_capture_index: '📈',
  innovation_score: '💡', promotional_discipline: '🎯',
};

const INDEX_DESC: Record<IndexName, { zh: string; en: string }> = {
  brand_heat:             { zh: '声量与情感趋势的综合动能', en: 'Composite momentum of voice volume and sentiment trend' },
  brand_nps:             { zh: '基于 UGC 推荐语言的净推荐值代理', en: 'Net-promoter proxy derived from UGC recommendation language' },
  pricing_power_index:   { zh: '相对品类基准的溢价承受力', en: 'Ability to sustain premium versus category baseline' },
  loyalty_index:         { zh: '重复提及与回购意向信号', en: 'Repeat-mention and re-purchase intent signals' },
  content_velocity_index:{ zh: '发布频次 × 互动质量 × 形式多样性', en: 'Posting cadence × engagement quality × format diversity' },
  influencer_footprint:  { zh: 'KOL 层级结构与投放效率', en: 'KOL tier mix and campaign efficiency' },
  search_dominance:      { zh: '品类搜索词的占位强度', en: 'Share of category search terms owned' },
  hero_product_index:    { zh: '爆品集中度与自然种草比例', en: 'Hero-SKU concentration and organic seeding rate' },
  launch_cadence:        { zh: '上新节奏与发布影响力', en: 'New-product rhythm and launch impact' },
  trend_capture_index:   { zh: '进入热点的速度与持续参与度', en: 'Speed into trends and sustained participation' },
  innovation_score:      { zh: '联名、限量与设计新意密度', en: 'Collab, limited-drop and design-novelty density' },
  promotional_discipline:{ zh: '折扣频次与价格稳定性（越高越健康）', en: 'Discount frequency and price stability (higher is healthier)' },
};

export const demoAnalytics = memo1(buildDemoAnalytics);

function buildDemoAnalytics(lang: 'zh' | 'en'): AnalyticsData {
  const zh = lang === 'zh';

  const priority = (key: IndexName, rationaleZh: string, rationaleEn: string) => {
    let leader = DEMO_COMPETITORS[0] as string;
    let best = -1;
    for (const b of DEMO_COMPETITORS) {
      if (SCORES[b][key] > best) { best = SCORES[b][key]; leader = b; }
    }
    return {
      metric_key: key,
      label: { zh: INDEX_META[key].zh, en: INDEX_META[key].en },
      icon: INDEX_ICON[key],
      your_score: SCORES[DEMO_OWN_BRAND][key],
      best_competitor: { name: leader, score: best },
      delta: DELTAS[DEMO_OWN_BRAND]?.[key] ?? null,
      priority_rationale: zh ? rationaleZh : rationaleEn,
      domain: DOMAIN_OF[INDEX_META[key].pillar],
    };
  };

  return {
    week_of: '2026-05-04',
    workspace_brand_name: DEMO_OWN_BRAND,
    priority_metrics: [
      priority('trend_capture_index',
        '与领先者差距 35 分，且连续三周下滑——这是本周最该修的指标。',
        '35 points behind the leader and falling three weeks running — the highest-leverage fix this week.'),
      priority('content_velocity_index',
        '发布频次仅为古良吉吉的 36%，算法分发持续吃亏。',
        'Posting at 36% of 古良吉吉 cadence — a compounding algorithmic disadvantage.'),
      priority('hero_product_index',
        '爆品集中度不足，前三 SKU 仅占声量的 31%（品类健康值 55%+）。',
        'Weak hero concentration — top 3 SKUs carry only 31% of voice (healthy is 55%+).'),
      priority('brand_heat',
        '本周 -3，主要由声量份额下滑驱动，而非情感恶化。',
        'Down 3 this week, driven by voice-share decline rather than sentiment deterioration.'),
      priority('pricing_power_index',
        '品类第一且稳定——这是你唯一可以进攻的资产。',
        'Category leader and stable — the one asset you can attack from.'),
    ],
    all_metrics: ALL_INDEX_NAMES.map(key => ({
      metric_key: key,
      label: { zh: INDEX_META[key].zh, en: INDEX_META[key].en },
      icon: INDEX_ICON[key],
      domain: DOMAIN_OF[INDEX_META[key].pillar],
      scores: Object.fromEntries(DEMO_ALL_BRANDS.map(b => [b, SCORES[b][key]])),
      raw_inputs: Object.fromEntries(DEMO_ALL_BRANDS.map(b => [b, {
        voice_share_pct: Math.round(SCORES[b][key] * 0.42 * 10) / 10,
        engagement_rate: Math.round(SCORES[b][key] * 0.06 * 100) / 100,
        sample_posts: 40 + (SCORES[b][key] % 37),
      }])),
      delta: DELTAS[DEMO_OWN_BRAND]?.[key] ?? null,
      description: INDEX_DESC[key],
    })),
    white_space: [
      {
        id: 'ws1',
        category: 'pricing',
        title: zh ? '¥2,400-3,200「可修复溢价」无人认领' : 'Nobody owns "repairable premium" at ¥2,400-3,200',
        summary: zh
          ? '溢价能力 × 趋势捕捉的右上象限完全为空。'
          : 'The upper-right pricing-power × trend-capture quadrant is completely empty.',
        reasoning: zh
          ? '把溢价能力放 X 轴、趋势捕捉放 Y 轴，六个品牌全部落在左上或右下——没有品牌同时具备高溢价和快趋势响应。古良吉吉做不到（无全国售后网络支撑「可修复」承诺），COACH 不愿做（终身保养会伤复购模型）。你在 37 城有售后网络，这是结构性优势。'
          : 'Plot pricing power on X and trend capture on Y: all six brands land upper-left or lower-right. Nobody holds premium pricing and fast trend response at once. 古良吉吉 cannot (no national service network to back a repairability promise); COACH will not (lifetime servicing cannibalizes their repeat-purchase model). Your 37-city service network is a structural advantage here.',
        suggested_action: zh
          ? '以「可修复设计」为核心开发 ¥2,400-3,200 通勤系列，把售后网络变成产品卖点'
          : 'Build a ¥2,400-3,200 commuter line around repairable design — turn the service network into a product claim',
        supporting_data: [
          { label: zh ? '「可持续」搜索增长（90 天）' : 'Sustainability search growth (90d)', value: '+64%' },
          { label: zh ? '该价位带竞品数' : 'Competitors in band', value: zh ? '0 家' : '0' },
          { label: zh ? '你的售后网络覆盖' : 'Your service coverage', value: zh ? '37 城' : '37 cities' },
        ],
        opportunity_score: 84,
      },
      {
        id: 'ws2',
        category: 'keyword',
        title: zh ? '「东方极简」+ 工艺证据 组合无人占据' : '"Eastern minimalism" + craft-proof combo unclaimed',
        summary: zh
          ? '古良吉吉占了叙事但拿不出工艺内容。'
          : '古良吉吉 owns the narrative but publishes no craft content.',
        reasoning: zh
          ? '「东方极简」相关笔记 30 天内增长 23%，古良吉吉占据其中 41% 的声量。但抽样 200 条相关内容中，仅 6 条包含可验证的工艺细节（封边、内衬、五金）。叙事和证据之间存在空隙——你有工艺资产但没在这个话题下发声。'
          : '"Eastern minimalism" posts grew 23% over 30 days, with 古良吉吉 taking 41% of that voice. But across a 200-post sample, only 6 contained verifiable construction detail (edge finishing, lining, hardware). There is a gap between narrative and proof — you have the craft assets but are absent from the conversation.',
        suggested_action: zh
          ? '在「东方极简」话题下发布工艺拆解内容，用可验证细节建立差异'
          : 'Publish craft-teardown content under the "Eastern minimalism" tag, differentiating on verifiable detail',
        supporting_data: [
          { label: zh ? '话题 30 天增长' : 'Topic growth (30d)', value: '+23%' },
          { label: zh ? '含工艺证据的内容占比' : 'Posts with craft proof', value: '3%' },
          { label: zh ? '你在该话题的声量份额' : 'Your share of topic voice', value: '4%' },
        ],
        opportunity_score: 71,
      },
      {
        id: 'ws3',
        category: 'channel',
        title: zh ? 'MK 流失客群未被系统承接' : 'MK defector segment not systematically captured',
        summary: zh
          ? 'MK 让出的份额被分散吸收，无人集中承接。'
          : 'The share MK is shedding is being absorbed diffusely — nobody is concentrating on it.',
        reasoning: zh
          ? 'MICHAEL KORS 在 ¥1,500-2,500 价位带年内流失 4.1% 声量份额，促销纪律降至 38（半数周次在打折）。但追踪该份额流向发现，无任何单一品牌吸收超过 1%。这是一批正在主动寻找替代品、且已被证明愿意为品牌支付溢价的客群。'
          : 'MICHAEL KORS shed 4.1% of voice share in the ¥1,500-2,500 band YTD, with Promotional Discipline down to 38 (on sale half of all weeks). Tracing where that share went, no single brand absorbed more than 1%. This is a cohort actively shopping for replacements that has already demonstrated willingness to pay a brand premium.',
        suggested_action: zh
          ? '针对 MK 客群做定向内容与再营销，主打「同价位更耐用」'
          : 'Run targeted content and retargeting at MK customers on a "same price, lasts longer" angle',
        supporting_data: [
          { label: zh ? 'MK 年内份额流失' : 'MK share lost YTD', value: '-4.1%' },
          { label: zh ? '最大单一吸收方' : 'Largest single absorber', value: '<1%' },
          { label: zh ? 'MK 促销纪律' : 'MK Promotional Discipline', value: '38' },
        ],
        opportunity_score: 66,
      },
    ],
    trends: {},
  };
}

// ─── Evaluation layer (LLM-as-judge) ──────────────────────────────────────

export type JudgeVerdict = 'pass' | 'warn' | 'fail';
export type EvalCategory = 'collection' | 'computation' | 'narrative';

export interface EvalCheck {
  id: string;
  category: EvalCategory;
  /** What was checked, e.g. "Brand identity match · COACH" */
  title: string;
  /** The specific brand / index / claim under test */
  subject: string;
  verdict: JudgeVerdict;
  /** Judge's confidence in its own verdict, 0-100 */
  confidence: number;
  /** The judge's reasoning, one or two sentences */
  finding: string;
  /** Supporting data the judge cited */
  evidence: string[];
  /** Present when verdict is warn/fail */
  recommendation?: string;
}

export interface EvaluationReport {
  workspace_brand_name: string;
  evaluated_at: string;
  /** Which model rendered the judgments */
  model: string;
  /** Overall 0-100 trust score across all checks */
  trust_score: number;
  summary: { total: number; passed: number; warned: number; failed: number };
  coverage: { brands: number; indices: number; claims: number };
  checks: EvalCheck[];
}

/**
 * Demo evaluation report.
 *
 * The findings here are modeled on real defects this codebase actually hit
 * (documented in DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md):
 *   - zero-follower scrape rows poisoning growth math
 *   - LLM narratives citing deltas that do not reconcile with raw_inputs
 *   - metric domains going dark because the scraper never fed them
 * Keeping the demo honest about these makes the evaluation layer credible
 * rather than a wall of green checkmarks.
 */
export const demoEvaluation = memo1(buildDemoEvaluation);

function buildDemoEvaluation(lang: 'zh' | 'en'): EvaluationReport {
  const zh = lang === 'zh';
  const checks: EvalCheck[] = [
    // ── Collection ────────────────────────────────────────────────────
    {
      id: 'c1',
      category: 'collection',
      title: zh ? '品牌身份匹配' : 'Brand identity match',
      subject: zh ? '全部 6 个品牌' : 'All 6 brands',
      verdict: 'pass',
      confidence: 96,
      finding: zh
        ? '6 个品牌抓取到的账号均带官方认证标识，与目标品牌名称一致，无同名账号误抓。'
        : 'All 6 scraped accounts carry official verification badges and match the target brand names. No same-name misattribution detected.',
      evidence: [
        zh ? 'TORY BURCH · 小红书品牌号 · 已认证' : 'TORY BURCH · Xiaohongshu brand account · verified',
        zh ? 'COACH · 蓝V 认证 · 粉丝 128 万' : 'COACH · blue-V verified · 1.28M followers',
        zh ? '古良吉吉 · 品牌号 · 粉丝 36 万' : '古良吉吉 · brand account · 360K followers',
      ],
    },
    {
      id: 'c2',
      category: 'collection',
      title: zh ? '数据新鲜度' : 'Data freshness',
      subject: 'MCM',
      verdict: 'warn',
      confidence: 91,
      finding: zh
        ? 'MCM 最近一次成功抓取为 9 天前，超过 7 天新鲜度阈值。其余 5 个品牌均在 48 小时内。'
        : 'MCM last successful scrape was 9 days ago, past the 7-day freshness threshold. The other 5 brands are all within 48 hours.',
      evidence: [
        zh ? 'MCM 最后抓取：2026-04-25' : 'MCM last scraped: 2026-04-25',
        zh ? '其余品牌中位数：1.2 天前' : 'Median for other brands: 1.2 days ago',
      ],
      recommendation: zh
        ? 'MCM 的品牌热度（49）和忠诚度（45）应视为陈旧值，不要据此下结论。重新抓取后复核。'
        : 'Treat MCM Brand Heat (49) and Loyalty (45) as stale. Do not draw conclusions until re-scraped.',
    },
    {
      id: 'c3',
      category: 'collection',
      title: zh ? '零值异常检测' : 'Zero-value anomaly detection',
      subject: zh ? '全部品牌 · 粉丝数字段' : 'All brands · follower_count field',
      verdict: 'pass',
      confidence: 99,
      finding: zh
        ? '未发现粉丝数为 0 的抓取记录。此前导致声量指数失真的鉴权墙空值问题已被 SQL 层过滤器拦截。'
        : 'No follower_count=0 rows present. The auth-wall silent-zero issue that previously distorted voice-volume scores is being filtered at the SQL layer.',
      evidence: [
        zh ? 'VALID_PROFILE_FILTER 已应用于 5 条计算管线' : 'VALID_PROFILE_FILTER applied across 5 scoring pipelines',
        zh ? '本次评估窗口内 0 条记录被过滤' : '0 rows filtered in this evaluation window',
      ],
    },
    {
      id: 'c4',
      category: 'collection',
      title: zh ? '跨平台一致性' : 'Cross-platform consistency',
      subject: '古良吉吉',
      verdict: 'pass',
      confidence: 88,
      finding: zh
        ? '小红书与抖音的粉丝量级比例（1:0.94）落在女包类目正常区间（0.6-1.5），无平台间数据冲突。'
        : 'Xiaohongshu-to-Douyin follower ratio (1:0.94) falls in the normal handbag-category band (0.6-1.5). No cross-platform conflict.',
      evidence: [
        zh ? '小红书 36.0 万 / 抖音 33.8 万' : 'Xiaohongshu 360K / Douyin 338K',
        zh ? '类目中位比例：1:0.87' : 'Category median ratio: 1:0.87',
      ],
    },

    // ── Computation ───────────────────────────────────────────────────
    {
      id: 'p1',
      category: 'computation',
      title: zh ? '公式重算校验' : 'Formula recomputation',
      subject: zh ? '12 项指数 × 6 品牌 = 72 个分值' : '12 indices × 6 brands = 72 scores',
      verdict: 'pass',
      confidence: 100,
      finding: zh
        ? '独立重算全部 72 个分值，与存储值逐一比对，最大偏差 0.0——权重与输入均按 v1.0 规格正确应用。'
        : 'Independently recomputed all 72 scores and compared against stored values. Maximum deviation 0.0 — weights and inputs applied correctly per v1.0 spec.',
      evidence: [
        zh ? '72/72 分值精确匹配' : '72/72 scores matched exactly',
        zh ? '方法版本一致：全部 v1.0' : 'Method version consistent: all v1.0',
      ],
    },
    {
      id: 'p2',
      category: 'computation',
      title: zh ? '输入完整性' : 'Input completeness',
      subject: zh ? '趋势捕捉指数' : 'Trend Capture Index',
      verdict: 'warn',
      confidence: 84,
      finding: zh
        ? '趋势捕捉依赖历史快照计算「进入热点的延迟天数」，但快照表仅有 3 周数据，低于算法要求的 8 周。当前分值为代理估算。'
        : 'Trend Capture depends on historical snapshots to compute trend-entry lag, but the snapshot table holds only 3 weeks against the 8 weeks the algorithm expects. Current scores are proxy estimates.',
      evidence: [
        zh ? '可用历史：3 周（需 8 周）' : 'Available history: 3 weeks (needs 8)',
        zh ? '受影响品牌：全部 6 个' : 'Affected brands: all 6',
      ],
      recommendation: zh
        ? '在 analysis_history 累积到 8 周之前，趋势捕捉分值应标注为估算值，不宜作为单独决策依据。'
        : 'Until analysis_history accumulates 8 weeks, label Trend Capture as estimated and avoid using it as a standalone decision input.',
    },
    {
      id: 'p3',
      category: 'computation',
      title: zh ? '分值区间校验' : 'Score range validation',
      subject: zh ? '全部指数' : 'All indices',
      verdict: 'pass',
      confidence: 100,
      finding: zh
        ? '全部分值落在 0-100 有效区间内，无封顶聚集（此前 WTP 多品牌同为 100 的问题未复现）。'
        : 'All scores fall within the valid 0-100 range with no cap clustering — the prior issue of multiple brands pinned at 100 on WTP does not recur.',
      evidence: [
        zh ? '最小值 34（MK 创新评分）· 最大值 88（COACH 品牌热度）' : 'Min 34 (MK Innovation) · Max 88 (COACH Brand Heat)',
        zh ? '封顶命中：0 次' : 'Cap hits: 0',
      ],
    },

    // ── Narrative ─────────────────────────────────────────────────────
    {
      id: 'n1',
      category: 'narrative',
      title: zh ? '数字可溯源性' : 'Numeric traceability',
      subject: zh ? '简报判词 + 3 条动态' : 'Brief verdict + 3 moves',
      verdict: 'pass',
      confidence: 94,
      finding: zh
        ? '判词与动态中引用的 14 个数字全部可回溯到 raw_inputs，无凭空生成。数值一致性校验器已拦截 LLM 编造增量的问题。'
        : 'All 14 numbers cited across the verdict and moves trace back to raw_inputs. No fabricated figures — the numeric-coherence coercer is catching LLM-invented deltas.',
      evidence: [
        zh ? '14/14 数字匹配源数据（容差 ±1）' : '14/14 numbers matched source data (±1 tolerance)',
        zh ? '本周被拦截的编造动态：1 条' : 'Fabricated moves dropped this week: 1',
      ],
    },
    {
      id: 'n2',
      category: 'narrative',
      title: zh ? '品牌指代校验' : 'Brand reference validation',
      subject: zh ? '全部生成文案' : 'All generated copy',
      verdict: 'pass',
      confidence: 98,
      finding: zh
        ? '生成内容中提及的品牌全部在追踪名单内，无幻觉品牌（如凭空出现的竞品名）。'
        : 'Every brand named in generated copy is within the tracked set. No hallucinated competitors appear.',
      evidence: [
        zh ? '提及品牌：6 个，全部在册' : 'Brands referenced: 6, all tracked',
        zh ? '未追踪品牌提及：0' : 'Untracked brand mentions: 0',
      ],
    },
    {
      id: 'n3',
      category: 'narrative',
      title: zh ? '因果推断强度' : 'Causal claim strength',
      subject: zh ? '判词：「古良吉吉正在承接你流失的客群」' : 'Verdict: "古良吉吉 is absorbing your lost customers"',
      verdict: 'warn',
      confidence: 76,
      finding: zh
        ? '该表述为因果断言，但底层仅有相关性证据（你份额下降、他们份额上升，同一价位带）。无客群流向的直接数据。'
        : 'This is stated as causation, but the underlying evidence is correlational only — your share fell while theirs rose in the same price band. There is no direct customer-flow data.',
      evidence: [
        zh ? '证据类型：同期相关性' : 'Evidence type: contemporaneous correlation',
        zh ? '缺失：客群流向 / 交叉购买数据' : 'Missing: customer-flow / cross-purchase data',
      ],
      recommendation: zh
        ? '改为相关性表述（「与…同期发生」），或接入天猫客群重合度数据以支撑因果claim。'
        : 'Soften to correlational phrasing ("coincides with"), or connect Tmall audience-overlap data to support the causal claim.',
    },
    {
      id: 'n4',
      category: 'narrative',
      title: zh ? '风险敞口测算合理性' : 'At-risk figure methodology',
      subject: zh ? '¥18.4M 12 个月 GMV 风险' : '¥18.4M 12-month GMV at risk',
      verdict: 'warn',
      confidence: 81,
      finding: zh
        ? '该数字由当前周环比流失率线性外推 12 个月得出。线性假设在竞争响应存在时通常高估，未做情景区间。'
        : 'Derived by linearly extrapolating the current weekly leakage rate over 12 months. Linear assumptions typically overstate when competitive response exists, and no scenario range is given.',
      evidence: [
        zh ? '方法：线性外推（-1.8% 周环比）' : 'Method: linear extrapolation (-1.8% WoW)',
        zh ? '未建模：竞争响应、季节性、价格弹性' : 'Not modeled: competitive response, seasonality, price elasticity',
      ],
      recommendation: zh
        ? '给出区间（如 ¥11-18M）而非单点值，并标注线性假设。'
        : 'Present a range (e.g. ¥11-18M) rather than a point estimate, and label the linear assumption.',
    },
  ];

  const passed = checks.filter(c => c.verdict === 'pass').length;
  const warned = checks.filter(c => c.verdict === 'warn').length;
  const failed = checks.filter(c => c.verdict === 'fail').length;

  return {
    workspace_brand_name: DEMO_OWN_BRAND,
    evaluated_at: new Date().toISOString(),
    model: 'claude-sonnet-4.6',
    // Weighted: pass=1, warn=0.5, fail=0 → rounded
    trust_score: Math.round(((passed + warned * 0.5) / checks.length) * 100),
    summary: { total: checks.length, passed, warned, failed },
    coverage: { brands: 6, indices: 12, claims: 14 },
    checks,
  };
}
