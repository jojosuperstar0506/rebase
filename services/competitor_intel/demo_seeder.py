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
            "zh": "诊断：COACH 是当前轻奢女包不可撼动的头部——奥莱矩阵 + 经典款双轮策略产生复利效应。\n关键数据：单店 GMV ¥1,800 万/周 (类目第 2)；Tabby 26 与 Pillow 18 累计转化率 8%（类目均值 2.8%）；'轻奢入门'心智份额 31%（+5pp MoM）；客单价¥2,480。\n用户语：'coach 经典款必入回购'、'断货款已售罄'、'通勤包就买 coach'——心智词高频且具占位性。\nTORY BURCH 应对：不在数字上正面拼奥莱，转而在'品质叙事 × 工匠工艺'维度构建差异化护城河。同时密切跟踪 COACH 上新节奏（预计 5/15 母亲节大促），抢在其窗口前 7-10 天发声。",
            "en": "Diagnosis: COACH is the unshakeable category leader. Outlet matrix + heritage classics compound into a flywheel.\nKey data: single-store GMV ¥18M/wk (category #2); Tabby 26 + Pillow 18 hit 8% cumulative conversion (cat avg 2.8%); 'light-luxury entry' mindshare 31% (+5pp MoM); AOV ¥2,480.\nVoice-of-customer: 'COACH heritage style — must rebuy', 'sold-out classic restocks', 'commuter bag = COACH' — high-frequency, anchoring keywords.\nTORY BURCH playbook: don't fight outlet on price. Build differentiation via 'craft × Italian leather' narrative. Track COACH launch cadence (expect 5/15 Mother's Day mega-sale) and pre-empt their window by 7-10 days.",
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
            "zh": "诊断：MICHAEL KORS 进入'轻奢失宠'第二年——折扣加深但销量不增，是经典的衰退期信号。\n关键数据：客单价¥1,850（同比 -7%）；折扣深度 42%（行业最高）；声量 -4% WoW；KOL 投放收缩 22%；Hamilton + Mercer 经典款销量 YoY -8%。\n用户语：'mk 包还值得入吗'、'mk 经典款过时了吗'——疑问句态势体现犹豫，正面 UGC 仅 28% (vs 古良吉吉 91%)。\nTORY BURCH 应对：将 MK 从'同位竞品'重新归类为'流失客户来源池'。其失血客群（25-35 岁、价格敏感、要求 logo 识别度）与 TORY BURCH 主力重叠 40%——可通过 T-Monogram + 同价位段产品针对性截流，预计 6 个月可获取 8-12% MK 流失客户。",
            "en": "Diagnosis: MICHAEL KORS is entering year 2 of 'fading-light-luxury' — discounts deepening but volume flat is the classic decline signal.\nKey data: AOV ¥1,850 (-7% YoY); discount depth 42% (industry-high); voice -4% WoW; KOL spend -22%; Hamilton + Mercer classics -8% YoY.\nVoice-of-customer: 'is MK still worth buying?', 'have MK classics gone out of style?' — interrogative tone signals doubt; positive UGC only 28% (vs 古良吉吉's 91%).\nTORY BURCH playbook: reclassify MK from 'peer competitor' to 'churn-source pool'. Their bleeding cohort (25-35 yo, price-sensitive, logo-recognition seekers) overlaps TORY BURCH's core by 40%. T-Monogram + same-price-band SKUs can intercept 8-12% of MK's churners over 6 months.",
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
            "zh": "诊断：Dissona 是已突破'国货=便宜替代'认知边界的危险对手——在'值得回购'维度上正面挑战 TORY BURCH。\n关键数据：声量 +22% WoW；NPS 类指标 +28%；'回购'语 UGC 密度 18%（类目均值 6%、TORY BURCH 自身仅 9%）；客单价¥1,320 但销量超出类目均值 +28%；'通勤手提包'单 SKU GMV ¥1.6M/月（已达 TORY BURCH Robinson Mini 70%）；Loyalty Index 67（+12 MoM）vs TORY BURCH 50（-2 MoM）。\n用户语：'dissona 真的回购第三个了'、'通勤包性价比之王'、'国货精品强推必入'——'第三个'频率出现暗示极高粘性。\nTORY BURCH 应对：本月内启动'第二个包礼遇'老客 bundle 试点（详见 Brief Move #3）。同时分析 Dissona 会员忠诚度系统，识别可借鉴的具体机制（积分？专属客服？退换货政策？）。Q2 复盘 Loyalty Index 差距能否回收 5pp。",
            "en": "Diagnosis: Dissona has broken through the 'Chinese-brand = cheap-substitute' ceiling — now a genuine threat on the 'worth-rebuying' dimension.\nKey data: voice +22% WoW; NPS-style +28%; rebuy phrase density 18% (cat avg 6%, TORY BURCH 9%); AOV ¥1,320 but sales outperform cat by +28%; 'commuter satchel' single-SKU ¥1.6M/mo (approaching 70% of TORY BURCH Robinson Mini); Loyalty Index 67 (+12 MoM) vs TORY BURCH's 50 (-2 MoM).\nVoice-of-customer: 'this is my 3rd Dissona', 'commuter-bag value champion', 'must-have for guochao premium' — the recurrence of 'third' signals extreme stickiness.\nTORY BURCH playbook: launch 'second-bag VIP' loyalty pilot this month (see Brief Move #3). Audit Dissona's loyalty mechanics for patterns to borrow (points? exclusive service? returns policy?). Q2 review whether Loyalty Index gap can be recovered by 5pp.",
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
            "zh": "诊断：MCM 处于'高端褪色'晚期——客单价仍是类目最高但销量塌方，是经典的奢侈品衰退曲线。\n关键数据：客单价¥4,380（类目最高，溢价能力 86）；销量 YoY -14%；KOL 投放 -22%；KOL 数仅 12（类目均值 22）；声量 -12% WoW、互动 -18% WoW；新品上架 90 天仅 0 款；情绪指标 0.58（接近警戒线）。\n用户语：'mcm 还有人在买吗'、'mcm 双肩包过时了吗'、'土'、'logo 太大'——典型衰退期话语。\nTORY BURCH 应对：MCM 不是威胁，是机会。其¥4,000+ 段流失客户（估算月均 1,200-1,800 人）正寻找'同等价格带的更精致替代'。这正是 Q3 国潮匠心限定系列（Product Opportunity）的核心截流目标——计划上架时建议同步在小红书发起'#从奢侈品到精致轻奢'话题，瞄准 MCM 失血客群。",
            "en": "Diagnosis: MCM is in late-stage 'fading-luxury' — AOV still tops the category but volume is collapsing. Classic luxury-decline curve.\nKey data: AOV ¥4,380 (cat-top, pricing power 86); volume -14% YoY; KOL spend -22%; KOL count just 12 (cat avg 22); voice -12% WoW, engagement -18% WoW; zero new launches in past 90 days; sentiment 0.58 (near warning threshold).\nVoice-of-customer: 'is anyone still buying MCM?', 'have MCM backpacks gone out of style?', 'tacky', 'logo too big' — textbook decline-stage discourse.\nTORY BURCH playbook: MCM isn't a threat, it's an opportunity. Their ¥4,000+ churning customers (~1,200-1,800/mo estimate) are hunting for 'same-price-band but more restrained' alternatives. This is the core capture target for the Q3 Guochao Craft Limited Series (see Product Opportunity). At launch, run #From-Luxury-to-Restrained-Light-Luxury XHS hashtag campaign aimed at MCM's bleeding cohort.",
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
            "zh": "诊断：古良吉吉是 Q2 最大威胁——速度 + 文化资本 + 设计原创性的复合优势，正面侵蚀 TORY BURCH 年轻客群。\n关键数据：上新节奏 2.4 款/周（类目均值 0.6，4× 速度）；声量 +48% WoW、内容增速 +62%、互动增速 +78%；'月光宝盒'单 SKU GMV ¥23.3M (YoY +180%、超 TORY BURCH Robinson Mini 4.8 倍)；客单价仅¥1,290 但销量超类目 +48%；KOL 数 32 (类目均值 22)，主要纳米/腰部 (16+12)；情绪指标 0.91（类目最高）；'回购'语密度 12%。\n用户语：'国潮联名限量发售好惊艳'、'原创设计独家闭眼买'、'古良吉吉 月光宝盒首发抢到了'——'独家/原创/国潮'三大心智符号占据。\nTORY BURCH 应对（双轨）：\n• 防御：在'职业感 + 工艺持久'维度差异化（古良吉吉短板：联名款 5 年后还是限量款？工艺会沉淀吗？）。Brief Move #2 视频策略瞄准这一点。\n• 进攻：他们到不了的¥3,500+ 段是我们的机会（详见 Product Opportunity 国潮匠心限定系列），用同样的'独家/原创/国潮'语言但价格 3 倍，建立认知阶梯的下一格。",
            "en": "Diagnosis: 古良吉吉 is the #1 Q2 threat — speed × cultural capital × design originality compound to erode TORY BURCH's younger cohort.\nKey data: launch cadence 2.4 SKUs/wk (cat avg 0.6, 4× speed); voice +48% WoW, content growth +62%, engagement +78%; 'Moonbox' single-SKU GMV ¥23.3M (YoY +180%, 4.8× TORY BURCH's Robinson Mini); AOV just ¥1,290 but volume outperforms cat by +48%; 32 KOLs (cat avg 22), heavily nano/micro (16+12); sentiment 0.91 (cat-highest); rebuy phrase density 12%.\nVoice-of-customer: 'guochao collab limited-drop is stunning', 'original design exclusive — eyes-closed buy', 'snagged the Moonbox at first launch' — owns the 'exclusive / original / guochao' triad.\nTORY BURCH playbook (dual-track):\n• Defense: differentiate on 'workplace credibility × craft longevity' (their weakness: will the collab still be a thing in 5 years? does craft compound?). Brief Move #2 video strategy targets exactly this.\n• Offense: ¥3,500+ band is unreachable for them — that's our opportunity (see Product Opportunity Guochao Craft Limited Series). Use the same 'exclusive / original / guochao' vocabulary but at 3× the price, claim the next rung of the perception ladder.",
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
            "zh": "诊断：VALENTINOORLANDI 是意大利小众真皮品牌——认知度低（粉丝 14.5 万）、增长平稳、忠诚客户群小但深。\n关键数据：声量 +2% WoW（持平）；客单价¥1,860（健康溢价）；销量 -12% (类目均值的 1/8)；KOL 数 6（类目均值 22）；典型 UGC：'这个牌子是什么'、'意大利小众真皮' (大量基础认知问题)；情绪指标 0.61。\n用户语：'真皮还可以'、'低调小众'、'意大利产'——典型 'aware-but-not-engaged' 用户态势。\nTORY BURCH 应对：VO 不是威胁，是反向参照系（reverse benchmark）。其'真意大利产+小众真皮'叙事在中国市场无法转化（认知摩擦太大），证明'血统纯正'本身不是中国消费者的购买驱动——TORY BURCH 不需要在'我们更纯正'这条路上花营销预算。但 VO 的 KOL 矩阵中有 4 位米兰本地工艺类博主，可作为 TORY BURCH 工艺叙事的内容素材源（无竞争冲突）。",
            "en": "Diagnosis: VALENTINOORLANDI is a niche Italian leather brand — low awareness (145K followers), flat growth, small-but-deep loyal cohort.\nKey data: voice +2% WoW (flat); AOV ¥1,860 (healthy premium); volume -12% (1/8 of cat avg); 6 KOLs (cat avg 22); representative UGC: 'what brand is this?', 'niche Italian leather' (lots of basic-awareness questions); sentiment 0.61.\nVoice-of-customer: 'leather is okay', 'understated niche', 'made-in-Italy' — classic 'aware-but-not-engaged' stance.\nTORY BURCH playbook: VO isn't a threat, it's a reverse benchmark. Their 'authentic-Italian + small-batch leather' narrative doesn't convert in China (too much awareness friction) — proving 'pure heritage' alone isn't a buying driver here. TORY BURCH doesn't need to spend marketing on 'we're more authentic'. But VO's KOL roster includes 4 Milan-based craft-content creators worth tapping as content sources for TORY BURCH's craft narrative (no competitive conflict).",
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
        "zh": "TORY BURCH 当前态势诊断：\n• 资产端（强）：溢价能力 70 / 价格定位 74——健康的轻奢中场卡位，¥2,400-2,800 客单价仍受市场认可。设计资产 (T-Monogram + Cube Bag) 仍具辨识度。\n• 引擎端（弱）：声量 64 (-2% WoW)、内容动能 66 (落后 COACH 16 点)、上新节奏 60 (落后行业头部 26 点)。运营投入不足是核心病因。\n• 心智端（受压）：'轻奢通勤'认知份额从 14% (Q1) 降至 12% (Q2 至今)。25-35 岁年轻客群中，约 12% (≈ 9,600 人) 在过去 90 天有过 Dissona 浏览或加购行为。\n核心矛盾：资产健康但运营不足；如果资产持续而引擎不补，6-9 个月内将转为'品牌力下行'阶段（参考 MK 2024 路径）。\n本周决策三件事（按优先级）：\n1. 立即——'通勤精选'直播专场（5/15 前发布，目标¥1.2M GMV）\n2. 本月——'第二个包礼遇'老客忠诚度试点（截击 Dissona 流失风险）\n3. 周五前——决定是否启动 Q3 国潮匠心限定系列（向上突围）",
        "en": "TORY BURCH current diagnosis:\n• Assets (strong): pricing power 70 / price positioning 74 — healthy mid-light-luxury position, ¥2,400-2,800 AOV still validated by market. Design assets (T-Monogram + Cube Bag) retain recognizability.\n• Engine (weak): voice 64 (-2% WoW), content velocity 66 (16pts behind COACH), launch cadence 60 (26pts behind cat leader). Under-investment in operations is the core diagnosis.\n• Mindshare (under pressure): 'light-luxury commuter' share dropped 14% (Q1) → 12% (Q2-to-date). ~12% of 25-35 cohort (~9,600 customers) had Dissona browse / wishlist activity in past 90 days.\nCore tension: assets healthy but engine insufficient. If assets keep eroding without engine investment, will transition to 'brand-decline' phase in 6-9 months (cf. MK 2024 trajectory).\nThree decisions this week (priority order):\n1. Immediate — 'Commuter Capsule' Douyin live (publish by 5/15, GMV target ¥1.2M)\n2. This month — 'Second-Bag VIP' loyalty pilot (intercept Dissona churn risk)\n3. By Friday — go/no-go on Q3 Guochao Craft Limited Series (upmarket break-out)",
    },
}


# ─── Brief (verdict + 3 moves, bilingual) ────────────────────────────────

DEMO_BRIEF = {
    "verdict": {
        "trend": "losing",
        "headline": {
            "zh": "TORY BURCH 在轻奢女包中场遭双向夹击：COACH 奥莱矩阵下压定价锚点，古良吉吉以 +48% 声量蚕食心智份额",
            "en": "TORY BURCH squeezed in mid-light-luxury: COACH outlet matrix anchors pricing downward while 古良吉吉's +48% voice surge erodes mindshare",
        },
        "sentence": {
            "zh": "数据支撑（来源：抖音电商罗盘 2026-05-04 排行榜 + 小红书 7 日 UGC 监测）：\n• COACH 奥莱旗舰过去 7 日 GMV ¥1,800 万 (类目第 2)，平均成交价 ¥1,690→¥1,490 下探 12%。其'轻奢入门'心智份额扩张至 31%（vs 上月 26%）。\n• 古良吉吉本周'国潮 IP 联名 vol.3'限量发售触发 +88% UGC 周环比，¥1,000-1,500 价格带心智份额从 9% 升至 14%（三周累计）。'月光宝盒'单 SKU GMV +180% YoY。\n• Dissona 'NPS 类'指标 +28%——'回购/再买'话语密度达 18%（类目均值 6%）。\n相对于 TORY BURCH 当前¥2,400 平均成交价 + 基线声量 (-2% WoW)，竞争位置正在被三向收紧——保守估算 12 个月内若不调整，将损失约¥18-22M GMV（核心¥1,800-2,800 段年轻客群外流）。",
            "en": "Evidence base (source: Douyin Compass 2026-05-04 leaderboard + 7-day XHS UGC monitoring):\n• COACH 奥莱 旗舰 generated ¥18M GMV in the past 7 days (category #2), avg sale price dropped ¥1,690→¥1,490 (-12%). Their 'light-luxury entry' mindshare share expanded to 31% (vs 26% last month).\n• 古良吉吉's 'guochao IP collab vol.3' limited drop drove +88% UGC WoW, lifting ¥1,000-1,500 mindshare from 9% to 14% over three weeks. 'Moonbox' single-SKU GMV +180% YoY.\n• Dissona 'NPS-style' signals up +28% — rebuy phrase density hit 18% (vs 6% category avg).\nAgainst TORY BURCH's current ¥2,400 avg AOV + baseline voice (-2% WoW), our competitive position is being squeezed three ways. Conservative 12-month projection: ~¥18-22M GMV at risk (younger ¥1,800-2,800 cohort attrition) if no response.",
        },
        "top_action": {
            "zh": "本周关键动作（owner: 张总 / 张某, 截止 Friday EOD）：在¥1,800-2,800 价格带启动'通勤精选'直播专场——5-7 SKU 集中 T-Monogram + Cube Bag，预算¥150K，目标 GMV¥1.2-1.8M、Brand Heat +6 点。赶在 COACH 5/15 母亲节促销窗口前锁定'轻奢通勤'关键词位次。",
            "en": "Top action this week (owner: Brand Director, deadline: Friday EOD): launch a ¥1,800-2,800 'commuter capsule' Douyin live — 5-7 SKUs centered on T-Monogram + Cube Bag, ¥150K budget, GMV target ¥1.2-1.8M, Brand Heat lift target +6 pts. Beat COACH's 5/15 Mother's Day promo window to lock the 'light-luxury commuter' keyword position.",
        },
    },
    "moves": [
        {
            "id": "demo-move-1",
            "brand": "古良吉吉",
            "trend": "losing",
            "impact": "high",
            "headline": {
                "zh": "古良吉吉中端攻势：+48% WoW 声量 + 国潮联名第三波上新（影响：¥3-5M Q3 GMV at risk）",
                "en": "古良吉吉 mid-segment offensive: +48% WoW voice + guochao collab vol.3 (impact: ¥3-5M Q3 GMV at risk)",
            },
            "detail": {
                "zh": "证据：\n• '国潮 IP 联名 vol.3' 限量 200 件 5 分钟内售罄，引发 +88% UGC 周环比\n• '月光宝盒'单 SKU GMV ¥1,280 × 18,200 件 = ¥23.3M（YoY +180%，已超 TORY BURCH Robinson Mini 同类 SKU 的 4.8 倍）\n• 1,000-1,500 元价格带心智份额：9% → 14%（三周累计 +5pp）\n• 典型 UGC：'已经第三个回购了 月光宝盒'、'国潮联名限量发售好惊艳'、'原创设计独家闭眼买'（全部带'独家/原创/国潮'三大心智符号）",
                "en": "Evidence:\n• 'Guochao IP collab vol.3' (200-piece limited drop) sold out in 5 mins, drove +88% UGC WoW\n• 'Moonbox' single-SKU: ¥1,280 × 18,200 units = ¥23.3M GMV (YoY +180%, already 4.8× TORY BURCH's equivalent Robinson Mini)\n• ¥1,000-1,500 mindshare share: 9% → 14% over 3 weeks (+5pp)\n• Representative UGC: 'already on my third Moonbox rebuy', 'guochao collab limited-drop is stunning', 'original design exclusive — eyes-closed buy' — all anchoring on the 'exclusive / original / guochao' triad",
            },
            "so_what": {
                "zh": "战略选项分析（12 个月视角）：\n(A) 副线 / 奥莱线下沉至¥1,500——投资¥4-6M (开发+渠道+营销)，预期年化 GMV¥18-25M，毛利率 38-42%，回本 9-12 个月。风险：稀释主线品牌力。\n(B) 坚守溢价 + 独家联名向上突围——投资¥6-8M（独立设计师 collab + 限量营销），预期年化 GMV¥15-22M，毛利率 55-62%，回本 12-15 个月。风险：执行依赖 IP 资源。\n(C) 双轨并行——投资¥10-14M，回本 18 个月，但同时占领防守 + 进攻位置。\n核心权衡：A 最快回本但伤品牌；B 最高利润率但执行重；C 资源最大但完整。",
                "en": "Strategic options (12-mo lens):\n(A) Outlet / lite-line at ¥1,500 — invest ¥4-6M (product+channel+marketing), expected annualized GMV ¥18-25M at 38-42% margin, payback 9-12 mo. Risk: dilutes main-line brand equity.\n(B) Hold premium + exclusive upmarket collab — invest ¥6-8M (indie-designer collab + limited-marketing), expected GMV ¥15-22M at 55-62% margin, payback 12-15 mo. Risk: execution depends on IP partner availability.\n(C) Dual-track — invest ¥10-14M, payback 18 mo, but covers both defensive + offensive positions.\nCore trade-off: (A) fastest payback hurts brand; (B) highest margin but execution-heavy; (C) most resource-intensive but complete.",
            },
            "action": {
                "zh": "Friday EOD 前完成路径决策（owner: 总经理 + CMO + COO）：\n• 周三 10:00am 召集 90 分钟设计 × 商品 × 渠道对齐会，输入：本简报 + 财务建模\n• 周五 EOD 公布选定路径 + Q3 启动 timeline\n• 下一周一同步内部全员",
                "en": "Decision by Friday EOD (owners: GM + CMO + COO):\n• Wed 10am — 90-min design × merchandising × channel alignment meeting, inputs: this brief + financial modeling\n• Fri EOD — announce chosen path + Q3 launch timeline\n• Mon next week — internal all-hands sync",
            },
        },
        {
            "id": "demo-move-2",
            "brand": "COACH",
            "trend": "losing",
            "impact": "medium",
            "headline": {
                "zh": "COACH 奥莱'春季清仓'下探¥1,490——重定义'轻奢入门'锚点（影响：12% 转化率压力）",
                "en": "COACH outlet 'spring clear' down to ¥1,490 — redefines 'light-luxury entry' anchor (impact: 12% conversion risk)",
            },
            "detail": {
                "zh": "证据：\n• COACH 奥莱旗舰本周平均成交价从¥1,690 降至¥1,490（-12%），4 款新 SKU 加入折扣带（Cassie 19 / Field 30 等）\n• 抖音曝光 2.5-5M，转化率 6.2%（类目均值 2.8%）\n• 单周 GMV ¥1,800 万——本月预计累计¥6,500 万——奥莱单店已超过 TORY BURCH 中国总销售（¥4,200 万/月）\n• 心智份额：'轻奢入门'认知中 COACH 占 31%（+5pp MoM），第二位 MK 17%，TORY BURCH 12%（-2pp MoM）",
                "en": "Evidence:\n• COACH outlet avg sale price ¥1,690 → ¥1,490 (-12%) this week, 4 new SKUs in discount tier (Cassie 19 / Field 30 / etc.)\n• Douyin impressions 2.5-5M, 6.2% conversion (category avg 2.8%)\n• Weekly GMV ¥18M — projected monthly ¥65M — COACH outlet alone now exceeds TORY BURCH's total China sales (¥42M/mo)\n• 'Light-luxury entry' mindshare: COACH 31% (+5pp MoM), MK 17% (#2), TORY BURCH 12% (-2pp MoM)",
            },
            "so_what": {
                "zh": "影响建模：COACH 奥莱¥1,490 锚点会让消费者将'轻奢应值多少'预期下调约¥300-500。TORY BURCH 主力¥2,400-2,800 段消费者中约 18% 已开始货比三家——基于 SimilarWeb 用户路径数据，约 6-9% 会切换。\n年化影响：¥2,400 × 6% × 月活 80K = ¥138K/月转化损失，全年 ¥1.7M——单看转化率，不算品牌资产稀释。\n关键洞察：不能在数字上和 COACH 奥莱拼，必须在'品质叙事'上重新锚定。",
                "en": "Impact modeling: COACH outlet's ¥1,490 anchor will recalibrate consumers' 'what light-luxury should cost' expectations down by ¥300-500. ~18% of TORY BURCH's ¥2,400-2,800 cohort are now comparison-shopping — per SimilarWeb path data, 6-9% will switch.\nAnnualized impact: ¥2,400 × 6% × 80K MAU = ¥138K/mo conversion loss, ¥1.7M/yr — that's just conversion, before brand-equity dilution.\nKey insight: don't compete on numbers with COACH outlet. Re-anchor on quality narrative.",
            },
            "action": {
                "zh": "5/13 前发布的下 3 个视频投放重塑'品质叙事'（owner: 内容 + 创意团队）：\n• 视频 1：意大利头层牛皮制造工厂参观（与 Tory Burch 米兰工坊合作 30 秒短片）\n• 视频 2：'5 年使用对比'——同款 T-Monogram 手提的 1 年/3 年/5 年实物对比，强调耐用性\n• 视频 3：客户故事 × 工艺细节——3 位重度用户讲述'为什么我多花 800 元'\nKPI：3 视频累计曝光 1,500-2,500 万，互动率 5%+，'真皮/工艺/耐用'相关 UGC 提升 +25%。",
                "en": "Reshape quality narrative in next 3 video drops by 5/13 (owner: content + creative):\n• Video 1: Italian top-grain leather factory tour (30-sec short with Tory Burch Milan workshop)\n• Video 2: '5-year wear comparison' — same T-Monogram tote at 1yr/3yr/5yr, emphasizing durability\n• Video 3: Customer stories × craft details — 3 power users explain 'why I paid ¥800 more'\nKPIs: cumulative 15-25M impressions, 5%+ engagement rate, +25% lift in 'real-leather / craft / durable' UGC mentions.",
            },
        },
        {
            "id": "demo-move-3",
            "brand": "Dissona",
            "trend": "losing",
            "impact": "medium",
            "headline": {
                "zh": "Dissona NPS +28%——国货已不是'便宜替代'，是忠诚度威胁（影响：Loyalty Index 差距 8→17）",
                "en": "Dissona NPS +28% — Chinese brands aren't 'cheap substitutes' anymore, they're a loyalty threat (impact: Loyalty Index gap 8→17)",
            },
            "detail": {
                "zh": "证据：\n• Dissona 本周通过会员忠诚度活动 + 老客回购 KOL 矩阵（9 位中腰部）拉动 +142 条正面 UGC\n• '回购/再买/已经第三个'等老客复购语在 Dissona 品牌讨论中密度 18%（vs 类目均值 6%、TORY BURCH 自身 9%）\n• 典型 UGC：'dissona 真的回购第三个了' / '通勤包性价比之王' / '国货精品强推必入'\n• Loyalty Index：Dissona 67 (+12 MoM) | TORY BURCH 50 (-2 MoM) | 差距 8 → 17 点",
                "en": "Evidence:\n• Dissona's loyalty program + 9-mid-tier-KOL repeat-customer campaign drove +142 positive UGC\n• Rebuy phrases ('回购' / '再买' / 'already my third') hit 18% density in their brand discussions (vs 6% category avg, vs TORY BURCH's own 9%)\n• Representative UGC: 'this is my third Dissona purchase', 'commuter-bag value champion', 'must-buy for guochao premium'\n• Loyalty Index: Dissona 67 (+12 MoM) | TORY BURCH 50 (-2 MoM) | gap widened 8 → 17 pts",
            },
            "so_what": {
                "zh": "战略影响：Dissona 已突破'国货=便宜替代'认知边界，在'值得回购'维度上已直接威胁 TORY BURCH。\n• 客户终身价值（LTV）方差：每多 1 个 Dissona-loyal 客户 ≈ 损失 ¥4,200 5 年期价值给 TORY BURCH（基于行业回购率模型）\n• Q2 流失风险：当前 TORY BURCH 25-35 岁客群中，约 12% (≈ 9,600 客户) 在过去 90 天有过 Dissona 浏览或加购行为——如果 Dissona 转化率 6%，理论流失 576 客户 = ¥2.4M LTV at risk\n但还有时间窗口：90 天的浏览-购买 funnel 给我们 4-6 周干预空间。",
                "en": "Strategic impact: Dissona has broken through the 'guochao = cheap substitute' perception ceiling, now competing directly with TORY BURCH on the 'worth-rebuying' dimension.\n• LTV variance: each Dissona-loyal customer = ¥4,200 5-yr-value loss for TORY BURCH (based on industry rebuy-rate models)\n• Q2 churn risk: ~12% of TORY BURCH's 25-35 cohort (~9,600 customers) had Dissona browse / wishlist activity in the past 90 days — if Dissona converts at 6%, that's ~576 customers = ¥2.4M LTV at risk\nBut there's a window: the 90-day browse-to-purchase funnel gives us 4-6 weeks to intervene.",
            },
            "action": {
                "zh": "5 月内启动'第二个包礼遇' Q2 试点（owner: CRM 团队 + 产品营销）：\n• 选定 50 位 LTV >¥10K 的高价值老客作为种子\n• 优惠机制：购买第二个包享赠送同色丝巾 (售价¥350) + VIP 客服一对一\n• 跟踪 KPI：30 天内复购转化率 ≥30%（行业基线 8%）；NPS 提升 +5 点；'回购'语 UGC 提升 +40%\n• 6 月 1 日复盘扩大至 500 客户",
                "en": "May pilot 'second-bag VIP gift' Q2 program (owners: CRM + product marketing):\n• Select 50 LTV >¥10K high-value repeat customers as the seed cohort\n• Incentive mechanic: buy a 2nd bag → matching-color silk scarf (¥350 retail) + VIP 1:1 service\n• KPIs: 30-day repurchase rate ≥30% (industry baseline 8%); NPS +5 pt lift; 'rebuy' UGC +40%\n• June 1 review → scale to 500 customers if KPIs hit",
            },
        },
    ],
    "_data_sources": [
        "Douyin 电商罗盘 (Compass) — 女包品类 7 日排行榜 (2026-05-04)",
        "小红书 UGC 监测 — 14 brand × 7-day window (2026-04-28 to 2026-05-04)",
        "SimilarWeb — bag-category cross-domain user paths (Q1 2026)",
        "Tory Burch CRM — 25-35 yo cohort browse-purchase funnel (90d trailing)",
        "Industry rebuy-rate model — Bain 2025 China Premium Accessories Outlook",
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
        "zh": "Tory Burch × 国潮匠心限定系列（200-SKU 试水版）",
        "en": "Tory Burch × Guochao Craft Limited Series (200-SKU pilot)",
    },
    "positioning": {
        "zh": "概念：与 2-3 位中国独立设计师 + 1 个博物馆 IP（候选：故宫文创、上海博物馆、西安碑林）合作，推出 200 件限量 SKU，定价 ¥3,500-4,800。设计语言：保留 T-Monogram 现代极简骨架 + 注入苏绣/漆器/榫卯等传统工艺细节。\n目标客群：核心 TORY BURCH 25-35 岁女性 + 边缘渗透 30-40 段高知群体。她们想要'轻奢但拒绝同质化'，目前在 Loewe Puzzle / Bottega Padded Cassette 这类¥10K+ 段被价格挡在门外。\n卡位：填补 COACH 不做、MK 不会做、MCM 做不动的¥3,500+ 段轻奢 collab 空白。",
        "en": "Concept: collab with 2-3 Chinese independent designers + 1 museum IP (candidates: Forbidden City Cultural, Shanghai Museum, Xi'an Stele Forest), 200-piece limited drop at ¥3,500-4,800. Design language: T-Monogram modern-minimal silhouette as the chassis + Suzhou embroidery / lacquer / mortise-tenon detailing as the soul.\nTarget cohort: core TORY BURCH 25-35 women + edge expansion to 30-40 high-education segment. They want 'light-luxury without homogenization' but are priced out of Loewe Puzzle / Bottega Padded Cassette (¥10K+).\nPositioning: fill the unclaimed ¥3,500+ light-luxury collab segment that COACH won't do, MK can't do, MCM has gone quiet on.",
    },
    "why_now": {
        "zh": "战略时机分析：\n• 市场窗口：独立设计师 × 国潮工艺合作款在小红书'非大牌'话题下 UGC YoY +47%。同期¥3,500+ 价格带在该话题中仍是供给空白（仅 3 个独立品牌少量供给，无主流轻奢入场）。\n• 心智时机：消费者对古良吉吉级别 (¥1,000-1,500) 的 IP 联名已建立认知（+88% UGC 周环比验证），但向上一档（¥3,500+）尚无形象——这是认知阶梯的'下一个空房间'。\n• 竞争窗口：MCM 的¥4,000+ 客单价已经 14% 销量下滑，腾出心智空间。COACH 战略上锁定¥1,500-2,500 入门段，向上突破不在他们 2026 路线图。\n投资 / 回报建模：\n• 总投资估算：¥6.8M（设计师合约¥1.2M / IP 授权费¥800K / 限量营销¥2.5M / 备货 200 件 × 平均成本¥1,800 = ¥360K / 渠道+物流¥1.2M / 缓冲¥720K）\n• 收入预测：200 SKU × ¥4,200 平均售价 × 售罄率 95% = ¥798K 直接销售 + 长尾'光环效应'估值¥4-6M（基于古良吉吉单系列 collab 后 6 个月主线产品 +18% 转化的同类型增量）\n• 回本期：18-22 个月（如果只看直接销售则负，必须算光环效应）\n• 风险下行：限量未售罄（< 70%）情况下投资回收期延至 30 个月；IP 合作终止违约金最高¥1.5M\n关键判断：这不是收益最大化决策，是战略卡位决策——目的是抢¥3,500+ 心智位置，使古良吉吉无法向上突破，且 COACH 不愿跟随。",
        "en": "Strategic timing:\n• Market window: independent-designer × guochao-craft collabs are +47% YoY UGC on XHS in 'non-mega-brand' threads. The ¥3,500+ band remains supply-void in that conversation (only 3 indie brands with sparse supply, no mainstream light-luxury entries).\n• Mindshare timing: consumers already accept 古良吉吉-tier (¥1,000-1,500) IP collabs (+88% UGC WoW validation), but the next tier up (¥3,500+) has no incumbent — this is the 'next empty room' on the perception ladder.\n• Competitive window: MCM's ¥4,000+ AOV is -14% YoY, vacating mindshare. COACH is strategically locked into the ¥1,500-2,500 entry segment — upmarket isn't on their 2026 roadmap.\nInvestment / return modeling:\n• Total investment: ~¥6.8M (designer contracts ¥1.2M / museum IP licensing ¥800K / limited-edition marketing ¥2.5M / 200 units × ¥1,800 avg cost = ¥360K / channel + logistics ¥1.2M / buffer ¥720K)\n• Revenue forecast: 200 SKUs × ¥4,200 avg price × 95% sell-through = ¥798K direct sales + long-tail 'halo effect' estimated ¥4-6M (based on 古良吉吉 single-collab 6-mo follow-on +18% main-line conversion lift)\n• Payback: 18-22 mo (negative on direct sales alone — only works counting halo)\n• Downside scenario: <70% sell-through extends payback to 30 mo; IP partnership exit penalty up to ¥1.5M\nCore judgment: this is NOT a revenue-max decision, it's a strategic-position decision — claim the ¥3,500+ mindshare seat so 古良吉吉 can't move up and COACH won't want to.",
    },
    "signals": [
        {"label": "独立设计师 UGC YoY (XHS)", "value": "+47%"},
        {"label": "TORY BURCH 核心客群占比", "value": "62% in 25-35 yo segment"},
        {"label": "限量营销 XHS CTR", "value": "8.4% vs 常规 2.1% (4× lift)"},
        {"label": "古良吉吉国潮联名转化率", "value": "12.8% (validates demand)"},
        {"label": "¥3,500+ collab 空白竞品数", "value": "0 mainstream brands"},
        {"label": "故宫文创历史合作 ROI", "value": "1.4-2.2× (vs 1.0× brand avg)"},
        {"label": "MCM ¥4,000+ 段年下滑", "value": "-14% YoY (vacating space)"},
    ],
    "target_price": "¥3,500-4,800 (avg ¥4,200)",
    "target_channels": ["小红书 (限量预售)", "抖音 (Hero 视频)", "Tmall 旗舰店 (品牌区)", "线下精品店 5-8 家 (Tier 1 城市)"],
    "launch_timeline": {
        "zh": "Q3 2026 timeline：\n• 6/15-7/30：3 位设计师候选评估 + 2 个 IP 候选谈判\n• 8/1-9/15：合约签订 + 设计稿 + 打样\n• 9/16-10/20：生产 + 营销内容拍摄\n• 10/21-11/8：限量预售（小红书 + 抖音）\n• 11/9-11/15：双 11 主战 + 线下精品店 launch\n• 11/16+：售后客户调研 → 12/15 决策是否扩展至 1,000 SKU 大批次",
        "en": "Q3 2026 timeline:\n• 6/15-7/30: Designer candidate evaluation (3 finalists) + IP partner negotiation (2 candidates)\n• 8/1-9/15: Contract sign + design + prototyping\n• 9/16-10/20: Production + marketing content shoot\n• 10/21-11/8: Limited pre-sale (XHS + Douyin)\n• 11/9-11/15: Double-11 main push + offline boutique launch\n• 11/16+: Post-sale customer research → 12/15 go/no-go on scaling to 1,000-SKU full launch",
    },
}


# ─── White space (3 opportunities, bilingual) ────────────────────────────

DEMO_WHITE_SPACES = [
    {
        "title": {"zh": "Cinch 收口轻奢通勤包系列", "en": "Cinch closure light-luxury commuter line"},
        "summary": {
            "zh": "全行业空白：cinch / drawstring 收口结构在中国轻奢女包品类完全无供给。同款结构在欧美轻奢市场已建立趋势位（Coach Soho 系列累计销售¥45M USD 全球，Mansur Gavriel cinch tote 进入 Vogue 2025 春季 5 大单品榜），但中国市场仅 3 个独立设计师品牌少量供给（累计可见 SKU 17 件，月销总量 ≈ 800）。\n机会窗口规模：基于全球同款扩散滞后 12-18 个月模型，中国市场该结构需求将在 Q4 2026 - Q1 2027 进入爆发期，先入者可锁定 18-24 个月品类心智优势。",
            "en": "Industry-wide white space: cinch / drawstring silhouette has zero supply in China's light-luxury handbag category. The same structure has established trend status in US/EU light-luxury (Coach Soho cumulative ¥45M USD global, Mansur Gavriel cinch tote made Vogue 2025 spring top-5), but China has only 3 indie-designer brands offering it (17 SKUs total, ~800 units/mo).\nWindow size: based on the typical 12-18mo global-trend diffusion-to-China lag, this structure will enter peak demand Q4 2026 - Q1 2027. First mover locks 18-24 months of category mindshare leadership.",
        },
        "category": "dimension",
        "score": 78,
        "reasoning": {
            "zh": "为什么 78 分（高优先）：\n• 需求验证：同款在欧美已超越 trend → 进入主流，中国市场同步压力高\n• 供给空白：6 大主流轻奢均无布局（COACH/MK/Tory Burch/Coach Outlet/Dissona/MCM 全数零供给）\n• 与 TORY BURCH 资产协同：T-Monogram + 软质牛皮工艺已成熟，无需新工艺投入；现有 Tote 矩阵互补不冲突\n• 竞争预警：COACH 全球已经在 Soho 系列上有积累，2026 Q3 大概率会引入中国——我们必须 Q3 前先行\n• 风险下行：研发周期长（90-120 天），如果 6 个月后仍无销量验证，沉没成本约¥800K",
            "en": "Why 78 (high priority):\n• Demand validation: structure has moved from trend → mainstream in US/EU, putting China-sync pressure high\n• Supply void: all 6 major light-luxury brands absent (COACH / MK / Tory Burch / Coach Outlet / Dissona / MCM — zero supply)\n• Asset synergy with TORY BURCH: T-Monogram + soft-leather craft is mature, no new tooling needed; existing Tote matrix complements rather than conflicts\n• Competitive warning: COACH has the structure globally via Soho line, very likely to introduce in China Q3 2026 — we must move before Q3\n• Downside: 90-120 day R&D cycle; if no sales validation in 6 months, sunk cost ~¥800K",
        },
        "supporting": [
            {"label": "中国在售 cinch SKU 数", "value": "17 (全部独立设计师)"},
            {"label": "全球同款 UGC YoY (Mansur Gavriel)", "value": "+128%"},
            {"label": "主流轻奢竞品布局", "value": "0/6 brands"},
            {"label": "全球→中国趋势扩散滞后", "value": "12-18 mo (历史均值)"},
            {"label": "COACH Soho 系列全球累计销售", "value": "¥45M USD"},
            {"label": "Vogue 2025 春季单品榜入选", "value": "Yes (Mansur Gavriel)"},
        ],
        "suggested_action": {
            "zh": "动作：Q4 2026 推出 Tory Burch Cinch Tote 试水款。\n• SKU：1 款 × 4 色 (黑 / 棕 / 米 / 限定姜黄)，定价¥2,400\n• 投资：开发¥800K (设计 + 模具) + 营销¥600K + 渠道¥400K = ¥1.8M\n• KPI：6 周售罄 80% / 累计 GMV ¥1.2M / 'cinch'/'抽绳'相关 UGC 提升 +200%\n• 后续：6 周复盘后扩充至 4 SKU × 6 色（如达标）",
            "en": "Action: Q4 2026 pilot Tory Burch Cinch Tote.\n• SKU: 1 model × 4 colors (black / brown / cream / limited turmeric), ¥2,400\n• Investment: development ¥800K (design + tooling) + marketing ¥600K + channel ¥400K = ¥1.8M\n• KPIs: 80% sell-through in 6 weeks / cumulative GMV ¥1.2M / 'cinch' / '抽绳' UGC +200%\n• Next: 6-wk review → expand to 4 SKU × 6 colors if targets hit",
        },
    },
    {
        "title": {"zh": "City Walk 周末-通勤双场景关键词", "en": "City Walk weekend-commuter dual-scenario keyword"},
        "summary": {
            "zh": "'City Walk'话题在小红书过去 12 个月 UGC +84%，相关搜索量月均 380K（女性用户占 67%）。但相关包款搜索结果中：\n• 户外品牌（TNF/Salomon/Patagonia）占 62%\n• 大牌奢侈品（LV/PRADA Re-Edition）占 18%\n• 轻奢轻便包款占 0% — 完整空白\n洞察：'通勤 + 周末出行 + 城市探索'融合场景需求未被满足——25-35 岁年轻女性想要'一包多用'但拒绝户外包的运动调性，也不愿带¥10K+ 大牌包跑户外。¥1,800-2,800 段轻奢轻便包是缺口。",
            "en": "'City Walk' XHS UGC +84% over past 12 months; related search volume avg 380K/mo (67% female). But related bag-search results break down as:\n• Outdoor brands (TNF / Salomon / Patagonia): 62%\n• Big-luxury (LV / PRADA Re-Edition): 18%\n• Light-luxury soft-utility bags: 0% — complete white space\nInsight: 'commuter + weekend outing + urban exploration' fused-scenario demand isn't met. 25-35 yo women want 'one-bag-for-many-uses' but reject outdoor's athletic tone, and won't carry ¥10K+ luxury for casual urban activity. ¥1,800-2,800 light-luxury soft-utility bags is the gap.",
        },
        "category": "keyword",
        "score": 72,
        "reasoning": {
            "zh": "为什么 72 分：\n• 需求规模：380K/月 search × 67% 女性 × 约 18% 购买意向 ≈ 45K/月有效需求池\n• 关键词卡位机会：'City walk 包' 在小红书目前无主流轻奢账号占据 SEO 头位\n• TORY BURCH 资产匹配度：McGraw Slouchy Hobo 与 T-Monogram Cube Bag 已具备产品适配性，无需新开发——纯营销动作即可\n• 风险：'City walk' 是文化趋势可能在 12-18 个月褪色（参照 2023 'cottagecore' 退潮模式），不宜重投资\n• 决策建议：低投入快速试 — ¥150-300K 内容预算，6 周看转化率，赢则扩，败则止损",
            "en": "Why 72:\n• Demand scale: 380K/mo searches × 67% female × ~18% purchase intent ≈ 45K/mo addressable demand pool\n• Keyword window: 'City walk bag' has no mainstream light-luxury brand currently occupying SEO top slots on XHS\n• Asset fit: McGraw Slouchy Hobo + T-Monogram Cube Bag already have product fit — pure marketing motion, no new SKU needed\n• Risk: 'City walk' is a cultural trend that may fade in 12-18 mo (cf. 2023 'cottagecore' burnout) — don't over-invest\n• Recommendation: low-budget fast test. ¥150-300K content budget, 6-week conversion read, scale on win / cut on miss",
        },
        "supporting": [
            {"label": "City walk XHS UGC YoY", "value": "+84%"},
            {"label": "月均搜索量 (女性用户)", "value": "≈254K (380K × 67%)"},
            {"label": "搜索结果中轻奢占比", "value": "0%"},
            {"label": "TORY BURCH 现有适配 SKU 数", "value": "2 (McGraw, Cube Bag)"},
            {"label": "趋势预期半衰期", "value": "12-18 mo (参照 cottagecore)"},
            {"label": "竞品已布局数", "value": "0/6 主流轻奢"},
        ],
        "suggested_action": {
            "zh": "动作：5 月内启动'McGraw × City Walk'内容主题专项。\n• 内容：6 支 60-90 秒短片（周末户外 ×3 / 周一通勤 ×3，'晚上 9 点的复盘'式叙事）\n• KOL：12 位中尾部博主（生活方式垂类，粉 5-50K 区间）\n• 投资：¥220K 总（内容¥150K + 投流¥50K + KOL¥20K）\n• KPI：'McGraw'/'city walk' 相关 UGC +150% / 关联 SKU 月销提升 +25% / 'McGraw'品类联想 +12pp\n• 6 周复盘后扩展或停止",
            "en": "Action: launch 'McGraw × City Walk' content theme this May.\n• Content: 6 short videos 60-90s each (weekend-outdoor ×3 / Monday-commuter ×3, '9pm reflection' narrative format)\n• KOLs: 12 mid-tail lifestyle creators (5-50K followers)\n• Investment: ¥220K total (content ¥150K + paid distribution ¥50K + KOL ¥20K)\n• KPIs: 'McGraw' / 'city walk' UGC +150% / linked SKU monthly sales +25% / 'McGraw' category association +12pp\n• 6-week review → scale or kill",
        },
    },
    {
        "title": {"zh": "¥3,500+ 国潮匠心联名 × 博物馆 IP", "en": "¥3,500+ Guochao Craft × Museum IP collab"},
        "summary": {
            "zh": "战略空白：¥3,500+ 价格带的国潮匠心 × 博物馆 IP 联名在中国轻奢手袋类目完全无供给。验证信号：\n• 古良吉吉¥1,200-1,800 段联名销售已证明需求侧刚性（'国潮 IP 联名 vol.3'限量¥1,890 × 200 件 5 分钟内售罄）\n• 上行价格弹性：故宫文创跨品类联名历史数据，¥1,500 → ¥3,800 段商品溢价支付意愿仍达 78%\n• 主流轻奢全数缺席（COACH/MK/Tory Burch/Coach Outlet/MCM/Dissona 均无博物馆/独立设计师 IP 联名 SKU 在售）\n这不是竞争激烈的 red ocean，是有需求验证但供给空缺的 blue ocean。",
            "en": "Strategic white space: ¥3,500+ Guochao Craft × Museum IP collabs are completely absent in China's light-luxury handbag category. Validation signals:\n• 古良吉吉's ¥1,200-1,800 collab proves demand-side rigidity ('Guochao IP collab vol.3' ¥1,890 × 200 units sold out in 5 mins)\n• Upmarket price elasticity: Forbidden City Cultural cross-category collab historical data shows 78% willingness-to-pay holds from ¥1,500 → ¥3,800 segments\n• All major light-luxury absent (COACH / MK / Tory Burch / Coach Outlet / MCM / Dissona — zero museum / indie-designer IP collab SKUs)\nThis isn't a competitive red ocean. It's a demand-validated, supply-vacant blue ocean.",
        },
        "category": "channel",
        "score": 81,
        "reasoning": {
            "zh": "为什么 81 分（最高）：\n• 战略价值最高：单纯销售收益不大（限量 200 SKU × ¥4,200 = ¥840K 直接销售），但'光环效应'估值¥4-6M（参照古良吉吉单系列 collab 后 6 个月主线产品 +18% 转化的同类型增量）\n• 不可被简单跟随：博物馆 IP 谈判周期 6-9 个月，独立设计师合约谈判 3-4 个月——COACH 即使 2026 Q3 决定跟进，最早 Q1 2027 才能上市\n• 与 Brief Move #1 战略选项 (B) 完全锁定——这是'保守溢价'路径的具体落地\n• 风险下行：sold-through < 70% 情况下投资回收期延至 30 个月（详见 Product Opportunity 完整 P&L 建模）\n• 对应 Product Opportunity 概念：'Tory Burch × 国潮匠心限定系列'",
            "en": "Why 81 (highest):\n• Highest strategic value: direct revenue is small (200 limited SKUs × ¥4,200 = ¥840K direct sales), but 'halo effect' valued at ¥4-6M (based on 古良吉吉's single-collab 6-mo follow-on +18% main-line conversion lift)\n• Hard to copy fast: museum IP negotiation cycle 6-9 months, indie-designer contracts 3-4 months — even if COACH decides to enter Q3 2026, earliest market is Q1 2027\n• Locks in Brief Move #1 strategic option (B) — concrete execution for the 'hold premium' path\n• Downside: <70% sell-through extends payback to 30 mo (see Product Opportunity for full P&L modeling)\n• Maps to Product Opportunity concept: 'Tory Burch × Guochao Craft Limited Series'",
        },
        "supporting": [
            {"label": "古良吉吉国潮联名 GMV YoY", "value": "+180%"},
            {"label": "¥3,500+ 国潮联名供给", "value": "0 brands (空白)"},
            {"label": "故宫文创联名跨品类历史 ROI", "value": "1.4-2.2× (品牌均值 1.0)"},
            {"label": "古良吉吉'vol.3'200 件售罄时间", "value": "5 分钟"},
            {"label": "上行价格弹性 (¥1,500→¥3,800)", "value": "78% 支付意愿保持"},
            {"label": "竞品上市最早时间", "value": "Q1 2027 (即使现在启动)"},
            {"label": "对应 Product Opportunity", "value": "国潮匠心限定系列 (200 SKU)"},
        ],
        "suggested_action": {
            "zh": "动作：本周启动博物馆 IP + 独立设计师候选评估（Q3 上市目标）。详见 Product Opportunity 完整 timeline。\n• 6/15 前：候选名单（3 IP + 3 设计师）\n• 7/30 前：合约签订（至少 1 IP + 2 设计师）\n• 8/15 前：设计稿冻结\n• 11/8 前：限量预售\n• 11/15 前：双 11 主战 + 线下精品店\n• 12/15：复盘 → 决定是否扩展至 1,000 SKU",
            "en": "Action: launch museum IP + indie-designer candidate evaluation this week (Q3 launch target). See Product Opportunity for full timeline.\n• By 6/15: candidate shortlist (3 IPs + 3 designers)\n• By 7/30: contracts signed (at least 1 IP + 2 designers)\n• By 8/15: design freeze\n• By 11/8: limited pre-sale\n• By 11/15: Double-11 main push + offline boutique\n• 12/15: review → go/no-go on scaling to 1,000 SKU",
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


# Allowlist of `workspaces.brand_name` values that the seeder is willing
# to overwrite. New demo workspaces start with empty / placeholder names
# from onboarding, so accepting "" + the demo own-brand are reasonable.
# If you intentionally want to re-seed an already-set demo workspace
# (e.g. brand_name = "TORY BURCH"), that's allowlisted too.
#
# This guards against operator error: passing the wrong --workspace-id
# (e.g. a real customer's UUID) would otherwise silently overwrite their
# CI data. With the allowlist, the seeder refuses unless the target's
# current name matches what we expect for a fresh demo slot.
SEED_ALLOWLIST_NAMES = {
    "",
    "TORY BURCH",
    "Tory Burch",
    "tory burch",
    # Common onboarding placeholders we've seen in test data
    "OMI",
    "Testing 5.4",
    "Testing 5.3",
}


def seed_demo_workspace(workspace_id, dry_run=False, override=False):
    """
    Idempotently seed the target workspace with demo data.

    Operations are wrapped in a single transaction. If anything fails
    mid-way, the workspace is left untouched. After commit, calls
    composite_indices.compute_all_for_workspace() to derive the 12
    composite indices from the seeded analysis_results.

    Refuses to run unless `workspace.brand_name` is in
    SEED_ALLOWLIST_NAMES — pass `override=True` (CLI: --override) to
    bypass for legit cases (e.g. seeding a workspace that's been
    manually renamed for some other test).
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
            print(f"        brand_name    = {ws['brand_name']!r}")
            print(f"        user_id       = {ws['user_id']}")
            print(f"        → will overwrite to brand_name = {DEMO_OWN_BRAND}")
            print(f"        → seeding {len(DEMO_COMPETITORS)} competitors + own brand")

            current_name = (ws["brand_name"] or "").strip()
            if current_name not in SEED_ALLOWLIST_NAMES and not override:
                print(f"[demo] ✗ REFUSING TO RUN — workspace's current brand_name {ws['brand_name']!r} is "
                      f"not in the seeder allowlist. This safety check prevents accidentally "
                      f"overwriting a real customer's data with the demo dataset.")
                print(f"[demo]   Allowlisted names: {sorted(SEED_ALLOWLIST_NAMES)}")
                print(f"[demo]   To bypass (only if you're certain), pass --override.")
                sys.exit(2)

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
    parser.add_argument("--override", action="store_true",
                        help="Bypass the brand_name allowlist safety check. Only use if you're "
                             "certain you want to overwrite a non-standard workspace.")
    args = parser.parse_args()

    seed_demo_workspace(args.workspace_id, dry_run=not args.confirm, override=args.override)


if __name__ == "__main__":
    main()
