/**
 * Market Intelligence Agent
 * Multi-source news aggregation + Claude 3-lens analysis
 * Fully configurable per user profile — works for any industry or role
 *
 * Sources:
 *   - Google News (Global, English)
 *   - Google News (China, Chinese)
 *   - Reddit (consumer/community sentiment)
 *   - 36Kr RSS (China tech & business)
 *   - 虎嗅 RSS (China business strategy)
 *   - Reuters RSS (credible global news)
 */

const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── User Profile ──────────────────────────────────────────
// Loaded from backend/config/user-profile.json
// Can be updated via POST /api/intelligence/profile

function loadUserProfile() {
  const profilePath = path.join(__dirname, "../config/user-profile.json");
  if (!fs.existsSync(profilePath)) {
    console.warn("[Intel] No user profile found at config/user-profile.json — using .env fallback");
    return {
      name: process.env.USER_NAME || "User",
      role: process.env.USER_ROLE || "Business Owner",
      industry: process.env.USER_INDUSTRY || "General",
      productCategories: (process.env.PRODUCT_CATEGORIES || "").split(",").map(s => s.trim()).filter(Boolean),
      competitors: (process.env.COMPETITORS || "").split(",").map(s => s.trim()).filter(Boolean),
      geographyFocus: process.env.GEO_FOCUS || "both", // "china" | "global" | "both"
      redditCommunities: (process.env.REDDIT_COMMUNITIES || "").split(",").map(s => s.trim()).filter(Boolean),
    };
  }
  return JSON.parse(fs.readFileSync(profilePath, "utf8"));
}

// ─── HTTP Helper ───────────────────────────────────────────

function fetchUrl(url, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    let data = "";
    const req = lib.get(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; RebaseBot/1.0)" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => resolve(data));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Timeout")); });
    req.on("error", reject);
  });
}

// ─── RSS Parser ────────────────────────────────────────────

function parseRssItems(xml, limit = 6) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (
      block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/s) ||
      block.match(/<title>(.*?)<\/title>/s) || []
    )[1] || "";
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || "";
    const cleanTitle = title.replace(/<[^>]+>/g, "").trim();
    if (cleanTitle) items.push({ title: cleanTitle, pubDate, source });
  }
  return items.slice(0, limit);
}

function filterByKeywords(items, keywords) {
  if (!keywords || keywords.length === 0) return items;
  const kw = keywords.map(k => k.toLowerCase());
  return items.filter(item =>
    kw.some(k => item.title.toLowerCase().includes(k))
  );
}

// ─── News Sources ──────────────────────────────────────────

// Source 1: Google News — Global (English)
async function fetchGoogleNewsGlobal(query) {
  const q = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const xml = await fetchUrl(url);
    const items = parseRssItems(xml, 6);
    return { source: "Google News (Global)", items, error: null };
  } catch (e) {
    return { source: "Google News (Global)", items: [], error: e.message };
  }
}

// Source 2: Google News — China (Chinese)
async function fetchGoogleNewsCN(query) {
  const q = encodeURIComponent(query);
  const url = `https://news.google.com/rss/search?q=${q}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  try {
    const xml = await fetchUrl(url);
    const items = parseRssItems(xml, 6);
    return { source: "Google News (中国)", items, error: null };
  } catch (e) {
    return { source: "Google News (中国)", items: [], error: e.message };
  }
}

// Source 3: Reddit — community & consumer sentiment
async function fetchReddit(query, communities = []) {
  try {
    let url;
    if (communities.length > 0) {
      const sub = communities[0].replace(/^r\//, "");
      url = `https://www.reddit.com/r/${sub}/search.rss?q=${encodeURIComponent(query)}&sort=new&t=day&restrict_sr=1`;
    } else {
      url = `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=new&t=day`;
    }
    const xml = await fetchUrl(url);
    const items = parseRssItems(xml, 5);
    return { source: "Reddit", items, error: null };
  } catch (e) {
    return { source: "Reddit", items: [], error: e.message };
  }
}

// Source 4: 36Kr — China tech & startup news
async function fetch36Kr(keywords) {
  try {
    const xml = await fetchUrl("https://36kr.com/feed");
    const allItems = parseRssItems(xml, 30);
    const filtered = filterByKeywords(allItems, keywords);
    return { source: "36氪", items: filtered.slice(0, 5), error: null };
  } catch (e) {
    return { source: "36氪", items: [], error: e.message };
  }
}

// Source 5: 虎嗅 — China business strategy
async function fetchHuxiu(keywords) {
  try {
    const xml = await fetchUrl("https://www.huxiu.com/rss/0.xml");
    const allItems = parseRssItems(xml, 30);
    const filtered = filterByKeywords(allItems, keywords);
    return { source: "虎嗅", items: filtered.slice(0, 5), error: null };
  } catch (e) {
    return { source: "虎嗅", items: [], error: e.message };
  }
}

// Source 6: Reuters — credible global news
async function fetchReuters(keywords) {
  try {
    const xml = await fetchUrl("https://feeds.reuters.com/reuters/businessNews");
    const allItems = parseRssItems(xml, 30);
    const filtered = filterByKeywords(allItems, keywords);
    return { source: "Reuters", items: filtered.slice(0, 5), error: null };
  } catch (e) {
    return { source: "Reuters", items: [], error: e.message };
  }
}

// ─── Aggregate All Sources ─────────────────────────────────

async function aggregateNews(profile) {
  const { industry, productCategories, competitors, geographyFocus, redditCommunities } = profile;
  const allKeywords = [industry, ...productCategories, ...competitors].filter(Boolean);
  const primaryQuery = [industry, ...productCategories.slice(0, 2)].filter(Boolean).join(" OR ");
  const competitorQuery = competitors.slice(0, 4).join(" OR ");

  console.log("[Intel] Fetching from all sources in parallel...");

  const fetches = [];

  // Always fetch global Google News for industry + competitors
  fetches.push(fetchGoogleNewsGlobal(primaryQuery));
  if (competitors.length > 0) fetches.push(fetchGoogleNewsGlobal(competitorQuery));

  // Fetch CN sources if geography includes China
  if (geographyFocus === "china" || geographyFocus === "both") {
    fetches.push(fetchGoogleNewsCN(primaryQuery));
    if (competitors.length > 0) fetches.push(fetchGoogleNewsCN(competitorQuery));
    fetches.push(fetch36Kr(allKeywords));
    fetches.push(fetchHuxiu(allKeywords));
  }

  // Fetch global sources if geography includes global
  if (geographyFocus === "global" || geographyFocus === "both") {
    fetches.push(fetchReuters(allKeywords));
    fetches.push(fetchReddit(primaryQuery, redditCommunities || []));
  }

  const results = await Promise.allSettled(fetches);
  return results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value)
    .filter(r => r.items.length > 0);
}

// ─── Format News Context for Claude ───────────────────────

function buildNewsContext(sourceResults) {
  return sourceResults.map(r => {
    const articles = r.items.map((item, i) =>
      `  ${i + 1}. ${item.title}${item.source ? ` [${item.source}]` : ""}${item.pubDate ? ` (${item.pubDate})` : ""}`
    ).join("\n");
    return `### ${r.source}\n${articles}`;
  }).join("\n\n");
}

// ─── Claude 3-Lens Analysis ────────────────────────────────

async function runThreeLensAnalysis(profile, newsContext, today) {
  const { name, role, industry, productCategories, competitors, geographyFocus } = profile;

  const geoLabel = geographyFocus === "china" ? "中国市场" :
                   geographyFocus === "global" ? "全球市场" : "中国及全球市场";

  const prompt = `你是一位专业的市场情报分析师，服务于 ${name}。

**用户背景：**
- 姓名/组织：${name}
- 角色：${role}
- 所在行业：${industry}
- 关注品类/产品/服务：${productCategories.join("、") || "未指定"}
- 关注竞争对手：${competitors.join("、") || "未指定"}
- 地区关注：${geoLabel}

**今日（${today}）多渠道新闻摘要：**

${newsContext}

---

请基于以上信息，生成一份专业的市场情报日报。严格按以下三个视角进行分析，语言简洁、专业、可执行：

# 📡 市场情报日报 — ${today}

---

## 🔥 视角一：趋势雷达
**目标：** 识别 ${industry} / ${productCategories.slice(0, 2).join("、")} 领域当前最值得关注的2-3个趋势信号。

对每个趋势：
- **趋势名称：** （一句话命名）
- **驱动因素：** （什么在推动它？）
- **地域强度：** （在中国更强？全球普遍？还是两者存在明显差异？）
- **发展速度：** （刚刚起步 / 快速加速 / 已接近顶峰）

---

## 🎯 视角二：竞争动态
**目标：** 梳理关注对手的最新动作及其战略含义。

${competitors.length > 0
  ? competitors.map(c => `**${c}**\n- 最新动态：\n- 战略信号：\n- 情绪判断：（正面 / 负面 / 中性）`).join("\n\n")
  : "**行业整体竞争动态**\n- 主要玩家动作：\n- 市场格局变化：\n- 值得警惕的信号："}

---

## ⚡ 视角三：机会信号
**目标：** 基于今日信息，为 ${name}（${role}，${industry}）提出3条本周可执行的具体行动建议。

每条建议需包含：
- **机会描述：** （具体是什么机会？）
- **行动建议：** （本周可以做什么？）
- **优先级：** （高 / 中 / 低）

---

## ⚠️ 风险预警
列出1-2条需要警惕的信号或潜在风险（如有）。如无明显风险，可简要说明。

---

请确保分析基于实际新闻内容，避免泛泛而谈。如某来源信息不足，请明确指出。`;

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 3000,
    messages: [{ role: "user", content: prompt }],
  });

  return response.content[0].text;
}

// ─── Main Agent ────────────────────────────────────────────

async function runCompetitorIntelAgent() {
  const profile = loadUserProfile();

  console.log(`[Intel] Running for: ${profile.name} | ${profile.role} | ${profile.industry}`);

  const today = new Date().toLocaleDateString("zh-CN", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Step 1: Aggregate news from all sources
  const sourceResults = await aggregateNews(profile);
  const totalArticles = sourceResults.reduce((sum, r) => sum + r.items.length, 0);
  console.log(`[Intel] Aggregated ${totalArticles} articles from ${sourceResults.length} sources`);

  if (totalArticles === 0) {
    console.warn("[Intel] No articles found from any source");
    return null;
  }

  // Step 2: Run 3-lens Claude analysis
  const newsContext = buildNewsContext(sourceResults);
  console.log("[Intel] Running 3-lens analysis with Claude...");
  const report = await runThreeLensAnalysis(profile, newsContext, today);

  console.log("[Intel] Report generated successfully");

  return {
    date: today,
    profile: { name: profile.name, role: profile.role, industry: profile.industry },
    sourcesUsed: sourceResults.map(r => ({ source: r.source, articleCount: r.items.length })),
    report,
    rawNews: sourceResults,
  };
}

module.exports = { runCompetitorIntelAgent };
