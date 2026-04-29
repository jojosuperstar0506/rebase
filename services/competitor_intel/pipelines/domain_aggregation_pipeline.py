"""
Domain aggregation pipeline (metric_types: "consumer_domain",
"product_domain", "marketing_domain").

Rolls up the 9 existing individual metric scores into 3 domain-level
scores per brand. Writes the rollups back into `analysis_results` using
the same schema as every other pipeline — so the API at /api/ci/intelligence
can read them with no schema change.

Why this exists:
    The 12 individual metric cards on Analytics give analysts the full
    picture. But the Brief + Dashboard need a single "where you stand
    in Consumer / Product / Marketing" number. That's what this pipeline
    produces. No DeepSeek, no new schema — just SQL + arithmetic.

Domain membership (from INTELLIGENCE-ARCHITECTURE-v3.md):
    consumer   = consumer_mindshare, keywords
    product    = trending_products, design_profile, price_positioning,
                 launch_frequency, wtp
    marketing  = voice_volume, content_strategy, kol_strategy

Aggregation rule:
    Simple mean of members whose score > 0. Scores of 0 are treated as
    "not applicable for this data source" (matches how the API derives
    `status == 'not_applicable'` — e.g. a Douyin-only workspace has
    score=0 for pricing/product metrics).
    If ALL members of a domain are 0, the domain score is also 0.
    Equal weighting for V1; swap for a weight map later if we see
    signal that one metric should dominate a domain.

Usage:
    python -m services.competitor_intel.pipelines.domain_aggregation_pipeline --workspace-id UUID
    python -m services.competitor_intel.pipelines.domain_aggregation_pipeline --all

Pipeline order — run AFTER the 9 metric pipelines have written their
latest scores, and BEFORE brand_positioning_pipeline (which reads these
domain rollups to generate the weekly brief's verdict).
"""

import argparse
import json
import sys
import traceback
from ..db_bridge import get_conn

METRIC_VERSION = "v1.1"  # bumped: now respects raw_inputs.reason for n/a detection

# Domain membership. Keys must match the metric_type strings written by
# existing pipelines. `wtp` comes from scoring_pipeline, not from a
# dedicated pipeline file.
DOMAIN_MEMBERS = {
    "consumer_domain":  ["consumer_mindshare", "keywords"],
    "product_domain":   ["trending_products", "design_profile",
                         "price_positioning", "launch_frequency", "wtp"],
    "marketing_domain": ["voice_volume", "content_strategy", "kol_strategy"],
}

# raw_inputs.reason values that indicate the score is a fallback/default,
# NOT a real measurement. These rows are excluded from domain rollups so
# defaults like wtp=50 ("no_price_data") don't drag the rollup down.
NO_DATA_REASONS = {
    "no_data",
    "no_price_data",
    "no_product_data",
    "no_kol_data",
    "no_design_data",
    "no_content_data",
    "insufficient_data",
}


def _aggregate(metric_data: dict) -> dict:
    """
    Given metric_data = {metric_type: {"score": float, "reason": str|None}},
    compute each of the 3 domain rollups.
    Returns {domain_metric_type: {score, raw_inputs}} ready to insert.

    Exclusion rules (a member is excluded when ANY of these apply):
      1. Score is None (metric not yet computed for this brand)
      2. Score is exactly 0 (metric ran but produced literal zero)
      3. raw_inputs.reason is in NO_DATA_REASONS
         (this catches WTP's score=50 "no_price_data" fallback —
         a non-zero score that's actually a default, not a measurement)

    If every member is excluded the domain score is 0 with reason='no_data'
    so the API's status enum emits 'not_applicable' / 'no_data' for the
    rollup row. This matches the per-metric N/A handling and prevents
    Brief verdicts from saying "your X is bad" when reality is "we
    couldn't measure your X."
    """
    results = {}
    for domain_type, members in DOMAIN_MEMBERS.items():
        included = []
        component = {}
        excluded = []
        excluded_with_reason = {}

        for m in members:
            md = metric_data.get(m)
            if md is None:
                excluded.append(m)
                continue

            score = md.get("score")
            reason = md.get("reason")
            component[m] = score

            # Rule 1: missing score
            if score is None:
                excluded.append(m)
                continue
            # Rule 3: explicit no-data reason (score may be a non-zero default)
            if reason and reason in NO_DATA_REASONS:
                excluded.append(m)
                excluded_with_reason[m] = reason
                continue
            # Rule 2: literal zero
            if score == 0:
                excluded.append(m)
                continue

            included.append(score)

        if included:
            score = round(sum(included) / len(included))
            raw = {
                "component_metrics": component,
                "included_count": len(included),
                "excluded_count": len(excluded),
                "excluded_members": excluded,
            }
            if excluded_with_reason:
                raw["excluded_reasons"] = excluded_with_reason
        else:
            score = 0
            raw = {
                "component_metrics": component,
                "included_count": 0,
                "excluded_count": len(excluded),
                "excluded_members": excluded,
                "reason": "no_data",
            }
            if excluded_with_reason:
                raw["excluded_reasons"] = excluded_with_reason
        results[domain_type] = {"score": score, "raw_inputs": raw}
    return results


def run_for_workspace(workspace_id: str) -> int:
    """
    Compute domain rollups for every competitor in one workspace.
    Returns the number of (brand × domain) rows written.
    """
    conn = get_conn()
    rows_written = 0
    try:
        with conn.cursor() as cur:
            # Confirm workspace exists
            cur.execute("SELECT id FROM workspaces WHERE id = %s", (workspace_id,))
            if not cur.fetchone():
                print(f"[WARN] Workspace {workspace_id} not found")
                return 0

            # All competitors in this workspace
            cur.execute(
                "SELECT brand_name FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = [r["brand_name"] for r in cur.fetchall()]

            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return 0

            print(f"[DOMAIN] Rolling up 3 domains × {len(competitors)} competitors"
                  f" in workspace {workspace_id}")

            # All members of any domain — one SELECT per brand
            all_members = {
                m for members in DOMAIN_MEMBERS.values() for m in members
            }
            members_tuple = tuple(all_members)

            for idx, brand in enumerate(competitors):
                # Latest score+raw_inputs per metric_type for this brand in this workspace.
                # raw_inputs.reason is what lets us detect "score=50 but it's the
                # no_price_data fallback, not a real measurement."
                cur.execute(
                    """
                    SELECT DISTINCT ON (metric_type)
                        metric_type, score, raw_inputs
                    FROM analysis_results
                    WHERE workspace_id = %s
                      AND competitor_name = %s
                      AND metric_type = ANY(%s)
                    ORDER BY metric_type, analyzed_at DESC
                    """,
                    (workspace_id, brand, list(members_tuple)),
                )
                # analysis_results.score is NUMERIC in Postgres, which psycopg2
                # returns as Decimal. Coerce to float immediately so downstream
                # arithmetic works AND the raw_inputs dict stays JSON-serializable
                # (json.dumps chokes on Decimal by default).
                metric_data = {}
                for r in cur.fetchall():
                    raw = r.get("raw_inputs") or {}
                    if isinstance(raw, str):
                        try:
                            raw = json.loads(raw)
                        except (json.JSONDecodeError, TypeError):
                            raw = {}
                    metric_data[r["metric_type"]] = {
                        "score": float(r["score"]) if r["score"] is not None else 0.0,
                        "reason": raw.get("reason") if isinstance(raw, dict) else None,
                    }

                if not metric_data:
                    print(f"  [{idx+1}/{len(competitors)}] {brand}: "
                          f"no underlying metrics yet — skipped")
                    continue

                rollups = _aggregate(metric_data)

                for domain_type, payload in rollups.items():
                    cur.execute(
                        """
                        INSERT INTO analysis_results
                            (workspace_id, competitor_name, metric_type,
                             metric_version, score, raw_inputs)
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (
                            workspace_id, brand, domain_type, METRIC_VERSION,
                            payload["score"], json.dumps(payload["raw_inputs"]),
                        ),
                    )
                    rows_written += 1

                print(f"  [{idx+1}/{len(competitors)}] {brand}: "
                      f"consumer={rollups['consumer_domain']['score']} "
                      f"product={rollups['product_domain']['score']} "
                      f"marketing={rollups['marketing_domain']['score']}")

            conn.commit()
            print(f"[DONE] Wrote {rows_written} domain rows "
                  f"for workspace {workspace_id}")
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] Domain aggregation failed: {e}")
        traceback.print_exc()
    finally:
        conn.close()
    return rows_written


def run_for_all_workspaces() -> None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            ids = [r["id"] for r in cur.fetchall()]
    finally:
        conn.close()

    total_rows = 0
    for ws_id in ids:
        total_rows += run_for_workspace(str(ws_id))
    print(f"\n[SUMMARY] Domain aggregation complete — {total_rows} total rows "
          f"across {len(ids)} workspace(s).")


def main():
    parser = argparse.ArgumentParser(
        description="Aggregate 9 individual metric scores into 3 domain rollups."
    )
    parser.add_argument("--workspace-id", help="Single workspace UUID to process.")
    parser.add_argument("--all", action="store_true",
                        help="Process every workspace in the DB.")
    args = parser.parse_args()

    if args.all:
        run_for_all_workspaces()
    elif args.workspace_id:
        run_for_workspace(args.workspace_id)
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
