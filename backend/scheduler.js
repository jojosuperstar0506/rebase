/**
 * Scheduler — runs agents on cron schedule
 * Uses node-cron for scheduling
 *
 * Timezone: Asia/Hong_Kong (UTC+8)
 * Schedule: fetch at 6:30am, deliver at 7:00am HK time
 */

const cron = require("node-cron");
const https = require("https");
const http = require("http");
const { runCompetitorIntelAgent } = require("./agents/competitor-intel");
require("dotenv").config();

// ─── Delivery Helpers ──────────────────────────────────────

async function sendEmail(subject, htmlBody) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[Scheduler] RESEND_API_KEY not set, skipping email");
    return;
  }

  const to = (process.env.REPORT_EMAIL || "").split(",").map((e) => e.trim()).filter(Boolean);
  if (to.length === 0) {
    console.warn("[Scheduler] REPORT_EMAIL not set, skipping email");
    return;
  }

  const payload = JSON.stringify({
    from: "Rebase Intelligence <reports@rebase.ai>",
    to,
    subject,
    html: htmlBody,
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.resend.com",
        path: "/emails",
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`[Scheduler] Email sent: ${res.statusCode}`);
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

async function sendWechatWork(text) {
  const webhookUrl = process.env.WECHAT_WORK_WEBHOOK;
  if (!webhookUrl) {
    console.warn("[Scheduler] WECHAT_WORK_WEBHOOK not set, skipping");
    return;
  }

  const payload = JSON.stringify({ msgtype: "text", text: { content: text } });

  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`[Scheduler] WeChat Work sent: ${res.statusCode}`);
          resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
}

function reportToHtml(report) {
  const lines = report.split("\n");
  const html = lines.map((line) => {
    if (line.startsWith("# ")) return `<h1 style="color:#1a1a2e;border-bottom:2px solid #f59e0b;padding-bottom:8px">${line.slice(2)}</h1>`;
    if (line.startsWith("## ")) return `<h2 style="color:#1a1a2e;margin-top:20px">${line.slice(3)}</h2>`;
    if (line.startsWith("**") && line.endsWith("**")) return `<strong>${line.slice(2, -2)}</strong><br/>`;
    if (line.startsWith("**")) return `<p><strong>${line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")}</strong></p>`;
    if (line.startsWith("---")) return `<hr style="border:1px solid #e0e0e0;margin:16px 0"/>`;
    if (line.trim() === "") return "<br/>";
    return `<p style="margin:4px 0;line-height:1.6">${line}</p>`;
  }).join("");
  return `<div style="font-family:system-ui,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#333">${html}<p style="margin-top:32px;font-size:12px;color:#999">由 Rebase Intelligence Engine 自动生成 · ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Hong_Kong" })}</p></div>`;
}

// ─── Main Job ──────────────────────────────────────────────

async function runDailyReport() {
  console.log("[Scheduler] Starting daily competitor intelligence report...");
  try {
    const result = await runCompetitorIntelAgent();
    if (!result) {
      console.warn("[Scheduler] No report generated");
      return;
    }

    const subject = `🔍 Rebase竞品情报日报 — ${result.date}`;

    // Send email
    await sendEmail(subject, reportToHtml(result.report));

    // Send WeChat Work (plain text, truncated for readability)
    const wechatText = `${subject}\n\n${result.report.slice(0, 1500)}${result.report.length > 1500 ? "\n\n...（完整报告已发送至邮箱）" : ""}`;
    await sendWechatWork(wechatText);

    console.log("[Scheduler] Daily report delivered successfully");
  } catch (err) {
    console.error("[Scheduler] Error running daily report:", err);
  }
}

// ─── Cron Schedule ─────────────────────────────────────────

function startScheduler() {
  // Run every day at 6:30am Hong Kong time (UTC+8 = 22:30 UTC previous day)
  cron.schedule(
    "30 22 * * *",
    () => {
      console.log("[Scheduler] Cron triggered: daily competitor report");
      runDailyReport();
    },
    { timezone: "UTC" }
  );

  console.log("[Scheduler] Scheduled: daily competitor report at 6:30am HK time");
}

module.exports = { startScheduler, runDailyReport };
