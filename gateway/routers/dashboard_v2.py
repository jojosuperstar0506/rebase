"""
Dashboard v2: Serves competitive intelligence data to authenticated customers.

The data comes from PostgreSQL (populated by the nightly scraper on Joanna's laptop).
Falls back to static JSON if DB is empty.

Route-level auth is handled by ProtectedRoute in the React frontend (invite-code JWT).
This endpoint trusts the frontend auth gate and focuses on data delivery.

Endpoints:
  GET /api/v2/dashboard?industry=bag  — full dashboard data for the given industry
"""
import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query

from ..db import get_pool

router = APIRouter(prefix="/api/v2/dashboard", tags=["dashboard-v2"])


@router.get("")
async def get_dashboard(industry: str = Query(default="bag", description="Industry slug (e.g. 'bag')")):
    """
    Return competitive intelligence dashboard data for the given industry.

    Auth is enforced at the React route level (ProtectedRoute). This endpoint
    accepts any request that reaches it and returns the shared industry dataset.

    Tries PostgreSQL first. Falls back to the static JSON file if DB is empty.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        # Get industry info by slug
        industry_row = await conn.fetchrow(
            "SELECT id, slug, name_zh, name_en FROM industries WHERE slug = $1", industry
        )
        if not industry_row:
            raise HTTPException(404, f"Industry '{industry}' not found")

        industry_id = industry_row["id"]

        # Get latest scrape date for this industry
        latest_date = await conn.fetchval(
            """
            SELECT MAX(bs.scrape_date)
            FROM brand_snapshots bs
            JOIN brands b ON bs.brand_id = b.id
            WHERE b.industry_id = $1
            """,
            industry_id,
        )

        if not latest_date:
            # No data in DB yet — fall back to static JSON
            return _static_fallback(industry_row)

        # Get all brands with their latest scores and narratives
        brands_data = await conn.fetch(
            """
            SELECT
                b.name, b.name_en, b.badge, b.group_key,
                bs.scrape_date, bs.xhs_status, bs.douyin_status, bs.sycm_status,
                sc.momentum_score, sc.threat_index, sc.wtp_score, sc.gtm_signals,
                n.strategic_summary, n.action_items, n.brand_detail
            FROM brands b
            LEFT JOIN brand_snapshots bs ON bs.brand_id = b.id AND bs.scrape_date = $2
            LEFT JOIN brand_scores sc ON sc.brand_id = b.id AND sc.score_date = $2
            LEFT JOIN brand_narratives n ON n.brand_id = b.id AND n.narrative_date = $2
            WHERE b.industry_id = $1 AND b.is_active = TRUE
            ORDER BY sc.momentum_score DESC NULLS LAST
            """,
            industry_id, latest_date,
        )

        brands = []
        all_action_items = []
        for row in brands_data:
            brand = {
                "brand_name": row["name"],
                "brand_name_en": row["name_en"] or "",
                "badge": row["badge"] or "",
                "group": row["group_key"] or "",
                "scrape_date": row["scrape_date"].isoformat() if row["scrape_date"] else None,
                "momentum_score": round(row["momentum_score"] or 0, 1),
                "threat_index": round(row["threat_index"] or 0, 1),
                "wtp_score": round(row["wtp_score"] or 0, 1),
                "trend_signals": json.loads(row["gtm_signals"]) if row["gtm_signals"] else [],
                "strategic_summary": row["strategic_summary"] or "",
            }
            brands.append(brand)
            if row["action_items"]:
                items = json.loads(row["action_items"])
                if isinstance(items, list):
                    all_action_items.extend(items)

    return {
        "industry": {
            "slug": industry_row["slug"],
            "name_zh": industry_row["name_zh"],
            "name_en": industry_row["name_en"],
        },
        "last_updated": latest_date.isoformat() if latest_date else None,
        "brand_name": "",  # populated from customer context in future
        "competitors": brands,
        "action_items": all_action_items[:10],
        "narrative": "",
    }


def _static_fallback(industry_row) -> dict:
    """
    Fall back to the static competitors_latest.json if DB has no data yet.
    This ensures the dashboard works from day 1 even before the scraper runs.
    """
    static_path = (
        Path(__file__).parent.parent.parent
        / "frontend" / "public" / "data" / "competitors" / "competitors_latest.json"
    )
    if static_path.exists():
        with open(static_path, encoding="utf-8") as f:
            data = json.load(f)

        # Convert static JSON brands to the dashboard format
        brands = []
        scores = data.get("scores", {}).get("brands", {})
        for name, brand_data in data.get("brands", {}).items():
            s = scores.get(name, {})
            brands.append({
                "brand_name": name,
                "brand_name_en": brand_data.get("brand_name_en", ""),
                "momentum_score": round(s.get("momentum_score", 0), 1),
                "threat_index": round(s.get("threat_index", 0), 1),
                "wtp_score": round(s.get("threat_index", 0) * 0.8, 1),
                "trend_signals": s.get("gtm_signals", []),
                "strategic_summary": "",
            })

        narratives = data.get("narratives", {})
        action_items = narratives.get("action_items", [])
        if isinstance(action_items, str):
            try:
                action_items = json.loads(action_items)
            except Exception:
                action_items = []

        return {
            "industry": {
                "slug": industry_row["slug"],
                "name_zh": industry_row["name_zh"],
                "name_en": industry_row["name_en"],
            },
            "last_updated": data.get("scrape_date"),
            "brand_name": "",
            "competitors": brands,
            "action_items": action_items[:10],
            "narrative": narratives.get("strategic_summary", ""),
            "_source": "static_fallback",
        }

    return {
        "industry": {
            "slug": industry_row["slug"],
            "name_zh": industry_row["name_zh"],
            "name_en": industry_row["name_en"],
        },
        "last_updated": None,
        "brand_name": "",
        "competitors": [],
        "action_items": [],
        "narrative": "",
        "_source": "empty",
    }
