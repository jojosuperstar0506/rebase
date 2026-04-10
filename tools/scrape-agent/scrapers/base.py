import asyncio
import random
import re
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any


@dataclass
class ScrapedProfile:
    follower_count: Optional[int] = None
    total_products: Optional[int] = None
    total_notes: Optional[int] = None
    total_likes: Optional[int] = None
    avg_price: Optional[float] = None
    engagement_metrics: Dict[str, Any] = field(default_factory=dict)
    content_metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScrapedProduct:
    product_id: str = ''
    product_name: str = ''
    price: Optional[float] = None
    sales_volume: Optional[int] = None
    review_count: Optional[int] = None
    product_url: str = ''


class BaseScraper:
    platform_name = 'unknown'

    async def scrape_brand(self, page, brand_name: str, keyword: str):
        raise NotImplementedError

    async def wait_human(self, min_s=1.0, max_s=3.0):
        await asyncio.sleep(random.uniform(min_s, max_s))

    def extract_number(self, text):
        if not text:
            return None
        text = str(text).strip().replace(',', '').replace(' ', '')
        for suffix, mult in {
            '万': 10000, '亿': 100000000,
            'w': 10000, 'k': 1000,
            'W': 10000, 'K': 1000,
        }.items():
            if suffix in text:
                try:
                    return int(float(text.replace(suffix, '')) * mult)
                except ValueError:
                    pass
        match = re.search(r'[\d.]+', text)
        if match:
            try:
                return int(float(match.group()))
            except ValueError:
                pass
        return None

    def extract_price(self, text):
        if not text:
            return None
        text = str(text).replace('¥', '').replace('￥', '').replace(',', '').strip()
        match = re.search(r'[\d.]+', text)
        if match:
            try:
                return float(match.group())
            except ValueError:
                pass
        return None
