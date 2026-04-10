from .base import BaseScraper, ScrapedProfile


class DouyinScraper(BaseScraper):
    platform_name = 'douyin'

    async def scrape_brand(self, page, brand_name: str, keyword: str):
        print(f"    [Douyin] {keyword}: not yet implemented, skipping")
        return ScrapedProfile(), [], {}
