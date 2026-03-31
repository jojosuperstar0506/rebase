import { useEffect } from "react";
import type {
  GapAnalysis,
  WorkflowGraph,
  WorkflowNode,
  ComparisonData,
  OptimizedWorkflowNode,
  Difficulty,
  Severity,
} from "../../types/workflow";

// Design tokens
const S2 = "#1c1c28";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";
const GREEN = "#22c55e";

interface InsightsPanelProps {
  analysis: GapAnalysis;
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
  comparison: ComparisonData | null;
  currentView: "original" | "optimized";
}

// ─── Helpers ───

function severityColor(severity: Severity): string {
  if (severity === "high") return "#ef4444";
  if (severity === "medium") return "#f59e0b";
  return "#6b7280";
}

function severityLabel(severity: Severity): string {
  if (severity === "high") return "高";
  if (severity === "medium") return "中";
  return "低";
}

function difficultyStars(difficulty: Difficulty): string {
  if (difficulty === "easy") return "⭐ 简单 (1-2周)";
  if (difficulty === "medium") return "⭐⭐ 中等 (2-8周)";
  return "⭐⭐⭐ 复杂 (2个月+)";
}

function formatCost(rmb: number): string {
  if (rmb >= 10000) return `¥${(rmb / 10000).toFixed(1)}万`;
  return `¥${Math.round(rmb).toLocaleString()}`;
}

function asOptimized(node: WorkflowNode): OptimizedWorkflowNode | null {
  const n = node as Partial<OptimizedWorkflowNode>;
  return n.optimization_note !== undefined ? (node as OptimizedWorkflowNode) : null;
}

// ─── Optimized view ───

function OptimizedView({
  comparison,
  selectedNodeId,
  onNodeSelect,
}: {
  comparison: ComparisonData;
  selectedNodeId: string | null;
  onNodeSelect: (id: string) => void;
}) {
  const origNodeMap = Object.fromEntries(comparison.original.nodes.map((n) => [n.id, n]));

  // Only nodes that were explicitly optimized (have optimization_note)
  const optNodes = comparison.optimized.nodes
    .map((n) => asOptimized(n))
    .filter((n): n is OptimizedWorkflowNode => n !== null && !!n.optimization_note);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>

      {/* ── Comparison Summary ── */}
      <div
        style={{
          background: `${AC}08`,
          borderLeft: `3px solid ${AC}`,
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <div style={{ fontSize: 12, color: AC, fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>
          🏆 行业标杆对比摘要
        </div>
        <p style={{ fontSize: 14, color: TX, lineHeight: 1.7, margin: 0 }}>
          {comparison.comparison_summary}
        </p>
      </div>

      {/* ── Optimization Details ── */}
      <section>
        <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 12 }}>
          🏆 优化详情
        </div>

        {optNodes.length === 0 && (
          <div style={{ color: T2, fontSize: 14, padding: "12px 0" }}>
            暂无详细优化数据
          </div>
        )}

        {optNodes.map((optNode) => {
          const isSelected = selectedNodeId === optNode.id;
          const isNew = !optNode.original_node_id;
          const origNode = optNode.original_node_id ? origNodeMap[optNode.original_node_id] : null;
          const reductionPct = Math.round((optNode.time_reduction_pct ?? 0) * 100);

          return (
            <div
              key={optNode.id}
              data-node-id={optNode.id}
              onClick={() => onNodeSelect(optNode.id)}
              style={{
                background: isSelected ? `${AC}08` : S2,
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                cursor: "pointer",
                border: isSelected ? `1px solid ${AC}60` : "1px solid transparent",
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: AC }}>
                  🏆 {optNode.name}
                </span>
                {isNew ? (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: GREEN,
                    background: `${GREEN}15`, border: `1px solid ${GREEN}40`,
                    borderRadius: 10, padding: "2px 8px",
                  }}>
                    ✨ 新增步骤
                  </span>
                ) : reductionPct > 0 ? (
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: GREEN,
                    background: `${GREEN}15`, border: `1px solid ${GREEN}40`,
                    borderRadius: 10, padding: "2px 8px",
                  }}>
                    ↓ {reductionPct}%
                  </span>
                ) : null}
              </div>

              {/* Before (original step) */}
              {origNode && (
                <div style={{
                  fontSize: 13, color: T2, marginBottom: 8,
                  paddingBottom: 8, borderBottom: `1px solid #2a2a3a`,
                  opacity: 0.7,
                }}>
                  <div style={{ marginBottom: 2 }}>
                    <span style={{ color: T2 }}>原流程：</span>
                    <span style={{ textDecoration: "line-through", color: T2 }}>{origNode.name}</span>
                  </div>
                  <div style={{ fontSize: 12, color: T2 }}>
                    {origNode.tool_used && <span>工具：{origNode.tool_used}</span>}
                    {origNode.avg_time_minutes != null && (
                      <span style={{ marginLeft: 10 }}>⏱ {origNode.avg_time_minutes}分钟</span>
                    )}
                  </div>
                </div>
              )}

              {/* After (optimized step) */}
              <div style={{ fontSize: 13, marginBottom: 10 }}>
                <div style={{ marginBottom: 2 }}>
                  <span style={{ color: T2 }}>优化后：</span>
                  <span style={{ color: AC, fontWeight: 600 }}>{optNode.name}</span>
                </div>
                <div style={{ fontSize: 12, color: T2 }}>
                  {optNode.tool_used && <span style={{ color: AC }}>工具：{optNode.tool_used}</span>}
                  {optNode.avg_time_minutes != null && (
                    <span style={{ marginLeft: 10 }}>⏱ {optNode.avg_time_minutes}分钟</span>
                  )}
                </div>
              </div>

              {/* Optimization note */}
              <div style={{
                fontSize: 13, color: TX, lineHeight: 1.6,
                fontStyle: "italic", opacity: 0.85,
              }}>
                {optNode.optimization_note}
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Benchmark Sources ── */}
      {comparison.benchmark_sources.length > 0 && (
        <section>
          <div style={{ fontSize: 14, fontWeight: 700, color: T2, marginBottom: 10 }}>
            📊 数据来源
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            {comparison.benchmark_sources.map((src, i) => (
              <div key={i} style={{ fontSize: 12, color: T2, lineHeight: 1.5 }}>
                · {src}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: T2, opacity: 0.6, lineHeight: 1.5 }}>
            以上数据基于公开行业报告和企业案例，仅供参考
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main export ───

export default function InsightsPanel({
  analysis,
  graph,
  selectedNodeId,
  onNodeSelect,
  comparison,
  currentView,
}: InsightsPanelProps) {
  const nodeMap = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  // Auto-scroll to selected card when selectedNodeId changes
  useEffect(() => {
    if (!selectedNodeId) return;
    const el = document.querySelector<HTMLElement>(`[data-node-id="${selectedNodeId}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedNodeId]);

  const containerStyle: React.CSSProperties = {
    overflowY: "auto",
    overflowX: "hidden",
    maxHeight: "calc(100vh - 200px)",
    display: "flex",
    flexDirection: "column",
    gap: 24,
    wordBreak: "break-word",
    overflowWrap: "break-word",
  };

  // ── Optimized view ──
  if (currentView === "optimized" && comparison) {
    return (
      <div style={containerStyle}>
        <OptimizedView
          comparison={comparison}
          selectedNodeId={selectedNodeId}
          onNodeSelect={onNodeSelect}
        />
      </div>
    );
  }

  // ── Original v1.0 view ──
  return (
    <div style={containerStyle}>
      {/* Executive Summary */}
      <div style={{ background: `${AC}10`, borderLeft: `3px solid ${AC}`, borderRadius: 8, padding: "14px 16px", overflow: "hidden" }}>
        <div style={{ fontSize: 12, color: AC, fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>
          AI 分析摘要
        </div>
        <p style={{ fontSize: 14, color: TX, lineHeight: 1.7, margin: 0, wordBreak: "break-word", overflowWrap: "break-word" }}>
          {analysis.summary}
        </p>
      </div>

      {/* Bottlenecks */}
      <section>
        <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 12 }}>
          🔴 关键瓶颈
        </div>

        {analysis.bottlenecks.length === 0 && (
          <div style={{ color: GREEN, fontSize: 14, padding: "12px 0" }}>✅ 未发现明显瓶颈</div>
        )}

        {analysis.bottlenecks.map((b) => {
          const node = nodeMap[b.node_id];
          const nodeName = node?.name ?? "未知步骤";
          const isSelected = selectedNodeId === b.node_id;
          const sColor = severityColor(b.severity);
          return (
            <div
              key={b.node_id}
              data-node-id={b.node_id}
              onClick={() => onNodeSelect(b.node_id)}
              style={{
                background: isSelected ? `${AC}08` : S2,
                borderLeft: `3px solid ${isSelected ? AC : sColor}`,
                borderRadius: 8, padding: 16, marginBottom: 12, cursor: "pointer",
                outline: isSelected ? `1px solid ${AC}50` : "1px solid transparent",
                transition: "background 0.2s, outline 0.2s, border-color 0.2s",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: TX, wordBreak: "break-word", overflowWrap: "break-word", minWidth: 0 }}>{nodeName}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: sColor, borderRadius: 4, padding: "2px 8px", letterSpacing: "0.05em", flexShrink: 0 }}>
                  {severityLabel(b.severity)}
                </span>
              </div>
              <p style={{ fontSize: 13, color: T2, margin: "0 0 10px", lineHeight: 1.6, wordBreak: "break-word", overflowWrap: "break-word" }}>{b.reason}</p>
              <div style={{ fontSize: 12, color: T2 }}>
                ⏱ 每日浪费 <span style={{ color: sColor, fontWeight: 600 }}>{b.time_waste_minutes}</span> 分钟
              </div>
            </div>
          );
        })}
      </section>

      {/* Automation Opportunities */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: TX }}>💡 自动化建议</span>
          <span style={{ fontSize: 12, color: T2 }}>按月节省金额排序</span>
        </div>

        {analysis.opportunities.length === 0 && (
          <div style={{ color: T2, fontSize: 14, padding: "12px 0" }}>暂无自动化建议</div>
        )}

        {analysis.opportunities.map((opp) => {
          const node = nodeMap[opp.node_id];
          const nodeName = node?.name ?? "未知步骤";
          const isSelected = selectedNodeId === opp.node_id;
          return (
            <div
              key={opp.node_id}
              data-node-id={opp.node_id}
              onClick={() => onNodeSelect(opp.node_id)}
              style={{
                background: isSelected ? `${AC}08` : S2,
                borderRadius: 8, padding: "16px 20px", marginBottom: 12, cursor: "pointer",
                border: isSelected ? `1px solid ${AC}60` : "1px solid transparent",
                transition: "background 0.2s, border-color 0.2s",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: TX, marginBottom: 10 }}>💡 {nodeName}</div>
              <div style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.6 }}>
                <span style={{ color: T2 }}>现状：</span><span style={{ color: TX }}>{opp.current_state}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
                <span style={{ color: T2 }}>建议：</span><span style={{ color: AC }}>{opp.recommended_state}</span>
              </div>
              {opp.suggested_tools.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: T2, marginBottom: 6 }}>推荐工具：</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {opp.suggested_tools.map((tool) => (
                      <span key={tool} style={{ background: `${AC}15`, border: `1px solid ${AC}40`, borderRadius: 16, padding: "4px 12px", fontSize: 12, color: AC }}>
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: T2 }}>预估月节省：</span>
                  <span style={{ color: GREEN, fontWeight: 700 }}>{formatCost(opp.estimated_cost_saved_rmb)}/月</span>
                </div>
                <div style={{ fontSize: 12, color: T2 }}>{difficultyStars(opp.difficulty)}</div>
              </div>
              <div style={{ fontSize: 12, color: T2, borderTop: "1px solid #2a2a3a", paddingTop: 10, lineHeight: 1.6, fontStyle: "italic" }}>
                📌 {opp.best_practice_reference}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
