import {
  parseMultipartRequest,
  extractFileContent,
} from "./lib/parse-files.js";

function cleanJsonResponse(text) {
  let cleaned = text.trim();
  // Remove markdown code fences: ```json ... ``` or ``` ... ```
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?\s*```$/i, '');
  // If still not starting with { or [, try to find the first { and last }
  if (!cleaned.startsWith('{') && !cleaned.startsWith('[')) {
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }
  }
  return cleaned;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Manually parse JSON body when Vercel's bodyParser is disabled.
 */
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

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

async function decomposeWorkflow(apiKey, description, fileTexts, imageBase64s) {
  // Build user message content array
  const userContent = [{ type: "text", text: description }];

  if (fileTexts && fileTexts.length > 0) {
    for (const text of fileTexts) {
      userContent.push({
        type: "text",
        text: `--- 上传文档内容 ---\n${text}`,
      });
    }
  }

  if (imageBase64s && imageBase64s.length > 0) {
    for (const img of imageBase64s) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: img.media_type,
          data: img.base64,
        },
      });
    }
  }

  // 25-second timeout safety net
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: DECOMPOSE_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      const error = new Error("LLM request timed out");
      error.statusCode = 504;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Anthropic API error ${response.status}: ${data.error?.message || JSON.stringify(data)}`
    );
  }

  const rawText = data.content[0].text;

  try {
    return JSON.parse(cleanJsonResponse(rawText));
  } catch {
    throw new Error(
      `Failed to parse LLM response as JSON. Raw response: ${rawText.slice(0, 500)}`
    );
  }
}

async function analyzeWorkflow(apiKey, graph) {
  const userContent = [
    {
      type: "text",
      text: `请分析以下业务流程图并提供优化建议：\n\n${JSON.stringify(graph, null, 2)}`,
    },
  ];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);

  let response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        system: GAP_ANALYSIS_SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      const error = new Error("LLM request timed out");
      error.statusCode = 504;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `Anthropic API error ${response.status}: ${data.error?.message || JSON.stringify(data)}`
    );
  }

  const rawText = data.content[0].text;

  try {
    return JSON.parse(cleanJsonResponse(rawText));
  } catch {
    throw new Error(
      `Failed to parse gap analysis response as JSON. Raw response: ${rawText.slice(0, 500)}`
    );
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res
      .status(500)
      .json({ error: "ANTHROPIC_API_KEY is not configured" });
  }

  let description;
  let industry = "retail_ecommerce";
  let fileTexts = [];
  let imageBase64s = [];

  try {
    const contentType = req.headers["content-type"] || "";

    if (contentType.startsWith("multipart/form-data")) {
      // Multipart: parse description + files from form data
      const parsed = await parseMultipartRequest(req);
      description = parsed.description;
      industry = parsed.industry;

      // Process uploaded files
      for (const file of parsed.files) {
        const { text, imageBase64 } = await extractFileContent(file);
        if (text) fileTexts.push(text);
        if (imageBase64) imageBase64s.push(imageBase64);
      }
    } else {
      // JSON fallback (backward compatible)
      const body = await parseJsonBody(req);
      description = body.description;
      if (body.industry) industry = body.industry;
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!description || typeof description !== "string" || !description.trim()) {
    return res
      .status(400)
      .json({ error: "description is required and must be a non-empty string" });
  }

  try {
    // Call 1: Workflow decomposition
    const graph = await decomposeWorkflow(apiKey, description, fileTexts, imageBase64s);

    // Validate Call 1 response structure
    if (!graph.nodes || !Array.isArray(graph.nodes) || graph.nodes.length === 0 || !Array.isArray(graph.edges)) {
      return res.status(502).json({ error: "LLM produced invalid response structure" });
    }

    // Call 2: Gap analysis (sequential — depends on Call 1)
    const analysis = await analyzeWorkflow(apiKey, graph);

    // Validate Call 2 response structure
    if (!Array.isArray(analysis.bottlenecks) || !Array.isArray(analysis.opportunities)) {
      return res.status(502).json({ error: "LLM produced invalid response structure" });
    }

    return res.status(200).json({ graph, analysis });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message });
  }
}
