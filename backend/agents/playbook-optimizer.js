/**
 * Playbook Optimizer
 * Runs every Sunday at 6am HK time.
 * Reads the past 7 daily reports + all feedback,
 * asks Claude to rewrite and improve the playbook,
 * then saves the updated playbook back to disk.
 */

const Anthropic = require("@anthropic-ai/sdk");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAYBOOK_PATH = path.join(__dirname, "../config/agent-playbook.json");
const REPORTS_DIR = path.join(__dirname, "../config/reports");
const PROFILE_PATH = path.join(__dirname, "../config/user-profile.json");

// ─── Helpers ───────────────────────────────────────────────

function loadPlaybook() {
  if (!fs.existsSync(PLAYBOOK_PATH)) return {};
  return JSON.parse(fs.readFileSync(PLAYBOOK_PATH, "utf8"));
}

function savePlaybook(data) {
  fs.writeFileSync(PLAYBOOK_PATH, JSON.stringify(data, null, 2), "utf8");
}

function loadProfile() {
  if (!fs.existsSync(PROFILE_PATH)) return { name: "User", industry: "General" };
  return JSON.parse(fs.readFileSync(PROFILE_PATH, "utf8"));
}

function loadRecentReports(days = 7) {
  if (!fs.existsSync(REPORTS_DIR)) return [];
  const files = fs.readdirSync(REPORTS_DIR)
    .filter(f => f.endsWith(".json"))
    .sort()
    .slice(-days);
  return files.map(f => {
    try {
      return JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, f), "utf8"));
    } catch {
      return null;
    }
  }).filter(Boolean);
}

// ─── Main Optimizer ────────────────────────────────────────

async function runPlaybookOptimizer() {
  console.log("[Optimizer] Starting weekly playbook optimization...");

  const playbook = loadPlaybook();
  const profile = loadProfile();
  const recentReports = loadRecentReports(7);

  if (recentReports.length === 0) {
    console.warn("[Optimizer] No recent reports found — skipping optimization");
    return;
  }

  // Build context for Claude
  const feedbackSummary = (playbook.feedbackLog || [])
    .slice(-30) // last 30 feedback entries
    .map(f => `[${f.date}] ${f.from}: "${f.section}" → ${f.rating === "up" ? "👍 useful" : "👎 needs improvement"}${f.note ? ` — ${f.note}` : ""}`)
    .join("\n") || "No feedback received yet.";

  const sourceStats = (playbook.sourcePerformance && Object.keys(playbook.sourcePerformance).length > 0)
    ? Object.entries(playbook.sourcePerformance)
        .map(([src, data]) => `${src}: avg relevance ${data.avgRelevance || "unknown"}, used ${data.useCount || 0} times`)
        .join("\n")
    : "No source performance data yet.";

  const reportSummary = recentReports
    .slice(-3)
    .map(r => `Date: ${r.date}\nSources used: ${(r.sourcesUsed || []).map(s => `${s.source}(${s.articleCount})`).join(", ")}\nReport preview: ${r.report ? r.report.slice(0, 300) + "..." : "N/A"}`)
    .join("\n\n---\n\n");

  const currentPlaybook = JSON.stringify({
    searchStrategy: playbook.searchStrategy,
    focusAreas: playbook.focusAreas,
  }, null, 2);

  const prompt = `You are an AI agent optimizer. Your job is to improve a market intelligence agent's playbook based on past performance and user feedback.

**User Profile:**
- Name: ${profile.name}
- Role: ${profile.role}
- Industry: ${profile.industry}
- Product Categories: ${(profile.productCategories || []).join(", ")}
- Competitors monitored: ${(profile.competitors || []).join(", ")}
- Geography focus: ${profile.geographyFocus}

**Current Playbook:**
${currentPlaybook}

**Past 3 Reports Summary:**
${reportSummary}

**Source Performance (last 7 days):**
${sourceStats}

**User Feedback (last 30 entries):**
${feedbackSummary}

---

Based on the above, generate an IMPROVED playbook. Return ONLY valid JSON with this exact structure — no markdown, no explanation, just the JSON:

{
  "searchStrategy": {
    "queryTemplates": ["...improved templates based on what worked..."],
    "preferredSources": ["...sources that consistently delivered value..."],
    "deprioritizedSources": ["...sources that underperformed, with reason..."],
    "depthRules": "...updated rules for when to dig deeper..."
  },
  "focusAreas": {
    "alwaysPrioritize": ["...topics consistently flagged as useful..."],
    "currentWeekFocus": "...specific focus based on recent trends...",
    "ignoreTopics": ["...topics users flagged as irrelevant..."]
  },
  "optimizerSummary": "2-3 sentences explaining what you changed and why"
}`;

  console.log("[Optimizer] Calling Claude for playbook analysis...");

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2000,
    messages: [{ role: "user", content: prompt }],
  });

  let improved;
  try {
    const raw = response.content[0].text.trim();
    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
    improved = JSON.parse(jsonStr);
  } catch (e) {
    console.error("[Optimizer] Failed to parse Claude response as JSON:", e.message);
    return;
  }

  // Merge improvements into playbook (preserve feedback log, source stats, version)
  const today = new Date().toLocaleDateString("zh-CN", { timeZone: "Asia/Hong_Kong" });
  const updatedPlaybook = {
    ...playbook,
    version: (playbook.version || 1) + 1,
    lastOptimized: today,
    searchStrategy: improved.searchStrategy,
    focusAreas: improved.focusAreas,
    optimizerNotes: [
      ...(playbook.optimizerNotes || []),
      { date: today, summary: improved.optimizerSummary || "Optimization complete" },
    ],
  };

  savePlaybook(updatedPlaybook);
  console.log(`[Optimizer] Playbook updated to v${updatedPlaybook.version}: ${improved.optimizerSummary}`);

  return {
    version: updatedPlaybook.version,
    summary: improved.optimizerSummary,
    changes: {
      preferredSources: improved.searchStrategy.preferredSources,
      currentWeekFocus: improved.focusAreas.currentWeekFocus,
    },
  };
}

module.exports = { runPlaybookOptimizer };
