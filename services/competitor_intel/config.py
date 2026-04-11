"""
Configuration for OMI Competitive Intelligence pipeline.
Brand definitions, scraping targets, and dimension mappings.
"""

import os
from typing import Dict, List

# ─── Brand Registry ───────────────────────────────────────────────────────────
# 20 competitor brands organized into 3 strategic groups

BRAND_GROUPS: Dict[str, dict] = {
    "D": {
        "name": "快时尚/International",
        "subtitle": "The Ceiling Above You",
        "brands": [
            {"name": "小CK", "name_en": "Charles & Keith", "xhs_keyword": "小CK", "douyin_keyword": "小CK",
             "tmall_store": "charleskeith", "badge": "东南亚快时尚标杆"},
            {"name": "COACH", "name_en": "Coach", "xhs_keyword": "COACH蔻驰", "douyin_keyword": "COACH",
             "tmall_store": "coach", "badge": "轻奢皮具龙头"},
            {"name": "MK", "name_en": "Michael Kors", "xhs_keyword": "MK包包", "douyin_keyword": "MK Michael Kors",
             "tmall_store": "michaelkors", "badge": "美式轻奢代表"},
            {"name": "Kipling", "name_en": "Kipling", "xhs_keyword": "Kipling凯浦林", "douyin_keyword": "Kipling",
             "tmall_store": "kipling", "badge": "功能性时尚先驱"},
        ],
    },
    "C": {
        "name": "价值挑战者",
        "subtitle": "Your Actual Fight",
        "brands": [
            {"name": "La Festin", "name_en": "La Festin", "xhs_keyword": "拉菲斯汀", "douyin_keyword": "拉菲斯汀",
             "tmall_store": "lafestin", "badge": "法式轻奢新贵"},
            {"name": "Cnolés蔻一", "name_en": "Cnoles", "xhs_keyword": "蔻一", "douyin_keyword": "蔻一Cnoles",
             "tmall_store": "cnoles", "badge": "直播电商黑马"},
            {"name": "ECODAY", "name_en": "Ecoday", "xhs_keyword": "ECODAY", "douyin_keyword": "ECODAY",
             "tmall_store": "ecoday", "badge": "环保设计新锐"},
            {"name": "VINEY", "name_en": "Viney", "xhs_keyword": "VINEY", "douyin_keyword": "VINEY女包",
             "tmall_store": "viney", "badge": "性价比之王"},
            {"name": "FOXER", "name_en": "Foxer", "xhs_keyword": "FOXER金狐狸", "douyin_keyword": "金狐狸FOXER",
             "tmall_store": "foxer", "badge": "传统皮具老牌"},
            {"name": "NUCELLE", "name_en": "Nucelle", "xhs_keyword": "纽芝兰", "douyin_keyword": "纽芝兰NUCELLE",
             "tmall_store": "nucelle", "badge": "新锐设计品牌"},
            {"name": "OMTO", "name_en": "OMTO", "xhs_keyword": "OMTO", "douyin_keyword": "OMTO",
             "tmall_store": "omto", "badge": "简约通勤新星"},
            {"name": "muva", "name_en": "Muva", "xhs_keyword": "muva", "douyin_keyword": "muva女包",
             "tmall_store": "muva", "badge": "新生代潮流"},
        ],
    },
    "B": {
        "name": "新兴国货",
        "subtitle": "Where You Want to Be",
        "brands": [
            {"name": "Songmont", "name_en": "Songmont", "xhs_keyword": "Songmont山下有松", "douyin_keyword": "Songmont",
             "tmall_store": "songmont", "badge": "新中式设计标杆"},
            {"name": "古良吉吉", "name_en": "Guliang Jiji", "xhs_keyword": "古良吉吉", "douyin_keyword": "古良吉吉",
             "tmall_store": "guliangstore", "badge": "独立设计师品牌"},
            {"name": "裘真", "name_en": "Qiuzhen", "xhs_keyword": "裘真", "douyin_keyword": "裘真",
             "tmall_store": "qiuzhen", "badge": "真皮匠心品牌"},
            {"name": "DISSONA", "name_en": "Dissona", "xhs_keyword": "迪桑娜", "douyin_keyword": "DISSONA迪桑娜",
             "tmall_store": "dissona", "badge": "高端国货皮具"},
            {"name": "Amazing Song", "name_en": "Amazing Song", "xhs_keyword": "歌蒂诗", "douyin_keyword": "Amazing Song歌蒂诗",
             "tmall_store": "amazingsong", "badge": "艺术跨界先锋"},
            {"name": "CASSILE", "name_en": "Cassile", "xhs_keyword": "CASSILE", "douyin_keyword": "CASSILE",
             "tmall_store": "cassile", "badge": "法式优雅新秀"},
            {"name": "西木汀", "name_en": "Ximuting", "xhs_keyword": "西木汀", "douyin_keyword": "西木汀",
             "tmall_store": "ximuting", "badge": "小众设计新锐"},
            {"name": "红谷", "name_en": "Honggu", "xhs_keyword": "红谷", "douyin_keyword": "红谷HONGGU",
             "tmall_store": "honggu", "badge": "渠道之王"},
        ],
    },
}

# Priority order for scraping (most strategically important first)
SCRAPE_PRIORITY: List[str] = [
    "CASSILE", "裘真", "Songmont",  # Direct competitors
    "La Festin", "Cnolés蔻一", "ECODAY", "VINEY", "FOXER", "NUCELLE", "OMTO", "muva",  # Group C
    "古良吉吉", "DISSONA", "Amazing Song", "西木汀", "红谷",  # Rest of Group B
    "小CK", "COACH", "MK", "Kipling",  # Group D (reference only)
]


def get_all_brands() -> List[dict]:
    """Return flat list of all brands with group info attached."""
    brands = []
    for group_key, group in BRAND_GROUPS.items():
        for brand in group["brands"]:
            brands.append({
                **brand,
                "group": group_key,
                "group_name": group["name"],
                "group_subtitle": group["subtitle"],
            })
    return brands


def get_brand_by_name(name: str) -> dict | None:
    """Look up a brand by its Chinese or English name."""
    for brand in get_all_brands():
        if brand["name"] == name or brand["name_en"] == name:
            return brand
    return None


# ─── Platform URLs ────────────────────────────────────────────────────────────

XHS_SEARCH_URL = "https://www.xiaohongshu.com/search_result?keyword={keyword}&type=51"
XHS_PROFILE_URL = "https://www.xiaohongshu.com/user/profile/{user_id}"

DOUYIN_SEARCH_URL = "https://www.douyin.com/search/{keyword}?type=user"
DOUYIN_PROFILE_URL = "https://www.douyin.com/user/{user_id}"

SYCM_URL = "https://sycm.taobao.com"  # Requires logged-in session

BAIDU_INDEX_URL = "https://index.baidu.com/v2/main/index.html#/trend/{keyword}"


# ─── Environment / Secrets ────────────────────────────────────────────────────

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-20250514")

# Output paths
DATA_DIR = os.environ.get("COMPETITOR_DATA_DIR", "frontend/src/data/competitors")
HTML_OUTPUT_DIR = os.environ.get("COMPETITOR_HTML_DIR", "frontend/public")

# GitHub push config (for CI/CD)
GITHUB_REPO = os.environ.get("GITHUB_REPO", "jojosuperstar0506/rebase")
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GIT_BRANCH = os.environ.get("GIT_BRANCH", "main")
