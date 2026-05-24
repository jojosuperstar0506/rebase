-- 012_apify_run_log.sql
-- Cost tracking for Apify actor invocations.
--
-- Each row = one actor call made by services/competitor_intel/scrapers/apify_client.py.
-- Aggregated weekly to show per-brand / per-workspace Apify spend (so we know
-- our COGS per customer before pricing tier discussions).
--
-- Added: 2026-05-22 (A2/A3 of issue #62)

CREATE TABLE IF NOT EXISTS apify_run_log (
    id              BIGSERIAL PRIMARY KEY,
    brand_name      TEXT        NOT NULL,
    platform        TEXT        NOT NULL,         -- 'xhs' | 'douyin' | 'taobao'
    actor_id        TEXT        NOT NULL,         -- e.g. 'zhorex/rednote-xiaohongshu-scraper'
    mode            TEXT        NOT NULL,         -- 'search' | 'profile' | 'comments' | 'video'
    items_returned  INTEGER     NOT NULL DEFAULT 0,
    cost_estimate_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
    run_id          TEXT,                          -- Apify dataset run ID for cross-reference
    workspace_id    UUID,                          -- optional — set when we attribute cost per workspace
    error_message   TEXT,                          -- populated on failed runs
    invoked_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for the typical "show last N days of costs" query
CREATE INDEX IF NOT EXISTS idx_apify_run_log_invoked_at
    ON apify_run_log(invoked_at DESC);

-- Index for per-brand cost lookups
CREATE INDEX IF NOT EXISTS idx_apify_run_log_brand_invoked
    ON apify_run_log(brand_name, invoked_at DESC);

-- Index for per-workspace cost aggregation (lazy; only useful once we
-- start setting workspace_id on writes)
CREATE INDEX IF NOT EXISTS idx_apify_run_log_workspace
    ON apify_run_log(workspace_id, invoked_at DESC)
    WHERE workspace_id IS NOT NULL;

COMMENT ON TABLE apify_run_log IS
    'Per-call Apify actor invocation log. Aggregated weekly for COGS tracking. See services/competitor_intel/scrapers/apify_client.py.';
