-- 011_workspace_category_l2.sql
--
-- Two-level product category for the onboarding wizard v2.
--
--   brand_category_l1     major category slug — 'bags' | 'footwear' |
--                         'apparel' | 'beauty' | 'jewelry' | 'home'
--   brand_subcategories   JSONB array of the selected level-2 category
--                         strings, e.g. ["女包", "双肩包"]
--
-- The legacy single-string column `brand_category` is kept — the brand
-- endpoint sets it to the first selected sub-category so the existing
-- bag-tuned scraping / scoring pipeline keeps working unchanged.
-- Extending that pipeline to non-bag verticals is tracked as TODO.md F10.

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS brand_category_l1 TEXT;

ALTER TABLE workspaces
    ADD COLUMN IF NOT EXISTS brand_subcategories JSONB;

-- Backfill existing workspaces: their flat brand_category is a bag
-- sub-category, so they all belong to the 'bags' major category.
UPDATE workspaces
   SET brand_category_l1 = 'bags',
       brand_subcategories = jsonb_build_array(brand_category)
 WHERE brand_category IS NOT NULL
   AND brand_category <> ''
   AND brand_category_l1 IS NULL;
