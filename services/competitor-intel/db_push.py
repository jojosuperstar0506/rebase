"""
Push scraped competitor intelligence data to PostgreSQL.

Called by the orchestrator after a successful scrape run. Stores brand snapshots,
scores, and narratives in the database so the Rebase SaaS dashboard can serve
live data to customers.

Requires DATABASE_URL environment variable.
"""

import os
import json
import logging
import asyncio
from datetime import date
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

DATABASE_URL = os.environ.get("DATABASE_URL", "")


async def push_scrape_results(output: Dict[str, Any], scores: Optional[Dict] = None, narratives: Optional[Dict] = None):
    """
    Push a full scrape run result to PostgreSQL.

    Args:
        output: The assembled JSON from orchestrator._assemble_output()
                Contains output["brands"] dict keyed by brand name.
        scores: Optional scores dict from the scoring pipeline.
                Format: { "brands": { "Brand Name": { "momentum_score": ..., "threat_index": ..., "gtm_signals": [...] } } }
        narratives: Optional narratives dict from the narrative pipeline.
                    Format: { "brand_narratives": { "Brand Name": { "strategic_summary": ..., "action_items": [...] } },
                              "action_items": [...] }
    """
    if not DATABASE_URL:
        logger.warning("DATABASE_URL not set — skipping PostgreSQL push")
        return

    try:
        import asyncpg
    except ImportError:
        logger.warning("asyncpg not installed — skipping PostgreSQL push. Run: pip install asyncpg")
        return

    scrape_date = date.fromisoformat(output.get("scrape_date", date.today().isoformat()))
    brands_data = output.get("brands", {})

    if not brands_data:
        logger.warning("No brand data to push")
        return

    try:
        conn = await asyncpg.connect(DATABASE_URL)
        try:
            # Get the bag industry id (or create it)
            industry_id = await conn.fetchval(
                "SELECT id FROM industries WHERE slug = 'bag'"
            )
            if not industry_id:
                industry_id = await conn.fetchval(
                    "INSERT INTO industries (slug, name_zh, name_en) VALUES ('bag', '箱包', 'Handbags & Accessories') RETURNING id"
                )
                logger.info(f"Created bag industry with id={industry_id}")

            pushed = 0
            for brand_name, brand_data in brands_data.items():
                try:
                    await _upsert_brand(conn, brand_name, brand_data, industry_id, scrape_date, scores, narratives)
                    pushed += 1
                except Exception as e:
                    logger.error(f"Failed to push brand {brand_name}: {e}")

            logger.info(f"PostgreSQL push complete: {pushed}/{len(brands_data)} brands pushed for {scrape_date}")

        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"PostgreSQL push failed: {e}")
        # Non-fatal — JSON files are still written even if DB push fails


async def _upsert_brand(
    conn,
    brand_name: str,
    brand_data: dict,
    industry_id: int,
    scrape_date: date,
    scores: Optional[Dict],
    narratives: Optional[Dict],
):
    """Upsert one brand's data into the database."""

    # 1. Ensure brand exists in brands table
    brand_id = await conn.fetchval(
        "SELECT id FROM brands WHERE name = $1 AND industry_id = $2",
        brand_name, industry_id
    )
    if not brand_id:
        brand_id = await conn.fetchval(
            """
            INSERT INTO brands (name, name_en, industry_id, xhs_keyword, douyin_keyword, badge, group_key)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
            """,
            brand_name,
            brand_data.get("brand_name_en", ""),
            industry_id,
            brand_data.get("d1_brand_search_index", {}).get("xhs_suggestions", [""])[0] if brand_data.get("d1_brand_search_index") else "",
            brand_data.get("d1_brand_search_index", {}).get("douyin_suggestions", [""])[0] if brand_data.get("d1_brand_search_index") else "",
            brand_data.get("badge", ""),
            brand_data.get("group", ""),
        )
        logger.debug(f"Created brand: {brand_name} (id={brand_id})")

    # 2. Upsert brand snapshot (raw scraped data)
    scrape_status = brand_data.get("scrape_status", {})
    await conn.execute(
        """
        INSERT INTO brand_snapshots (brand_id, scrape_date, xhs_status, douyin_status, sycm_status, raw_data)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (brand_id, scrape_date)
        DO UPDATE SET xhs_status = EXCLUDED.xhs_status,
                      douyin_status = EXCLUDED.douyin_status,
                      sycm_status = EXCLUDED.sycm_status,
                      raw_data = EXCLUDED.raw_data,
                      created_at = NOW()
        """,
        brand_id, scrape_date,
        scrape_status.get("xhs", "unknown"),
        scrape_status.get("douyin", "unknown"),
        scrape_status.get("sycm", "skipped"),
        json.dumps(brand_data, ensure_ascii=False),
    )

    # 3. Upsert scores if available
    if scores and "brands" in scores:
        brand_scores = scores["brands"].get(brand_name, {})
        if brand_scores:
            await conn.execute(
                """
                INSERT INTO brand_scores (brand_id, score_date, momentum_score, threat_index, wtp_score, gtm_signals)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (brand_id, score_date)
                DO UPDATE SET momentum_score = EXCLUDED.momentum_score,
                              threat_index = EXCLUDED.threat_index,
                              wtp_score = EXCLUDED.wtp_score,
                              gtm_signals = EXCLUDED.gtm_signals,
                              created_at = NOW()
                """,
                brand_id, scrape_date,
                float(brand_scores.get("momentum_score", 0)),
                float(brand_scores.get("threat_index", 0)),
                float(brand_scores.get("wtp_score", brand_scores.get("threat_index", 0) * 0.8)),  # wtp_score derived if not set
                json.dumps(brand_scores.get("gtm_signals", []), ensure_ascii=False),
            )

    # 4. Upsert narratives if available
    if narratives:
        brand_narratives = narratives.get("brand_narratives", {}).get(brand_name, {})
        # Use brand-level action items OR global action items
        action_items = brand_narratives.get("action_items", narratives.get("action_items", []))
        strategic_summary = brand_narratives.get("strategic_summary", narratives.get("strategic_summary", ""))

        if strategic_summary or action_items:
            await conn.execute(
                """
                INSERT INTO brand_narratives (brand_id, narrative_date, strategic_summary, action_items, brand_detail)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (brand_id, narrative_date)
                DO UPDATE SET strategic_summary = EXCLUDED.strategic_summary,
                              action_items = EXCLUDED.action_items,
                              brand_detail = EXCLUDED.brand_detail,
                              created_at = NOW()
                """,
                brand_id, scrape_date,
                strategic_summary,
                json.dumps(action_items if isinstance(action_items, list) else [], ensure_ascii=False),
                json.dumps(brand_narratives, ensure_ascii=False),
            )


def push_scrape_results_sync(output: Dict[str, Any], scores: Optional[Dict] = None, narratives: Optional[Dict] = None):
    """Synchronous wrapper for push_scrape_results. Use from non-async contexts."""
    asyncio.run(push_scrape_results(output, scores, narratives))
