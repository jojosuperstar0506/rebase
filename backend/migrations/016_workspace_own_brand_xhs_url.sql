-- Migration 016 — add xhs_profile_url to workspaces so the workspace's OWN
-- brand can be scraped + scored the same way competitors are.
--
-- Problem this fixes (caught 2026-05-26 during first end-to-end test):
-- the "你 vs 竞品" 3-domain chart and metric cards rendered 0 for the
-- workspace's own brand. Root cause: scoring needs scraped data, but the
-- scraper only iterates workspace_competitors rows. The workspace's own
-- brand has no row there (you can't be your own competitor), so it never
-- gets scraped, so no analysis_results row, so score = 0.
--
-- This column lets admin paste the workspace's own XHS profile URL.
-- scrape_runner.get_scrape_targets() then includes it alongside the
-- watchlist competitors. Scoring pipeline already keys on brand_name —
-- once the scraped data lands, scores compute automatically.
--
-- Same column shape as workspace_competitors.xhs_profile_url (migration 013).
-- Nullable — workspaces without a URL set are silently skipped by the
-- scraper (admin pastes one when they're ready).

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS xhs_profile_url TEXT;

-- Partial index for fast "workspaces missing own-brand URL" admin queue.
-- Same pattern as the workspace_competitors equivalent in migration 013.
CREATE INDEX IF NOT EXISTS idx_workspaces_missing_xhs_url
  ON workspaces (id)
  WHERE xhs_profile_url IS NULL;
