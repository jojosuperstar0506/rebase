import { useState, useEffect } from "react";
import type { CSSProperties } from "react";
import { useApp } from "../context/AppContext";

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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function bubbleColor(b: Brand): string {
  const highMomentum = b.momentum_score >= 50;
  const highThreat = b.threat_index >= 50;
  if (highMomentum && highThreat) return "#ef4444";   // top-right: dangerous
  if (highMomentum && !highThreat) return "#3b82f6";  // top-left: rising
  if (!highMomentum && highThreat) return "#f59e0b";  // bottom-right: niche
  return "#6b7280";                                    // bottom-left: declining
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

function priorityColor(priority: string, C: Record<string, string>): string {
  if (priority === "high") return C.danger;
  if (priority === "medium") return C.ac;
  return C.t2;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

function greetingPrefix(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ── Sort types ────────────────────────────────────────────────────────────────

type SortKey = "brand_name" | "momentum_score" | "threat_index" | "wtp_score";
type SortDir = "asc" | "desc";

// ── Component ─────────────────────────────────────────────────────────────────

export default function AppDashboard() {
  const { colors: C } = useApp();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("threat_index");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hoveredBubble, setHoveredBubble] = useState<number | null>(null);

  // Auth is handled by ProtectedRoute in App.tsx — no need to check here.
  // Use the existing invite-code token for API auth.
  useEffect(() => {
    (async () => {
      try {
        const token = localStorage.getItem("rebase_token") || "";
        const res = await fetch("/api/v2/dashboard?industry=bag", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setError(d.detail || d.error || `Error ${res.status}`);
          return;
        }
        const d: DashboardData = await res.json();
        setData(d);
      } catch {
        setError("Network error. Please refresh to try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Sort logic ──────────────────────────────────────────────────────────────

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortedBrands = data ? [...data.competitors].sort((a, b) => {
    const av = a[sortKey];
    const bv = b[sortKey];
    if (typeof av === "string" && typeof bv === "string") {
      return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    }
    return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
  }) : [];

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

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${C.bd}`, borderTopColor: C.ac, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <div style={{ color: C.t2, fontSize: 14 }}>Loading intelligence data…</div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error ───────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 80, fontFamily: "system-ui, sans-serif" }}>
        <div style={{ width: 420, background: C.s1, border: `1px solid ${C.danger}44`, borderRadius: 12, padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.danger, marginBottom: 8 }}>Unable to load data</div>
          <div style={{ fontSize: 13, color: C.t2, marginBottom: 24 }}>{error}</div>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", background: C.ac, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // ── Dashboard ───────────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", color: C.tx }}>

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div style={{ padding: "24px 32px 0", display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: C.tx }}>竞品分析</h1>
          <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>Competitive Intelligence · {data.last_updated ? `Last updated ${formatDate(data.last_updated)}` : "Data refreshed nightly at 2am"}</div>
        </div>
      </div>

      {/* ── Main content ────────────────────────────────────────────────────── */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 24px 40px" }}>

        {/* ── Narrative summary (if present) ──────────────────────────────── */}
        {data.narrative && (
          <div style={{ ...cardStyle, borderLeft: `3px solid ${C.ac}`, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.ac, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>AI Summary</div>
            <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.7 }}>{data.narrative}</div>
          </div>
        )}

        {/* ── Competitive Landscape (SVG bubble chart) ─────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Competitive Landscape</div>

          {/* Legend */}
          <div style={{ display: "flex", gap: 20, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { color: "#ef4444", label: "High threat + momentum" },
              { color: "#3b82f6", label: "Rising (low threat)" },
              { color: "#f59e0b", label: "Niche (high threat)" },
              { color: "#6b7280", label: "Declining" },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.t2 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color }} />
                {label}
              </div>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <svg viewBox="0 0 680 420" width="100%" style={{ maxWidth: 680, display: "block" }}>
              {/* Background */}
              <rect x={0} y={0} width={680} height={420} fill="transparent" />

              {/* Quadrant shading */}
              <rect x={40} y={40} width={300} height={340} fill={C.s2} opacity={0.4} />
              <rect x={340} y={40} width={300} height={340} fill={C.s2} opacity={0.6} />

              {/* Axis lines */}
              <line x1={40} y1={40} x2={40} y2={385} stroke={C.bd} strokeWidth={1} />
              <line x1={40} y1={380} x2={645} y2={380} stroke={C.bd} strokeWidth={1} />

              {/* Grid lines */}
              {[25, 50, 75].map(v => (
                <g key={v}>
                  <line x1={40 + (v / 100) * 600} y1={40} x2={40 + (v / 100) * 600} y2={380} stroke={C.bd} strokeWidth={0.5} strokeDasharray="4,4" />
                  <line x1={40} y1={380 - (v / 100) * 340} x2={640} y2={380 - (v / 100) * 340} stroke={C.bd} strokeWidth={0.5} strokeDasharray="4,4" />
                </g>
              ))}

              {/* Axis labels */}
              <text x={340} y={414} textAnchor="middle" fill={C.t2} fontSize={11}>Threat Index →</text>
              <text x={14} y={210} textAnchor="middle" fill={C.t2} fontSize={11} transform="rotate(-90, 14, 210)">Momentum →</text>

              {/* Tick labels — X axis */}
              {[0, 25, 50, 75, 100].map(v => (
                <text key={v} x={40 + (v / 100) * 600} y={396} textAnchor="middle" fill={C.t2} fontSize={9}>{v}</text>
              ))}

              {/* Tick labels — Y axis */}
              {[0, 25, 50, 75, 100].map(v => (
                <text key={v} x={34} y={380 - (v / 100) * 340 + 4} textAnchor="end" fill={C.t2} fontSize={9}>{v}</text>
              ))}

              {/* Bubbles */}
              {data.competitors.map((brand, i) => {
                const cx = bubbleCx(brand.threat_index);
                const cy = bubbleCy(brand.momentum_score);
                const r = bubbleR(brand.wtp_score);
                const color = bubbleColor(brand);
                const isHovered = hoveredBubble === i;

                return (
                  <g key={i}
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
                      x={cx} y={cy + r + 12}
                      textAnchor="middle"
                      fill={C.tx}
                      fontSize={isHovered ? 11 : 10}
                      fontWeight={isHovered ? 700 : 400}
                    >
                      {brand.brand_name}
                    </text>

                    {/* Tooltip on hover */}
                    {isHovered && (
                      <g>
                        <rect
                          x={cx + r + 4} y={cy - 34}
                          width={160} height={68}
                          rx={4} ry={4}
                          fill={C.s1} stroke={color} strokeWidth={1}
                        />
                        <text x={cx + r + 12} y={cy - 18} fill={C.tx} fontSize={11} fontWeight={700}>
                          {brand.brand_name}
                        </text>
                        <text x={cx + r + 12} y={cy - 4} fill={C.t2} fontSize={10}>
                          Threat: {brand.threat_index}  Momentum: {brand.momentum_score}
                        </text>
                        <text x={cx + r + 12} y={cy + 12} fill={C.t2} fontSize={10}>
                          WTP Score: {brand.wtp_score}
                        </text>
                        <text x={cx + r + 12} y={cy + 26} fill={color} fontSize={10} fontWeight={600}>
                          {brand.threat_index >= 50 && brand.momentum_score >= 50 ? "⚠ High Priority" :
                            brand.momentum_score >= 50 ? "↑ Rising" :
                            brand.threat_index >= 50 ? "◆ Niche Threat" : "↓ Declining"}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div style={{ fontSize: 11, color: C.t2, marginTop: 8 }}>
            Bubble size represents Willingness-to-Pay (WTP) score. Hover bubbles for details.
          </div>
        </div>

        {/* ── Brand Scores Table ──────────────────────────────────────────────── */}
        <div style={cardStyle}>
          <div style={sectionTitle}>Brand Scores</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {([
                    ["brand_name", "Brand"],
                    ["momentum_score", "Momentum"],
                    ["threat_index", "Threat Index"],
                    ["wtp_score", "WTP Score"],
                  ] as [SortKey, string][]).map(([key, label]) => (
                    <th key={key} style={thStyle} onClick={() => handleSort(key)}>
                      {label}
                      {sortKey === key ? (sortDir === "desc" ? " ↓" : " ↑") : " ↕"}
                    </th>
                  ))}
                  <th style={{ ...thStyle, cursor: "default" }}>Trend Signals</th>
                </tr>
              </thead>
              <tbody>
                {sortedBrands.map((brand, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : C.s2 + "55" }}>
                    <td style={tdStyle}>
                      <div style={{ fontWeight: 600 }}>{brand.brand_name}</div>
                      {brand.brand_name_en && <div style={{ fontSize: 11, color: C.t2 }}>{brand.brand_name_en}</div>}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: C.bd, borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                          <div style={{ width: `${brand.momentum_score}%`, height: "100%", background: brand.momentum_score >= 50 ? "#3b82f6" : C.t2, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: brand.momentum_score >= 70 ? "#3b82f6" : C.tx, minWidth: 28 }}>{brand.momentum_score}</span>
                      </div>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 6, background: C.bd, borderRadius: 3, overflow: "hidden", minWidth: 60 }}>
                          <div style={{ width: `${brand.threat_index}%`, height: "100%", background: brand.threat_index >= 60 ? C.danger : brand.threat_index >= 40 ? "#f59e0b" : C.success, borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: brand.threat_index >= 60 ? C.danger : C.tx, minWidth: 28 }}>{brand.threat_index}</span>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, fontWeight: 600, fontSize: 14 }}>
                      {brand.wtp_score}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {(brand.trend_signals || []).slice(0, 3).map((sig, j) => (
                          <span key={j} style={{ fontSize: 11, background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 4, padding: "2px 6px", color: C.t2, whiteSpace: "nowrap" }}>
                            {sig}
                          </span>
                        ))}
                        {(brand.trend_signals || []).length === 0 && (
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

        {/* ── Action Items ────────────────────────────────────────────────────── */}
        {data.action_items && data.action_items.length > 0 && (
          <div style={cardStyle}>
            <div style={sectionTitle}>Action Items</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.action_items.map((item, i) => {
                const pColor = priorityColor(item.priority, C as unknown as Record<string, string>);
                return (
                  <div key={i} style={{ display: "flex", gap: 14, padding: "14px 16px", background: C.s2, borderRadius: 8, border: `1px solid ${C.bd}`, borderLeft: `3px solid ${pColor}` }}>
                    <div style={{ flexShrink: 0, marginTop: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: pColor, background: pColor + "18", border: `1px solid ${pColor}44`, borderRadius: 4, padding: "2px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {item.priority}
                      </span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 4 }}>{item.title}</div>
                      <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>{item.description}</div>
                    </div>
                    <div style={{ flexShrink: 0, fontSize: 18, color: C.bd }}>
                      {item.priority === "high" ? "🔴" : item.priority === "medium" ? "🟡" : "🟢"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Footer ──────────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", fontSize: 12, color: C.t2, paddingTop: 8, paddingBottom: 32 }}>
          Powered by Rebase · Data refreshed automatically every 24 hours
        </div>
      </div>
    </div>
  );
}
