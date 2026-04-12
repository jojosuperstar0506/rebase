CREATE TABLE IF NOT EXISTS ci_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  metric_type TEXT,
  previous_value DECIMAL,
  current_value DECIMAL,
  change_amount DECIMAL,
  severity TEXT DEFAULT 'info' CHECK (severity IN ('critical', 'warning', 'info')),
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ci_alerts_workspace ON ci_alerts(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ci_alerts_unread ON ci_alerts(workspace_id, is_read) WHERE NOT is_read;
