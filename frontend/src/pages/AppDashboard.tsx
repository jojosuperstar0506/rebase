import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useApp } from "../context/AppContext";
import { T, t } from "../i18n";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Brand {
  brand_name: string;
  brand_name_en?: string;
  momentum_score: number;
  threat_index: number;
  wtp_score: number;
  trend_signals?: string[];
}

interface ActionItem {
  priority: "high" | "medium" | "low";
  title: string;
  description: string;
}

interface DashboardData {
  brand_name: string;
  last_updated: string;
  competitors: Brand[];
  action_items: ActionItem[];
  narrative?: string;
  _source?: string;
}

// ── Hardcoded demo data (shown immediately; replaced by live data when available) ──

const DEMO_DATA: DashboardData = {
  brand_name: "竞品分析",
  last_updated: "2026-04-09",
  narrative:
    "Songmont 和 古良吉吉 持续领跑新兴国货赛道，凭借强势的小红书内容矩阵和 KOL 合作，动能评分高居前列。La Festin（拉菲斯特）在价值挑战者梯队中威胁指数最高，需重点关注其直播渠道扩张动向。建议在本季度加大穿搭OOTD内容比重，并测试尾部 KOL 矩阵以对冲头部 KOL 成本上升风险。",
  competitors: [
    { brand_name: "Songmont", brand_name_en: "Songmont", momentum_score: 82, threat_index: 74, wtp_score: 68, trend_signals: ["直播销量增长", "小红书破圈", "联名限定款"] },
    { brand_name: "古良吉吉", brand_name_en: "Gu Liang Ji Ji", momentum_score: 78, threat_index: 65, wtp_score: 61, trend_signals: ["设计师IP强化", "买手店渠道", "海外传播"] },
    { brand_name: "La Festin", brand_name_en: "La Festin", momentum_score: 55, threat_index: 71, wtp_score: 58, trend_signals: ["价格下探", "抖音投流加速", "达人矩阵"] },
    { brand_name: "DISSONA", brand_name_en: "DISSONA", momentum_score: 62, threat_index: 58, wtp_score: 52, trend_signals: ["天猫旗舰促销", "轻奢定位稳固"] },
    { brand_name: "裘真", brand_name_en: "Qiu Zhen", momentum_score: 71, threat_index: 50, wtp_score: 46, trend_signals: ["东方美学叙事", "UGC口碑建设"] },
    { brand_name: "VINEY", brand_name_en: "VINEY", momentum_score: 44, threat_index: 63, wtp_score: 51, trend_signals: ["低价冲量", "拼多多渗透"] },
    { brand_name: "FOXER", brand_name_en: "FOXER", momentum_score: 38, threat_index: 47, wtp_score: 39, trend_signals: ["促销依赖"] },
    { brand_name: "Cnolés蔻一", brand_name_en: "Cnoles", momentum_score: 51, threat_index: 42, wtp_score: 38, trend_signals: ["内容产量下降"] },
  ],
  action_items: [
    {
      priority: "high",
      title: "监控 Songmont 直播频次与客单价动向",
      description: "Songmont 上周直播观看人次环比增长 34%，客单价下探至 ¥680 区间，有走量策略迹象。建议本周内完成专项竞品监控报告。",
    },
    {
      priority: "high",
      title: "反制 La Festin 抖音投流策略",
      description: "La Festin 在抖音的付费流量投放量级本月翻倍，主推 ¥400 以下入门款，正在蚕食价值挑战者赛道份额。建议评估差异化内容反制方案。",
    },
    {
      priority: "medium",
      title: "复制古良吉吉的买手店渠道模式",
      description: "古良吉吉与 10+ 买手集合店达成合作，有效提升线下品牌曝光与溢价感知。评估是否在上海、北京各 1-2 家买手店进行试点。",
    },
    {
      priority: "medium",
      title: "测试腰部 KOL 矩阵替代头部 KOL 合作",
      description: "头部 KOL 报价本季度上涨约 20%，而腰部 KOL（1-10万粉丝）的 ROI 表现持续优于头部。建议本月测试 5 个腰部账号内容合作。",
    },
    {
      priority: "low",
      title: "加强东方美学内容叙事",
      description: "裘真和古良吉吉均在东方美学赛道取得显著声量，而该内容方向在全平台仍有流量红利。评估融入品牌内容策略的可行性。",
    },
  ],
  _source: "demo",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function bubbleColor(b: Brand): string {
  const highMomentum = b.momentum_score >= 50;
  const highThreat = b.threat_index >= 50;
  if (highMomentum && highThreat) return "#ef4444";
  if (highMomentum && !highThreat) return "#3b82f6";
  if (!highMomentum && highThreat) return "#f59e0b";
  return "#6b7280";
}

function bubbleCx(threatIndex: number): number {
  return 40 + (threatIndex / 100) * 600;
}

function bubbleCy(momentumScore: number): number {
  return 380 - (momentumScore / 100) * 340;
}

function bubbleR(wtpScore: number): number {
  return 18 + (wtpScore / 100) * 22;
}

function priorityColor(priority: string, colors: Record<string, string>): string {
  if (priority === "high") return colors.danger;
  if (priority === "medium") return colors.ac;
  return colors.t2;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("zh-CN", {
      year: "numeric", month: "long", day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Static JSON mapper ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStaticJson(raw: any): DashboardData | null {
  try {
    // Static JSON may have scores nested at raw.scores.brands, or may not have scores at all
    const scoresMap: Record<string, {
      momentum_score?: number;
      threat_index?: number;
      gtm_signals?: string[];
    }> = raw?.scores?.brands ?? {};

    const brandsObj: Record<string, Record<string, unknown>> = raw?.brands ?? {};
    if (Object.keys(brandsObj).length === 0) return null;

    const competitors: Brand[] = Object.entries(brandsObj).map(([name, brandData]) => {
      const s = scoresMap[name] ?? {};
      const momentum = parseFloat(((s.momentum_score ?? 0) as number).toFixed(1));
      const threat = parseFloat(((s.threat_index ?? 0) as number).toFixed(1));
      const wtp = parseFloat((threat * 0.82).toFixed(1));
      const d = brandData as Record<string, unknown>;
      return {
        brand_name: name,
        brand_name_en: (d.brand_name_en as string) ?? "",
        momentum_score: momentum,
        threat_index: threat,
        wtp_score: wtp,
        trend_signals: ((s.gtm_signals ?? []) as string[]).slice(0, 3),
      };
    }).sort((a, b) => b.momentum_score - a.momentum_score);

    const rawItems = Array.isArray(raw?.narratives?.action_items)
      ? raw.narratives.action_items as Record<string, unknown>[]
      : [];

    const action_items: ActionItem[] = rawItems.map(item => ({
      priority: item.urgency === "本周" ? "high" as const
        : item.urgency === "本月" ? "medium" as const
        : "low" as const,
      title: (item.action ?? item.title ?? "") as string,
      description: (item.rationale ?? item.description ?? item.department ?? "") as string,
    }));

    return {
      brand_name: "竞品分析",
      last_updated: (raw.scrape_date as string) ?? "",
      competitors,
      action_items,
      narrative: (raw.narratives?.strategic_summary as string) ?? "",
      _source: "static_json",
    };
  } catch {
    return null;
  }
}

// ── Sort types ────────────────────────────────────────────────────────────────

type SortKey = "brand_name" | "momentum_score" | "threat_index" | "wtp_score";
type SortDir = "asc" | "desc";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppDashboard() {
  const { colors: C, lang } = useApp();

  // Start with demo data so the page renders immediately — no blank screen ever
  const [data, setData] = useState<DashboardData>(DEMO_DATA);
  const [fetchState, setFetchState] = useState<"loading" | "live" | "static" | "demo">("loading");
  const [sortKey, setSortKey] = useState<SortKey>("threat_index");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hoveredBubble, setHoveredBubble] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      // 1. Try live API (backend on ECS)
      try {
        const token = localStorage.getItem("rebase_token") ?? "";
        const res = await fetch("/api/v2/dashboard?industry=bag", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelled && res.ok) {
          const ct = res.headers.get("content-type") ?? "";
          if (ct.includes("application/json")) {
            const json = await res.json() as DashboardData;
            if (!cancelled && json.competitors && json.competitors.length > 0) {
              setData(json);
              setFetchState("live");
              return;
            }
          }
        }
      } catch {
        // backend not reachable — fall through
      }

      // 2. Try static JSON file
      try {
        const res = await fetch("/data/competitors/competitors_latest.json", {
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelled && res.ok) {
          const ct = res.headers.get("content-type") ?? "";
          if (!ct.includes("application/json") && !ct.includes("text/json")) {
            console.warn("[AppDashboard] Static JSON returned non-JSON content-type:", ct);
            return;
          }
          const raw = await res.json();
          const mapped = mapStaticJson(raw);
          // Only use static data if it has real scores (otherwise keep demo)
          const hasRealScores = mapped !== null &&
            mapped.competitors.some(b => b.momentum_score > 0 || b.threat_index > 0);
          if (!cancelled && mapped !== null && hasRealScores) {
            setData(mapped);
            setFetchState("static");
            return;
          }
        }
      } catch {
        // static file missing — keep demo data
      }

      // 3. Keep demo data
      if (!cancelled) setFetchState("demo");
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  // ── Sort ────────────────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedBrands = [...(data.competitors ?? [])].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === "asc"
      ? (av as number) - (bv as number)
      : (bv as number) - (av as number);
  });

  // ── Styles ──────────────────────────────────────────────────────────────────

  const cardStyle: CSSProperties = {
    background: C.s1,
    border: `1px solid ${C.bd}`,
    borderRadius: 12,
    padding: 24,
    marginBottom: 24,
  };

  const sectionTitle: CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    color: C.tx,
    marginBottom: 16,
    paddingBottom: 10,
    borderBottom: `1px solid ${C.bd}`,
  };

  const thStyle: CSSProperties = {
    padding: "10px 12px",
    fontSize: 11,
    fontWeight: 700,
    color: C.t2,
    textAlign: "left",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    cursor: "pointer",
    userSelect: "none",
    borderBottom: `1px solid ${C.bd}`,
    background: C.s2,
    whiteSpace: "nowrap",
  };

  const tdStyle: CSSProperties = {
    padding: "10px 12px",
    fontSize: 13,
    color: C.tx,
    borderBottom: `1px solid ${C.bd}`,
    verticalAlign: "middle",
  };

  const sourceLabel: Record<string, string> = {
    loading: "Checking for live data…",
    live: "Live data from backend",
    static: "Latest scraped data",
    demo: "Demo data · Connect backend for live intelligence",
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: C.tx }}>

      {/* ── CI vFinal promo banner ────────────────────────────────────────────── */}
      <div style={{
        background: `${C.ac}18`,
        border: `1px solid ${C.ac}44`,
        borderRadius: 8,
        padding: '8px 16px',
        margin: '16px 24px 0',
        fontSize: 13,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <span style={{ color: C.t2 }}>{t(T.ci.tryNew, lang)}</span>
        <a href="/ci" style={{ color: C.ac, fontWeight: 600, textDecoration: 'none', flexShrink: 0, marginLeft: 12 }}>
          CI vFinal →
        </a>
      </div>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{ padding: "24px 32px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>竞品分析</h1>
          <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>
            Competitive Intelligence · {data.last_updated ? `更新于 ${formatDate(data.last_updated)}` : "每晚 2am 自动更新"}
          </div>
        </div>
        <div style={{
          fontSize: 11,
          color: fetchState === "live" ? C.success : fetchState === "demo" ? C.t2 : C.ac,
          background: C.s2,
          border: `1px solid ${C.bd}`,
          borderRadius: 6,
          padding: "4px 10px",
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexShrink: 0,
          marginTop: 4,
        }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%",
            background: fetchState === "live" ? C.success : fetchState === "loading" ? C.ac : C.t2,
          }} />
          {sourceLabel[fetchState]}
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px" }}>

        {/* ── AI Narrative ─────────────────────────────────────────────────── */}
        {data.narrative && (
          <div style={{ ...cardStyle, borderLeft: `3px solid ${C.ac}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ac, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              AI 竞品摘要
            </div>
            <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.8 }}>{data.narrative}</div>
          </div>
        )}

        {/* ── Competitive Landscape Bubble Chart ───────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionTitle}>竞品态势图</div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { color: "#ef4444", label: "高威胁 + 高动能" },
              { color: "#3b82f6", label: "上升势头强" },
              { color: "#f59e0b", label: "细分威胁" },
              { color: "#6b7280", label: "动能下滑" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.t2 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                {label}
              </div>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <svg viewBox="0 0 680 420" width="100%" style={{ maxWidth: 680, display: "block" }}>
              <rect x={0} y={0} width={680} height={420} fill="transparent" />

              {/* Quadrant shading */}
              <rect x={40} y={40} width={300} height={340} fill={C.s2} opacity={0.4} />
              <rect x={340} y={40} width={300} height={340} fill={C.s2} opacity={0.6} />

              {/* Quadrant labels */}
              <text x={190} y={58} textAnchor="middle" fill={C.t3} fontSize={10}>上升势头</text>
              <text x={490} y={58} textAnchor="middle" fill={C.t3} fontSize={10}>高优先关注</text>
              <text x={190} y={375} textAnchor="middle" fill={C.t3} fontSize={10}>动能下滑</text>
              <text x={490} y={375} textAnchor="middle" fill={C.t3} fontSize={10}>细分威胁</text>

              {/* Axis lines */}
              <line x1={40} y1={40} x2={40} y2={385} stroke={C.bd} strokeWidth={1} />
              <line x1={40} y1={380} x2={645} y2={380} stroke={C.bd} strokeWidth={1} />

              {/* Grid lines */}
              {[25, 50, 75].map(v => (
                <g key={v}>
                  <line x1={40 + (v / 100) * 600} y1={40} x2={40 + (v / 100) * 600} y2={380}
                    stroke={C.bd} strokeWidth={0.5} strokeDasharray="4,4" />
                  <line x1={40} y1={380 - (v / 100) * 340} x2={640} y2={380 - (v / 100) * 340}
                    stroke={C.bd} strokeWidth={0.5} strokeDasharray="4,4" />
                </g>
              ))}

              {/* Axis labels */}
              <text x={340} y={414} textAnchor="middle" fill={C.t2} fontSize={11}>威胁指数 →</text>
              <text x={14} y={210} textAnchor="middle" fill={C.t2} fontSize={11} transform="rotate(-90, 14, 210)">动能 →</text>

              {/* Tick labels */}
              {[0, 25, 50, 75, 100].map(v => (
                <g key={v}>
                  <text x={40 + (v / 100) * 600} y={396} textAnchor="middle" fill={C.t2} fontSize={9}>{v}</text>
                  <text x={34} y={380 - (v / 100) * 340 + 4} textAnchor="end" fill={C.t2} fontSize={9}>{v}</text>
                </g>
              ))}

              {/* Bubbles */}
              {(data.competitors ?? []).map((brand, i) => {
                const cx = bubbleCx(brand.threat_index);
                const cy = bubbleCy(brand.momentum_score);
                const r = bubbleR(brand.wtp_score);
                const color = bubbleColor(brand);
                const isHovered = hoveredBubble === i;
                // Clamp tooltip so it doesn't go off-canvas
                const tipX = cx + r + 4 + 164 > 680 ? cx - r - 168 : cx + r + 4;

                return (
                  <g key={`${brand.brand_name}-${i}`}
                    onMouseEnter={() => setHoveredBubble(i)}
                    onMouseLeave={() => setHoveredBubble(null)}
                    style={{ cursor: "pointer" }}
                  >
                    <circle
                      cx={cx} cy={cy} r={isHovered ? r + 3 : r}
                      fill={color} fillOpacity={isHovered ? 0.9 : 0.65}
                      stroke={color} strokeWidth={isHovered ? 2 : 1}
                    />
                    <text
                      x={cx} y={cy + r + 13}
                      textAnchor="middle"
                      fill={C.tx}
                      fontSize={isHovered ? 11 : 10}
                      fontWeight={isHovered ? 700 : 400}
                    >
                      {brand.brand_name}
                    </text>

                    {isHovered && (
                      <g>
                        <rect
                          x={tipX} y={cy - 38}
                          width={160} height={76}
                          rx={4} ry={4}
                          fill={C.s1} stroke={color} strokeWidth={1}
                        />
                        <text x={tipX + 8} y={cy - 22} fill={C.tx} fontSize={11} fontWeight={700}>
                          {brand.brand_name}
                        </text>
                        <text x={tipX + 8} y={cy - 8} fill={C.t2} fontSize={10}>
                          动能: {brand.momentum_score}  威胁: {brand.threat_index}
                        </text>
                        <text x={tipX + 8} y={cy + 6} fill={C.t2} fontSize={10}>
                          WTP: {brand.wtp_score}
                        </text>
                        <text x={tipX + 8} y={cy + 22} fill={color} fontSize={10} fontWeight={600}>
                          {brand.threat_index >= 50 && brand.momentum_score >= 50 ? "⚠ 高优先关注"
                            : brand.momentum_score >= 50 ? "↑ 上升势头强"
                            : brand.threat_index >= 50 ? "◆ 细分威胁"
                            : "↓ 动能下滑"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ fontSize: 11, color: C.t2, marginTop: 8 }}>
            气泡大小代表品牌溢价意愿（WTP）评分。将鼠标悬停于气泡查看详情。
          </div>
        </div>

        {/* ── Brand Scores Table ───────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionTitle}>品牌评分排名</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {([
                    ["brand_name", "品牌"],
                    ["momentum_score", "动能评分"],
                    ["threat_index", "威胁指数"],
                    ["wtp_score", "溢价意愿"],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th key={key} style={thStyle} onClick={() => handleSort(key)}>
                      {label}
                      {sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕"}
                    </th>
                  ))}
                  <th style={{ ...thStyle, cursor: "default" }}>近期信号</th>
                </tr>
              </thead>
              <tbody>
                {sortedBrands.map((brand, i) => (
                  <tr key={`${brand.brand_name}-row-${i}`}
                    style={{ background: i % 2 === 0 ? "transparent" : C.s2 + "55" }}
                  >
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{brand.brand_name}</div>
                      {brand.brand_name_en && (
                        <div style={{ fontSize: 11, color: C.t2 }}>{brand.brand_name_en}</div>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: C.bd, borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                          <div style={{
                            width: `${brand.momentum_score}%`, height: "100%",
                            background: brand.momentum_score >= 50 ? "#3b82f6" : C.t2,
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: brand.momentum_score >= 70 ? "#3b82f6" : C.tx,
                          minWidth: 28,
                        }}>
                          {brand.momentum_score}
                        </span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: C.bd, borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                          <div style={{
                            width: `${brand.threat_index}%`, height: "100%",
                            background: brand.threat_index >= 60 ? C.danger
                              : brand.threat_index >= 40 ? "#f59e0b"
                              : C.success,
                            borderRadius: 3,
                          }} />
                        </div>
                        <span style={{
                          fontSize: 12, fontWeight: 600,
                          color: brand.threat_index >= 60 ? C.danger : C.tx,
                          minWidth: 28,
                        }}>
                          {brand.threat_index}
                        </span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, fontSize: 14 }}>
                      {brand.wtp_score}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(brand.trend_signals ?? []).slice(0, 3).map((sig, j) => (
                          <span key={j} style={{
                            fontSize: 11,
                            background: C.s2,
                            border: `1px solid ${C.bd}`,
                            borderRadius: 4,
                            padding: "2px 6px",
                            color: C.t2,
                            whiteSpace: "nowrap",
                          }}>
                            {sig}
                          </span>
                        ))}
                        {(brand.trend_signals ?? []).length === 0 && (
                          <span style={{ fontSize: 11, color: C.t2 }}>—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Action Items ─────────────────────────────────────────────────── */}
        {(data.action_items?.length ?? 0) > 0 && (
          <div style={cardStyle}>
            <div style={sectionTitle}>行动建议</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {(data.action_items ?? []).map((item, i) => {
                const pColor = priorityColor(item.priority, C as unknown as Record<string, string>);
                const priorityLabel: Record<string, string> = {
                  high: "本周必做",
                  medium: "本月完成",
                  low: "持续关注",
                };
                return (
                  <div key={i} style={{
                    display: "flex",
                    gap: 14,
                    padding: "14px 16px",
                    background: C.s2,
                    borderRadius: 8,
                    border: `1px solid ${C.bd}`,
                    borderLeft: `3px solid ${pColor}`,
                  }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, color: pColor,
                        background: `${pColor}18`,
                        border: `1px solid ${pColor}44`,
                        borderRadius: 4,
                        padding: "2px 7px",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        whiteSpace: "nowrap",
                      }}>
                        {priorityLabel[item.priority] ?? item.priority}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>
                        {item.title}
                      </div>
                      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.7 }}>
                        {item.description}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 18 }}>
                      {item.priority === "high" ? "🔴" : item.priority === "medium" ? "🟡" : "🟢"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", fontSize: 12, color: C.t2, paddingTop: 8, paddingBottom: 32 }}>
          Powered by Rebase · 数据每 24 小时自动更新
          {fetchState === "demo" && (
            <span style={{ marginLeft: 8, color: C.t3 }}>
              · 当前显示演示数据，接入后端后将自动切换为实时数据
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
