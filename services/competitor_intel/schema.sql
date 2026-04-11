-- Run this on your PostgreSQL database to set up the Rebase SaaS schema.
-- Command: psql -U postgres -d rebase -f services/competitor-intel/schema.sql

-- Industries (bag, beauty, etc.)
CREATE TABLE IF NOT EXISTS industries (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(50) UNIQUE NOT NULL,
  name_zh VARCHAR(100) NOT NULL,
  name_en VARCHAR(100) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed the bag industry (first industry we support)
INSERT INTO industries (slug, name_zh, name_en)
VALUES ('bag', '箱包', 'Handbags & Accessories')
ON CONFLICT (slug) DO NOTHING;

-- Self-serve customers
CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  brand_name VARCHAR(255) NOT NULL,
  brand_name_en VARCHAR(255),
  industry_id INTEGER REFERENCES industries(id),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  role VARCHAR(20) DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  last_login TIMESTAMPTZ
);

-- Brands in each industry (shared universe — same data for all customers in an industry)
CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  industry_id INTEGER REFERENCES industries(id),
  xhs_keyword VARCHAR(255),
  douyin_keyword VARCHAR(255),
  tmall_store VARCHAR(255),
  badge VARCHAR(50),
  group_key VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(name, industry_id)
);

-- Raw scraped data — one row per brand per scrape date
CREATE TABLE IF NOT EXISTS brand_snapshots (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
  scrape_date DATE NOT NULL,
  xhs_status VARCHAR(20) DEFAULT 'pending',
  douyin_status VARCHAR(20) DEFAULT 'pending',
  sycm_status VARCHAR(20) DEFAULT 'skipped',
  raw_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, scrape_date)
);

-- Computed scores (momentum, threat, willingness-to-pay)
CREATE TABLE IF NOT EXISTS brand_scores (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
  score_date DATE NOT NULL,
  momentum_score FLOAT DEFAULT 0,
  threat_index FLOAT DEFAULT 0,
  wtp_score FLOAT DEFAULT 0,
  gtm_signals JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, score_date)
);

-- AI-generated narratives and action items
CREATE TABLE IF NOT EXISTS brand_narratives (
  id SERIAL PRIMARY KEY,
  brand_id INTEGER REFERENCES brands(id) ON DELETE CASCADE,
  narrative_date DATE NOT NULL,
  strategic_summary TEXT DEFAULT '',
  action_items JSONB DEFAULT '[]',
  brand_detail JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(brand_id, narrative_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_brand_snapshots_date ON brand_snapshots(scrape_date DESC);
CREATE INDEX IF NOT EXISTS idx_brand_scores_date ON brand_scores(score_date DESC);
CREATE INDEX IF NOT EXISTS idx_brand_narratives_date ON brand_narratives(narrative_date DESC);
CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
