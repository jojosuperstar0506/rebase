"""
HTML Dashboard Generator for OMI Competitive Intelligence.

Takes the unified JSON data (with optional Anthropic analysis) and
regenerates the competitor-intel.html dashboard with updated data.

This module produces the same 7-dimension accordion HTML structure
as the original Cowork-built dashboard, allowing data updates to
flow through to the Vercel-hosted frontend.
"""

import json
import os
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class DashboardHtmlGenerator:
    """Generates the competitor-intel.html from JSON data."""

    # CSS classes and structure must match the original dashboard
    DIMENSION_NAMES = {
        "d1": ("D1", "Brand Search Index 搜索联想词"),
        "d2": ("D2", "Brand Voice Volume 声量指数"),
        "d3": ("D3", "Content Strategy DNA 内容策略"),
        "d4": ("D4", "Celebrity/KOL Ecosystem 达人生态"),
        "d5": ("D5", "Social Commerce Engine 社交电商"),
        "d6": ("D6", "Consumer Mindshare 消费者心智"),
        "d7": ("D7", "Channel Authority 渠道权威度"),
    }

    GROUP_LABELS = {
        "D": ("快时尚/International", "The Ceiling Above You", "#ff6b35"),
        "C": ("价值挑战者", "Your Actual Fight", "#ffd700"),
        "B": ("新兴国货", "Where You Want to Be", "#667eea"),
    }

    def generate_full_html(self, data: dict) -> str:
        """
        Generate complete competitor-intel.html from JSON data.

        Args:
            data: Full JSON output from orchestrator (with optional analysis)

        Returns:
            Complete HTML string for the dashboard
        """
        brands = data.get("brands", {})
        groups = data.get("groups", {})
        scrape_date = data.get("scrape_date", datetime.now().strftime("%Y-%m-%d"))

        # Build sidebar items
        sidebar_html = self._build_sidebar(brands, groups)

        # Build brief containers for each brand
        briefs_html = ""
        for group_key in ["D", "C", "B"]:
            group = groups.get(group_key, {})
            brand_names = group.get("brands", [])

            # Group header
            label, subtitle, color = self.GROUP_LABELS.get(group_key, ("", "", "#999"))
            briefs_html += f"""
    <div style="margin:24px 0 12px; padding:12px 16px; background:linear-gradient(135deg,{color}22,{color}11); border-left:3px solid {color}; border-radius:0 8px 8px 0;">
        <span style="color:{color}; font-weight:700; font-size:14px;">Group {group_key}: {label}</span>
        <span style="color:#8a8a9a; font-size:11px; margin-left:8px;">{subtitle}</span>
    </div>
"""
            for brand_name in brand_names:
                brand_data = brands.get(brand_name, {})
                if brand_data:
                    briefs_html += self._build_brand_brief(brand_data)

        # Assemble full HTML
        html = self._html_template(scrape_date, sidebar_html, briefs_html)
        return html

    def save_html(self, html: str, output_dir: str = "frontend/public"):
        """Save generated HTML to the output directory."""
        os.makedirs(output_dir, exist_ok=True)
        path = os.path.join(output_dir, "competitor-intel.html")
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
        logger.info(f"Dashboard HTML saved: {path}")

    # ─── HTML Builders ─────────────────────────────────────────────────────

    def _build_sidebar(self, brands: dict, groups: dict) -> str:
        """Build the sidebar navigation HTML."""
        items = []
        for group_key in ["D", "C", "B"]:
            group = groups.get(group_key, {})
            for brand_name in group.get("brands", []):
                brand = brands.get(brand_name, {})
                badge = brand.get("badge", "")
                items.append(
                    f'<div class="sidebar-item" data-competitor="{brand_name}" '
                    f'onclick="scrollToBrief(\'{brand_name}\')">'
                    f'<span class="sidebar-name">{brand_name}</span>'
                    f'<span class="sidebar-badge">{badge}</span></div>'
                )
        return "\n".join(items)

    def _build_brand_brief(self, brand_data: dict) -> str:
        """Build a complete brand brief with 7 dimension accordions."""
        name = brand_data.get("brand_name", "")
        name_en = brand_data.get("brand_name_en", "")
        badge = brand_data.get("badge", "")
        scrape_date = brand_data.get("scrape_date", "")
        analysis = brand_data.get("analysis", {})

        # Status indicators for each platform
        statuses = brand_data.get("scrape_status", {})
        status_dots = " ".join(
            f'<span style="color:{"#4ade80" if s == "success" else "#fbbf24" if s == "partial" else "#888"}">●</span> {p}'
            for p, s in statuses.items() if s != "skipped"
        )

        html = f"""
    <div class="brief-container" data-competitor="{name}">
        <div class="brief-title">
            {name} <span style="color:#8a8a9a; font-size:12px; font-weight:400;">{name_en}</span>
            <span class="brand-badge">{badge}</span>
            <span style="font-size:11px; color:#6a6a78; margin-left:auto;">数据更新: {scrape_date} &nbsp; {status_dots}</span>
        </div>
"""

        # D1-D7 dimension accordions
        dim_builders = {
            "d1": self._build_d1,
            "d2": self._build_d2,
            "d3": self._build_d3,
            "d4": self._build_d4,
            "d5": self._build_d5,
            "d6": self._build_d6,
            "d7": self._build_d7,
        }

        for dim_key, builder in dim_builders.items():
            num, title = self.DIMENSION_NAMES[dim_key]
            dim_data = brand_data.get(f"{dim_key}_brand_search_index" if dim_key == "d1"
                else f"{dim_key}_brand_voice_volume" if dim_key == "d2"
                else f"{dim_key}_content_strategy" if dim_key == "d3"
                else f"{dim_key}_kol_ecosystem" if dim_key == "d4"
                else f"{dim_key}_social_commerce" if dim_key == "d5"
                else f"{dim_key}_consumer_mindshare" if dim_key == "d6"
                else f"{dim_key}_channel_authority", {})
            insight = analysis.get(f"{dim_key}_insight", "")
            is_open = "open" if dim_key == "d1" else ""

            body_html = builder(dim_data, insight)
            summary = insight[:50] + "..." if insight else self._auto_summary(dim_key, dim_data)

            html += f"""
        <div class="dimension {is_open}">
            <div class="dimension-header" onclick="this.parentElement.classList.toggle('open')">
                <span class="dimension-num">{num}</span>
                <span class="dimension-name">{title}</span>
                <span class="dimension-summary">{summary}</span>
                <span class="dimension-arrow">▶</span>
            </div>
            <div class="dimension-body">
                {body_html}
            </div>
        </div>
"""

        # Strategic conclusion
        conclusion = analysis.get("strategic_conclusion", "数据采集完成，等待AI分析...")
        action_items = analysis.get("action_items", [])

        html += f"""
        <div class="brief-section" style="margin-top:16px;">
            <div class="brief-section-title" style="color:#667eea;">⚡ 综合战略结论 Strategic Conclusion</div>
            <div class="brief-content"><p>{conclusion}</p></div>
"""
        for item in action_items:
            dept = item.get("dept", "团队")
            action = item.get("action", "")
            html += f'            <div class="action-item"><span class="action-dept">[{dept}]</span> {action}</div>\n'

        html += """        </div>
    </div>
"""
        return html

    def _build_d1(self, data: dict, insight: str) -> str:
        """D1: Brand Search Index content."""
        xhs_suggestions = data.get("xhs_suggestions", [])
        douyin_suggestions = data.get("douyin_suggestions", [])

        tags_html = ""
        if xhs_suggestions:
            tags_html += '<div class="dim-tags"><strong>小红书:</strong> '
            tags_html += " ".join(f'<span class="dim-tag">{s}</span>' for s in xhs_suggestions[:8])
            tags_html += "</div>"
        if douyin_suggestions:
            tags_html += '<div class="dim-tags"><strong>抖音:</strong> '
            tags_html += " ".join(f'<span class="dim-tag">{s}</span>' for s in douyin_suggestions[:8])
            tags_html += "</div>"

        insight_html = f'<div class="dim-insight">{insight}</div>' if insight else ""
        return tags_html + insight_html

    def _build_d2(self, data: dict, insight: str) -> str:
        """D2: Brand Voice Volume content."""
        xhs = data.get("xhs", {})
        douyin = data.get("douyin", {})

        html = '<div class="dim-grid">'
        for platform, pdata in [("小红书", xhs), ("抖音", douyin)]:
            followers = self._format_number(pdata.get("followers", 0))
            content_count = self._format_number(pdata.get("notes", pdata.get("videos", 0)))
            likes = self._format_number(pdata.get("likes", 0))
            html += f"""
                <div class="dim-card">
                    <div class="dim-card-title">{platform}</div>
                    <div class="dim-card-value">{followers}</div>
                    <div class="dim-card-label">粉丝</div>
                    <div style="font-size:11px; color:#8a8a9a; margin-top:4px;">
                        内容 {content_count} · 获赞 {likes}
                    </div>
                </div>"""
        html += "</div>"

        if insight:
            html += f'<div class="dim-insight">{insight}</div>'
        return html

    def _build_d3(self, data: dict, insight: str) -> str:
        """D3: Content Strategy DNA content."""
        content_types = data.get("content_types", {})
        top_notes = data.get("top_notes", [])

        html = ""
        if content_types:
            total = max(sum(content_types.values()), 1)
            html += '<div class="dim-tags">'
            for ctype, count in sorted(content_types.items(), key=lambda x: -x[1]):
                pct = round(count / total * 100)
                html += f'<span class="dim-tag">{ctype} {pct}%</span>'
            html += "</div>"

        if top_notes:
            html += '<div style="margin-top:8px;">'
            for note in top_notes[:5]:
                title = note.get("title", "")[:40]
                likes = note.get("likes", "")
                ntype = "📹" if note.get("type") == "video_note" else "📷"
                html += f'<div style="font-size:11px; color:#c0c0c8; padding:2px 0;">{ntype} {title} · {likes}赞</div>'
            html += "</div>"

        if insight:
            html += f'<div class="dim-insight">{insight}</div>'
        return html

    def _build_d4(self, data: dict, insight: str) -> str:
        """D4: KOL Ecosystem content."""
        xhs_kols = data.get("xhs_kols", [])
        douyin_creators = data.get("douyin_creators", [])
        hashtag_views = data.get("douyin_hashtag_views", {})

        html = ""
        all_kols = xhs_kols + douyin_creators
        if all_kols:
            html += '<div class="dim-tags">'
            for kol in all_kols[:10]:
                name = kol.get("name", "")
                source = kol.get("source", "")
                icon = "📕" if "xhs" in source else "🎵"
                html += f'<span class="dim-tag">{icon} {name}</span>'
            html += "</div>"

        if hashtag_views:
            html += '<div style="margin-top:6px; font-size:11px; color:#8a8a9a;">'
            for tag, views in hashtag_views.items():
                html += f'{tag} {views}次播放 '
            html += "</div>"

        if insight:
            html += f'<div class="dim-insight">{insight}</div>'
        return html

    def _build_d5(self, data: dict, insight: str) -> str:
        """D5: Social Commerce Engine content."""
        live_status = data.get("live_status", "unknown")
        viewers = data.get("live_viewers", 0)
        products = data.get("shop_product_count", 0)

        status_map = {
            "live_now": ("🔴 直播中", "#ff4444"),
            "scheduled": ("🟡 已预告", "#ffd700"),
            "offline": ("⚫ 未开播", "#666"),
            "unknown": ("❓ 未知", "#666"),
        }
        status_text, status_color = status_map.get(live_status, status_map["unknown"])

        html = f"""
            <div class="dim-grid">
                <div class="dim-card">
                    <div class="dim-card-title">直播状态</div>
                    <div class="dim-card-value" style="color:{status_color}">{status_text}</div>
                    <div class="dim-card-label">观看 {self._format_number(viewers)}</div>
                </div>
                <div class="dim-card">
                    <div class="dim-card-title">橱窗商品</div>
                    <div class="dim-card-value">{products}</div>
                    <div class="dim-card-label">件在售</div>
                </div>
            </div>"""

        if insight:
            html += f'<div class="dim-insight">{insight}</div>'
        return html

    def _build_d6(self, data: dict, insight: str) -> str:
        """D6: Consumer Mindshare content."""
        positive = data.get("positive_keywords", [])
        negative = data.get("negative_keywords", [])

        html = ""
        if positive:
            html += '<div class="dim-tags"><strong style="color:#4ade80;">👍 正面:</strong> '
            html += " ".join(f'<span class="dim-tag" style="border-color:#4ade8033;">{k}</span>' for k in positive)
            html += "</div>"
        if negative:
            html += '<div class="dim-tags"><strong style="color:#f87171;">👎 负面:</strong> '
            html += " ".join(f'<span class="dim-tag" style="border-color:#f8717133;">{k}</span>' for k in negative)
            html += "</div>"

        if insight:
            html += f'<div class="dim-insight">{insight}</div>'
        return html

    def _build_d7(self, data: dict, insight: str) -> str:
        """D7: Channel Authority content."""
        rank = data.get("tmall_rank", "")
        share = data.get("category_share", "")
        price_band = data.get("price_band", "")

        html = '<div class="dim-grid">'
        if rank:
            html += f'<div class="dim-card"><div class="dim-card-title">天猫排名</div><div class="dim-card-value">{rank}</div></div>'
        if share:
            html += f'<div class="dim-card"><div class="dim-card-title">市场份额</div><div class="dim-card-value">{share}</div></div>'
        if price_band:
            html += f'<div class="dim-card"><div class="dim-card-title">价格带</div><div class="dim-card-value">{price_band}</div></div>'
        html += "</div>"

        if not rank and not share:
            html += '<div style="font-size:11px; color:#6a6a78; padding:8px;">需要登录生意参谋获取数据</div>'

        if insight:
            html += f'<div class="dim-insight">{insight}</div>'
        return html

    # ─── Helpers ───────────────────────────────────────────────────────────

    @staticmethod
    def _format_number(n: int) -> str:
        """Format number for display (e.g., 12000 -> 1.2万)."""
        if n >= 100000000:
            return f"{n / 100000000:.1f}亿"
        if n >= 10000:
            return f"{n / 10000:.1f}万"
        if n >= 1000:
            return f"{n:,}"
        return str(n)

    @staticmethod
    def _auto_summary(dim_key: str, data: dict) -> str:
        """Generate automatic summary when no AI insight available."""
        summaries = {
            "d1": lambda d: f"{len(d.get('xhs_suggestions', []))}个搜索词",
            "d2": lambda d: f"XHS {d.get('xhs', {}).get('followers', 0)} 粉丝",
            "d3": lambda d: f"{len(d.get('content_types', {}))}种内容类型",
            "d4": lambda d: f"{len(d.get('xhs_kols', []) + d.get('douyin_creators', []))}个KOL",
            "d5": lambda d: d.get("live_status", "未知"),
            "d6": lambda d: f"{len(d.get('positive_keywords', []))}正面 {len(d.get('negative_keywords', []))}负面",
            "d7": lambda d: d.get("tmall_rank", "待采集"),
        }
        fn = summaries.get(dim_key, lambda d: "")
        return fn(data)

    def _html_template(self, scrape_date: str, sidebar_html: str, briefs_html: str) -> str:
        """Return the full HTML template with CSS and JS."""
        return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>OMI 竞品情报日报 - {scrape_date}</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family: -apple-system, 'SF Pro Text', 'Helvetica Neue', sans-serif; background:#0d0d14; color:#e0e0e8; }}
.dashboard {{ display:flex; min-height:100vh; }}
.sidebar {{ width:240px; background:#12121c; border-right:1px solid #2a2a3a; padding:16px 0; position:fixed; top:0; left:0; bottom:0; overflow-y:auto; z-index:10; }}
.sidebar-item {{ padding:8px 16px; cursor:pointer; font-size:12px; border-left:3px solid transparent; transition:all 0.2s; }}
.sidebar-item:hover {{ background:#1a1a28; border-left-color:#667eea; }}
.sidebar-item.active {{ background:#1a1a28; border-left-color:#667eea; }}
.sidebar-name {{ font-weight:600; display:block; }}
.sidebar-badge {{ font-size:10px; color:#6a6a78; }}
.main {{ margin-left:240px; padding:24px; flex:1; max-width:960px; }}
.header {{ font-size:20px; font-weight:700; margin-bottom:24px; }}
.brief-container {{ background:#16161f; border:1px solid #2a2a3a; border-radius:12px; padding:20px; margin-bottom:20px; }}
.brief-title {{ font-size:16px; font-weight:700; margin-bottom:12px; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }}
.brand-badge {{ font-size:10px; background:#667eea22; color:#667eea; padding:2px 8px; border-radius:10px; }}
.dimension {{ border:1px solid #2a2a3a; border-radius:8px; margin-bottom:8px; overflow:hidden; }}
.dimension-header {{ padding:10px 14px; cursor:pointer; display:flex; align-items:center; gap:8px; background:#1a1a24; user-select:none; }}
.dimension-header:hover {{ background:#1e1e2a; }}
.dimension-num {{ font-size:11px; font-weight:700; color:#667eea; min-width:24px; }}
.dimension-name {{ font-size:12px; font-weight:600; white-space:nowrap; }}
.dimension-summary {{ font-size:11px; color:#8a8a9a; margin-left:auto; text-align:right; max-width:40%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.dimension-arrow {{ font-size:10px; color:#6a6a78; transition:transform 0.2s; margin-left:8px; }}
.dimension.open .dimension-arrow {{ transform:rotate(90deg); }}
.dimension-body {{ display:none; padding:12px 14px; background:#14141e; }}
.dimension.open .dimension-body {{ display:block; }}
.dim-grid {{ display:grid; grid-template-columns:repeat(auto-fit, minmax(140px,1fr)); gap:8px; }}
.dim-card {{ background:#1a1a24; border:1px solid #2a2a3a; border-radius:6px; padding:10px; }}
.dim-card-title {{ font-size:10px; color:#6a6a78; text-transform:uppercase; }}
.dim-card-value {{ font-size:18px; font-weight:700; color:#e0e0e8; margin:4px 0; }}
.dim-card-label {{ font-size:10px; color:#8a8a9a; }}
.dim-tags {{ display:flex; flex-wrap:wrap; gap:4px; margin-top:6px; }}
.dim-tag {{ font-size:11px; padding:2px 8px; background:#1e1e2e; border:1px solid #3a3a4a; border-radius:12px; color:#c0c0c8; }}
.dim-insight {{ margin-top:8px; padding:8px 12px; background:#667eea11; border-left:2px solid #667eea; border-radius:0 4px 4px 0; font-size:11px; color:#a0a0b8; line-height:1.6; }}
.brief-section {{ padding:12px; background:#1a1a24; border-radius:8px; }}
.brief-section-title {{ font-size:13px; font-weight:700; margin-bottom:8px; }}
.brief-content {{ font-size:12px; color:#c0c0c8; line-height:1.7; }}
.action-item {{ font-size:11px; padding:6px 10px; background:#12121c; border-radius:4px; margin-top:4px; color:#c0c0c8; }}
.action-dept {{ color:#667eea; font-weight:700; }}
</style>
</head>
<body>
<div class="dashboard">
    <div class="sidebar">
        <div style="padding:12px 16px; font-size:14px; font-weight:700; color:#667eea; border-bottom:1px solid #2a2a3a; margin-bottom:8px;">
            OMI 竞品情报
        </div>
        {sidebar_html}
    </div>
    <div class="main">
        <div class="header">OMI 竞品情报日报 — {scrape_date}</div>
        {briefs_html}
    </div>
</div>
<script>
function scrollToBrief(name) {{
    const el = document.querySelector('[data-competitor="'+name+'"].brief-container');
    if(el) el.scrollIntoView({{behavior:'smooth', block:'start'}});
    document.querySelectorAll('.sidebar-item').forEach(s => s.classList.remove('active'));
    const si = document.querySelector('.sidebar-item[data-competitor="'+name+'"]');
    if(si) si.classList.add('active');
}}
</script>
</body>
</html>"""
