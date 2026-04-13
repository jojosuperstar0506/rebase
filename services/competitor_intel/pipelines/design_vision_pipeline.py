"""
Design DNA pipeline (metric_type: "design_profile").

Phase 1 (current): Deterministic scoring from hashtags, product metadata,
and image diversity. Zero AI cost.

Phase 2 (future): Upgrade to Sonnet vision model for actual image analysis
of product photos — material detection, color palette, style classification.
This would replace the hashtag-based proxy with real visual intelligence.

Data sources:
  - scraped_products: hashtags (material/style tags), image_urls (count),
    category (product type)
  - scraped_brand_profiles.raw_dimensions.d3.top_notes: enriched note data
    with hashtags and tagged_products

Score formula:
  - Style diversity (30pts): variety of style/aesthetic hashtags
  - Material signal (25pts): material-related keywords in hashtags
  - Visual consistency (25pts): dominant style concentration (brand identity)
  - Image richness (20pts): avg images per note (more = higher production value)

Usage:
  python -m services.competitor_intel.pipelines.design_vision_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.design_vision_pipeline --all
"""

import argparse
import json
import sys
import traceback
from collections import Counter
from ..db_bridge import get_conn

METRIC_VERSION = "v1.0"

# Style keywords (Chinese + English) — extracted from hashtags
STYLE_KEYWORDS = {
    "极简", "简约", "minimalist", "minimal", "简洁",
    "复古", "vintage", "retro", "古着",
    "潮流", "街头", "streetwear", "street", "潮牌",
    "经典", "classic", "百搭", "timeless",
    "轻奢", "luxury", "奢华", "高端", "premium",
    "可爱", "sweet", "甜美", "少女", "cute",
    "运动", "sporty", "athletic", "户外",
    "商务", "office", "通勤", "职场", "professional",
    "文艺", "artsy", "bohemian", "波西米亚",
    "ins风", "网红", "trendy", "时尚",
}

# Material keywords
MATERIAL_KEYWORDS = {
    "真皮", "leather", "头层牛皮", "皮质", "牛皮",
    "帆布", "canvas", "布",
    "尼龙", "nylon",
    "pu", "合成皮",
    "编织", "woven", "草编",
    "金属", "metal", "链条",
    "丝绒", "velvet", "绒面",
    "透明", "pvc", "果冻",
    "棉", "cotton", "麻", "linen",
    "羊毛", "wool", "cashmere", "羊绒",
}


def extract_tags_from_hashtags(hashtags_list: list) -> tuple:
    """Extract style and material tags from a list of hashtag strings."""
    style_found = set()
    material_found = set()
    all_tags = []

    for tag in hashtags_list:
        tag_lower = str(tag).lower().strip()
        all_tags.append(tag_lower)
        # Match whole keywords (exact match or the tag IS the keyword)
        # For Chinese: exact match or tag starts/ends with keyword (≥2 chars)
        # For English: word boundary check
        for kw in STYLE_KEYWORDS:
            kw_lower = kw.lower()
            if len(kw_lower) >= 2 and (tag_lower == kw_lower or tag_lower.startswith(kw_lower) or tag_lower.endswith(kw_lower)):
                style_found.add(kw)
            elif len(kw_lower) < 2 and tag_lower == kw_lower:
                style_found.add(kw)
        for kw in MATERIAL_KEYWORDS:
            kw_lower = kw.lower()
            if len(kw_lower) >= 2 and (tag_lower == kw_lower or tag_lower.startswith(kw_lower) or tag_lower.endswith(kw_lower)):
                material_found.add(kw)
            elif len(kw_lower) < 2 and tag_lower == kw_lower:
                material_found.add(kw)

    return style_found, material_found, all_tags


def run_for_workspace(workspace_id: str):
    """Compute design DNA metrics for all competitors in a workspace."""
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
            print(f"[DESIGN] Analyzing {total} competitors in workspace {workspace_id}")

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]

                # Collect all hashtags from scraped products (notes)
                cur.execute(
                    """
                    SELECT category, image_urls
                    FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at > NOW() - INTERVAL '30 days'
                    """,
                    (brand,),
                )
                products = cur.fetchall()

                # Get enriched notes from profile for deeper hashtag data
                cur.execute(
                    """
                    SELECT raw_dimensions
                    FROM scraped_brand_profiles
                    WHERE brand_name = %s
                    ORDER BY scraped_at DESC LIMIT 1
                    """,
                    (brand,),
                )
                profile = cur.fetchone()

                all_hashtags = []
                total_images = 0
                notes_with_images = 0
                top_notes = []  # initialize before conditional profile block

                # From scraped_products: category field contains joined hashtags
                for p in products:
                    cat = p.get("category") or ""
                    # Category may be "hashtag1,hashtag2" or "ugc:variant"
                    if cat and not cat.startswith("ugc:"):
                        all_hashtags.extend(
                            t.strip() for t in cat.split(",") if t.strip()
                        )
                    # Count images
                    imgs = p.get("image_urls") or []
                    if isinstance(imgs, list):
                        total_images += len(imgs)
                        if len(imgs) > 0:
                            notes_with_images += 1
                    elif isinstance(imgs, str) and imgs:
                        total_images += 1
                        notes_with_images += 1

                # From profile raw_dimensions.d3.top_notes: enriched hashtags
                if profile:
                    raw_dims = profile.get("raw_dimensions") or {}
                    d3 = raw_dims.get("d3") or {}
                    top_notes = d3.get("top_notes") or []
                    for note in top_notes:
                        note_hashtags = note.get("hashtags") or []
                        all_hashtags.extend(note_hashtags)
                        img_count = note.get("image_count") or 0
                        total_images += img_count
                        if img_count > 0:
                            notes_with_images += 1

                # Extract style and material signals
                style_tags, material_tags, all_tags = extract_tags_from_hashtags(all_hashtags)

                # Compute dominant style (most frequent tag category)
                tag_freq = Counter(all_tags)
                top_tags = tag_freq.most_common(10)
                dominant_style = top_tags[0][0] if top_tags else "unknown"

                # Style concentration: how much of total tags are the top style
                total_tag_count = sum(tag_freq.values()) or 1
                top_tag_count = top_tags[0][1] if top_tags else 0
                style_concentration = top_tag_count / total_tag_count

                # Avg images per note
                total_notes = len(products) + (len(top_notes) if profile else 0)
                avg_images = (total_images / max(total_notes, 1))

                # ── Scoring ──────────────────────────────────────
                # Style diversity (30pts): 5+ distinct style signals = full marks
                n_styles = len(style_tags)
                diversity_score = min(30, (n_styles / 5) * 30)

                # Material signal (25pts): 3+ material signals = full marks
                n_materials = len(material_tags)
                material_score = min(25, (n_materials / 3) * 25)

                # Visual consistency (25pts): higher concentration = stronger brand identity
                # Uses a bell curve around 0.25 (ideal balance of identity vs variety)
                # Below 0.10: weak identity. Above 0.60: monotonous.
                ideal = 0.25
                if style_concentration <= 0:
                    consistency_score = 0
                else:
                    # Distance from ideal, normalized to 0-1 range
                    dist = abs(style_concentration - ideal) / max(ideal, 1 - ideal)
                    consistency_score = max(0, 25 * (1 - dist))

                # Image richness (20pts): avg 5+ images per note = full marks
                richness_score = min(20, (avg_images / 5) * 20)

                score = max(0, min(100, round(
                    diversity_score + material_score + consistency_score + richness_score
                )))

                raw_inputs = {
                    "style_tags": sorted(list(style_tags))[:15],
                    "material_tags": sorted(list(material_tags))[:10],
                    "dominant_style": dominant_style,
                    "style_concentration": round(style_concentration, 3),
                    "n_styles": n_styles,
                    "n_materials": n_materials,
                    "avg_images_per_note": round(avg_images, 1),
                    "total_images_analyzed": total_images,
                    "top_tags": [{"tag": t, "count": c} for t, c in top_tags],
                    "data_source": "hashtags",  # will become "vision" in Phase 2
                    "notes_analyzed": total_notes,
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
                        "design_profile",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: design_score={score}, "
                    f"styles={n_styles}, materials={n_materials}, "
                    f"avg_imgs={avg_images:.1f}, dominant={dominant_style}"
                )

            conn.commit()
            print(f"[DONE] Design DNA analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Design vision pipeline failed: {e}")
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
    parser = argparse.ArgumentParser(description="Run CI design DNA pipeline")
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
