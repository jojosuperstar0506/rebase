"""W1 of the scraping migration: one-off Apify parity probe.

Calls zhorex/rednote-xiaohongshu-scraper for ONE brand and diffs the output
against XhsBrandData (services/competitor_intel/scrapers/xhs_scraper.py:67)
to validate field-level parity before we commit to writing apify_client.py.

See docs/SCRAPING-PLAN-2026-05-22.md §4 W1 and GitHub issue #62 for context.

Usage:
    APIFY_API_TOKEN=apify_api_xxx \\
        python -m services.competitor_intel.scrapers.apify_probe --brand Songmont

    # Optionally include a logged-in XHS session cookie (needed for comments
    # and full profile data; not needed for search/user_posts modes):
    APIFY_API_TOKEN=apify_api_xxx \\
    XHS_SESSION_COOKIE='a1=...; web_session=...' \\
        python -m services.competitor_intel.scrapers.apify_probe --brand Songmont \\
        --include-cookies

Outputs (next to this file):
    apify_probe_output.json  — raw actor output
    parity_report.md         — the decision-gate document for W2
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List

ACTOR_ID = "zhorex/rednote-xiaohongshu-scraper"
OUTPUT_DIR = Path(__file__).parent

# Hardcoded to avoid importing xhs_scraper (which pulls scraping_config and
# YAML deps). Must mirror XhsBrandData in xhs_scraper.py:67 — update both
# together if either changes.
XHS_BRAND_DATA_FIELDS = [
    ("brand_name", "str"),
    ("scrape_date", "str"),
    ("scrape_status", "str"),
    ("d1_search_suggestions", "List[str]"),
    ("d1_search_volume_rank", "str"),
    ("d1_related_searches", "List[str]"),
    ("d2_official_followers", "int"),
    ("d2_total_notes", "int"),
    ("d2_total_likes", "int"),
    ("d2_official_account_id", "str"),
    ("d2_official_account_name", "str"),
    ("d2_is_verified", "bool"),
    ("d3_content_types", "Dict[str, int]"),
    ("d3_top_notes", "List[Dict]"),
    ("d3_posting_frequency", "str"),
    ("d3_avg_engagement", "str"),
    ("d4_top_kols", "List[Dict[str, str]]"),
    ("d4_collab_count", "int"),
    ("d4_celebrity_mentions", "List[str]"),
    ("d6_sentiment_keywords", "List[str]"),
    ("d6_positive_keywords", "List[str]"),
    ("d6_negative_keywords", "List[str]"),
    ("d6_ugc_sample_notes", "List[Dict[str, str]]"),
    ("full_note_catalog", "List[Dict]"),
]

# Subset of XhsBrandData fields the 16 scoring pipelines actually read.
# If any of these are missing from Apify output, the parity gate fails.
# Inferred from grep over services/competitor_intel/pipelines/*.py — keep
# this conservative; better to over-include than under-include for the gate.
PIPELINE_CRITICAL = {
    "d2_official_followers",     # voice_volume, momentum
    "d2_total_notes",            # content_strategy, voice_volume
    "d2_total_likes",            # content_strategy, mindshare
    "d2_is_verified",            # account_scoring
    "d3_content_types",          # content_strategy
    "d3_top_notes",              # content_strategy, design_vision, kol_tracker
    "d6_sentiment_keywords",     # mindshare
    "full_note_catalog",         # launch_tracker, product_ranking
}

# Aliases we'll try when matching an XhsBrandData field to keys in Apify output.
# zhorex's actor output keys are not perfectly documented, so we cast a wide
# net per field. The parity report logs which alias actually matched.
FIELD_ALIASES: Dict[str, set] = {
    "d2_official_followers": {"followers", "follower_count", "followerCount", "fans"},
    "d2_total_notes": {"notes", "note_count", "noteCount", "totalNotes", "notesCount"},
    "d2_total_likes": {"likes", "like_count", "likeCount", "totalLikes", "liked_count"},
    "d2_official_account_id": {"user_id", "userId", "id", "userId"},
    "d2_official_account_name": {"nickname", "name", "user_name", "userName"},
    "d2_is_verified": {"verified", "is_verified", "isVerified", "blueV"},
    "d3_top_notes": {"notes", "posts", "items", "items"},
    "d3_content_types": {"contentTypes", "content_types"},
    "d6_sentiment_keywords": {"sentimentKeywords", "tags", "keywords"},
    "d6_positive_keywords": {"positiveKeywords", "positive_keywords"},
    "d6_negative_keywords": {"negativeKeywords", "negative_keywords"},
    "d6_ugc_sample_notes": {"ugcNotes", "ugc_notes", "userNotes"},
    "full_note_catalog": {"notes", "posts", "items", "noteList"},
    "d1_search_suggestions": {"suggestions", "searchSuggestions"},
    "d1_related_searches": {"relatedSearches", "related"},
    "d4_top_kols": {"kols", "topKols", "influencers"},
    "d4_celebrity_mentions": {"mentions", "celebrities"},
}


def call_apify_actor(brand: str, token: str, cookie: str | None) -> List[Dict[str, Any]]:
    try:
        from apify_client import ApifyClient
    except ImportError:
        print(
            "ERROR: apify-client not installed.\n"
            "Run: pip install -r services/competitor_intel/requirements.txt",
            file=sys.stderr,
        )
        sys.exit(2)

    client = ApifyClient(token)
    run_input: Dict[str, Any] = {
        "mode": "search",
        "keyword": brand,
        "maxItems": 30,
    }
    if cookie:
        run_input["cookies"] = cookie

    print(f"[probe] Running actor {ACTOR_ID} for brand={brand!r}", file=sys.stderr)
    print(f"[probe] Input: {json.dumps({k: v for k, v in run_input.items() if k != 'cookies'})}", file=sys.stderr)
    if cookie:
        print(f"[probe] Cookie length: {len(cookie)} chars", file=sys.stderr)

    run = client.actor(ACTOR_ID).call(run_input=run_input)
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"[probe] Got {len(items)} items from actor", file=sys.stderr)
    return items


def _all_keys_in(items: List[Any]) -> set:
    """Collect every JSON key that appears anywhere in the actor output."""
    keys: set = set()

    def walk(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                keys.add(k)
                walk(v)
        elif isinstance(obj, list):
            for x in obj:
                walk(x)

    walk(items)
    return keys


def analyze_parity(apify_items: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not apify_items:
        return {
            "status": "no_data",
            "item_count": 0,
            "matched": [],
            "missing": [{"field": n, "type": t} for n, t in XHS_BRAND_DATA_FIELDS],
            "extra": [],
            "critical_missing": sorted(PIPELINE_CRITICAL),
            "score": 0.0,
            "gate_passed": False,
        }

    apify_keys = _all_keys_in(apify_items)
    matched, missing = [], []

    for name, typ in XHS_BRAND_DATA_FIELDS:
        # Try: exact name, stripped d#_ prefix, declared aliases
        candidates = {name}
        if "_" in name:
            candidates.add(name.split("_", 1)[1])
        candidates |= FIELD_ALIASES.get(name, set())

        hit = apify_keys & candidates
        if hit:
            matched.append({"field": name, "matched_via": sorted(hit)})
        else:
            missing.append({"field": name, "type": typ})

    # Extras are Apify keys we don't map to any XhsBrandData field
    used_candidates: set = set()
    for name, _ in XHS_BRAND_DATA_FIELDS:
        used_candidates.add(name)
        if "_" in name:
            used_candidates.add(name.split("_", 1)[1])
        used_candidates |= FIELD_ALIASES.get(name, set())
    extra = sorted(apify_keys - used_candidates)

    critical_missing = [m["field"] for m in missing if m["field"] in PIPELINE_CRITICAL]
    score = round(len(matched) / len(XHS_BRAND_DATA_FIELDS), 3)
    gate_passed = (not critical_missing) and score >= 0.6

    return {
        "status": "ok",
        "item_count": len(apify_items),
        "apify_keys_observed": sorted(apify_keys),
        "matched": matched,
        "missing": missing,
        "extra": extra,
        "critical_missing": critical_missing,
        "score": score,
        "gate_passed": gate_passed,
    }


def write_report(analysis: Dict[str, Any], brand: str, out_path: Path) -> None:
    score = analysis.get("score", 0)
    gate = "✅ PASS" if analysis.get("gate_passed") else "❌ FAIL"
    matched = analysis.get("matched", [])
    missing = analysis.get("missing", [])
    extra = analysis.get("extra", [])
    critical_missing = analysis.get("critical_missing", [])

    out = []
    out.append(f"# Apify XHS Parity Report — {brand}")
    out.append("")
    out.append(f"- **Actor:** `{ACTOR_ID}`")
    out.append(f"- **Date:** {date.today().isoformat()}")
    out.append(f"- **Items returned:** {analysis.get('item_count', 0)}")
    out.append(f"- **Schema parity score:** {score} ({len(matched)}/{len(XHS_BRAND_DATA_FIELDS)} fields matched)")
    out.append(f"- **Decision gate (≥60% schema AND no critical missing):** {gate}")
    out.append("")

    out.append("## Critical fields (block W2 if any missing)")
    out.append("")
    if critical_missing:
        for f in critical_missing:
            out.append(f"- 🔴 `{f}` — required by scoring pipelines, NOT in Apify output")
    else:
        out.append("All critical fields present. ✓")
    out.append("")

    out.append("## Matched fields")
    out.append("")
    if matched:
        for m in matched:
            out.append(f"- `{m['field']}` ← `{', '.join(m['matched_via'])}`")
    else:
        out.append("_None_")
    out.append("")

    out.append("## Missing fields (non-critical)")
    out.append("")
    nc_missing = [m for m in missing if m["field"] not in PIPELINE_CRITICAL]
    if nc_missing:
        for m in nc_missing:
            out.append(f"- `{m['field']}` (`{m['type']}`)")
    else:
        out.append("_None_")
    out.append("")

    out.append("## Extra fields (Apify-only — may enrich what we collect)")
    out.append("")
    if extra:
        for e in extra[:30]:
            out.append(f"- `{e}`")
        if len(extra) > 30:
            out.append(f"- _…and {len(extra) - 30} more (see apify_probe_output.json)_")
    else:
        out.append("_None_")
    out.append("")

    out.append("## All keys observed in actor output")
    out.append("")
    out.append("```")
    for k in analysis.get("apify_keys_observed", []):
        out.append(k)
    out.append("```")

    out_path.write_text("\n".join(out), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="W1 Apify XHS parity probe")
    parser.add_argument("--brand", default="Songmont",
                        help="Brand keyword to search (default: Songmont)")
    parser.add_argument("--include-cookies", action="store_true",
                        help="Pass XHS_SESSION_COOKIE env var to the actor")
    args = parser.parse_args()

    token = os.environ.get("APIFY_API_TOKEN")
    if not token:
        print(
            "ERROR: APIFY_API_TOKEN env var not set.\n"
            "1. Sign up at https://apify.com (free trial — no credit card)\n"
            "2. Copy token from Settings > Integrations\n"
            "3. export APIFY_API_TOKEN=apify_api_xxx",
            file=sys.stderr,
        )
        return 1

    cookie = os.environ.get("XHS_SESSION_COOKIE") if args.include_cookies else None
    if args.include_cookies and not cookie:
        print("WARN: --include-cookies set but XHS_SESSION_COOKIE is empty", file=sys.stderr)

    items = call_apify_actor(args.brand, token, cookie)

    raw_path = OUTPUT_DIR / "apify_probe_output.json"
    raw_path.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[probe] Raw output → {raw_path}", file=sys.stderr)

    analysis = analyze_parity(items)
    report_path = OUTPUT_DIR / "parity_report.md"
    write_report(analysis, args.brand, report_path)
    print(f"[probe] Parity report → {report_path}", file=sys.stderr)

    print(f"\nGATE: {'PASS' if analysis.get('gate_passed') else 'FAIL'}")
    print(f"Schema parity score: {analysis.get('score', 0)}")
    if analysis.get("critical_missing"):
        print(f"Critical missing: {analysis['critical_missing']}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
