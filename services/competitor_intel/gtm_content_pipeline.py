"""
GTM content pipeline (Douyin script generator).

Produces 2 Douyin video drafts per workspace per ISO-week, each grounded
in one of this week's brief moves. Writes to `content_recommendations`
with status='draft' so the user can mark posted / dismiss from the UI.

Why this exists:
    Section 3 of the Brief ("Content playbook") is two ready-to-publish
    Douyin scripts. They follow a 3s hook / 15s main / 3s CTA structure.
    The whole point is to take the abstract "things moved this week"
    output of brand_positioning and translate it into concrete creative
    the SMB owner can copy-paste into their next post.

Pipeline order:
    Run AFTER brand_positioning_pipeline. This pipeline reads the
    weekly_briefs row to ground drafts in the same moves the user is
    seeing on the Brief verdict card.

Inputs (from DB):
    weekly_briefs.verdict + .moves (this week's row for the workspace)
    workspaces.brand_name, brand_category

Output (to DB):
    content_recommendations rows (1 per draft, 2 per workspace per week)

Idempotency:
    Default behavior: SKIP if drafts already exist for this week so the
    user's mark_posted / dismiss decisions aren't wiped by a daily cron.
    Pass --force to regenerate (deletes existing drafts first).

Honesty rules:
    1. Every draft's `based_on` must reference a real move id from the
       brief. The prompt forbids inventing moves.
    2. If no brief exists for this week, the pipeline emits a baseline
       skip ("run brand_positioning first") instead of fabricating a
       script from a vacuum.
    3. Hashtags must be plausible — short, non-generic, mostly Chinese.
       The prompt asks for 3–5; we coerce to that range.

Usage:
    python -m services.competitor_intel.gtm_content_pipeline --workspace-id UUID
    python -m services.competitor_intel.gtm_content_pipeline --all
    python -m services.competitor_intel.gtm_content_pipeline --all --force
"""

import argparse
import json
import sys
import traceback
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from .db_bridge import get_conn
from .narrative_pipeline import LLM_CONFIG, _call_llm

METRIC_VERSION = "v1.0"
PLATFORM = "douyin"  # XHS support is a Day-2-followup; one platform at a time
TARGET_DRAFT_COUNT = 2


def iso_monday(d: Optional[date] = None) -> date:
    d = d or datetime.now(timezone.utc).date()
    return d - timedelta(days=d.weekday())


# ─── DB readers ──────────────────────────────────────────────────────────────

def _load_workspace(cur, workspace_id: str) -> Optional[dict]:
    cur.execute(
        """
        SELECT id, brand_name, brand_category
        FROM workspaces WHERE id = %s
        """,
        (workspace_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _load_brief(cur, workspace_id: str, week_of: date) -> Optional[dict]:
    """Return {verdict, moves} for this workspace's current week, or None."""
    cur.execute(
        """
        SELECT verdict, moves
        FROM weekly_briefs
        WHERE workspace_id = %s AND week_of = %s
        LIMIT 1
        """,
        (workspace_id, week_of),
    )
    row = cur.fetchone()
    if not row:
        return None
    verdict = row["verdict"] if isinstance(row["verdict"], dict) else json.loads(row["verdict"] or "{}")
    moves = row["moves"]
    if isinstance(moves, str):
        try:
            moves = json.loads(moves)
        except (json.JSONDecodeError, TypeError):
            moves = []
    if not isinstance(moves, list):
        moves = []
    return {"verdict": verdict, "moves": moves}


def _count_existing_drafts(cur, workspace_id: str, week_of: date) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM content_recommendations
        WHERE workspace_id = %s AND week_of = %s AND platform = %s
        """,
        (workspace_id, week_of, PLATFORM),
    )
    return int(cur.fetchone()["n"])


def _delete_existing_drafts(cur, workspace_id: str, week_of: date) -> int:
    """Used only on --force; removes ALL drafts (incl. posted/dismissed) for the week."""
    cur.execute(
        """
        DELETE FROM content_recommendations
        WHERE workspace_id = %s AND week_of = %s AND platform = %s
        """,
        (workspace_id, week_of, PLATFORM),
    )
    return cur.rowcount or 0


# ─── Prompt builder ──────────────────────────────────────────────────────────

def _format_moves_for_prompt(moves: list) -> str:
    """Render the brief's moves so DeepSeek can pick 2 to script against."""
    if not moves:
        return "(本周没有显著事件)"
    lines = []
    for m in moves:
        if not isinstance(m, dict):
            continue
        mid = m.get("id") or "?"
        brand = m.get("brand") or "?"
        impact = m.get("impact") or "medium"
        headline = m.get("headline") or ""
        detail = m.get("detail") or ""
        so_what = m.get("so_what") or ""
        lines.append(
            f"- [{mid}] ({impact} impact) {brand}：{headline}\n"
            f"    数据：{detail}\n"
            f"    所以：{so_what}"
        )
    return "\n".join(lines) if lines else "(本周没有显著事件)"


def _build_prompt(workspace: dict, brief: dict) -> str:
    brand = workspace.get("brand_name") or "(unnamed brand)"
    category = workspace.get("brand_category") or "未指定品类"
    verdict = brief["verdict"] or {}
    headline = verdict.get("headline") or ""
    sentence = verdict.get("sentence") or ""
    moves_block = _format_moves_for_prompt(brief["moves"])

    return f"""你是一位专门为中国 {category} 类目品牌做抖音短视频脚本的资深内容策划。

我的品牌：{brand}（品类：{category}）

本周态势（来自竞品 brief，这是你创作的事实依据 — 不要编造其它信息）：
- 总结：{headline}
- 详情：{sentence}

本周的 moves（每个事件都附带数据证据和"所以"判断）：
{moves_block}

请基于上面的真实信息，生成 **正好 2 个抖音短视频脚本**。每个脚本必须明确响应一个上面真实存在的 move（用其 id 标注）。

抖音短视频结构（必须严格遵循）：
- hook_3s：前 3 秒钩子。一句话，让用户停手不划走。≤30 字。
- main_15s：主体 15 秒。讲清楚论点。可以包含 1-2 个简短的 [场景描写] 或 [画面切换] 标记。≤200 字。
- cta_3s：结尾 3 秒。一句具体的行动引导（关注 / 主页 / 评论区）。≤25 字。
- hashtags：3-5 个标签，每个以 # 开头。要具体、可搜索，避免 #生活 这类宽泛标签。
- title：内部标题，方便用户在 Library 中识别。≤25 字。
- reasoning：1-2 句解释这个脚本"为什么响应了这个 move"。
- why_now：1 句话讲为什么本周是发这条内容的最佳时机。
- based_on：必须是上面 moves 中的一个 id（例如 "m1"），不能是其它。

整体要求：
- 每个脚本响应一个**不同**的 move（不要两个都响应同一个）。
- 优先选择 high impact 的 move。
- 引用真实数据。例如 move 中提到 "声量+17"，脚本里可以体现"对手本周声量飙升 17 点"，但不要编造其它数字。
- 中文（简体），口语化但不油腻。

严格按以下 JSON 输出，不要任何 markdown 包裹：
{{
  "drafts": [
    {{
      "title": "...",
      "based_on": "m1",
      "hook_3s": "...",
      "main_15s": "...",
      "cta_3s": "...",
      "hashtags": ["#...", "#...", "#..."],
      "reasoning": "...",
      "why_now": "..."
    }},
    {{
      "title": "...",
      "based_on": "m2",
      "hook_3s": "...",
      "main_15s": "...",
      "cta_3s": "...",
      "hashtags": ["#...", "#...", "#..."],
      "reasoning": "...",
      "why_now": "..."
    }}
  ]
}}"""


# ─── Response parsing ────────────────────────────────────────────────────────

def _strip_markdown_fence(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0]
    return raw.strip()


def _coerce_hashtags(tags) -> list:
    """Force list-of-non-empty-strings, each starting with #, capped at 8."""
    if not isinstance(tags, list):
        return []
    out = []
    for t in tags:
        if not isinstance(t, str):
            continue
        t = t.strip()
        if not t:
            continue
        if not t.startswith("#"):
            t = "#" + t
        out.append(t[:32])  # absurdly long tags are bot-flag bait
        if len(out) >= 8:
            break
    return out


def _coerce_draft(d: dict, allowed_move_ids: set) -> Optional[dict]:
    """Validate one draft from the LLM. Returns None if it can't be salvaged."""
    if not isinstance(d, dict):
        return None
    title = str(d.get("title") or "").strip()
    hook = str(d.get("hook_3s") or "").strip()
    main = str(d.get("main_15s") or "").strip()
    cta = str(d.get("cta_3s") or "").strip()
    if not (title and hook and main and cta):
        return None
    based_on = str(d.get("based_on") or "").strip()
    # If LLM hallucinated a move id we don't have, we DON'T discard the
    # draft — the body might still be useful — but we strip the false
    # attribution so the UI doesn't claim a phantom source.
    if based_on not in allowed_move_ids:
        based_on = ""
    hashtags = _coerce_hashtags(d.get("hashtags"))
    if len(hashtags) < 1:
        # Hashtags are essential for Douyin reach; reject the draft if the
        # LLM didn't provide any. Better to skip than ship a tagless one.
        return None
    return {
        "title":      title[:80],
        "hook_3s":    hook[:200],
        "main_15s":   main[:600],
        "cta_3s":     cta[:200],
        "hashtags":   hashtags,
        "reasoning":  str(d.get("reasoning") or "").strip()[:400],
        "why_now":    str(d.get("why_now") or "").strip()[:300],
        "based_on":   based_on,
    }


def _parse_drafts_json(raw: str, allowed_move_ids: set) -> list:
    try:
        data = json.loads(_strip_markdown_fence(raw))
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, dict):
        return []
    drafts_in = data.get("drafts") or []
    if not isinstance(drafts_in, list):
        return []
    out = []
    for d in drafts_in[:TARGET_DRAFT_COUNT]:
        coerced = _coerce_draft(d, allowed_move_ids)
        if coerced:
            out.append(coerced)
    return out


# ─── DB writer ───────────────────────────────────────────────────────────────

def _insert_draft(cur, workspace_id: str, week_of: date, draft: dict) -> None:
    cur.execute(
        """
        INSERT INTO content_recommendations (
            workspace_id, week_of, platform,
            title, hook_3s, main_15s, cta_3s,
            hashtags, reasoning, why_now, based_on,
            status
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'draft')
        """,
        (
            workspace_id, week_of, PLATFORM,
            draft["title"], draft["hook_3s"], draft["main_15s"], draft["cta_3s"],
            draft["hashtags"], draft["reasoning"], draft["why_now"], draft["based_on"],
        ),
    )


# ─── Orchestration ───────────────────────────────────────────────────────────

def run_for_workspace(workspace_id: str, target_week: Optional[date] = None,
                       force: bool = False) -> bool:
    week_of = target_week or iso_monday()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            workspace = _load_workspace(cur, workspace_id)
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return False
            brand_name = workspace["brand_name"] or "(unnamed)"

            brief = _load_brief(cur, workspace_id, week_of)
            if not brief or not brief.get("moves"):
                print(f"[SKIP] {brand_name}: no brief (or no moves) for week {week_of} — "
                      f"run brand_positioning_pipeline first")
                return False

            existing = _count_existing_drafts(cur, workspace_id, week_of)
            if existing > 0 and not force:
                print(f"[SKIP] {brand_name}: {existing} drafts already exist for "
                      f"week {week_of} (use --force to regenerate)")
                return False
            if existing > 0 and force:
                deleted = _delete_existing_drafts(cur, workspace_id, week_of)
                print(f"  [FORCE] {brand_name}: deleted {deleted} existing drafts")

            allowed_move_ids = {
                m.get("id") for m in brief["moves"]
                if isinstance(m, dict) and m.get("id")
            }
            prompt = _build_prompt(workspace, brief)

            print(f"[CONTENT] {brand_name} ({workspace_id[:8]}) — week_of={week_of} "
                  f"moves={len(brief['moves'])} target={TARGET_DRAFT_COUNT}")

            try:
                raw = _call_llm(prompt, LLM_CONFIG["synthesis_model"], max_tokens=2000)
            except Exception as e:
                print(f"  [WARN] LLM call failed: {e}")
                conn.rollback()
                return False

            drafts = _parse_drafts_json(raw, allowed_move_ids)
            if not drafts:
                print("  [WARN] LLM response unparseable — no drafts generated")
                print(f"  [DEBUG] raw response (first 400 chars): {raw[:400]}")
                conn.rollback()
                return False

            for d in drafts:
                _insert_draft(cur, workspace_id, week_of, d)

            conn.commit()
            for i, d in enumerate(drafts, 1):
                print(f"  [DONE] draft {i}: title={d['title']!r} "
                      f"based_on={d['based_on'] or '(unattributed)'} "
                      f"hashtags={len(d['hashtags'])}")
            return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] gtm_content failed for {workspace_id}: {e}")
        traceback.print_exc()
        return False
    finally:
        conn.close()


def run_for_all_workspaces(target_week: Optional[date] = None, force: bool = False) -> None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            ids = [str(r["id"]) for r in cur.fetchall()]
    finally:
        conn.close()

    written = 0
    for ws_id in ids:
        if run_for_workspace(ws_id, target_week=target_week, force=force):
            written += 1
    print(f"\n[SUMMARY] gtm_content complete — {written}/{len(ids)} workspace(s) "
          f"got new drafts for week_of={target_week or iso_monday()}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate Douyin script drafts grounded in this week's "
                    "brief moves. Writes to content_recommendations."
    )
    parser.add_argument("--workspace-id", help="Single workspace UUID to process.")
    parser.add_argument("--all", action="store_true",
                        help="Process every workspace in the DB.")
    parser.add_argument("--week-of", help="Override target ISO Monday (YYYY-MM-DD). "
                                          "Default: this week's Monday (UTC).")
    parser.add_argument("--force", action="store_true",
                        help="Delete and regenerate even if drafts already exist for "
                             "this week. WARNING: this also wipes posted/dismissed.")
    args = parser.parse_args()

    target_week = None
    if args.week_of:
        try:
            target_week = datetime.strptime(args.week_of, "%Y-%m-%d").date()
            target_week = iso_monday(target_week)
        except ValueError:
            print(f"[ERROR] --week-of must be YYYY-MM-DD; got {args.week_of!r}")
            sys.exit(2)

    if args.all:
        run_for_all_workspaces(target_week=target_week, force=args.force)
    elif args.workspace_id:
        run_for_workspace(args.workspace_id, target_week=target_week, force=args.force)
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
