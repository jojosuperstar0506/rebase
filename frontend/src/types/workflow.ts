// ─── Node Types ───

export type NodeType =
  | "task"
  | "decision"
  | "handoff"
  | "approval"
  | "data_entry"
  | "notification";

export interface WorkflowNode {
  id: string;
  name: string;                       // Chinese label
  name_en: string;                    // English label
  department: string;                 // "销售部", "仓储部", "财务部", "采购部", "客服部"
  node_type: NodeType;
  tool_used: string | null;           // "Excel", "微信", "用友U8", "纸质", "钉钉", etc.
  avg_time_minutes: number | null;
  cost_per_execution_rmb: number | null;
  error_rate: number | null;          // 0-1
  is_manual: boolean;
}

export interface WorkflowEdge {
  source_id: string;
  target_id: string;
  condition: string | null;           // "金额 > 50000"
  frequency: string | null;           // "每天", "每单", "每周"
  avg_wait_minutes: number | null;
}

export interface WorkflowGraph {
  tenant_id: string;
  workflow_name: string;              // Chinese
  workflow_name_en: string;           // English
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  version: number;
}

// ─── Gap Analysis ───

export type Severity = "high" | "medium" | "low";
export type Difficulty = "easy" | "medium" | "hard";

export interface Bottleneck {
  node_id: string;
  reason: string;                     // Chinese
  reason_en: string;
  severity: Severity;
  time_waste_minutes: number;
}

export interface AutomationOpp {
  node_id: string;
  current_state: string;
  recommended_state: string;
  current_state_en: string;
  recommended_state_en: string;
  estimated_time_saved_minutes: number;
  estimated_cost_saved_rmb: number;
  difficulty: Difficulty;
  suggested_tools: string[];
  best_practice_reference: string;    // Chinese
}

export interface GapAnalysis {
  total_time_minutes: number;
  total_cost_rmb: number;
  manual_step_count: number;
  automated_step_count: number;
  automation_rate: number;            // 0-1
  industry_benchmark_rate: number;    // 0-1
  bottlenecks: Bottleneck[];
  opportunities: AutomationOpp[];
  summary: string;                    // Chinese executive summary
  summary_en: string;
}

// ─── Optimized Workflow (v1.1) ───

export interface OptimizedWorkflowNode extends WorkflowNode {
  optimization_note: string;          // CN: "从手动Excel录入升级为聚水潭ERP自动同步"
  optimization_note_en: string;
  original_node_id: string | null;    // maps back to original graph node, null if step is new
  time_reduction_pct: number;         // 0-1, how much time saved vs original
}

export interface ComparisonData {
  original: WorkflowGraph;
  optimized: WorkflowGraph;           // nodes are OptimizedWorkflowNode[]
  comparison_summary: string;         // CN executive comparison summary
  comparison_summary_en: string;
  benchmark_sources: string[];        // ["聚水潭官方数据", "iResearch 2025电商SaaS报告"]
}

// ─── API Response ───

export interface WorkflowScoutResponse {
  graph: WorkflowGraph;
  analysis: GapAnalysis;
  comparison: ComparisonData | null;  // null if Call 3 fails (graceful degradation)
}

// ─── UI State ───

export type ScoutStatus = "idle" | "loading" | "ready" | "error";

export interface ScoutState {
  status: ScoutStatus;
  description: string;
  files: File[];
  result: WorkflowScoutResponse | null;
  error: string | null;
  selectedNodeId: string | null;
}
