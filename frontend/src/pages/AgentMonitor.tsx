import { useState } from "react";
import { useNavigate } from "react-router-dom";

// ─── Agent Data Types ───

interface Agent {
  id: string;
  name: string;
  nameCn: string;
  icon: string;
  category: "content" | "operations" | "finance" | "analytics";
  status: "active" | "beta" | "coming-soon";
  description: string;
  descriptionCn: string;
  capabilities: string[];
  route?: string;
  metrics?: {
    label: string;
    value: string;
  }[];
}

// ─── Agent Registry ───

const AGENTS: Agent[] = [
  {
    id: "xhs-content",
    name: "XHS Content Warroom",
    nameCn: "小红书内容作战室",
    icon: "✍️",
    category: "content",
    status: "active",
    route: "/agents/xhs-content",
    description:
      "AI-powered Xiaohongshu content creation pipeline — from competitor analysis to publishable viral notes.",
    descriptionCn:
      "AI驱动的小红书内容创作流水线——从竞品分析到可发布的爆款笔记。",
    capabilities: [
      "Competitor post analysis & viral factor identification",
      "Long-tail keyword opportunity mining",
      "7-stage decision path content element extraction",
      "Auto-generate publish-ready XHS notes with tags & image guidance",
    ],
    metrics: [
      { label: "Pipeline Stages", value: "4" },
      { label: "Note Styles", value: "8" },
      { label: "Status", value: "v0.1 Live" },
    ],
  },
  {
    id: "order-sync",
    name: "Order Sync Agent",
    nameCn: "订单同步助手",
    icon: "📋",
    category: "operations",
    status: "beta",
    description:
      "Auto-captures order specs from WeChat messages and generates structured production sheets.",
    descriptionCn: "自动从微信提取订单规格并生成生产单。",
    capabilities: [
      "WeChat message parsing & spec extraction",
      "Production sheet auto-generation",
      "Order validation & error detection",
    ],
    metrics: [
      { label: "Hours Saved/wk", value: "13" },
      { label: "Savings/mo", value: "¥5,200" },
    ],
  },
  {
    id: "inventory-sync",
    name: "Inventory Sync Agent",
    nameCn: "库存同步助手",
    icon: "📦",
    category: "operations",
    status: "coming-soon",
    description:
      "Real-time material arrival tracking synced to procurement systems.",
    descriptionCn: "实时同步物料到货信息至采购系统。",
    capabilities: [
      "Real-time stock level monitoring",
      "Procurement visibility dashboard",
      "Low-stock alerts & reorder triggers",
    ],
    metrics: [
      { label: "Hours Saved/wk", value: "7" },
      { label: "Savings/mo", value: "¥2,800" },
    ],
  },
  {
    id: "reconciliation",
    name: "Reconciliation Agent",
    nameCn: "对账助手",
    icon: "🔄",
    category: "finance",
    status: "coming-soon",
    description:
      "Auto-reconciles warehouse stock with Yongyou ERP on a daily schedule.",
    descriptionCn: "每日自动对账仓库库存与用友ERP。",
    capabilities: [
      "Daily stock-to-ERP reconciliation",
      "Discrepancy flagging & root-cause hints",
      "Month-end close acceleration",
    ],
    metrics: [
      { label: "Hours Saved/wk", value: "5" },
      { label: "Savings/mo", value: "¥2,000" },
    ],
  },
  {
    id: "qc-digitization",
    name: "QC Digitization Agent",
    nameCn: "质检数字化助手",
    icon: "🔍",
    category: "operations",
    status: "coming-soon",
    description:
      "Digitizes paper QC reports and pushes results to production instantly.",
    descriptionCn: "数字化质检报告，实时推送结果至生产部。",
    capabilities: [
      "Paper checklist → digital conversion",
      "Instant result push to production",
      "Defect trend analysis",
    ],
    metrics: [
      { label: "Hours Saved/wk", value: "4" },
      { label: "Savings/mo", value: "¥1,600" },
    ],
  },
  {
    id: "invoice",
    name: "Invoice Agent",
    nameCn: "开票助手",
    icon: "🧾",
    category: "finance",
    status: "coming-soon",
    description:
      "Auto-generates invoices from confirmed orders and syncs to Yongyou.",
    descriptionCn: "从确认订单自动生成发票，同步至用友系统。",
    capabilities: [
      "Order → invoice auto-generation",
      "Yongyou ERP sync",
      "Tax compliance validation",
    ],
    metrics: [
      { label: "Hours Saved/wk", value: "6" },
      { label: "Savings/mo", value: "¥2,400" },
    ],
  },
  {
    id: "product-structure",
    name: "Product Structure Agent",
    nameCn: "产品结构助手",
    icon: "🏗️",
    category: "analytics",
    status: "beta",
    description:
      "Analyzes product BOMs and suggests cost optimization opportunities using ERP intelligence.",
    descriptionCn: "分析产品BOM并利用ERP智能建议成本优化机会。",
    capabilities: [
      "BOM parsing & component analysis",
      "Cost optimization suggestions",
      "Alternative material recommendations",
    ],
    metrics: [
      { label: "Layer", value: "2 — ERP" },
      { label: "Status", value: "v0.1 Demo" },
    ],
  },
  {
    id: "customer-insights",
    name: "Customer Insights Agent",
    nameCn: "客户洞察助手",
    icon: "👥",
    category: "analytics",
    status: "coming-soon",
    description:
      "Aggregates customer interaction data to surface buying patterns and churn signals.",
    descriptionCn: "聚合客户互动数据，发现购买模式和流失信号。",
    capabilities: [
      "Purchase pattern analysis",
      "Churn risk scoring",
      "Upsell opportunity detection",
    ],
  },
];

// ─── Styling constants ───

const STATUS_CONFIG = {
  active: { label: "Active", color: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
  beta: { label: "Beta", color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
  "coming-soon": { label: "Coming Soon", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb" },
};

const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  content: { label: "Content", color: "#8b5cf6" },
  operations: { label: "Operations", color: "#3b82f6" },
  finance: { label: "Finance", color: "#ef4444" },
  analytics: { label: "Analytics", color: "#06b6d4" },
};

type FilterCategory = "all" | "content" | "operations" | "finance" | "analytics";

// ─── Agent Card ───

function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const status = STATUS_CONFIG[agent.status];
  const category = CATEGORY_CONFIG[agent.category];
  const hasRoute = !!agent.route;

  return (
    <div
      style={{
        background: "#fff",
        border: `1.5px solid ${agent.status === "active" ? "#c4b5fd" : "#e5e7eb"}`,
        borderRadius: 14,
        padding: "20px 22px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: agent.status === "active"
          ? "0 4px 16px rgba(139,92,246,0.10)"
          : "0 1px 4px rgba(0,0,0,0.04)",
        opacity: agent.status === "coming-soon" ? 0.75 : 1,
      }}
      onClick={() => {
        if (hasRoute) {
          navigate(agent.route!);
        } else {
          setExpanded(!expanded);
        }
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.08)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = agent.status === "active"
          ? "0 4px 16px rgba(139,92,246,0.10)"
          : "0 1px 4px rgba(0,0,0,0.04)";
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 11,
              background: agent.status === "active"
                ? "linear-gradient(135deg, #8b5cf6, #6d28d9)"
                : "#f3f4f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            {agent.icon}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111" }}>{agent.name}</div>
            <div style={{ fontSize: 12, color: "#888", marginTop: 1 }}>{agent.nameCn}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 20,
              background: status.bg,
              color: status.color,
              border: `1px solid ${status.border}`,
            }}
          >
            {status.label}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 20,
              background: `${category.color}10`,
              color: category.color,
              border: `1px solid ${category.color}30`,
            }}
          >
            {category.label}
          </span>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, color: "#555", lineHeight: 1.55, margin: "0 0 8px" }}>
        {agent.description}
      </p>
      <p style={{ fontSize: 12, color: "#999", lineHeight: 1.5, margin: 0 }}>
        {agent.descriptionCn}
      </p>

      {/* Launch button for agents with routes */}
      {hasRoute && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 16px",
            background: "linear-gradient(135deg, #8b5cf6, #6d28d9)",
            borderRadius: 8,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          Launch Agent →
        </div>
      )}

      {/* Metrics */}
      {agent.metrics && agent.metrics.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 12,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid #f0f0f0",
          }}
        >
          {agent.metrics.map((m) => (
            <div
              key={m.label}
              style={{
                background: "#fafafa",
                borderRadius: 8,
                padding: "6px 12px",
                flex: 1,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>{m.value}</div>
              <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded: capabilities */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #f0f0f0" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "#888", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Capabilities
          </div>
          {agent.capabilities.map((cap, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: "#555",
                padding: "4px 0",
                paddingLeft: 14,
                position: "relative",
              }}
            >
              <span style={{ position: "absolute", left: 0, color: category.color }}>•</span>
              {cap}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ───

export default function AgentMonitor() {
  const [filter, setFilter] = useState<FilterCategory>("all");

  const categories: { key: FilterCategory; label: string }[] = [
    { key: "all", label: "All Agents" },
    { key: "content", label: "Content" },
    { key: "operations", label: "Operations" },
    { key: "finance", label: "Finance" },
    { key: "analytics", label: "Analytics" },
  ];

  const filtered = filter === "all" ? AGENTS : AGENTS.filter((a) => a.category === filter);

  const activeCount = AGENTS.filter((a) => a.status === "active").length;
  const betaCount = AGENTS.filter((a) => a.status === "beta").length;
  const comingSoonCount = AGENTS.filter((a) => a.status === "coming-soon").length;

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: "#111", margin: "0 0 6px" }}>
          Agent Execution Monitor
        </h1>
        <p style={{ fontSize: 14, color: "#888", margin: 0 }}>
          Virtual employees powering Rebase — content creation, operations automation, and analytics.
        </p>
      </div>

      {/* Summary stats */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginBottom: 24,
        }}
      >
        {[
          { label: "Total Agents", value: AGENTS.length, color: "#111" },
          { label: "Active", value: activeCount, color: "#16a34a" },
          { label: "Beta", value: betaCount, color: "#d97706" },
          { label: "Coming Soon", value: comingSoonCount, color: "#6b7280" },
        ].map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "14px 18px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            style={{
              background: filter === c.key ? "#111" : "#fff",
              color: filter === c.key ? "#fff" : "#666",
              border: `1px solid ${filter === c.key ? "#111" : "#ddd"}`,
              borderRadius: 8,
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: filter === c.key ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s ease",
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Agent grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
        }}
      >
        {filtered.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
