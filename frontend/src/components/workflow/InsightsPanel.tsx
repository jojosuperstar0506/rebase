import { useEffect, useRef, useState } from "react";
import type { GapAnalysis, WorkflowGraph, WorkflowNode, ComparisonData, AutomationOpp, Bottleneck, OptimizedWorkflowNode, Difficulty, Severity } from "../../types/workflow";
import { useApp } from "../../context/AppContext";

// Semantic status colors — intentionally NOT theme tokens (data-viz colors)
const GREEN = "#22c55e";
const RED   = "#ef4444";
const AMBER = "#f59e0b";
const GRAY  = "#6b7280";

function severityColor(s: Severity): string {
  if (s === "high") return RED;
  if (s === "medium") return AMBER;
  return GRAY;
}
function severityLabel(s: Severity): string {
  if (s === "high") return "高";
  if (s === "medium") return "中";
  return "低";
}
function difficultyInfo(d: Difficulty): { text: string; color: string } {
  if (d === "easy")   return { text: "⭐ 简单 (1-2周)",  color: GREEN };
  if (d === "medium") return { text: "⭐⭐ 中等 (2-8周)", color: AMBER };
  return                       { text: "⭐⭐⭐ 复杂 (2月+)", color: RED };
}
function formatCost(rmb: number): string {
  if (rmb >= 10000) return `¥${(rmb / 10000).toFixed(1)}万`;
  return `¥${Math.round(rmb).toLocaleString()}`;
}
function statusDotColor(node: WorkflowNode, bottleneckMap: Map<string, Severity>): string {
  if (node.node_type === "decision" || node.node_type === "handoff") return GRAY;
  const sev = bottleneckMap.get(node.id);
  if (sev === "high") return RED;
  if (sev === "medium" || sev === "low") return AMBER;
  return GREEN;
}
function asOptimized(node: WorkflowNode): OptimizedWorkflowNode | null {
  const n = node as Partial<OptimizedWorkflowNode>;
  return n.optimization_note !== undefined ? (node as OptimizedWorkflowNode) : null;
}

// ─── StatRow ───

function StatRow({ label, value, valueColor, t2Color }: { label: string; value: string; valueColor?: string; t2Color: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
      <span style={{ fontSize: 12, color: t2Color }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? t2Color }}>{value}</span>
    </div>
  );
}

// ─── BeforeAfterCard ───

function BeforeAfterCard({ currentView, node, opportunity, optNode, origNode }: { currentView: "original" | "optimized"; node: WorkflowNode; opportunity: AutomationOpp | null; optNode: OptimizedWorkflowNode | null; origNode: WorkflowNode | null }) {
  const { colors: C } = useApp();
  let leftTitle = "当前状态", rightTitle = "优化建议";
  let leftTool: string | null = null, leftTime: number | null = null, leftError: number | null = null, leftDesc: string | null = null;
  let rightTool: string | null = null, rightTime: number | null = null, rightError: number | null = null, rightDesc: string | null = null;

  if (currentView === "original" && opportunity) {
    leftTool = node.tool_used; leftTime = node.avg_time_minutes; leftError = node.error_rate; leftDesc = opportunity.current_state;
    rightTool = opportunity.suggested_tools[0] ?? null;
    rightTime = node.avg_time_minutes != null ? Math.max(1, node.avg_time_minutes - opportunity.estimated_time_saved_minutes) : null;
    rightDesc = opportunity.recommended_state;
  } else if (currentView === "optimized" && optNode && origNode) {
    leftTitle = "原流程"; rightTitle = "行业标杆";
    leftTool = origNode.tool_used; leftTime = origNode.avg_time_minutes; leftError = origNode.error_rate;
    rightTool = optNode.tool_used; rightTime = optNode.avg_time_minutes; rightError = optNode.error_rate;
  }

  const cardBase: React.CSSProperties = { flex: 1, minWidth: 0, borderRadius: 8, padding: "12px 14px", wordBreak: "break-word", overflowWrap: "break-word" };

  return (
    <>
      <style>{`@media (max-width: 768px) { .ba-row { flex-direction: column !important; } .ba-arrow { transform: rotate(90deg); } }`}</style>
      <div className="ba-row" style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
        <div style={{ ...cardBase, background: "rgba(239,68,68,0.08)", borderLeft: `3px solid ${RED}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: RED, marginBottom: 8, letterSpacing: "0.05em" }}>{leftTitle}</div>
          {leftTool  && <StatRow label="工具"   value={leftTool}                              t2Color={C.t2} />}
          {leftTime  != null && <StatRow label="⏱ 时长" value={`${leftTime}分钟`}            t2Color={C.t2} />}
          {leftError != null && <StatRow label="错误率"  value={`${(leftError * 100).toFixed(1)}%`} valueColor={RED} t2Color={C.t2} />}
          {leftDesc  && <p style={{ fontSize: 12, color: C.t2, margin: "8px 0 0", lineHeight: 1.6 }}>{leftDesc}</p>}
        </div>
        <div className="ba-arrow" style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: C.t2, flexShrink: 0, padding: "0 2px" }}>→</div>
        <div style={{ ...cardBase, background: "rgba(34,197,94,0.08)", borderLeft: `3px solid ${GREEN}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: GREEN, marginBottom: 8, letterSpacing: "0.05em" }}>{rightTitle}</div>
          {rightTool  && <StatRow label="工具"   value={rightTool}                               valueColor={C.ac}  t2Color={C.t2} />}
          {rightTime  != null && <StatRow label="⏱ 时长" value={`${rightTime}分钟`}             valueColor={GREEN} t2Color={C.t2} />}
          {rightError != null && <StatRow label="错误率"  value={`${(rightError * 100).toFixed(1)}%`} valueColor={GREEN} t2Color={C.t2} />}
          {rightDesc  && <p style={{ fontSize: 12, color: C.t2, margin: "8px 0 0", lineHeight: 1.6 }}>{rightDesc}</p>}
        </div>
      </div>
    </>
  );
}

// ─── ImpactMetrics ───

function ImpactMetrics({ opportunity, timeSavedPct }: { opportunity: AutomationOpp | null; timeSavedPct: number | null }) {
  const { colors: C } = useApp();
  const diff    = opportunity ? difficultyInfo(opportunity.difficulty) : null;
  const savings = opportunity?.estimated_cost_saved_rmb;
  const metricBox: React.CSSProperties = { flex: 1, background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 8, padding: "12px 10px", textAlign: "center", minWidth: 0 };

  return (
    <>
      <style>{`@media (max-width: 768px) { .impact-row { flex-direction: column !important; } }`}</style>
      <div className="impact-row" style={{ display: "flex", gap: 8 }}>
        {timeSavedPct != null && (
          <div style={metricBox}>
            <div style={{ fontSize: 22, fontWeight: 700, color: GREEN }}>↓ {timeSavedPct}%</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>节省时间</div>
          </div>
        )}
        {savings != null && savings > 0 && (
          <div style={metricBox}>
            <div style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>{formatCost(savings)}/月</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>月节省</div>
          </div>
        )}
        {diff && (
          <div style={metricBox}>
            <div style={{ fontSize: 13, fontWeight: 700, color: diff.color, lineHeight: 1.3 }}>{diff.text}</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 4 }}>实施难度</div>
          </div>
        )}
      </div>
    </>
  );
}

// ─── OverviewMode ───

function OverviewMode({ analysis, graph, bottleneckMap, onNodeSelect }: { analysis: GapAnalysis; graph: WorkflowGraph; bottleneckMap: Map<string, Severity>; onNodeSelect: (id: string | null) => void }) {
  const { colors: C } = useApp();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const totalSavings = analysis.opportunities.reduce((sum, o) => sum + o.estimated_cost_saved_rmb, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* AI Executive Summary */}
      <div style={{ background: `${C.ac}10`, borderLeft: `3px solid ${C.ac}`, borderRadius: 8, padding: "14px 16px", overflow: "hidden" }}>
        <div style={{ fontSize: 12, color: C.ac, fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>AI 分析摘要</div>
        <p style={{ fontSize: 14, color: C.tx, lineHeight: 1.8, margin: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>{analysis.summary}</p>
      </div>

      {/* Node list */}
      <section>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.tx, marginBottom: 10 }}>
          📋 流程步骤 <span style={{ fontSize: 13, fontWeight: 400, color: C.t2 }}>Process Steps</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {graph.nodes.map((node) => {
            const dotColor = statusDotColor(node, bottleneckMap);
            const isHovered = hoveredId === node.id;
            return (
              <div
                key={node.id}
                onClick={() => onNodeSelect(node.id)}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, cursor: "pointer", background: isHovered ? C.s2 : "transparent", transition: "background 0.15s", minHeight: 40 }}
              >
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />
                <span style={{ fontSize: 14, color: C.tx, flex: 1, minWidth: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>{node.name}</span>
                {node.tool_used && <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>{node.tool_used}</span>}
                {node.avg_time_minutes != null && <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>{node.avg_time_minutes}分钟</span>}
                <span style={{ fontSize: 12, color: C.t2, flexShrink: 0 }}>→</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* Quick stats */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 12, borderTop: `1px solid ${C.bd}` }}>
        <span style={{ fontSize: 13, color: C.t2 }}>🔴 <span style={{ color: RED, fontWeight: 600 }}>{analysis.bottlenecks.length}</span> 个瓶颈</span>
        <span style={{ fontSize: 13, color: C.t2 }}>💡 <span style={{ color: C.ac, fontWeight: 600 }}>{analysis.opportunities.length}</span> 个优化机会</span>
        {totalSavings > 0 && <span style={{ fontSize: 13, color: C.t2 }}>💰 月节省潜力 <span style={{ color: GREEN, fontWeight: 600 }}>{formatCost(totalSavings)}</span></span>}
      </div>
    </div>
  );
}

// ─── DetailMode ───

function DetailMode({ node, analysis, comparison, currentView, onBack, onShowContact, bottleneckMap }: { node: WorkflowNode; analysis: GapAnalysis; comparison: ComparisonData | null; currentView: "original" | "optimized"; onBack: () => void; onShowContact: (nodeName?: string) => void; bottleneckMap: Map<string, Severity> }) {
  const { colors: C } = useApp();
  const bottleneck  = analysis.bottlenecks.find((b) => b.node_id === node.id);
  const opportunity = analysis.opportunities.find((o) => o.node_id === node.id);
  const dotColor = statusDotColor(node, bottleneckMap);
  const optNode  = currentView === "optimized" ? asOptimized(node) : null;
  const origNode = optNode?.original_node_id && comparison ? (comparison.original.nodes.find((n) => n.id === optNode.original_node_id) ?? null) : null;

  let timeSavedPct: number | null = null;
  if (currentView === "optimized" && optNode && optNode.time_reduction_pct > 0) {
    timeSavedPct = Math.round(optNode.time_reduction_pct * 100);
  } else if (currentView === "original" && opportunity && node.avg_time_minutes && node.avg_time_minutes > 0) {
    timeSavedPct = Math.round((opportunity.estimated_time_saved_minutes / node.avg_time_minutes) * 100);
  }

  const showBeforeAfter = (currentView === "original" && (!!bottleneck || !!opportunity)) || (currentView === "optimized" && !!optNode && !!origNode);
  const showImpact = (currentView === "original" && !!opportunity) || (currentView === "optimized" && !!optNode && optNode.time_reduction_pct > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <button onClick={onBack} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", padding: 0, cursor: "pointer", color: C.t2, fontSize: 14, fontFamily: "inherit", alignSelf: "flex-start" }}>← 返回概览</button>

      <div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, marginTop: 6, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: C.tx, wordBreak: "break-word", overflowWrap: "break-word", flex: 1, minWidth: 0 }}>{node.name}</span>
              {bottleneck && <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: severityColor(bottleneck.severity), borderRadius: 4, padding: "2px 8px", flexShrink: 0, alignSelf: "center" }}>{severityLabel(bottleneck.severity)}</span>}
              {currentView === "optimized" && optNode && <span style={{ fontSize: 11, fontWeight: 700, color: GREEN, background: `${GREEN}15`, border: `1px solid ${GREEN}40`, borderRadius: 4, padding: "2px 8px", flexShrink: 0, alignSelf: "center" }}>✨ 已优化</span>}
            </div>
            {node.name_en && <div style={{ fontSize: 13, color: C.t2, marginTop: 3 }}>{node.name_en}</div>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 13, color: C.t2, paddingLeft: 20 }}>
          {node.department && <span>🏢 {node.department}</span>}
          {node.tool_used  && <span>🔧 {node.tool_used}</span>}
          {node.avg_time_minutes != null && <span>⏱ {node.avg_time_minutes}分钟</span>}
          <span>{node.is_manual ? "👤 人工" : "⚡ 自动"}</span>
        </div>
      </div>

      {showBeforeAfter && <BeforeAfterCard currentView={currentView} node={node} opportunity={opportunity ?? null} optNode={optNode} origNode={origNode} />}
      {showImpact && <ImpactMetrics opportunity={opportunity ?? null} timeSavedPct={timeSavedPct} />}

      {currentView === "original" && opportunity && opportunity.suggested_tools.length > 0 && (
        <section>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 10 }}>推荐工具</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {opportunity.suggested_tools.map((tool) => (
              <span key={tool} style={{ background: `${C.ac}12`, border: `1px solid ${C.ac}30`, borderRadius: 16, padding: "6px 14px", fontSize: 13, color: C.ac }}>{tool}</span>
            ))}
          </div>
        </section>
      )}

      {currentView === "original" && opportunity && (
        <section>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 10 }}>📌 行业参考</div>
          <div style={{ background: C.s1, borderLeft: `3px solid ${C.ac}`, borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ fontSize: 13, color: C.tx, lineHeight: 1.7, margin: "0 0 8px", wordBreak: "break-word", overflowWrap: "break-word" }}>{opportunity.best_practice_reference}</p>
            <div style={{ fontSize: 12, color: C.t2 }}>来源：行业最佳实践案例</div>
          </div>
        </section>
      )}

      {currentView === "optimized" && optNode && optNode.optimization_note && (
        <section>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 10 }}>✨ 优化说明</div>
          <div style={{ background: `${GREEN}08`, borderLeft: `3px solid ${GREEN}`, borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ fontSize: 13, color: C.tx, lineHeight: 1.7, margin: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>{optNode.optimization_note}</p>
          </div>
        </section>
      )}

      {currentView === "original" && bottleneck && !opportunity && (
        <section>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 10 }}>🔴 瓶颈原因</div>
          <div style={{ background: C.s1, borderLeft: `3px solid ${severityColor(bottleneck.severity)}`, borderRadius: 8, padding: "14px 16px" }}>
            <p style={{ fontSize: 13, color: C.tx, lineHeight: 1.7, margin: "0 0 10px", wordBreak: "break-word", overflowWrap: "break-word" }}>{bottleneck.reason}</p>
            <div style={{ fontSize: 12, color: C.t2 }}>⏱ 每日浪费 <span style={{ color: severityColor(bottleneck.severity), fontWeight: 600 }}>{bottleneck.time_waste_minutes}</span> 分钟</div>
          </div>
        </section>
      )}

      {currentView === "original" && !bottleneck && !opportunity && (
        <div style={{ background: `${GREEN}08`, borderLeft: `3px solid ${GREEN}`, borderRadius: 8, padding: "14px 16px" }}>
          <div style={{ fontSize: 13, color: GREEN, fontWeight: 600, marginBottom: 4 }}>✅ 该步骤暂未发现明显瓶颈</div>
          <div style={{ fontSize: 13, color: C.t2 }}>This step has no significant bottlenecks detected.</div>
        </div>
      )}

      {currentView === "original" && opportunity && (
        <button onClick={() => onShowContact(node.name)} style={{ width: "100%", minHeight: 44, padding: "12px 24px", background: C.ac, border: "none", borderRadius: 8, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer", fontFamily: "inherit", wordBreak: "break-word" }}>
          获取该步骤优化方案 →
        </button>
      )}
    </div>
  );
}

// ─── Props & Main export ───

interface InsightsPanelProps {
  analysis: GapAnalysis;
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string | null) => void;
  comparison: ComparisonData | null;
  currentView: "original" | "optimized";
  onShowContact: (nodeName?: string) => void;
}

export default function InsightsPanel({ analysis, graph, selectedNodeId, onNodeSelect, comparison, currentView, onShowContact }: InsightsPanelProps) {
  const bottleneckMap = new Map<string, Severity>(analysis.bottlenecks.map((b) => [b.node_id, b.severity]));

  const [displayedId, setDisplayedId] = useState<string | null>(selectedNodeId);
  const [panelOpacity, setPanelOpacity] = useState(1);
  const prevModeRef = useRef<"overview" | "detail">(selectedNodeId ? "detail" : "overview");

  useEffect(() => {
    const nextMode = selectedNodeId !== null ? "detail" : "overview";
    if (prevModeRef.current !== nextMode) {
      setPanelOpacity(0);
      const t = setTimeout(() => { setDisplayedId(selectedNodeId); prevModeRef.current = nextMode; setPanelOpacity(1); }, 150);
      return () => clearTimeout(t);
    } else {
      setDisplayedId(selectedNodeId);
    }
  }, [selectedNodeId]);

  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => { containerRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }, [selectedNodeId]);

  const containerStyle: React.CSSProperties = { overflowY: "auto", overflowX: "hidden", maxHeight: "calc(100vh - 280px)", paddingRight: 16, wordBreak: "break-word", overflowWrap: "break-word", scrollbarWidth: "thin", opacity: panelOpacity, transition: "opacity 0.15s ease" };
  const displayedNode = displayedId ? graph.nodes.find((n) => n.id === displayedId) ?? null : null;

  if (displayedNode) {
    return (
      <div ref={containerRef} style={containerStyle}>
        <DetailMode node={displayedNode} analysis={analysis} comparison={comparison} currentView={currentView} onBack={() => onNodeSelect(null)} onShowContact={onShowContact} bottleneckMap={bottleneckMap} />
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      <OverviewMode analysis={analysis} graph={graph} bottleneckMap={bottleneckMap} onNodeSelect={onNodeSelect} />
    </div>
  );
}
