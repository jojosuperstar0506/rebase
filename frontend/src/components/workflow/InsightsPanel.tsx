import type { GapAnalysis, WorkflowGraph, Difficulty, Severity } from "../../types/workflow";

// Design tokens
const S2 = "#1c1c28";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

interface InsightsPanelProps {
  analysis: GapAnalysis;
  graph: WorkflowGraph;
  selectedNodeId: string | null;
  onNodeSelect: (nodeId: string) => void;
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

export default function InsightsPanel({
  analysis,
  graph,
  selectedNodeId,
  onNodeSelect,
}: InsightsPanelProps) {
  const nodeMap = Object.fromEntries(graph.nodes.map((n) => [n.id, n]));

  return (
    <div
      style={{
        overflowY: "auto",
        maxHeight: "calc(100vh - 200px)",
        display: "flex",
        flexDirection: "column",
        gap: 24,
      }}
    >
      {/* ── Executive Summary ── */}
      <div
        style={{
          background: `${AC}10`,
          borderLeft: `3px solid ${AC}`,
          borderRadius: 8,
          padding: "14px 16px",
        }}
      >
        <div style={{ fontSize: 12, color: AC, fontWeight: 600, marginBottom: 8, letterSpacing: "0.05em" }}>
          AI 分析摘要
        </div>
        <p style={{ fontSize: 14, color: TX, lineHeight: 1.7, margin: 0 }}>
          {analysis.summary}
        </p>
      </div>

      {/* ── Bottlenecks ── */}
      <section>
        <div style={{ fontSize: 16, fontWeight: 700, color: TX, marginBottom: 12 }}>
          🔴 关键瓶颈
        </div>

        {analysis.bottlenecks.map((b) => {
          const node = nodeMap[b.node_id];
          const nodeName = node?.name ?? b.node_id;
          const isSelected = selectedNodeId === b.node_id;
          const sColor = severityColor(b.severity);

          return (
            <div
              key={b.node_id}
              onClick={() => onNodeSelect(b.node_id)}
              style={{
                background: S2,
                borderLeft: `3px solid ${isSelected ? AC : sColor}`,
                borderRadius: 8,
                padding: 16,
                marginBottom: 12,
                cursor: "pointer",
                outline: isSelected ? `1px solid ${AC}40` : "none",
                transition: "outline 0.15s, border-color 0.15s",
              }}
            >
              {/* Header row */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: TX }}>
                  {nodeName}
                </span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#fff",
                    background: sColor,
                    borderRadius: 4,
                    padding: "2px 8px",
                    letterSpacing: "0.05em",
                  }}
                >
                  {severityLabel(b.severity)}
                </span>
              </div>

              {/* Reason */}
              <p style={{ fontSize: 13, color: T2, margin: "0 0 10px", lineHeight: 1.6 }}>
                {b.reason}
              </p>

              {/* Time waste */}
              <div style={{ fontSize: 12, color: T2 }}>
                ⏱ 每日浪费 <span style={{ color: sColor, fontWeight: 600 }}>{b.time_waste_minutes}</span> 分钟
              </div>
            </div>
          );
        })}
      </section>

      {/* ── Automation Opportunities ── */}
      <section>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: TX }}>💡 自动化建议</span>
          <span style={{ fontSize: 12, color: T2 }}>按月节省金额排序</span>
        </div>

        {analysis.opportunities.map((opp) => {
          const node = nodeMap[opp.node_id];
          const nodeName = node?.name ?? opp.node_id;
          const isSelected = selectedNodeId === opp.node_id;

          return (
            <div
              key={opp.node_id}
              onClick={() => onNodeSelect(opp.node_id)}
              style={{
                background: S2,
                borderRadius: 8,
                padding: "16px 20px",
                marginBottom: 12,
                cursor: "pointer",
                border: isSelected ? `1px solid ${AC}60` : "1px solid transparent",
                transition: "border-color 0.15s",
              }}
            >
              {/* Node name */}
              <div style={{ fontSize: 14, fontWeight: 700, color: TX, marginBottom: 10 }}>
                💡 {nodeName}
              </div>

              {/* Current / Recommended */}
              <div style={{ fontSize: 13, marginBottom: 4, lineHeight: 1.6 }}>
                <span style={{ color: T2 }}>现状：</span>
                <span style={{ color: TX }}>{opp.current_state}</span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 12, lineHeight: 1.6 }}>
                <span style={{ color: T2 }}>建议：</span>
                <span style={{ color: AC }}>{opp.recommended_state}</span>
              </div>

              {/* Tool pills */}
              {opp.suggested_tools.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, color: T2, marginBottom: 6 }}>推荐工具：</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {opp.suggested_tools.map((tool) => (
                      <span
                        key={tool}
                        style={{
                          background: `${AC}15`,
                          border: `1px solid ${AC}40`,
                          borderRadius: 16,
                          padding: "4px 12px",
                          fontSize: 12,
                          color: AC,
                        }}
                      >
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Savings + Difficulty */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13 }}>
                  <span style={{ color: T2 }}>预估月节省：</span>
                  <span style={{ color: "#22c55e", fontWeight: 700 }}>
                    {formatCost(opp.estimated_cost_saved_rmb)}/月
                  </span>
                </div>
                <div style={{ fontSize: 12, color: T2 }}>
                  {difficultyStars(opp.difficulty)}
                </div>
              </div>

              {/* Best practice */}
              <div
                style={{
                  fontSize: 12,
                  color: T2,
                  borderTop: "1px solid #2a2a3a",
                  paddingTop: 10,
                  lineHeight: 1.6,
                  fontStyle: "italic",
                }}
              >
                📌 {opp.best_practice_reference}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
