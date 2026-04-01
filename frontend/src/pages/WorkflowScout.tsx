import { useState, useEffect } from "react";
import type { ScoutState } from "../types/workflow";
import IntakePanel from "../components/workflow/IntakePanel";
import LoadingView from "../components/workflow/LoadingView";
import SummaryBar from "../components/workflow/SummaryBar";
import GraphView from "../components/workflow/GraphView";
import InsightsPanel from "../components/workflow/InsightsPanel";
import ContactModal from "../components/workflow/ContactModal";
import ComparisonToggle from "../components/workflow/ComparisonToggle";
import { useApp } from "../context/AppContext";

// ─── Helpers ───

function friendlyError(raw: string): string {
  if (/failed to fetch|networkerror|network error/i.test(raw))
    return "网络连接失败，请检查网络后重试\nNetwork error — please check your connection and retry.";
  if (/400/.test(raw))
    return "请提供更详细的流程描述（至少20个字符）\nPlease provide a more detailed description (min 20 characters).";
  if (/504/.test(raw))
    return "分析超时，请尝试简化流程描述\nAnalysis timed out — please simplify the workflow description.";
  if (/502/.test(raw))
    return "AI分析结果异常，请重新描述您的流程\nAI returned an unexpected response — please re-describe your workflow.";
  if (/500/.test(raw))
    return "服务器内部错误，请稍后重试\nServer error — please try again in a moment.";
  if (/json|parse/i.test(raw))
    return "AI返回的数据格式异常，请重试\nAI response format error — please retry.";
  if (/AI未能识别/.test(raw))
    return "AI未能识别流程节点，请提供更详细的描述\nAI couldn't identify workflow steps — please add more detail.";
  return raw || "未知错误，请稍后重试\nUnknown error — please try again.";
}

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
- Real business workflows are NOT purely linear. Actively look for and create:
  * Decision branches (金额判断, 审批结果, 质量检查结果, 库存是否充足)
  * Parallel tracks (e.g., warehouse processing happens while finance prepares payment)
  * Exception/error paths (退货不合格怎么办, 审批被拒怎么办, 库存不足怎么办)
  * Handoffs between departments (each department change should be a handoff node)
- Aim for at least 2 decision nodes and at least 1 parallel branch in any workflow with 8+ steps
- A purely linear chain of nodes is almost certainly wrong — real processes have conditionals
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
- The summary field must be written in natural business Chinese. NEVER reference node IDs (like node_1, node_3) in the summary — use the actual step names instead (like 收集订单信息, Excel汇总). The summary is for business decision-makers, not engineers.
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

const OPTIMIZE_SYSTEM_PROMPT = `You are a retail/e-commerce operations optimization consultant (零售/电商运营优化顾问). You transform existing manual workflows into optimized, automated versions using real Chinese SaaS tools and industry best practices.

TASK: Given a WorkflowGraph (the user's current workflow) and a GapAnalysis (identified bottlenecks and opportunities), generate an optimized version of the SAME workflow that represents industry best-in-class automation.

CRITICAL RULES:
- The optimized workflow must represent the SAME business process, not a different one
- Do NOT delete core business logic steps — transform them from manual to automated
- Some manual steps may be merged (e.g., "手动录入" + "手动核对" → "系统自动同步+异常告警")
- Some new steps may be added (e.g., automated notifications, exception handling)
- The total node count should be similar to the original (±3 nodes)
- Every node must have realistic, specific tool names — never generic like "某ERP"
- Time estimates must be realistic for automated processes, not zero

RETAIL/E-COMMERCE AUTOMATION BENCHMARKS (真实行业数据):

订单处理 Order Processing:
- 聚水潭ERP: 服务超过20万电商商家，支持淘宝/天猫/京东/抖音/拼多多多渠道订单自动同步，<30秒完成
- 旺店通ERP: 多渠道订单聚合，头部商家实现90%+订单处理自动化
- 标杆水平: 订单处理1-2分钟(自动同步+仅处理异常)，SMB现状: 20-45分钟(手动跨平台收集)

库存管理 Inventory:
- 条码扫描枪+ERP实时同步: 日单量>1000的商家标配
- 聚水潭/旺店通智能补货: 安全库存预警+自动生成采购单
- 标杆水平: 实时库存准确率>99%，SMB现状: 每周手动盘点，准确率85-92%

财务对账 Financial Reconciliation:
- 用友好会计/金蝶精斗云: 银行流水自动导入，与ERP订单自动匹配
- 支付宝/微信商户平台API: 结算自动对账
- 标杆水平: 自动对账+仅处理异常(5分钟/天)，SMB现状: 手动Excel对账30-60分钟/天

审批流程 Approvals:
- 钉钉审批流/飞书审批: 移动端审批，可配置规则，自动流转
- 标杆水平: <5分钟移动端审批，SMB现状: 微信群沟通30-60分钟，无审计记录

报表 Reporting:
- 简道云/明道云: 低代码仪表盘，实时从ERP/OMS拉取数据
- 帆软FineBI: 中型企业BI分析
- 标杆水平: 实时自动刷新仪表盘，SMB现状: 每周手动Excel汇总2-4小时

客服与售后 Customer Service & Returns:
- 企业微信+智能客服(智齿/网易七鱼): 工单系统+SLA追踪
- 平台API自动退款: 标准退货自动处理
- 标杆水平: 标准退货<24小时自动处理，SMB现状: 3-5个工作日，Excel手动跟踪

TOOL MAPPING (优先推荐):
手动Excel录入 → 聚水潭ERP/旺店通ERP自动同步
手动微信沟通 → 钉钉/飞书自动通知
纸质审批 → 钉钉审批流/飞书审批
手动Excel对账 → 用友好会计/金蝶精斗云自动对账
手动Excel报表 → 简道云仪表盘/明道云报表
微信群客服 → 企业微信客服+智能客服系统
手动盘点 → 条码扫描枪+ERP库存模块
纸质验收 → 移动端扫码验收+ERP自动入库

OUTPUT FORMAT:
Return a JSON object with this structure:
{
  "optimized_graph": {
    "tenant_id": "demo",
    "workflow_name": "string (same process name + '(行业标杆版)')",
    "workflow_name_en": "string (same + '(Best-in-Class)')",
    "description": "string",
    "nodes": [
      {
        "id": "opt_node_1",
        "name": "string (Chinese)",
        "name_en": "string (English)",
        "department": "string",
        "node_type": "task|decision|handoff|approval|data_entry|notification",
        "tool_used": "string (specific product name)",
        "avg_time_minutes": number,
        "cost_per_execution_rmb": number,
        "error_rate": number,
        "is_manual": boolean,
        "optimization_note": "string (Chinese — what changed from original)",
        "optimization_note_en": "string",
        "original_node_id": "string|null (maps to original node id)",
        "time_reduction_pct": number
      }
    ],
    "edges": [...same format as original...],
    "version": 1
  },
  "comparison_summary": "string (Chinese, 2-3 sentences comparing the two workflows with specific numbers)",
  "comparison_summary_en": "string",
  "benchmark_sources": ["聚水潭官方案例数据(服务20万+商家)", "iResearch 2025中国电商SaaS报告", "行业头部企业实践调研"]
}

Return ONLY valid JSON. No markdown fences, no explanation.`;

// ─── Component ───

export default function WorkflowScout() {
  const { colors: C } = useApp();
  const [state, setState] = useState<ScoutState>({
    status: "idle",
    description: "",
    files: [],
    result: null,
    error: null,
    selectedNodeId: null,
  });
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [showContactModal, setShowContactModal] = useState(false);
  const [comparisonView, setComparisonView] = useState<"original" | "optimized">("original");

  // Browser tab title
  useEffect(() => {
    const prev = document.title;
    document.title = "流程扫描 | Rebase";
    return () => { document.title = prev; };
  }, []);

  async function handleSubmit() {
    const description = state.description.trim().slice(0, 5000);

    // Inline validation — stay on idle, don't go to loading
    if (description.length < 20) {
      setInlineError("请输入至少20个字符的流程描述 (min 20 characters)");
      return;
    }
    setInlineError(null);

    setState((s) => ({ ...s, status: "loading", error: null }));

    try {
      // Call 1 — Decompose workflow via /api/ai proxy
      let decomposeData: unknown;
      try {
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
        const contentType = decomposeRes.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("Workflow decomposition failed: 502");
        }
        decomposeData = await decomposeRes.json();
      } catch (e: unknown) {
        if (e instanceof TypeError) throw new Error("Failed to fetch");
        throw e;
      }

      const graphText = (decomposeData as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
      if (!graphText) throw new Error("Workflow decomposition failed: 502");

      let graph: { nodes?: unknown[]; edges?: unknown[] };
      try {
        graph = JSON.parse(cleanJsonResponse(graphText));
      } catch {
        throw new Error("Failed to parse JSON from decompose response");
      }

      if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
        throw new Error("AI未能识别流程节点，请提供更详细的描述");
      }

      // Call 2 — Gap analysis via /api/ai proxy
      let analyzeData: unknown;
      try {
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
        const contentType = analyzeRes.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
          throw new Error("Gap analysis failed: 502");
        }
        analyzeData = await analyzeRes.json();
      } catch (e: unknown) {
        if (e instanceof TypeError) throw new Error("Failed to fetch");
        throw e;
      }

      const analysisText = (analyzeData as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
      if (!analysisText) throw new Error("Gap analysis failed: 502");

      let analysis: { bottlenecks?: unknown[]; opportunities?: unknown[] };
      try {
        analysis = JSON.parse(cleanJsonResponse(analysisText));
      } catch {
        throw new Error("Failed to parse JSON from analysis response");
      }

      if (!Array.isArray(analysis.bottlenecks) || !Array.isArray(analysis.opportunities)) {
        throw new Error("Gap analysis failed: 502");
      }

      // Call 3 — Generate optimized workflow (non-blocking — failure keeps comparison=null)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let comparison: import("../types/workflow").ComparisonData | null = null;
      try {
        const optimizeRes = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 8192,
            system: OPTIMIZE_SYSTEM_PROMPT,
            messages: [{
              role: "user",
              content: "请根据以下当前流程和分析结果，生成行业标杆版本的优化流程：\n\n当前流程：\n" + JSON.stringify(graph) + "\n\n分析结果：\n" + JSON.stringify(analysis),
            }],
          }),
        });
        if (optimizeRes.ok) {
          const contentType = optimizeRes.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
            const optimizeData = await optimizeRes.json();
            const optimizeText = (optimizeData as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
            if (optimizeText) {
              const optimizeResult = JSON.parse(cleanJsonResponse(optimizeText));
              if (optimizeResult.optimized_graph?.nodes) {
                comparison = {
                  original: graph as import("../types/workflow").WorkflowGraph,
                  optimized: optimizeResult.optimized_graph,
                  comparison_summary: optimizeResult.comparison_summary ?? "",
                  comparison_summary_en: optimizeResult.comparison_summary_en ?? "",
                  benchmark_sources: Array.isArray(optimizeResult.benchmark_sources)
                    ? optimizeResult.benchmark_sources
                    : [],
                };
              }
            }
          }
        }
      } catch (e) {
        console.warn("Call 3 (optimize) failed, showing v1.0 results:", e);
        // comparison stays null — graceful degradation
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setState((s) => ({ ...s, status: "ready", result: { graph: graph as any, analysis: analysis as any, comparison } }));
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      setState((s) => ({
        ...s,
        status: "error",
        error: friendlyError(raw),
      }));
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: C.bg,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {state.status === "idle" && (
        <IntakePanel
          description={state.description}
          files={state.files}
          onDescriptionChange={(d) => {
            setState((s) => ({ ...s, description: d }));
            if (inlineError) setInlineError(null);
          }}
          onFilesChange={(f) => setState((s) => ({ ...s, files: f }))}
          onSubmit={handleSubmit}
          inlineError={inlineError}
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
            <span style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>流程扫描结果</span>
            <span style={{ fontSize: 18, fontWeight: 400, color: C.t2 }}>
              — {state.result.graph.workflow_name}
            </span>
            {state.result.graph.workflow_name_en && (
              <span style={{ fontSize: 13, color: C.t2 }}>
                ({state.result.graph.workflow_name_en})
              </span>
            )}
          </div>
          <SummaryBar
            analysis={state.result.analysis}
            comparison={state.result.comparison}
            currentView={comparisonView}
          />
          <div className="ws-results">
            <div className="ws-graph">
              {state.result.comparison && (
                <ComparisonToggle
                  view={comparisonView}
                  onViewChange={(v) => {
                    // Reset selectedNodeId if it doesn't exist in the target graph
                    const targetNodes =
                      v === "optimized" && state.result!.comparison
                        ? state.result!.comparison.optimized.nodes
                        : state.result!.graph.nodes;
                    const idExists = targetNodes.some(
                      (n) => n.id === state.selectedNodeId
                    );
                    setState((s) => ({
                      ...s,
                      selectedNodeId: idExists ? s.selectedNodeId : null,
                    }));
                    setComparisonView(v);
                  }}
                />
              )}
              <GraphView
                graph={
                  comparisonView === "optimized" && state.result.comparison
                    ? state.result.comparison.optimized
                    : state.result.graph
                }
                bottlenecks={
                  comparisonView === "optimized" ? [] : state.result.analysis.bottlenecks
                }
                selectedNodeId={state.selectedNodeId}
                onNodeClick={(id) =>
                  setState((s) => ({
                    ...s,
                    selectedNodeId: s.selectedNodeId === id ? null : id,
                  }))
                }
                onDeselect={() => setState((s) => ({ ...s, selectedNodeId: null }))}
                isOptimized={comparisonView === "optimized"}
              />
            </div>
            <div className="ws-insights">
              <InsightsPanel
                analysis={state.result.analysis}
                graph={
                  comparisonView === "optimized" && state.result.comparison
                    ? state.result.comparison.optimized
                    : state.result.graph
                }
                selectedNodeId={state.selectedNodeId}
                onNodeSelect={(id) =>
                  setState((s) => ({
                    ...s,
                    selectedNodeId:
                      id === null
                        ? null
                        : s.selectedNodeId === id
                        ? null
                        : id,
                  }))
                }
                comparison={state.result.comparison}
                currentView={comparisonView}
                onShowContact={() => setShowContactModal(true)}
              />
            </div>
          </div>
          {/* Bottom bar */}
          <div className="ws-bottom">
            <button
              onClick={() => { setState((s) => ({ ...s, status: "idle", result: null, error: null, description: "", files: [], selectedNodeId: null })); setComparisonView("original"); }}
              style={{ minHeight: 44, padding: "8px 20px", background: "transparent", border: `1px solid ${C.bd}`, borderRadius: 6, color: C.t2, cursor: "pointer", fontSize: 14 }}
            >
              ← 重新扫描
            </button>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <button
                onClick={() => setShowContactModal(true)}
                style={{ minHeight: 44, padding: "10px 24px", background: C.ac, border: "none", borderRadius: 6, color: "#000", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                联系我们获取实施方案 →
              </button>
              <div style={{ fontSize: 12, color: C.t2 }}>
                或添加微信咨询：
                <span style={{ color: C.ac, fontWeight: 600, userSelect: "all" }}>rebase_ai</span>
              </div>
            </div>
          </div>

          <ContactModal
            isOpen={showContactModal}
            onClose={() => setShowContactModal(false)}
            workflowName={state.result.graph.workflow_name}
          />
        </div>
      )}
      {state.status === "error" && (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "2rem",
          }}
        >
          <div
            style={{
              background: C.s1,
              border: `1px solid ${C.bd}`,
              borderRadius: 12,
              padding: "40px 36px",
              maxWidth: 520,
              width: "100%",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 40, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: C.danger, marginBottom: 4 }}>
              分析失败
            </div>
            <div style={{ fontSize: 13, color: C.t2, marginBottom: 20 }}>Analysis Failed</div>
            <div
              style={{
                fontSize: 14,
                color: C.tx,
                lineHeight: 1.7,
                marginBottom: 28,
                whiteSpace: "pre-line",
              }}
            >
              {state.error}
            </div>
            <button
              onClick={() => setState((s) => ({ ...s, status: "idle", error: null }))}
              style={{
                minHeight: 44,
                width: "100%",
                padding: "10px 24px",
                background: "transparent",
                border: `1px solid ${C.bd}`,
                borderRadius: 8,
                color: C.tx,
                cursor: "pointer",
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 20,
              }}
            >
              重新扫描 →
            </button>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
              如果问题持续，请联系我们：
              <br />
              <a
                href="mailto:hello@rebase.ai"
                style={{ color: C.ac, textDecoration: "none" }}
              >
                hello@rebase.ai
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
