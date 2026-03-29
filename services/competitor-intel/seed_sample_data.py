"""
Seed script: populates the SQLite database with realistic sample data
for 5 brands across all 7 dimensions. Uses data inspired by the
hand-authored competitor-intel.html dashboard.

Usage:
    python -m services.competitor-intel.seed_sample_data
"""

import os
import sys
from datetime import datetime

from .storage import init_db, record_scrape_run, save_snapshot, DEFAULT_DB_PATH


def build_sample_brands() -> dict:
    """Return a dict of brand_name -> merged 7-dimension data for 5 brands."""

    today = datetime.now().strftime("%Y-%m-%d")

    brands = {}

    # ── Group D: 小CK ────────────────────────────────────────────────────
    brands["小CK"] = {
        "brand_name": "小CK",
        "brand_name_en": "Charles & Keith",
        "group": "D",
        "group_name": "快时尚/International",
        "badge": "东南亚快时尚标杆",
        "scrape_date": today,
        "scrape_status": {"xhs": "success", "douyin": "success", "sycm": "success"},
        "d1_brand_search_index": {
            "xhs_suggestions": ["是什么档次", "是什么品牌", "是小ck吗", "线下门店", "新款", "品牌介绍", "包包属于什么档次", "ck和小ck是一个牌子吗"],
            "xhs_related": ["轻奢包包", "500元左右包包"],
            "douyin_suggestions": ["读音是什么", "什么档次", "官方旗舰店", "托特", "500元左右轻奢", "轻奢300-500价位"],
            "douyin_trending": ["小CK新款春季", "小CK穿搭"],
        },
        "d2_brand_voice_volume": {
            "xhs": {
                "followers": 637000,
                "notes": 2108,
                "likes": 1250000,
                "account_name": "Charles & Keith",
                "account_id": "ck_official_xhs",
            },
            "douyin": {
                "followers": 3157000,
                "videos": 520,
                "likes": 8630000,
                "account_name": "CharlesKeith_cn",
                "account_id": "ck_official_douyin",
                "verified": True,
            },
        },
        "d3_content_strategy": {
            "content_types": {"品牌活动": 30, "穿搭OOTD": 30, "产品展示": 20, "门店/其他": 20},
            "top_notes": [
                {"title": "chill时刻🍃来一场惊喜拼图挑战！", "likes": 76, "date": "昨天", "type": "品牌活动"},
                {"title": "fitcheck | 春日感十足的美丽包包", "likes": 307, "date": "03-02", "type": "穿搭OOTD"},
                {"title": "本周新款陈列分享", "likes": 3, "date": "03-13", "type": "门店陈列"},
                {"title": "打造两种造型的帆布托特包", "likes": 36, "date": "02-03", "type": "产品展示"},
                {"title": "Ck换设计师了？", "likes": 732, "date": "01-08", "type": "UGC热帖"},
            ],
            "posting_frequency": "日更",
            "avg_engagement": "1.2%",
        },
        "d4_kol_ecosystem": {
            "xhs_kols": [
                {"name": "覃晨哼哼", "followers": 85000, "type": "腰部KOL"},
                {"name": "小木又寸", "followers": 42000, "type": "腰部KOL"},
            ],
            "xhs_collab_count": 8,
            "xhs_celebrity_mentions": ["韩素希 (Han So Hee)"],
            "douyin_creators": [
                {"name": "CharlesKeith_cn", "followers": 3157000, "type": "官方"},
            ],
            "douyin_mentions_count": 45,
            "douyin_hashtag_views": {"#小CK": "1.2亿", "#CharlesKeith": "8600万"},
        },
        "d5_social_commerce": {
            "live_status": "active",
            "live_viewers": 5200,
            "shop_product_count": 156,
            "live_frequency": "日播",
            "avg_live_viewers": "3000-5000",
            "top_selling_products": [
                {"name": "经典翻盖凯莉包", "price": 399, "sales_rank": 1},
                {"name": "帆布托特包 C 100K", "price": 299, "sales_rank": 2},
            ],
        },
        "d6_consumer_mindshare": {
            "sentiment_keywords": ["什么档次", "质量太差", "品控太辣", "是轻奢吗", "300-500价位", "必买十大经典包", "新款", "读音是什么"],
            "positive_keywords": ["好看", "百搭", "新款经典", "性价比"],
            "negative_keywords": ["质量太差", "品控太辣", "PU廉价感", "售后差"],
            "ugc_samples": [
                {"title": "避雷小ck质量太差，售后等同没有", "author": "momo", "date": "03-11", "sentiment": "negative"},
                {"title": "小ck菜篮子品控太辣", "author": "基999", "date": "02-15", "likes": 8, "sentiment": "negative"},
            ],
        },
        "d7_channel_authority": {
            "tmall_rank": "Top 15",
            "category_share": "53%",
            "monthly_sales_index": "9200",
            "price_band": "¥220-615",
            "top_products": [
                {"name": "经典翻盖凯莉包", "rank": 5, "price": 399},
                {"name": "帆布托特包", "rank": 8, "price": 299},
            ],
            "traffic_sources": {"搜索": "45%", "推荐": "30%", "直播": "15%", "其他": "10%"},
            "conversion_index": "4.8%",
        },
    }

    # ── Group C: La Festin ───────────────────────────────────────────────
    brands["La Festin"] = {
        "brand_name": "La Festin",
        "brand_name_en": "La Festin",
        "group": "C",
        "group_name": "价值挑战者",
        "badge": "法式轻奢新贵",
        "scrape_date": today,
        "scrape_status": {"xhs": "success", "douyin": "success", "sycm": "partial"},
        "d1_brand_search_index": {
            "xhs_suggestions": ["拉菲斯汀", "拉菲斯汀是什么档次", "拉菲斯汀包包", "法式轻奢"],
            "xhs_related": ["法式包包", "拉菲斯汀评价"],
            "douyin_suggestions": ["拉菲斯汀官方旗舰店", "拉菲斯汀包包"],
            "douyin_trending": ["拉菲斯汀春季新款"],
        },
        "d2_brand_voice_volume": {
            "xhs": {
                "followers": 89000,
                "notes": 650,
                "likes": 280000,
                "account_name": "La Festin拉菲斯汀",
                "account_id": "lafestin_xhs",
            },
            "douyin": {
                "followers": 156000,
                "videos": 280,
                "likes": 520000,
                "account_name": "La Festin官方旗舰店",
                "account_id": "lafestin_dy",
                "verified": True,
            },
        },
        "d3_content_strategy": {
            "content_types": {"产品展示": 40, "穿搭OOTD": 25, "品牌故事": 20, "UGC": 15},
            "top_notes": [
                {"title": "法式优雅 春日新品上架", "likes": 180, "date": "03-20", "type": "产品展示"},
                {"title": "通勤穿搭 | 职场女性必备包包", "likes": 95, "date": "03-15", "type": "穿搭OOTD"},
            ],
            "posting_frequency": "每周3-4篇",
            "avg_engagement": "1.8%",
        },
        "d4_kol_ecosystem": {
            "xhs_kols": [
                {"name": "法式穿搭日记", "followers": 120000, "type": "腰部KOL"},
            ],
            "xhs_collab_count": 15,
            "xhs_celebrity_mentions": [],
            "douyin_creators": [
                {"name": "La Festin官方", "followers": 156000, "type": "官方"},
            ],
            "douyin_mentions_count": 22,
            "douyin_hashtag_views": {"#拉菲斯汀": "3200万"},
        },
        "d5_social_commerce": {
            "live_status": "active",
            "live_viewers": 1800,
            "shop_product_count": 85,
            "live_frequency": "每周5天",
            "avg_live_viewers": "1000-2000",
            "top_selling_products": [
                {"name": "法式链条包", "price": 459, "sales_rank": 1},
            ],
        },
        "d6_consumer_mindshare": {
            "sentiment_keywords": ["法式优雅", "二层皮", "做工精细", "价格偏高"],
            "positive_keywords": ["法式设计", "做工精细", "颜值高", "质感好"],
            "negative_keywords": ["价格偏高", "不耐磨"],
            "ugc_samples": [
                {"title": "拉菲斯汀这款包真的绝了", "author": "穿搭小达人", "date": "03-18", "sentiment": "positive"},
            ],
        },
        "d7_channel_authority": {
            "tmall_rank": "Top 40",
            "category_share": "2.8%",
            "monthly_sales_index": "3800",
            "price_band": "¥300-700",
            "top_products": [
                {"name": "法式链条包", "rank": 22, "price": 459},
            ],
            "traffic_sources": {"搜索": "35%", "推荐": "35%", "直播": "20%", "其他": "10%"},
            "conversion_index": "3.5%",
        },
    }

    # ── Group C: Cnolés蔻一 ──────────────────────────────────────────────
    brands["Cnolés蔻一"] = {
        "brand_name": "Cnolés蔻一",
        "brand_name_en": "Cnoles",
        "group": "C",
        "group_name": "价值挑战者",
        "badge": "直播电商黑马",
        "scrape_date": today,
        "scrape_status": {"xhs": "success", "douyin": "success", "sycm": "success"},
        "d1_brand_search_index": {
            "xhs_suggestions": ["蔻一", "蔻一是什么档次", "蔻一包包怎么样"],
            "xhs_related": ["国产包包推荐", "平价真皮包"],
            "douyin_suggestions": ["蔻一Cnoles官方旗舰店", "蔻一包包"],
            "douyin_trending": ["蔻一直播间秒杀"],
        },
        "d2_brand_voice_volume": {
            "xhs": {
                "followers": 35000,
                "notes": 320,
                "likes": 95000,
                "account_name": "蔻一Cnoles",
                "account_id": "cnoles_xhs",
            },
            "douyin": {
                "followers": 428000,
                "videos": 850,
                "likes": 1650000,
                "account_name": "蔻一Cnoles官方旗舰店",
                "account_id": "cnoles_dy",
                "verified": True,
            },
        },
        "d3_content_strategy": {
            "content_types": {"直播切片": 45, "产品展示": 25, "测评": 15, "穿搭": 15},
            "top_notes": [
                {"title": "直播间爆款 真皮通勤包", "likes": 220, "date": "03-25", "type": "直播切片"},
                {"title": "蔻一新款 | 二层皮手提包", "likes": 65, "date": "03-20", "type": "产品展示"},
            ],
            "posting_frequency": "每周5-6篇",
            "avg_engagement": "2.1%",
        },
        "d4_kol_ecosystem": {
            "xhs_kols": [
                {"name": "包包种草机", "followers": 68000, "type": "腰部KOL"},
            ],
            "xhs_collab_count": 6,
            "xhs_celebrity_mentions": [],
            "douyin_creators": [
                {"name": "蔻一官方", "followers": 428000, "type": "官方"},
                {"name": "蔻一工厂直播间", "followers": 185000, "type": "矩阵号"},
            ],
            "douyin_mentions_count": 68,
            "douyin_hashtag_views": {"#蔻一": "5800万", "#蔻一包包": "2100万"},
        },
        "d5_social_commerce": {
            "live_status": "active",
            "live_viewers": 8500,
            "shop_product_count": 210,
            "live_frequency": "日播 (双直播间)",
            "avg_live_viewers": "5000-10000",
            "top_selling_products": [
                {"name": "真皮通勤手提包", "price": 329, "sales_rank": 1},
                {"name": "二层皮斜挎包", "price": 259, "sales_rank": 2},
            ],
        },
        "d6_consumer_mindshare": {
            "sentiment_keywords": ["性价比高", "直播间便宜", "真皮", "做工一般"],
            "positive_keywords": ["性价比", "真皮", "颜值高", "直播间划算"],
            "negative_keywords": ["做工一般", "线头", "五金偏轻"],
            "ugc_samples": [
                {"title": "蔻一直播间薅羊毛攻略", "author": "省钱小能手", "date": "03-22", "sentiment": "positive"},
            ],
        },
        "d7_channel_authority": {
            "tmall_rank": "Top 60",
            "category_share": "1.5%",
            "monthly_sales_index": "5200",
            "price_band": "¥200-500",
            "top_products": [
                {"name": "真皮通勤手提包", "rank": 35, "price": 329},
            ],
            "traffic_sources": {"直播": "55%", "搜索": "20%", "推荐": "15%", "其他": "10%"},
            "conversion_index": "5.2%",
        },
    }

    # ── Group B: Songmont ────────────────────────────────────────────────
    brands["Songmont"] = {
        "brand_name": "Songmont",
        "brand_name_en": "Songmont",
        "group": "B",
        "group_name": "新兴国货",
        "badge": "新中式设计标杆",
        "scrape_date": today,
        "scrape_status": {"xhs": "success", "douyin": "success", "sycm": "success"},
        "d1_brand_search_index": {
            "xhs_suggestions": ["Songmont山下有松", "songmont包包", "songmont菜篮子", "新中式包包"],
            "xhs_related": ["国产设计师包包", "植鞣皮包包"],
            "douyin_suggestions": ["Songmont官方旗舰店", "山下有松"],
            "douyin_trending": ["Songmont春季新品", "新中式穿搭包包"],
        },
        "d2_brand_voice_volume": {
            "xhs": {
                "followers": 285000,
                "notes": 1200,
                "likes": 850000,
                "account_name": "Songmont山下有松",
                "account_id": "songmont_xhs",
            },
            "douyin": {
                "followers": 520000,
                "videos": 380,
                "likes": 2100000,
                "account_name": "Songmont山下有松",
                "account_id": "songmont_dy",
                "verified": True,
            },
        },
        "d3_content_strategy": {
            "content_types": {"品牌故事": 30, "产品工艺": 25, "穿搭OOTD": 25, "联名": 20},
            "top_notes": [
                {"title": "植鞣皮的养成记 | 越用越美", "likes": 1250, "date": "03-22", "type": "产品工艺"},
                {"title": "新中式通勤穿搭 × 菜篮子包", "likes": 680, "date": "03-18", "type": "穿搭OOTD"},
                {"title": "山下有松 × 故宫联名系列", "likes": 2100, "date": "03-10", "type": "联名"},
            ],
            "posting_frequency": "每周4-5篇",
            "avg_engagement": "3.5%",
        },
        "d4_kol_ecosystem": {
            "xhs_kols": [
                {"name": "一只穿搭酱", "followers": 520000, "type": "头部KOL"},
                {"name": "新中式生活家", "followers": 180000, "type": "腰部KOL"},
            ],
            "xhs_collab_count": 28,
            "xhs_celebrity_mentions": ["章子怡(机场街拍)", "刘雯(杂志合作)"],
            "douyin_creators": [
                {"name": "Songmont官方", "followers": 520000, "type": "官方"},
            ],
            "douyin_mentions_count": 95,
            "douyin_hashtag_views": {"#Songmont": "1.5亿", "#山下有松": "8900万", "#新中式包包": "3.2亿"},
        },
        "d5_social_commerce": {
            "live_status": "active",
            "live_viewers": 3500,
            "shop_product_count": 68,
            "live_frequency": "每周3-4天",
            "avg_live_viewers": "2000-4000",
            "top_selling_products": [
                {"name": "菜篮子包(植鞣皮)", "price": 1280, "sales_rank": 1},
                {"name": "新中式斜挎包", "price": 980, "sales_rank": 2},
            ],
        },
        "d6_consumer_mindshare": {
            "sentiment_keywords": ["设计感", "新中式", "植鞣皮", "品质感", "价格贵"],
            "positive_keywords": ["设计感强", "新中式", "植鞣皮质感", "独特", "有文化底蕴"],
            "negative_keywords": ["价格贵", "容量小", "颜色少"],
            "ugc_samples": [
                {"title": "Songmont菜篮子用了半年 越来越好看", "author": "皮具控", "date": "03-20", "sentiment": "positive"},
                {"title": "山下有松值不值？1280的包到底好不好", "author": "理性消费", "date": "03-15", "sentiment": "neutral"},
            ],
        },
        "d7_channel_authority": {
            "tmall_rank": "Top 25",
            "category_share": "1.8%",
            "monthly_sales_index": "4200",
            "price_band": "¥800-1800",
            "top_products": [
                {"name": "菜篮子包(植鞣皮)", "rank": 12, "price": 1280},
                {"name": "新中式斜挎包", "rank": 18, "price": 980},
            ],
            "traffic_sources": {"搜索": "40%", "推荐": "30%", "直播": "15%", "其他": "15%"},
            "conversion_index": "3.2%",
        },
    }

    # ── Group B: CASSILE ─────────────────────────────────────────────────
    brands["CASSILE"] = {
        "brand_name": "CASSILE",
        "brand_name_en": "Cassile",
        "group": "B",
        "group_name": "新兴国货",
        "badge": "法式优雅新秀",
        "scrape_date": today,
        "scrape_status": {"xhs": "success", "douyin": "success", "sycm": "partial"},
        "d1_brand_search_index": {
            "xhs_suggestions": ["CASSILE", "CASSILE包包", "cassile是什么品牌"],
            "xhs_related": ["国产轻奢包", "法式设计包包"],
            "douyin_suggestions": ["CASSILE官方旗舰店"],
            "douyin_trending": ["CASSILE新款"],
        },
        "d2_brand_voice_volume": {
            "xhs": {
                "followers": 42000,
                "notes": 180,
                "likes": 120000,
                "account_name": "CASSILE",
                "account_id": "cassile_xhs",
            },
            "douyin": {
                "followers": 85000,
                "videos": 150,
                "likes": 350000,
                "account_name": "CASSILE官方旗舰店",
                "account_id": "cassile_dy",
                "verified": True,
            },
        },
        "d3_content_strategy": {
            "content_types": {"产品展示": 35, "穿搭OOTD": 30, "品牌故事": 20, "UGC": 15},
            "top_notes": [
                {"title": "春季新品 | 法式优雅通勤包", "likes": 95, "date": "03-24", "type": "产品展示"},
                {"title": "CASSILE × 春日穿搭灵感", "likes": 68, "date": "03-20", "type": "穿搭OOTD"},
            ],
            "posting_frequency": "每周2-3篇",
            "avg_engagement": "2.8%",
        },
        "d4_kol_ecosystem": {
            "xhs_kols": [
                {"name": "轻奢包包测评", "followers": 95000, "type": "腰部KOL"},
            ],
            "xhs_collab_count": 10,
            "xhs_celebrity_mentions": [],
            "douyin_creators": [
                {"name": "CASSILE官方", "followers": 85000, "type": "官方"},
            ],
            "douyin_mentions_count": 18,
            "douyin_hashtag_views": {"#CASSILE": "1200万"},
        },
        "d5_social_commerce": {
            "live_status": "active",
            "live_viewers": 1200,
            "shop_product_count": 45,
            "live_frequency": "每周3天",
            "avg_live_viewers": "800-1500",
            "top_selling_products": [
                {"name": "法式链条包", "price": 580, "sales_rank": 1},
            ],
        },
        "d6_consumer_mindshare": {
            "sentiment_keywords": ["法式设计", "小众", "质感好", "品牌小"],
            "positive_keywords": ["设计好看", "小众独特", "质感好", "包装精致"],
            "negative_keywords": ["品牌知名度低", "线下没见过"],
            "ugc_samples": [
                {"title": "发现一个小众宝藏包包品牌CASSILE", "author": "小众探店", "date": "03-21", "sentiment": "positive"},
            ],
        },
        "d7_channel_authority": {
            "tmall_rank": "Top 80",
            "category_share": "0.8%",
            "monthly_sales_index": "1800",
            "price_band": "¥400-900",
            "top_products": [
                {"name": "法式链条包", "rank": 55, "price": 580},
            ],
            "traffic_sources": {"搜索": "30%", "推荐": "40%", "直播": "20%", "其他": "10%"},
            "conversion_index": "3.8%",
        },
    }

    return brands


def seed(db_path: str = None) -> None:
    """Populate the database with sample data."""
    db_path = db_path or DEFAULT_DB_PATH
    conn = init_db(db_path)

    # Check if we already have data
    existing = conn.execute("SELECT COUNT(*) as cnt FROM snapshots").fetchone()["cnt"]
    if existing > 0:
        print(f"Database already has {existing} snapshots. Skipping seed.")
        print(f"  Delete {db_path} and re-run to start fresh.")
        conn.close()
        return

    brands = build_sample_brands()

    run_id = record_scrape_run(
        conn,
        status="completed",
        brands_attempted=len(brands),
        brands_succeeded=len(brands),
        error_log="Seeded with sample data",
    )

    for brand_name, brand_data in brands.items():
        save_snapshot(conn, run_id, brand_name, brand_data)
        print(f"  Seeded: {brand_name}")

    conn.close()
    print(f"\nDone. {len(brands)} brands seeded into {db_path}")


if __name__ == "__main__":
    seed()
