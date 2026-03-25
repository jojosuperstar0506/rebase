require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

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

// ── Start server ────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Rebase backend running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`Security: rate limiting active, secret token ${process.env.API_SECRET ? 'enabled' : 'disabled (set API_SECRET to enable)'}`);
});
