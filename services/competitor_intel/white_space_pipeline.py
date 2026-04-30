"""
White space opportunity pipeline.

Produces 2-4 white-space opportunities per workspace per ISO-week. Each
opportunity identifies a *specific* uncontested area: a dimension where
no competitor leads, a pricing gap, an underutilized keyword, or a
neglected channel. Writes to `white_space_opportunities`.

Why this exists:
    Section §B of the Analytics tab. Where the Brief tells the user
    what's *happening*, white space tells the user where the *un-
    contested ground* is. Dashboards are table stakes; white space is
    the differentiating output Rebase makes that competitors don't.

Pipeline order:
    Run AFTER brand_positioning_pipeline + domain_aggregation_pipeline.
    Reads weekly_briefs (for context) + analysis_results domain rollups
    (for the "where is no one leading?" query).

Inputs (from DB):
    workspaces.brand_name + brand_category
    weekly_briefs.verdict + .moves
    analysis_results — latest 3 domain rollup scores per competitor
        (consumer_domain / product_domain / marketing_domain). This is
        the primary data source for *dimension*-category white spaces.
    Optional: 'keywords' rows for keyword-category white spaces.

Output (to DB):
    white_space_opportunities rows (2-4 per workspace per week) matching
    ciMocks.WhiteSpace:
        title, summary, category in {dimension|pricing|keyword|channel},
        opportunity_score (0-100), reasoning,
        supporting_data (JSONB Array<{label, value, source_url?}>),
        suggested_action

Idempotency:
    SKIP-IF-EXISTS at the (workspace_id, week_of) level. White spaces
    have no user-mutable status today, but adding a "dismiss" mutation
    later is plausible — same discipline as other Day-2 pipelines.
    --force flag for explicit operator regen.

Honesty rules:
    1. Each opportunity's supporting_data must cite real numbers — the
       prompt forbids inventing scores.
    2. opportunity_score is 0-100 — it's the model's confidence, not a
       data point. Coerced to int and clamped.
    3. category must be one of the 4 allowed values; out-of-range
       values are coerced to 'dimension' (the most data-supported
       category for V1).
    4. Pricing-category and channel-category opportunities are LESS
       reliable for V1 (we don't have great pricing or channel data
       yet). The prompt is biased toward dimension + keyword.

Usage:
    python -m services.competitor_intel.white_space_pipeline --workspace-id UUID
    python -m services.competitor_intel.white_space_pipeline --all
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
TARGET_OPP_COUNT_MIN = 2
TARGET_OPP_COUNT_MAX = 4

VALID_CATEGORIES = ("dimension", "pricing", "keyword", "channel")

DOMAIN_KEYS = ("consumer_domain", "product_domain", "marketing_domain")
DOMAIN_LABELS_ZH = {
    "consumer_domain":  "消费者心智",
    "product_domain":   "产品力",
    "marketing_domain": "营销声量",
}


def iso_monday(d: Optional[date] = None) -> date:
    d = d or datetime.now(timezone.utc).date()
    return d - timedelta(days=d.weekday())


# ─── DB readers ──────────────────────────────────────────────────────────────

def _load_workspace(cur, workspace_id: str) -> Optional[dict]:
    cur.execute(
        "SELECT id, brand_name, brand_category FROM workspaces WHERE id = %s",
        (workspace_id,),
    )
    row = cur.fetchone()
    return dict(row) if row else None


def _load_brief(cur, workspace_id: str, week_of: date) -> Optional[dict]:
    cur.execute(
        """
        SELECT verdict, moves FROM weekly_briefs
        WHERE workspace_id = %s AND week_of = %s LIMIT 1
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


def _load_domain_scores(cur, workspace_id: str) -> dict:
    """{competitor_name: {domain_key: score}} for the latest rollup row each."""
    cur.execute(
        """
        SELECT DISTINCT ON (competitor_name, metric_type)
            competitor_name, metric_type, score
        FROM analysis_results
        WHERE workspace_id = %s
          AND metric_type = ANY(%s)
        ORDER BY competitor_name, metric_type, analyzed_at DESC
        """,
        (workspace_id, list(DOMAIN_KEYS)),
    )
    out: dict = {}
    for r in cur.fetchall():
        out.setdefault(r["competitor_name"], {})[r["metric_type"]] = float(r["score"])
    return out


def _count_existing(cur, workspace_id: str, week_of: date) -> int:
    cur.execute(
        """
        SELECT COUNT(*) AS n FROM white_space_opportunities
        WHERE workspace_id = %s AND week_of = %s
        """,
        (workspace_id, week_of),
    )
    return int(cur.fetchone()["n"])


def _delete_existing(cur, workspace_id: str, week_of: date) -> int:
    cur.execute(
        """
        DELETE FROM white_space_opportunities
        WHERE workspace_id = %s AND week_of = %s
        """,
        (workspace_id, week_of),
    )
    return cur.rowcount or 0


# ─── Domain stats — drives the "dimension" white spaces ──────────────────────

def _domain_stats(scores: dict) -> dict:
    """
    Per-domain summary: max competitor score + which brand holds it +
    spread (max - min). Used to feed the prompt and to give dimension
    opportunities a defensible numeric score.
    """
    out = {}
    for key in DOMAIN_KEYS:
        per_brand = [(b, d.get(key)) for b, d in scores.items() if d.get(key) is not None]
        per_brand = [(b, s) for b, s in per_brand if s > 0]
        if not per_brand:
            out[key] = None
            continue
        per_brand.sort(key=lambda x: x[1], reverse=True)
        leader, leader_score = per_brand[0]
        trailing_score = per_brand[-1][1]
        out[key] = {
            "leader":         leader,
            "leader_score":   leader_score,
            "trailing_score": trailing_score,
            "spread":         leader_score - trailing_score,
            "competitor_n":   len(per_brand),
        }
    return out


# ─── Prompt builder ──────────────────────────────────────────────────────────

def _format_moves_for_prompt(moves: list) -> str:
    if not moves:
        return "(本周没有显著事件)"
    return "\n".join(
        f"- [{m.get('id') or '?'}] ({m.get('impact') or 'medium'}) "
        f"{m.get('brand') or '?'}：{m.get('headline') or ''}"
        for m in moves if isinstance(m, dict)
    )


def _format_domain_stats_for_prompt(stats: dict) -> str:
    lines = []
    for key in DOMAIN_KEYS:
        s = stats.get(key)
        label = DOMAIN_LABELS_ZH[key]
        if not s:
            lines.append(f"- {label}：(无数据)")
            continue
        lines.append(
            f"- {label}：最高 {s['leader']}={s['leader_score']:.0f}，"
            f"最低 {s['trailing_score']:.0f}，价差 {s['spread']:.0f}，"
            f"共 {s['competitor_n']} 家有数据"
        )
    return "\n".join(lines)


def _build_prompt(workspace: dict, brief: dict, stats: dict) -> str:
    brand = workspace.get("brand_name") or "(unnamed brand)"
    category = workspace.get("brand_category") or "未指定品类"

    verdict = brief["verdict"] or {}
    headline = verdict.get("headline") or ""
    moves_block = _format_moves_for_prompt(brief["moves"])
    stats_block = _format_domain_stats_for_prompt(stats)

    return f"""你是一位为中国 {category} 品牌做战略分析的资深竞争情报顾问。

我的品牌：{brand}（品类：{category}）

本周竞争 brief：
- 总结：{headline}
- moves：
{moves_block}

三大维度的竞争分布（只列有数据的）：
{stats_block}

请基于上面的真实数据，识别 2-4 个 **white space**（市场空白点）—— {brand} 可以切入但目前没有竞争对手主导的位置。每个 white space 必须落在以下 category 之一：

- **dimension**：12 个评估维度中某个被忽视的（例如 "消费者心智维度本周没有明确领头羊"）
- **pricing**：某个价位带没有直接竞品
- **keyword**：某个搜索关键词或 hashtag 暂无品牌占据
- **channel**：某个平台/渠道竞品都没在用（小红书 / 抖音 / B站 / 视频号 / 私域）

V1 数据条件：
- dimension category 数据最充分 — 优先生成
- pricing / channel 数据有限 — 只在你**确实**能从上面的真实数据里推出有把握的判断时才用
- keyword category 在没有关键词数据时也别强行使用

每个 white space 必须包含：
- title（≤25 字，具体 — "消费者心智维度领头羊缺位" 而非 "消费者心智机会"）
- summary（1-2 句解释这块空白具体在哪、为什么是空白）
- category（必须是 dimension / pricing / keyword / channel 之一）
- opportunity_score（0-100 整数，反映你对这个机会的把握度。≥70 = 高把握；50-70 = 中等；<50 = 弱）
- reasoning（2-3 句战略推理，必须引用上面的真实数据）
- supporting_data：2-4 条 {{label, value}} 对，**每个 value 必须引用上面真实数据中的具体数字或品牌名**。严禁编造。
- suggested_action（1 句具体行动建议）

数量：2-4 条。质量优先于数量 — 如果你只能写出 2 条有真实数据支撑的，就只写 2 条，不要凑数。

严格按以下 JSON 输出，不要任何 markdown 包裹：
{{
  "opportunities": [
    {{
      "title": "...",
      "summary": "...",
      "category": "dimension",
      "opportunity_score": 75,
      "reasoning": "...",
      "supporting_data": [
        {{"label": "...", "value": "..."}},
        {{"label": "...", "value": "..."}}
      ],
      "suggested_action": "..."
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


def _coerce_supporting_data(s) -> list:
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
        entry = {"label": label[:60], "value": value[:200]}
        url = item.get("source_url")
        if isinstance(url, str) and url.startswith(("http://", "https://")):
            entry["source_url"] = url[:300]
        out.append(entry)
        if len(out) >= 6:
            break
    return out


def _coerce_opportunity_score(v) -> int:
    """Clamp to [0, 100], integer."""
    try:
        n = int(round(float(v)))
    except (TypeError, ValueError):
        return 50
    return max(0, min(100, n))


def _coerce_opportunity(o: dict) -> Optional[dict]:
    if not isinstance(o, dict):
        return None
    title = str(o.get("title") or "").strip()
    summary = str(o.get("summary") or "").strip()
    if not (title and summary):
        return None
    cat = o.get("category") or "dimension"
    if cat not in VALID_CATEGORIES:
        cat = "dimension"
    supporting = _coerce_supporting_data(o.get("supporting_data"))
    if len(supporting) < 1:
        # Integrity rule: every white space MUST cite real data.
        return None
    return {
        "title":             title[:80],
        "summary":           summary[:400],
        "category":          cat,
        "opportunity_score": _coerce_opportunity_score(o.get("opportunity_score")),
        "reasoning":         str(o.get("reasoning") or "").strip()[:500],
        "supporting_data":   supporting,
        "suggested_action":  str(o.get("suggested_action") or "").strip()[:300],
    }


def _parse_opportunities_json(raw: str) -> list:
    try:
        data = json.loads(_strip_markdown_fence(raw))
    except (json.JSONDecodeError, TypeError):
        return []
    if not isinstance(data, dict):
        return []
    items = data.get("opportunities") or []
    if not isinstance(items, list):
        return []
    out = []
    for o in items[:TARGET_OPP_COUNT_MAX]:
        coerced = _coerce_opportunity(o)
        if coerced:
            out.append(coerced)
    return out


# ─── DB writer ───────────────────────────────────────────────────────────────

def _insert_opportunity(cur, workspace_id: str, week_of: date, opp: dict) -> None:
    cur.execute(
        """
        INSERT INTO white_space_opportunities (
            workspace_id, week_of,
            title, summary, category,
            opportunity_score, reasoning, supporting_data, suggested_action
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s)
        """,
        (
            workspace_id, week_of,
            opp["title"], opp["summary"], opp["category"],
            opp["opportunity_score"],
            opp["reasoning"],
            json.dumps(opp["supporting_data"], ensure_ascii=False),
            opp["suggested_action"],
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
            if not brief:
                print(f"[SKIP] {brand_name}: no brief for week {week_of} — "
                      f"run brand_positioning_pipeline first")
                return False

            scores = _load_domain_scores(cur, workspace_id)
            if not scores:
                print(f"[SKIP] {brand_name}: no domain rollup scores — "
                      f"run domain_aggregation_pipeline first")
                return False

            existing = _count_existing(cur, workspace_id, week_of)
            if existing > 0 and not force:
                print(f"[SKIP] {brand_name}: {existing} white space(s) already exist "
                      f"for week {week_of} (use --force to regenerate)")
                return False
            if existing > 0 and force:
                deleted = _delete_existing(cur, workspace_id, week_of)
                print(f"  [FORCE] {brand_name}: deleted {deleted} existing white spaces")

            stats = _domain_stats(scores)
            prompt = _build_prompt(workspace, brief, stats)

            print(f"[WHITESPACE] {brand_name} ({workspace_id[:8]}) — week_of={week_of} "
                  f"competitors={len(scores)} domains_with_data="
                  f"{sum(1 for s in stats.values() if s)}")

            try:
                raw = _call_llm(prompt, LLM_CONFIG["synthesis_model"], max_tokens=2200)
            except Exception as e:
                print(f"  [WARN] LLM call failed: {e}")
                conn.rollback()
                return False

            opps = _parse_opportunities_json(raw)
            if not opps:
                print("  [WARN] LLM response unparseable — no white spaces generated")
                print(f"  [DEBUG] raw response (first 400 chars): {raw[:400]}")
                conn.rollback()
                return False
            if len(opps) < TARGET_OPP_COUNT_MIN:
                print(f"  [INFO] only {len(opps)} valid white space(s) parsed "
                      f"(target ≥{TARGET_OPP_COUNT_MIN}) — proceeding with what we have")

            for opp in opps:
                _insert_opportunity(cur, workspace_id, week_of, opp)
            conn.commit()

            for i, opp in enumerate(opps, 1):
                print(f"  [DONE] #{i} [{opp['category']}] "
                      f"score={opp['opportunity_score']} "
                      f"title={opp['title']!r} "
                      f"data_points={len(opp['supporting_data'])}")
            return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] white_space failed for {workspace_id}: {e}")
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
    print(f"\n[SUMMARY] white_space complete — {written}/{len(ids)} workspace(s) "
          f"got opportunities for week_of={target_week or iso_monday()}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate 2-4 white space opportunities per workspace per "
                    "ISO-week, grounded in domain rollup scores + brief moves."
    )
    parser.add_argument("--workspace-id", help="Single workspace UUID to process.")
    parser.add_argument("--all", action="store_true",
                        help="Process every workspace in the DB.")
    parser.add_argument("--week-of", help="Override target ISO Monday (YYYY-MM-DD). "
                                          "Default: this week's Monday (UTC).")
    parser.add_argument("--force", action="store_true",
                        help="Delete and regenerate existing rows for this week.")
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
