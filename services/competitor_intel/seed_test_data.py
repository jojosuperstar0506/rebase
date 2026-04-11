"""
Insert test scraped data for scoring pipeline verification.

Usage:
  python -m services.competitor_intel.seed_test_data
"""

from .db_bridge import get_conn, save_brand_profile, save_products


def seed():
    test_brands = [
        {
            "name": "Songmont",
            "profile": {
                "follower_count": 85000,
                "total_products": 45,
                "avg_price": 1200,
                "engagement_metrics": {"total_likes": 180000, "total_notes": 320},
                "content_metrics": {
                    "content_types": {"OOTD": 40, "review": 25, "unboxing": 15}
                },
            },
            "products": [
                {
                    "product_id": "sm-001",
                    "product_name": "Songmont Luna\u6258\u7279\u5305",
                    "price": 1380,
                    "sales_volume": 3200,
                    "review_count": 450,
                },
                {
                    "product_id": "sm-002",
                    "product_name": "Songmont Medium\u624b\u63d0\u5305",
                    "price": 1180,
                    "sales_volume": 2800,
                    "review_count": 320,
                },
                {
                    "product_id": "sm-003",
                    "product_name": "Songmont Mini\u659c\u6338\u5305",
                    "price": 980,
                    "sales_volume": 4100,
                    "review_count": 580,
                },
            ],
        },
        {
            "name": "\u53e4\u826f\u5409\u5409",
            "profile": {
                "follower_count": 62000,
                "total_products": 30,
                "avg_price": 800,
                "engagement_metrics": {"total_likes": 120000, "total_notes": 210},
                "content_metrics": {
                    "content_types": {"OOTD": 35, "review": 30, "daily": 20}
                },
            },
            "products": [
                {
                    "product_id": "gl-001",
                    "product_name": "\u53e4\u826f\u5409\u5409 \u997a\u5b50\u5305",
                    "price": 860,
                    "sales_volume": 2500,
                    "review_count": 380,
                },
                {
                    "product_id": "gl-002",
                    "product_name": "\u53e4\u826f\u5409\u5409 \u8ff7\u4f60\u65b9\u5305",
                    "price": 720,
                    "sales_volume": 1800,
                    "review_count": 260,
                },
            ],
        },
        {
            "name": "CASSILE",
            "profile": {
                "follower_count": 15000,
                "total_products": 22,
                "avg_price": 350,
                "engagement_metrics": {"total_likes": 25000, "total_notes": 85},
                "content_metrics": {"content_types": {"OOTD": 20, "review": 15}},
            },
            "products": [
                {
                    "product_id": "cs-001",
                    "product_name": "CASSILE \u901a\u52e4\u624b\u63d0\u5305",
                    "price": 380,
                    "sales_volume": 1200,
                    "review_count": 150,
                },
                {
                    "product_id": "cs-002",
                    "product_name": "CASSILE \u94fe\u6761\u659c\u6338\u5305",
                    "price": 320,
                    "sales_volume": 900,
                    "review_count": 95,
                },
            ],
        },
    ]

    for brand in test_brands:
        print(f"Seeding {brand['name']}...")
        save_brand_profile("xhs", brand["name"], brand["profile"], scrape_tier="watchlist")
        save_products("xhs", brand["name"], brand["products"], scrape_tier="watchlist")

    print("Test data seeded successfully.")


if __name__ == "__main__":
    seed()
