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

async function decomposeWorkflow(apiKey, description, fileTexts, imageBase64s) {
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is not configured" });
  }

  let description;
  let fileTexts = [];
  let imageBase64s = [];

  try {
    const contentType = req.headers["content-type"] || "";

    if (contentType.startsWith("multipart/form-data")) {
      const parsed = await parseMultipartRequest(req);
      description = parsed.description;

      for (const file of parsed.files) {
        const { text, imageBase64 } = await extractFileContent(file);
        if (text) fileTexts.push(text);
        if (imageBase64) imageBase64s.push(imageBase64);
      }
    } else {
      const body = await parseJsonBody(req);
      description = body.description;
    }
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!description || typeof description !== "string" || !description.trim()) {
    return res.status(400).json({ error: "description is required and must be a non-empty string" });
  }

  try {
    const graph = await decomposeWorkflow(apiKey, description, fileTexts, imageBase64s);

    if (!graph.nodes || !Array.isArray(graph.nodes) || graph.nodes.length === 0 || !Array.isArray(graph.edges)) {
      return res.status(502).json({ error: "LLM produced invalid response structure" });
    }

    return res.status(200).json({ graph });
  } catch (err) {
    const statusCode = err.statusCode || 500;
    return res.status(statusCode).json({ error: err.message });
  }
}
