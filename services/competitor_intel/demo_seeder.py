"""
demo_seeder.py — populate one workspace with curated demo data.

WHEN TO USE
-----------
You're recording a screen-share demo for a client and need every tab in
the Rebase CI product to look fully populated. The production scrapers
either haven't run for this workspace yet, can't run (XHS auth-walled),
or have only partial data — leaving the dashboard with empty grids,
"Coverage pending" badges, and missing Brief verdicts. That's not what
you want a prospect to see in the first 10 minutes.

This module bypasses the entire scrape → score → narrate pipeline and
writes realistic curated data directly to the production tables. The
existing composite_indices compute layer then derives the 12 indices
from the seeded analysis_results, so every part of the dashboard
renders the SAME way it would for real data — Brief verdict + 3 moves,
content drafts, product opportunity, white space, all 16 metrics with
"Why this score?" expandables, all 12 composite indices, the scatter
plot, the per-brand AI insights panel.

DATA SHAPE
----------
Demo workspace = "TORY BURCH" (mid-premium 女包) tracking 6 competitors:
    COACH (dominant top-tier)
    MICHAEL KORS (similar premium imports)
    Dissona (Chinese premium, rising)
    MCM (luxury aspirational, declining)
    古良吉吉 (Chinese boutique, fast-rising)
    VALENTINOORLANDI (mid-tier import, steady)

Each brand has a coherent "personality" across the 16 metrics — COACH
leads in nearly everything, 古良吉吉 lags in scale but spikes on
Innovation + Trend Capture, MCM has high Pricing Power but losing
Brand Heat, etc. The Brief verdict tells the strategic story:
"TORY BURCH is being squeezed between COACH dominance and 古良吉吉
challenger momentum." Three moves name specific competitor actions
with realistic numbers. Designed for a 10-15 min screen recording.

USAGE
-----
On ECS (after `git pull` so this file is present):

    cd ~/rebase
    set -a && source backend/.env && set +a

    # Find the workspace UUID for invite code RB-TORYBU-841E. The auth
    # flow signs JWT with sub = phone (backend) or 'user' (Vercel proxy).
    # Either way, the most-recent workspace for that user works:
    psql "$DATABASE_URL" -c "SELECT id, brand_name, user_id, created_at FROM workspaces ORDER BY created_at DESC LIMIT 10"

    # Then seed:
    python -m services.competitor_intel.demo_seeder --workspace-id <UUID>

Re-running is safe — every section is DELETE-then-INSERT inside one
transaction. Demo data only touches the targeted workspace; other
workspaces are untouched (except that the 6 competitor brand names
have their `scraped_brand_profiles` and `scraped_products` rows
overwritten — those tables are keyed by brand_name not workspace, so
the demo brands' data gets refreshed for everyone querying them).

ISOLATION GUARANTEE
-------------------
Every table this seeder writes to is workspace-keyed (workspace_id is
part of the WHERE / DELETE / INSERT clauses). Other users' workspaces
are never touched.

scraped_brand_profiles and scraped_products are deliberately NOT
seeded — they're keyed by brand_name (not workspace_id), so writing
demo follower counts / product prices for COACH/MK/etc would leak into
ANY other workspace that happens to track those brands. Trade-off:
Innovation Score and Promotional Discipline (2 of the 12 composite
indices) will compute from neutral defaults instead of curated product
data. The other 10 indices, Brief, content drafts, product opportunity,
white space — all fully populated. Fine for a screen-recording demo;
the scatter plot will show all 7 brands at distinct positions.

SAFETY
------
By default the seeder refuses to run unless --confirm is passed.
This is a destructive operation against the targeted workspace's CI
data (NOT against other workspaces — see ISOLATION GUARANTEE above).
"""

import argparse
import json
import sys
import traceback
from datetime import date, datetime, timedelta, timezone

from .db_bridge import get_conn


# ─── Workspace identity ──────────────────────────────────────────────────

DEMO_OWN_BRAND = "TORY BURCH"
DEMO_CATEGORY = "女包"
DEMO_PRICE_RANGE = {"min": 1500, "max": 4500}
DEMO_PLATFORMS = ["淘宝/天猫", "京东", "小红书", "抖音"]


def iso_monday(d=None):
    """Return Monday of the given date's ISO week (UTC)."""
    d = d or datetime.now(timezone.utc).date()
    return d - timedelta(days=d.weekday())


CURRENT_WEEK = iso_monday()
PRIOR_WEEK = CURRENT_WEEK - timedelta(days=7)


# ─── Competitors ─────────────────────────────────────────────────────────
# Each entry carries:
#   - identity (name, tier, platform_ids)
#   - scrape data (follower_count, engagement_metrics, content_metrics)
#   - products (4-5 representative SKUs with realistic price + sales)
#   - per-metric raw_inputs JSONB rich enough for compute_* functions
#   - brand_insight bilingual narrative (rendered as Analytics' AI insight panel)
#
# Scores grounded in Douyin Compass screenshots from the user — GMV bands,
# AOV, conversion rates. Raw_inputs filled with the fields that
# composite_indices' compute functions actually read (voice_volume's
# growth_rate, mindshare's sentiment_ratio + top_ugc, content_strategy's
# engagement_per_note, etc.).

DEMO_COMPETITORS = [
    {
        "name": "COACH",
        "tier": "watchlist",
        "platform_ids": {"xhs": "COACH", "douyin": "coach", "taobao": "coach"},
        "added_via": "manual",
        "follower_count": 1_520_000,
        "engagement_metrics": {"total_likes": 8_400_000, "total_notes": 12_400, "avg_comments": 32},
        "content_metrics": {"total_notes": 12_400, "video_count": 4_800},
        "products": [
            {"name": "COACH Tabby 26 Shoulder Bag", "price": 2890, "original_price": 4250, "sales_volume": 8200, "category": "shoulder_bag", "material_tags": ["真皮", "头层牛皮"]},
            {"name": "COACH Pillow Tabby 18", "price": 2390, "original_price": 3890, "sales_volume": 12400, "category": "shoulder_bag", "material_tags": ["真皮"]},
            {"name": "COACH Brooklyn 28 Tote", "price": 3290, "original_price": 4890, "sales_volume": 5400, "category": "tote", "material_tags": ["真皮", "帆布拼接"]},
            {"name": "COACH Field 30 Tote", "price": 2790, "original_price": 4290, "sales_volume": 6800, "category": "tote", "material_tags": ["真皮"]},
            {"name": "COACH Cassie 19", "price": 1990, "original_price": 3290, "sales_volume": 14200, "category": "crossbody", "material_tags": ["真皮"]},
        ],
        "metrics": {
            "voice_volume":        {"score": 88, "raw": {"growth_rate": 12, "follower_growth": 8, "voice_share_pct": 28, "content_growth": 18, "engagement_growth": 22, "platform_breakdown": {"douyin": {"followers": 1_520_000, "follower_growth": 8}}}},
            "consumer_mindshare":  {"score": 84, "raw": {"sentiment_ratio": 0.78, "engagement_share_pct": 26, "ugc_ratio": 0.62, "avg_comments_per_note": 32, "positive_keywords": ["经典", "百搭", "保值", "送礼", "通勤", "回购"], "negative_keywords": ["假货"], "top_ugc": ["coach 经典款必入回购", "coach 通勤包推荐", "断货款卖断货已售罄回购的"]}},
            "content_strategy":    {"score": 82, "raw": {"engagement_per_note": 678, "volume_share_pct": 24, "n_content_types": 5, "posting_consistency_cv": 0.32, "total_notes": 12400, "total_likes": 8_400_000}},
            "design_profile":      {"score": 76, "raw": {"material_diversity": 8, "silhouette_count": 12, "n_signature_designs": 4}},
            "kol_strategy":        {"score": 81, "raw": {"n_kols": 38, "tier_breakdown": {"nano": 12, "micro": 14, "mid": 8, "macro": 4}, "kol_count": 38}},
            "trending_products":   {"score": 79, "raw": {"top_products": [{"product_name": "Tabby 26", "sales_volume": 8200, "recent_growth": 18}, {"product_name": "Pillow 18", "sales_volume": 12400, "recent_growth": 12}, {"product_name": "Cassie 19", "sales_volume": 14200, "recent_growth": -4}], "new_launches": ["Tabby 32", "Brooklyn 35"], "total_products": 28}},
            "launch_frequency":    {"score": 74, "raw": {"avg_per_week": 1.2, "acceleration_pct": 5, "consistency_cv": 0.4, "total_launches_90d": 14}},
            "price_positioning":   {"score": 72, "raw": {"avg_price": 2480, "premium_ratio": 78, "avg_discount_depth": 32, "price_band_distribution": {"<1000": 5, "1000-2000": 25, "2000-3000": 38, "3000-4000": 22, ">4000": 10}}},
            "wtp":                 {"score": 76, "raw": {"price_premium": 18, "sales_outperformance": 32, "cap_hit": False, "raw_score_uncapped": 76}},
            "keywords":            {"score": 80, "raw": {"keyword_cloud": {"经典": 480, "通勤": 390, "保值": 280, "送礼": 220, "百搭": 350, "中性": 180}, "trending": [{"keyword": "中性配色"}, {"keyword": "迷你包"}, {"keyword": "信使包"}], "categories": {"shoulder_bag": 6, "tote": 4, "crossbody": 3}, "total_products_analyzed": 28}},
            "consumer_domain":     {"score": 84, "raw": {"contributing": ["consumer_mindshare", "keywords", "threat"]}},
            "product_domain":      {"score": 76, "raw": {"contributing": ["trending_products", "design_profile", "price_positioning", "launch_frequency", "wtp"]}},
            "marketing_domain":    {"score": 82, "raw": {"contributing": ["voice_volume", "content_strategy", "kol_strategy"]}},
            "momentum":            {"score": 81, "raw": {"score": 81, "version": "demo-v1"}},
            "threat":              {"score": 88, "raw": {"score": 88, "version": "demo-v1"}},
        },
        "brand_insight": {
            "zh": "COACH 凭借奥莱矩阵 + 经典款心智占据轻奢头部，单 SKU GMV 破千万/月。Tabby 与 Pillow 系列累计转化率 8%，远超类目均值。建议在通勤场景关键词上紧密跟随其打法，并在 1500-2000 元价格带主动差异化。",
            "en": "COACH leads premium with its outlet matrix + heritage equity (single-SKU GMV >¥10M/mo). Tabby and Pillow lines hit 8% conversion — well above category. Recommended: shadow their commuter-keyword playbook and actively differentiate in the ¥1,500-2,000 price band.",
        },
    },
    {
        "name": "MICHAEL KORS",
        "tier": "watchlist",
        "platform_ids": {"xhs": "MICHAEL KORS", "douyin": "michaelkors", "taobao": "michaelkors"},
        "added_via": "manual",
        "follower_count": 620_000,
        "engagement_metrics": {"total_likes": 2_180_000, "total_notes": 5_800, "avg_comments": 18},
        "content_metrics": {"total_notes": 5_800, "video_count": 2_100},
        "products": [
            {"name": "MK Mercer Medium Satchel", "price": 1890, "original_price": 3290, "sales_volume": 4200, "category": "satchel", "material_tags": ["真皮"]},
            {"name": "MK Hamilton Legacy Tote", "price": 2390, "original_price": 4190, "sales_volume": 3100, "category": "tote", "material_tags": ["真皮"]},
            {"name": "MK Cece Mini Crossbody", "price": 1290, "original_price": 2390, "sales_volume": 6800, "category": "crossbody", "material_tags": ["真皮"]},
            {"name": "MK Greenwich Bucket Bag", "price": 1690, "original_price": 2890, "sales_volume": 2400, "category": "bucket"},
        ],
        "metrics": {
            "voice_volume":        {"score": 62, "raw": {"growth_rate": -4, "follower_growth": -2, "voice_share_pct": 11, "content_growth": -8, "engagement_growth": -3, "platform_breakdown": {"douyin": {"followers": 620_000, "follower_growth": -2}}}},
            "consumer_mindshare":  {"score": 58, "raw": {"sentiment_ratio": 0.62, "engagement_share_pct": 9, "ugc_ratio": 0.48, "avg_comments_per_note": 18, "positive_keywords": ["大牌", "百搭"], "negative_keywords": ["过时", "降价"], "top_ugc": ["mk 包还值得入吗", "mk 经典款"]}},
            "content_strategy":    {"score": 56, "raw": {"engagement_per_note": 248, "volume_share_pct": 9, "n_content_types": 3, "posting_consistency_cv": 0.6, "total_notes": 5800, "total_likes": 2_180_000}},
            "design_profile":      {"score": 60, "raw": {"material_diversity": 5, "silhouette_count": 7, "n_signature_designs": 2}},
            "kol_strategy":        {"score": 54, "raw": {"n_kols": 18, "tier_breakdown": {"nano": 8, "micro": 6, "mid": 3, "macro": 1}, "kol_count": 18}},
            "trending_products":   {"score": 52, "raw": {"top_products": [{"product_name": "Cece Mini", "sales_volume": 6800, "recent_growth": -2}, {"product_name": "Mercer", "sales_volume": 4200, "recent_growth": -8}], "new_launches": ["Greenwich Bucket"], "total_products": 18}},
            "launch_frequency":    {"score": 52, "raw": {"avg_per_week": 0.6, "acceleration_pct": -10, "consistency_cv": 0.7, "total_launches_90d": 6}},
            "price_positioning":   {"score": 64, "raw": {"avg_price": 1850, "premium_ratio": 58, "avg_discount_depth": 42, "price_band_distribution": {"<1000": 12, "1000-2000": 48, "2000-3000": 28, "3000-4000": 10, ">4000": 2}}},
            "wtp":                 {"score": 58, "raw": {"price_premium": 4, "sales_outperformance": 8, "cap_hit": False, "raw_score_uncapped": 58}},
            "keywords":            {"score": 60, "raw": {"keyword_cloud": {"经典": 180, "通勤": 220, "美式": 140, "logo": 110}, "trending": [{"keyword": "vintage"}], "categories": {"satchel": 4, "tote": 3, "crossbody": 4}, "total_products_analyzed": 18}},
            "consumer_domain":     {"score": 60, "raw": {}},
            "product_domain":      {"score": 56, "raw": {}},
            "marketing_domain":    {"score": 57, "raw": {}},
            "momentum":            {"score": 48, "raw": {"score": 48, "version": "demo-v1"}},
            "threat":              {"score": 58, "raw": {"score": 58, "version": "demo-v1"}},
        },
        "brand_insight": {
            "zh": "MICHAEL KORS 在中国市场进入'轻奢失宠'阶段——折扣加深 42% 但销量不增，Z 世代心智份额持续下滑。其经典 Hamilton 与 Mercer 销量同比 -8%，表明设计未跟上 2025 后审美。短期内对 TORY BURCH 威胁有限，但需警惕其奥莱清仓对中端价格带的冲击。",
            "en": "MICHAEL KORS is entering a 'fading-light-luxury' phase in China — discounts deepened to 42% but volume isn't responding, Gen-Z mindshare is steadily declining. Hamilton and Mercer classics down 8% YoY, suggesting design hasn't kept pace with post-2025 aesthetics. Limited near-term threat to TORY BURCH, but watch their outlet clearance pressure on the mid-price band.",
        },
    },
    {
        "name": "Dissona",
        "tier": "watchlist",
        "platform_ids": {"xhs": "Dissona", "douyin": "dissona", "taobao": "dissona"},
        "added_via": "manual",
        "follower_count": 480_000,
        "engagement_metrics": {"total_likes": 3_400_000, "total_notes": 8_200, "avg_comments": 28},
        "content_metrics": {"total_notes": 8_200, "video_count": 3_400},
        "products": [
            {"name": "Dissona 都市 Tote Medium", "price": 1490, "original_price": 1890, "sales_volume": 9800, "category": "tote", "material_tags": ["真皮"]},
            {"name": "Dissona 通勤手提包", "price": 1290, "original_price": 1690, "sales_volume": 12400, "category": "satchel", "material_tags": ["真皮", "头层牛皮"]},
            {"name": "Dissona 信使斜挎包", "price": 990, "original_price": 1390, "sales_volume": 14800, "category": "crossbody", "material_tags": ["真皮"]},
            {"name": "Dissona 浪漫购物袋", "price": 1690, "original_price": 2190, "sales_volume": 6200, "category": "tote", "material_tags": ["真皮"]},
        ],
        "metrics": {
            "voice_volume":        {"score": 71, "raw": {"growth_rate": 22, "follower_growth": 18, "voice_share_pct": 14, "content_growth": 28, "engagement_growth": 32, "platform_breakdown": {"douyin": {"followers": 480_000, "follower_growth": 18}}}},
            "consumer_mindshare":  {"score": 78, "raw": {"sentiment_ratio": 0.82, "engagement_share_pct": 14, "ugc_ratio": 0.71, "avg_comments_per_note": 28, "positive_keywords": ["回购", "性价比", "国货之光", "推荐", "送礼", "百搭"], "negative_keywords": [], "top_ugc": ["dissona 真的回购第三个了", "国货精品强推必入", "通勤包性价比之王"]}},
            "content_strategy":    {"score": 74, "raw": {"engagement_per_note": 414, "volume_share_pct": 16, "n_content_types": 4, "posting_consistency_cv": 0.28, "total_notes": 8200, "total_likes": 3_400_000}},
            "design_profile":      {"score": 68, "raw": {"material_diversity": 6, "silhouette_count": 9, "n_signature_designs": 3}},
            "kol_strategy":        {"score": 72, "raw": {"n_kols": 24, "tier_breakdown": {"nano": 10, "micro": 9, "mid": 4, "macro": 1}, "kol_count": 24}},
            "trending_products":   {"score": 76, "raw": {"top_products": [{"product_name": "信使斜挎", "sales_volume": 14800, "recent_growth": 24}, {"product_name": "通勤手提", "sales_volume": 12400, "recent_growth": 18}, {"product_name": "都市 Tote", "sales_volume": 9800, "recent_growth": 12}], "new_launches": ["浪漫系列限定色"], "total_products": 22}},
            "launch_frequency":    {"score": 78, "raw": {"avg_per_week": 1.4, "acceleration_pct": 22, "consistency_cv": 0.25, "total_launches_90d": 16}},
            "price_positioning":   {"score": 68, "raw": {"avg_price": 1320, "premium_ratio": 38, "avg_discount_depth": 22, "price_band_distribution": {"<1000": 18, "1000-2000": 64, "2000-3000": 16, "3000-4000": 2, ">4000": 0}}},
            "wtp":                 {"score": 64, "raw": {"price_premium": -8, "sales_outperformance": 28, "cap_hit": False, "raw_score_uncapped": 64}},
            "keywords":            {"score": 70, "raw": {"keyword_cloud": {"国货": 280, "通勤": 360, "性价比": 240, "回购": 320, "送礼": 180}, "trending": [{"keyword": "国货精品"}, {"keyword": "都市通勤"}, {"keyword": "回购率"}], "categories": {"satchel": 5, "tote": 4, "crossbody": 5}, "total_products_analyzed": 22}},
            "consumer_domain":     {"score": 76, "raw": {}},
            "product_domain":      {"score": 70, "raw": {}},
            "marketing_domain":    {"score": 72, "raw": {}},
            "momentum":            {"score": 78, "raw": {"score": 78, "version": "demo-v1"}},
            "threat":              {"score": 72, "raw": {"score": 72, "version": "demo-v1"}},
        },
        "brand_insight": {
            "zh": "Dissona 是国货精品女包代表，本周 NPS 类指标 +28%——客户复购语料密度达 18% 远超类目均值 6%。其'通勤手提包'单 SKU GMV 已逼近 TORY BURCH 同类产品 70%。建议跟进其会员忠诚度玩法与回购语种草节奏。",
            "en": "Dissona is the Chinese-premium handbag standard-bearer. NPS-style signals jumped +28% this week — customer rebuy phrase density hit 18% (vs 6% category avg). Their 'commuter satchel' single-SKU GMV is approaching ~70% of TORY BURCH's equivalent. Track their loyalty-program playbook and rebuy-language UGC cadence.",
        },
    },
    {
        "name": "MCM",
        "tier": "watchlist",
        "platform_ids": {"xhs": "MCM", "douyin": "mcm", "taobao": "mcm"},
        "added_via": "manual",
        "follower_count": 780_000,
        "engagement_metrics": {"total_likes": 1_840_000, "total_notes": 4_200, "avg_comments": 14},
        "content_metrics": {"total_notes": 4_200, "video_count": 1_500},
        "products": [
            {"name": "MCM Aren Backpack Medium", "price": 4290, "original_price": 6890, "sales_volume": 1800, "category": "backpack", "material_tags": ["Visetos涂层"]},
            {"name": "MCM Klassik Tote", "price": 5290, "original_price": 7890, "sales_volume": 1200, "category": "tote", "material_tags": ["Visetos涂层"]},
            {"name": "MCM Stark Mini Crossbody", "price": 2890, "original_price": 4290, "sales_volume": 2400, "category": "crossbody", "material_tags": ["Visetos涂层"]},
            {"name": "MCM Diamant Boston", "price": 4990, "original_price": 7290, "sales_volume": 980, "category": "boston", "material_tags": ["真皮"]},
        ],
        "metrics": {
            "voice_volume":        {"score": 54, "raw": {"growth_rate": -12, "follower_growth": -6, "voice_share_pct": 8, "content_growth": -14, "engagement_growth": -18, "platform_breakdown": {"douyin": {"followers": 780_000, "follower_growth": -6}}}},
            "consumer_mindshare":  {"score": 52, "raw": {"sentiment_ratio": 0.58, "engagement_share_pct": 7, "ugc_ratio": 0.41, "avg_comments_per_note": 14, "positive_keywords": ["奢侈", "送礼"], "negative_keywords": ["土", "过时", "假货", "不值"], "top_ugc": ["mcm 还有人在买吗", "mcm 双肩包过时了吗"]}},
            "content_strategy":    {"score": 48, "raw": {"engagement_per_note": 248, "volume_share_pct": 6, "n_content_types": 2, "posting_consistency_cv": 0.7, "total_notes": 4200, "total_likes": 1_840_000}},
            "design_profile":      {"score": 64, "raw": {"material_diversity": 4, "silhouette_count": 6, "n_signature_designs": 2}},
            "kol_strategy":        {"score": 44, "raw": {"n_kols": 12, "tier_breakdown": {"nano": 4, "micro": 5, "mid": 2, "macro": 1}, "kol_count": 12}},
            "trending_products":   {"score": 42, "raw": {"top_products": [{"product_name": "Stark Mini", "sales_volume": 2400, "recent_growth": -8}, {"product_name": "Aren Backpack", "sales_volume": 1800, "recent_growth": -14}], "new_launches": [], "total_products": 14}},
            "launch_frequency":    {"score": 38, "raw": {"avg_per_week": 0.3, "acceleration_pct": -22, "consistency_cv": 0.9, "total_launches_90d": 3}},
            "price_positioning":   {"score": 86, "raw": {"avg_price": 4380, "premium_ratio": 92, "avg_discount_depth": 36, "price_band_distribution": {"<1000": 0, "1000-2000": 4, "2000-3000": 18, "3000-4000": 24, ">4000": 54}}},
            "wtp":                 {"score": 84, "raw": {"price_premium": 78, "sales_outperformance": -22, "cap_hit": False, "raw_score_uncapped": 84}},
            "keywords":            {"score": 48, "raw": {"keyword_cloud": {"奢侈": 220, "Visetos": 180, "送礼": 140, "logo": 120}, "trending": [], "categories": {"backpack": 4, "tote": 3, "crossbody": 4, "boston": 3}, "total_products_analyzed": 14}},
            "consumer_domain":     {"score": 50, "raw": {}},
            "product_domain":      {"score": 64, "raw": {}},
            "marketing_domain":    {"score": 49, "raw": {}},
            "momentum":            {"score": 36, "raw": {"score": 36, "version": "demo-v1"}},
            "threat":              {"score": 52, "raw": {"score": 52, "version": "demo-v1"}},
        },
        "brand_insight": {
            "zh": "MCM 处于'高端褪色'阶段——溢价能力(¥4,380 客单价) 仍是同类最高，但销量同比 -14%、KOL 投放收缩 22%。Visetos 涂层经典款被年轻消费者贴上'土'与'过时'标签。短期内不构成直接威胁，但其客户群正向 TORY BURCH 这类'轻奢精致'方向迁移。",
            "en": "MCM is in 'fading-luxury' mode — pricing power (¥4,380 AOV) still tops the cohort, but volume is -14% YoY and KOL spend has contracted 22%. Visetos coated classics are being labeled 'dated' and 'tacky' by Gen-Z consumers. No direct near-term threat, but their customer base is migrating toward 'restrained-luxury' brands like TORY BURCH.",
        },
    },
    {
        "name": "古良吉吉",
        "tier": "watchlist",
        "platform_ids": {"xhs": "古良吉吉", "douyin": "guliangjiji", "taobao": "guliangjiji"},
        "added_via": "manual",
        "follower_count": 280_000,
        "engagement_metrics": {"total_likes": 4_800_000, "total_notes": 6_400, "avg_comments": 56},
        "content_metrics": {"total_notes": 6_400, "video_count": 2_800},
        "products": [
            {"name": "古良吉吉 月光宝盒手提", "price": 1280, "original_price": 1280, "sales_volume": 18200, "category": "satchel", "material_tags": ["真皮", "原创设计"]},
            {"name": "古良吉吉 × 国潮 IP 限定", "price": 1890, "original_price": 1890, "sales_volume": 6400, "category": "shoulder_bag", "material_tags": ["真皮", "联名款", "限量"]},
            {"name": "古良吉吉 早茶系列 Mini", "price": 980, "original_price": 980, "sales_volume": 14800, "category": "crossbody", "material_tags": ["真皮"]},
            {"name": "古良吉吉 城市漫游 Tote", "price": 1480, "original_price": 1480, "sales_volume": 8200, "category": "tote", "material_tags": ["真皮", "原创印花"]},
        ],
        "metrics": {
            "voice_volume":        {"score": 81, "raw": {"growth_rate": 48, "follower_growth": 32, "voice_share_pct": 18, "content_growth": 62, "engagement_growth": 78, "platform_breakdown": {"douyin": {"followers": 280_000, "follower_growth": 32}}}},
            "consumer_mindshare":  {"score": 86, "raw": {"sentiment_ratio": 0.91, "engagement_share_pct": 19, "ugc_ratio": 0.82, "avg_comments_per_note": 56, "positive_keywords": ["独家", "原创", "国潮", "联名", "限量", "种草", "回购", "必入"], "negative_keywords": [], "top_ugc": ["古良吉吉 月光宝盒首发抢到了", "国潮联名限量发售好惊艳", "原创设计独家闭眼买"]}},
            "content_strategy":    {"score": 79, "raw": {"engagement_per_note": 750, "volume_share_pct": 13, "n_content_types": 5, "posting_consistency_cv": 0.22, "total_notes": 6400, "total_likes": 4_800_000}},
            "design_profile":      {"score": 88, "raw": {"material_diversity": 12, "silhouette_count": 18, "n_signature_designs": 8}},
            "kol_strategy":        {"score": 76, "raw": {"n_kols": 32, "tier_breakdown": {"nano": 16, "micro": 12, "mid": 3, "macro": 1}, "kol_count": 32}},
            "trending_products":   {"score": 84, "raw": {"top_products": [{"product_name": "月光宝盒", "sales_volume": 18200, "recent_growth": 42}, {"product_name": "国潮联名", "sales_volume": 6400, "recent_growth": 88}, {"product_name": "早茶 Mini", "sales_volume": 14800, "recent_growth": 28}], "new_launches": ["国潮 IP 联名 vol.3", "城市漫游 city walk 系列", "限量手作"], "total_products": 32}},
            "launch_frequency":    {"score": 86, "raw": {"avg_per_week": 2.4, "acceleration_pct": 38, "consistency_cv": 0.18, "total_launches_90d": 28}},
            "price_positioning":   {"score": 58, "raw": {"avg_price": 1290, "premium_ratio": 22, "avg_discount_depth": 8, "price_band_distribution": {"<1000": 24, "1000-2000": 68, "2000-3000": 8, "3000-4000": 0, ">4000": 0}}},
            "wtp":                 {"score": 68, "raw": {"price_premium": -22, "sales_outperformance": 48, "cap_hit": False, "raw_score_uncapped": 68}},
            "keywords":            {"score": 78, "raw": {"keyword_cloud": {"独家": 480, "原创": 520, "国潮": 380, "联名": 280, "限量": 320, "种草": 240}, "trending": [{"keyword": "国潮 IP"}, {"keyword": "城市漫游"}, {"keyword": "原创印花"}, {"keyword": "限量手作"}, {"keyword": "联名设计"}], "categories": {"satchel": 8, "tote": 7, "crossbody": 9, "shoulder_bag": 8}, "total_products_analyzed": 32}},
            "consumer_domain":     {"score": 83, "raw": {}},
            "product_domain":      {"score": 79, "raw": {}},
            "marketing_domain":    {"score": 79, "raw": {}},
            "momentum":            {"score": 88, "raw": {"score": 88, "version": "demo-v1"}},
            "threat":              {"score": 76, "raw": {"score": 76, "version": "demo-v1"}},
        },
        "brand_insight": {
            "zh": "古良吉吉是当前国潮女包最大威胁——上新节奏 2.4 款/周(类目均值 0.6)，原创印花 + IP 联名 + 限量手作三轮齐发，UGC 增速 +62% WoW。'月光宝盒'单品 GMV 同比 +180%。其客单价仅¥1,290，但通过原创设计与文化符号占据'独家、原创、国潮'心智，正快速侵蚀 TORY BURCH 的¥1,500-2,000 价格带年轻客群。",
            "en": "古良吉吉 is the biggest current 'guochao' (Chinese-style) handbag threat — launching 2.4 SKUs/wk (vs 0.6 category avg), with original prints + IP collabs + limited handcrafts running in parallel. UGC growth +62% WoW. 'Moonbox' single-SKU GMV is +180% YoY. AOV is only ¥1,290 but they own 'unique / original / guochao' mindshare via design + cultural symbols — eroding TORY BURCH's ¥1,500-2,000 segment with younger consumers.",
        },
    },
    {
        "name": "VALENTINOORLANDI",
        "tier": "watchlist",
        "platform_ids": {"xhs": "VALENTINOORLANDI", "douyin": "valentinoorlandi", "taobao": "valentinoorlandi"},
        "added_via": "manual",
        "follower_count": 145_000,
        "engagement_metrics": {"total_likes": 380_000, "total_notes": 1_400, "avg_comments": 8},
        "content_metrics": {"total_notes": 1_400, "video_count": 480},
        "products": [
            {"name": "VO Classic Hobo", "price": 1890, "original_price": 2890, "sales_volume": 1200, "category": "hobo", "material_tags": ["真皮"]},
            {"name": "VO 通勤 Tote 中号", "price": 2190, "original_price": 3290, "sales_volume": 980, "category": "tote", "material_tags": ["真皮"]},
            {"name": "VO Mini Crossbody", "price": 1490, "original_price": 2290, "sales_volume": 1800, "category": "crossbody", "material_tags": ["真皮"]},
        ],
        "metrics": {
            "voice_volume":        {"score": 48, "raw": {"growth_rate": 2, "follower_growth": 1, "voice_share_pct": 3, "content_growth": 0, "engagement_growth": 4, "platform_breakdown": {"douyin": {"followers": 145_000, "follower_growth": 1}}}},
            "consumer_mindshare":  {"score": 46, "raw": {"sentiment_ratio": 0.61, "engagement_share_pct": 3, "ugc_ratio": 0.51, "avg_comments_per_note": 8, "positive_keywords": ["意大利", "真皮"], "negative_keywords": ["小众", "陌生"], "top_ugc": ["这个牌子是什么", "意大利小众真皮"]}},
            "content_strategy":    {"score": 44, "raw": {"engagement_per_note": 271, "volume_share_pct": 3, "n_content_types": 2, "posting_consistency_cv": 0.8, "total_notes": 1400, "total_likes": 380_000}},
            "design_profile":      {"score": 56, "raw": {"material_diversity": 3, "silhouette_count": 5, "n_signature_designs": 1}},
            "kol_strategy":        {"score": 38, "raw": {"n_kols": 6, "tier_breakdown": {"nano": 4, "micro": 2, "mid": 0, "macro": 0}, "kol_count": 6}},
            "trending_products":   {"score": 44, "raw": {"top_products": [{"product_name": "Mini Crossbody", "sales_volume": 1800, "recent_growth": 6}, {"product_name": "Classic Hobo", "sales_volume": 1200, "recent_growth": -2}], "new_launches": [], "total_products": 9}},
            "launch_frequency":    {"score": 42, "raw": {"avg_per_week": 0.4, "acceleration_pct": 0, "consistency_cv": 1.1, "total_launches_90d": 4}},
            "price_positioning":   {"score": 66, "raw": {"avg_price": 1860, "premium_ratio": 64, "avg_discount_depth": 28, "price_band_distribution": {"<1000": 8, "1000-2000": 52, "2000-3000": 32, "3000-4000": 8, ">4000": 0}}},
            "wtp":                 {"score": 56, "raw": {"price_premium": 6, "sales_outperformance": -12, "cap_hit": False, "raw_score_uncapped": 56}},
            "keywords":            {"score": 46, "raw": {"keyword_cloud": {"意大利": 80, "真皮": 110, "小众": 70}, "trending": [], "categories": {"hobo": 3, "tote": 3, "crossbody": 3}, "total_products_analyzed": 9}},
            "consumer_domain":     {"score": 47, "raw": {}},
            "product_domain":      {"score": 52, "raw": {}},
            "marketing_domain":    {"score": 43, "raw": {}},
            "momentum":            {"score": 46, "raw": {"score": 46, "version": "demo-v1"}},
            "threat":              {"score": 42, "raw": {"score": 42, "version": "demo-v1"}},
        },
        "brand_insight": {
            "zh": "VALENTINOORLANDI 是意大利小众真皮品牌，认知度低(粉丝 14.5 万) 但客户忠诚度高。无明显增长动能也无明显衰退，对 TORY BURCH 几乎无直接威胁。可作为差异化参考：其'真意大利产'与'小众真皮'卖点是 TORY BURCH 在工艺叙事上可学习的方向。",
            "en": "VALENTINOORLANDI is an obscure Italian leather brand — low awareness (145K followers) but high loyalty. No notable momentum either way, near-zero direct threat to TORY BURCH. Useful as a differentiation reference: their 'made-in-Italy / small-batch leather' positioning is a craft-narrative angle TORY BURCH could borrow.",
        },
    },
]


# ─── Own brand (TORY BURCH) ──────────────────────────────────────────────
# Score profile: mid-premium, slightly losing in some places, holding in others.
# Designed so the demo workspace has a clear "we're being squeezed" story.

DEMO_OWN_BRAND_DATA = {
    "follower_count": 720_000,
    "engagement_metrics": {"total_likes": 2_960_000, "total_notes": 6_800, "avg_comments": 22},
    "content_metrics": {"total_notes": 6_800, "video_count": 2_400},
    "products": [
        {"name": "Tory Burch Robinson Mini Tote", "price": 2890, "original_price": 4290, "sales_volume": 4800, "category": "tote", "material_tags": ["真皮", "头层牛皮"]},
        {"name": "Tory Burch Kira Chevron 25", "price": 3290, "original_price": 4890, "sales_volume": 3800, "category": "shoulder_bag", "material_tags": ["真皮", "绗缝"]},
        {"name": "Tory Burch McGraw Slouchy Hobo", "price": 2490, "original_price": 3690, "sales_volume": 6200, "category": "hobo", "material_tags": ["真皮"]},
        {"name": "Tory Burch Lee Radziwill Mini", "price": 4690, "original_price": 6890, "sales_volume": 1800, "category": "satchel", "material_tags": ["真皮", "限量"]},
        {"name": "Tory Burch T Monogram Cube Bag", "price": 1990, "original_price": 2890, "sales_volume": 8400, "category": "crossbody", "material_tags": ["涂层", "logo印花"]},
    ],
    "metrics": {
        "voice_volume":        {"score": 64, "raw": {"growth_rate": -2, "follower_growth": 4, "voice_share_pct": 12, "content_growth": -4, "engagement_growth": -1, "platform_breakdown": {"douyin": {"followers": 720_000, "follower_growth": 4}}}},
        "consumer_mindshare":  {"score": 68, "raw": {"sentiment_ratio": 0.72, "engagement_share_pct": 11, "ugc_ratio": 0.58, "avg_comments_per_note": 22, "positive_keywords": ["精致", "Logo", "送礼", "通勤", "T 字"], "negative_keywords": ["贵"], "top_ugc": ["tory burch 通勤包推荐", "T 字 logo 经典款", "送礼自用都可"]}},
        "content_strategy":    {"score": 66, "raw": {"engagement_per_note": 435, "volume_share_pct": 13, "n_content_types": 4, "posting_consistency_cv": 0.32, "total_notes": 6800, "total_likes": 2_960_000}},
        "design_profile":      {"score": 72, "raw": {"material_diversity": 7, "silhouette_count": 10, "n_signature_designs": 3}},
        "kol_strategy":        {"score": 64, "raw": {"n_kols": 22, "tier_breakdown": {"nano": 10, "micro": 8, "mid": 3, "macro": 1}, "kol_count": 22}},
        "trending_products":   {"score": 62, "raw": {"top_products": [{"product_name": "T Monogram Cube", "sales_volume": 8400, "recent_growth": 8}, {"product_name": "McGraw Hobo", "sales_volume": 6200, "recent_growth": 2}, {"product_name": "Robinson Mini", "sales_volume": 4800, "recent_growth": -4}], "new_launches": ["Kira Chevron 25 SS26"], "total_products": 22}},
        "launch_frequency":    {"score": 60, "raw": {"avg_per_week": 0.8, "acceleration_pct": -2, "consistency_cv": 0.4, "total_launches_90d": 9}},
        "price_positioning":   {"score": 74, "raw": {"avg_price": 2470, "premium_ratio": 72, "avg_discount_depth": 30, "price_band_distribution": {"<1000": 0, "1000-2000": 24, "2000-3000": 42, "3000-4000": 22, ">4000": 12}}},
        "wtp":                 {"score": 70, "raw": {"price_premium": 14, "sales_outperformance": 12, "cap_hit": False, "raw_score_uncapped": 70}},
        "keywords":            {"score": 66, "raw": {"keyword_cloud": {"T 字": 280, "通勤": 320, "送礼": 220, "精致": 240, "Robinson": 140}, "trending": [{"keyword": "Cube Bag"}, {"keyword": "迷你包"}], "categories": {"tote": 5, "shoulder_bag": 4, "crossbody": 4, "hobo": 3}, "total_products_analyzed": 22}},
        "consumer_domain":     {"score": 67, "raw": {}},
        "product_domain":      {"score": 69, "raw": {}},
        "marketing_domain":    {"score": 65, "raw": {}},
        "momentum":            {"score": 60, "raw": {"score": 60, "version": "demo-v1"}},
        "threat":              {"score": 64, "raw": {"score": 64, "version": "demo-v1"}},
    },
    "brand_insight": {
        "zh": "TORY BURCH 当前处于'轻奢中场'防守位——溢价能力(70/100) 与价格定位(74) 在合理区间，但声量(64)、内容动能(66)、上新节奏(60) 均落后于 COACH，且被古良吉吉的国潮原创势能从下方挤压。本周关键决策：在¥1,800-2,800 价格带通过 T-Monogram + Cube Bag 的迷你包矩阵守住通勤场景，同时孕育独家联名 SKU 向上突围。",
        "en": "TORY BURCH is in a defensive 'mid-light-luxury' position — pricing power (70/100) and price positioning (74) are healthy, but voice (64), content velocity (66), and launch cadence (60) all trail COACH, while 古良吉吉's guochao-original momentum squeezes from below. Key decision this week: defend the ¥1,800-2,800 commuter segment via T-Monogram + Cube Bag mini matrix, while incubating exclusive collab SKUs to break upward.",
    },
}


# ─── Brief (verdict + 3 moves, bilingual) ────────────────────────────────

DEMO_BRIEF = {
    "verdict": {
        "trend": "losing",
        "headline": {
            "zh": "TORY BURCH 在轻奢女包中场遭双向夹击：COACH 头部稳固 + 古良吉吉 国潮新锐快速崛起",
            "en": "TORY BURCH squeezed in mid-light-luxury: COACH consolidates the lead while 古良吉吉's guochao surge accelerates",
        },
        "sentence": {
            "zh": "本周轻奢女包市场，COACH 通过奥莱矩阵 + 经典款 (Tabby/Pillow) 双轮稳坐头部 (¥1000-2500 万 GMV)，将 TORY BURCH 压制在第二梯队。同时，国货新锐古良吉吉以 +48% WoW 的声量增长与 2.4 款/周的上新节奏 (类目均值 0.6) 快速侵蚀 TORY BURCH 的¥1,500-2,000 价格带。Dissona NPS 指标 +28%，表明国货已不只是'便宜替代'。",
            "en": "This week in light-luxury handbags: COACH dominates the lead (¥10-25M GMV) via outlet matrix + classics (Tabby/Pillow), pinning TORY BURCH to second tier. Meanwhile guochao challenger 古良吉吉 erodes the ¥1,500-2,000 segment with +48% WoW voice growth and 2.4 launches/wk (vs 0.6 category avg). Dissona's NPS-style signals up +28% — Chinese brands aren't just 'cheap substitutes' anymore.",
        },
        "top_action": {
            "zh": "本周关键动作：在¥1,800-2,800 价格带启动'通勤精选'直播专场 (5-7 SKU 集中 T Monogram + Cube Bag)，赶在 COACH 下一个促销窗口前锁定'轻奢通勤'关键词阵地。",
            "en": "Top action this week: launch a 'commuter capsule' Douyin live with 5-7 SKUs in the ¥1,800-2,800 range (T Monogram + Cube Bag focus) to lock the 'light-luxury commuter' keyword position before COACH's next sale window.",
        },
    },
    "moves": [
        {
            "id": "demo-move-1",
            "brand": "古良吉吉",
            "trend": "losing",
            "impact": "high",
            "headline": {
                "zh": "古良吉吉中端攻势 (+48% WoW 声量，国潮联名第三波上新)",
                "en": "古良吉吉 mid-segment offensive (+48% WoW voice, guochao collab vol.3 just dropped)",
            },
            "detail": {
                "zh": "古良吉吉本周'国潮 IP 联名 vol.3'限量发售引发 +88% UGC 增长，'月光宝盒'单 SKU 同比 +180%。其在 1,000-1,500 元价格带的心智份额从 9% 升至 14% (近三周累计)，已具备品类冠军潜力。",
                "en": "古良吉吉's 'guochao IP collab vol.3' limited drop drove +88% UGC growth this week. 'Moonbox' single-SKU is +180% YoY. Their 1,000-1,500 RMB band mindshare climbed from 9% to 14% over three weeks — they're approaching category-champion territory.",
            },
            "so_what": {
                "zh": "TORY BURCH 价格底线在¥1,800，意味着默认放弃¥1,000-1,500 段。可选路径：(a) 推出副线/奥莱品到 ¥1,500 段直接对冲，(b) 坚守溢价位通过设计差异化向上突围。本周必须决断。",
                "en": "TORY BURCH's price floor is ¥1,800, meaning we cede the ¥1,000-1,500 segment by default. Options: (a) outlet/lite line at ¥1,500 to directly engage, or (b) hold premium and break upward via design differentiation. Decision required this week.",
            },
            "action": {
                "zh": "本周五前确定路径：副线 vs 联名向上。建议召集设计 + 商品 + 渠道做 90 分钟 alignment 会。",
                "en": "By Friday EOD: pick a path — outlet line vs upmarket collab. Recommend a 90-min design × merchandising × channel alignment meeting.",
            },
        },
        {
            "id": "demo-move-2",
            "brand": "COACH",
            "trend": "losing",
            "impact": "medium",
            "headline": {
                "zh": "COACH 奥莱本周降价 12%，将'轻奢入门'锚点拉至 ¥1,500",
                "en": "COACH outlet cut prices 12% this week — anchoring 'light-luxury entry' at ¥1,500",
            },
            "detail": {
                "zh": "COACH 奥莱旗舰本周'春季清仓'活动，平均售价从¥1,690 降至¥1,490，新增 4 款 SKU 进入折扣带。该活动在抖音获 250-500 万曝光，转化率达 6.2%。",
                "en": "COACH outlet ran a 'spring clear' campaign this week — avg sale price dropped ¥1,690 → ¥1,490, with 4 new SKUs added to the discount tier. 2.5-5M Douyin impressions, 6.2% conversion.",
            },
            "so_what": {
                "zh": "COACH 奥莱的¥1,500 锚点意味着更多消费者会以此作为'轻奢应该值多少'的预期基准。TORY BURCH 主力价格带¥2,400 面临转化率风险。",
                "en": "COACH outlet's ¥1,500 anchor means more shoppers will calibrate 'what light-luxury should cost' downward. TORY BURCH's ¥2,400 sweet spot faces conversion risk.",
            },
            "action": {
                "zh": "下 3 个视频投放强化'意大利头层牛皮 × 工艺细节'叙事，将价格对话锚定在'品质'而非'数字'。",
                "en": "In the next 3 video drops, double down on 'Italian top-grain leather × craft details' narrative — anchor the price conversation on quality, not number.",
            },
        },
        {
            "id": "demo-move-3",
            "brand": "Dissona",
            "trend": "losing",
            "impact": "medium",
            "headline": {
                "zh": "Dissona NPS 类指标 +28%，回购语种草密度达 18%",
                "en": "Dissona NPS-style signals +28%, rebuy-language UGC density at 18%",
            },
            "detail": {
                "zh": "Dissona 本周通过会员忠诚度活动 + 老客回购 KOL (9 位) 拉动 +142 条正面 UGC，'回购'/'再买'/'已经第三个'等高复购意图短语在其品牌讨论中占比 18% (类目均值 6%)。",
                "en": "Dissona's loyalty + repeat-customer KOL campaign (9 voices) drove +142 positive UGC mentions this week. Rebuy phrases ('回购' / '再买' / 'already my third') hit 18% density in their brand discussions (vs 6% category avg).",
            },
            "so_what": {
                "zh": "Dissona 在'首次购买 → 老客 advocate'转化速度上已超过 TORY BURCH。Loyalty Index 差距由 8 分扩大至 17 分。",
                "en": "Dissona is converting first-time buyers to advocates faster than TORY BURCH. The Loyalty Index gap widened from 8 to 17 points.",
            },
            "action": {
                "zh": "Q2 试点'第二个包优惠'老客 bundle 计划——本月先在 50 位高价值客户中测试转化率与 NPS 提升。",
                "en": "Q2 pilot a 'second-bag bundle' offer for repeat buyers — start with 50 high-value customers in May to test conversion uplift + NPS shift.",
            },
        },
    ],
}


# ─── Content drafts (Douyin scripts, bilingual) ──────────────────────────

DEMO_CONTENT_DRAFTS = [
    {
        "platform": "douyin",
        "title": "通勤包之争：Tory Burch vs COACH 怎么选",
        "hook_3s": "你以为通勤包就是 COACH？让我告诉你 2026 年的另一个答案",
        "main_15s": "新一代轻奢通勤包，意大利头层牛皮，14 寸笔电完美收纳，可调节肩带。Tory Burch Robinson Mini 售价¥2,890——比 COACH Tabby 26 少 ¥800，工艺一样精致，T-Monogram 设计更有辨识度。三色可选，今晚直播间下单送同色丝巾。",
        "cta_3s": "评论区留言'通勤'即可领取直播专属优惠券",
        "hashtags": ["通勤包", "轻奢女包", "上班穿搭", "Tory Burch", "托特包推荐", "意大利牛皮"],
        "reasoning": "对标 COACH Tabby 26 (¥2,890 vs Tabby ¥2,890)，建立直接对比锚点。强调差价 ¥800 + 工艺等价的价值主张。",
        "why_now": "本周 COACH 奥莱降价 12% 拉低消费者预期锚，需要在主力价格带通过价值教育而非降价应对。",
        "based_on": "Move #2 — COACH outlet pricing pressure",
    },
    {
        "platform": "douyin",
        "title": "为什么我从国潮包又回到 Tory Burch",
        "hook_3s": "买过 5 个国潮包，最后还是回到 T 字 logo——为什么？",
        "main_15s": "国潮联名很惊艳，但通勤场景里它们都败给一个细节：拎着开会客户认不出。Tory Burch T-Monogram Cube Bag，¥1,990，可装满月报告 + iPad，logo 醒目但克制，会议室职业感拉满。买 1 包用 5 年的安全感，不是限量款能给的。",
        "cta_3s": "想看更多通勤场景测评点赞过 5 千更新",
        "hashtags": ["TMonogram", "Cube Bag", "通勤场景", "职业女性", "Tory Burch", "轻奢通勤"],
        "reasoning": "用'回流叙事'(从国潮回到主流轻奢) 化解古良吉吉国潮势能威胁。强调'职业场景'差异化，避开纯设计 vs 纯设计的硬碰硬。",
        "why_now": "Move #1 — 古良吉吉 momentum surge in mid-segment. We can't out-collab them, so we differentiate on context (workplace credibility).",
        "based_on": "Move #1 — 古良吉吉 mid-segment offensive",
    },
]


# ─── Product opportunity (1 concept, bilingual) ──────────────────────────

DEMO_PRODUCT_OPPORTUNITY = {
    "concept_name": {
        "zh": "Tory Burch × 国潮匠心限定系列",
        "en": "Tory Burch × Guochao Craft Limited Series",
    },
    "positioning": {
        "zh": "通过与中国独立设计师合作推出 200 个限量 SKU，定价 ¥3,500-4,800，瞄准想要'轻奢但拒绝同质化'的 25-35 岁女性消费者。设计语言保留 T-Monogram 标识 + 加入中国传统工艺元素 (苏绣 / 漆器纹样)。",
        "en": "Partner with Chinese independent designers on a 200-SKU limited drop priced ¥3,500-4,800, targeting 25-35 yo women who want 'light-luxury without homogenization.' Design language preserves T-Monogram + adds Chinese traditional craft elements (Suzhou embroidery / lacquer patterns).",
    },
    "why_now": {
        "zh": "COACH 的奥莱模型已固化其'轻奢入门'心智，TORY BURCH 必须向上突围而非贴身肉搏。同期，独立设计师 + 国潮工艺合作款在小红书的'非大牌'话题下 UGC 增长 +47% YoY。¥3,500+ 价格带的轻奢 collab 在中国市场仍是空白——COACH/MK 都未做，MCM 已不再有发力。",
        "en": "COACH's outlet matrix has cemented their 'light-luxury entry' mindshare. TORY BURCH must break upward rather than fight head-on. Meanwhile, independent-designer + guochao-craft collabs are seeing +47% YoY UGC growth on XHS in 'not-mega-brand' threads. The ¥3,500+ light-luxury collab segment is unclaimed in China — COACH/MK aren't there, MCM has gone quiet.",
    },
    "signals": [
        {"label": "独立设计师 UGC YoY", "value": "+47%"},
        {"label": "TORY BURCH 25-35 岁占比", "value": "62% (核心客群)"},
        {"label": "限量营销在小红书 CTR", "value": "8.4% (vs 常规 2.1%)"},
        {"label": "古良吉吉国潮联名转化率", "value": "12.8% (validation signal)"},
    ],
    "target_price": "¥3,500-4,800",
    "target_channels": ["小红书", "抖音"],
    "launch_timeline": {
        "zh": "Q3 2026 — 先 200 SKU 试水，11 月 (双 11 周期) 全量上线",
        "en": "Q3 2026 — 200-SKU pilot first, full launch in Nov (Double-11 cycle)",
    },
}


# ─── White space (3 opportunities, bilingual) ────────────────────────────

DEMO_WHITE_SPACES = [
    {
        "title": {"zh": "通勤束口 (Cinch) 系列空白", "en": "Cinch / drawstring commuter line — unclaimed"},
        "summary": {
            "zh": "目前轻奢女包在 cinch / drawstring 收口设计上完全空白。该结构在欧美轻奢市场已成趋势 (Coach Soho、Mansur Gavriel 主推)，但中国仅 3 家 SKU 在售，且都来自小众设计师品牌——主流轻奢无人布局。",
            "en": "Light-luxury cinch / drawstring closures are completely unclaimed. The silhouette is trending in US/EU light-luxury (Coach Soho, Mansur Gavriel leading), but only 3 SKUs are on sale in China, all from indie designers — no major light-luxury brand has entered.",
        },
        "category": "dimension",
        "score": 78,
        "reasoning": {
            "zh": "Cinch 包结构契合通勤场景 (柔软可塞入更多物品) 与休闲场景 (慵懒美学)，且与 TORY BURCH 当前 Tote 矩阵互补。生产难度低于绗缝或印花。",
            "en": "Cinch silhouettes fit both commuter (soft, fits more) and casual (relaxed aesthetic) contexts. Complements TORY BURCH's existing Tote matrix and is lower production complexity than quilting or print.",
        },
        "supporting": [
            {"label": "中国在售 cinch SKU 数", "value": "3 (全部独立设计师)"},
            {"label": "Mansur Gavriel cinch UGC YoY (US)", "value": "+128%"},
            {"label": "类目同行布局", "value": "0/6 主流轻奢"},
        ],
        "suggested_action": {
            "zh": "Q4 2026 推出 Tory Burch Cinch Tote 试水款，定价 ¥2,400 (主力带正中)，先 1 SKU × 4 色测试。",
            "en": "Pilot a Tory Burch Cinch Tote in Q4 2026 at ¥2,400 (sweet-spot price). Single SKU × 4 colors to start.",
        },
    },
    {
        "title": {"zh": "户外通勤场景 (City Walk) 心智", "en": "Outdoor-commuter ('city walk') mindshare"},
        "summary": {
            "zh": "'City Walk'话题在小红书 +84% YoY，但相关包款搜索结果以户外品牌 (TheNorthFace、Salomon) 为主，轻奢品牌全部缺席。通勤 + 周末 hybrid 场景需求未被满足。",
            "en": "'City walk' is +84% YoY on XHS, but related bag searches surface mostly outdoor brands (TheNorthFace, Salomon) — no light-luxury presence. The commuter × weekend hybrid use case is unserved.",
        },
        "category": "dimension",
        "score": 72,
        "reasoning": {
            "zh": "TORY BURCH 的 McGraw Slouchy Hobo 已具备 city-walk 适配性 (柔软 + 防雨涂层)，但消费者认知中尚未连接。重新定位 + 内容运营可低成本切入。",
            "en": "TORY BURCH's McGraw Slouchy Hobo already fits city-walk (soft + water-repellent), but the connection isn't established in consumers' minds. Repositioning + content can capture this with low investment.",
        },
        "supporting": [
            {"label": "City walk XHS UGC YoY", "value": "+84%"},
            {"label": "搜索结果中轻奢占比", "value": "0%"},
            {"label": "TORY BURCH McGraw 适配度", "value": "高 (现有 SKU)"},
        ],
        "suggested_action": {
            "zh": "5月内推出'McGraw × City Walk'内容主题——周末户外 + 周一通勤双场景视频系列，绑定关键词。",
            "en": "Launch a 'McGraw × City Walk' content theme this May — a weekend-outdoor × Monday-commuter dual-scenario video series, anchored on the keyword.",
        },
    },
    {
        "title": {"zh": "限定联名 × 国潮 IP 跨界", "en": "Limited collab × guochao IP cross-over"},
        "summary": {
            "zh": "古良吉吉的 IP 联名验证了'国潮 + 轻奢'的需求 (单 SKU GMV +180%)，但他们停留在¥1,500-1,890 价格带。¥3,500+ 段落由 TORY BURCH 主导，但尚无国潮联名产品——纯空白。",
            "en": "古良吉吉's IP collab validated guochao × light-luxury demand (single-SKU GMV +180%), but they're capped at ¥1,500-1,890. The ¥3,500+ band is TORY BURCH territory, with zero guochao collabs — pure white space.",
        },
        "category": "channel",
        "score": 75,
        "reasoning": {
            "zh": "向上联名是 TORY BURCH 在'被夹击'格局下唯一能扩大势能的不对称打法。可与中国独立设计师或博物馆 IP 合作 (故宫文创、上海博物馆等)。",
            "en": "Upmarket collab is TORY BURCH's only asymmetric play to expand influence in the 'squeezed' competitive position. Partner with Chinese independent designers or museum IPs (Forbidden City, Shanghai Museum, etc).",
        },
        "supporting": [
            {"label": "古良吉吉国潮联名 GMV YoY", "value": "+180%"},
            {"label": "¥3,500+ 国潮联名供给", "value": "0 (无供给)"},
            {"label": "故宫文创联名包款历史 ROI", "value": "1.4-2.2x (品牌平均 1.0)"},
        ],
        "suggested_action": {
            "zh": "Q3 2026 启动博物馆 IP 联名洽谈——目标是 11 月双 11 前发售 200 SKU 限量款，关联 Product Opportunity 概念。",
            "en": "Start museum-IP partnership conversations in Q3 2026 — target a 200-SKU limited drop before the Double-11 sales window (linked to the Product Opportunity concept above).",
        },
    },
]


# ─── Writer ──────────────────────────────────────────────────────────────

def _to_jsonb(value):
    """Compact JSONB serialization for psycopg2 — ensures Chinese chars render."""
    return json.dumps(value, ensure_ascii=False)


def _wrap_bilingual(node, fields):
    """For weekly_briefs storage shape: every text field is {zh, en}."""
    if not isinstance(node, dict):
        return node
    return {**node, **{f: node[f] for f in fields if f in node}}


def seed_demo_workspace(workspace_id, dry_run=False):
    """
    Idempotently seed the target workspace with demo data.

    Operations are wrapped in a single transaction. If anything fails
    mid-way, the workspace is left untouched. After commit, calls
    composite_indices.compute_all_for_workspace() to derive the 12
    composite indices from the seeded analysis_results.
    """
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, brand_name, user_id FROM workspaces WHERE id = %s", (workspace_id,))
            ws = cur.fetchone()
            if not ws:
                print(f"[demo] ✗ Workspace {workspace_id} not found in DB.")
                sys.exit(1)
            print(f"[demo] Targeting workspace:")
            print(f"        id            = {ws['id']}")
            print(f"        brand_name    = {ws['brand_name']}")
            print(f"        user_id       = {ws['user_id']}")
            print(f"        → will overwrite to brand_name = {DEMO_OWN_BRAND}")
            print(f"        → seeding {len(DEMO_COMPETITORS)} competitors + own brand")

            if dry_run:
                print(f"[demo] DRY-RUN — no writes performed.")
                return

            # 1. Update workspace identity to TORY BURCH
            cur.execute(
                """
                UPDATE workspaces
                   SET brand_name = %s,
                       brand_category = %s,
                       brand_price_range = %s::jsonb,
                       brand_platforms = %s::jsonb,
                       updated_at = NOW()
                 WHERE id = %s
                """,
                (
                    DEMO_OWN_BRAND,
                    DEMO_CATEGORY,
                    _to_jsonb(DEMO_PRICE_RANGE),
                    _to_jsonb({p: "" for p in DEMO_PLATFORMS}),
                    workspace_id,
                ),
            )
            print(f"[demo] ✓ workspace identity updated → {DEMO_OWN_BRAND}")

            # 2. Reset existing CI data for this workspace.
            for tbl in [
                "white_space_opportunities",
                "product_opportunities",
                "content_recommendations",
                "weekly_briefs",
                "composite_indices",
                "analysis_results",
                "workspace_competitors",
            ]:
                cur.execute(f"DELETE FROM {tbl} WHERE workspace_id = %s", (workspace_id,))
            print(f"[demo] ✓ cleared CI tables for workspace")

            # Intentionally NOT touching scraped_brand_profiles or
            # scraped_products — those tables are keyed by brand_name (not
            # workspace_id) so any insert/delete here would leak into other
            # workspaces tracking the same brand. The trade-off: Innovation
            # Score and Promotional Discipline composite indices will read
            # empty product lists and compute neutral defaults. The other
            # 10 indices, Brief, content drafts, opportunities, white space
            # all populate from analysis_results (workspace-keyed) so the
            # demo still looks rich. See ISOLATION GUARANTEE in module
            # docstring.

            # 3. Insert workspace_competitors
            for c in DEMO_COMPETITORS:
                cur.execute(
                    """
                    INSERT INTO workspace_competitors
                        (workspace_id, brand_name, tier, platform_ids, added_via)
                    VALUES (%s, %s, %s, %s::jsonb, %s)
                    """,
                    (
                        workspace_id,
                        c["name"],
                        c["tier"],
                        _to_jsonb(c.get("platform_ids", {})),
                        c.get("added_via", "manual"),
                    ),
                )
            print(f"[demo] ✓ inserted {len(DEMO_COMPETITORS)} workspace_competitors")

            # Bundle own + competitor data for the analysis_results loop.
            # scraped_brand_profiles + scraped_products are intentionally
            # NOT seeded (not workspace-keyed → would leak across workspaces
            # tracking the same brand). Trade-off documented in module
            # docstring's ISOLATION GUARANTEE section.
            all_brand_data = [(DEMO_OWN_BRAND, DEMO_OWN_BRAND_DATA)] + [
                (c["name"], c) for c in DEMO_COMPETITORS
            ]

            # 4. Insert analysis_results — 16 metric_types per brand.
            n_metrics = 0
            for brand_name, bd in all_brand_data:
                for metric_type, mdata in bd["metrics"].items():
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type,
                             metric_version, score, raw_inputs, analyzed_at)
                        VALUES (%s, %s, %s, 'demo-v1', %s, %s::jsonb, NOW())
                        """,
                        (
                            workspace_id,
                            brand_name,
                            metric_type,
                            mdata["score"],
                            _to_jsonb(mdata.get("raw", {})),
                        ),
                    )
                    n_metrics += 1
                # brand_insight is a narrative; score=0 placeholder, ai_narrative carries the bilingual JSON.
                cur.execute(
                    """
                    INSERT INTO analysis_results
                        (workspace_id, competitor_name, metric_type,
                         metric_version, score, ai_narrative, analyzed_at)
                    VALUES (%s, %s, 'brand_insight', 'demo-v1', 0, %s, NOW())
                    """,
                    (workspace_id, brand_name, _to_jsonb(bd["brand_insight"])),
                )
                n_metrics += 1
            print(f"[demo] ✓ inserted {n_metrics} analysis_results rows")

            # 5. Insert weekly_briefs — current ISO week
            cur.execute(
                """
                INSERT INTO weekly_briefs
                    (workspace_id, week_of, verdict, moves, generated_at)
                VALUES (%s, %s, %s::jsonb, %s::jsonb, NOW())
                """,
                (
                    workspace_id,
                    CURRENT_WEEK.isoformat(),
                    _to_jsonb(DEMO_BRIEF["verdict"]),
                    _to_jsonb(DEMO_BRIEF["moves"]),
                ),
            )
            print(f"[demo] ✓ inserted weekly_brief for week_of={CURRENT_WEEK.isoformat()}")

            # 6. Insert content_recommendations
            for d in DEMO_CONTENT_DRAFTS:
                cur.execute(
                    """
                    INSERT INTO content_recommendations
                        (workspace_id, week_of, platform, title, hook_3s, main_15s,
                         cta_3s, hashtags, reasoning, why_now, based_on, status)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'draft')
                    """,
                    (
                        workspace_id,
                        CURRENT_WEEK.isoformat(),
                        d["platform"],
                        d["title"],
                        d["hook_3s"],
                        d["main_15s"],
                        d["cta_3s"],
                        d.get("hashtags", []),
                        d.get("reasoning"),
                        d.get("why_now"),
                        d.get("based_on"),
                    ),
                )
            print(f"[demo] ✓ inserted {len(DEMO_CONTENT_DRAFTS)} content_recommendations")

            # 7. Insert product_opportunities
            opp = DEMO_PRODUCT_OPPORTUNITY
            cur.execute(
                """
                INSERT INTO product_opportunities
                    (workspace_id, week_of, concept_name, positioning, why_now,
                     signals, target_price, target_channels, launch_timeline, status)
                VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, 'proposed')
                """,
                (
                    workspace_id,
                    CURRENT_WEEK.isoformat(),
                    _to_jsonb(opp["concept_name"]),
                    _to_jsonb(opp["positioning"]),
                    _to_jsonb(opp["why_now"]),
                    _to_jsonb(opp["signals"]),
                    opp["target_price"],
                    opp.get("target_channels", []),
                    _to_jsonb(opp["launch_timeline"]),
                ),
            )
            print(f"[demo] ✓ inserted product_opportunity")

            # 8. Insert white_space_opportunities
            for ws_opp in DEMO_WHITE_SPACES:
                cur.execute(
                    """
                    INSERT INTO white_space_opportunities
                        (workspace_id, week_of, title, summary, category,
                         opportunity_score, reasoning, supporting_data, suggested_action)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
                    """,
                    (
                        workspace_id,
                        CURRENT_WEEK.isoformat(),
                        _to_jsonb(ws_opp["title"]),
                        _to_jsonb(ws_opp["summary"]),
                        ws_opp["category"],
                        ws_opp["score"],
                        _to_jsonb(ws_opp["reasoning"]),
                        _to_jsonb(ws_opp["supporting"]),
                        _to_jsonb(ws_opp["suggested_action"]),
                    ),
                )
            print(f"[demo] ✓ inserted {len(DEMO_WHITE_SPACES)} white_space_opportunities")

            conn.commit()
            print(f"[demo] ✓ all writes committed.")

    except Exception as e:
        print(f"[demo] ✗ Failed mid-transaction: {e}")
        traceback.print_exc()
        conn.rollback()
        raise
    finally:
        conn.close()

    # 9. Derive composite_indices from the seeded analysis_results.
    # Imported here (not at module top) to avoid a circular-import risk
    # if a caller of this module is itself being imported by composite_indices.
    print(f"[demo] Triggering composite_indices.compute_all_for_workspace …")
    from .composite_indices import compute_all_for_workspace
    compute_all_for_workspace(workspace_id)
    print(f"[demo] ✓ Done. The dashboard should now render fully populated.")


def main():
    parser = argparse.ArgumentParser(
        description="Seed a workspace with curated demo data for screen recordings.",
        epilog="WARNING: this overwrites the target workspace's CI data. Find the UUID via:\n"
        "  psql \"$DATABASE_URL\" -c \"SELECT id, brand_name, user_id FROM workspaces ORDER BY created_at DESC LIMIT 10\"\n"
        "  Then run: python -m services.competitor_intel.demo_seeder --workspace-id <UUID> --confirm",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--workspace-id", required=True, help="UUID of the workspace to seed (destructive)")
    parser.add_argument("--confirm", action="store_true",
                        help="Required confirmation flag — without this, runs in dry-run mode.")
    args = parser.parse_args()

    seed_demo_workspace(args.workspace_id, dry_run=not args.confirm)


if __name__ == "__main__":
    main()
