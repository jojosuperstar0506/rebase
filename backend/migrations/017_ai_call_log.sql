-- Migration 017: ai_call_log table for per-call cost telemetry.
--
-- Sub-issue #146 (Epic #91 — Unit cost optimization).
--
-- Every LLM call (Claude, DeepSeek, Qwen, GLM) logs one row here with
-- the workspace it was on behalf of, the model, token counts, and the
-- estimated cost. The estimate uses a static rate table maintained in
-- the wrapper code (services/competitor_intel/cost_estimator.py for
-- Python, backend/cost_estimator.js for Node) — when providers change
-- rates, update the table; old rows keep their then-current estimate.
--
-- workspace_id nullable because some calls aren't workspace-scoped (the
-- diagnostic /api/ai endpoint, ad-hoc CLI runs, etc.). The aggregator
-- queries we care about (cost-per-customer) filter `WHERE workspace_id
-- IS NOT NULL`.

CREATE TABLE IF NOT EXISTS ai_call_log (
  id BIGSERIAL PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  caller TEXT NOT NULL,                -- e.g. 'narrative_pipeline.brand_insight', 'server.callAI'
  provider TEXT NOT NULL,              -- 'anthropic' | 'deepseek' | 'qwen' | 'glm'
  model TEXT NOT NULL,                 -- e.g. 'deepseek-chat', 'claude-haiku-4-5-20251001'
  input_tokens INTEGER,                -- nullable: some providers don't return usage
  output_tokens INTEGER,
  cost_estimate_usd NUMERIC(12, 6),    -- 6 decimal places — sub-cent precision
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,                  -- truncated to first 500 chars on failure
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the two query shapes we care about:
--   1. cost-per-customer-per-month: WHERE workspace_id = $1 AND called_at >= $2
--   2. global cost stream: ORDER BY called_at DESC LIMIT N
CREATE INDEX IF NOT EXISTS idx_ai_call_log_workspace_called
  ON ai_call_log(workspace_id, called_at DESC)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_call_log_called
  ON ai_call_log(called_at DESC);

COMMENT ON TABLE ai_call_log IS
  'Per-LLM-call cost telemetry. One row per call. See docs/SCHEMA.md Layer 5 — Operational.';
