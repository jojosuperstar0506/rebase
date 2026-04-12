"""
One-time migration script: imports existing competitors_*.json files into SQLite.

Reads any JSON files matching the competitors_*.json pattern from the data directory,
creates a scrape_run for each, and imports brand data as snapshots + metrics.

Usage:
    python -m services.competitor-intel.migrate_json
    python -m services.competitor-intel.migrate_json --data-dir path/to/json/files
    python -m services.competitor-intel.migrate_json --db-path path/to/db
"""

import argparse
import glob
import json
import logging
import os
import re
from typing import List

from .config import DATA_DIR
from .storage import DEFAULT_DB_PATH, init_db, record_scrape_run, save_snapshot

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


def find_json_files(data_dir: str) -> List[str]:
    """
    Find all competitors_*.json files in the data directory,
    sorted by filename (which sorts by date for dated files).

    Args:
        data_dir: Directory to search for JSON files.

    Returns:
        List of file paths, sorted alphabetically.
    """
    pattern = os.path.join(data_dir, "competitors_*.json")
    files = sorted(glob.glob(pattern))
    # Exclude competitors_latest.json — it's a duplicate of the most recent dated file
    files = [f for f in files if not f.endswith("competitors_latest.json")]
    return files


def extract_date_from_filename(filepath: str) -> str:
    """
    Extract a date string from a filename like competitors_2026-03-28.json.

    Args:
        filepath: Path to the JSON file.

    Returns:
        Date string (YYYY-MM-DD) if found, otherwise 'unknown'.
    """
    basename = os.path.basename(filepath)
    match = re.search(r"competitors_(\d{4}-\d{2}-\d{2})\.json", basename)
    if match:
        return match.group(1)
    return "unknown"


def migrate_file(db_path: str, filepath: str) -> int:
    """
    Import a single competitors JSON file into SQLite.

    Args:
        db_path: Path to the SQLite database.
        filepath: Path to the JSON file to import.

    Returns:
        Number of brand snapshots imported.
    """
    conn = init_db(db_path)

    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    scrape_date = data.get("scrape_date", extract_date_from_filename(filepath))
    brands = data.get("brands", {})

    if not brands:
        logger.warning(f"No brands data in {filepath}, skipping.")
        conn.close()
        return 0

    # Create a scrape run for this import
    run_id = record_scrape_run(
        conn,
        status="imported",
        brands_attempted=len(brands),
        brands_succeeded=len(brands),
        error_log=f"Migrated from {os.path.basename(filepath)}",
    )

    imported = 0
    for brand_name, brand_data in brands.items():
        # Ensure scrape_date is set in the brand data
        if "scrape_date" not in brand_data:
            brand_data["scrape_date"] = scrape_date

        # Check if this brand exists in the brands table
        row = conn.execute(
            "SELECT name FROM brands WHERE name = ?", (brand_name,)
        ).fetchone()
        if row is None:
            logger.warning(
                f"Brand '{brand_name}' not in registry, skipping snapshot."
            )
            continue

        save_snapshot(conn, run_id, brand_name, brand_data)
        imported += 1

    conn.close()
    return imported


def migrate_all(data_dir: str, db_path: str) -> None:
    """
    Import all competitors_*.json files from data_dir into SQLite.

    Args:
        data_dir: Directory containing JSON files.
        db_path: Path to the SQLite database.
    """
    # Ensure DB is initialized (creates tables + populates brands)
    conn = init_db(db_path)
    conn.close()

    files = find_json_files(data_dir)
    if not files:
        logger.info(f"No competitors_*.json files found in {data_dir}")

        # Also try importing competitors_latest.json if it has brand data
        latest = os.path.join(data_dir, "competitors_latest.json")
        if os.path.exists(latest):
            logger.info(f"Found {latest}, checking for brand data...")
            with open(latest, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("brands"):
                files = [latest]
            else:
                logger.info("competitors_latest.json has no brand data.")
                return
        else:
            return

    logger.info(f"Found {len(files)} JSON file(s) to import.")

    total_imported = 0
    for filepath in files:
        logger.info(f"Importing {os.path.basename(filepath)}...")
        count = migrate_file(db_path, filepath)
        logger.info(f"  Imported {count} brand snapshot(s).")
        total_imported += count

    logger.info(f"Migration complete. Total snapshots imported: {total_imported}")


def main():
    parser = argparse.ArgumentParser(
        description="Migrate competitors JSON files to SQLite"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=DATA_DIR,
        help=f"Directory containing competitors_*.json files (default: {DATA_DIR})",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=DEFAULT_DB_PATH,
        help=f"Path to SQLite database (default: {DEFAULT_DB_PATH})",
    )
    args = parser.parse_args()

    migrate_all(args.data_dir, args.db_path)


if __name__ == "__main__":
    main()
