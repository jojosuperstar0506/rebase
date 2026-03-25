require('dotenv').config();
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const cors = require('cors');

const app = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST'],
}));
app.use(express.json());

// ── Anthropic client ────────────────────────────────────────────────────────
const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// ── Routes ──────────────────────────────────────────────────────────────────

// Health check — verify server is alive and API key is configured
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
// Used by: GTM agent feature (placeholder for now)
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
});
