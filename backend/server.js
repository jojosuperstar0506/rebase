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
const { getKnownBrands, searchBrands, KNOWN_BRANDS } = require("./brand_registry");

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

// CI endpoints get a higher rate limit (dashboard loads 4-5 calls at once)
const ciRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please try again in a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/ci/', ciRateLimit);

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
    const { brand_name, brand_category, brand_price_range, brand_platforms } = req.body;
    // user_id can come from body (direct API) or x-user-id header (via Vercel proxy)
    const user_id = req.body.user_id || req.headers['x-user-id'];

    if (!user_id || !brand_name || !brand_category) {
      return res.status(400).json({ error: 'Missing required fields: user_id, brand_name, brand_category' });
    }

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
        trend_signals: (() => {
          const narr = brandScores.find(s => s.ai_narrative)?.ai_narrative || '';
          if (!narr) return [];
          return narr.split(/[，。；,;]/).filter(s => s.trim().length > 2 && s.trim().length < 20).slice(0, 3).map(s => s.trim());
        })(),
      };
    });

    const narrative = narratives[0]?.narrative || '';
    let actionItems = narratives[0]?.action_items || [];
    if (typeof actionItems === 'string') {
      try { actionItems = JSON.parse(actionItems); } catch {}
    }

    res.json({
      narrative,
      last_updated: narratives[0]?.analyzed_at || new Date().toISOString(),
      brands,
      action_items: actionItems,
      analysis_pending: scores.length === 0,
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

// --- Cookie encryption helpers (AES-256-CBC, PBKDF2 key derivation) ---
const COOKIE_KEY = process.env.COOKIE_ENCRYPTION_KEY || 'dev-key-change-in-production';
const COOKIE_SALT = 'rebase-ci-cookie-salt';

function encryptCookie(plaintext) {
  const key = crypto.pbkdf2Sync(COOKIE_KEY, COOKIE_SALT, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decryptCookie(stored) {
  const key = crypto.pbkdf2Sync(COOKIE_KEY, COOKIE_SALT, 100000, 32, 'sha256');
  const [ivB64, encB64] = stored.split(':');
  const iv = Buffer.from(ivB64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// POST /api/ci/connections — connect a platform (store encrypted cookies)
app.post('/api/ci/connections', async (req, res) => {
  try {
    const { workspace_id, platform, cookies } = req.body;
    if (!workspace_id || !platform || !cookies) {
      return res.status(400).json({ error: 'Missing workspace_id, platform, or cookies' });
    }

    const encrypted = encryptCookie(cookies);

    const { rows } = await pool.query(
      `INSERT INTO platform_connections (workspace_id, platform, cookies_encrypted, status, expires_at)
       VALUES ($1, $2, $3, 'active', NOW() + INTERVAL '24 hours')
       ON CONFLICT (workspace_id, platform) DO UPDATE
         SET cookies_encrypted = $3, status = 'active', updated_at = NOW(),
             expires_at = NOW() + INTERVAL '24 hours'
       RETURNING id, workspace_id, platform, status, expires_at, created_at`,
      [workspace_id, platform, encrypted]
    );

    console.log(`[CI] Cookies saved for ${platform} (workspace ${workspace_id})`);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[CI] POST connections error:', err.message);
    res.status(500).json({ error: 'Failed to save connection' });
  }
});

// POST /api/ci/connections/check — check if cookies are still valid
app.post('/api/ci/connections/check', async (req, res) => {
  try {
    const { workspace_id, platform } = req.body;
    if (!workspace_id || !platform) {
      return res.status(400).json({ error: 'Missing workspace_id or platform' });
    }

    const { rows } = await pool.query(
      'SELECT * FROM platform_connections WHERE workspace_id = $1 AND platform = $2',
      [workspace_id, platform]
    );

    if (rows.length === 0) return res.json({ status: 'not_connected' });

    const conn = rows[0];

    // Check expiry
    if (conn.expires_at && new Date(conn.expires_at) < new Date()) {
      await pool.query(
        "UPDATE platform_connections SET status = 'expired' WHERE id = $1",
        [conn.id]
      );
      return res.json({ status: 'expired', expired_at: conn.expires_at });
    }

    // Check if approaching expiry (within 6 hours)
    if (conn.expires_at) {
      const hoursLeft = (new Date(conn.expires_at) - new Date()) / (1000 * 60 * 60);
      if (hoursLeft < 6) {
        await pool.query(
          "UPDATE platform_connections SET status = 'expiring' WHERE id = $1",
          [conn.id]
        );
        return res.json({ status: 'expiring', hours_left: Math.round(hoursLeft) });
      }
    }

    res.json({
      status: conn.status,
      last_scrape: conn.last_successful_scrape,
      expires_at: conn.expires_at,
    });
  } catch (err) {
    console.error('[CI] POST connections/check error:', err.message);
    res.status(500).json({ error: 'Failed to check connection' });
  }
});

// GET /api/ci/pipeline/status — last pipeline run status
app.get('/api/ci/pipeline/status', async (req, res) => {
  const statusFile = '/tmp/rebase-pipeline-status.json';

  try {
    if (fs.existsSync(statusFile)) {
      const raw = fs.readFileSync(statusFile, 'utf8');
      const status = JSON.parse(raw);
      res.json(status);
    } else {
      // Check database for last analysis timestamp
      const { rows } = await pool.query(
        'SELECT MAX(analyzed_at) as last_run FROM analysis_results'
      );
      res.json({
        status: 'unknown',
        last_analysis: rows[0]?.last_run || null,
        message: 'No pipeline status file found. Pipeline may not have run yet.',
      });
    }
  } catch (err) {
    res.json({ status: 'error', message: err.message });
  }
});

// POST /api/ci/scrape — trigger a scrape for a specific brand (background process)
app.post('/api/ci/scrape', async (req, res) => {
  const { brand_name, platform, tier } = req.body;
  if (!brand_name || !platform) {
    return res.status(400).json({ error: 'Missing brand_name or platform' });
  }

  try {
    const { spawn } = require('child_process');
    const args = [
      '-m', 'services.competitor_intel.scrape_runner',
      '--platform', platform,
      '--brand', brand_name,
    ];

    const repoRoot = path.resolve(__dirname, '..');
    const pythonBin = process.env.PYTHON_BIN || 'python3';
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
  } catch (err) {
    console.error('[CI] POST scrape error:', err.message);
    res.status(500).json({ error: 'Failed to start scraper' });
  }
});

// POST /api/ci/ingest — receive scraped data from local agents or server scrapers
app.post('/api/ci/ingest', async (req, res) => {
  const {
    platform,
    brand_name,
    scrape_tier,
    agent_id,
    brand_profile,
    products,
    raw_dimensions,
  } = req.body;

  if (!platform || !brand_name) {
    return res.status(400).json({ error: 'Missing platform or brand_name' });
  }

  try {
    // Save brand profile
    if (brand_profile && Object.keys(brand_profile).length > 0) {
      await pool.query(`
        INSERT INTO scraped_brand_profiles
          (platform, brand_name, follower_count, total_products, avg_price,
           price_range, engagement_metrics, content_metrics, scrape_tier, raw_dimensions)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        platform, brand_name,
        brand_profile.follower_count || null,
        brand_profile.total_products || null,
        brand_profile.avg_price || null,
        JSON.stringify(brand_profile.price_range || null),
        JSON.stringify(brand_profile.engagement_metrics || null),
        JSON.stringify(brand_profile.content_metrics || null),
        scrape_tier || 'watchlist',
        JSON.stringify(raw_dimensions || null),
      ]);
    }

    // Save products
    let productsSaved = 0;
    if (products && products.length > 0) {
      for (const p of products) {
        await pool.query(`
          INSERT INTO scraped_products
            (platform, brand_name, product_id, product_name, price, original_price,
             sales_volume, review_count, rating, category, material_tags,
             image_urls, product_url, scrape_tier, data_confidence)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          ON CONFLICT (platform, product_id, scraped_date)
          DO UPDATE SET price = EXCLUDED.price, sales_volume = EXCLUDED.sales_volume,
                        review_count = EXCLUDED.review_count, scraped_at = NOW()
        `, [
          platform, brand_name,
          p.product_id || `${brand_name}-${Date.now()}-${productsSaved}`,
          p.product_name || '',
          p.price || null, p.original_price || null,
          p.sales_volume || null, p.review_count || null, p.rating || null,
          p.category || null, p.material_tags || [],
          p.image_urls || [], p.product_url || '',
          scrape_tier || 'watchlist', 'direct_scrape',
        ]);
        productsSaved++;
      }
    }

    console.log(`[INGEST] ${platform}/${brand_name}: profile=${!!brand_profile}, products=${productsSaved}, agent=${agent_id || 'unknown'}`);

    res.json({ success: true, brand_name, platform, products_saved: productsSaved });

    // Auto-trigger scoring in background (non-blocking)
    setImmediate(async () => {
      try {
        const { rows: workspaces } = await pool.query(`
          SELECT DISTINCT w.id FROM workspaces w
          JOIN workspace_competitors wc ON wc.workspace_id = w.id
          WHERE wc.brand_name = $1
        `, [brand_name]);

        if (workspaces.length > 0) {
          const { spawn } = require('child_process');
          const pythonBin = process.env.PYTHON_BIN || 'python3';
          for (const ws of workspaces) {
            spawn(pythonBin, [
              '-m', 'services.competitor_intel.scoring_pipeline',
              '--workspace-id', ws.id,
            ], {
              cwd: process.cwd().replace('/backend', ''),
              env: { ...process.env },
              detached: true,
              stdio: 'ignore',
            }).unref();
          }
          console.log(`[INGEST] Triggered scoring for ${workspaces.length} workspaces after ${brand_name} ingest`);

          // After scoring, trigger alert detection (10s delay so scoring finishes first)
          setTimeout(() => {
            for (const ws of workspaces) {
              spawn(pythonBin, [
                '-m', 'services.competitor_intel.alert_detector',
                '--workspace-id', ws.id,
              ], {
                cwd: process.cwd().replace('/backend', ''),
                env: { ...process.env },
                detached: true,
                stdio: 'ignore',
              }).unref();
            }
            console.log(`[INGEST] Triggered alert detection for ${workspaces.length} workspaces`);
          }, 10000);
        }
      } catch (err) {
        console.error('[INGEST] Scoring trigger failed:', err.message);
      }
    });

  } catch (err) {
    console.error('[INGEST] Error:', err.message);
    res.status(500).json({ error: 'Failed to ingest data', detail: err.message });
  }
});

// GET /api/ci/scrape-targets — list brands that need scraping
app.get('/api/ci/scrape-targets', async (req, res) => {
  const tier = req.query.tier || 'watchlist';
  const platform = req.query.platform || 'xhs';

  try {
    // Get all unique brands at this tier across all workspaces
    const { rows: brands } = await pool.query(`
      SELECT DISTINCT wc.brand_name, wc.tier, wc.platform_ids
      FROM workspace_competitors wc
      WHERE wc.tier = $1
      ORDER BY wc.brand_name
    `, [tier]);

    // Enrich with last scrape time so agents can skip fresh data
    const targets = [];
    for (const brand of brands) {
      const { rows: lastScrape } = await pool.query(`
        SELECT MAX(scraped_at) as last_scraped
        FROM scraped_brand_profiles
        WHERE brand_name = $1 AND platform = $2
      `, [brand.brand_name, platform]);

      targets.push({
        brand_name: brand.brand_name,
        tier: brand.tier,
        keyword: (brand.platform_ids || {})[platform] || brand.brand_name,
        last_scraped: lastScrape[0]?.last_scraped || null,
      });
    }

    res.json({ targets, count: targets.length, platform, tier });
  } catch (err) {
    console.error('[CI] GET scrape-targets error:', err.message);
    res.status(500).json({ error: 'Failed to fetch scrape targets' });
  }
});

// GET /api/ci/alerts — get alerts for a workspace
app.get('/api/ci/alerts', async (req, res) => {
  const { workspace_id, unread_only, limit } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });

  try {
    let query = 'SELECT * FROM ci_alerts WHERE workspace_id = $1';
    const params = [workspace_id];

    if (unread_only === 'true') {
      query += ' AND is_read = false';
    }

    query += ' ORDER BY created_at DESC';

    const maxLimit = Math.min(parseInt(limit) || 20, 50);
    query += ` LIMIT ${maxLimit}`;

    const { rows } = await pool.query(query, params);

    // Also get unread count
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) as unread FROM ci_alerts WHERE workspace_id = $1 AND is_read = false',
      [workspace_id]
    );

    res.json({
      alerts: rows,
      unread_count: parseInt(countRows[0].unread),
      total_returned: rows.length,
    });
  } catch (err) {
    console.error('[CI] GET alerts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// POST /api/ci/alerts/read — mark alerts as read
app.post('/api/ci/alerts/read', async (req, res) => {
  const { workspace_id, alert_ids } = req.body;

  try {
    if (alert_ids && alert_ids.length > 0) {
      // Mark specific alerts as read
      await pool.query(
        'UPDATE ci_alerts SET is_read = true WHERE id = ANY($1) AND workspace_id = $2',
        [alert_ids, workspace_id]
      );
    } else if (workspace_id) {
      // Mark all as read for this workspace
      await pool.query(
        'UPDATE ci_alerts SET is_read = true WHERE workspace_id = $1 AND is_read = false',
        [workspace_id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[CI] POST alerts/read error:', err.message);
    res.status(500).json({ error: 'Failed to mark alerts as read' });
  }
});

// GET /api/ci/alerts/count — just the unread count (lightweight, for nav badge)
app.get('/api/ci/alerts/count', async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });

  try {
    const { rows } = await pool.query(
      'SELECT COUNT(*) as unread FROM ci_alerts WHERE workspace_id = $1 AND is_read = false',
      [workspace_id]
    );

    res.json({ unread_count: parseInt(rows[0].unread) });
  } catch (err) {
    console.error('[CI] GET alerts/count error:', err.message);
    res.status(500).json({ error: 'Failed to fetch alert count' });
  }
});

// GET /api/ci/trends — historical score data for trend charts
// Query params: workspace_id, competitor, metric (momentum|threat|wtp), days (default 30)
app.get('/api/ci/trends', async (req, res) => {
  const { workspace_id, competitor, metric, days } = req.query;

  if (!workspace_id || !competitor) {
    return res.status(400).json({ error: 'Missing workspace_id or competitor' });
  }

  const metricType = metric || 'momentum';
  const dayCount = Math.min(parseInt(days) || 30, 180); // Max 180 days

  try {
    const { rows } = await pool.query(`
      SELECT
        score,
        analyzed_at::date as date,
        metric_version
      FROM analysis_results
      WHERE workspace_id = $1
        AND competitor_name = $2
        AND metric_type = $3
        AND analyzed_at > NOW() - make_interval(days => $4)
      ORDER BY analyzed_at ASC
    `, [workspace_id, competitor, metricType, dayCount]);

    // Deduplicate by date (keep latest score per day)
    const byDate = {};
    for (const row of rows) {
      const dateStr = row.date.toISOString().slice(0, 10);
      byDate[dateStr] = {
        date: dateStr,
        value: parseFloat(row.score),
        version: row.metric_version,
      };
    }

    const dataPoints = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      competitor,
      metric: metricType,
      days: dayCount,
      data: dataPoints,
      count: dataPoints.length,
    });
  } catch (err) {
    console.error('[CI] GET trends error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trends' });
  }
});

// GET /api/ci/trends/summary — score changes for all competitors in a workspace
// Returns: { competitors: [{ brand_name, momentum_current, momentum_7d_ago, momentum_direction, ... }] }
app.get('/api/ci/trends/summary', async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });

  try {
    // Get all competitors for this workspace
    const { rows: competitors } = await pool.query(
      'SELECT brand_name FROM workspace_competitors WHERE workspace_id = $1',
      [workspace_id]
    );

    const summaries = [];

    for (const comp of competitors) {
      const summary = { brand_name: comp.brand_name };

      for (const metric of ['momentum', 'threat', 'wtp']) {
        // Current score (latest)
        const { rows: current } = await pool.query(`
          SELECT score FROM analysis_results
          WHERE workspace_id = $1 AND competitor_name = $2 AND metric_type = $3
          ORDER BY analyzed_at DESC LIMIT 1
        `, [workspace_id, comp.brand_name, metric]);

        // Score from ~7 days ago
        const { rows: weekAgo } = await pool.query(`
          SELECT score FROM analysis_results
          WHERE workspace_id = $1 AND competitor_name = $2 AND metric_type = $3
            AND analyzed_at < NOW() - INTERVAL '6 days'
          ORDER BY analyzed_at DESC LIMIT 1
        `, [workspace_id, comp.brand_name, metric]);

        const currentScore = current[0] ? parseFloat(current[0].score) : null;
        const pastScore = weekAgo[0] ? parseFloat(weekAgo[0].score) : null;

        let direction = 'stable';
        let change = 0;
        if (currentScore !== null && pastScore !== null) {
          change = currentScore - pastScore;
          if (change > 2) direction = 'rising';
          else if (change < -2) direction = 'falling';
        }

        summary[`${metric}_current`] = currentScore;
        summary[`${metric}_7d_ago`] = pastScore;
        summary[`${metric}_change`] = Math.round(change * 10) / 10;
        summary[`${metric}_direction`] = direction;
      }

      summaries.push(summary);
    }

    res.json({ workspace_id, competitors: summaries });
  } catch (err) {
    console.error('[CI] GET trends/summary error:', err.message);
    res.status(500).json({ error: 'Failed to fetch trend summary' });
  }
});

// POST /api/ci/deep-dive — request a full-depth analysis of one competitor
app.post('/api/ci/deep-dive', async (req, res) => {
  const { workspace_id, brand_name, platform } = req.body;

  if (!workspace_id || !brand_name) {
    return res.status(400).json({ error: 'Missing workspace_id or brand_name' });
  }

  try {
    // Create a deep dive job record
    const { rows } = await pool.query(`
      INSERT INTO ci_deep_dive_jobs
        (workspace_id, brand_name, platform, status)
      VALUES ($1, $2, $3, 'queued')
      RETURNING *
    `, [workspace_id, brand_name, platform || 'all']);

    const job = rows[0];

    // Spawn the deep dive pipeline as a background process
    const { spawn } = require('child_process');
    const pythonBin = process.env.PYTHON_BIN || 'python3';

    const proc = spawn(pythonBin, [
      '-m', 'services.competitor_intel.deep_dive_runner',
      '--job-id', job.id,
      '--workspace-id', workspace_id,
      '--brand', brand_name,
      '--platform', platform || 'all',
    ], {
      cwd: process.cwd().replace('/backend', ''),
      env: { ...process.env },
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();

    res.json({
      job_id: job.id,
      status: 'queued',
      brand_name,
      message: `Deep dive analysis started for ${brand_name}`,
    });
  } catch (err) {
    console.error('[CI] POST deep-dive error:', err.message);
    res.status(500).json({ error: 'Failed to start deep dive' });
  }
});

// GET /api/ci/deep-dive/status — check deep dive job status
app.get('/api/ci/deep-dive/status', async (req, res) => {
  const { job_id, workspace_id, brand_name } = req.query;

  let query, params;
  if (job_id) {
    query = 'SELECT * FROM ci_deep_dive_jobs WHERE id = $1';
    params = [job_id];
  } else if (workspace_id && brand_name) {
    query = 'SELECT * FROM ci_deep_dive_jobs WHERE workspace_id = $1 AND brand_name = $2 ORDER BY created_at DESC LIMIT 1';
    params = [workspace_id, brand_name];
  } else {
    return res.status(400).json({ error: 'Missing job_id or workspace_id+brand_name' });
  }

  try {
    const { rows } = await pool.query(query, params);

    if (rows.length === 0) {
      return res.json({ status: 'none', message: 'No deep dive has been run for this competitor' });
    }

    const job = rows[0];
    res.json({
      job_id: job.id,
      brand_name: job.brand_name,
      platform: job.platform,
      status: job.status,
      started_at: job.started_at,
      completed_at: job.completed_at,
      error: job.error_message,
      result_summary: job.result_summary,
    });
  } catch (err) {
    console.error('[CI] GET deep-dive/status error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deep dive status' });
  }
});

// GET /api/ci/deep-dive/result — get the full deep dive data for a brand
app.get('/api/ci/deep-dive/result', async (req, res) => {
  const { workspace_id, brand_name } = req.query;
  if (!workspace_id || !brand_name) {
    return res.status(400).json({ error: 'Missing workspace_id or brand_name' });
  }

  try {
    // Get latest deep dive profile
    const { rows: profiles } = await pool.query(`
      SELECT * FROM scraped_brand_profiles
      WHERE brand_name = $1 AND scrape_tier = 'deep_dive'
      ORDER BY scraped_at DESC LIMIT 1
    `, [brand_name]);

    // Get deep dive products
    const { rows: products } = await pool.query(`
      SELECT * FROM scraped_products
      WHERE brand_name = $1 AND scrape_tier = 'deep_dive'
      ORDER BY scraped_at DESC LIMIT 50
    `, [brand_name]);

    // Get all scores
    const { rows: scores } = await pool.query(`
      SELECT metric_type, score, raw_inputs, ai_narrative, analyzed_at
      FROM analysis_results
      WHERE workspace_id = $1 AND competitor_name = $2
      ORDER BY analyzed_at DESC
    `, [workspace_id, brand_name]);

    // Get per-brand insight
    const { rows: insights } = await pool.query(`
      SELECT ai_narrative FROM analysis_results
      WHERE workspace_id = $1 AND competitor_name = $2 AND metric_type = 'brand_insight'
      ORDER BY analyzed_at DESC LIMIT 1
    `, [workspace_id, brand_name]);

    // Deduplicate scores by metric type (latest only)
    const latestScores = {};
    for (const s of scores) {
      if (!latestScores[s.metric_type]) {
        latestScores[s.metric_type] = s;
      }
    }

    res.json({
      brand_name,
      profile: profiles[0] || null,
      products,
      scores: latestScores,
      insight: insights[0]?.ai_narrative || null,
      raw_dimensions: profiles[0]?.raw_dimensions || null,
      last_deep_dive: profiles[0]?.scraped_at || null,
    });
  } catch (err) {
    console.error('[CI] GET deep-dive/result error:', err.message);
    res.status(500).json({ error: 'Failed to fetch deep dive result' });
  }
});

// GET /api/ci/brand-insights — per-brand AI insights for a workspace
app.get('/api/ci/brand-insights', async (req, res) => {
  const { workspace_id } = req.query;
  if (!workspace_id) return res.status(400).json({ error: 'Missing workspace_id' });

  try {
    const { rows } = await pool.query(`
      SELECT DISTINCT ON (competitor_name)
        competitor_name, ai_narrative, analyzed_at
      FROM analysis_results
      WHERE workspace_id = $1 AND metric_type = 'brand_insight' AND ai_narrative IS NOT NULL
      ORDER BY competitor_name, analyzed_at DESC
    `, [workspace_id]);

    res.json(rows);
  } catch (err) {
    console.error('[CI] GET brand-insights error:', err.message);
    res.status(500).json({ error: 'Failed to fetch brand insights' });
  }
});

// ── LLM Helper ──────────────────────────────────────────────────────────────
async function callLLM(prompt, maxTokens = 1000) {
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (deepseekKey) {
    try {
      const baseUrl = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '');
      const url = baseUrl.includes('/chat/completions') ? baseUrl : `${baseUrl}/v1/chat/completions`;

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: maxTokens,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => 'unknown');
        console.error(`[callLLM] DeepSeek HTTP ${resp.status}: ${errText.slice(0, 200)}`);
        throw new Error(`DeepSeek API returned ${resp.status}`);
      }

      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (err) {
      console.error('[callLLM] DeepSeek failed:', err.message);
      // Fall through to Anthropic if available
      if (!anthropicKey) throw err;
    }
  }

  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey });
      const msg = await client.messages.create({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        messages: [{ role: 'user', content: prompt }],
      });
      return msg.content[0].text;
    } catch (err) {
      console.error('[callLLM] Anthropic failed:', err.message);
      throw err;
    }
  }

  throw new Error('No LLM API key configured (DEEPSEEK_API_KEY or ANTHROPIC_API_KEY)');
}

// POST /api/ci/resolve-brand — auto-detect platform identifiers for a brand name
app.post('/api/ci/resolve-brand', async (req, res) => {
  const { brand_name } = req.body;
  if (!brand_name) return res.status(400).json({ error: 'Missing brand_name' });

  try {
    // Step 1: Check if we've seen this brand before (any workspace)
    const { rows: existing } = await pool.query(`
      SELECT platform_ids FROM workspace_competitors
      WHERE brand_name = $1 AND platform_ids IS NOT NULL
      LIMIT 1
    `, [brand_name]);

    if (existing.length > 0 && existing[0].platform_ids) {
      return res.json({
        brand_name,
        platform_ids: existing[0].platform_ids,
        source: 'database',
      });
    }

    // Step 2: Check against the known brand registry
    const match = getKnownBrands().find(b =>
      b.name === brand_name || b.name_en === brand_name ||
      b.name.toLowerCase() === brand_name.toLowerCase() ||
      (b.name_en && b.name_en.toLowerCase() === brand_name.toLowerCase())
    );

    if (match) {
      return res.json({
        brand_name,
        platform_ids: {
          xhs: match.xhs_keyword || brand_name,
          douyin: match.douyin_keyword || brand_name,
          taobao: match.tmall_store || null,
        },
        source: 'registry',
        badge: match.badge,
      });
    }

    // Step 3: Default — use brand name as keyword for all platforms
    res.json({
      brand_name,
      platform_ids: {
        xhs: brand_name,
        douyin: brand_name,
        taobao: null,
      },
      source: 'default',
    });
  } catch (err) {
    console.error('[CI] POST resolve-brand error:', err.message);
    res.status(500).json({ error: 'Failed to resolve brand' });
  }
});

// POST /api/ci/parse-link — extract platform + brand from a URL
app.post('/api/ci/parse-link', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  let platform = null;
  let identifier = null;
  let brand_name = null;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const urlPath = parsed.pathname;

    // ── XHS (xiaohongshu.com, xhslink.com) ──
    if (host.includes('xiaohongshu.com') || host.includes('xhslink.com')) {
      platform = 'xhs';

      // Profile URL: /user/profile/62848d2700000000210271174?xsec_token=...
      const userMatch = urlPath.match(/\/user\/profile\/([a-zA-Z0-9]+)/);
      if (userMatch) identifier = userMatch[1];

      // Note/explore URL: /explore/6789abc
      const noteMatch = urlPath.match(/\/explore\/([a-zA-Z0-9]+)/);
      if (noteMatch) identifier = noteMatch[1];

      // Search URL: /search_result?keyword=Songmont
      const kwMatch = parsed.searchParams.get('keyword');
      if (kwMatch) { identifier = kwMatch; brand_name = kwMatch; }

      // Short link (xhslink.com/abc123) — just detect platform
      if (host.includes('xhslink.com') && !identifier) {
        identifier = urlPath.replace(/^\//, '') || null;
      }
    }
    // ── Taobao / Tmall ──
    else if (host.includes('taobao.com') || host.includes('tmall.com')) {
      platform = 'taobao';

      // Subdomain shop: shop123456.taobao.com or songmont.tmall.com
      const subdomain = host.split('.')[0];
      if (subdomain && subdomain !== 'www' && subdomain !== 'item' && subdomain !== 'detail') {
        identifier = subdomain;
        brand_name = subdomain.replace(/^shop/, '');
      }

      // Path shop: /shop/xxx
      const shopMatch = urlPath.match(/\/shop\/([^\/\?]+)/);
      if (shopMatch) identifier = shopMatch[1];

      // Item ID: ?id=12345
      const itemMatch = parsed.searchParams.get('id');
      if (itemMatch) identifier = itemMatch;
    }
    // ── Douyin ──
    else if (host.includes('douyin.com')) {
      platform = 'douyin';

      // User profile: /user/MS4wLjABAAAA... (base64 IDs with special chars)
      const userMatch = urlPath.match(/\/user\/([a-zA-Z0-9_\-]+)/);
      if (userMatch) identifier = userMatch[1];

      // Search: /search/品牌名
      const kwMatch = urlPath.match(/\/search\/([^\/\?]+)/);
      if (kwMatch) { identifier = decodeURIComponent(kwMatch[1]); brand_name = identifier; }
    }
    // ── JD ──
    else if (host.includes('jd.com')) {
      platform = 'jd';
      const shopMatch = urlPath.match(/\/([a-zA-Z0-9]+)\.html/);
      if (shopMatch) identifier = shopMatch[1];
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL', detail: e.message });
  }

  if (!platform) {
    return res.json({ parsed: false, error: 'Unrecognized platform URL' });
  }

  res.json({
    parsed: true,
    platform,
    identifier,
    brand_name,
    platform_ids: { [platform]: identifier },
  });
});

// POST /api/ci/suggest-competitors — AI-powered competitor suggestions
app.post('/api/ci/suggest-competitors', async (req, res) => {
  const { brand_name, brand_category, brand_price_range, brand_platforms } = req.body;

  if (!brand_name || !brand_category) {
    return res.status(400).json({ error: 'Missing brand_name or brand_category' });
  }

  const priceStr = brand_price_range
    ? `¥${brand_price_range.min}-${brand_price_range.max}`
    : 'unknown';

  try {
    // Get existing tracked brands for context
    const { rows: existingBrands } = await pool.query(`
      SELECT DISTINCT brand_name FROM scraped_brand_profiles
      UNION
      SELECT DISTINCT brand_name FROM workspace_competitors
      ORDER BY brand_name
    `);
    const knownNames = existingBrands.map(r => r.brand_name);

    const registryNames = KNOWN_BRANDS
      .map(b => `${b.name} (${b.badge}, ${b.name_en || ''})`)
      .join(', ');

    const prompt = `You are a competitive intelligence analyst for the Chinese consumer goods market.

A brand is setting up competitive tracking. Here is their profile:
- Brand name: ${brand_name}
- Category: ${brand_category}
- Price range: ${priceStr}
- Platforms: ${JSON.stringify(brand_platforms || [])}

Known brands in our database that could be competitors:
${registryNames}

Other brands currently being tracked by users: ${knownNames.join(', ')}

Based on this brand's category, price range, and positioning, suggest 5-8 competitors they should track. For each, explain in one sentence WHY they should track this competitor (in Chinese/简体中文).

Prioritize:
1. Direct price-range competitors (same category, similar pricing)
2. Aspirational competitors (same category, higher tier)
3. Emerging threats (same category, growing fast)

Respond in this exact JSON format, no markdown:
{
  "suggestions": [
    {"brand_name": "...", "reason": "...理由...", "priority": "high|medium|low", "group": "direct|aspirational|emerging"}
  ]
}`;

    const llmResponse = await callLLM(prompt);

    let suggestions;
    try {
      const raw = llmResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      suggestions = JSON.parse(raw).suggestions || [];
    } catch {
      suggestions = [];
    }

    // Enrich with platform_ids from registry
    const registry = getKnownBrands();
    for (const s of suggestions) {
      const match = registry.find(b => b.name === s.brand_name || b.name_en === s.brand_name);
      if (match) {
        s.platform_ids = {
          xhs: match.xhs_keyword,
          douyin: match.douyin_keyword,
          taobao: match.tmall_store || null,
        };
        s.badge = match.badge;
      }
    }

    res.json({ suggestions, count: suggestions.length });
  } catch (err) {
    console.error('[SUGGEST] AI suggestion failed:', err.message);

    // Fallback: return known brands in the same category with differentiated priorities
    const fallback = searchBrands(brand_category).slice(0, 5).map((b, idx) => ({
      brand_name: b.name,
      reason: `${b.badge} — 同品类品牌`,
      priority: idx === 0 ? 'high' : idx < 3 ? 'medium' : 'low',
      group: b.badge?.includes('国货') ? 'direct' : b.badge?.includes('轻奢') ? 'aspirational' : 'indirect',
      platform_ids: { xhs: b.xhs_keyword, douyin: b.douyin_keyword },
      badge: b.badge,
    }));

    res.json({ suggestions: fallback, count: fallback.length, source: 'fallback' });
  }
});

// GET /api/ci/brands/search — search known brands for autocomplete
app.get('/api/ci/brands/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 1) return res.json({ brands: [] });

    const results = searchBrands(q).map(b => ({
      brand_name: b.name,
      name_en: b.name_en,
      badge: b.badge,
      platform_ids: { xhs: b.xhs_keyword, douyin: b.douyin_keyword, taobao: b.tmall_store },
    }));

    res.json({ brands: results, count: results.length });
  } catch (err) {
    console.error('[CI] GET brands/search error:', err.message);
    res.status(500).json({ error: 'Failed to search brands' });
  }
});

// ── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rebase backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Security: rate limiting active, secret token ${process.env.API_SECRET ? 'enabled' : 'disabled (set API_SECRET to enable)'}`);
});
startScheduler();
