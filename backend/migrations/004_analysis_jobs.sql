-- Analysis job tracking for the general scoring pipeline.
-- Mirrors ci_deep_dive_jobs pattern but for workspace-level analysis.
CREATE TABLE IF NOT EXISTS ci_analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'scoring', 'narrating', 'complete', 'failed')),
  total_brands INT DEFAULT 0,
  completed_brands INT DEFAULT 0,
  current_brand TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_jobs_workspace ON ci_analysis_jobs(workspace_id, created_at DESC);
