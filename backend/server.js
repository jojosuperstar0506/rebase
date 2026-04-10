require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { startScheduler, runDailyReport, generateFeedbackToken } = require("./scheduler");
const fs = require("fs");
const path = require("path");
const { pool } = require("./db");

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
const PUBLIC_API_PATHS = ['/onboarding', '/auth/verify-code'];

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
  methods: ['GET', 'POST', 'DELETE'],
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
    const { name, phone, company, industry, competitors, email, goal } = req.body;
    if (!name || !phone || !industry) {
      return res.status(400).json({ error: "name, phone, and industry are required" });
    }
    const applicantsDir = path.join(__dirname, "config/applicants");
    fs.mkdirSync(applicantsDir, { recursive: true });
    const safePhone = phone.replace(/[^a-z0-9]/gi, "_");
    const filename = `${Date.now()}-${safePhone}.json`;
    const applicant = { name, phone, company, industry, competitors, email, goal, submittedAt: new Date().toISOString(), status: "pending" };
    fs.writeFileSync(path.join(applicantsDir, filename), JSON.stringify(applicant, null, 2));
    console.log(`[Onboarding] New application from ${name} (phone: ${phone.slice(0, 6)}...)`);  // masked for privacy

    // Notify Will/Joanna by email (skips silently if keys not configured)
    notifyNewApplicant(applicant).catch((e) => console.error("[Onboarding] Email failed:", e.message));

    // Auto-create CI workspace if competitors field is present (non-fatal side effect)
    if (competitors && competitors.trim()) {
      try {
        const userId = email || phone || `applicant-${Date.now()}`;

        // Create workspace
        const { rows: [workspace] } = await pool.query(
          `INSERT INTO workspaces (user_id, brand_name, brand_category)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [userId, company || 'My Brand', industry || null]
        );

        if (workspace) {
          // Parse competitors (comma-separated or newline-separated from form)
          const competitorNames = competitors
            .split(/[,，\n]/)
            .map(s => s.trim())
            .filter(Boolean);

          // Add each as a watchlist competitor (max 10)
          for (const compName of competitorNames.slice(0, 10)) {
            await pool.query(
              `INSERT INTO workspace_competitors (workspace_id, brand_name, tier, added_via)
               VALUES ($1, $2, 'watchlist', 'onboarding')
               ON CONFLICT (workspace_id, brand_name) DO NOTHING`,
              [workspace.id, compName]
            );
          }

          console.log(`[CI] Created workspace for ${userId} with ${competitorNames.length} competitors`);
        }
      } catch (ciErr) {
        // Non-fatal: log but don't fail the onboarding
        console.error('[CI] Failed to create workspace from onboarding:', ciErr.message);
      }
    }

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

// Save survey — stores diagnosis result from the calculator
// Called automatically when user completes the 5-step calculator
app.post("/api/save-survey", async (req, res) => {
  try {
    const { sessionId, company, industry, employees, revenue, cityTier, tier, tierLevel, score, savings, departments, deptResults, capAnswers, deptHeadcounts, roleHeadcounts } = req.body;
    const surveysDir = path.join(__dirname, "config/surveys");
    fs.mkdirSync(surveysDir, { recursive: true });
    const filename = `${Date.now()}-${(sessionId || "anon").replace(/[^a-z0-9]/gi, "_")}.json`;
    const survey = {
      sessionId, company, industry, employees, revenue, cityTier, tier, tierLevel,
      score, savings, departments, deptResults, capAnswers, deptHeadcounts, roleHeadcounts,
      submittedAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(surveysDir, filename), JSON.stringify(survey, null, 2));
    console.log(`[Survey] Saved diagnosis for ${company || "anonymous"} — tier L${tierLevel}, savings ¥${savings}万`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Survey] Save error:", err.message);
    res.status(500).json({ error: "Failed to save survey" });
  }
});

// Submit lead — stores calculator lead (name + contact) linked to their diagnosis session
// Called when user fills in their contact info on the calculator results page
app.post("/api/submit-lead", async (req, res) => {
  try {
    const { sessionId, name, contact, company, employees, tier, tierLevel, score, savings, departments, cityTier } = req.body;
    const leadsDir = path.join(__dirname, "config/leads");
    fs.mkdirSync(leadsDir, { recursive: true });
    const filename = `${Date.now()}-${(name || "lead").replace(/[^a-z0-9]/gi, "_")}.json`;
    const lead = {
      sessionId, name, contact, company, employees, tier, tierLevel,
      score, savings, departments, cityTier,
      submittedAt: new Date().toISOString(),
      status: "new",
    };
    fs.writeFileSync(path.join(leadsDir, filename), JSON.stringify(lead, null, 2));
    console.log(`[Lead] New lead: ${name} / ${company} — ¥${savings}万 potential`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[Lead] Save error:", err.message);
    res.status(500).json({ error: "Failed to save lead" });
  }
});

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

// ── Invite Code Auth ──────────────────────────────────────────────────────────
// Helpers to read all approved applicant files
function getApplicantsDir() {
  return path.join(__dirname, "config/applicants");
}

function loadAllApplicants() {
  const dir = getApplicantsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); }
      catch { return null; }
    })
    .filter(Boolean);
}

// GET /api/admin/applicants — list all applicants (pending + approved)
app.get("/api/admin/applicants", (req, res) => {
  const applicants = loadAllApplicants();
  // Sort: pending first, then approved, newest first within each group
  const sorted = applicants.sort((a, b) => {
    if (a.status === b.status) return new Date(b.submittedAt) - new Date(a.submittedAt);
    return a.status === "pending" ? -1 : 1;
  });
  res.json({ applicants: sorted });
});

// POST /api/auth/verify-code — user enters their invite code
// Returns a JWT containing their full profile (name, company, industry, competitors, goal)
app.post("/api/auth/verify-code", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Invite code is required" });

  const applicants = loadAllApplicants();
  const user = applicants.find(
    (a) => a.status === "approved" && a.inviteCode && a.inviteCode.toUpperCase() === code.trim().toUpperCase()
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid or unrecognised invite code. Check your code and try again." });
  }

  const secret = process.env.JWT_SECRET || "rebase-dev-secret";
  const payload = {
    sub: user.phone || user.email,
    name: user.name,
    company: user.company || "",
    industry: user.industry || "",
    competitors: user.competitors || "",
    goal: user.goal || "",
  };
  const token = jwt.sign(payload, secret, { expiresIn: "30d" });
  console.log(`[Auth] ${user.name} (${user.company}) logged in with invite code`);
  res.json({ success: true, token, user: { name: user.name, company: user.company } });
});

// POST /api/admin/approve — generate an invite code for an applicant
// Protected by x-rebase-secret header (only Will/Joanna can call this)
// Body: { "phone": "+86 138 0000 0000" }  OR  { "name": "John Doe" }
// Returns the generated invite code so you can share it with the user
app.post("/api/admin/approve", (req, res) => {
  const { phone, name } = req.body;
  if (!phone && !name) return res.status(400).json({ error: "Provide phone or name to identify the applicant" });

  const dir = getApplicantsDir();
  if (!fs.existsSync(dir)) return res.status(404).json({ error: "No applicants found" });

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  let matchFile = null;
  let applicant = null;

  for (const f of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      const phoneMatch = phone && data.phone && data.phone.replace(/\s/g, "") === phone.replace(/\s/g, "");
      const nameMatch = name && data.name && data.name.toLowerCase() === name.toLowerCase();
      if (phoneMatch || nameMatch) { matchFile = f; applicant = data; break; }
    } catch { continue; }
  }

  if (!applicant) return res.status(404).json({ error: "Applicant not found. Check the phone or name." });
  if (applicant.status === "approved") {
    return res.json({ message: "Already approved", inviteCode: applicant.inviteCode, user: applicant.name });
  }

  // Generate a memorable, user-specific code: RB-[COMPANY]-[4RANDOM]
  const base = (applicant.company || applicant.name || "USER")
    .toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  const inviteCode = `RB-${base}-${suffix}`;

  applicant.status = "approved";
  applicant.inviteCode = inviteCode;
  applicant.approvedAt = new Date().toISOString();
  fs.writeFileSync(path.join(dir, matchFile), JSON.stringify(applicant, null, 2));

  console.log(`[Admin] Approved ${applicant.name} → invite code: ${inviteCode}`);
  res.json({ success: true, inviteCode, user: applicant.name, company: applicant.company, email: applicant.email || "" });
});

// ── CI vFinal API endpoints ──────────────────────────────────────────────────

// GET /api/ci/workspace — get current user's workspace
app.get('/api/ci/workspace', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Missing user ID' });

    const { rows } = await pool.query(
      'SELECT * FROM workspaces WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
      [userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'No workspace found' });

    res.json(rows[0]);
  } catch (err) {
    console.error('[CI] GET workspace error:', err.message);
    res.status(500).json({ error: 'Failed to fetch workspace' });
  }
});

// GET /api/ci/workspace/me — find workspace by auth token info, with competitor counts
app.get('/api/ci/workspace/me', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) return res.status(401).json({ error: 'Missing user ID' });

    const { rows } = await pool.query(
      `SELECT w.*,
         (SELECT COUNT(*) FROM workspace_competitors wc WHERE wc.workspace_id = w.id AND wc.tier = 'watchlist') as watchlist_count,
         (SELECT COUNT(*) FROM workspace_competitors wc WHERE wc.workspace_id = w.id) as total_competitors
       FROM workspaces w
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC
       LIMIT 1`,
      [userId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'No workspace found. Complete onboarding first.' });

    res.json(rows[0]);
  } catch (err) {
    console.error('[CI] GET workspace/me error:', err.message);
    res.status(500).json({ error: 'Failed to fetch workspace' });
  }
});

// POST /api/ci/workspace — create workspace (from onboarding)
app.post('/api/ci/workspace', async (req, res) => {
  try {
    const { user_id, brand_name, brand_category, brand_price_range, brand_platforms } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO workspaces (user_id, brand_name, brand_category, brand_price_range, brand_platforms)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, brand_name, brand_category, brand_price_range, brand_platforms]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[CI] POST workspace error:', err.message);
    res.status(500).json({ error: 'Failed to create workspace' });
  }
});

// GET /api/ci/competitors — list workspace competitors
app.get('/api/ci/competitors', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace_id' });

    const { rows } = await pool.query(
      'SELECT * FROM workspace_competitors WHERE workspace_id = $1 ORDER BY tier, brand_name',
      [workspaceId]
    );

    res.json(rows);
  } catch (err) {
    console.error('[CI] GET competitors error:', err.message);
    res.status(500).json({ error: 'Failed to fetch competitors' });
  }
});

// POST /api/ci/competitors — add a competitor
app.post('/api/ci/competitors', async (req, res) => {
  try {
    const { workspace_id, brand_name, tier, platform_ids, added_via } = req.body;

    const { rows } = await pool.query(
      `INSERT INTO workspace_competitors (workspace_id, brand_name, tier, platform_ids, added_via)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, brand_name) DO UPDATE SET tier = $3, platform_ids = $4
       RETURNING *`,
      [workspace_id, brand_name, tier || 'watchlist', platform_ids, added_via || 'manual']
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[CI] POST competitors error:', err.message);
    res.status(500).json({ error: 'Failed to add competitor' });
  }
});

// DELETE /api/ci/competitors/:id — remove a competitor
app.delete('/api/ci/competitors/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM workspace_competitors WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[CI] DELETE competitor error:', err.message);
    res.status(500).json({ error: 'Failed to delete competitor' });
  }
});

// GET /api/ci/dashboard — main dashboard data for a workspace
app.get('/api/ci/dashboard', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id;
    if (!workspaceId) return res.status(400).json({ error: 'Missing workspace_id' });

    // Get competitors
    const { rows: competitors } = await pool.query(
      'SELECT * FROM workspace_competitors WHERE workspace_id = $1',
      [workspaceId]
    );

    // Get latest scores for each competitor
    const { rows: scores } = await pool.query(
      `SELECT DISTINCT ON (competitor_name, metric_type)
         competitor_name, metric_type, metric_version, score, ai_narrative, analyzed_at
       FROM analysis_results
       WHERE workspace_id = $1
       ORDER BY competitor_name, metric_type, analyzed_at DESC`,
      [workspaceId]
    );

    // Get latest narrative
    const { rows: narratives } = await pool.query(
      'SELECT * FROM analysis_narratives WHERE workspace_id = $1 ORDER BY analyzed_at DESC LIMIT 1',
      [workspaceId]
    );

    // If no analysis results exist but competitors do, trigger scoring in background
    if (scores.length === 0 && competitors.length > 0) {
      const { spawn } = require('child_process');
      const pythonBin = process.env.PYTHON_BIN || 'python3';
      const proc = spawn(pythonBin, [
        '-m', 'services.competitor_intel.scoring_pipeline',
        '--workspace-id', workspaceId,
      ], {
        cwd: process.cwd().replace('/backend', ''),
        env: { ...process.env },
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();
      console.log(`[CI] Triggered scoring pipeline for workspace ${workspaceId}`);
    }

    // Assemble into dashboard format
    const brands = competitors.map(comp => {
      const brandScores = scores.filter(s => s.competitor_name === comp.brand_name);
      return {
        brand_name: comp.brand_name,
        group: comp.tier === 'watchlist' ? 'C' : 'B',
        momentum_score: brandScores.find(s => s.metric_type === 'momentum')?.score || 0,
        threat_index: brandScores.find(s => s.metric_type === 'threat')?.score || 0,
        wtp_score: brandScores.find(s => s.metric_type === 'wtp')?.score || 0,
        trend_signals: [],
      };
    });

    res.json({
      narrative: narratives[0]?.narrative || '',
      last_updated: narratives[0]?.analyzed_at || new Date().toISOString(),
      brands,
      action_items: narratives[0]?.action_items || [],
    });
  } catch (err) {
    console.error('[CI] GET dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

// GET /api/ci/connections — list platform connections for a workspace
app.get('/api/ci/connections', async (req, res) => {
  try {
    const workspaceId = req.query.workspace_id;
    const { rows } = await pool.query(
      'SELECT id, workspace_id, platform, status, last_successful_scrape, expires_at, created_at FROM platform_connections WHERE workspace_id = $1',
      [workspaceId]
    );
    // Note: never return cookies_encrypted to frontend
    res.json(rows);
  } catch (err) {
    console.error('[CI] GET connections error:', err.message);
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

// POST /api/ci/connections — connect a platform (store encrypted cookies)
app.post('/api/ci/connections', async (req, res) => {
  try {
    const { workspace_id, platform, cookies } = req.body;

    // TODO TASK-10: Implement AES-256-GCM encryption for cookies
    // For now, store as-is (TEMPORARY — must encrypt before production)
    const { rows } = await pool.query(
      `INSERT INTO platform_connections (workspace_id, platform, cookies_encrypted, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (workspace_id, platform) DO UPDATE SET cookies_encrypted = $3, status = 'active', updated_at = NOW()
       RETURNING id, workspace_id, platform, status, created_at`,
      [workspace_id, platform, cookies]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[CI] POST connections error:', err.message);
    res.status(500).json({ error: 'Failed to save connection' });
  }
});

// POST /api/ci/scrape — trigger a scrape for a specific brand (background process)
app.post('/api/ci/scrape', async (req, res) => {
  const { brand_name, platform, tier } = req.body;
  if (!brand_name || !platform) {
    return res.status(400).json({ error: 'Missing brand_name or platform' });
  }

  const { spawn } = require('child_process');
  const args = [
    '-m', 'services.competitor-intel.scrape_runner',
    '--platform', platform,
    '--brand', brand_name,
  ];

  const repoRoot = path.resolve(__dirname, '..');
  const pythonBin = process.env.PYTHON_BIN || 'python3.9';
  const proc = spawn(pythonBin, args, {
    cwd: repoRoot,
    env: { ...process.env },
    detached: true,
    stdio: 'ignore',
  });
  proc.unref();

  console.log(`[CI] Spawned scraper: ${platform} / ${brand_name} (pid ${proc.pid})`);
  res.json({
    status: 'started',
    message: `Scraping ${brand_name} on ${platform}`,
    pid: proc.pid,
  });
});

// ── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rebase backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Security: rate limiting active, secret token ${process.env.API_SECRET ? 'enabled' : 'disabled (set API_SECRET to enable)'}`);
});
startScheduler();
