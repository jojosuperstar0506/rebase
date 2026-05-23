"""W1 of the scraping migration: Apify parity probe.

Calls zhorex/rednote-xiaohongshu-scraper TWICE for one brand (search for posts,
then profile for follower count) and diffs the combined output against the
fields scrape_runner.py:_save_result() needs to populate scraped_brand_profiles.

This is the spike, not production code. See docs/SCRAPING-PLAN-2026-05-22.md
§4 W1 and GitHub issue #62 for context.

Why two calls: pipelines read both engagement_metrics.total_notes (needs
profile mode's `notesCount`) AND raw_dimensions.d3.top_notes[] (needs search
mode's posts list). One call alone covers <50% of what scoring needs.

Usage:
    pip install -r services/competitor_intel/requirements.txt
    APIFY_API_TOKEN=apify_api_xxx \\
        python -m services.competitor_intel.scrapers.apify_probe --brand Songmont

    # If profile mode requires cookies (it usually does), provide one:
    APIFY_API_TOKEN=apify_api_xxx \\
    XHS_SESSION_COOKIE='web_session=...' \\
        python -m services.competitor_intel.scrapers.apify_probe --brand Songmont

Outputs (next to this file):
    apify_probe_search.json    — raw output from search mode
    apify_probe_profile.json   — raw output from profile mode
    parity_report.md           — W2 go/no-go decision document
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

ACTOR_ID = "zhorex/rednote-xiaohongshu-scraper"
OUTPUT_DIR = Path(__file__).parent


# What scrape_runner.py:_save_result() actually needs to populate
# scraped_brand_profiles. Source of truth: scrape_runner.py:73-138.
#
# Each entry: (semantic_name, where_it_goes_in_DB, severity)
# severity: "critical" = pipeline reads this directly; "high" = pipeline can
# degrade gracefully; "nice" = bonus context.
REQUIRED_FIELDS = [
    # ── Top-level brand stats (profile mode) ──
    ("follower_count",          "scraped_brand_profiles.follower_count",                    "critical"),
    ("total_notes_count",       "scraped_brand_profiles.engagement_metrics.total_notes",    "critical"),
    ("total_likes_count",       "scraped_brand_profiles.engagement_metrics.total_likes",    "critical"),
    ("is_verified",             "scraped_brand_profiles.raw_dimensions.d2 (account scoring)", "high"),
    ("brand_user_id",           "scraped_brand_profiles.raw_dimensions.d2",                 "high"),
    ("brand_nickname",          "scraped_brand_profiles.raw_dimensions.d2",                 "nice"),

    # ── Posts list (search / user_posts mode) ──
    ("posts_list",              "raw_dimensions.d3.top_notes[]",                            "critical"),
    ("post.title",              "d3.top_notes[].title",                                     "critical"),
    ("post.content",            "d3.top_notes[].body_text",                                 "critical"),
    ("post.likes",              "d3.top_notes[].likes",                                     "critical"),
    ("post.comments",           "d3.top_notes[].comments_count",                            "critical"),
    ("post.shares",             "d3.top_notes[].shares",                                    "high"),
    ("post.hashtags",           "d3.top_notes[].hashtags",                                  "critical"),
    ("post.images",             "d3.top_notes[].image_count (derived: len(images))",        "high"),
    ("post.note_id",            "d3.top_notes[].note_id",                                   "critical"),
    ("post.author_nickname",    "d4.note_authors[].name",                                   "high"),
    ("post.author_user_id",     "d4.note_authors[]",                                        "nice"),
    ("post.published_at",       "d3.top_notes[] (used for content recency)",                "nice"),
    ("post.type",               "d3.top_notes[].type (text/video discrimination)",          "high"),
]


# Map semantic names to candidate keys in Apify output.
# Updated from zhorex's documented schema (fetched 2026-05-22).
# Profile-mode fields and post-mode fields are merged in the search space.
APIFY_KEY_CANDIDATES: Dict[str, set] = {
    # Profile mode
    "follower_count":      {"followers"},
    "total_notes_count":   {"notesCount"},
    "total_likes_count":   {"totalLikes"},
    "is_verified":         {"isVerified"},
    "brand_user_id":       {"userId", "redId"},
    "brand_nickname":      {"nickname"},

    # Search / user_posts mode (top-level container in each item)
    "posts_list":          set(),  # detected by presence of post-mode keys in any item

    # Per-post fields
    "post.title":          {"title"},
    "post.content":        {"content"},
    "post.likes":          {"likes"},
    "post.comments":       {"comments"},
    "post.shares":         {"shares"},
    "post.hashtags":       {"hashtag", "hashtags", "tags"},
    "post.images":         {"images"},
    "post.note_id":        {"postId"},
    "post.author_nickname": {"authorName"},  # plus author.nickname (nested)
    "post.author_user_id": set(),             # nested: author.userId
    "post.published_at":   {"publishedAt"},
    "post.type":           {"type"},
}


def call_apify_actor(actor_input: Dict[str, Any], token: str, label: str) -> List[Dict[str, Any]]:
    """Single Apify actor run, returns dataset items."""
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
    safe_input = {k: v for k, v in actor_input.items() if k != "cookieString"}
    print(f"[probe:{label}] Input: {json.dumps(safe_input, ensure_ascii=False)}", file=sys.stderr)
    if actor_input.get("cookieString"):
        print(f"[probe:{label}] cookieString length: {len(actor_input['cookieString'])} chars", file=sys.stderr)

    run = client.actor(ACTOR_ID).call(run_input=actor_input)
    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    print(f"[probe:{label}] Got {len(items)} items", file=sys.stderr)
    return items


def search_mode(brand: str, token: str, cookie: Optional[str], max_results: int = 30) -> List[Dict]:
    """Search posts for a brand keyword. Cookie-optional."""
    inp = {
        "mode": "search",
        "searchQuery": brand,
        "maxResults": max_results,
    }
    if cookie:
        inp["cookieString"] = cookie
    return call_apify_actor(inp, token, "search")


def profile_mode(user_url: str, token: str, cookie: Optional[str]) -> List[Dict]:
    """Profile mode for follower count / notesCount / totalLikes. Cookie usually required."""
    inp = {
        "mode": "profile",
        "userUrl": user_url,
    }
    if cookie:
        inp["cookieString"] = cookie
    return call_apify_actor(inp, token, "profile")


def _all_keys(obj: Any, prefix: str = "") -> set:
    """Recursive walk: yields every JSON key as dotted path (author.nickname etc.)."""
    keys: set = set()
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}.{k}" if prefix else k
            keys.add(path)
            keys.add(k)  # also add unqualified
            keys |= _all_keys(v, path)
    elif isinstance(obj, list) and obj:
        # Walk the first item to discover per-item shape; full keyset would
        # be huge for long arrays.
        for item in obj[:3]:
            keys |= _all_keys(item, prefix)
    return keys


def _guess_brand_user_url(search_items: List[Dict], brand: str) -> Optional[str]:
    """Best-effort: find a profileUrl or author.userId in the search results
    that looks like the brand's official account. Uses nickname/title match.
    """
    brand_lower = brand.lower()
    candidates = []
    for item in search_items:
        if not isinstance(item, dict):
            continue
        # Direct profile field
        if "profileUrl" in item:
            candidates.append(item["profileUrl"])
        # Nested author block
        author = item.get("author") or {}
        if isinstance(author, dict):
            nick = (author.get("nickname") or "").lower()
            uid = author.get("userId")
            if uid and brand_lower in nick:
                candidates.append(f"https://www.xiaohongshu.com/user/profile/{uid}")
        # Top-level authorName + try to match
        if (item.get("authorName") or "").lower() == brand_lower and item.get("authorUserId"):
            candidates.append(f"https://www.xiaohongshu.com/user/profile/{item['authorUserId']}")
    return candidates[0] if candidates else None


def analyze_parity(search_items: List[Dict], profile_items: List[Dict]) -> Dict[str, Any]:
    """Diff combined Apify output against REQUIRED_FIELDS."""
    search_keys = _all_keys(search_items)
    profile_keys = _all_keys(profile_items)
    combined_keys = search_keys | profile_keys

    matched = []
    missing = []

    for semantic_name, db_target, severity in REQUIRED_FIELDS:
        if semantic_name == "posts_list":
            # Special case: presence of any post-mode field
            post_mode_signals = {"postId", "likes", "title", "comments"}
            if post_mode_signals & search_keys:
                matched.append({
                    "field": semantic_name,
                    "severity": severity,
                    "db_target": db_target,
                    "matched_via": sorted(post_mode_signals & search_keys),
                    "source": "search",
                })
            else:
                missing.append({"field": semantic_name, "severity": severity, "db_target": db_target})
            continue

        if semantic_name == "post.author_user_id":
            # Nested check
            if "author.userId" in combined_keys:
                matched.append({"field": semantic_name, "severity": severity, "db_target": db_target,
                               "matched_via": ["author.userId"], "source": "search"})
            else:
                missing.append({"field": semantic_name, "severity": severity, "db_target": db_target})
            continue

        candidates = APIFY_KEY_CANDIDATES.get(semantic_name, set())
        if not candidates:
            missing.append({"field": semantic_name, "severity": severity, "db_target": db_target,
                           "note": "no alias defined; check raw output"})
            continue

        # Where it could appear
        search_hit = candidates & search_keys
        profile_hit = candidates & profile_keys
        if search_hit or profile_hit:
            source = "profile" if profile_hit else "search"
            matched.append({
                "field": semantic_name,
                "severity": severity,
                "db_target": db_target,
                "matched_via": sorted(search_hit | profile_hit),
                "source": source,
            })
        else:
            missing.append({"field": semantic_name, "severity": severity, "db_target": db_target})

    # Extras: keys in Apify output that don't map to any REQUIRED_FIELDS candidate
    all_candidates: set = set()
    for s in APIFY_KEY_CANDIDATES.values():
        all_candidates |= s
    extra = sorted(k for k in combined_keys if k not in all_candidates and "." not in k)

    critical_missing = [m["field"] for m in missing if m["severity"] == "critical"]
    high_missing = [m["field"] for m in missing if m["severity"] == "high"]
    crit_total = sum(1 for _, _, sev in REQUIRED_FIELDS if sev == "critical")
    crit_matched = sum(1 for m in matched if m["severity"] == "critical")
    crit_pct = round(crit_matched / crit_total, 3) if crit_total else 0

    gate_passed = not critical_missing and crit_pct >= 0.8

    return {
        "search_items": len(search_items),
        "profile_items": len(profile_items),
        "matched": matched,
        "missing": missing,
        "extra": extra[:50],
        "critical_missing": critical_missing,
        "high_missing": high_missing,
        "critical_match_pct": crit_pct,
        "gate_passed": gate_passed,
        "search_keys_observed": sorted(search_keys),
        "profile_keys_observed": sorted(profile_keys),
    }


def write_report(analysis: Dict[str, Any], brand: str, out_path: Path) -> None:
    matched = analysis["matched"]
    missing = analysis["missing"]
    extra = analysis["extra"]
    crit_missing = analysis["critical_missing"]
    high_missing = analysis["high_missing"]
    crit_pct = analysis["critical_match_pct"]
    gate = "PASS" if analysis["gate_passed"] else "FAIL"

    out = []
    out.append(f"# Apify XHS Parity Report — {brand}")
    out.append("")
    out.append(f"- **Actor:** `{ACTOR_ID}`")
    out.append(f"- **Date:** {date.today().isoformat()}")
    out.append(f"- **Search items returned:** {analysis['search_items']}")
    out.append(f"- **Profile items returned:** {analysis['profile_items']}")
    out.append(f"- **Critical-field match:** {crit_pct} ({sum(1 for m in matched if m['severity'] == 'critical')}/{sum(1 for f in REQUIRED_FIELDS if f[2] == 'critical')})")
    out.append(f"- **Decision gate:** {'✅ PASS' if analysis['gate_passed'] else '❌ FAIL'} (need ≥80% critical AND zero critical missing)")
    out.append("")

    out.append("## What we're checking against")
    out.append("")
    out.append("Source of truth: `scrape_runner.py:_save_result()` (lines 73-138) shows exactly what dict shape goes into `save_brand_profile()`. The Apify wrapper (W2) must produce the same shape.")
    out.append("")

    out.append("## Critical fields — blocking if missing")
    out.append("")
    if crit_missing:
        for f in crit_missing:
            target = next(m["db_target"] for _, target in [(f, "")] for sname, m_target, _ in REQUIRED_FIELDS if sname == f)
            out.append(f"- 🔴 `{f}` — needed for `{target}`")
    else:
        out.append("All critical fields present. ✓")
    out.append("")

    out.append("## High-severity missing (pipeline degrades)")
    out.append("")
    if high_missing:
        for f in high_missing:
            out.append(f"- ⚠️ `{f}`")
    else:
        out.append("None.")
    out.append("")

    out.append("## Matched fields")
    out.append("")
    for m in matched:
        sev_icon = {"critical": "🟢", "high": "🟡", "nice": "🔵"}[m["severity"]]
        out.append(f"- {sev_icon} `{m['field']}` ← `{', '.join(m['matched_via'])}` (source: {m['source']}) → `{m['db_target']}`")
    out.append("")

    out.append("## Missing fields (all)")
    out.append("")
    if missing:
        for m in missing:
            sev_icon = {"critical": "🔴", "high": "⚠️", "nice": "🔵"}[m["severity"]]
            note = f" — {m['note']}" if "note" in m else ""
            out.append(f"- {sev_icon} `{m['field']}` ({m['severity']}) → `{m['db_target']}`{note}")
    else:
        out.append("None.")
    out.append("")

    out.append("## Extra keys Apify returned (potential enrichment)")
    out.append("")
    if extra:
        for e in extra[:30]:
            out.append(f"- `{e}`")
        if len(extra) > 30:
            out.append(f"- _…and {len(extra) - 30} more (see apify_probe_search.json / apify_probe_profile.json)_")
    else:
        out.append("None.")
    out.append("")

    out.append("## All keys observed in search mode")
    out.append("")
    out.append("```")
    for k in analysis["search_keys_observed"]:
        out.append(k)
    out.append("```")
    out.append("")

    out.append("## All keys observed in profile mode")
    out.append("")
    out.append("```")
    for k in analysis["profile_keys_observed"]:
        out.append(k)
    out.append("```")

    out_path.write_text("\n".join(out), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="W1 Apify XHS parity probe (search + profile)")
    parser.add_argument("--brand", default="Songmont", help="Brand keyword to search (default: Songmont)")
    parser.add_argument("--max-results", type=int, default=30, help="Search posts cap (default: 30)")
    parser.add_argument("--skip-profile", action="store_true",
                        help="Skip profile-mode call (useful if you have no XHS cookie yet)")
    parser.add_argument("--profile-url", default=None,
                        help="Override the auto-detected brand profile URL")
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

    cookie = os.environ.get("XHS_SESSION_COOKIE")
    if cookie:
        print(f"[probe] Using XHS_SESSION_COOKIE ({len(cookie)} chars)", file=sys.stderr)
    else:
        print("[probe] No XHS_SESSION_COOKIE — search mode will run cookie-free; profile mode may fail", file=sys.stderr)

    # ── Call 1: search mode ──
    search_items = search_mode(args.brand, token, cookie, args.max_results)
    (OUTPUT_DIR / "apify_probe_search.json").write_text(
        json.dumps(search_items, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # ── Call 2: profile mode ──
    profile_items: List[Dict] = []
    if not args.skip_profile:
        profile_url = args.profile_url or _guess_brand_user_url(search_items, args.brand)
        if not profile_url:
            print(f"[probe] Could not auto-detect a profile URL for '{args.brand}'.", file=sys.stderr)
            print("        Pass --profile-url 'https://www.xiaohongshu.com/user/profile/<id>' to test profile mode.", file=sys.stderr)
            print("        Or rerun with --skip-profile to validate search-mode only.", file=sys.stderr)
        else:
            print(f"[probe] Using profile URL: {profile_url}", file=sys.stderr)
            try:
                profile_items = profile_mode(profile_url, token, cookie)
            except Exception as exc:
                print(f"[probe] Profile mode failed: {exc}", file=sys.stderr)
                print("        Profile mode usually requires XHS_SESSION_COOKIE — provide one and rerun.", file=sys.stderr)

        (OUTPUT_DIR / "apify_probe_profile.json").write_text(
            json.dumps(profile_items, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # ── Parity analysis ──
    analysis = analyze_parity(search_items, profile_items)
    report_path = OUTPUT_DIR / "parity_report.md"
    write_report(analysis, args.brand, report_path)

    print(f"\n[probe] Raw search output  → {OUTPUT_DIR / 'apify_probe_search.json'}")
    print(f"[probe] Raw profile output → {OUTPUT_DIR / 'apify_probe_profile.json'}")
    print(f"[probe] Parity report       → {report_path}")
    print(f"\nGATE: {'PASS ✅' if analysis['gate_passed'] else 'FAIL ❌'}")
    print(f"Critical-field match: {analysis['critical_match_pct']}")
    if analysis["critical_missing"]:
        print(f"Critical missing: {analysis['critical_missing']}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
