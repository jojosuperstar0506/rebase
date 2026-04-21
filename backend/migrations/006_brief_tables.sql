-- 006_brief_tables.sql
--
-- Tables introduced for the Brief-centric rebuild (architecture v3).
-- Each corresponds to one of the new backend pipelines:
--
--   weekly_briefs              ← brand_positioning_pipeline (verdict + 3 moves per week)
--   content_recommendations    ← gtm_content_pipeline (Douyin/XHS drafts)
--   product_opportunities      ← product_opportunity_pipeline (concepts to evaluate)
--   white_space_opportunities  ← white_space_pipeline (uncontested dimensions)
--
-- Domain rollup scores (consumer_domain / product_domain / marketing_domain)
-- live in the existing analysis_results table — no new table needed.
-- They're written by domain_aggregation_pipeline.
--
-- Safe to re-run: every CREATE uses IF NOT EXISTS.

-- ─── Weekly briefs ───────────────────────────────────────────────────────
-- One row per workspace per ISO-week.
-- verdict + moves are denormalised JSONB so the API can return the full
-- brief shape without joins. content + product live in sibling tables so
-- they can be status-mutated independently.
CREATE TABLE IF NOT EXISTS weekly_briefs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    week_of      DATE NOT NULL,                        -- ISO Monday, e.g. 2026-04-19
    verdict      JSONB NOT NULL,                       -- { headline, sentence, trend, top_action }
    moves        JSONB NOT NULL,                       -- BriefMove[] — array of 3 events
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (workspace_id, week_of)
);

CREATE INDEX IF NOT EXISTS idx_weekly_briefs_ws_week
    ON weekly_briefs (workspace_id, week_of DESC);

-- ─── Content recommendations (Douyin / XHS drafts) ───────────────────────
-- Multiple drafts per brief. Status is mutated independently so users can
-- mark "posted" without regenerating the whole brief.
CREATE TABLE IF NOT EXISTS content_recommendations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    week_of         DATE NOT NULL,
    platform        TEXT NOT NULL DEFAULT 'douyin' CHECK (platform IN ('douyin', 'xhs')),
    title           TEXT NOT NULL,
    hook_3s         TEXT,
    main_15s        TEXT,
    cta_3s          TEXT,
    post_title      TEXT,                              -- XHS-specific, null for Douyin
    post_body       TEXT,                              -- XHS-specific, null for Douyin
    hashtags        TEXT[] NOT NULL DEFAULT '{}',
    reasoning       TEXT,
    why_now         TEXT,
    based_on        TEXT,                              -- which move / signal inspired this
    status          TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'posted', 'dismissed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_recs_ws_week
    ON content_recommendations (workspace_id, week_of DESC);
CREATE INDEX IF NOT EXISTS idx_content_recs_status
    ON content_recommendations (workspace_id, status)
    WHERE status = 'draft';  -- partial index for the common "show me drafts" query

-- ─── Product opportunities ───────────────────────────────────────────────
-- Typically 1 per week per workspace, but schema supports multiple.
-- signals is JSONB array of {label, value} pairs, grounded in real scrape
-- data to prevent LLM hallucination at inspection time.
CREATE TABLE IF NOT EXISTS product_opportunities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    week_of         DATE NOT NULL,
    concept_name    TEXT NOT NULL,
    positioning     TEXT NOT NULL,
    why_now         TEXT NOT NULL,
    signals         JSONB NOT NULL DEFAULT '[]'::jsonb,   -- [{label, value}, ...]
    target_price    TEXT,
    target_channels TEXT[] NOT NULL DEFAULT '{}',
    launch_timeline TEXT,
    status          TEXT NOT NULL DEFAULT 'proposed'
                    CHECK (status IN ('proposed', 'accepted', 'dismissed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_opps_ws_week
    ON product_opportunities (workspace_id, week_of DESC);

-- ─── White space opportunities ───────────────────────────────────────────
-- Uncontested dimensions / price bands / keywords / channels. 2-4 per week.
-- opportunity_score is 0-100; supporting_data is JSONB array so we can
-- optionally link out to source URLs in the UI drill-down.
CREATE TABLE IF NOT EXISTS white_space_opportunities (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id      UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    week_of           DATE NOT NULL,
    title             TEXT NOT NULL,
    summary           TEXT NOT NULL,
    category          TEXT NOT NULL
                      CHECK (category IN ('dimension', 'pricing', 'keyword', 'channel')),
    opportunity_score INTEGER NOT NULL CHECK (opportunity_score BETWEEN 0 AND 100),
    reasoning         TEXT,
    supporting_data   JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{label, value, source_url?}, ...]
    suggested_action  TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whitespace_ws_week
    ON white_space_opportunities (workspace_id, week_of DESC);
