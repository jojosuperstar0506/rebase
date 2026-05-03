"""
Composite-index compute layer — 12 user-facing indices in 3 pillars.

Reads the latest per-(competitor, metric_type) row from analysis_results,
optionally enriched by scraped_brand_profiles + scraped_products, and
computes 12 composite indices that map to SPEC-COMPOSITE-INDICES-V1.md §4.

Run AFTER all metric pipelines in the analysis chain. The orchestrator's
Stage 8 invokes:

    python -m services.competitor_intel.composite_indices --workspace-id UUID

Same-day reruns delete prior rows for the (workspace, competitor, index_name,
index_version, today) tuple before insert — keeps the table clean without a
hard UNIQUE constraint that would block historical chains.

Versioning policy: bump INDEX_VERSION when the formula or input set changes.
Weight tweaks bump to a patch version (e.g. v1.0 → v1.0.1).

Inputs that aren't available today fall back to neutral defaults (50) and
the index_version is suffixed with `-proxy` so the API/UI can render an
honest "Coverage pending" badge instead of pretending we have full data.

Spec: SPEC-COMPOSITE-INDICES-V1.md §4-§7
"""

import argparse
import json
import math
import re
import sys
import traceback
from collections import Counter, defaultdict

from .db_bridge import get_conn, VALID_PROFILE_FILTER
from .index_hierarchy import INDEX_TO_PILLAR

# Per-index version. v1.0 across the board on initial ship; bump when
# formula or input set changes per spec §11.
INDEX_VERSION = "v1.0"


# ─── Regex banks (used by NPS, Loyalty, Innovation, Hero Product) ────────
# Why regex on text fields and not full classifiers: shippable today, no
# additional ML pipeline. Move to a proper sentiment classifier when the
# note-feed scrape (J1 burner) lands and we have document-level text to
# classify rather than top_ugc keyword strings.

RECOMMENDATION_PATTERNS = re.compile(
    r"(推荐|必入|回购|种草|安利|闭眼买|无限回购|强推|爱不释手|入手不亏)"
)
DETRACTOR_PATTERNS = re.compile(
    r"(避雷|踩雷|不推荐|退货|不值|失望|后悔|质量差|拉胯|翻车)"
)
RETURN_PURCHASE_PATTERNS = re.compile(r"(回购|再买|二次购买|又买了|继续买)")
COLLAB_PATTERNS = re.compile(r"(联名|限量|联合发售|联名款|跨界|合作款|限定)")
BRAND_FIRST_PATTERNS = re.compile(r"(首发|全球首款|独家|首款|首次)")
SOLDOUT_PATTERNS = re.compile(r"(卖断货|已售罄|断货|再补货|售罄|缺货|秒空)")


# ─── Helpers ─────────────────────────────────────────────────────────────

def clamp(value, lo=0, hi=100):
    """Clamp a numeric to a range. Falls back to (lo+hi)/2 on None."""
    if value is None:
        return (lo + hi) // 2
    try:
        v = float(value)
    except (TypeError, ValueError):
        return (lo + hi) // 2
    return max(lo, min(hi, v))


def normalize_pct_to_100(pct):
    """Map a -100..+100 percentage delta to a 0..100 score (50 = no change)."""
    if pct is None:
        return 50
    try:
        v = float(pct)
    except (TypeError, ValueError):
        return 50
    return max(0, min(100, 50 + v / 2))


def safe_get(d, *keys, default=None):
    """Walk nested dicts safely; return default on any miss."""
    cur = d
    for k in keys:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(k)
        if cur is None:
            return default
    return cur


def text_match_density(patterns, items):
    """
    Return the fraction (0-1) of items in `items` (list of strings or dicts
    with text-bearing fields) whose text matches the regex `patterns`.

    Used by the regex-based proxy inputs (NPS recommendation density, etc.)
    for indices whose full inputs are blocked on note-feed scrape.
    """
    if not items:
        return 0.0
    hits = 0
    total = 0
    for item in items:
        text = ""
        if isinstance(item, str):
            text = item
        elif isinstance(item, dict):
            for k in ("text", "title", "content", "comment"):
                v = item.get(k)
                if v:
                    text += " " + str(v)
        if not text:
            continue
        total += 1
        if patterns.search(text):
            hits += 1
    if total == 0:
        return 0.0
    return hits / total


# ─── Data loader ─────────────────────────────────────────────────────────

def load_competitor_data(cur, workspace_id):
    """
    Bundle everything the compute functions need for one workspace into a
    dict keyed by competitor_name. One round-trip per data source.

    Returns:
      {
        competitor_name: {
          'metrics': {metric_type: {'score': float, 'raw_inputs': dict}, ...},
          'profile': latest scraped_brand_profiles row or None,
          'products': list of recent scraped_products,
        },
        ...
      }
    """
    cur.execute(
        """
        SELECT brand_name FROM workspace_competitors
         WHERE workspace_id = %s
        """,
        (workspace_id,),
    )
    competitor_names = [r["brand_name"] for r in cur.fetchall()]

    # Latest analysis_results row per (competitor, metric_type)
    cur.execute(
        """
        SELECT DISTINCT ON (competitor_name, metric_type)
               competitor_name, metric_type, score, raw_inputs
          FROM analysis_results
         WHERE workspace_id = %s
         ORDER BY competitor_name, metric_type, analyzed_at DESC
        """,
        (workspace_id,),
    )
    metrics_by_brand = defaultdict(dict)
    for row in cur.fetchall():
        raw = row["raw_inputs"]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except Exception:
                raw = {}
        metrics_by_brand[row["competitor_name"]][row["metric_type"]] = {
            "score": float(row["score"]) if row["score"] is not None else 0.0,
            "raw_inputs": raw or {},
        }

    # Latest valid profile per brand
    profiles_by_brand = {}
    for brand in competitor_names:
        cur.execute(
            f"""
            SELECT * FROM scraped_brand_profiles
             WHERE brand_name = %s AND {VALID_PROFILE_FILTER}
             ORDER BY scraped_at DESC LIMIT 1
            """,
            (brand,),
        )
        row = cur.fetchone()
        if row:
            profiles_by_brand[brand] = row

    # Last 90 days of products per brand
    products_by_brand = defaultdict(list)
    cur.execute(
        """
        SELECT brand_name, product_name, price, original_price,
               sales_volume, scraped_at, material_tags, category
          FROM scraped_products
         WHERE brand_name = ANY(%s)
           AND scraped_at > NOW() - INTERVAL '90 days'
         ORDER BY brand_name, scraped_at DESC
        """,
        (competitor_names,),
    )
    for row in cur.fetchall():
        products_by_brand[row["brand_name"]].append(row)

    bundle = {}
    for brand in competitor_names:
        bundle[brand] = {
            "metrics": dict(metrics_by_brand.get(brand, {})),
            "profile": profiles_by_brand.get(brand),
            "products": list(products_by_brand.get(brand, [])),
        }
    return bundle


# ─── 12 compute functions ────────────────────────────────────────────────
# Each returns:
#   {
#     'score': float,           # 0-100 (or -100..+100 for Brand NPS)
#     'inputs': dict,           # the actual input values used
#     'weights': dict,          # the weight applied to each input
#     'explain_text': {'zh': [...], 'en': [...]},
#     'is_proxy': bool,         # True when computed from fallback data
#   }


# ── 4.1 Brand Heat ────────────────────────────────────────────────────────
def compute_brand_heat(brand_data):
    voice = brand_data["metrics"].get("voice_volume", {}).get("score", 0)
    voice_raw = brand_data["metrics"].get("voice_volume", {}).get("raw_inputs", {})
    mindshare = brand_data["metrics"].get("consumer_mindshare", {}).get("score", 0)
    mind_raw = brand_data["metrics"].get("consumer_mindshare", {}).get("raw_inputs", {})

    # Sentiment polarity proxy: positive_keywords vs negative_keywords ratio
    pos_kw = mind_raw.get("positive_keywords") or []
    neg_kw = mind_raw.get("negative_keywords") or []
    if pos_kw or neg_kw:
        sentiment_signal = (len(pos_kw) - len(neg_kw)) / max(1, len(pos_kw) + len(neg_kw))
    else:
        sentiment_signal = 0
    sentiment_score = clamp(50 + sentiment_signal * 50)

    # UGC volume slope proxy: voice_volume's content_growth (or follower_growth)
    ugc_slope = voice_raw.get("content_growth") or voice_raw.get("follower_growth") or 0
    ugc_score = normalize_pct_to_100(ugc_slope)

    weights = {
        "voice_volume_score": 0.40,
        "consumer_mindshare_score": 0.25,
        "sentiment_polarity": 0.20,
        "ugc_volume_slope": 0.15,
    }
    score = (
        weights["voice_volume_score"] * voice
        + weights["consumer_mindshare_score"] * mindshare
        + weights["sentiment_polarity"] * sentiment_score
        + weights["ugc_volume_slope"] * ugc_score
    )

    return {
        "score": round(score, 1),
        "inputs": {
            "voice_volume_score": round(voice, 1),
            "consumer_mindshare_score": round(mindshare, 1),
            "sentiment_polarity_score": round(sentiment_score, 1),
            "ugc_volume_slope_pct": round(float(ugc_slope or 0), 1),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"声量得分 {voice:.0f}（权重 40%）",
                f"消费者心智 {mindshare:.0f}（权重 25%)",
                f"情感倾向得分 {sentiment_score:.0f}（权重 20%)",
                f"UGC 量斜率 {float(ugc_slope or 0):+.1f}%（权重 15%)",
            ],
            "en": [
                f"Voice volume: {voice:.0f} (weight 40%)",
                f"Consumer mindshare: {mindshare:.0f} (weight 25%)",
                f"Sentiment polarity score: {sentiment_score:.0f} (weight 20%)",
                f"UGC volume slope: {float(ugc_slope or 0):+.1f}% (weight 15%)",
            ],
        },
        "is_proxy": False,
    }


# ── 4.2 Brand NPS ─────────────────────────────────────────────────────────
def compute_brand_nps(brand_data):
    """Output range: -100 to +100. UI displays explicit minus prefix."""
    mind = brand_data["metrics"].get("consumer_mindshare", {})
    raw = mind.get("raw_inputs", {})

    # Sentiment ratio is 0-1 (prop positive). Convert to a ±1 signal.
    sentiment_ratio = raw.get("sentiment_ratio", 0.5)
    sentiment_signal = (float(sentiment_ratio) - 0.5) * 2

    # Recommendation/detractor density via regex on top_ugc snippets
    top_ugc = raw.get("top_ugc") or []
    pos_kw = raw.get("positive_keywords") or []
    neg_kw = raw.get("negative_keywords") or []
    rec_density = text_match_density(RECOMMENDATION_PATTERNS, top_ugc + pos_kw)
    det_density = text_match_density(DETRACTOR_PATTERNS, top_ugc + neg_kw)

    # Comment depth — capped at 50 comments/note for score scaling
    avg_comments = float(raw.get("avg_comments_per_note") or raw.get("avg_comments") or 0)
    comment_score = min(1.0, avg_comments / 50.0)

    weights = {
        "sentiment_signal": 0.35,
        "recommendation_density": 0.30,
        "comment_depth": 0.20,
        "detractor_density": -0.15,
    }
    raw_signal = (
        weights["sentiment_signal"] * sentiment_signal
        + weights["recommendation_density"] * rec_density
        + weights["comment_depth"] * comment_score
        + weights["detractor_density"] * det_density
    )
    score = max(-100, min(100, round(raw_signal * 100, 1)))

    # Proxy flag: regex on top_ugc snippets is a stand-in for full
    # note-feed sentiment classifier. Score is honest but conservative
    # until burner work lights up the richer inputs.
    is_proxy = not top_ugc

    return {
        "score": score,
        "inputs": {
            "sentiment_ratio": round(float(sentiment_ratio), 2),
            "recommendation_density": round(rec_density, 3),
            "detractor_density": round(det_density, 3),
            "avg_comments_per_note": round(avg_comments, 1),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"情感正负比 {float(sentiment_ratio):.0%}（权重 35%）",
                f"推荐语密度 {rec_density:.1%}（权重 30%）",
                f"评论深度 {avg_comments:.0f} 条/帖（权重 20%）",
                f"避雷语密度 {det_density:.1%}（权重 -15%）",
            ],
            "en": [
                f"Sentiment ratio: {float(sentiment_ratio):.0%} (weight 35%)",
                f"Recommendation density: {rec_density:.1%} (weight 30%)",
                f"Comment depth: {avg_comments:.0f}/post (weight 20%)",
                f"Detractor density: {det_density:.1%} (weight -15%)",
            ],
        },
        "is_proxy": is_proxy,
    }


# ── 4.3 Pricing Power Index ───────────────────────────────────────────────
def compute_pricing_power_index(brand_data):
    wtp = brand_data["metrics"].get("wtp", {}).get("score", 0)
    wtp_raw = brand_data["metrics"].get("wtp", {}).get("raw_inputs", {})
    price_pos = brand_data["metrics"].get("price_positioning", {}).get("score", 0)
    price_raw = brand_data["metrics"].get("price_positioning", {}).get("raw_inputs", {})

    # Sale frequency penalty: avg_discount_depth (% off when on sale)
    avg_discount = float(price_raw.get("avg_discount_depth") or 0)
    sale_penalty_score = clamp(100 - avg_discount * 2)  # 50% off → score 0

    # Value-mention proxy: premium_ratio (% of products in upper price bands)
    premium_ratio = float(price_raw.get("premium_ratio") or 0)
    value_score = clamp(premium_ratio)

    weights = {
        "wtp_score": 0.30,
        "price_positioning_score": 0.30,
        "sale_frequency_penalty": 0.20,
        "value_mention_score": 0.20,
    }
    score = (
        weights["wtp_score"] * wtp
        + weights["price_positioning_score"] * price_pos
        + weights["sale_frequency_penalty"] * sale_penalty_score
        + weights["value_mention_score"] * value_score
    )

    return {
        "score": round(score, 1),
        "inputs": {
            "wtp_score": round(wtp, 1),
            "price_positioning_score": round(price_pos, 1),
            "avg_discount_depth_pct": round(avg_discount, 1),
            "premium_ratio_pct": round(premium_ratio, 1),
            "wtp_cap_hit": wtp_raw.get("cap_hit", False),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"WTP 得分 {wtp:.0f}（权重 30%）",
                f"价格定位 {price_pos:.0f}（权重 30%）",
                f"折扣深度 {avg_discount:.1f}%（越低越好，权重 20%）",
                f"溢价占比 {premium_ratio:.1f}%（权重 20%）",
            ],
            "en": [
                f"WTP score: {wtp:.0f} (weight 30%)",
                f"Price positioning: {price_pos:.0f} (weight 30%)",
                f"Avg discount depth: {avg_discount:.1f}% (weight 20%, lower = better)",
                f"Premium ratio: {premium_ratio:.1f}% (weight 20%)",
            ],
        },
        "is_proxy": False,
    }


# ── 4.4 Loyalty Index ─────────────────────────────────────────────────────
def compute_loyalty_index(brand_data):
    """Proxy implementation — repeat-author tracking blocked on note-feed scrape."""
    mind_raw = brand_data["metrics"].get("consumer_mindshare", {}).get("raw_inputs", {})
    top_ugc = mind_raw.get("top_ugc") or []

    # Return-purchase mention density
    return_density = text_match_density(RETURN_PURCHASE_PATTERNS, top_ugc)

    # Engagement-per-note proxy: deep engagement → loyal followers
    avg_comments = float(mind_raw.get("avg_comments_per_note") or 0)
    engagement_proxy = min(1.0, avg_comments / 30.0)  # 30 comments/note → full

    # UGC ratio — % of brand mentions that are organic (proxy for return UGC)
    ugc_ratio = float(mind_raw.get("ugc_ratio") or 0)
    ugc_score = clamp(ugc_ratio * 100)

    weights = {
        "return_purchase_density": 0.40,
        "deep_engagement": 0.30,
        "organic_ugc_ratio": 0.20,
        "tolerance_signal": 0.10,
    }
    # Tolerance signal placeholder = 0.5 (neutral) until classifier ships
    tolerance = 0.5

    score = (
        weights["return_purchase_density"] * return_density * 100
        + weights["deep_engagement"] * engagement_proxy * 100
        + weights["organic_ugc_ratio"] * ugc_score
        + weights["tolerance_signal"] * tolerance * 100
    )

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "return_purchase_density": round(return_density, 3),
            "deep_engagement_proxy": round(engagement_proxy, 2),
            "organic_ugc_ratio_pct": round(ugc_score, 1),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"回购语密度 {return_density:.1%}（权重 40%）",
                f"深度互动 {avg_comments:.0f} 评论/帖（权重 30%）",
                f"UGC 自然占比 {ugc_score:.0f}%（权重 20%）",
                "*注：完整 repeat-author 追踪需要 note-feed 抓取（待 J1 完成）",
            ],
            "en": [
                f"Return-purchase density: {return_density:.1%} (weight 40%)",
                f"Deep engagement: {avg_comments:.0f} comments/post (weight 30%)",
                f"Organic UGC share: {ugc_score:.0f}% (weight 20%)",
                "*Note: full repeat-author tracking unlocks with note-feed scrape (pending J1)",
            ],
        },
        "is_proxy": True,
    }


# ── 4.5 Content Velocity Index ────────────────────────────────────────────
def compute_content_velocity_index(brand_data):
    cs = brand_data["metrics"].get("content_strategy", {})
    cs_raw = cs.get("raw_inputs", {})

    avg_per_post = float(cs_raw.get("engagement_per_note") or 0)
    volume_share = float(cs_raw.get("volume_share_pct") or 0)
    n_types = int(cs_raw.get("n_content_types") or 0)
    cv = float(cs_raw.get("posting_consistency_cv") or 1.0)

    # Volume score from share of category posting
    volume_score = clamp(volume_share * 2)  # 50% share → 100

    # Engagement score (eng/post; 100 = full marks at ~500 engagement/post)
    engagement_score = clamp(avg_per_post / 5.0)

    # Format diversity (5 content types = full marks)
    diversity_score = clamp((n_types / 5.0) * 100)

    # Organic UGC ratio proxy: from mindshare's ugc_ratio
    mind_raw = brand_data["metrics"].get("consumer_mindshare", {}).get("raw_inputs", {})
    organic_ratio = float(mind_raw.get("ugc_ratio") or 0)
    organic_score = clamp(organic_ratio * 100)

    weights = {
        "weighted_posts_per_week": 0.30,
        "avg_engagement_rate": 0.30,
        "content_format_entropy": 0.20,
        "organic_ugc_ratio": 0.20,
    }
    score = (
        weights["weighted_posts_per_week"] * volume_score
        + weights["avg_engagement_rate"] * engagement_score
        + weights["content_format_entropy"] * diversity_score
        + weights["organic_ugc_ratio"] * organic_score
    )

    return {
        "score": round(score, 1),
        "inputs": {
            "engagement_per_post": round(avg_per_post, 1),
            "volume_share_pct": round(volume_share, 1),
            "n_content_types": n_types,
            "posting_cv": round(cv, 2),
            "organic_ugc_ratio": round(organic_ratio, 2),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"声量份额 {volume_share:.1f}%（权重 30%）",
                f"互动均值 {avg_per_post:.0f}/帖（权重 30%）",
                f"内容形式 {n_types} 类（权重 20%）",
                f"自然 UGC 占比 {organic_ratio:.0%}（权重 20%）",
            ],
            "en": [
                f"Volume share: {volume_share:.1f}% (weight 30%)",
                f"Avg engagement: {avg_per_post:.0f}/post (weight 30%)",
                f"Content formats: {n_types} types (weight 20%)",
                f"Organic UGC ratio: {organic_ratio:.0%} (weight 20%)",
            ],
        },
        "is_proxy": False,
    }


# ── 4.6 Influencer Footprint ──────────────────────────────────────────────
def compute_influencer_footprint(brand_data):
    """Proxy until note-feed scrape lands. Uses kol_strategy raw_inputs if available."""
    kol = brand_data["metrics"].get("kol_strategy", {})
    kol_raw = kol.get("raw_inputs", {})
    kol_score = kol.get("score", 0)

    n_kols = int(kol_raw.get("n_kols") or kol_raw.get("kol_count") or 0)
    tier_breakdown = kol_raw.get("tier_breakdown") or {}

    # Tier balance: prefer pyramid shape (more nano/micro than macro)
    if tier_breakdown:
        total = sum(tier_breakdown.values()) or 1
        tier_pcts = {k: v / total for k, v in tier_breakdown.items()}
        # Reward when nano+micro >= 50%
        small_tier_pct = tier_pcts.get("nano", 0) + tier_pcts.get("micro", 0)
        tier_balance = clamp(small_tier_pct * 100)
    else:
        tier_balance = 50

    # Frequency / lift / exclusivity unavailable today — use kol_score as proxy
    proxy_signal = kol_score

    weights = {
        "tier_balance_score": 0.35,
        "kol_proxy_score": 0.65,
    }
    score = weights["tier_balance_score"] * tier_balance + weights["kol_proxy_score"] * proxy_signal

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "n_kols": n_kols,
            "tier_breakdown": tier_breakdown,
            "kol_strategy_score": round(kol_score, 1),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"KOL 人数 {n_kols}",
                f"等级分布平衡度 {tier_balance:.0f}（权重 35%）",
                f"KOL 策略得分 {kol_score:.0f}（权重 65%，待 note-feed 抓取后细化）",
            ],
            "en": [
                f"KOL count: {n_kols}",
                f"Tier balance: {tier_balance:.0f} (weight 35%)",
                f"KOL strategy score: {kol_score:.0f} (weight 65%, refines with note-feed scrape)",
            ],
        },
        "is_proxy": True,
    }


# ── 4.7 Search Dominance ──────────────────────────────────────────────────
def compute_search_dominance(brand_data):
    kw = brand_data["metrics"].get("keywords", {})
    kw_raw = kw.get("raw_inputs", {})
    kw_score = kw.get("score", 0)

    n_unique = len(kw_raw.get("keyword_cloud") or {})
    n_trending = len(kw_raw.get("trending") or [])
    n_categories = len(kw_raw.get("categories") or {})

    # Branded share proxy: keyword diversity (unique terms found)
    diversity_score = clamp((n_unique / 100.0) * 100)
    # Trending score: how many emerging terms
    trending_score = clamp(n_trending * 5)
    # Long-tail capture proxy: number of distinct categories
    longtail_score = clamp(n_categories * 5)

    weights = {
        "branded_search_share": 0.40,
        "owned_term_score": 0.30,
        "long_tail_capture": 0.20,
        "keyword_growth": 0.10,
    }
    score = (
        weights["branded_search_share"] * diversity_score
        + weights["owned_term_score"] * kw_score
        + weights["long_tail_capture"] * longtail_score
        + weights["keyword_growth"] * trending_score
    )

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "n_unique_keywords": n_unique,
            "n_trending": n_trending,
            "n_categories": n_categories,
            "keywords_score": round(kw_score, 1),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"唯一关键词 {n_unique} 个（权重 40%）",
                f"自有词排名 {kw_score:.0f}（权重 30%）",
                f"长尾覆盖类别 {n_categories} 类（权重 20%）",
                f"新兴关键词 {n_trending} 个（权重 10%）",
            ],
            "en": [
                f"Unique keywords: {n_unique} (weight 40%)",
                f"Owned-term rank: {kw_score:.0f} (weight 30%)",
                f"Long-tail categories: {n_categories} (weight 20%)",
                f"Emerging keywords: {n_trending} (weight 10%)",
            ],
        },
        "is_proxy": False,
    }


# ── 4.8 Hero Product Index (爆品) ─────────────────────────────────────────
def compute_hero_product_index(brand_data):
    tp = brand_data["metrics"].get("trending_products", {})
    tp_raw = tp.get("raw_inputs", {})

    top_products = tp_raw.get("top_products") or []
    new_launches = tp_raw.get("new_launches") or []
    total_products = int(tp_raw.get("total_products") or 0)

    # Top-3 concentration: combined volume of top 3 vs total catalog volume
    if top_products and total_products > 0:
        top3 = top_products[:3]
        top3_volume = sum(int(p.get("sales_volume") or p.get("volume") or 0) for p in top3)
        total_volume = sum(int(p.get("sales_volume") or p.get("volume") or 0) for p in top_products)
        concentration = (top3_volume / total_volume) if total_volume > 0 else 0
        concentration_score = clamp(concentration * 100)
    else:
        concentration_score = 0

    # Top-1 velocity: top product's recent_growth (if pipeline emits it)
    if top_products:
        velocity = float(top_products[0].get("recent_growth") or top_products[0].get("growth") or 0)
        velocity_score = normalize_pct_to_100(velocity)
    else:
        velocity_score = 50

    # Organic seeding rate: from mindshare ugc_ratio
    mind_raw = brand_data["metrics"].get("consumer_mindshare", {}).get("raw_inputs", {})
    organic_ratio = float(mind_raw.get("ugc_ratio") or 0)
    organic_score = clamp(organic_ratio * 100)

    # Sold-out signal density via regex on top_ugc
    top_ugc = mind_raw.get("top_ugc") or []
    soldout_density = text_match_density(SOLDOUT_PATTERNS, top_ugc)
    soldout_score = clamp(soldout_density * 200)  # 50% density → 100

    weights = {
        "top3_concentration": 0.30,
        "top1_velocity": 0.30,
        "organic_seeding_rate": 0.25,
        "soldout_signals": 0.15,
    }
    score = (
        weights["top3_concentration"] * concentration_score
        + weights["top1_velocity"] * velocity_score
        + weights["organic_seeding_rate"] * organic_score
        + weights["soldout_signals"] * soldout_score
    )

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "top3_concentration_pct": round(concentration_score, 1),
            "top1_velocity_pct": round(float(top_products[0].get("recent_growth") or 0) if top_products else 0, 1),
            "organic_seeding_pct": round(organic_score, 1),
            "soldout_signal_density": round(soldout_density, 3),
            "n_top_products": len(top_products),
            "total_products": total_products,
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"前三 SKU 集中度 {concentration_score:.0f}（权重 30%）",
                f"头部 SKU 增长 {velocity_score:.0f}（权重 30%）",
                f"自然种草占比 {organic_score:.0f}%（权重 25%）",
                f"断货信号密度 {soldout_density:.1%}（权重 15%）",
            ],
            "en": [
                f"Top-3 SKU concentration: {concentration_score:.0f} (weight 30%)",
                f"Top-SKU velocity: {velocity_score:.0f} (weight 30%)",
                f"Organic seeding rate: {organic_score:.0f}% (weight 25%)",
                f"Sold-out signal density: {soldout_density:.1%} (weight 15%)",
            ],
        },
        "is_proxy": False,
    }


# ── 4.9 Launch Cadence ────────────────────────────────────────────────────
def compute_launch_cadence(brand_data):
    lf = brand_data["metrics"].get("launch_frequency", {})
    lf_raw = lf.get("raw_inputs", {})

    avg_per_week = float(lf_raw.get("avg_per_week") or 0)
    acceleration = float(lf_raw.get("acceleration_pct") or 0)
    cv = float(lf_raw.get("consistency_cv") or 1.0)
    total_launches = int(lf_raw.get("total_launches_90d") or 0)

    # New SKUs/month (4.3 weeks per month)
    per_month = avg_per_week * 4.3
    cadence_score = clamp((per_month / 5.0) * 100)  # 5 launches/month = full

    # Campaign-event detection placeholder (would need calendar pattern detection)
    campaign_score = clamp(50 + acceleration / 2)

    # Launch impact (eng on launch posts) — fold from content_strategy
    cs_raw = brand_data["metrics"].get("content_strategy", {}).get("raw_inputs", {})
    launch_impact = float(cs_raw.get("engagement_per_note") or 0)
    impact_score = clamp(launch_impact / 5.0)

    # Cadence regularity (lower CV = more disciplined)
    if cv <= 0.3:
        regularity_score = 100
    elif cv >= 1.5:
        regularity_score = 0
    else:
        regularity_score = 100 * (1 - (cv - 0.3) / 1.2)

    weights = {
        "new_skus_per_month": 0.40,
        "campaign_event_detection": 0.30,
        "launch_impact_ratio": 0.20,
        "cadence_regularity": 0.10,
    }
    score = (
        weights["new_skus_per_month"] * cadence_score
        + weights["campaign_event_detection"] * campaign_score
        + weights["launch_impact_ratio"] * impact_score
        + weights["cadence_regularity"] * regularity_score
    )

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "new_skus_per_month": round(per_month, 1),
            "acceleration_pct": round(acceleration, 1),
            "consistency_cv": round(cv, 2),
            "total_launches_90d": total_launches,
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"月均上新 {per_month:.1f}（权重 40%）",
                f"加速度 {acceleration:+.1f}%（权重 30%）",
                f"上新带动互动 {launch_impact:.0f}（权重 20%）",
                f"节奏规律度（CV={cv:.2f}，权重 10%）",
            ],
            "en": [
                f"New SKUs/month: {per_month:.1f} (weight 40%)",
                f"Acceleration: {acceleration:+.1f}% (weight 30%)",
                f"Launch engagement: {launch_impact:.0f} (weight 20%)",
                f"Cadence regularity (CV={cv:.2f}, weight 10%)",
            ],
        },
        "is_proxy": False,
    }


# ── 4.10 Trend Capture ────────────────────────────────────────────────────
def compute_trend_capture(brand_data):
    """Proxy until snapshot history accumulates ≥4 weeks of trend data."""
    kw = brand_data["metrics"].get("keywords", {})
    kw_raw = kw.get("raw_inputs", {})

    trending = kw_raw.get("trending") or []
    n_trending = len(trending)

    # Trending term adoption proxy (10 trending terms = full marks)
    adoption_score = clamp(n_trending * 10)

    # Other inputs blocked on snapshot history — neutral defaults
    weights = {
        "trend_emergence_lag": 0.40,
        "trend_adoption_rate": 0.30,
        "trend_to_launch_lag": 0.20,
        "sustained_participation": 0.10,
    }
    score = (
        weights["trend_emergence_lag"] * 50
        + weights["trend_adoption_rate"] * adoption_score
        + weights["trend_to_launch_lag"] * 50
        + weights["sustained_participation"] * 50
    )

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "n_trending_terms": n_trending,
            "trending_terms": [t.get("keyword") if isinstance(t, dict) else str(t) for t in trending[:10]],
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"已使用新兴关键词 {n_trending} 个（权重 30%）",
                "*注：完整趋势捕捉需要 ≥4 周快照历史（待 snapshot table 上线）",
            ],
            "en": [
                f"Emerging keywords used: {n_trending} (weight 30%)",
                "*Note: full trend-capture needs ≥4 weeks of snapshot history (pending)",
            ],
        },
        "is_proxy": True,
    }


# ── 4.11 Innovation Score ─────────────────────────────────────────────────
def compute_innovation_score(brand_data):
    mind_raw = brand_data["metrics"].get("consumer_mindshare", {}).get("raw_inputs", {})
    top_ugc = mind_raw.get("top_ugc") or []

    collab_density = text_match_density(COLLAB_PATTERNS, top_ugc)
    brand_first_density = text_match_density(BRAND_FIRST_PATTERNS, top_ugc)

    # Material/silhouette diversity from products — entropy of category tags
    products = brand_data["products"] or []
    material_tags = []
    for p in products:
        mt = p.get("material_tags")
        if isinstance(mt, list):
            material_tags.extend(mt)
        elif isinstance(mt, str):
            material_tags.append(mt)
    if material_tags:
        # Shannon entropy normalized to 0-1
        counts = Counter(material_tags)
        total = sum(counts.values())
        entropy = -sum((c / total) * math.log2(c / total) for c in counts.values() if c > 0)
        max_entropy = math.log2(min(len(counts), 10)) if counts else 1
        diversity_score = clamp((entropy / max_entropy) * 100 if max_entropy > 0 else 50)
    else:
        diversity_score = 50

    # Distinctive feature mentions — proxy via keyword growth
    kw_raw = brand_data["metrics"].get("keywords", {}).get("raw_inputs", {})
    distinctive_score = clamp(len(kw_raw.get("trending") or []) * 8)

    weights = {
        "collab_drop_density": 0.35,
        "design_diversity_entropy": 0.25,
        "brand_first_signal_density": 0.25,
        "distinctive_feature_mentions": 0.15,
    }
    score = (
        weights["collab_drop_density"] * collab_density * 100
        + weights["design_diversity_entropy"] * diversity_score
        + weights["brand_first_signal_density"] * brand_first_density * 100
        + weights["distinctive_feature_mentions"] * distinctive_score
    )

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "collab_density": round(collab_density, 3),
            "brand_first_density": round(brand_first_density, 3),
            "design_diversity_score": round(diversity_score, 1),
            "n_material_tags": len(material_tags),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"联名/限量提及密度 {collab_density:.1%}（权重 35%）",
                f"设计多样性 {diversity_score:.0f}（权重 25%）",
                f"首发信号密度 {brand_first_density:.1%}（权重 25%）",
                f"独特特征提及 {distinctive_score:.0f}（权重 15%）",
            ],
            "en": [
                f"Collab/limited mention density: {collab_density:.1%} (weight 35%)",
                f"Design diversity: {diversity_score:.0f} (weight 25%)",
                f"Brand-first signal: {brand_first_density:.1%} (weight 25%)",
                f"Distinctive feature mentions: {distinctive_score:.0f} (weight 15%)",
            ],
        },
        "is_proxy": False,
    }


# ── 4.12 Promotional Discipline ───────────────────────────────────────────
def compute_promotional_discipline(brand_data):
    price_raw = brand_data["metrics"].get("price_positioning", {}).get("raw_inputs", {})

    avg_discount = float(price_raw.get("avg_discount_depth") or 0)
    products = brand_data["products"] or []

    # Sale-event frequency: % of products currently on sale (price < original_price)
    n_on_sale = 0
    n_with_orig = 0
    for p in products:
        op = p.get("original_price")
        pr = p.get("price")
        if op and pr and float(op) > float(pr):
            n_on_sale += 1
        if op:
            n_with_orig += 1
    if n_with_orig > 0:
        sale_pct = (n_on_sale / n_with_orig) * 100
    else:
        sale_pct = 0
    sale_freq_score = clamp(100 - sale_pct * 1.5)  # 67% on sale → 0

    # Discount-depth penalty (gentle — 25% off is fine, 60% is brand erosion)
    if avg_discount <= 25:
        depth_score = 100
    elif avg_discount >= 60:
        depth_score = 0
    else:
        depth_score = 100 * (1 - (avg_discount - 25) / 35)

    # Price stability — std dev of prices across products
    prices = [float(p.get("price") or 0) for p in products if p.get("price")]
    if len(prices) >= 3:
        mean_price = sum(prices) / len(prices)
        if mean_price > 0:
            variance = sum((p - mean_price) ** 2 for p in prices) / len(prices)
            std = math.sqrt(variance)
            cv_price = std / mean_price
            stability_score = clamp(100 - cv_price * 100)
        else:
            stability_score = 50
    else:
        stability_score = 50

    weights = {
        "sale_event_frequency": 0.30,
        "discount_depth_penalty": 0.25,
        "price_stability": 0.25,
        "panic_pattern_absence": 0.20,
    }
    # Panic pattern detection placeholder = neutral
    panic_score = 70  # mild assumption of healthy unless proven otherwise

    score = (
        weights["sale_event_frequency"] * sale_freq_score
        + weights["discount_depth_penalty"] * depth_score
        + weights["price_stability"] * stability_score
        + weights["panic_pattern_absence"] * panic_score
    )

    return {
        "score": round(clamp(score), 1),
        "inputs": {
            "sale_event_pct": round(sale_pct, 1),
            "avg_discount_depth_pct": round(avg_discount, 1),
            "price_stability_score": round(stability_score, 1),
        },
        "weights": weights,
        "explain_text": {
            "zh": [
                f"在售折扣比例 {sale_pct:.1f}%（权重 30%，越低越好）",
                f"折扣深度 {avg_discount:.1f}%（权重 25%）",
                f"价格稳定性 {stability_score:.0f}（权重 25%）",
                "无明显恐慌折扣模式（权重 20%）",
            ],
            "en": [
                f"% products on sale: {sale_pct:.1f}% (weight 30%, lower = better)",
                f"Avg discount depth: {avg_discount:.1f}% (weight 25%)",
                f"Price stability: {stability_score:.0f} (weight 25%)",
                "No clear panic-discount pattern (weight 20%)",
            ],
        },
        "is_proxy": False,
    }


# ─── Compute registry ────────────────────────────────────────────────────

INDEX_COMPUTE = {
    "brand_heat":             compute_brand_heat,
    "brand_nps":              compute_brand_nps,
    "pricing_power_index":    compute_pricing_power_index,
    "loyalty_index":          compute_loyalty_index,
    "content_velocity_index": compute_content_velocity_index,
    "influencer_footprint":   compute_influencer_footprint,
    "search_dominance":       compute_search_dominance,
    "hero_product_index":     compute_hero_product_index,
    "launch_cadence":         compute_launch_cadence,
    "trend_capture_index":    compute_trend_capture,
    "innovation_score":       compute_innovation_score,
    "promotional_discipline": compute_promotional_discipline,
}


# ─── Direction + delta lookup ────────────────────────────────────────────

def direction_from_delta(delta):
    """Map a numeric delta into 'gaining' / 'steady' / 'losing'."""
    if delta is None:
        return None
    if delta >= 2:
        return "gaining"
    if delta <= -2:
        return "losing"
    return "steady"


def lookup_prior_score(cur, workspace_id, competitor_name, index_name, version):
    """Most recent prior score for this (workspace, brand, index) — for delta math."""
    cur.execute(
        """
        SELECT score FROM composite_indices
         WHERE workspace_id = %s
           AND competitor_name = %s
           AND index_name = %s
           AND index_version = %s
           AND computed_at::date < CURRENT_DATE
         ORDER BY computed_at DESC LIMIT 1
        """,
        (workspace_id, competitor_name, index_name, version),
    )
    row = cur.fetchone()
    return float(row["score"]) if row else None


# ─── Writer ──────────────────────────────────────────────────────────────

def compute_all_for_workspace(workspace_id):
    """Compute all 12 indices for every competitor in the workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, brand_name FROM workspaces WHERE id = %s", (workspace_id,))
            ws = cur.fetchone()
            if not ws:
                print(f"[WARN] Workspace {workspace_id} not found")
                return

            data = load_competitor_data(cur, workspace_id)
            if not data:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return

            print(f"[INDICES] Computing 12 indices × {len(data)} competitors in workspace {workspace_id}")

            # Idempotent same-day rerun: clear today's rows for this workspace.
            cur.execute(
                """
                DELETE FROM composite_indices
                 WHERE workspace_id = %s
                   AND computed_at::date = CURRENT_DATE
                """,
                (workspace_id,),
            )

            n_written = 0
            for brand, brand_data in data.items():
                # Per-competitor diagnostics — surfaces what data was
                # available at compute time so we can read cron logs and
                # tell whether a brand had real inputs or computed from
                # zeros. Without this, "[brand] 12 indices written"
                # looked the same for a richly-scored brand and a
                # brand-new addition with no scrape data yet.
                metrics = brand_data.get("metrics") or {}
                profile = brand_data.get("profile")
                products = brand_data.get("products") or []
                proxy_count = 0
                non_zero_count = 0

                for index_name, compute_fn in INDEX_COMPUTE.items():
                    try:
                        result = compute_fn(brand_data)
                    except Exception as e:
                        print(f"  [ERR] {brand}/{index_name}: {e}")
                        traceback.print_exc()
                        continue

                    if result.get("is_proxy"):
                        proxy_count += 1
                    score = result["score"]
                    if score is not None and abs(float(score)) > 0.01:
                        non_zero_count += 1
                    version = INDEX_VERSION + ("-proxy" if result.get("is_proxy") else "")

                    # Delta from yesterday's same index
                    prior = lookup_prior_score(cur, workspace_id, brand, index_name, version)
                    delta = round(result["score"] - prior, 2) if prior is not None else None
                    direction = direction_from_delta(delta)

                    cur.execute(
                        """
                        INSERT INTO composite_indices
                            (workspace_id, competitor_name, index_name, index_version, pillar,
                             score, inputs, weights, explain_text, direction, delta)
                        VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s)
                        """,
                        (
                            workspace_id,
                            brand,
                            index_name,
                            version,
                            INDEX_TO_PILLAR[index_name],
                            result["score"],
                            json.dumps(result["inputs"], ensure_ascii=False, default=str),
                            json.dumps(result["weights"], ensure_ascii=False),
                            json.dumps(result["explain_text"], ensure_ascii=False),
                            direction,
                            delta,
                        ),
                    )
                    n_written += 1

                print(
                    f"  [{brand}] metrics={len(metrics)}/16 "
                    f"profile={'Y' if profile else 'N'} "
                    f"products={len(products)} "
                    f"→ 12 indices written ({non_zero_count} non-zero, {proxy_count} proxy)"
                )

            conn.commit()
            print(f"[DONE] {n_written} composite_indices rows written for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Composite indices pipeline failed: {e}")
        traceback.print_exc()
        conn.rollback()
        raise
    finally:
        conn.close()


def run_all_workspaces():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            workspaces = cur.fetchall()
        for ws in workspaces:
            compute_all_for_workspace(str(ws["id"]))
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Compute 12 composite indices for a workspace")
    parser.add_argument("--workspace-id", help="Compute for a specific workspace")
    parser.add_argument("--all", action="store_true", help="Compute for all workspaces")
    args = parser.parse_args()

    if args.workspace_id:
        compute_all_for_workspace(args.workspace_id)
    elif args.all:
        run_all_workspaces()
    else:
        parser.print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
