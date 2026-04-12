-- Data retention: keep 90 days of scraped data, 180 days of analysis results.
-- Run periodically (weekly cron or on each pipeline run) to keep DB lean.

-- Delete scraped product/note data older than 90 days
DELETE FROM scraped_products WHERE scraped_at < NOW() - INTERVAL '90 days';

-- Delete scraped brand profiles older than 90 days
-- (keep at least 2 per brand for growth comparison, even if older than 90 days)
DELETE FROM scraped_brand_profiles
WHERE scraped_at < NOW() - INTERVAL '90 days'
AND id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY brand_name, platform ORDER BY scraped_at DESC) AS rn
    FROM scraped_brand_profiles
  ) ranked WHERE rn <= 2
);

-- Delete analysis results older than 180 days
-- (keep latest per metric_type per competitor for historical reference)
DELETE FROM analysis_results
WHERE analyzed_at < NOW() - INTERVAL '180 days'
AND id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY workspace_id, competitor_name, metric_type ORDER BY analyzed_at DESC) AS rn
    FROM analysis_results
  ) ranked WHERE rn <= 1
);

-- Delete completed analysis jobs older than 30 days
DELETE FROM ci_analysis_jobs WHERE created_at < NOW() - INTERVAL '30 days' AND status IN ('complete', 'failed');

-- Delete completed deep dive jobs older than 30 days
DELETE FROM ci_deep_dive_jobs WHERE created_at < NOW() - INTERVAL '30 days' AND status IN ('complete', 'failed');
