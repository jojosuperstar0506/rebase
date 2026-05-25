-- Migration 014 — allow 'apify_easyapi' as a valid data_confidence value
-- on scraped_products.
--
-- Issue #62 (Apify migration): services/competitor_intel/scrapers/apify_client.py
-- writes data_confidence='apify_easyapi' to distinguish Apify-sourced products
-- from the legacy in-house scraper's 'direct_scrape' tag. The original CHECK
-- constraint in migration 001 only allowed ('direct_scrape', 'estimated', 'stale'),
-- which caused save_products() to crash with CheckViolation on the first real
-- ECS Apify run.
--
-- Caught by the Phase E smoke test on 2026-05-25. The brand profile saved fine
-- (scraped_brand_profiles has no data_confidence column), but 50 notes from the
-- user_posts actor were lost to the constraint violation.
--
-- Idempotent: DROP IF EXISTS so safe to re-run on partially-applied state.

ALTER TABLE scraped_products
  DROP CONSTRAINT IF EXISTS scraped_products_data_confidence_check;

ALTER TABLE scraped_products
  ADD CONSTRAINT scraped_products_data_confidence_check
    CHECK (data_confidence IN (
      'direct_scrape',
      'estimated',
      'stale',
      'apify_easyapi'
    ));

-- Verify (run by migrate.js after each migration):
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conname = 'scraped_products_data_confidence_check';
-- Expected: includes all 4 values.
