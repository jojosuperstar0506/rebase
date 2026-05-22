-- Migration 008: composite_indices table.
--
-- Pre-computed user-facing 12 indices grouped into 3 pillars (Brand Equity /
-- Marketing Engine / Commerce Engine). Spec lives in SPEC-COMPOSITE-INDICES-V1.md
-- — this table is the storage layer.
--
-- Each row is the latest computed score for one (workspace × competitor ×
-- index_name × index_version × day) tuple. The compute layer in
-- services/competitor_intel/composite_indices.py writes here as the final
-- stage of the analysis chain.
--
-- delta + direction are NULL on first compute (no prior period). Subsequent
-- computes look up the most recent prior row and fill them in.

CREATE TABLE IF NOT EXISTS composite_indices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  index_name TEXT NOT NULL,
  index_version TEXT NOT NULL,
  pillar TEXT NOT NULL CHECK (pillar IN ('brand_equity', 'marketing_engine', 'commerce_engine')),

  score NUMERIC NOT NULL,
  inputs JSONB NOT NULL,
  weights JSONB NOT NULL,
  explain_text JSONB NOT NULL,

  direction TEXT CHECK (direction IS NULL OR direction IN ('gaining', 'steady', 'losing')),
  delta NUMERIC,

  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One snapshot per (workspace, competitor, index, version, day) — same-day
-- reruns delete-and-reinsert (handled in the compute layer, not at SQL level
-- via UNIQUE because the constraint would block the historical chain).
CREATE INDEX IF NOT EXISTS idx_composite_indices_workspace
  ON composite_indices(workspace_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS idx_composite_indices_lookup
  ON composite_indices(workspace_id, competitor_name, index_name, computed_at DESC);

-- NOTE: a third index on `(workspace_id, (computed_at::date))` was originally
-- specified here for the compute layer's same-day-rerun delete. PostgreSQL
-- rejects bare `(computed_at::date)` in index expressions because the cast
-- depends on session timezone and is not IMMUTABLE. The obvious fix —
-- `((computed_at AT TIME ZONE 'UTC')::date)` — is accepted but wouldn't be
-- used by `composite_indices.py`'s queries, which use `computed_at::date =
-- CURRENT_DATE` (session-tz-based, server is CST/HKT). Mismatched
-- expression → planner won't use the index → no actual perf benefit.
--
-- Dropped rather than half-fixed. At current scale (~84 rows per workspace
-- per day) the same-day delete and prior-score lookup both run fast enough
-- with the existing `(workspace_id, computed_at DESC)` index above. Add a
-- matching same-day index intentionally if perf telemetry shows it's needed,
-- in lockstep with updating the Python queries to use the same expression.
