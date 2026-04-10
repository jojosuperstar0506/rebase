-- =============================================================================
-- TASK-01: Competitive Intelligence Schema
-- Creates all CI tables for the Rebase platform.
-- Run via: node backend/migrate.js
-- Compatible with PostgreSQL 13+
-- =============================================================================

-- Enable pgcrypto for gen_random_uuid() (built-in only in PG 14+)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Workspaces (one per user, created from onboarding data)
CREATE TABLE IF NOT EXISTS workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  brand_category TEXT,
  brand_price_range JSONB,
  brand_platforms JSONB,        -- {"xhs": "keyword", "taobao": "store_url", ...}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Competitors tracked by each workspace
CREATE TABLE IF NOT EXISTS workspace_competitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  brand_name TEXT NOT NULL,
  tier TEXT DEFAULT 'watchlist' CHECK (tier IN ('watchlist', 'landscape')),
  platform_ids JSONB,           -- {"xhs": "keyword", "taobao": "store_id", ...}
  added_via TEXT DEFAULT 'manual' CHECK (added_via IN ('onboarding', 'manual', 'ai_suggestion', 'link_paste')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, brand_name)
);

-- User's connected platform accounts (for authenticated scraping)
CREATE TABLE IF NOT EXISTS platform_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,        -- 'sycm' | 'xhs_analytics' | 'douyin_compass'
  cookies_encrypted TEXT,        -- AES-256-GCM encrypted cookie string
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'error')),
  last_successful_scrape TIMESTAMPTZ,
  last_auth_check TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, platform)
);

-- Scraped product data (all tiers)
CREATE TABLE IF NOT EXISTS scraped_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  price DECIMAL,
  original_price DECIMAL,
  sales_volume INT,
  review_count INT,
  rating DECIMAL,
  category TEXT,
  material_tags TEXT[],
  image_urls TEXT[],
  product_url TEXT,
  scrape_tier TEXT NOT NULL CHECK (scrape_tier IN ('landscape', 'watchlist', 'deep_dive')),
  data_confidence TEXT DEFAULT 'direct_scrape' CHECK (data_confidence IN ('direct_scrape', 'estimated', 'stale')),
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  scraped_date DATE DEFAULT CURRENT_DATE
);

-- Dedup constraint: one scrape per product per platform per day
CREATE UNIQUE INDEX IF NOT EXISTS idx_scraped_products_dedup
  ON scraped_products(platform, product_id, scraped_date);

-- Scraped brand profiles
CREATE TABLE IF NOT EXISTS scraped_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform TEXT NOT NULL,
  brand_name TEXT NOT NULL,
  follower_count INT,
  total_products INT,
  avg_price DECIMAL,
  price_range JSONB,
  engagement_metrics JSONB,
  content_metrics JSONB,
  scrape_tier TEXT NOT NULL CHECK (scrape_tier IN ('landscape', 'watchlist', 'deep_dive')),
  raw_dimensions JSONB,          -- Full 7-dimension data for deep dives
  scraped_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis results (scored metrics per competitor per workspace)
CREATE TABLE IF NOT EXISTS analysis_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  competitor_name TEXT NOT NULL,
  metric_type TEXT NOT NULL,      -- 'momentum' | 'threat' | 'wtp' | 'brand_equity' | 'content_effectiveness'
  metric_version TEXT NOT NULL,   -- 'v1.0'
  score DECIMAL,
  raw_inputs JSONB,
  ai_narrative TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-brand analysis (per workspace)
CREATE TABLE IF NOT EXISTS analysis_narratives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  narrative TEXT,
  action_items JSONB,             -- [{title, description, dept, priority}]
  analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

-- User CI preferences
CREATE TABLE IF NOT EXISTS user_ci_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  dashboard_layout JSONB,
  alert_thresholds JSONB,
  visible_metrics TEXT[],
  default_time_range TEXT DEFAULT '30d',
  UNIQUE(workspace_id)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_workspace_competitors_workspace ON workspace_competitors(workspace_id);
CREATE INDEX IF NOT EXISTS idx_scraped_products_brand ON scraped_products(brand_name, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_scraped_products_platform ON scraped_products(platform, brand_name);
CREATE INDEX IF NOT EXISTS idx_scraped_brand_profiles_brand ON scraped_brand_profiles(brand_name, scraped_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_results_workspace ON analysis_results(workspace_id, competitor_name);
CREATE INDEX IF NOT EXISTS idx_platform_connections_workspace ON platform_connections(workspace_id);
