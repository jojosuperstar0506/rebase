import json
import re

from .base import BaseScraper, ScrapedProfile, ScrapedProduct


class XhsScraper(BaseScraper):
    platform_name = 'xhs'

    async def scrape_brand(self, page, brand_name: str, keyword: str):
        profile = ScrapedProfile()
        products = []
        raw_dims = {}

        # ── Step 1: Search for brand content (notes) ─────────────────────────
        try:
            url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}&type=51"
            await page.goto(url, wait_until='networkidle', timeout=30000)
            await self.wait_human(2, 4)

            snapshot = await page.accessibility.snapshot()
            tree = json.dumps(snapshot, ensure_ascii=False) if snapshot else ''

            # Extract search result count
            count_match = re.search(r'(\d[\d,]*)\s*(?:篇|条|个)\s*(?:笔记|结果)', tree)
            result_count = self.extract_number(count_match.group(1)) if count_match else None

            # Extract note titles from results
            titles = re.findall(r'"name":\s*"([^"]{10,80})"', tree)
            notes = [
                t for t in titles
                if not any(skip in t.lower() for skip in ['小红书', 'search', '搜索', '筛选', 'filter'])
            ][:10]

            raw_dims['d1_search'] = {
                'keyword': keyword,
                'result_count': result_count,
                'top_titles': notes[:5],
            }
            print(f"    [XHS Search] {keyword}: {len(notes)} notes found")

        except Exception as e:
            print(f"    [XHS Search] {keyword}: error — {e}")
            raw_dims['d1_search'] = {'error': str(e)}

        # ── Step 2: Search for brand profile (users) ──────────────────────────
        try:
            url = f"https://www.xiaohongshu.com/search_result?keyword={keyword}&type=52"
            await page.goto(url, wait_until='networkidle', timeout=30000)
            await self.wait_human(2, 4)

            snapshot = await page.accessibility.snapshot()
            tree = json.dumps(snapshot, ensure_ascii=False) if snapshot else ''

            # Extract follower/notes/likes counts
            for pattern, attr in [
                (r'(\d[\d,.]*[万wWkK]?)\s*(?:粉丝|关注者|followers)', 'follower_count'),
                (r'(\d[\d,.]*[万wWkK]?)\s*(?:笔记|notes)', 'total_notes'),
                (r'(\d[\d,.]*[万wWkK]?)\s*(?:获赞|赞|likes)', 'total_likes'),
            ]:
                match = re.search(pattern, tree)
                if match:
                    setattr(profile, attr, self.extract_number(match.group(1)))

            profile.engagement_metrics = {
                'total_likes': profile.total_likes,
                'total_notes': profile.total_notes,
            }

            raw_dims['d2_voice'] = {
                'followers': profile.follower_count,
                'notes': profile.total_notes,
                'likes': profile.total_likes,
            }
            print(
                f"    [XHS Profile] {keyword}: "
                f"followers={profile.follower_count}, "
                f"notes={profile.total_notes}, "
                f"likes={profile.total_likes}"
            )

        except Exception as e:
            print(f"    [XHS Profile] {keyword}: error — {e}")
            raw_dims['d2_voice'] = {'error': str(e)}

        return profile, products, raw_dims
