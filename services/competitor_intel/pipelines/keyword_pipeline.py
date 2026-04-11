"""
Keyword analysis pipeline (metric_type: "keywords").
Reads product names + descriptions from scraped_products, extracts keywords
using jieba (Chinese word segmentation), computes keyword frequency cloud,
top categories, and trending terms.

Usage:
  python -m services.competitor_intel.pipelines.keyword_pipeline --workspace-id UUID
  python -m services.competitor_intel.pipelines.keyword_pipeline --all
"""

import argparse
import json
import re
import sys
import traceback
from collections import Counter
from ..db_bridge import get_conn

METRIC_VERSION = "v1.0"

# Try to import jieba; fall back to n-gram extraction if unavailable
try:
    import jieba
    HAS_JIEBA = True
except ImportError:
    HAS_JIEBA = False
    print("[WARN] jieba not installed, falling back to character n-gram extraction")


def extract_keywords_jieba(texts: list[str]) -> list[str]:
    """Extract keywords from texts using jieba word segmentation."""
    import jieba.analyse
    all_text = " ".join(texts)
    # Use TF-IDF to extract top keywords per text, plus raw cut for frequency
    words = []
    for text in texts:
        cuts = jieba.lcut(text)
        # Filter: keep words >= 2 chars, remove pure numbers/punctuation
        words.extend(
            w for w in cuts
            if len(w) >= 2 and not re.match(r'^[\d\s\W]+$', w)
        )
    return words


def extract_keywords_ngram(texts: list[str], n: int = 2) -> list[str]:
    """Fallback: extract character n-grams from texts."""
    words = []
    for text in texts:
        # Remove whitespace, punctuation, numbers
        cleaned = re.sub(r'[\s\d\W]+', '', text)
        for i in range(len(cleaned) - n + 1):
            gram = cleaned[i:i + n]
            if len(gram) == n:
                words.append(gram)
    return words


def detect_trending(recent_counter: Counter, older_counter: Counter, top_n: int = 20) -> list[str]:
    """Find terms that appear in recent products but not (or rarely) in older ones."""
    trending = []
    for word, count in recent_counter.most_common(top_n * 3):
        old_count = older_counter.get(word, 0)
        if old_count == 0 and count >= 2:
            trending.append(word)
        elif old_count > 0 and (count / old_count) >= 3.0:
            trending.append(word)
        if len(trending) >= top_n:
            break
    return trending


def run_for_workspace(workspace_id: str):
    """Compute keyword metrics for all competitors in a workspace."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            # Get workspace
            cur.execute("SELECT * FROM workspaces WHERE id = %s", (workspace_id,))
            workspace = cur.fetchone()
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return

            # Get competitors
            cur.execute(
                "SELECT * FROM workspace_competitors WHERE workspace_id = %s",
                (workspace_id,),
            )
            competitors = cur.fetchall()

            if not competitors:
                print(f"[INFO] No competitors for workspace {workspace_id}")
                return

            total = len(competitors)
            print(f"[KEYWORDS] Analyzing {total} competitors in workspace {workspace_id}")

            for idx, comp in enumerate(competitors):
                brand = comp["brand_name"]

                # Get recent products (last 30 days)
                cur.execute(
                    """
                    SELECT product_name, category
                    FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at > NOW() - INTERVAL '30 days'
                    ORDER BY scraped_at DESC
                    """,
                    (brand,),
                )
                recent_products = cur.fetchall()

                # Get older products (30-90 days ago) for trend detection
                cur.execute(
                    """
                    SELECT product_name, category
                    FROM scraped_products
                    WHERE brand_name = %s
                    AND scraped_at BETWEEN NOW() - INTERVAL '90 days'
                                       AND NOW() - INTERVAL '30 days'
                    ORDER BY scraped_at DESC
                    """,
                    (brand,),
                )
                older_products = cur.fetchall()

                # Build text lists
                recent_texts = [
                    p["product_name"] for p in recent_products if p.get("product_name")
                ]
                older_texts = [
                    p["product_name"] for p in older_products if p.get("product_name")
                ]

                # Extract keywords
                if HAS_JIEBA:
                    recent_words = extract_keywords_jieba(recent_texts)
                    older_words = extract_keywords_jieba(older_texts)
                else:
                    recent_words = extract_keywords_ngram(recent_texts)
                    older_words = extract_keywords_ngram(older_texts)

                recent_counter = Counter(recent_words)
                older_counter = Counter(older_words)

                # Keyword cloud: top 50
                keyword_cloud = dict(recent_counter.most_common(50))

                # Category counts
                categories = Counter(
                    p["category"] for p in recent_products
                    if p.get("category")
                )

                # Trending terms
                trending = detect_trending(recent_counter, older_counter)

                # Score: based on keyword diversity + trending term count
                unique_keywords = len(recent_counter)
                diversity_score = min(50, (unique_keywords / 100) * 50)  # 100 unique = 50 pts
                trending_score = min(50, len(trending) * 5)  # 10 trending terms = 50 pts
                score = max(0, min(100, round(diversity_score + trending_score)))

                raw_inputs = {
                    "keyword_cloud": keyword_cloud,
                    "categories": dict(categories.most_common(20)),
                    "trending": trending,
                    "total_products_analyzed": len(recent_products),
                }

                # Write to analysis_results
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
                        "keywords",
                        METRIC_VERSION,
                        score,
                        json.dumps(raw_inputs, ensure_ascii=False),
                    ),
                )

                print(
                    f"  [{idx+1}/{total}] {brand}: keywords_score={score}, "
                    f"unique={unique_keywords}, trending={len(trending)}, "
                    f"products={len(recent_products)}"
                )

            conn.commit()
            print(f"[DONE] Keyword analysis saved for workspace {workspace_id}")

    except Exception as e:
        print(f"[ERROR] Keyword pipeline failed: {e}")
        traceback.print_exc()
    finally:
        conn.close()


def run_all_workspaces():
    """Run keyword analysis for all workspaces."""
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
    parser = argparse.ArgumentParser(description="Run CI keyword analysis pipeline")
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
