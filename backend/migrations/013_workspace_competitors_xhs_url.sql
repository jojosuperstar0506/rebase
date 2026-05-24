-- 013_workspace_competitors_xhs_url.sql
-- Add XHS profile URL storage per competitor.
--
-- Context: scraping migration to Apify (issue #62, PR #81 family).
-- easyapi's actors take userUrl as input — meaning each competitor needs a
-- one-time-config XHS profile URL. Before this migration the scraper used
-- an env-var hack (XHS_PROFILE_URL_<BRAND>) which doesn't scale.
--
-- For the first 5 prospect demos, admin (Will/Joanna) populates this column
-- manually via the new admin endpoint PATCH /api/admin/competitors/:id/xhs-url.
-- After we have prospect-call data, future iteration could auto-resolve at
-- onboarding time (easyapi search actor unreliable; deferred).
--
-- Added: 2026-05-24

ALTER TABLE workspace_competitors
    ADD COLUMN IF NOT EXISTS xhs_profile_url TEXT;

-- Helpful for the scraper's "find brands with URLs configured" query
CREATE INDEX IF NOT EXISTS idx_workspace_competitors_xhs_url_set
    ON workspace_competitors(workspace_id, brand_name)
    WHERE xhs_profile_url IS NOT NULL;

COMMENT ON COLUMN workspace_competitors.xhs_profile_url IS
    'XHS profile URL for Apify scraping (e.g., https://www.rednote.com/user/profile/<userId>). NULL = not yet configured; cron skips this competitor in USE_APIFY=true mode.';
