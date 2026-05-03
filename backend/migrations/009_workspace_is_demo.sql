-- 009_workspace_is_demo.sql
--
-- Adds is_demo BOOLEAN column to workspaces. Used to lock the Settings
-- UI on demo workspaces during client screen-recordings — prevents
-- accidental clicks from breaking the curated demo dataset.
--
-- Demo workspaces are populated by services/competitor_intel/demo_seeder.py.
-- Real customer workspaces never have this flag set, so all existing
-- behavior is preserved (default false).

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- Partial index — most workspaces will have is_demo = false, so a partial
-- index on the rare TRUE case keeps the index small while still helping
-- the demo-discovery query path (e.g. admin tooling listing demo accounts).
CREATE INDEX IF NOT EXISTS idx_workspaces_is_demo
    ON workspaces (id) WHERE is_demo = TRUE;
