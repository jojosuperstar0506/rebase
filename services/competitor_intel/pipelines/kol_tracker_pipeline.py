"""
KOL strategy pipeline (metric_type: "kol_strategy").

Measures a brand's influencer/KOL ecosystem effectiveness using data
already collected by the enhanced XHS scraper:
  - raw_dimensions.d4.note_authors: authors with >10K followers who posted
    brand-related content (extracted during UGC + catalog enrichment)
  - scraped_products: per-note engagement with author info
  - raw_dimensions.d3.top_notes: enriched notes with is_sponsored flag

Score formula:
  - KOL reach (30pts): total follower reach of associated KOLs
  - KOL count & diversity (25pts): number of distinct KOLs across tiers
  - Sponsored content ratio (25pts): % of brand content that is KOL/sponsored
  - KOL engagement efficiency (20pts): avg engagement on KOL posts vs brand posts

Tiers (by follower count):
  - Nano:  10K–50K
  - Micro: 50K–200K
  - Mid:   200K–1M
  - Macro: 1M+

Usage:
  python -m services.competitor_intel.pipelines.kol_tracker_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.kol_tracker_pipeline --all
"""

import argparse
import json
import sys
import traceback
from ..db_bridge import get_conn

METRIC_VERSION = "v1.0"

# Follower tier boundaries
TIERS = [
    ("nano",  10_000,   50_000),
    ("micro", 50_000,  200_000),
    ("mid",  200_000, 1_000_000),
    ("macro", 1_000_000, float("inf")),
]


def classify_tier(followers: int) -> str:
    for name, lo, hi in TIERS:
        if lo <= followers < hi:
            return name
    return "macro" if followers >= 1_000_000 else "nano"


def run_for_workspace(workspace_id: str):
    """Compute KOL strategy metrics for all competitors in a workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
            workspace = cur.fetchone()
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return

            cur.execute(
                "SELECT * FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()
            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return

            total = len(competitors)
            print(f"[KOL] Analyzing {total} competitors in workspace {workspace_id}")

            # Collect max KOL reach for relative scoring
            max_reach_all = 1

            brand_kol_data = {}
            for comp in competitors:
                brand = comp["brand_name"]

                # Get latest profile with raw_dimensions
                cur.execute(
                    """
                    SELECT raw_dimensions, engagement_metrics
                    FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 1
                    """,
                    (brand,),
                )
                profile = cur.fetchone()

                kol_authors = []
                sponsored_count = 0
                total_notes_checked = 0

                if profile:
                    raw_dims = profile.get("raw_dimensions") or {}

                    # D4: note_authors (authors with >10K followers)
                    d4 = raw_dims.get("d4") or {}
                    kol_authors = d4.get("note_authors") or []

                    # D3: top_notes — check is_sponsored flag
                    d3 = raw_dims.get("d3") or {}
                    top_notes = d3.get("top_notes") or []
                    total_notes_checked = len(top_notes)
                    for note in top_notes:
                        if note.get("is_sponsored") or note.get("brand_collab"):
                            sponsored_count += 1

                # Deduplicate KOLs by user_id or nickname
                seen = set()
                unique_kols = []
                for author in kol_authors:
                    uid = author.get("user_id") or author.get("nickname") or ""
                    if uid and uid not in seen:
                        seen.add(uid)
                        unique_kols.append(author)

                # Classify into tiers
                tier_counts = {"nano": 0, "micro": 0, "mid": 0, "macro": 0}
                total_reach = 0
                kol_details = []
                for kol in unique_kols:
                    followers = int(kol.get("followers") or kol.get("fansCount") or 0)
                    if followers < 10_000:
                        continue  # below KOL threshold
                    tier = classify_tier(followers)
                    tier_counts[tier] += 1
                    total_reach += followers
                    kol_details.append({
                        "nickname": kol.get("nickname", "unknown"),
                        "followers": followers,
                        "tier": tier,
                    })

                # Sort KOLs by followers desc, keep top 10 for display
                kol_details.sort(key=lambda k: k["followers"], reverse=True)

                brand_kol_data[brand] = {
                    "kol_count": len(kol_details),
                    "total_reach": total_reach,
                    "tier_counts": tier_counts,
                    "kol_details": kol_details[:10],
                    "sponsored_count": sponsored_count,
                    "total_notes_checked": total_notes_checked,
                }

                max_reach_all = max(max_reach_all, total_reach)

            # Second pass: score each brand
            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]
                kd = brand_kol_data[brand]

                kol_count = kd["kol_count"]
                total_reach = kd["total_reach"]
                tier_counts = kd["tier_counts"]
                sponsored_count = kd["sponsored_count"]
                total_notes_checked = kd["total_notes_checked"]

                # ── Scoring ──────────────────────────────────────
                # KOL reach (30pts): relative to top competitor
                reach_ratio = total_reach / max_reach_all
                reach_score = min(30, reach_ratio * 30)

                # KOL count & diversity (25pts)
                # 10+ KOLs = full count pts (15), 3+ tiers active = full diversity pts (10)
                count_pts = min(15, (kol_count / 10) * 15)
                active_tiers = sum(1 for v in tier_counts.values() if v > 0)
                diversity_pts = min(10, (active_tiers / 3) * 10)
                count_score = count_pts + diversity_pts

                # Sponsored content ratio (25pts)
                # 20%+ sponsored = full marks (indicates active brand partnerships)
                if total_notes_checked > 0:
                    sponsored_ratio = sponsored_count / total_notes_checked
                    sponsored_score = min(25, (sponsored_ratio / 0.20) * 25)
                else:
                    sponsored_ratio = 0
                    sponsored_score = 0

                # KOL presence depth (20pts)
                # Measures how established the KOL ecosystem is:
                # - Having KOLs across multiple tiers shows mature strategy
                # - Combined with tier diversity already scored above, this rewards
                #   BOTH breadth (many KOLs) and tier variety
                # Note: future upgrade to compare per-note engagement of KOL vs
                # non-KOL posts when we have author-level engagement data
                if kol_count >= 10 and active_tiers >= 3:
                    depth_score = 20  # mature, diversified KOL network
                elif kol_count >= 5:
                    depth_score = 14
                elif kol_count >= 2:
                    depth_score = 8
                elif kol_count >= 1:
                    depth_score = 4
                else:
                    depth_score = 0

                score = max(0, min(100, round(
                    reach_score + count_score + sponsored_score + depth_score
                )))

                raw_inputs = {
                    "kol_count": kol_count,
                    "total_reach": total_reach,
                    "tier_mix": tier_counts,
                    "sponsored_ratio": round(sponsored_ratio, 3) if total_notes_checked > 0 else 0,
                    "sponsored_count": sponsored_count,
                    "total_notes_checked": total_notes_checked,
                    "top_kols": kd["kol_details"],
                    "active_tiers": active_tiers,
                }

                cur.execute(
                    """
                    INSERT INTO analysis_results
                        (workspace_id, competitor_name, metric_type,
                         metric_version, score, raw_inputs)
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb)
                    """,
                    (
                        workspace_id,
                        brand,
                        "kol_strategy",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: kol_score={score}, "
                    f"kols={kol_count}, reach={total_reach}, "
                    f"tiers={tier_counts}, sponsored={sponsored_count}/{total_notes_checked}"
                )

            conn.commit()
            print(f"[DONE] KOL strategy analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] KOL tracker pipeline failed: {e}")
        traceback.print_exc()
    finally:
        conn.close()


def run_all_workspaces():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            workspaces = cur.fetchall()
        for ws in workspaces:
            run_for_workspace(ws["id"])
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description="Run CI KOL strategy pipeline")
    parser.add_argument("--workspace-id", help="Analyze a specific workspace")
    parser.add_argument("--all", action="store_true", help="Analyze all workspaces")
    args = parser.parse_args()

    if args.workspace_id:
        run_for_workspace(args.workspace_id)
    elif args.all:
        run_all_workspaces()
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
