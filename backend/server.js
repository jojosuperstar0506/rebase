require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { startScheduler, runDailyReport, generateFeedbackToken } = require("./scheduler");
const fs = require("fs");
const path = require("path");

const app = express();

// ── Fix 1: Rate Limiting ─────────────────────────────────────────────────────
// Each IP can make max 20 requests per minute to any API route.
// If exceeded, they get a 429 error. Bots get blocked automatically.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute window
  max: 20,                   // max 20 requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a moment and try again.' },
});

// ── Fix 2: Secret Token Middleware ───────────────────────────────────────────
// Every request to /api/* must include the header: x-rebase-secret: <your secret>
// Vercel frontend sends this automatically. Random bots don't know it.
// Public endpoints (e.g. /api/onboarding) are whitelisted — no secret needed.
const PUBLIC_API_PATHS = ['/onboarding'];

function requireSecret(req, res, next) {
  const secret = process.env.API_SECRET;

  // If no secret is configured, skip this check (dev mode)
  if (!secret) return next();

  // Allow whitelisted public endpoints through without a secret
  if (PUBLIC_API_PATHS.includes(req.path)) return next();

  const provided = req.headers['x-rebase-secret'];
  if (!provided || provided !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// Apply rate limiting + secret check to all /api routes
app.use('/api', apiLimiter);
app.use('/api', requireSecret);

// ── Anthropic client ────────────────────────────────────────────────────────
const anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function callAI(prompt, systemPrompt) {
  const msg = await anthropicClient.messages.create({
    model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    system: systemPrompt || 'You are a helpful AI assistant for Rebase, a company that helps Chinese SMBs adopt AI into their operations.',
    messages: [{ role: 'user', content: prompt }],
  });
  return msg.content[0].text;
}

// ── Routes ──────────────────────────────────────────────────────────────────

// Health check — public, no secret required, rate limit not applied
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    region: 'hongkong',
    timestamp: new Date().toISOString(),
    anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
  });
});

// Chat — send a message to Claude and get a response
// Used by: Rebase branded chatbot
app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const reply = await callAI(message, systemPrompt);
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Failed to get response from Claude' });
  }
});

// AI proxy — same interface as Vercel /api/ai for easy switching between Vercel and ECS
app.post('/api/ai', async (req, res) => {
  try {
    const { model, max_tokens, messages, system } = req.body;
    const msg = await anthropicClient.messages.create({
      model: model || process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: max_tokens || 4096,
      messages: messages || [],
      ...(system ? { system } : {}),
    });
    res.json(msg);
  } catch (err) {
    console.error('AI proxy error:', err.message);
    res.status(500).json({ error: 'AI request failed' });
  }
});

// GTM Agent — runs a go-to-market analysis task
// Used by: GTM agent feature
app.post('/api/gtm-agent', async (req, res) => {
  try {
    const { companyInfo, targetMarket } = req.body;

    if (!companyInfo) {
      return res.status(400).json({ error: 'companyInfo is required' });
    }

    const prompt = `You are a go-to-market strategy expert for Chinese SMBs adopting AI.

Company info: ${companyInfo}
Target market: ${targetMarket || 'Chinese SMB market'}

Provide a concise GTM analysis with:
1. Top 3 target customer segments
2. Key value propositions
3. Recommended outreach channels
4. First 30-day action plan`;

    const analysis = await callAI(prompt);
    res.json({ analysis });
  } catch (err) {
    console.error('GTM agent error:', err.message);
    res.status(500).json({ error: 'GTM agent failed' });
  }
});

// Scheduled Agent — runs overnight analysis tasks
// Triggered by PM2 cron or external scheduler
app.post('/api/scheduled-agent', async (req, res) => {
  try {
    const { task, data } = req.body;

    if (!task) {
      return res.status(400).json({ error: 'task is required' });
    }

    const taskResult = await callAI(`Run the following scheduled task: ${task}\n\nData: ${JSON.stringify(data || {})}`);
    res.json({
      task,
      result: taskResult,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Scheduled agent error:', err.message);
    res.status(500).json({ error: 'Scheduled agent failed' });
  }
});

// Onboarding — stores user application from the public signup form
app.post("/api/onboarding", async (req, res) => {
  try {
    const { name, company, industry, competitors, email, goal } = req.body;
    if (!name || !email || !industry) {
      return res.status(400).json({ error: "name, email, and industry are required" });
    }
    const applicantsDir = path.join(__dirname, "config/applicants");
    fs.mkdirSync(applicantsDir, { recursive: true });
    const filename = `${Date.now()}-${email.replace(/[^a-z0-9]/gi, "_")}.json`;
    const applicant = { name, company, industry, competitors, email, goal, submittedAt: new Date().toISOString(), status: "pending" };
    fs.writeFileSync(path.join(applicantsDir, filename), JSON.stringify(applicant, null, 2));
    console.log(`[Onboarding] New application from ${name} (${email})`);

    // Notify Will/Joanna by email (skips silently if keys not configured)
    notifyNewApplicant(applicant).catch((e) => console.error("[Onboarding] Email failed:", e.message));

    res.json({ success: true, message: "Application received" });
  } catch (err) {
    console.error("Onboarding error:", err.message);
    res.status(500).json({ error: "Failed to save application" });
  }
});

// Sends a notification email to REPORT_EMAIL when a new application arrives.
// Uses Resend REST API via Node's built-in https — no extra npm package needed.
// If RESEND_API_KEY or REPORT_EMAIL is not set, logs a message and skips.
async function notifyNewApplicant(applicant) {
  const apiKey = process.env.RESEND_API_KEY;
  const toEmail = process.env.REPORT_EMAIL;

  if (!apiKey || !toEmail) {
    console.log("[Onboarding] Email skipped — set RESEND_API_KEY and REPORT_EMAIL in .env to enable");
    return;
  }

  const https = require("https");
  const body = JSON.stringify({
    from: "Rebase <onboarding@resend.dev>",
    to: [toEmail],
    subject: `New Rebase Application: ${applicant.name} (${applicant.company || "No company"})`,
    html: `
      <h2>New Rebase Application</h2>
      <table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
        <tr><td style="padding:6px 12px;color:#666">Name</td><td style="padding:6px 12px"><strong>${applicant.name}</strong></td></tr>
        <tr><td style="padding:6px 12px;color:#666">Email</td><td style="padding:6px 12px">${applicant.email}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Company</td><td style="padding:6px 12px">${applicant.company || "—"}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Industry</td><td style="padding:6px 12px">${applicant.industry}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Competitors</td><td style="padding:6px 12px">${applicant.competitors || "—"}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Goal</td><td style="padding:6px 12px">${applicant.goal || "—"}</td></tr>
        <tr><td style="padding:6px 12px;color:#666">Submitted</td><td style="padding:6px 12px">${applicant.submittedAt}</td></tr>
      </table>
      <p style="margin-top:24px;color:#666;font-size:13px">Reply to this applicant directly at <a href="mailto:${applicant.email}">${applicant.email}</a> with their access code to grant them entry to Rebase.</p>
    `,
  });

  await new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: "api.resend.com", path: "/emails", method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[Onboarding] Notification email sent to ${toEmail}`);
            resolve();
          } else {
            reject(new Error(`Resend API returned ${res.statusCode}: ${data}`));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// Manual trigger for intelligence report (for testing)
app.post("/api/competitor-report/run", async (req, res) => {
  try {
    const userId = req.body.userId || "will";
    const { runCompetitorIntelAgent } = require("./agents/competitor-intel");
    const result = await runCompetitorIntelAgent(userId);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual trigger for weekly playbook optimizer
app.post("/api/intelligence/optimize", async (req, res) => {
  try {
    const { runPlaybookOptimizer } = require("./agents/playbook-optimizer");
    const result = await runPlaybookOptimizer();
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Setup a new user for intelligence reports
app.post("/api/intelligence/setup", (req, res) => {
  const { userId, name, role, industry, productCategories, competitors, geographyFocus, email, redditCommunities } = req.body;
  if (!userId || !name || !industry) {
    return res.status(400).json({ error: "userId, name, and industry are required" });
  }
  // Create user folder
  const userDir = path.join(__dirname, "config/users", userId);
  fs.mkdirSync(userDir, { recursive: true });
  // Write profile
  const profile = {
    userId, name, role: role || "Business Owner",
    industry, productCategories: productCategories || [],
    competitors: competitors || [], geographyFocus: geographyFocus || "both",
    email: email || "", redditCommunities: redditCommunities || [],
    createdAt: new Date().toISOString().slice(0, 10), active: true
  };
  fs.writeFileSync(path.join(userDir, "profile.json"), JSON.stringify(profile, null, 2));
  // Create default playbook if not exists
  const playbookFilePath = path.join(userDir, "playbook.json");
  if (!fs.existsSync(playbookFilePath)) {
    const defaultPlaybook = {
      version: 1, lastOptimized: null,
      searchStrategy: { queryTemplates: [], preferredSources: [], deprioritizedSources: [], depthRules: "" },
      focusAreas: { alwaysPrioritize: ["pricing changes","product launches","funding rounds","executive changes"], currentWeekFocus: "", ignoreTopics: [] },
      sourcePerformance: {}, feedbackLog: [], optimizerNotes: []
    };
    fs.writeFileSync(playbookFilePath, JSON.stringify(defaultPlaybook, null, 2));
  }
  res.json({ success: true, userId, message: `User ${name} created. Daily report will start tomorrow.` });
});

// Get user profile
app.get("/api/intelligence/profile/:userId", (req, res) => {
  const profilePath = path.join(__dirname, "config/users", req.params.userId, "profile.json");
  if (!fs.existsSync(profilePath)) return res.status(404).json({ error: "User not found" });
  res.json(JSON.parse(fs.readFileSync(profilePath, "utf8")));
});

// ── Feedback endpoint — PUBLIC (no secret header, called from email links) ──
// GET /intelligence/feedback?userId=X&reportId=X&section=X&rating=up|down&token=X
app.get("/intelligence/feedback", (req, res) => {
  const { userId, reportId, section, rating, token } = req.query;

  // Validate required params
  if (!userId || !reportId || !section || !rating || !token) {
    return res.status(400).send(feedbackPage("❌", "无效的反馈链接", "缺少必要参数。"));
  }

  // Validate token
  const expectedToken = generateFeedbackToken(userId, reportId, section, rating);
  if (token !== expectedToken) {
    return res.status(403).send(feedbackPage("❌", "链接已失效", "此反馈链接无效或已过期。"));
  }

  // Load and update user's playbook
  try {
    const playbookPath = path.join(__dirname, "config/users", userId, "playbook.json");
    let playbook = {};
    if (fs.existsSync(playbookPath)) {
      playbook = JSON.parse(fs.readFileSync(playbookPath, "utf8"));
    }
    if (!playbook.feedbackLog) playbook.feedbackLog = [];

    const today = new Date().toISOString().slice(0, 10);
    playbook.feedbackLog.push({
      date: today,
      reportId,
      section,
      rating,
      from: "email",
    });

    fs.writeFileSync(playbookPath, JSON.stringify(playbook, null, 2), "utf8");
    console.log(`[Feedback] Recorded: userId=${userId} report=${reportId} section=${section} rating=${rating}`);
  } catch (e) {
    console.error("[Feedback] Failed to save:", e.message);
  }

  const sectionNames = {
    trends: "趋势雷达",
    competitive: "竞争动态",
    opportunities: "机会信号",
    risks: "风险预警",
  };

  const sectionLabel = sectionNames[section] || section;
  const isUp = rating === "up";
  return res.send(feedbackPage(
    isUp ? "👍" : "👎",
    isUp ? "感谢你的反馈！" : "感谢反馈，我们会改进",
    `你对【${sectionLabel}】板块的反馈已记录。每周Playbook优化时将采纳你的意见。`
  ));
});

function feedbackPage(icon, title, message) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;background:#f9fafb;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh">
  <div style="text-align:center;padding:40px;max-width:400px">
    <div style="font-size:56px;margin-bottom:16px">${icon}</div>
    <h1 style="color:#1a1a2e;font-size:22px;margin-bottom:8px">${title}</h1>
    <p style="color:#6b7280;font-size:15px;line-height:1.6">${message}</p>
    <p style="color:#d1d5db;font-size:12px;margin-top:24px">Rebase Intelligence Engine</p>
  </div>
</body></html>`;
}

// ── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rebase backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Security: rate limiting active, secret token ${process.env.API_SECRET ? 'enabled' : 'disabled (set API_SECRET to enable)'}`);
});
startScheduler();
