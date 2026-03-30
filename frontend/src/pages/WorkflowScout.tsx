import { useState } from "react";
import type { ScoutState } from "../types/workflow";
import IntakePanel from "../components/workflow/IntakePanel";
import LoadingView from "../components/workflow/LoadingView";
import SummaryBar from "../components/workflow/SummaryBar";
import GraphView from "../components/workflow/GraphView";
import InsightsPanel from "../components/workflow/InsightsPanel";

// Design tokens
const BG = "#0c0c14";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const T2 = "#9898a8";

// ─── Helpers ───

function cleanJsonResponse(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?\s*```$/i, "");
  if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  return cleaned;
}

// ─── System Prompts ───

const DECOMPOSE_SYSTEM_PROMPT = `You are a business process analyst specializing in Chinese retail and e-commerce operations (零售/电商). You decompose workflow descriptions into structured process graphs.

TASK: Given a user's description of a business workflow (and optionally extracted text from their uploaded documents), produce a WorkflowGraph JSON object.

RULES:
- Every distinct step mentioned becomes a WorkflowNode
- Infer node_type from context:
  - "task" = general work step
  - "data_entry" = manual typing/recording data
  - "decision" = branching point (if/then)
  - "approval" = requires someone's sign-off
  - "handoff" = work transfers between departments
  - "notification" = alerting/informing someone
- Infer department from context. Use Chinese department names: 销售部, 仓储部, 财务部, 采购部, 客服部, 运营部, 产品部, 技术部, 行政部, 人事部
- Infer tool_used from context: "Excel" for spreadsheets, "微信" for WeChat, "纸质" for paper forms, "电话" for phone calls, "钉钉" for DingTalk, "飞书" for Feishu/Lark, "用友U8"/"金蝶" for ERP mentions, "淘宝后台"/"抖音后台" for platform backends, null if unclear
- Set is_manual=true unless the step is clearly automated (system-to-system with no human intervention)
- Estimate avg_time_minutes based on retail industry norms if not explicitly stated. Use realistic estimates: data entry 10-30min, approvals 5-60min depending on complexity, picking/packing 15-45min, reconciliation 20-60min
- Estimate cost_per_execution_rmb based on: average retail staff ¥8,000/month = ~¥45/hour = ~¥0.75/minute. Multiply avg_time_minutes × 0.75.
- error_rate: estimate based on task type. Manual data entry: 0.03-0.08. Paper-based processes: 0.05-0.10. Automated: 0.001-0.01. Decision points: null.
- Create edges between sequential steps. Add conditions on edges where decision points create branches.
- All "name" fields in Chinese. All "name_en" fields in English.
- workflow_name: concise Chinese process name (e.g., "订单履约流程")
- workflow_name_en: English equivalent (e.g., "Order Fulfillment Process")
- Produce 6-15 nodes typically. Fewer only if the process is genuinely simple (3-5 steps described).
- Keep output concise. Use short node names (max 8 Chinese characters). Omit null fields. Target 6-10 nodes.
- tenant_id: always "demo"
- version: always 1

OUTPUT FORMAT: Return ONLY a valid JSON object matching the schema below. No markdown fences, no explanation, no preamble. Just the JSON.

SCHEMA:
{
  "tenant_id": "demo",
  "workflow_name": "string (Chinese)",
  "workflow_name_en": "string (English)",
  "description": "string (brief Chinese summary of the workflow)",
  "nodes": [
    {
      "id": "node_1",
      "name": "string (Chinese step name)",
      "name_en": "string (English step name)",
      "department": "string (Chinese dept name)",
      "node_type": "task|decision|handoff|approval|data_entry|notification",
      "tool_used": "string|null",
      "avg_time_minutes": number|null,
      "cost_per_execution_rmb": number|null,
      "error_rate": number|null,
      "is_manual": boolean
    }
  ],
  "edges": [
    {
      "source_id": "node_1",
      "target_id": "node_2",
      "condition": "string|null",
      "frequency": "string|null",
      "avg_wait_minutes": number|null
    }
  ],
  "version": 1
}`;

const GAP_ANALYSIS_SYSTEM_PROMPT = `You are a retail/e-commerce operations consultant (零售/电商运营顾问) with deep knowledge of Chinese SMB technology stacks. You analyze workflow graphs to identify inefficiencies and recommend specific automation solutions.

TASK: Given a WorkflowGraph JSON for a retail/e-commerce business, produce a GapAnalysis JSON with bottleneck identification, automation recommendations, and specific tool suggestions.

RETAIL/E-COMMERCE INDUSTRY BENCHMARKS (行业标杆数据):
- 订单处理 Order processing: Best-in-class <2 min (ERP auto-sync from all channels). Typical SMB: 15-45 min (manual entry from 微信/淘宝/抖音).
- 库存管理 Inventory: Best-in-class uses real-time ERP stock sync + barcode scanning. Typical SMB: daily/weekly manual Excel counts.
- 采购 Procurement: Best-in-class uses automated reorder points in ERP with supplier portal. Typical SMB: manual threshold checking in spreadsheets + 微信 supplier contact.
- 财务对账 Financial reconciliation: Best-in-class uses automated bank↔ERP matching with exception alerts. Typical SMB: manual Excel cross-referencing 30-60 min/day.
- 客服/售后 Customer service & returns: Best-in-class uses ticket system with SLA tracking + automated refund workflows. Typical SMB: 微信群 ad-hoc handling, shared Excel log.
- 报表 Reporting: Best-in-class uses automated dashboards pulling from ERP data. Typical SMB: weekly manual report compilation 2-4 hours.
- 审批 Approvals: Best-in-class uses 钉钉/飞书 automated approval flows with mobile notifications. Typical SMB: 微信 chat-based informal approvals.
- 行业自动化率基准 Automation rate benchmark: Leading e-commerce operations achieve 70-85% automation. Average SMB: 15-30%.

TOOL RECOMMENDATIONS FOR CHINESE RETAIL SMBs (工具推荐):
Category | Tools
ERP系统 | 用友U8, 用友好会计, 金蝶云星辰, 金蝶精斗云, 管家婆
电商ERP/订单管理 | 聚水潭ERP, 旺店通ERP, 网店管家, 万里牛
协作与审批 | 钉钉, 飞书, 企业微信
客服系统 | 企业微信客服, 智齿客服, 网易七鱼, 美洽
低代码平台 | 简道云, 明道云, 宜搭(钉钉), 氚云
RPA自动化 | 影刀RPA, 八爪鱼RPA, 来也UiBot
条码/仓储 | 条码扫描枪 + ERP条码模块, 旺店通WMS
财务工具 | 用友好会计, 金蝶精斗云, 票易通(发票管理)
数据分析 | 简道云报表, 明道云仪表盘, 帆软FineBI
AI智能化 | Rebase虚拟员工(多步骤复杂自动化), 通义千问(文档处理), 钉钉AI助理

RULES:
- Identify bottlenecks: any manual node with avg_time_minutes >= 15, or error_rate >= 0.05, or where tool_used is "纸质"/"Excel" for a task that has well-known SaaS alternatives
- Severity: "high" if time_waste >= 25 min or error_rate >= 0.08. "medium" if time_waste >= 15 min. "low" otherwise.
- Rank opportunities by estimated_cost_saved_rmb descending (highest savings first)
- estimated_cost_saved_rmb: calculate as (current_time - optimized_time) × ¥0.75/min × 22 working days/month
- suggested_tools MUST be specific real products available in China (from the list above). Never generic like "an ERP system" — always name the product.
- best_practice_reference: describe what leading retail/e-commerce companies actually do for this step. Write in Chinese. Be specific, not generic.
- difficulty: "easy" = SaaS signup + configuration (1-2 weeks), "medium" = integration/customization work (2-8 weeks), "hard" = custom development or major process redesign (2+ months)
- automation_rate = (nodes where is_manual=false) / (total nodes)
- industry_benchmark_rate: use 0.75 for retail/e-commerce
- summary: 2-3 sentences in Chinese. Mention: current automation rate vs benchmark, total potential monthly savings, top 1-2 priorities. Actionable tone.
- summary_en: English translation of summary.
- Include ALL bottleneck nodes, not just top 3. But limit automation opportunities to the top 5 most impactful.
- total_time_minutes: sum of all nodes' avg_time_minutes
- total_cost_rmb: total_time_minutes × ¥0.75

OUTPUT FORMAT: Return ONLY a valid JSON object matching the schema below. No markdown fences, no explanation, no preamble.

SCHEMA:
{
  "total_time_minutes": number,
  "total_cost_rmb": number,
  "manual_step_count": number,
  "automated_step_count": number,
  "automation_rate": number,
  "industry_benchmark_rate": 0.75,
  "bottlenecks": [
    {
      "node_id": "string (must match a node id from the input graph)",
      "reason": "string (Chinese — specific description of the waste)",
      "reason_en": "string (English translation)",
      "severity": "high|medium|low",
      "time_waste_minutes": number
    }
  ],
  "opportunities": [
    {
      "node_id": "string (must match a node id from the input graph)",
      "current_state": "string (Chinese — what happens today)",
      "recommended_state": "string (Chinese — what should happen)",
      "current_state_en": "string",
      "recommended_state_en": "string",
      "estimated_time_saved_minutes": number,
      "estimated_cost_saved_rmb": number,
      "difficulty": "easy|medium|hard",
      "suggested_tools": ["string — specific product names"],
      "best_practice_reference": "string (Chinese — what leading companies do)"
    }
  ],
  "summary": "string (Chinese, 2-3 sentences)",
  "summary_en": "string (English, 2-3 sentences)"
}`;

// ─── Component ───

export default function WorkflowScout() {
  const [state, setState] = useState<ScoutState>({
    status: "idle",
    description: "",
    files: [],
    result: null,
    error: null,
    selectedNodeId: null,
  });

  async function handleSubmit() {
    setState((s) => ({ ...s, status: "loading", error: null }));

    try {
      const description = state.description;

      if (description.length < 20) {
        setState((s) => ({ ...s, status: "error", error: "请输入至少20个字符的流程描述" }));
        return;
      }

      // Call 1 — Decompose workflow via /api/ai proxy
      const decomposeRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8192,
          system: DECOMPOSE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: description }],
        }),
      });

      if (!decomposeRes.ok) throw new Error("Workflow decomposition failed: " + decomposeRes.status);
      const decomposeData = await decomposeRes.json();
      const graphText = decomposeData.content?.[0]?.text ?? "";
      const graph = JSON.parse(cleanJsonResponse(graphText));

      if (!graph.nodes || graph.nodes.length === 0) {
        throw new Error("AI未能识别流程节点，请提供更详细的描述");
      }

      // Call 2 — Gap analysis via /api/ai proxy
      const analyzeRes = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 8192,
          system: GAP_ANALYSIS_SYSTEM_PROMPT,
          messages: [{ role: "user", content: "请分析以下业务流程图并提供优化建议：\n\n" + JSON.stringify(graph) }],
        }),
      });

      if (!analyzeRes.ok) throw new Error("Gap analysis failed: " + analyzeRes.status);
      const analyzeData = await analyzeRes.json();
      const analysisText = analyzeData.content?.[0]?.text ?? "";
      const analysis = JSON.parse(cleanJsonResponse(analysisText));

      setState((s) => ({ ...s, status: "ready", result: { graph, analysis } }));
    } catch (err: unknown) {
      setState((s) => ({
        ...s,
        status: "error",
        error: err instanceof Error ? err.message : "分析失败，请重试",
      }));
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {state.status === "idle" && (
        <IntakePanel
          description={state.description}
          files={state.files}
          onDescriptionChange={(d) =>
            setState((s) => ({ ...s, description: d }))
          }
          onFilesChange={(f) => setState((s) => ({ ...s, files: f }))}
          onSubmit={handleSubmit}
        />
      )}
      {state.status === "loading" && <LoadingView />}
      {state.status === "ready" && state.result && (
        <div>
          <style>{`
            .ws-title { padding: 16px 24px 0; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
            .ws-results { display: flex; gap: 0; min-height: calc(100vh - 240px); }
            .ws-graph { flex: 0 0 60%; border-right: 1px solid #2a2a3a; padding: 24px; overflow: hidden; }
            .ws-insights { flex: 0 0 40%; padding: 24px; overflow-y: auto; }
            .ws-bottom { padding: 16px 24px; border-top: 1px solid #2a2a3a; display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
            @media (max-width: 1024px) {
              .ws-graph { flex: 0 0 50%; padding: 16px; }
              .ws-insights { flex: 0 0 50%; padding: 16px; }
            }
            @media (max-width: 768px) {
              .ws-title { padding: 12px 16px 0; }
              .ws-results { flex-direction: column; min-height: unset; }
              .ws-graph { flex: none; max-height: 50vh; overflow: auto; border-right: none; border-bottom: 1px solid #2a2a3a; padding: 12px; }
              .ws-insights { flex: none; max-height: 50vh; overflow-y: auto; padding: 12px; }
              .ws-bottom { padding: 12px 16px; }
            }
          `}</style>

          {/* Title bar */}
          <div className="ws-title">
            <span style={{ fontSize: 18, fontWeight: 700, color: "#e4e4ec" }}>流程扫描结果</span>
            <span style={{ fontSize: 18, fontWeight: 400, color: T2 }}>
              — {state.result.graph.workflow_name}
            </span>
            {state.result.graph.workflow_name_en && (
              <span style={{ fontSize: 13, color: T2 }}>
                ({state.result.graph.workflow_name_en})
              </span>
            )}
          </div>
          <SummaryBar analysis={state.result.analysis} />
          <div className="ws-results">
            <div className="ws-graph">
              <GraphView
                graph={state.result.graph}
                bottlenecks={state.result.analysis.bottlenecks}
                selectedNodeId={state.selectedNodeId}
                onNodeClick={(id) =>
                  setState((s) => ({
                    ...s,
                    selectedNodeId: s.selectedNodeId === id ? null : id,
                  }))
                }
                onDeselect={() => setState((s) => ({ ...s, selectedNodeId: null }))}
              />
            </div>
            <div className="ws-insights">
              <InsightsPanel
                analysis={state.result.analysis}
                graph={state.result.graph}
                selectedNodeId={state.selectedNodeId}
                onNodeSelect={(id) =>
                  setState((s) => ({
                    ...s,
                    selectedNodeId: s.selectedNodeId === id ? null : id,
                  }))
                }
              />
            </div>
          </div>
          {/* Bottom bar */}
          <div className="ws-bottom">
            <button
              onClick={() => setState((s) => ({ ...s, status: "idle", result: null, error: null, description: "", files: [], selectedNodeId: null }))}
              style={{ minHeight: 44, padding: "8px 20px", background: "transparent", border: `1px solid ${BD}`, borderRadius: 6, color: T2, cursor: "pointer", fontSize: 14 }}
            >
              ← 重新扫描
            </button>
            <button
              style={{ minHeight: 44, padding: "10px 24px", background: AC, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
            >
              联系我们获取实施方案 →
            </button>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
          <div style={{ fontSize: 18, color: "#ef4444" }}>分析失败</div>
          <div style={{ fontSize: 14, color: T2, marginTop: 8 }}>{state.error}</div>
          <button
            onClick={() => setState((s) => ({ ...s, status: "idle", error: null }))}
            style={{ marginTop: 16, padding: "8px 20px", background: "transparent", border: `1px solid ${BD}`, borderRadius: 6, color: T2, cursor: "pointer" }}
          >
            ← 重试
          </button>
        </div>
      )}
    </div>
  );
}
