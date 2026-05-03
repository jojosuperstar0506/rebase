"""
Brand positioning pipeline (writes weekly_briefs.verdict + .moves).

Produces ONE row per (workspace, ISO-week) — the Brief's verdict card
("are we winning or losing?") plus 3 moves ("what shifted this week"),
both grounded in the latest domain rollup scores from analysis_results.

Why this exists:
    The Brief page (/ci) is the product. Sections 1+2 — verdict and moves
    — are produced HERE. Sections 3+4 (content drafts, product opportunity)
    are produced by gtm_content_pipeline / product_opportunity_pipeline,
    which read this brief's row to ground their own outputs.

Pipeline order:
    Run AFTER domain_aggregation_pipeline (which writes consumer_domain,
    product_domain, marketing_domain into analysis_results). This pipeline
    needs those rollups as its input.

Inputs (from DB):
    workspaces.brand_name, brand_category, brand_price_range
    workspace_competitors.brand_name (the tracked set)
    analysis_results — latest rollup score per (competitor × domain)
    analysis_results — same rollups from ≥7 days ago (for WoW deltas)

Output (to DB):
    weekly_briefs(workspace_id, week_of, verdict JSONB, moves JSONB)
    UPSERT on the (workspace_id, week_of) unique key — daily reruns just
    refresh the JSONB. Old briefs from past weeks are preserved.

Honesty rules (do not violate):
    1. If domain rollups are missing → emit a baseline brief that says so;
       do NOT invent scores.
    2. If <2 weeks of history exists → moves must NOT claim WoW deltas.
       Acceptable: "Week 1 baseline established."
    3. The LLM prompt explicitly forbids inventing competitor names or
       data points. Only the brands and scores passed in may be referenced.

Usage:
    python -m services.competitor_intel.brand_positioning_pipeline --workspace-id UUID
    python -m services.competitor_intel.brand_positioning_pipeline --all
"""

import argparse
import json
import re
import sys
import traceback
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from .db_bridge import get_conn
from .narrative_pipeline import LLM_CONFIG, _call_llm

METRIC_VERSION = "v1.1"  # bumped: numeric-coherence coercer drops moves with hallucinated specifics

DOMAIN_KEYS = ("consumer_domain", "product_domain", "marketing_domain")
DOMAIN_LABELS = {
    "zh": {
        "consumer_domain":  "消费者心智",
        "product_domain":   "产品力",
        "marketing_domain": "营销声量",
    },
    "en": {
        "consumer_domain":  "Consumer Mindshare",
        "product_domain":   "Product Strength",
        "marketing_domain": "Marketing Voice",
    },
}
DOMAIN_LABELS_ZH = DOMAIN_LABELS["zh"]

VALID_TRENDS = ("gaining", "steady", "losing")
VALID_IMPACTS = ("high", "medium", "low")
ALLOWED_ICONS = ("🚀", "⚠️", "📉", "📈", "🎯", "✨", "📊", "💡")
DEFAULT_ICON_BY_IMPACT = {"high": "⚠️", "medium": "📊", "low": "💡"}

# Minimum history span (days) before we even attempt to talk about deltas.
# Below this, every move is framed as a baseline observation.
DELTA_HISTORY_MIN_DAYS = 7


# ─── Date helpers ────────────────────────────────────────────────────────────

def iso_monday(d: Optional[date] = None) -> date:
    """Return the ISO-week Monday for `d` (default: today UTC)."""
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


def _load_latest_domain_scores(cur, workspace_id: str) -> dict:
    """
    Return {competitor_name: {domain_key: score}} using the most recent
    analysis_results row per (brand × domain). Brands without any rollup
    rows are simply absent; downstream code treats absent as "no data".
    """
    cur.execute(
        """
        SELECT DISTINCT ON (competitor_name, metric_type)
            competitor_name, metric_type, score, analyzed_at
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


def _load_prior_domain_scores(cur, workspace_id: str, before: date) -> dict:
    """
    Same shape as _load_latest_domain_scores but constrained to rows
    written BEFORE the given date (used for WoW delta detection).
    """
    cur.execute(
        """
        SELECT DISTINCT ON (competitor_name, metric_type)
            competitor_name, metric_type, score, analyzed_at
        FROM analysis_results
        WHERE workspace_id = %s
          AND metric_type = ANY(%s)
          AND analyzed_at < %s
        ORDER BY competitor_name, metric_type, analyzed_at DESC
        """,
        (workspace_id, list(DOMAIN_KEYS), before),
    )
    out: dict = {}
    for r in cur.fetchall():
        out.setdefault(r["competitor_name"], {})[r["metric_type"]] = float(r["score"])
    return out


def _earliest_score_age_days(cur, workspace_id: str) -> Optional[int]:
    """
    Days since the OLDEST analysis_results row for this workspace.
    Used to gate "can we honestly compute WoW deltas yet?"
    None when no rows exist at all.
    """
    cur.execute(
        """
        SELECT MIN(analyzed_at) AS oldest
        FROM analysis_results
        WHERE workspace_id = %s
        """,
        (workspace_id,),
    )
    row = cur.fetchone()
    if not row or not row["oldest"]:
        return None
    delta = datetime.now(timezone.utc) - row["oldest"]
    return delta.days


# ─── Prompt builder ──────────────────────────────────────────────────────────

def _format_competitor_block(scores_now: dict, scores_prev: dict, has_history: bool) -> str:
    """Pretty-print competitor scores for the prompt; include WoW deltas only when honest."""
    lines = []
    for brand, domains in sorted(scores_now.items()):
        parts = [brand]
        for key in DOMAIN_KEYS:
            label = DOMAIN_LABELS_ZH[key]
            now = domains.get(key)
            if now is None:
                parts.append(f"{label}=N/A")
                continue
            if has_history:
                prev = scores_prev.get(brand, {}).get(key)
                if prev is not None:
                    delta = now - prev
                    sign = "+" if delta >= 0 else ""
                    parts.append(f"{label}={now:.0f} ({sign}{delta:.0f})")
                    continue
            parts.append(f"{label}={now:.0f}")
        lines.append("- " + "; ".join(parts))
    return "\n".join(lines) if lines else "(no competitor data yet)"


def _build_prompt(workspace: dict, scores_now: dict, scores_prev: dict,
                  has_history: bool) -> str:
    brand = workspace.get("brand_name") or "(unnamed brand)"
    category = workspace.get("brand_category") or "未指定品类"
    competitor_block = _format_competitor_block(scores_now, scores_prev, has_history)

    history_clause = (
        "本周 vs 上周的分数差已在每个竞品括号中标注（+/-N 即变化幅度）。"
        if has_history else
        "目前为首次或第二次快照——还没有可靠的环比数据。"
        "在 verdict 和 moves 中必须明确说明这是基线（baseline），不要伪造任何变化值。"
    )

    return f"""你是一名为中国 {category} 类目品牌服务的资深竞争情报分析师。

我的品牌：{brand}（品类：{category}）

我正在追踪的竞品在三大维度（消费者心智 / 产品力 / 营销声量）的最新得分：
{competitor_block}

{history_clause}

请基于上述真实数据（不要编造任何未列出的品牌、数字或事件），生成本周 Brief：

1. verdict（裁决）：
   - headline：一行总结本周竞争态势的中文金句（≤30 字）
   - sentence：1-2 句详细解读，引用上面真实数据中的关键分数或品牌名
   - trend：必须从 ["gaining", "steady", "losing"] 中三选一
   - top_action：一条"如果本周只做一件事"的具体建议（≤40 字，可执行）

2. moves（最多 3 个事件，按重要性排序）：
   每个 move 必须包含：
   - id：m1 / m2 / m3
   - brand：必须是上面真实出现过的品牌名（或 "{brand}"，或 "市场" 表示行业整体）
   - icon：从这些表情中选一个 ["🚀","⚠️","📉","📈","🎯","✨","📊","💡"]
   - headline：≤25 字标题
   - detail：一行真实数据证据（必须引用上述某条数字）
   - so_what：一句解释为什么这件事对 {brand} 重要
   - action：一句下一步建议
   - impact：必须从 ["high", "medium", "low"] 中三选一

如果数据不足（例如只有 1-2 个竞品有得分，或处于基线状态），就少输出 moves 也可以——
诚实优先于补满 3 条。可以输出 0-3 条 moves。

严格按以下 JSON 输出，不要任何 markdown 包裹、不要解释、不要多余字段：
{{
  "verdict": {{
    "headline": "...",
    "sentence": "...",
    "trend": "steady",
    "top_action": "..."
  }},
  "moves": [
    {{"id": "m1", "brand": "...", "icon": "🚀", "headline": "...", "detail": "...", "so_what": "...", "action": "...", "impact": "high"}}
  ]
}}"""


# ─── LLM response parsing ────────────────────────────────────────────────────

def _strip_markdown_fence(raw: str) -> str:
    """LLMs sometimes wrap JSON in ```json fences; strip them."""
    raw = raw.strip()
    if raw.startswith("```"):
        # drop first line (``` or ```json), drop trailing ``` line
        raw = raw.split("\n", 1)[1] if "\n" in raw else raw[3:]
        raw = raw.rsplit("```", 1)[0]
    return raw.strip()


def _coerce_verdict(v: dict) -> dict:
    headline = str(v.get("headline") or "").strip() or "本周快照"
    sentence = str(v.get("sentence") or "").strip()
    trend = v.get("trend") or "steady"
    if trend not in VALID_TRENDS:
        trend = "steady"
    top_action = str(v.get("top_action") or "").strip()
    return {
        "headline": headline[:120],
        "sentence": sentence[:600],
        "trend": trend,
        "top_action": top_action[:200],
    }


def _coerce_move(m: dict, idx: int, allowed_brands: set, own_brand: str) -> Optional[dict]:
    headline = str(m.get("headline") or "").strip()
    if not headline:
        return None
    impact = m.get("impact") or "medium"
    if impact not in VALID_IMPACTS:
        impact = "medium"
    icon = m.get("icon")
    if icon not in ALLOWED_ICONS:
        icon = DEFAULT_ICON_BY_IMPACT[impact]
    brand = str(m.get("brand") or own_brand).strip()
    # Allow own brand, "市场"/"market" alias, or any tracked competitor.
    # If the LLM hallucinated a brand we don't track, normalize to "市场" so
    # the user never sees a fictional name as the source of truth.
    if brand not in allowed_brands and brand not in (own_brand, "市场", "market", "Market"):
        brand = "市场"
    return {
        "id": str(m.get("id") or f"m{idx + 1}"),
        "brand": brand,
        "icon": icon,
        "headline": headline[:80],
        "detail": str(m.get("detail") or "").strip()[:300],
        "so_what": str(m.get("so_what") or "").strip()[:300],
        "action": str(m.get("action") or "").strip()[:200],
        "impact": impact,
    }


# ─── Numeric-coherence coercer ───────────────────────────────────────────────
# DeepSeek occasionally fabricates specific numbers in move text — e.g.
# "from 82 to 72" when 82 doesn't appear anywhere in the source data, or
# "Songmont 心智 -13" when the actual delta is -25. The verdict + moves
# array gets parsed first; THEN we audit each move's prose against the
# set of numbers the LLM was actually given. Moves with unsupported
# specifics are dropped — losing one move beats shipping a wrong number,
# because customer trust dies on the first obvious factual error.
#
# Tolerance: ±1 covers LLM rounding artifacts (79.5 → 80 vs 79 in prose)
# without masking 2-point fabrications (e.g. Joanna's "from 82 to 72" when
# the real prev was 80). Wider tolerances let bad numbers slip through.
#
# _PROSE_WHITELIST is intentionally tiny — only really-round numbers used
# for emphasis (50, 75, 100). Smaller round numbers (10, 20, 25) collide
# with real delta values and would let hallucinated deltas escape.

_NUMBER_PATTERN = re.compile(r'(?<![A-Za-z\d])([+\-]?\d{2,3})(?![A-Za-z\d])')

# Drop a move if it has THIS MANY unsupported numbers. 1 is strict but
# matches Joanna's example (single bad citation). Bump to 2 if the
# coercer becomes too aggressive in production.
_DROP_THRESHOLD_UNSUPPORTED = 1

_PROSE_WHITELIST = frozenset({50, 75, 100})


def _collect_supported_numbers(scores_now: dict, scores_prev: dict) -> set:
    """
    Build the set of integer values the LLM was actually shown in the prompt.
    Includes: rounded current scores, rounded previous scores, rounded deltas
    (signed and absolute). Anything else the LLM cites is suspicious.
    """
    supported: set = set()
    for brand_scores in scores_now.values():
        for v in brand_scores.values():
            if v is not None:
                supported.add(int(round(v)))
    for brand_scores in scores_prev.values():
        for v in brand_scores.values():
            if v is not None:
                supported.add(int(round(v)))
    # Add deltas the LLM is shown in the competitor block.
    for brand, now_scores in scores_now.items():
        prev_scores = scores_prev.get(brand, {})
        for k, now_v in now_scores.items():
            if now_v is None:
                continue
            prev_v = prev_scores.get(k)
            if prev_v is None:
                continue
            d = int(round(now_v - prev_v))
            supported.add(d)
            supported.add(abs(d))
    # Whitelist common round numbers used in prose (50%, 100%, etc.)
    supported.update(_PROSE_WHITELIST)
    return supported


def _audit_move_numbers(move: dict, supported: set, tolerance: int = 1) -> list:
    """
    Return the list of unsupported numeric strings cited in this move's prose.
    A number is supported if it (or its absolute value) is within `tolerance`
    of any value in `supported`. Whitelisted round numbers always pass.
    """
    text_parts = [
        _zh_text(move.get("headline")),
        _zh_text(move.get("detail")),
        _zh_text(move.get("so_what")),
        _zh_text(move.get("action")),
    ]
    text = " | ".join(text_parts)
    unsupported = []
    for raw in _NUMBER_PATTERN.findall(text):
        try:
            n = int(raw)
        except ValueError:
            continue
        # Skip year-like / count-like 4+ digit values handled by regex bounds anyway.
        # Check direct + tolerance + signed-abs-tolerance match.
        if any(abs(n - s) <= tolerance for s in supported):
            continue
        if any(abs(abs(n) - s) <= tolerance for s in supported):
            continue
        unsupported.append(raw)
    return unsupported


def _parse_brief_json(raw: str, allowed_brands: set, own_brand: str) -> Optional[dict]:
    try:
        data = json.loads(_strip_markdown_fence(raw))
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(data, dict):
        return None
    verdict = data.get("verdict")
    if not isinstance(verdict, dict):
        return None
    moves_in = data.get("moves") or []
    if not isinstance(moves_in, list):
        moves_in = []
    moves_out = []
    for i, m in enumerate(moves_in[:3]):
        if not isinstance(m, dict):
            continue
        coerced = _coerce_move(m, i, allowed_brands, own_brand)
        if coerced:
            moves_out.append(coerced)
    return {
        "verdict": _coerce_verdict(verdict),
        "moves":   moves_out,
    }


# ─── Honest fallbacks ────────────────────────────────────────────────────────

def _baseline_brief(brand_name: str, reason: str) -> dict:
    """
    Used when (a) domain rollups don't exist yet, (b) the LLM call fails,
    or (c) the LLM output couldn't be parsed. Always honest — never fabricates
    a verdict tone the data doesn't support.
    """
    return {
        "verdict": {
            "headline": f"{brand_name} 本周基线已建立",
            "sentence": (
                "已完成首次（或近期）数据快照。"
                "下周回来即可看到环比变化与具体的竞争事件。"
            ),
            "trend": "steady",
            "top_action": "在「品牌设置」中确认追踪的竞品名单是否完整。",
        },
        "moves": [],
        "_raw_inputs": {"reason": reason, "fallback": True},
    }


# ─── Bilingual translation layer ────────────────────────────────────────
# Pattern: generate Chinese (DeepSeek's strength), parse/coerce, then
# translate all text fields to English in one batch LLM call. Store each
# text field as {"zh": "原文", "en": "translated"}. The backend resolves
# the right language via ?lang= query param.

_BRIEF_TEXT_FIELDS_VERDICT = ("headline", "sentence", "top_action")
_BRIEF_TEXT_FIELDS_MOVE = ("headline", "detail", "so_what", "action")


def _zh_text(val) -> str:
    """Extract a plain Chinese string from either a raw string or a {zh, en} dict."""
    if isinstance(val, dict):
        return val.get("zh") or val.get("en") or ""
    return str(val) if val else ""


def _collect_translatable_texts(brief: dict) -> list:
    """Gather all unique text strings that need translation."""
    texts = []
    v = brief.get("verdict") or {}
    for f in _BRIEF_TEXT_FIELDS_VERDICT:
        t = _zh_text(v.get(f))
        if t and t not in texts:
            texts.append(t)
    for m in brief.get("moves") or []:
        for f in _BRIEF_TEXT_FIELDS_MOVE:
            t = _zh_text(m.get(f))
            if t and t not in texts:
                texts.append(t)
    return texts


def _build_translation_prompt(texts: list) -> str:
    numbered = "\n".join(f"{i+1}. {t}" for i, t in enumerate(texts))
    return f"""Translate each numbered Chinese sentence below into fluent English.
Return ONLY a JSON array of strings in the same order, no markdown fences.

{numbered}"""


def _translate_brief(brief: dict) -> dict:
    """Add English translations to every text field. Returns the mutated brief."""
    texts = _collect_translatable_texts(brief)
    if not texts:
        return brief

    try:
        raw = _call_llm(_build_translation_prompt(texts), LLM_CONFIG["brand_model"], max_tokens=1200)
        raw = _strip_markdown_fence(raw)
        translations = json.loads(raw)
        if not isinstance(translations, list) or len(translations) != len(texts):
            raise ValueError(f"expected {len(texts)} translations, got {len(translations) if isinstance(translations, list) else 'non-list'}")
    except Exception as e:
        print(f"  [WARN] Translation failed: {e} — brief stays Chinese-only")
        return brief

    zh_to_en = dict(zip(texts, translations))

    def _bilingual(val):
        zh = _zh_text(val)
        en = zh_to_en.get(zh)
        if en:
            return {"zh": zh, "en": str(en).strip()}
        return zh  # untranslated fallback

    v = brief.get("verdict") or {}
    for f in _BRIEF_TEXT_FIELDS_VERDICT:
        if v.get(f):
            v[f] = _bilingual(v[f])

    for m in brief.get("moves") or []:
        for f in _BRIEF_TEXT_FIELDS_MOVE:
            if m.get(f):
                m[f] = _bilingual(m[f])

    return brief


# ─── DB writer ───────────────────────────────────────────────────────────────

def _upsert_brief(cur, workspace_id: str, week_of: date, brief: dict) -> None:
    cur.execute(
        """
        INSERT INTO weekly_briefs (workspace_id, week_of, verdict, moves, generated_at)
        VALUES (%s, %s, %s::jsonb, %s::jsonb, NOW())
        ON CONFLICT (workspace_id, week_of) DO UPDATE
        SET verdict      = EXCLUDED.verdict,
            moves        = EXCLUDED.moves,
            generated_at = EXCLUDED.generated_at
        """,
        (
            workspace_id,
            week_of,
            json.dumps(brief["verdict"], ensure_ascii=False),
            json.dumps(brief["moves"], ensure_ascii=False),
        ),
    )


# ─── Orchestration ───────────────────────────────────────────────────────────

def run_for_workspace(workspace_id: str, target_week: Optional[date] = None) -> bool:
    """
    Generate (and UPSERT) the brief for one workspace × week.
    Returns True if a row was written, False otherwise.
    """
    week_of = target_week or iso_monday()
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            workspace = _load_workspace(cur, workspace_id)
            if not workspace:
                print(f"[WARN] Workspace {workspace_id} not found")
                return False
            brand_name = workspace["brand_name"] or "(unnamed)"

            scores_now = _load_latest_domain_scores(cur, workspace_id)
            if not scores_now:
                print(f"[INFO] {brand_name}: no domain rollups yet — emitting baseline brief")
                brief = _baseline_brief(brand_name, "no_domain_rollups")
                _upsert_brief(cur, workspace_id, week_of, brief)
                conn.commit()
                return True

            history_days = _earliest_score_age_days(cur, workspace_id) or 0
            has_history = history_days >= DELTA_HISTORY_MIN_DAYS
            scores_prev = (
                _load_prior_domain_scores(cur, workspace_id, week_of)
                if has_history else {}
            )

            allowed_brands = set(scores_now.keys())
            prompt = _build_prompt(workspace, scores_now, scores_prev, has_history)

            print(f"[BRIEF] {brand_name} ({workspace_id[:8]}) — week_of={week_of} "
                  f"competitors={len(allowed_brands)} history={'yes' if has_history else 'no'} "
                  f"({history_days}d)")

            try:
                raw = _call_llm(prompt, LLM_CONFIG["synthesis_model"], max_tokens=1200)
            except Exception as e:
                print(f"  [WARN] LLM call failed: {e} — falling back to baseline")
                brief = _baseline_brief(brand_name, "llm_call_failed")
                _upsert_brief(cur, workspace_id, week_of, brief)
                conn.commit()
                return True

            parsed = _parse_brief_json(raw, allowed_brands, brand_name)
            if not parsed:
                print("  [WARN] LLM response unparseable — falling back to baseline")
                print(f"  [DEBUG] raw response (first 400 chars): {raw[:400]}")
                brief = _baseline_brief(brand_name, "llm_parse_failed")
                _upsert_brief(cur, workspace_id, week_of, brief)
                conn.commit()
                return True

            if not has_history:
                # Force trend=steady on baseline weeks so the UI doesn't show
                # a green/red arrow for a delta we can't honestly support.
                parsed["verdict"]["trend"] = "steady"

            # ─── Numeric-coherence coercer (W1) ──────────────────────────
            # Drop moves whose prose cites numbers not in the source data.
            # Better to ship 1 move with verified numbers than 3 with one
            # fabricated specific. Logged for monitoring + prompt iteration.
            supported_numbers = _collect_supported_numbers(scores_now, scores_prev)
            kept_moves = []
            for m in parsed["moves"]:
                unsupported = _audit_move_numbers(m, supported_numbers)
                if len(unsupported) >= _DROP_THRESHOLD_UNSUPPORTED:
                    print(f"  [DROP] move {m.get('id')!r} cites unsupported "
                          f"number(s) {unsupported} — not in source scores")
                    continue
                kept_moves.append(m)
            dropped = len(parsed["moves"]) - len(kept_moves)
            if dropped:
                print(f"  [COERCER] dropped {dropped}/{len(parsed['moves'])} moves "
                      f"for numeric-coherence violations")
            parsed["moves"] = kept_moves

            # ─── Bilingual translation ──────────────────────────────────
            parsed = _translate_brief(parsed)

            _upsert_brief(cur, workspace_id, week_of, parsed)
            conn.commit()
            print(f"  [DONE] verdict.headline={parsed['verdict']['headline'][:50]!r} "
                  f"moves={len(parsed['moves'])}")
            return True
    except Exception as e:
        conn.rollback()
        print(f"[ERROR] brand_positioning failed for {workspace_id}: {e}")
        traceback.print_exc()
        return False
    finally:
        conn.close()


def run_for_all_workspaces(target_week: Optional[date] = None) -> None:
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT DISTINCT id FROM workspaces")
            ids = [str(r["id"]) for r in cur.fetchall()]
    finally:
        conn.close()

    written = 0
    for ws_id in ids:
        if run_for_workspace(ws_id, target_week=target_week):
            written += 1
    print(f"\n[SUMMARY] brand_positioning complete — {written}/{len(ids)} workspace(s) "
          f"written for week_of={target_week or iso_monday()}")


def main():
    parser = argparse.ArgumentParser(
        description="Generate weekly_briefs.verdict + .moves via LLM "
                    "(reads domain rollup scores from analysis_results)."
    )
    parser.add_argument("--workspace-id", help="Single workspace UUID to process.")
    parser.add_argument("--all", action="store_true",
                        help="Process every workspace in the DB.")
    parser.add_argument("--week-of", help="Override target ISO Monday (YYYY-MM-DD). "
                                          "Default: this week's Monday (UTC).")
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
        run_for_all_workspaces(target_week=target_week)
    elif args.workspace_id:
        run_for_workspace(args.workspace_id, target_week=target_week)
    else:
        print("Specify --workspace-id UUID or --all")
        sys.exit(1)


if __name__ == "__main__":
    main()
