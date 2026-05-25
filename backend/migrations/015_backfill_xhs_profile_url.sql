-- Migration 015 — backfill workspace_competitors.xhs_profile_url from
-- platform_ids.xhs where the registry already knew the XHS user id but the
-- admin manual-paste step was never done.
--
-- Companion to the ciApi.buildXhsProfileUrl() helper landed in the same PR:
-- new competitors get their xhs_profile_url auto-populated on add. This
-- migration backfills every PRE-EXISTING row that's eligible, so the next
-- nightly/weekly cron scrape can hit them without an admin first.
--
-- Eligibility:
--   - xhs_profile_url IS NULL (don't overwrite an existing manual paste)
--   - platform_ids contains an 'xhs' key (registry knew the brand)
--   - the xhs value matches the expected XHS UID shape (hex, 16-32 chars)
--
-- Idempotent — re-running is a no-op because already-populated rows are
-- excluded by the IS NULL guard.

UPDATE workspace_competitors
   SET xhs_profile_url = 'https://www.rednote.com/user/profile/' || (platform_ids->>'xhs')
 WHERE xhs_profile_url IS NULL
   AND platform_ids ? 'xhs'
   AND (platform_ids->>'xhs') ~ '^[a-f0-9]{16,32}$';

-- Verify after apply (run by ECS deploy step):
--   SELECT
--     COUNT(*) AS total,
--     COUNT(xhs_profile_url) AS with_url,
--     COUNT(*) FILTER (WHERE xhs_profile_url IS NULL AND platform_ids ? 'xhs') AS still_eligible
--   FROM workspace_competitors;
--
-- Expected:
--   - with_url > previous run's count (rows backfilled)
--   - still_eligible should be 0 (anything that COULD be backfilled WAS)
