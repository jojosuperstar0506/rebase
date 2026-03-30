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

async function analyzeWorkflow(apiKey, graph) {
  const userContent = [
    {
      type: "text",
      text: `请分析以下业务流程图并提供优化建议：\n\n${JSON.stringify(graph, null, 2)}`,
    },
  ];

  // 9-second timeout — stay under Vercel's 10s Hobby limit
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);

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
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
  }

  let graph;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf-8"));
    graph = body.graph;
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (!graph || !Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    return res.status(400).json({ error: "graph with nodes array is required" });
  }

  try {
    const analysis = await analyzeWorkflow(apiKey, graph);

    if (!Array.isArray(analysis.bottlenecks) || !Array.isArray(analysis.opportunities)) {
      return res.status(502).json({ error: "LLM produced invalid response structure" });
    }

    return res.status(200).json({ analysis });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message });
  }
}
