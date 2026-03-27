/**
 * Scheduler — runs agents on cron schedule
 *
 * Daily:   6:30am HK → fetch + analyze → 7:00am email with feedback buttons
 * Weekly:  Sunday 6:00am HK → playbook optimizer runs
 */

const cron = require("node-cron");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const { runCompetitorIntelAgent } = require("./agents/competitor-intel");
const { runPlaybookOptimizer } = require("./agents/playbook-optimizer");
require("dotenv").config();

// ─── Feedback Token ────────────────────────────────────────
// Used to authenticate feedback clicks from email links
// Token = HMAC(reportId:section:rating) using API_SECRET

function generateFeedbackToken(reportId, section, rating) {
  const secret = process.env.API_SECRET || "rebase-fallback";
  return crypto
    .createHmac("sha256", secret)
    .update(`${reportId}:${section}:${rating}`)
    .digest("hex")
    .slice(0, 16);
}

// ─── Email HTML Builder ────────────────────────────────────

function buildEmailHtml(result) {
  const { report, date, sourcesUsed, profile } = result;
  const reportId = date.replace(/\s/g, "-");
  const serverUrl = process.env.SERVER_URL || `http://8.217.242.191`;

  // Parse report into sections by splitting on ## headings
  const sections = [];
  const lines = report.split("\n");
  let currentSection = { heading: "", anchor: "", content: [] };

  lines.forEach(line => {
    if (line.startsWith("# ")) {
      // Top-level title
      currentSection.content.push(`<h1 style="color:#1a1a2e;font-size:22px;border-bottom:3px solid #f59e0b;padding-bottom:10px;margin-bottom:16px">${line.slice(2)}</h1>`);
    } else if (line.startsWith("## ")) {
      // New section — save previous
      if (currentSection.heading) sections.push({ ...currentSection });
      const headingText = line.slice(3);
      const anchor = headingText.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "-").slice(0, 20);
      currentSection = { heading: headingText, anchor, content: [] };
      currentSection.content.push(`<h2 style="color:#1a1a2e;font-size:17px;margin:0 0 12px 0">${headingText}</h2>`);
    } else if (line.startsWith("### ")) {
      currentSection.content.push(`<h3 style="color:#374151;font-size:14px;margin:14px 0 6px">${line.slice(4)}</h3>`);
    } else if (line.startsWith("---")) {
      // skip horizontal rules inside sections
    } else if (line.trim() === "") {
      currentSection.content.push(`<div style="height:6px"></div>`);
    } else {
      // Bold inline
      const formatted = line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
      currentSection.content.push(`<p style="margin:4px 0;line-height:1.65;font-size:14px;color:#374151">${formatted}</p>`);
    }
  });
  if (currentSection.heading) sections.push(currentSection);

  // Map section anchors to feedback section keys
  const sectionKeyMap = {
    "趋势雷达": "trends",
    "竞争动态": "competitive",
    "机会信号": "opportunities",
    "风险预警": "risks",
  };

  function feedbackBar(heading, anchor) {
    // Find section key
    const key = Object.keys(sectionKeyMap).find(k => heading.includes(k)) || anchor;
    const upToken = generateFeedbackToken(reportId, key, "up");
    const downToken = generateFeedbackToken(reportId, key, "down");
    const upUrl = `${serverUrl}/intelligence/feedback?reportId=${reportId}&section=${key}&rating=up&token=${upToken}`;
    const downUrl = `${serverUrl}/intelligence/feedback?reportId=${reportId}&section=${key}&rating=down&token=${downToken}`;
    return `
      <div style="margin-top:14px;padding-top:12px;border-top:1px dashed #e5e7eb;display:flex;align-items:center;gap:10px">
        <span style="font-size:12px;color:#9ca3af">这个板块有帮助吗？</span>
        <a href="${upUrl}" style="padding:4px 14px;background:#16a34a;color:white;text-decoration:none;border-radius:20px;font-size:12px;font-weight:600">👍 有帮助</a>
        <a href="${downUrl}" style="padding:4px 14px;background:#dc2626;color:white;text-decoration:none;border-radius:20px;font-size:12px;font-weight:600">👎 需改进</a>
      </div>`;
  }

  // Build sections HTML
  const sectionsHtml = sections.map(s => {
    const hasFeedback = Object.keys(sectionKeyMap).some(k => s.heading.includes(k));
    return `
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:20px;margin-bottom:16px">
        ${s.content.join("")}
        ${hasFeedback ? feedbackBar(s.heading, s.anchor) : ""}
      </div>`;
  }).join("");

  // Sources footer
  const sourcesHtml = (sourcesUsed || []).map(s =>
    `<span style="display:inline-block;margin:3px 4px;padding:3px 10px;background:#f3f4f6;border-radius:12px;font-size:11px;color:#6b7280">${s.source} (${s.articleCount}条)</span>`
  ).join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:system-ui,-apple-system,sans-serif">
  <div style="max-width:660px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border-radius:12px;padding:24px;margin-bottom:20px;text-align:center">
      <div style="font-size:28px;margin-bottom:8px">📡</div>
      <h1 style="color:#f59e0b;font-size:20px;margin:0 0 4px">市场情报日报</h1>
      <p style="color:#9ca3af;font-size:13px;margin:0">${date} · ${profile ? profile.industry : ""}</p>
    </div>

    <!-- Report sections -->
    ${sectionsHtml}

    <!-- Sources -->
    <div style="background:#f3f4f6;border-radius:10px;padding:16px;margin-bottom:16px">
      <p style="font-size:12px;color:#9ca3af;margin:0 0 8px"><strong>数据来源</strong></p>
      <div>${sourcesHtml || "N/A"}</div>
    </div>

    <!-- Footer -->
    <div style="text-align:center;padding:12px">
      <p style="font-size:11px;color:#d1d5db;margin:0">
        由 Rebase Intelligence Engine 自动生成 ·
        ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" })}
      </p>
    </div>

  </div>
</body>
</html>`;
}

// ─── Delivery ──────────────────────────────────────────────

async function sendEmail(subject, htmlBody) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.warn("[Scheduler] RESEND_API_KEY not set"); return; }
  const to = (process.env.REPORT_EMAIL || "").split(",").map(e => e.trim()).filter(Boolean);
  if (to.length === 0) { console.warn("[Scheduler] REPORT_EMAIL not set"); return; }

  const payload = JSON.stringify({ from: "Rebase Intelligence <reports@rebase.ai>", to, subject, html: htmlBody });
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: "api.resend.com", path: "/emails", method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { console.log(`[Scheduler] Email sent: ${res.statusCode}`); resolve(data); });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function sendWechatWork(text) {
  const webhookUrl = process.env.WECHAT_WORK_WEBHOOK;
  if (!webhookUrl) return;
  const payload = JSON.stringify({ msgtype: "text", text: { content: text } });
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: url.hostname, path: url.pathname + url.search, method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) },
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => { console.log(`[Scheduler] WeChat Work sent: ${res.statusCode}`); resolve(data); });
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

// ─── Daily Report Job ──────────────────────────────────────

async function runDailyReport() {
  console.log("[Scheduler] Starting daily market intelligence report...");
  try {
    const result = await runCompetitorIntelAgent();
    if (!result) { console.warn("[Scheduler] No report generated"); return; }

    const subject = `📡 市场情报日报 — ${result.date} | ${result.profile.industry}`;
    const htmlBody = buildEmailHtml(result);

    await sendEmail(subject, htmlBody);

    // WeChat Work gets plain text summary
    const wechatText = `${subject}\n\n${result.report.slice(0, 1500)}${result.report.length > 1500 ? "\n\n...（完整报告含反馈按钮已发送至邮箱）" : ""}`;
    await sendWechatWork(wechatText);

    console.log("[Scheduler] Daily report delivered successfully");
  } catch (err) {
    console.error("[Scheduler] Error running daily report:", err);
  }
}

// ─── Weekly Optimizer Job ──────────────────────────────────

async function runWeeklyOptimizer() {
  console.log("[Scheduler] Starting weekly playbook optimization...");
  try {
    const result = await runPlaybookOptimizer();
    if (result) {
      console.log(`[Scheduler] Playbook updated to v${result.version}: ${result.summary}`);
      // Notify via WeChat Work
      await sendWechatWork(
        `🧠 Rebase Intelligence — 周度Playbook优化完成\n\n版本：v${result.version}\n\n${result.summary}\n\n本周重点：${result.changes?.currentWeekFocus || "未指定"}`
      );
    }
  } catch (err) {
    console.error("[Scheduler] Error running playbook optimizer:", err);
  }
}

// ─── Cron Schedules ────────────────────────────────────────

function startScheduler() {
  // Daily: 6:30am HK time = 22:30 UTC
  cron.schedule("30 22 * * *", () => {
    console.log("[Scheduler] Cron triggered: daily report");
    runDailyReport();
  }, { timezone: "UTC" });

  // Weekly: Sunday 10pm UTC = Monday 6am HK
  cron.schedule("0 22 * * 0", () => {
    console.log("[Scheduler] Cron triggered: weekly playbook optimizer");
    runWeeklyOptimizer();
  }, { timezone: "UTC" });

  console.log("[Scheduler] Scheduled: daily report at 6:30am HK | weekly optimizer Sunday night");
}

module.exports = { startScheduler, runDailyReport, runWeeklyOptimizer, generateFeedbackToken };
