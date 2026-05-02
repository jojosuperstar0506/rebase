-- =============================================================================
-- Workspace audit + dedupe — Day 1 step 0 (login UX fix companion)
-- Date: 2026-04-29
-- Run on ECS (or via SSH tunnel) BEFORE merging the login UX commit.
--
-- Purpose: identify real workspaces vs re-onboarding cruft so we can DELETE
-- the duplicates safely. Every workspace_id FK uses ON DELETE CASCADE,
-- so a single DELETE on workspaces wipes competitors, platform_connections,
-- analysis_results, scraped_brand_profiles, brief tables, etc.
-- =============================================================================

-- ─── 1. Audit: list every workspace with size signals ────────────────────────
-- "Real" workspaces will typically have:
--   - high competitor count (>= 3)
--   - non-zero analysis_results count
--   - non-null brand_category
--   - older created_at
-- "Cruft" workspaces from re-onboarding will typically have:
--   - 0 competitors OR competitors filled by AI fallback
--   - 0 analysis_results
--   - junk brand_name (matches "shoe", "test", "x", etc.)
--   - created_at clustered in the same hour (the re-onboarding session)

\echo '─── ALL WORKSPACES (oldest first) ───'
SELECT
    w.id,
    w.user_id,
    w.brand_name,
    w.brand_category,
    w.created_at,
    w.updated_at,
    (SELECT COUNT(*) FROM workspace_competitors c
        WHERE c.workspace_id = w.id) AS competitor_count,
    (SELECT COUNT(*) FROM analysis_results a
        WHERE a.workspace_id = w.id) AS analysis_count,
    (SELECT COUNT(*) FROM scraped_brand_profiles s
        WHERE s.workspace_id = w.id) AS scrape_count,
    (SELECT MAX(a.analyzed_at) FROM analysis_results a
        WHERE a.workspace_id = w.id) AS last_analysis_at
FROM workspaces w
ORDER BY w.created_at ASC;

-- ─── 2. Per-user workspace count — flags repeat onboarders ──────────────────
\echo ''
\echo '─── WORKSPACES PER user_id (>1 = re-onboarding) ───'
SELECT
    user_id,
    COUNT(*) AS workspace_count,
    STRING_AGG(brand_name || ' (' || LEFT(id::text, 8) || ')', ', '
        ORDER BY created_at) AS workspaces
FROM workspaces
GROUP BY user_id
HAVING COUNT(*) > 1
ORDER BY workspace_count DESC;

-- ─── 3. Junk-name detector — workspaces likely from typos / quick re-tests ──
\echo ''
\echo '─── SUSPICIOUS brand_name VALUES ───'
SELECT
    id, user_id, brand_name, created_at,
    (SELECT COUNT(*) FROM workspace_competitors c
        WHERE c.workspace_id = workspaces.id) AS competitors,
    (SELECT COUNT(*) FROM analysis_results a
        WHERE a.workspace_id = workspaces.id) AS analyses
FROM workspaces
WHERE LOWER(brand_name) IN ('test', 'x', 'shoe', 'demo', 'asdf', '...', '')
   OR LENGTH(TRIM(brand_name)) <= 2
   OR brand_name ~ '^[0-9]+$'
ORDER BY created_at DESC;

-- ─── 4. Confirm the two known-good workspaces are healthy ───────────────────
\echo ''
\echo '─── OMI + NIKE (the keepers — should both have data) ───'
SELECT
    id, brand_name, brand_category, created_at,
    (SELECT COUNT(*) FROM workspace_competitors c WHERE c.workspace_id = w.id) AS comp,
    (SELECT COUNT(*) FROM analysis_results a WHERE a.workspace_id = w.id) AS analyses
FROM workspaces w
WHERE id::text IN (
    '0cf0e691-89f4-46f5-8c6f-ad227339e600',  -- OMI (per handoff §7)
    'cfadc29c-3016-4177-afe9-b08cfc068a9b'   -- Nike (active test workspace)
);

-- =============================================================================
-- 5. DEDUPE — DO NOT RUN UNTIL Will confirms the keep/drop list from §1
-- =============================================================================
-- Suggested workflow:
--   1. Run §1-4 above. Paste output to Will.
--   2. Will picks IDs to drop, edits the array below.
--   3. Run inside a transaction; verify counts; then COMMIT (or ROLLBACK).
--   4. CASCADE deletes will wipe: workspace_competitors, platform_connections,
--      analysis_results, scraped_brand_profiles, scraped_products, alerts,
--      deep_dive_jobs, analysis_jobs, weekly_briefs, content_recommendations,
--      product_opportunities, white_space_opportunities (when those exist).
--
-- BEGIN;
--
-- -- Show what's about to die
-- SELECT id, user_id, brand_name, created_at FROM workspaces
-- WHERE id::text IN (
--     'PUT-DUPE-ID-1-HERE',
--     'PUT-DUPE-ID-2-HERE',
--     'PUT-DUPE-ID-3-HERE',
--     'PUT-DUPE-ID-4-HERE'
-- );
--
-- -- Confirm cascade impact (run AFTER selecting the IDs above)
-- SELECT 'competitors' AS table, COUNT(*) FROM workspace_competitors
--     WHERE workspace_id::text IN ('PUT-DUPE-ID-1', 'PUT-DUPE-ID-2', 'PUT-DUPE-ID-3', 'PUT-DUPE-ID-4')
-- UNION ALL
-- SELECT 'analyses', COUNT(*) FROM analysis_results
--     WHERE workspace_id::text IN ('PUT-DUPE-ID-1', 'PUT-DUPE-ID-2', 'PUT-DUPE-ID-3', 'PUT-DUPE-ID-4')
-- UNION ALL
-- SELECT 'scrapes', COUNT(*) FROM scraped_brand_profiles
--     WHERE workspace_id::text IN ('PUT-DUPE-ID-1', 'PUT-DUPE-ID-2', 'PUT-DUPE-ID-3', 'PUT-DUPE-ID-4');
--
-- -- The actual delete (uncomment after verifying above)
-- DELETE FROM workspaces
-- WHERE id::text IN (
--     'PUT-DUPE-ID-1-HERE',
--     'PUT-DUPE-ID-2-HERE',
--     'PUT-DUPE-ID-3-HERE',
--     'PUT-DUPE-ID-4-HERE'
-- );
--
-- -- Sanity check: confirm OMI + Nike are still alive
-- SELECT id, brand_name FROM workspaces
-- WHERE id::text IN (
--     '0cf0e691-89f4-46f5-8c6f-ad227339e600',
--     'cfadc29c-3016-4177-afe9-b08cfc068a9b'
-- );
-- -- Expected: 2 rows
--
-- COMMIT;  -- only if everything above looks right; otherwise ROLLBACK;
