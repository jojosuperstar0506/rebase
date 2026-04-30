"""
Product opportunity pipeline.

Produces 1 product concept per workspace per ISO-week, grounded in this
week's brief moves + (when available) trending keyword signals + the
known competitor landscape. Writes to `product_opportunities`.

Why this exists:
    Section 4 of the Brief — "1 product concept to evaluate." The point
    is to push the user beyond reactive content into proactive product
    moves: where could you actually plant a flag in the next 3-12 months?
    The recommendation must be grounded in this week's competitive
    signals (otherwise it's just a generic "make a thing" prompt).

Pipeline order:
    Run AFTER brand_positioning_pipeline (reads weekly_briefs).

Inputs (from DB):
    workspaces.brand_name + brand_category + brand_price_range
    weekly_briefs.verdict + .moves (this week's row)
    analysis_results — latest 'keywords' metric, if a keywords row exists
        (used for "trending phrases" signals; gracefully degrades if absent)

Output (to DB):
    product_opportunities row matching ciMocks.ProductOpportunity:
        concept_name, positioning, why_now,
        signals (JSONB Array<{label, value}>),
        target_price, target_channels (TEXT[]), launch_timeline,
        status='proposed'

Idempotency:
    SKIP-IF-EXISTS — preserves user "accept" / "dismiss" state across
    daily cron runs. --force flag for explicit operator regen (deletes
    existing first, INCLUDING accepted/dismissed — use with care).

Honesty rules:
    1. The prompt forbids inventing signals. Each `signals[i].value` must
       reference a real number from the brief moves OR an explicit "estimate"
       label so the user knows what's data and what's hypothesis.
    2. concept_name and positioning must be specific (no "premium product").
    3. target_price must be a range (e.g., "¥499-699"), not a point estimate
       implying false precision.
    4. If no brief exists for this week, pipeline emits a SKIP message
       instead of fabricating a concept from a vacuum.

Usage:
    python -m services.competitor_intel.product_opportunity_pipeline --workspace-id UUID
    python -m services.competitor_intel.product_opportunity_pipeline --all
    python -m services.competitor_intel.product_opportunity_pipeline --all --force
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
TARGET_CONCEPTS_PER_RUN = 1
VALID_LAUNCH_TIMELINES = ("3-6个月", "6-9个月", "9-12个月", "12个月以上", "1-3个月")


def iso_monday(d: Optional[date] = None) -> date:
    d = d or datetime.now(timezone.utc).date()
    return d - timedelta(days=d.weekday())


# ─── DB readers ──────────────────────────────────────────────────────────────

def _load_workspace(cur, workspace_id: str) -> Optional[dict]:
    cur.execute(
        """
        SELECT id, brand_name, brand_category, brand_price_range
        FROM workspaces WHERE id = %s
        """,
        (workspace_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _load_brief(cur, workspace_id: str, week_of: date) -> Optional[dict]:
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


def _load_trending_keywords(cur, workspace_id: str) -> list:
    """
    Try to surface real keyword signals from the most-recent 'keywords'
    metric rows. Returns at most 8 (brand, keyword, score) tuples. Empty
    list when keyword pipeline hasn't run for this workspace — that's a
    legitimate state (e.g., Nike workspace, Douyin-only).
    """
    cur.execute(
        """
        SELECT competitor_name, raw_inputs
        FROM analysis_results
        WHERE workspace_id = %s
          AND metric_type = 'keywords'
          AND analyzed_at > NOW() - INTERVAL '30 days'
        ORDER BY analyzed_at DESC
        LIMIT 20
        """,
        (workspace_id,),
    )
    out = []
    for r in cur.fetchall():
        raw = r["raw_inputs"]
        if isinstance(raw, str):
            try:
                raw = json.loads(raw)
            except (json.JSONDecodeError, TypeError):
                raw = {}
        if not isinstance(raw, dict):
            continue
        # Common shapes: raw_inputs.top_keywords or raw_inputs.keywords or raw_inputs.terms
        kws = raw.get("top_keywords") or raw.get("keywords") or raw.get("terms") or []
        if not isinstance(kws, list):
            continue
        for k in kws[:3]:  # up to 3 per brand to keep prompt compact
            if isinstance(k, dict):
                term = k.get("term") or k.get("keyword") or k.get("text")
                score = k.get("score") or k.get("count") or k.get("frequency")
            else:
                term, score = str(k), None
            if term:
                out.append({"brand": r["competitor_name"], "term": str(term)[:30], "score": score})
            if len(out) >= 8:
                return out
    return out


def _count_existing_opportunities(cur, workspace_id: str, week_of: date) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM product_opportunities
        WHERE workspace_id = %s AND week_of = %s
        """,
        (workspace_id, week_of),
    )
    return int(cur.fetchone()["n"])


def _delete_existing_opportunities(cur, workspace_id: str, week_of: date) -> int:
    cur.execute(
        """
        DELETE FROM product_opportunities
        WHERE workspace_id = %s AND week_of = %s
        """,
        (workspace_id, week_of),
    )
    return cur.rowcount or 0


# ─── Prompt builder ──────────────────────────────────────────────────────────

def _format_moves_for_prompt(moves: list) -> str:
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
        lines.append(f"- [{mid}] ({impact}) {brand}：{headline}（{detail}）")
    return "\n".join(lines)


def _format_keywords_for_prompt(kws: list) -> str:
    if not kws:
        return "(本周缺少关键词数据 — 不要在 signals 中引用任何关键词数字)"
    lines = []
    for k in kws[:8]:
        score_part = f"，分值{k['score']}" if k.get("score") is not None else ""
        lines.append(f"- {k['brand']} 的关键词「{k['term']}」{score_part}")
    return "\n".join(lines)


def _build_prompt(workspace: dict, brief: dict, kws: list) -> str:
    brand = workspace.get("brand_name") or "(unnamed brand)"
    category = workspace.get("brand_category") or "未指定品类"
    price_range = workspace.get("brand_price_range") or {}
    if isinstance(price_range, str):
        try:
            price_range = json.loads(price_range)
        except (json.JSONDecodeError, TypeError):
            price_range = {}
    price_str = (
        f"¥{price_range.get('min', '?')}-{price_range.get('max', '?')}"
        if isinstance(price_range, dict) and (price_range.get("min") or price_range.get("max"))
        else "未指定"
    )

    verdict = brief["verdict"] or {}
    headline = verdict.get("headline") or ""
    sentence = verdict.get("sentence") or ""
    moves_block = _format_moves_for_prompt(brief["moves"])
    kw_block = _format_keywords_for_prompt(kws)

    return f"""你是一位为中国 {category} 类目品牌做产品策略的资深顾问。

我的品牌：{brand}（品类：{category}，当前价位带：{price_str}）

本周竞品 brief（这是你提建议的事实基础，不要编造其它数字）：
- 总结：{headline}
- 详情：{sentence}

本周的 moves：
{moves_block}

近 30 天的关键词信号（如果有）：
{kw_block}

请基于上面的真实数据，提一个**新产品概念**给 {brand} 评估。要求：

- concept_name：产品概念名（中文，≤20 字，具体不空泛 — 例如"轻量化复古通勤包"而非"高端产品"）
- positioning：1-2 句产品定位描述
- why_now：为什么本周/近期是切入这个机会的好时机（必须引用上面 moves 或关键词中的真实信号）
- signals：3-5 个支撑信号，每个是 {{label, value}}。每个 value 要么直接引用上面的真实数据（例如 "CASSILE 营销声量+17"、"Songmont 产品力-10"），要么用「估算」二字明示这是推断（例如 "估算：¥499-699 价位带空缺"）。**严禁编造未列出的搜索量百分比、销量数据、播放量等。**
- target_price：明确的价位区间（例如"¥499-699"），不要单点价格
- target_channels：2-3 个具体渠道，从这些里挑：「小红书种草」「天猫旗舰店」「抖音达人测评」「私域复购」「线下快闪」「品牌联名」「直播首发」
- launch_timeline：必须从 ["1-3个月", "3-6个月", "6-9个月", "9-12个月", "12个月以上"] 中选一个

整体原则：
- 概念必须能从今天的 brief 直接推导出来 — 用户读完应该能说"对，这正好接上了我们这周看到的事"。
- 价位、品类必须和 {brand} 的当前定位有合理过渡。不要建议一个 ¥3000 的奢侈品系列给一个 ¥300-500 的品牌。
- 中文（简体）。

严格按以下 JSON 输出，不要任何 markdown 包裹：
{{
  "concept_name": "...",
  "positioning": "...",
  "why_now": "...",
  "signals": [
    {{"label": "...", "value": "..."}},
    {{"label": "...", "value": "..."}},
    {{"label": "...", "value": "..."}}
  ],
  "target_price": "...",
  "target_channels": ["...", "..."],
  "launch_timeline": "..."
}}"""


# ─── Response parsing ────────────────────────────────────────────────────────

def _strip_markdown_fence(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0]
    return raw.strip()


def _coerce_signals(s) -> list:
    if not isinstance(s, list):
        return []
    out = []
    for item in s:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        value = str(item.get("value") or "").strip()
        if not label or not value:
            continue
        out.append({"label": label[:60], "value": value[:200]})
        if len(out) >= 6:
            break
    return out


def _coerce_channels(c) -> list:
    if not isinstance(c, list):
        return []
    out = []
    for item in c:
        if not isinstance(item, str):
            continue
        item = item.strip()
        if item:
            out.append(item[:40])
        if len(out) >= 5:
            break
    return out


def _coerce_concept(d: dict) -> Optional[dict]:
    if not isinstance(d, dict):
        return None
    name = str(d.get("concept_name") or "").strip()
    positioning = str(d.get("positioning") or "").strip()
    why_now = str(d.get("why_now") or "").strip()
    if not (name and positioning and why_now):
        return None
    signals = _coerce_signals(d.get("signals"))
    if len(signals) < 1:
        # A concept with zero signals fails the integrity rule (cite real data).
        return None
    timeline = str(d.get("launch_timeline") or "").strip()
    if timeline not in VALID_LAUNCH_TIMELINES:
        timeline = "3-6个月"  # safe default rather than rejecting
    return {
        "concept_name":    name[:60],
        "positioning":     positioning[:300],
        "why_now":         why_now[:400],
        "signals":         signals,
        "target_price":    str(d.get("target_price") or "").strip()[:60],
        "target_channels": _coerce_channels(d.get("target_channels")),
        "launch_timeline": timeline,
    }


def _parse_concept_json(raw: str) -> Optional[dict]:
    try:
        data = json.loads(_strip_markdown_fence(raw))
    except (json.JSONDecodeError, TypeError):
        return None
    return _coerce_concept(data)


# ─── DB writer ───────────────────────────────────────────────────────────────

def _insert_concept(cur, workspace_id: str, week_of: date, concept: dict) -> None:
    cur.execute(
        """
        INSERT INTO product_opportunities (
            workspace_id, week_of,
            concept_name, positioning, why_now,
            signals, target_price, target_channels, launch_timeline,
            status
        ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, 'proposed')
        """,
        (
            workspace_id, week_of,
            concept["concept_name"], concept["positioning"], concept["why_now"],
            json.dumps(concept["signals"], ensure_ascii=False),
            concept["target_price"],
            concept["target_channels"],
            concept["launch_timeline"],
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

            existing = _count_existing_opportunities(cur, workspace_id, week_of)
            if existing > 0 and not force:
                print(f"[SKIP] {brand_name}: {existing} opportunit(ies) already exist for "
                      f"week {week_of} (use --force to regenerate)")
                return False
            if existing > 0 and force:
                deleted = _delete_existing_opportunities(cur, workspace_id, week_of)
                print(f"  [FORCE] {brand_name}: deleted {deleted} existing opportunities")

            kws = _load_trending_keywords(cur, workspace_id)
            prompt = _build_prompt(workspace, brief, kws)

            print(f"[OPPORTUNITY] {brand_name} ({workspace_id[:8]}) — week_of={week_of} "
                  f"moves={len(brief['moves'])} keywords={len(kws)}")

            try:
                raw = _call_llm(prompt, LLM_CONFIG["synthesis_model"], max_tokens=1500)
            except Exception as e:
                print(f"  [WARN] LLM call failed: {e}")
                conn.rollback()
                return False

            concept = _parse_concept_json(raw)
            if not concept:
                print("  [WARN] LLM response unparseable — no opportunity generated")
                print(f"  [DEBUG] raw response (first 400 chars): {raw[:400]}")
                conn.rollback()
                return False

            _insert_concept(cur, workspace_id, week_of, concept)
            conn.commit()
            print(f"  [DONE] concept={concept['concept_name']!r} "
                  f"price={concept['target_price']} "
                  f"timeline={concept['launch_timeline']} "
                  f"signals={len(concept['signals'])} "
                  f"channels={len(concept['target_channels'])}")
            return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] product_opportunity failed for {workspace_id}: {e}")
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
    print(f"\n[SUMMARY] product_opportunity complete — {written}/{len(ids)} workspace(s) "
          f"got new concept(s) for week_of={target_week or iso_monday()}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate 1 product concept per workspace per ISO-week, "
                    "grounded in this week's brief moves and keyword signals."
    )
    parser.add_argument("--workspace-id", help="Single workspace UUID to process.")
    parser.add_argument("--all", action="store_true",
                        help="Process every workspace in the DB.")
    parser.add_argument("--week-of", help="Override target ISO Monday (YYYY-MM-DD). "
                                          "Default: this week's Monday (UTC).")
    parser.add_argument("--force", action="store_true",
                        help="Delete and regenerate even if opportunities already exist. "
                             "WARNING: this also wipes accepted/dismissed status.")
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
