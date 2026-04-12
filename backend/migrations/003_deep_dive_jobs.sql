CREATE TABLE IF NOT EXISTS ci_deep_dive_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  platform TEXT DEFAULT 'all',
  status TEXT DEFAULT 'queued' CHECK (status IN ('queued', 'scraping', 'scoring', 'narrating', 'complete', 'failed')),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  result_summary JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deep_dive_jobs_workspace ON ci_deep_dive_jobs(workspace_id, brand_name, created_at DESC);
