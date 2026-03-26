/**
 * Competitor Intelligence Agent
 * Fetches Google News RSS for configured competitors,
 * analyzes with Claude, and returns a structured report.
 */

const Anthropic = require("@anthropic-ai/sdk");
const https = require("https");
const http = require("http");
require("dotenv").config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Helpers ───────────────────────────────────────────────

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    let data = "";
    lib
      .get(url, (res) => {
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = (block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ||
      block.match(/<title>(.*?)<\/title>/) || [])[1] || "";
    const pubDate = (block.match(/<pubDate>(.*?)<\/pubDate>/) || [])[1] || "";
    const link = (block.match(/<link>(.*?)<\/link>/) || [])[1] || "";
    const source = (block.match(/<source[^>]*>(.*?)<\/source>/) || [])[1] || "";
    if (title) items.push({ title: title.trim(), pubDate, link, source });
  }
  return items.slice(0, 8); // top 8 per competitor
}

async function fetchCompetitorNews(name) {
  const query = encodeURIComponent(`"${name}"`);
  const url = `https://news.google.com/rss/search?q=${query}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`;
  try {
    const xml = await fetchUrl(url);
    const items = parseRssItems(xml);
    return { name, items, error: null };
  } catch (e) {
    return { name, items: [], error: e.message };
  }
}

// ─── Main Agent ────────────────────────────────────────────

async function runCompetitorIntelAgent() {
  const competitorNames = (process.env.COMPETITORS || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (competitorNames.length === 0) {
    console.warn("[CompetitorIntel] No competitors configured in COMPETITORS env var");
    return null;
  }

  console.log(`[CompetitorIntel] Fetching news for: ${competitorNames.join(", ")}`);

  // Fetch news for all competitors in parallel
  const results = await Promise.all(competitorNames.map(fetchCompetitorNews));

  // Build context for Claude
  const newsContext = results
    .map((r) => {
      if (r.items.length === 0) return `### ${r.name}\nNo recent news found.\n`;
      const articles = r.items
        .map((item, i) => `${i + 1}. [${item.pubDate}] ${item.title} (${item.source})`)
        .join("\n");
      return `### ${r.name}\n${articles}\n`;
    })
    .join("\n");

  const today = new Date().toLocaleDateString("zh-CN", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const prompt = `你是Rebase的竞品情报分析师。Rebase是一家面向中小企业的AI智能运营平台，帮助SMB将ERP数据转化为可执行的AI决策。

今天是${today}。以下是过去24小时内各竞品的最新新闻：

${newsContext}

请生成一份简洁的竞品情报日报，格式如下：

# 🔍 Rebase竞品情报日报 — ${today}

## ⚡ 今日重点
（2-3句话总结最重要的竞品动态）

---

${results.map((r) => `## ${r.name}
**新闻摘要：**（1-2句话）
**情绪判断：**（正面/负面/中性 + 一句原因）
**战略信号：**（他们在做什么动作？）
**Rebase启示：**（我们应该注意什么？）`).join("\n\n")}

---

## 💡 本周行动建议
（根据今日情报，列出2-3条Rebase可执行的具体建议）

请保持简洁专业，每个板块不超过3句话。`;

  console.log("[CompetitorIntel] Calling Claude for analysis...");

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: [{ role: "user", content: prompt }],
  });

  const report = response.content[0].text;
  console.log("[CompetitorIntel] Report generated successfully");

  return {
    date: today,
    competitors: competitorNames,
    report,
    rawNews: results,
  };
}

module.exports = { runCompetitorIntelAgent };
