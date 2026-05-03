"""
One-shot backfill: convert legacy Chinese-only CI rows to bilingual {zh, en}.

Reads every workspace's existing weekly_briefs / content_recommendations /
product_opportunities rows, runs the same translation functions the
pipelines use, and writes the bilingual structure back to the DB. After
this runs, the existing resolveLang() in backend/server.js returns
English instantly — no runtime LLM call, no runtime fallback complexity.

Idempotent: rows already in bilingual format are detected and skipped.
Safe to re-run.

Usage:
    # Preview what would change (NO DB writes, NO LLM calls for unchanged rows)
    python -m services.competitor_intel.backfill_translations --all --dry-run

    # Actually translate everything
    python -m services.competitor_intel.backfill_translations --all

    # Single workspace
    python -m services.competitor_intel.backfill_translations --workspace-id UUID
"""

import argparse
import json
import os
import sys
import traceback
from pathlib import Path


# ─── Load backend/.env BEFORE pipeline imports ──────────────────────────
# Pipeline modules (narrative_pipeline) check for DEEPSEEK_API_KEY at
# module-load time and raise if missing. The cron's run_daily_pipeline.sh
# sources backend/.env via a bash loop before invoking python; this
# mirrors that so the script works when run by hand too.
def _load_dotenv():
    repo_root = Path(__file__).resolve().parent.parent.parent
    env_path = repo_root / "backend" / ".env"
    if not env_path.exists():
        print(f"[WARN] {env_path} not found — relying on existing os.environ")
        return
    loaded = []
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        # Strip a single layer of matching outer quotes only — don't strip
        # mid-value quotes that might be part of a password.
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ('"', "'"):
            v = v[1:-1]
        # OVERWRITE existing env vars — stale shell values from a previous
        # partial source attempt must not win over the file's current contents.
        os.environ[k] = v
        loaded.append(k)
    if loaded:
        print(f"[ENV] Loaded {len(loaded)} keys from {env_path.name}: "
              f"{', '.join(sorted(loaded))}")


_load_dotenv()


from .db_bridge import get_conn
from .brand_positioning_pipeline import _translate_brief
from .gtm_content_pipeline import _translate_drafts, _to_json_if_dict as _to_json_draft
from .product_opportunity_pipeline import (
    _translate_concept,
    _to_json_if_dict as _to_json_opp,
    _channels_for_db,
)


def _is_already_bilingual(val) -> bool:
    """True if val is {zh, en} dict OR JSON-string that parses to one."""
    if isinstance(val, dict) and "zh" in val and "en" in val:
        return True
    if isinstance(val, str) and val.startswith("{"):
        try:
            parsed = json.loads(val)
            return isinstance(parsed, dict) and "zh" in parsed and "en" in parsed
        except (json.JSONDecodeError, TypeError):
            pass
    return False


def _backfill_brief(cur, workspace_id, week_of, verdict, moves, dry_run) -> bool:
    """Translate one weekly_briefs row. Returns True if a change was made."""
    sample = (verdict or {}).get("headline")
    if _is_already_bilingual(sample):
        return False

    brief = {"verdict": dict(verdict or {}), "moves": list(moves or [])}
    translated = _translate_brief(brief)

    # Confirm translation actually produced bilingual output (not silently failed)
    new_sample = (translated.get("verdict") or {}).get("headline")
    if not _is_already_bilingual(new_sample):
        print(f"  [SKIP] brief week={week_of} — translation returned no en (LLM call likely failed)")
        return False

    if dry_run:
        print(f"  [DRY-RUN] would update brief week={week_of}")
        return True

    cur.execute(
        """UPDATE weekly_briefs
              SET verdict = %s::jsonb,
                  moves   = %s::jsonb
            WHERE workspace_id = %s
              AND week_of = %s""",
        (
            json.dumps(translated["verdict"], ensure_ascii=False),
            json.dumps(translated["moves"], ensure_ascii=False),
            workspace_id,
            week_of,
        ),
    )
    print(f"  [OK] brief week={week_of}")
    return True


def _backfill_drafts(cur, workspace_id, week_of, dry_run) -> int:
    """Translate content_recommendations rows for one workspace+week. Returns count updated."""
    cur.execute(
        """SELECT id, title, hook_3s, main_15s, cta_3s, reasoning, why_now
             FROM content_recommendations
            WHERE workspace_id = %s AND week_of = %s""",
        (workspace_id, week_of),
    )
    rows = cur.fetchall()
    if not rows:
        return 0

    drafts = []
    for r in rows:
        if _is_already_bilingual(r["title"]):
            continue
        drafts.append(dict(r))

    if not drafts:
        return 0

    translated = _translate_drafts(drafts)

    # Verify translation succeeded
    sample = translated[0].get("title") if translated else None
    if not _is_already_bilingual(sample):
        print(f"  [SKIP] drafts week={week_of} — translation returned no en")
        return 0

    if dry_run:
        print(f"  [DRY-RUN] would update {len(translated)} drafts week={week_of}")
        return len(translated)

    for d in translated:
        cur.execute(
            """UPDATE content_recommendations
                  SET title=%s, hook_3s=%s, main_15s=%s, cta_3s=%s,
                      reasoning=%s, why_now=%s
                WHERE id=%s""",
            (
                _to_json_draft(d.get("title")),
                _to_json_draft(d.get("hook_3s")),
                _to_json_draft(d.get("main_15s")),
                _to_json_draft(d.get("cta_3s")),
                _to_json_draft(d.get("reasoning")),
                _to_json_draft(d.get("why_now")),
                d["id"],
            ),
        )
    print(f"  [OK] {len(translated)} drafts week={week_of}")
    return len(translated)


def _backfill_opportunities(cur, workspace_id, week_of, dry_run) -> int:
    """Translate product_opportunities rows for one workspace+week."""
    cur.execute(
        """SELECT id, concept_name, positioning, why_now, signals,
                  target_price, target_channels, launch_timeline
             FROM product_opportunities
            WHERE workspace_id = %s AND week_of = %s""",
        (workspace_id, week_of),
    )
    rows = cur.fetchall()
    if not rows:
        return 0

    updated = 0
    for r in rows:
        if _is_already_bilingual(r["concept_name"]):
            continue

        concept = dict(r)
        # signals may come back as JSON string or list — normalize to list
        sigs = concept.get("signals")
        if isinstance(sigs, str):
            try:
                concept["signals"] = json.loads(sigs)
            except (json.JSONDecodeError, TypeError):
                concept["signals"] = []
        elif not isinstance(sigs, list):
            concept["signals"] = []
        # target_channels comes back as a Python list from TEXT[]
        if not isinstance(concept.get("target_channels"), list):
            concept["target_channels"] = []

        translated = _translate_concept(concept)

        # Verify translation succeeded
        if not _is_already_bilingual(translated.get("concept_name")):
            print(f"  [SKIP] opp {r['id']} — translation returned no en")
            continue

        if dry_run:
            print(f"  [DRY-RUN] would update opp {r['id']}")
            updated += 1
            continue

        cur.execute(
            """UPDATE product_opportunities
                  SET concept_name=%s, positioning=%s, why_now=%s,
                      target_price=%s, launch_timeline=%s,
                      signals=%s::jsonb, target_channels=%s
                WHERE id=%s""",
            (
                _to_json_opp(translated.get("concept_name")),
                _to_json_opp(translated.get("positioning")),
                _to_json_opp(translated.get("why_now")),
                _to_json_opp(translated.get("target_price")),
                _to_json_opp(translated.get("launch_timeline")),
                json.dumps(translated.get("signals") or [], ensure_ascii=False),
                _channels_for_db(translated.get("target_channels") or []),
                r["id"],
            ),
        )
        updated += 1
        print(f"  [OK] opp {r['id']}")
    return updated


def run_for_workspace(workspace_id: str, dry_run: bool = False) -> bool:
    """Backfill all rows for one workspace. Returns True on success."""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT week_of, verdict, moves
                     FROM weekly_briefs
                    WHERE workspace_id = %s
                    ORDER BY week_of DESC""",
                (workspace_id,),
            )
            briefs = cur.fetchall()

            if not briefs:
                print(f"[SKIP] workspace={workspace_id[:8]} — no briefs")
                return True

            print(f"[WORKSPACE {workspace_id[:8]}] {len(briefs)} week(s) of briefs")

            n_briefs = n_drafts = n_opps = 0
            for b in briefs:
                week = b["week_of"]
                if _backfill_brief(cur, workspace_id, week, b["verdict"], b["moves"], dry_run):
                    n_briefs += 1
                n_drafts += _backfill_drafts(cur, workspace_id, week, dry_run)
                n_opps += _backfill_opportunities(cur, workspace_id, week, dry_run)

            if dry_run:
                conn.rollback()
                print(f"[DRY-RUN] workspace={workspace_id[:8]} — "
                      f"would translate {n_briefs} briefs, {n_drafts} drafts, "
                      f"{n_opps} opps (no DB writes)")
            else:
                conn.commit()
                print(f"[DONE] workspace={workspace_id[:8]} — "
                      f"{n_briefs} briefs, {n_drafts} drafts, {n_opps} opps")
        return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] workspace={workspace_id[:8]}: {e}")
        traceback.print_exc()
        return False
    finally:
        conn.close()


def run_all(dry_run: bool = False) -> None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            ids = [str(r["id"]) for r in cur.fetchall()]
    finally:
        conn.close()

    print(f"[START] {len(ids)} workspace(s){' (DRY-RUN)' if dry_run else ''}\n")
    ok = 0
    for ws_id in ids:
        if run_for_workspace(ws_id, dry_run=dry_run):
            ok += 1
        print("")
    print(f"[SUMMARY] {ok}/{len(ids)} workspace(s) processed")


def main():
    parser = argparse.ArgumentParser(
        description="One-shot backfill: translate legacy Chinese-only CI data to bilingual {zh, en}."
    )
    parser.add_argument("--workspace-id", help="Single workspace UUID to backfill")
    parser.add_argument("--all", action="store_true", help="Backfill every workspace")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would change without writing to DB. "
                             "Note: translation LLM calls still happen so we can "
                             "verify the LLM is working — only the UPDATE is skipped.")
    args = parser.parse_args()

    if args.workspace_id:
        run_for_workspace(args.workspace_id, dry_run=args.dry_run)
    elif args.all:
        run_all(dry_run=args.dry_run)
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
