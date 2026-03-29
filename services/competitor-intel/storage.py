"""
SQLite storage layer for OMI Competitive Intelligence pipeline.

Replaces flat JSON files as the system's data backbone. Provides:
- Brand registry (synced from config.py)
- Scrape run tracking
- Per-brand snapshots with full 7-dimension JSON
- Normalized metrics table for easy trending/scoring
- Deltas table (schema only — populated by TASK-04 temporal engine)

All functions are synchronous. Uses Python's built-in sqlite3 module.
"""

import json
import os
import sqlite3
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from .config import BRAND_GROUPS
from .config import get_all_brands as _config_get_all_brands


# Default database path
DEFAULT_DB_PATH = os.path.join(
    os.path.dirname(__file__), "data", "competitor_intel.db"
)

# Metric extraction mapping: metric_name -> (json_path, platform)
# json_path is a dot-separated path into the merged 7-dimension dict.
METRIC_EXTRACTION_MAP: List[Tuple[str, str, str]] = [
    # (metric_name, json_path, platform)
    ("xhs_followers", "d2_brand_voice_volume.xhs.followers", "xhs"),
    ("xhs_notes", "d2_brand_voice_volume.xhs.notes", "xhs"),
    ("xhs_likes", "d2_brand_voice_volume.xhs.likes", "xhs"),
    ("douyin_followers", "d2_brand_voice_volume.douyin.followers", "douyin"),
    ("douyin_videos", "d2_brand_voice_volume.douyin.videos", "douyin"),
    ("douyin_likes", "d2_brand_voice_volume.douyin.likes", "douyin"),
    ("content_posting_frequency", "d3_content_strategy.posting_frequency", "xhs"),
    ("avg_engagement", "d3_content_strategy.avg_engagement", "xhs"),
    ("xhs_kol_collab_count", "d4_kol_ecosystem.xhs_collab_count", "xhs"),
    ("douyin_mentions_count", "d4_kol_ecosystem.douyin_mentions_count", "douyin"),
    ("live_status", "d5_social_commerce.live_status", "douyin"),
    ("shop_product_count", "d5_social_commerce.shop_product_count", "douyin"),
    ("tmall_rank", "d7_channel_authority.tmall_rank", "sycm"),
    ("category_share", "d7_channel_authority.category_share", "sycm"),
]


def _resolve_json_path(data: dict, path: str) -> Any:
    """
    Resolve a dot-separated path into a nested dict.

    Args:
        data: The nested dictionary to traverse.
        path: Dot-separated key path, e.g. 'd2_brand_voice_volume.xhs.followers'.

    Returns:
        The value at the path, or None if any key is missing.
    """
    current = data
    for key in path.split("."):
        if not isinstance(current, dict):
            return None
        current = current.get(key)
        if current is None:
            return None
    return current


def init_db(db_path: Optional[str] = None) -> sqlite3.Connection:
    """
    Initialize the SQLite database. Creates tables if they don't exist,
    and populates the brands table from config.py.

    Args:
        db_path: Path to the SQLite database file. Defaults to
                 services/competitor-intel/data/competitor_intel.db.

    Returns:
        An open sqlite3.Connection with row_factory set to sqlite3.Row.
    """
    db_path = db_path or DEFAULT_DB_PATH
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS brands (
            name TEXT PRIMARY KEY,
            name_en TEXT NOT NULL,
            "group" TEXT NOT NULL,
            group_name TEXT NOT NULL,
            badge TEXT NOT NULL DEFAULT '',
            xhs_keyword TEXT NOT NULL DEFAULT '',
            douyin_keyword TEXT NOT NULL DEFAULT '',
            tmall_store TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS scrape_runs (
            run_id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL DEFAULT (datetime('now')),
            status TEXT NOT NULL DEFAULT 'running',
            brands_attempted INTEGER NOT NULL DEFAULT 0,
            brands_succeeded INTEGER NOT NULL DEFAULT 0,
            error_log TEXT
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id INTEGER NOT NULL,
            brand_name TEXT NOT NULL,
            snapshot_date TEXT NOT NULL,
            data_json TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (run_id) REFERENCES scrape_runs(run_id),
            FOREIGN KEY (brand_name) REFERENCES brands(name)
        );

        CREATE INDEX IF NOT EXISTS idx_snapshots_brand_date
            ON snapshots(brand_name, snapshot_date DESC);

        CREATE INDEX IF NOT EXISTS idx_snapshots_run
            ON snapshots(run_id);

        CREATE TABLE IF NOT EXISTS metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_name TEXT NOT NULL,
            date TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            metric_value TEXT NOT NULL,
            platform TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (brand_name) REFERENCES brands(name)
        );

        CREATE INDEX IF NOT EXISTS idx_metrics_brand_metric_date
            ON metrics(brand_name, metric_name, date DESC);

        CREATE TABLE IF NOT EXISTS deltas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_name TEXT NOT NULL,
            date TEXT NOT NULL,
            metric_name TEXT NOT NULL,
            previous_value TEXT,
            current_value TEXT,
            absolute_change REAL,
            pct_change REAL,
            FOREIGN KEY (brand_name) REFERENCES brands(name)
        );

        CREATE INDEX IF NOT EXISTS idx_deltas_brand_date
            ON deltas(brand_name, date DESC);

        CREATE TABLE IF NOT EXISTS product_rankings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            extract_date TEXT NOT NULL,
            category_path TEXT,
            time_range TEXT,
            ranking_type TEXT,
            rank INTEGER NOT NULL,
            product_name TEXT NOT NULL,
            brand TEXT DEFAULT '',
            price TEXT,
            sales_metric_name TEXT,
            sales_metric_value REAL,
            store_name TEXT,
            product_id TEXT,
            sales_channel TEXT,
            raw_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE INDEX IF NOT EXISTS idx_rankings_source_date
            ON product_rankings(source, extract_date DESC);

        CREATE INDEX IF NOT EXISTS idx_rankings_brand
            ON product_rankings(brand, extract_date DESC);

        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_name TEXT NOT NULL,
            date TEXT NOT NULL,
            momentum_score REAL,
            threat_index REAL,
            gtm_signals TEXT,
            score_breakdown TEXT,
            threat_breakdown TEXT,
            data_completeness REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(brand_name, date)
        );

        CREATE INDEX IF NOT EXISTS idx_scores_brand_date
            ON scores(brand_name, date DESC);

        CREATE TABLE IF NOT EXISTS narratives (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            narrative_type TEXT NOT NULL,
            brand_name TEXT,
            content TEXT NOT NULL,
            model_used TEXT,
            input_tokens INTEGER,
            output_tokens INTEGER,
            cost_estimate REAL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(date, narrative_type, brand_name)
        );

        CREATE INDEX IF NOT EXISTS idx_narratives_date_type
            ON narratives(date DESC, narrative_type);
    """)

    # Populate brands from config (upsert)
    _sync_brands(conn)

    conn.commit()
    return conn


def _sync_brands(conn: sqlite3.Connection) -> None:
    """
    Populate the brands table from config.py. Uses INSERT OR REPLACE
    so the registry stays in sync with code changes.
    """
    all_brands = _config_get_all_brands()
    for brand in all_brands:
        conn.execute(
            """INSERT OR REPLACE INTO brands
               (name, name_en, "group", group_name, badge,
                xhs_keyword, douyin_keyword, tmall_store)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                brand["name"],
                brand["name_en"],
                brand["group"],
                brand["group_name"],
                brand.get("badge", ""),
                brand.get("xhs_keyword", ""),
                brand.get("douyin_keyword", ""),
                brand.get("tmall_store", ""),
            ),
        )


def record_scrape_run(
    conn: sqlite3.Connection,
    status: str = "running",
    brands_attempted: int = 0,
    brands_succeeded: int = 0,
    error_log: Optional[str] = None,
) -> int:
    """
    Record a new scrape run and return its run_id.

    Args:
        conn: Database connection.
        status: Run status ('running', 'completed', 'failed').
        brands_attempted: Number of brands the run will attempt.
        brands_succeeded: Number of brands successfully scraped.
        error_log: Any error messages from the run.

    Returns:
        The auto-generated run_id.
    """
    cursor = conn.execute(
        """INSERT INTO scrape_runs (status, brands_attempted, brands_succeeded, error_log)
           VALUES (?, ?, ?, ?)""",
        (status, brands_attempted, brands_succeeded, error_log),
    )
    conn.commit()
    return cursor.lastrowid


def update_scrape_run(
    conn: sqlite3.Connection,
    run_id: int,
    status: Optional[str] = None,
    brands_attempted: Optional[int] = None,
    brands_succeeded: Optional[int] = None,
    error_log: Optional[str] = None,
) -> None:
    """
    Update an existing scrape run record.

    Args:
        conn: Database connection.
        run_id: The run to update.
        status: New status (if changed).
        brands_attempted: Updated attempt count (if changed).
        brands_succeeded: Updated success count (if changed).
        error_log: Updated error log (if changed).
    """
    updates = []
    values = []
    if status is not None:
        updates.append("status = ?")
        values.append(status)
    if brands_attempted is not None:
        updates.append("brands_attempted = ?")
        values.append(brands_attempted)
    if brands_succeeded is not None:
        updates.append("brands_succeeded = ?")
        values.append(brands_succeeded)
    if error_log is not None:
        updates.append("error_log = ?")
        values.append(error_log)

    if not updates:
        return

    values.append(run_id)
    conn.execute(
        f"UPDATE scrape_runs SET {', '.join(updates)} WHERE run_id = ?",
        values,
    )
    conn.commit()


def save_snapshot(
    conn: sqlite3.Connection,
    run_id: int,
    brand_name: str,
    merged_data: dict,
) -> None:
    """
    Save a brand's merged 7-dimension data as a snapshot, and extract
    key metrics into the metrics table for easy trending.

    Args:
        conn: Database connection.
        run_id: The scrape run this snapshot belongs to.
        brand_name: Brand name (must exist in brands table).
        merged_data: The full merged 7-dimension dict for this brand.
    """
    snapshot_date = merged_data.get("scrape_date", datetime.now().strftime("%Y-%m-%d"))
    data_json = json.dumps(merged_data, ensure_ascii=False)

    conn.execute(
        """INSERT INTO snapshots (run_id, brand_name, snapshot_date, data_json)
           VALUES (?, ?, ?, ?)""",
        (run_id, brand_name, snapshot_date, data_json),
    )

    # Extract metrics
    _extract_metrics(conn, brand_name, snapshot_date, merged_data)

    conn.commit()


def _extract_metrics(
    conn: sqlite3.Connection,
    brand_name: str,
    date: str,
    data: dict,
) -> None:
    """
    Extract key metrics from merged data and insert into the metrics table.
    Uses the METRIC_EXTRACTION_MAP to know which fields to pull.
    """
    for metric_name, json_path, platform in METRIC_EXTRACTION_MAP:
        value = _resolve_json_path(data, json_path)
        if value is None:
            continue
        conn.execute(
            """INSERT INTO metrics (brand_name, date, metric_name, metric_value, platform)
               VALUES (?, ?, ?, ?, ?)""",
            (brand_name, date, metric_name, str(value), platform),
        )


def get_latest_snapshot(conn: sqlite3.Connection, brand_name: str) -> Optional[dict]:
    """
    Get the most recent snapshot for a brand.

    Args:
        conn: Database connection.
        brand_name: The brand to look up.

    Returns:
        The parsed JSON data dict, or None if no snapshot exists.
    """
    row = conn.execute(
        """SELECT data_json FROM snapshots
           WHERE brand_name = ?
           ORDER BY snapshot_date DESC, id DESC
           LIMIT 1""",
        (brand_name,),
    ).fetchone()

    if row is None:
        return None
    return json.loads(row["data_json"])


def get_metric_history(
    conn: sqlite3.Connection,
    brand_name: str,
    metric_name: str,
    days: int = 30,
) -> List[Tuple[str, str]]:
    """
    Get the history of a specific metric for a brand over a time range.

    Args:
        conn: Database connection.
        brand_name: The brand to query.
        metric_name: The metric to retrieve (e.g. 'xhs_followers').
        days: Number of days of history to return. Defaults to 30.

    Returns:
        List of (date, value) tuples, ordered by date ascending.
    """
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = conn.execute(
        """SELECT date, metric_value FROM metrics
           WHERE brand_name = ? AND metric_name = ? AND date >= ?
           ORDER BY date ASC""",
        (brand_name, metric_name, cutoff),
    ).fetchall()

    return [(row["date"], row["metric_value"]) for row in rows]


def get_all_brands(conn: sqlite3.Connection) -> List[dict]:
    """
    Get all brands from the database.

    Args:
        conn: Database connection.

    Returns:
        List of brand dicts with all registry fields.
    """
    rows = conn.execute(
        """SELECT name, name_en, "group", group_name, badge,
                  xhs_keyword, douyin_keyword, tmall_store
           FROM brands ORDER BY "group", name"""
    ).fetchall()

    return [dict(row) for row in rows]


def export_latest_json(conn: sqlite3.Connection, output_path: str) -> None:
    """
    Export the latest snapshots for all brands into a single JSON file
    matching the existing competitors_latest.json schema.

    This provides backward compatibility with any code that reads the
    flat JSON file.

    Args:
        conn: Database connection.
        output_path: File path to write the JSON output.
    """
    # Get the latest snapshot for each brand
    brands_data = {}
    brand_rows = conn.execute("SELECT name FROM brands").fetchall()

    for row in brand_rows:
        brand_name = row["name"]
        snapshot = get_latest_snapshot(conn, brand_name)
        if snapshot:
            brands_data[brand_name] = snapshot

    # Build the top-level output structure matching the existing schema
    output = {
        "scrape_date": datetime.now().strftime("%Y-%m-%d"),
        "scrape_version": "7dim-v1",
        "dashboard_html": "/competitor-intel.html",
        "brands_count": len(brands_data),
        "groups": {},
        "brands": brands_data,
    }

    # Build group structure from BRAND_GROUPS config
    for group_key, group in BRAND_GROUPS.items():
        output["groups"][group_key] = {
            "name": group["name"],
            "subtitle": group["subtitle"],
            "brands": [b["name"] for b in group["brands"]],
        }

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)


# ─── Enriched Dashboard Export ─────────────────────────────────────────────────


def export_dashboard_json(conn: sqlite3.Connection, output_path: str) -> None:
    """
    Export an enriched JSON file that includes brand snapshots, scores, signals,
    and narratives. This powers the Vercel static fallback with full intelligence.

    Args:
        conn: Database connection.
        output_path: File path to write the JSON output.
    """
    # Start with the base export structure
    brands_data = {}
    brand_rows = conn.execute("SELECT name FROM brands").fetchall()
    for row in brand_rows:
        brand_name = row["name"]
        snapshot = get_latest_snapshot(conn, brand_name)
        if snapshot:
            brands_data[brand_name] = snapshot

    # Scores
    scores_list = get_latest_scores(conn)
    scores_by_brand = {}
    scores_date = None
    for s in scores_list:
        scores_date = s.get("date", scores_date)
        scores_by_brand[s["brand_name"]] = {
            "momentum_score": s.get("momentum_score"),
            "threat_index": s.get("threat_index"),
            "gtm_signals": s.get("gtm_signals", []),
            "score_breakdown": s.get("score_breakdown", {}),
            "threat_breakdown": s.get("threat_breakdown", {}),
            "data_completeness": s.get("data_completeness", 0),
        }

    # Narratives
    all_narratives = get_latest_narratives(conn)
    brand_narratives = {}
    strategic_summary = None
    action_items = None
    narratives_date = None
    for n in all_narratives:
        narratives_date = n.get("date", narratives_date)
        if n["narrative_type"] == "brand" and n.get("brand_name"):
            brand_narratives[n["brand_name"]] = n["content"]
        elif n["narrative_type"] == "strategic_summary":
            strategic_summary = n["content"]
        elif n["narrative_type"] == "action_items":
            action_items = n["content"]

    output = {
        "scrape_date": datetime.now().strftime("%Y-%m-%d"),
        "scrape_version": "7dim-v1",
        "dashboard_html": "/competitor-intel.html",
        "brands_count": len(brands_data),
        "groups": {},
        "brands": brands_data,
        "scores": {
            "date": scores_date,
            "brands": scores_by_brand,
        },
        "narratives": {
            "date": narratives_date,
            "brand_narratives": brand_narratives,
            "strategic_summary": strategic_summary,
            "action_items": action_items,
        },
    }

    for group_key, group in BRAND_GROUPS.items():
        output["groups"][group_key] = {
            "name": group["name"],
            "subtitle": group["subtitle"],
            "brands": [b["name"] for b in group["brands"]],
        }

    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)


# ─── Product Rankings ─────────────────────────────────────────────────────────


def save_product_rankings(
    conn: sqlite3.Connection,
    source: str,
    extract_date: str,
    category_path: str,
    ranking_type: str,
    products: List[dict],
    time_range: str = "",
) -> int:
    """
    Bulk insert product ranking data into the product_rankings table.

    Args:
        conn: Database connection.
        source: 'sycm' or 'douyin_shop'.
        extract_date: ISO date string (YYYY-MM-DD).
        category_path: Category path string (e.g., '箱包皮具 > 女士包').
        ranking_type: Ranking metric (e.g., '交易指数', '销售额').
        products: List of product dicts from Chrome extraction.
        time_range: Time range string (e.g., '最近7天').

    Returns:
        Number of products inserted.
    """
    inserted = 0
    for prod in products:
        # Determine the primary sales metric based on source
        if source == "sycm":
            metric_name = "transaction_index"
            metric_value = prod.get("transaction_index")
        else:  # douyin_shop
            # Prefer sales_revenue, fall back to sales_volume
            if prod.get("sales_revenue") is not None:
                metric_name = "sales_revenue"
                metric_value = prod.get("sales_revenue")
            else:
                metric_name = "sales_volume"
                metric_value = prod.get("sales_volume")

        # Convert metric_value to float if possible
        if isinstance(metric_value, str):
            try:
                metric_value = float(metric_value)
            except (ValueError, TypeError):
                metric_value = None
        elif isinstance(metric_value, (int, float)):
            metric_value = float(metric_value)
        else:
            metric_value = None

        # Map sales_channel to normalized values
        raw_channel = prod.get("sales_channel", "")
        if isinstance(raw_channel, str):
            channel_map = {"直播": "livestream", "直播间": "livestream",
                           "短视频": "short_video", "商城": "shelf",
                           "品牌自播": "livestream", "达人带货": "livestream",
                           "品牌自播+达人": "livestream", "达人带货+自播": "livestream"}
            sales_channel = channel_map.get(raw_channel, raw_channel) or None
        else:
            sales_channel = None

        conn.execute(
            """INSERT INTO product_rankings
               (source, extract_date, category_path, time_range, ranking_type,
                rank, product_name, brand, price,
                sales_metric_name, sales_metric_value,
                store_name, product_id, sales_channel, raw_data)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                source,
                extract_date,
                category_path,
                time_range,
                ranking_type,
                prod.get("rank", 0),
                prod.get("product_name", ""),
                prod.get("brand", ""),
                prod.get("price", ""),
                metric_name,
                metric_value,
                prod.get("store_name", ""),
                prod.get("product_id", ""),
                sales_channel,
                json.dumps(prod, ensure_ascii=False),
            ),
        )
        inserted += 1

    conn.commit()
    return inserted


def get_product_rankings(
    conn: sqlite3.Connection,
    source: str,
    extract_date: Optional[str] = None,
    limit: int = 100,
) -> List[dict]:
    """
    Get product rankings for a given source and date.

    Args:
        conn: Database connection.
        source: 'sycm' or 'douyin_shop'.
        extract_date: ISO date string. If None, returns the most recent.
        limit: Maximum number of products to return (default 100).

    Returns:
        List of product ranking dicts, ordered by rank.
    """
    if extract_date is None:
        # Find the most recent extract_date for this source
        row = conn.execute(
            "SELECT MAX(extract_date) as d FROM product_rankings WHERE source = ?",
            (source,),
        ).fetchone()
        if row is None or row["d"] is None:
            return []
        extract_date = row["d"]

    rows = conn.execute(
        """SELECT rank, product_name, brand, price,
                  sales_metric_name, sales_metric_value,
                  store_name, product_id, sales_channel,
                  category_path, time_range, ranking_type, extract_date
           FROM product_rankings
           WHERE source = ? AND extract_date = ?
           ORDER BY rank ASC
           LIMIT ?""",
        (source, extract_date, limit),
    ).fetchall()

    return [dict(row) for row in rows]


def get_ranking_history(
    conn: sqlite3.Connection,
    brand_name: str,
    source: str,
    days: int = 30,
) -> List[Tuple[str, int, str, Optional[float]]]:
    """
    Get ranking history for a specific brand over time.

    Useful for tracking a brand's position changes in the category rankings.

    Args:
        conn: Database connection.
        brand_name: Brand name to filter by.
        source: 'sycm' or 'douyin_shop'.
        days: Number of days of history to return (default 30).

    Returns:
        List of (extract_date, rank, product_name, sales_metric_value) tuples,
        ordered by date ascending then rank ascending.
    """
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = conn.execute(
        """SELECT extract_date, rank, product_name, sales_metric_value
           FROM product_rankings
           WHERE brand = ? AND source = ? AND extract_date >= ?
           ORDER BY extract_date ASC, rank ASC""",
        (brand_name, source, cutoff),
    ).fetchall()

    return [
        (row["extract_date"], row["rank"], row["product_name"], row["sales_metric_value"])
        for row in rows
    ]


# ─── Deltas ───────────────────────────────────────────────────────────────────


def save_deltas(
    conn: sqlite3.Connection,
    brand_name: str,
    date: str,
    deltas_dict: Dict[str, dict],
) -> None:
    """
    Save computed deltas for a brand. Upsert behavior: overwrites existing
    entries for the same brand+date+metric.

    Args:
        conn: Database connection.
        brand_name: The brand these deltas belong to.
        date: ISO date string (YYYY-MM-DD).
        deltas_dict: Maps metric_name → {previous_value, current_value,
                     absolute_change, pct_change}.
    """
    for metric_name, delta in deltas_dict.items():
        # Delete any existing entry for this brand+date+metric
        conn.execute(
            "DELETE FROM deltas WHERE brand_name = ? AND date = ? AND metric_name = ?",
            (brand_name, date, metric_name),
        )
        conn.execute(
            """INSERT INTO deltas
               (brand_name, date, metric_name, previous_value, current_value,
                absolute_change, pct_change)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                brand_name,
                date,
                metric_name,
                str(delta.get("previous_value", "")),
                str(delta.get("current_value", "")),
                delta.get("absolute_change"),
                delta.get("pct_change"),
            ),
        )
    conn.commit()


def get_latest_deltas(
    conn: sqlite3.Connection,
    brand_name: Optional[str] = None,
) -> List[dict]:
    """
    Get the most recent deltas. If brand_name is None, returns all brands.

    Args:
        conn: Database connection.
        brand_name: Optional brand filter.

    Returns:
        List of delta dicts with brand_name, date, metric_name, etc.
    """
    if brand_name:
        # Find the latest date for this brand
        row = conn.execute(
            "SELECT MAX(date) as d FROM deltas WHERE brand_name = ?",
            (brand_name,),
        ).fetchone()
        if row is None or row["d"] is None:
            return []
        latest_date = row["d"]
        rows = conn.execute(
            """SELECT brand_name, date, metric_name, previous_value,
                      current_value, absolute_change, pct_change
               FROM deltas
               WHERE brand_name = ? AND date = ?
               ORDER BY metric_name""",
            (brand_name, latest_date),
        ).fetchall()
    else:
        # Find the global latest date
        row = conn.execute("SELECT MAX(date) as d FROM deltas").fetchone()
        if row is None or row["d"] is None:
            return []
        latest_date = row["d"]
        rows = conn.execute(
            """SELECT brand_name, date, metric_name, previous_value,
                      current_value, absolute_change, pct_change
               FROM deltas
               WHERE date = ?
               ORDER BY brand_name, metric_name""",
            (latest_date,),
        ).fetchall()

    return [dict(r) for r in rows]


def get_delta_history(
    conn: sqlite3.Connection,
    brand_name: str,
    metric_name: str,
    days: int = 30,
) -> List[Tuple[str, Optional[float], Optional[float]]]:
    """
    Get the history of deltas for a brand+metric over time.

    Useful for trending the rate of change itself.

    Args:
        conn: Database connection.
        brand_name: The brand to query.
        metric_name: The metric to retrieve.
        days: Number of days of history (default 30).

    Returns:
        List of (date, absolute_change, pct_change) tuples, ordered by date ASC.
    """
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = conn.execute(
        """SELECT date, absolute_change, pct_change
           FROM deltas
           WHERE brand_name = ? AND metric_name = ? AND date >= ?
           ORDER BY date ASC""",
        (brand_name, metric_name, cutoff),
    ).fetchall()

    return [(row["date"], row["absolute_change"], row["pct_change"]) for row in rows]


# ─── Scores ──────────────────────────────────────────────────────────────────


def save_scores(
    conn: sqlite3.Connection,
    brand_name: str,
    date: str,
    momentum_score: Optional[float],
    threat_index: Optional[float],
    gtm_signals: List[dict],
    score_breakdown: dict,
    threat_breakdown: dict,
    data_completeness: float,
) -> None:
    """
    Save computed scores for a brand. Upsert: replaces on brand_name+date conflict.

    Args:
        conn: Database connection.
        brand_name: The brand these scores belong to.
        date: ISO date string (YYYY-MM-DD).
        momentum_score: Brand momentum score (0-100).
        threat_index: Threat to OMI score (0-100).
        gtm_signals: List of active GTM signal dicts.
        score_breakdown: Full momentum score breakdown dict.
        threat_breakdown: Full threat index breakdown dict.
        data_completeness: Fraction of signals with data (0-1).
    """
    conn.execute(
        """INSERT OR REPLACE INTO scores
           (brand_name, date, momentum_score, threat_index, gtm_signals,
            score_breakdown, threat_breakdown, data_completeness)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            brand_name,
            date,
            momentum_score,
            threat_index,
            json.dumps(gtm_signals, ensure_ascii=False),
            json.dumps(score_breakdown, ensure_ascii=False),
            json.dumps(threat_breakdown, ensure_ascii=False),
            data_completeness,
        ),
    )
    conn.commit()


def get_latest_scores(
    conn: sqlite3.Connection,
    brand_name: Optional[str] = None,
) -> List[dict]:
    """
    Get the most recent scores. If brand_name is None, returns all brands.

    Args:
        conn: Database connection.
        brand_name: Optional brand filter.

    Returns:
        List of score dicts with all fields including parsed JSON.
    """
    if brand_name:
        row = conn.execute(
            "SELECT MAX(date) as d FROM scores WHERE brand_name = ?",
            (brand_name,),
        ).fetchone()
        if row is None or row["d"] is None:
            return []
        latest_date = row["d"]
        rows = conn.execute(
            """SELECT brand_name, date, momentum_score, threat_index,
                      gtm_signals, score_breakdown, threat_breakdown,
                      data_completeness
               FROM scores
               WHERE brand_name = ? AND date = ?""",
            (brand_name, latest_date),
        ).fetchall()
    else:
        row = conn.execute("SELECT MAX(date) as d FROM scores").fetchone()
        if row is None or row["d"] is None:
            return []
        latest_date = row["d"]
        rows = conn.execute(
            """SELECT brand_name, date, momentum_score, threat_index,
                      gtm_signals, score_breakdown, threat_breakdown,
                      data_completeness
               FROM scores
               WHERE date = ?
               ORDER BY brand_name""",
            (latest_date,),
        ).fetchall()

    results = []
    for r in rows:
        d = dict(r)
        # Parse JSON fields
        d["gtm_signals"] = json.loads(d["gtm_signals"]) if d["gtm_signals"] else []
        d["score_breakdown"] = json.loads(d["score_breakdown"]) if d["score_breakdown"] else {}
        d["threat_breakdown"] = json.loads(d["threat_breakdown"]) if d["threat_breakdown"] else {}
        results.append(d)
    return results


def get_score_history(
    conn: sqlite3.Connection,
    brand_name: str,
    days: int = 30,
) -> List[Tuple[str, Optional[float], Optional[float]]]:
    """
    Get score history for a brand over time.

    Args:
        conn: Database connection.
        brand_name: The brand to query.
        days: Number of days of history (default 30).

    Returns:
        List of (date, momentum_score, threat_index) tuples, ordered by date ASC.
    """
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = conn.execute(
        """SELECT date, momentum_score, threat_index
           FROM scores
           WHERE brand_name = ? AND date >= ?
           ORDER BY date ASC""",
        (brand_name, cutoff),
    ).fetchall()

    return [(row["date"], row["momentum_score"], row["threat_index"]) for row in rows]


# ─── Narratives ──────────────────────────────────────────────────────────────


def save_narrative(
    conn: sqlite3.Connection,
    date: str,
    narrative_type: str,
    content: str,
    brand_name: Optional[str] = None,
    model_used: Optional[str] = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cost_estimate: float = 0.0,
) -> None:
    """
    Save a narrative to the database. Upsert on (date, narrative_type, brand_name).

    Args:
        conn: Database connection.
        date: ISO date string (YYYY-MM-DD).
        narrative_type: 'brand', 'strategic_summary', or 'action_items'.
        content: The narrative text or JSON string.
        brand_name: Brand name for 'brand' type narratives, None otherwise.
        model_used: Claude model identifier used.
        input_tokens: Number of input tokens used.
        output_tokens: Number of output tokens used.
        cost_estimate: Estimated USD cost of the API call.
    """
    conn.execute(
        """INSERT OR REPLACE INTO narratives
           (date, narrative_type, brand_name, content, model_used,
            input_tokens, output_tokens, cost_estimate)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (date, narrative_type, brand_name, content, model_used,
         input_tokens, output_tokens, cost_estimate),
    )
    conn.commit()


def get_latest_narratives(
    conn: sqlite3.Connection,
    narrative_type: Optional[str] = None,
) -> List[dict]:
    """
    Get the most recent narratives. If narrative_type is None, returns all types.

    Args:
        conn: Database connection.
        narrative_type: Optional filter ('brand', 'strategic_summary', 'action_items').

    Returns:
        List of narrative dicts.
    """
    # Find the latest date
    if narrative_type:
        row = conn.execute(
            "SELECT MAX(date) as d FROM narratives WHERE narrative_type = ?",
            (narrative_type,),
        ).fetchone()
    else:
        row = conn.execute("SELECT MAX(date) as d FROM narratives").fetchone()

    if row is None or row["d"] is None:
        return []
    latest_date = row["d"]

    if narrative_type:
        rows = conn.execute(
            """SELECT date, narrative_type, brand_name, content, model_used,
                      input_tokens, output_tokens, cost_estimate
               FROM narratives
               WHERE date = ? AND narrative_type = ?
               ORDER BY brand_name""",
            (latest_date, narrative_type),
        ).fetchall()
    else:
        rows = conn.execute(
            """SELECT date, narrative_type, brand_name, content, model_used,
                      input_tokens, output_tokens, cost_estimate
               FROM narratives
               WHERE date = ?
               ORDER BY narrative_type, brand_name""",
            (latest_date,),
        ).fetchall()

    return [dict(r) for r in rows]


def get_narrative_history(
    conn: sqlite3.Connection,
    brand_name: Optional[str] = None,
    narrative_type: Optional[str] = None,
    days: int = 30,
) -> List[dict]:
    """
    Get narrative history over time.

    Args:
        conn: Database connection.
        brand_name: Optional brand filter.
        narrative_type: Optional type filter.
        days: Number of days of history (default 30).

    Returns:
        List of narrative dicts ordered by date ascending.
    """
    cutoff = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    conditions = ["date >= ?"]
    params: list = [cutoff]

    if brand_name:
        conditions.append("brand_name = ?")
        params.append(brand_name)
    if narrative_type:
        conditions.append("narrative_type = ?")
        params.append(narrative_type)

    where = " AND ".join(conditions)
    rows = conn.execute(
        f"""SELECT date, narrative_type, brand_name, content, model_used,
                   input_tokens, output_tokens, cost_estimate
            FROM narratives
            WHERE {where}
            ORDER BY date ASC, narrative_type, brand_name""",
        params,
    ).fetchall()

    return [dict(r) for r in rows]
