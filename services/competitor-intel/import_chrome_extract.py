"""
Import Chrome-extracted competitive intelligence data into SQLite.

Accepts JSON files from Claude for Chrome extraction (XHS and/or Douyin),
validates them, merges data for brands that appear on both platforms,
and saves snapshots via storage.py.

Usage:
    # Import from files:
    python -m services.competitor-intel.import_chrome_extract xhs_2026-03-28.json douyin_2026-03-28.json

    # Import from clipboard (macOS):
    pbpaste | python -m services.competitor-intel.import_chrome_extract --stdin --platform xhs

    # Dry run (validate only, don't import):
    python -m services.competitor-intel.import_chrome_extract --dry-run xhs_data.json
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from .chrome_schema import validate_and_normalize
from .storage import (
    DEFAULT_DB_PATH,
    init_db,
    record_scrape_run,
    save_snapshot,
    update_scrape_run,
)


def _read_file(path: str) -> str:
    """Read a JSON file and return its text content."""
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _read_stdin() -> str:
    """Read all of stdin and return it as text."""
    return sys.stdin.read()


def _merge_brand_data(
    xhs_extracts: Dict[str, dict],
    douyin_extracts: Dict[str, dict],
) -> Dict[str, dict]:
    """
    Merge XHS and Douyin extracts into the unified 7-dimension structure
    expected by storage.py's save_snapshot().

    Maps Chrome extract fields to the merged schema:
        Chrome XHS d2_brand_voice     → merged d2_brand_voice_volume.xhs
        Chrome Douyin d2_brand_voice  → merged d2_brand_voice_volume.douyin
        Chrome XHS d1_search_index    → merged d1_brand_search_index (xhs fields)
        Chrome Douyin d1_search_index → merged d1_brand_search_index (douyin fields)
        Chrome XHS d3_content_sample  → merged d3_content_strategy.top_notes
        Chrome XHS d6_consumer_sentiment → merged d6_consumer_mindshare
        Chrome Douyin d4_kol_ecosystem → merged d4_kol_ecosystem
        Chrome Douyin d5_social_commerce → merged d5_social_commerce

    Args:
        xhs_extracts: Dict of brand_name → XHS extract dict.
        douyin_extracts: Dict of brand_name → Douyin extract dict.

    Returns:
        Dict of brand_name → merged 7-dimension dict.
    """
    all_brands = set(xhs_extracts.keys()) | set(douyin_extracts.keys())
    merged = {}

    for brand_name in all_brands:
        xhs = xhs_extracts.get(brand_name, {})
        dy = douyin_extracts.get(brand_name, {})

        # Determine the most recent extract date
        xhs_date = xhs.get("extract_date", "")
        dy_date = dy.get("extract_date", "")
        scrape_date = max(xhs_date, dy_date) or datetime.now().strftime("%Y-%m-%d")

        brand_name_en = xhs.get("brand_name_en") or dy.get("brand_name_en", "")

        # Build merged structure
        brand_merged = {
            "brand_name": brand_name,
            "brand_name_en": brand_name_en,
            "scrape_date": scrape_date,

            # D1: Brand Search Index
            "d1_brand_search_index": {
                "xhs_suggestions": (
                    xhs.get("d1_search_index", {}).get("search_suggestions", [])
                ),
                "xhs_related": (
                    xhs.get("d1_search_index", {}).get("related_searches", [])
                ),
                "douyin_suggestions": (
                    dy.get("d1_search_index", {}).get("search_suggestions", [])
                ),
                "douyin_trending": (
                    dy.get("d1_search_index", {}).get("trending_hashtags", {})
                ),
            },

            # D2: Brand Voice Volume
            "d2_brand_voice_volume": {
                "xhs": {
                    "followers": xhs.get("d2_brand_voice", {}).get("followers", 0),
                    "notes": xhs.get("d2_brand_voice", {}).get("notes", 0),
                    "likes": xhs.get("d2_brand_voice", {}).get("likes", 0),
                    "account_name": xhs.get("d2_brand_voice", {}).get("account_name", ""),
                    "account_id": xhs.get("d2_brand_voice", {}).get("account_id", ""),
                    "verified": xhs.get("d2_brand_voice", {}).get("verified", False),
                },
                "douyin": {
                    "followers": dy.get("d2_brand_voice", {}).get("followers", 0),
                    "videos": dy.get("d2_brand_voice", {}).get("videos", 0),
                    "likes": dy.get("d2_brand_voice", {}).get("likes", 0),
                    "account_name": dy.get("d2_brand_voice", {}).get("account_name", ""),
                    "account_id": dy.get("d2_brand_voice", {}).get("account_id", ""),
                    "verified": dy.get("d2_brand_voice", {}).get("verified", False),
                },
            },

            # D3: Content Strategy
            "d3_content_strategy": {
                "top_notes": xhs.get("d3_content_sample", {}).get("top_notes", []),
                "posting_frequency": 0,
                "avg_engagement": 0,
            },

            # D4: KOL Ecosystem
            "d4_kol_ecosystem": {
                "douyin_creators": (
                    dy.get("d4_kol_ecosystem", {}).get("top_creators", [])
                ),
                "xhs_collab_count": 0,
                "douyin_mentions_count": len(
                    dy.get("d4_kol_ecosystem", {}).get("top_creators", [])
                ),
            },

            # D5: Social Commerce
            "d5_social_commerce": {
                "shop_product_count": (
                    dy.get("d5_social_commerce", {}).get("shop_product_count", 0)
                ),
                "live_status": (
                    dy.get("d5_social_commerce", {}).get("live_status", "unknown")
                ),
                "live_viewers": (
                    dy.get("d5_social_commerce", {}).get("live_viewers", 0)
                ),
                "top_selling_products": (
                    dy.get("d5_social_commerce", {}).get("top_selling_products", [])
                ),
            },

            # D6: Consumer Mindshare
            "d6_consumer_mindshare": {
                "positive_keywords": (
                    xhs.get("d6_consumer_sentiment", {}).get("positive_themes", [])
                ),
                "negative_keywords": (
                    xhs.get("d6_consumer_sentiment", {}).get("negative_themes", [])
                ),
                "ugc_samples": (
                    xhs.get("d6_consumer_sentiment", {}).get("ugc_samples", [])
                ),
            },

            # D7: Channel Authority (not available from Chrome — needs SYCM)
            "d7_channel_authority": {
                "tmall_rank": 0,
                "category_share": "",
            },
        }

        # Compute some derived metrics if we have the data
        top_notes = brand_merged["d3_content_strategy"]["top_notes"]
        if top_notes:
            total_eng = sum(
                (n.get("likes", 0) or 0) + (n.get("comments", 0) or 0)
                for n in top_notes
            )
            brand_merged["d3_content_strategy"]["avg_engagement"] = (
                total_eng // len(top_notes) if top_notes else 0
            )

        merged[brand_name] = brand_merged

    return merged


def import_extracts(
    files: List[str],
    stdin_text: Optional[str] = None,
    stdin_platform: Optional[str] = None,
    db_path: Optional[str] = None,
    dry_run: bool = False,
) -> Tuple[bool, str]:
    """
    Import Chrome-extracted data from files and/or stdin.

    Args:
        files: List of JSON file paths to import.
        stdin_text: Text from stdin (if --stdin was used).
        stdin_platform: Platform for stdin input ('xhs' or 'douyin').
        db_path: Path to SQLite database. None for default.
        dry_run: If True, validate only — don't import.

    Returns:
        Tuple of (success: bool, message: str).
    """
    all_extracts: List[dict] = []
    all_errors: List[str] = []

    # Process files
    for fpath in files:
        if not os.path.exists(fpath):
            all_errors.append(f"File not found: {fpath}")
            continue

        text = _read_file(fpath)
        data, errors = validate_and_normalize(text)
        if errors:
            all_errors.extend(f"[{fpath}] {e}" for e in errors)
        else:
            all_extracts.extend(data)

    # Process stdin
    if stdin_text is not None:
        if stdin_platform and stdin_platform not in ("xhs", "douyin"):
            all_errors.append(f"--platform must be 'xhs' or 'douyin', got '{stdin_platform}'")
        else:
            data, errors = validate_and_normalize(stdin_text)
            if errors:
                all_errors.extend(f"[stdin] {e}" for e in errors)
            else:
                # If platform specified via CLI, override each item's platform
                if stdin_platform:
                    for item in data:
                        if not item.get("platform"):
                            item["platform"] = stdin_platform
                all_extracts.extend(data)

    # Bail on validation errors
    if all_errors:
        error_msg = "Validation failed — no data imported:\n" + "\n".join(
            f"  - {e}" for e in all_errors
        )
        return False, error_msg

    if not all_extracts:
        return False, "No data to import (no files provided or all empty)."

    # Separate by platform
    xhs_extracts: Dict[str, dict] = {}
    douyin_extracts: Dict[str, dict] = {}

    for item in all_extracts:
        brand_name = item["brand_name"]
        platform = item["platform"]
        if platform == "xhs":
            xhs_extracts[brand_name] = item
        elif platform == "douyin":
            douyin_extracts[brand_name] = item

    # Merge
    merged = _merge_brand_data(xhs_extracts, douyin_extracts)

    # Summary stats
    xhs_count = len(xhs_extracts)
    douyin_count = len(douyin_extracts)
    both_count = len(set(xhs_extracts.keys()) & set(douyin_extracts.keys()))
    total_brands = len(merged)

    if dry_run:
        summary = (
            f"Dry run — validation passed.\n"
            f"Would import {total_brands} brands "
            f"({xhs_count} XHS + {douyin_count} Douyin). "
            f"{both_count} brands have data from both platforms."
        )
        return True, summary

    # Import into database
    db_path = db_path or DEFAULT_DB_PATH
    conn = init_db(db_path)

    run_id = record_scrape_run(
        conn,
        status="running",
        brands_attempted=total_brands,
    )

    succeeded = 0
    errors: List[str] = []

    for brand_name, brand_data in merged.items():
        try:
            save_snapshot(conn, run_id, brand_name, brand_data)
            succeeded += 1
        except Exception as e:
            errors.append(f"Brand '{brand_name}': {e}")

    # Update run status
    update_scrape_run(
        conn,
        run_id,
        status="completed" if not errors else "partial",
        brands_succeeded=succeeded,
        error_log="\n".join(errors) if errors else None,
    )

    conn.close()

    summary = (
        f"Imported {succeeded}/{total_brands} brands "
        f"({xhs_count} XHS + {douyin_count} Douyin). "
        f"{both_count} brands have data from both platforms."
    )
    if errors:
        summary += "\nErrors:\n" + "\n".join(f"  - {e}" for e in errors)

    return succeeded > 0, summary


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Import Chrome-extracted competitor data into SQLite"
    )
    parser.add_argument(
        "files",
        nargs="*",
        help="JSON files to import (xhs and/or douyin extracts)",
    )
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="Read JSON from stdin (e.g., pbpaste | python ... --stdin)",
    )
    parser.add_argument(
        "--platform",
        type=str,
        default=None,
        choices=["xhs", "douyin"],
        help="Platform for stdin input (required with --stdin if not in JSON)",
    )
    parser.add_argument(
        "--db-path",
        type=str,
        default=None,
        help="Path to SQLite database (default: auto)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Validate only — don't import into database",
    )
    args = parser.parse_args()

    if not args.files and not args.stdin:
        parser.error("Provide JSON files or use --stdin")

    stdin_text = None
    if args.stdin:
        stdin_text = _read_stdin()
        if not stdin_text.strip():
            print("Error: stdin is empty")
            sys.exit(1)

    success, message = import_extracts(
        files=args.files or [],
        stdin_text=stdin_text,
        stdin_platform=args.platform,
        db_path=args.db_path,
        dry_run=args.dry_run,
    )

    print(message)
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
