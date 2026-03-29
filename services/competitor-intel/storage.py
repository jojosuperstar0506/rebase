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
