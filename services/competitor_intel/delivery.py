"""
WeChat Work weekly brief delivery module for OMI Competitive Intelligence.

Pulls latest scores, signals, and narratives from SQLite and formats
a markdown message for WeChat Work webhook delivery.

Usage:
    python -m services.competitor-intel.delivery              # dry run (default)
    python -m services.competitor-intel.delivery --send        # send to WeChat Work
    python -m services.competitor-intel.delivery --cron-hint   # print crontab instructions
"""

import argparse
import json
import os
import urllib.request
from datetime import datetime
from typing import Optional

from .storage import (
    DEFAULT_DB_PATH,
    get_latest_narratives,
    get_latest_scores,
    init_db,
)


# ─── Constants ────────────────────────────────────────────────────────────────

SIGNAL_EMOJIS = {
    "AGGRESSIVE_PRICING": "💰",
    "CHANNEL_EXPANSION": "📺",
    "PRODUCT_BLITZ": "🚀",
    "AWARENESS_PLAY": "⭐",
    "VIRAL_MOMENT": "🔥",
    "RANKING_SURGE": "📈",
}

DEFAULT_DASHBOARD_URL = "https://omi-competitor-intel.vercel.app"

# WeChat Work markdown messages have a ~4096 character limit.
WECHAT_MAX_LENGTH = 4096


# ─── Brief formatting ────────────────────────────────────────────────────────


def format_weekly_brief(db_path: Optional[str] = None) -> str:
    """Pull latest data from SQLite and format a WeChat Work markdown brief.

    Args:
        db_path: Path to SQLite database. Uses default if None.

    Returns:
        Formatted markdown string ready for WeChat Work webhook.
    """
    conn = init_db(db_path or DEFAULT_DB_PATH)
    try:
        return _build_brief(conn)
    finally:
        conn.close()


def _build_brief(conn) -> str:
    """Build the brief content from database data."""
    today = datetime.now().strftime("%Y-%m-%d")
    dashboard_url = os.environ.get("DASHBOARD_URL", DEFAULT_DASHBOARD_URL)

    # Fetch scores
    scores = get_latest_scores(conn)
    # Fetch narratives
    narratives = get_latest_narratives(conn)

    if not scores:
        return (
            f"# 🔍 OMI 竞品周报 — {today}\n\n"
            "暂无评分数据。请先运行评分引擎:\n"
            "```\n"
            "python -m services.competitor-intel.scoring\n"
            "```\n\n"
            f"> 📋 详细报告: {dashboard_url}"
        )

    # Sort by momentum descending
    scored_brands = sorted(scores, key=lambda s: s.get("momentum_score") or 0, reverse=True)
    scores_date = scores[0].get("date", today) if scores else today

    # ── Section 1: Signals ──
    signals_section = _format_signals_section(scored_brands)

    # ── Section 2: Top 5 leaderboard ──
    leaderboard_section = _format_leaderboard_section(scored_brands[:5])

    # ── Section 3: Action items ──
    action_items_section = _format_action_items_section(narratives)

    # ── Section 4: Data freshness ──
    freshness_section = _format_freshness_section(conn, scores_date, narratives)

    # ── Assemble ──
    brief = (
        f"# 🔍 OMI 竞品周报 — {today}\n\n"
        f"{signals_section}\n\n"
        f"{leaderboard_section}\n\n"
        f"{action_items_section}\n\n"
        f"{freshness_section}\n\n"
        f"> 📋 详细报告: {dashboard_url}"
    )

    # Truncate if exceeding WeChat limit
    if len(brief) > WECHAT_MAX_LENGTH:
        brief = _truncate_brief(brief, dashboard_url)

    return brief


def _format_signals_section(scored_brands: list) -> str:
    """Format the GTM signals section."""
    lines = ["## ⚠️ 本周重要信号"]
    has_signals = False

    for brand in scored_brands:
        for signal in brand.get("gtm_signals", []):
            has_signals = True
            signal_type = signal.get("signal", "UNKNOWN")
            emoji = SIGNAL_EMOJIS.get(signal_type, "⚡")
            detail = signal.get("detail", "")
            lines.append(f"> **{brand['brand_name']}** {emoji} {signal_type}: {detail}")

    if not has_signals:
        lines.append("本周无异常信号，市场整体平稳。")

    return "\n".join(lines)


def _format_leaderboard_section(top5: list) -> str:
    """Format the top-5 momentum leaderboard table."""
    lines = [
        "## 📈 品牌动量 TOP 5",
        "| 排名 | 品牌 | 动量 | 变化 | 威胁 |",
        "|:----:|:----:|:----:|:----:|:----:|",
    ]

    for i, brand in enumerate(top5, 1):
        momentum = brand.get("momentum_score") or 0
        threat = brand.get("threat_index") or 0
        # Score breakdown may have a "change" field, but we don't have
        # previous scores in the same query — show "➡️ 0" as baseline.
        change = "➡️ 0"
        lines.append(
            f"| {i} | {brand['brand_name']} | {momentum:.0f} | {change} | {threat:.0f} |"
        )

    return "\n".join(lines)


def _format_action_items_section(narratives: list) -> str:
    """Format the action items section from narratives."""
    lines = ["## 🎯 本周行动建议"]

    # Find action_items narrative
    action_content = None
    for n in narratives:
        if n.get("narrative_type") == "action_items":
            action_content = n.get("content", "")
            break

    if not action_content:
        lines.append("暂无行动建议。请先运行叙事引擎。")
        return "\n".join(lines)

    # Parse action items (stored as JSON string)
    try:
        items = json.loads(action_content)
    except (json.JSONDecodeError, TypeError):
        lines.append("暂无行动建议。")
        return "\n".join(lines)

    if not isinstance(items, list):
        lines.append("暂无行动建议。")
        return "\n".join(lines)

    for i, item in enumerate(items[:5], 1):
        action = item.get("action", "")
        dept = item.get("department", "")
        urgency = item.get("urgency", "")
        rationale = item.get("rationale", "")
        lines.append(f"**{i}. {action}**")
        lines.append(f"> 部门: {dept} | 紧急度: {urgency}")
        lines.append(f"> 依据: {rationale}")
        lines.append("")

    return "\n".join(lines)


def _format_freshness_section(conn, scores_date: str, narratives: list) -> str:
    """Format the data freshness section."""
    lines = ["## 📊 数据概况"]

    # Brand data freshness
    row = conn.execute(
        "SELECT COUNT(DISTINCT brand_name) as cnt, MAX(snapshot_date) as d FROM snapshots"
    ).fetchone()
    snap_count = row["cnt"] if row and row["cnt"] else 0
    snap_date = row["d"] if row and row["d"] else "无数据"
    lines.append(f"- 品牌数据: {snap_count}个品牌已更新 (最近: {snap_date})")

    # Tmall rankings
    tmall_row = conn.execute(
        "SELECT MAX(extract_date) as d FROM product_rankings WHERE source = 'sycm'"
    ).fetchone()
    tmall_date = tmall_row["d"] if tmall_row and tmall_row["d"] else "未导入"
    lines.append(f"- 天猫TOP100: {tmall_date}")

    # Douyin rankings
    douyin_row = conn.execute(
        "SELECT MAX(extract_date) as d FROM product_rankings WHERE source = 'douyin'"
    ).fetchone()
    douyin_date = douyin_row["d"] if douyin_row and douyin_row["d"] else "未导入"
    lines.append(f"- 抖音TOP100: {douyin_date}")

    # Scoring engine
    lines.append(f"- 评分引擎: {scores_date}")

    # Narrative engine
    narr_date = "未运行"
    for n in narratives:
        if n.get("date"):
            narr_date = n["date"]
            break
    lines.append(f"- 叙事引擎: {narr_date}")

    return "\n".join(lines)


def _truncate_brief(brief: str, dashboard_url: str) -> str:
    """Truncate the brief to fit WeChat Work's character limit.

    Removes action items section and replaces with a link to the full report.
    """
    # Find the action items section and remove it
    marker = "## 🎯 本周行动建议"
    next_section = "## 📊 数据概况"

    idx_start = brief.find(marker)
    idx_end = brief.find(next_section)

    if idx_start >= 0 and idx_end > idx_start:
        truncated_actions = f"{marker}\n查看完整报告获取行动建议: {dashboard_url}\n\n"
        brief = brief[:idx_start] + truncated_actions + brief[idx_end:]

    # If still too long, hard-truncate
    if len(brief) > WECHAT_MAX_LENGTH:
        brief = brief[: WECHAT_MAX_LENGTH - 50] + f"\n\n> 查看完整报告: {dashboard_url}"

    return brief


# ─── Webhook delivery ────────────────────────────────────────────────────────


def send_wechat_brief(message: str, webhook_url: Optional[str] = None) -> dict:
    """Send markdown message to WeChat Work group via webhook.

    Args:
        message: Markdown-formatted message string.
        webhook_url: WeChat Work webhook URL. Falls back to
                     WECHAT_WORK_WEBHOOK env var.

    Returns:
        WeChat API response dict (e.g. {"errcode": 0, "errmsg": "ok"}).

    Raises:
        ValueError: If no webhook URL is available.
    """
    url = webhook_url or os.environ.get("WECHAT_WORK_WEBHOOK")
    if not url:
        raise ValueError(
            "No webhook URL. Set WECHAT_WORK_WEBHOOK env var or pass webhook_url."
        )

    payload = {
        "msgtype": "markdown",
        "markdown": {"content": message},
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    with urllib.request.urlopen(req) as response:
        result = json.loads(response.read().decode("utf-8"))

    if result.get("errcode") == 0:
        print(f"✅ Brief sent successfully (errcode: 0)")
    else:
        print(f"❌ Send failed: {result}")

    return result


# ─── Master function ──────────────────────────────────────────────────────────


def run_delivery(dry_run: bool = False, db_path: Optional[str] = None,
                 webhook_url: Optional[str] = None) -> str:
    """Format and optionally send the weekly brief.

    Args:
        dry_run: If True, print the brief but don't send.
        db_path: Path to SQLite database. Uses default if None.
        webhook_url: Optional webhook URL override.

    Returns:
        The formatted message string.
    """
    message = format_weekly_brief(db_path)

    if dry_run:
        print("WeChat Work Weekly Brief — DRY RUN")
        print("=" * 40)
        print("The following message would be sent:\n")
        print("---")
        print(message)
        print("---\n")
        print(f"Message length: {len(message):,} characters")
        print("To send for real: python -m services.competitor-intel.delivery --send")
    else:
        print("Sending weekly brief to WeChat Work...")
        send_wechat_brief(message, webhook_url)
        print(f"Message length: {len(message):,} characters")

    return message


# ─── CLI ──────────────────────────────────────────────────────────────────────


def _print_cron_hint() -> None:
    """Print crontab instructions for Monday 9am CST scheduling."""
    project_dir = os.path.dirname(os.path.abspath(__file__))
    print("Add this to your crontab (crontab -e):\n")
    print(
        f"0 9 * * 1 cd {project_dir} && "
        "python -m services.competitor-intel.delivery --send "
        ">> logs/delivery.log 2>&1"
    )
    print("\nThis runs every Monday at 9:00 AM (server local time).")
    print("If server is UTC, use: 0 1 * * 1 (1:00 AM UTC = 9:00 AM CST)")


def main() -> None:
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="OMI Competitive Intelligence — WeChat Work Weekly Brief"
    )
    parser.add_argument(
        "--send", action="store_true",
        help="Actually send the brief (default is dry run)",
    )
    parser.add_argument(
        "--webhook", type=str, default=None,
        help="WeChat Work webhook URL (overrides WECHAT_WORK_WEBHOOK env var)",
    )
    parser.add_argument(
        "--cron-hint", action="store_true",
        help="Print crontab instructions for scheduling",
    )
    parser.add_argument(
        "--db-path", type=str, default=None,
        help="Path to SQLite database",
    )
    args = parser.parse_args()

    if args.cron_hint:
        _print_cron_hint()
        return

    run_delivery(
        dry_run=not args.send,
        db_path=args.db_path,
        webhook_url=args.webhook,
    )


if __name__ == "__main__":
    main()
