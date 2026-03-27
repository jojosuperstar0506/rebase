require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { startScheduler, runDailyReport, generateFeedbackToken } = require("./scheduler");
const fs = require("fs");
const path = require("path");

const PLAYBOOK_PATH = path.join(__dirname, "config/agent-playbook.json");

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
function requireSecret(req, res, next) {
  const secret = process.env.API_SECRET;

  // If no secret is configured, skip this check (dev mode)
  if (!secret) return next();

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
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: systemPrompt || 'You are a helpful AI assistant for Rebase, a company that helps Chinese SMBs adopt AI into their operations.',
      messages: [{ role: 'user', content: message }],
    });

    res.json({ reply: response.content[0].text });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ error: 'Failed to get response from Claude' });
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

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json({ analysis: response.content[0].text });
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

    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Run the following scheduled task: ${task}\n\nData: ${JSON.stringify(data || {})}`,
      }],
    });

    res.json({
      task,
      result: response.content[0].text,
      completedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Scheduled agent error:', err.message);
    res.status(500).json({ error: 'Scheduled agent failed' });
  }
});

// Manual trigger for intelligence report (for testing)
app.post("/api/competitor-report/run", async (req, res) => {
  try {
    const { runCompetitorIntelAgent } = require("./agents/competitor-intel");
    const result = await runCompetitorIntelAgent();
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

// ── Feedback endpoint — PUBLIC (no secret header, called from email links) ──
// GET /intelligence/feedback?reportId=X&section=X&rating=up|down&token=X
app.get("/intelligence/feedback", (req, res) => {
  const { reportId, section, rating, token } = req.query;

  // Validate required params
  if (!reportId || !section || !rating || !token) {
    return res.status(400).send(feedbackPage("❌", "无效的反馈链接", "缺少必要参数。"));
  }

  // Validate token
  const expectedToken = generateFeedbackToken(reportId, section, rating);
  if (token !== expectedToken) {
    return res.status(403).send(feedbackPage("❌", "链接已失效", "此反馈链接无效或已过期。"));
  }

  // Load and update playbook
  try {
    let playbook = {};
    if (fs.existsSync(PLAYBOOK_PATH)) {
      playbook = JSON.parse(fs.readFileSync(PLAYBOOK_PATH, "utf8"));
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

    fs.writeFileSync(PLAYBOOK_PATH, JSON.stringify(playbook, null, 2), "utf8");
    console.log(`[Feedback] Recorded: report=${reportId} section=${section} rating=${rating}`);
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
