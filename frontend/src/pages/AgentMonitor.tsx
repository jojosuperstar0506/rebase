import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

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
  capabilitiesCn?: string[];
  route?: string;
  externalUrl?: string;
  metrics?: {
    label: string;
    labelCn: string;
    value: string;
  }[];
}

// ─── Agent Registry ───

const AGENTS: Agent[] = [
  {
    id: "jo-competitive-intel",
    name: "Jo Competitive Intel",
    nameCn: "竞品情报",
    icon: "🎯",
    category: "analytics",
    status: "active",
    externalUrl: "/competitor-intel.html",
    description:
      "7-dimension brand equity tracker across 20 competitor handbag brands. Scrapes XHS, Douyin, and 生意参谋 every 3 days with Claude AI analysis.",
    descriptionCn:
      "7维品牌资产追踪系统，覆盖20个竞品箱包品牌。每3天自动采集小红书、抖音、生意参谋数据，Claude AI深度分析。",
    capabilities: [
      "20 competitor brands across 3 strategic groups (D/C/B)",
      "7-dimension analysis: Search Index, Voice Volume, Content Strategy, KOL Ecosystem, Social Commerce, Consumer Mindshare, Channel Authority",
      "Tmall & Douyin hot product rankings with material tagging",
      "Brand positioning matrix (材质 × 声量)",
      "Automated scraping every 3 days with AI-powered strategic insights",
    ],
    capabilitiesCn: [
      "追踪20个竞品，分D/C/B三组战略分层",
      "7维分析：搜索指数、声量、内容策略、KOL生态、社交电商、消费者心智、渠道权重",
      "天猫与抖音爆品排名+材质标签",
      "品牌定位矩阵（材质 × 声量）",
      "每3天自动采集数据，AI生成战略洞察",
    ],
    metrics: [
      { label: "Brands Tracked", labelCn: "追踪品牌", value: "20" },
      { label: "Dimensions", labelCn: "分析维度", value: "7" },
      { label: "Schedule", labelCn: "更新频率", value: "Every 3d" },
    ],
  },
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
    capabilitiesCn: [
      "竞品笔记分析与爆款因素识别",
      "长尾关键词机会挖掘",
      "7阶段决策路径内容要素提取",
      "自动生成可发布笔记，含标签与配图建议",
    ],
    metrics: [
      { label: "Pipeline Stages", labelCn: "流程阶段", value: "4" },
      { label: "Note Styles", labelCn: "笔记风格", value: "8" },
      { label: "Status", labelCn: "状态", value: "v0.1 Live" },
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
    capabilitiesCn: [
      "微信消息解析与规格提取",
      "生产单自动生成",
      "订单校验与错误检测",
    ],
    metrics: [
      { label: "Hours Saved/wk", labelCn: "每周节省", value: "13h" },
      { label: "Savings/mo", labelCn: "月节省", value: "¥5,200" },
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
    capabilitiesCn: [
      "实时库存监控",
      "采购可视化看板",
      "低库存预警与补货触发",
    ],
    metrics: [
      { label: "Hours Saved/wk", labelCn: "每周节省", value: "7h" },
      { label: "Savings/mo", labelCn: "月节省", value: "¥2,800" },
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
    capabilitiesCn: [
      "每日仓库与ERP对账",
      "差异标记与根因提示",
      "月末结账加速",
    ],
    metrics: [
      { label: "Hours Saved/wk", labelCn: "每周节省", value: "5h" },
      { label: "Savings/mo", labelCn: "月节省", value: "¥2,000" },
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
    capabilitiesCn: [
      "纸质检查单数字化",
      "结果实时推送至生产部",
      "缺陷趋势分析",
    ],
    metrics: [
      { label: "Hours Saved/wk", labelCn: "每周节省", value: "4h" },
      { label: "Savings/mo", labelCn: "月节省", value: "¥1,600" },
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
    capabilitiesCn: [
      "订单自动生成发票",
      "用友ERP同步",
      "税务合规校验",
    ],
    metrics: [
      { label: "Hours Saved/wk", labelCn: "每周节省", value: "6h" },
      { label: "Savings/mo", labelCn: "月节省", value: "¥2,400" },
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
    capabilitiesCn: [
      "BOM解析与物料分析",
      "成本优化建议",
      "替代材料推荐",
    ],
    metrics: [
      { label: "Layer", labelCn: "层级", value: "2 — ERP" },
      { label: "Status", labelCn: "状态", value: "v0.1 Demo" },
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
    capabilitiesCn: [
      "购买行为模式分析",
      "流失风险评分",
      "增购机会识别",
    ],
  },
  {
    id: "market-intelligence",
    name: "Market Intelligence Agent",
    nameCn: "市场情报助手",
    icon: "📡",
    category: "analytics",
    status: "active",
    route: "/agents/market-intelligence",
    description:
      "Daily personalized market & competitor intelligence report — 6 sources, 3-lens Claude analysis, self-improving weekly playbook.",
    descriptionCn:
      "每日个性化市场与竞品情报报告——6大来源、Claude三视角分析、每周自动优化。",
    capabilities: [
      "Multi-source aggregation: Google News (EN+CN), Reddit, 36Kr, 虎嗅, Reuters",
      "3-lens Claude analysis: Trend Radar, Competitive Dynamics, Opportunity Signals",
      "Email delivery at 7am HK with 👍/👎 feedback buttons",
      "Self-improving playbook — optimized every Sunday based on your feedback",
      "Fully configurable: set your industry, competitors, and geography focus",
    ],
    capabilitiesCn: [
      "多源聚合：Google News（中英）、Reddit、36氪、虎嗅、路透社",
      "Claude三视角分析：趋势雷达、竞争动态、机会信号",
      "每日7点（香港时间）邮件推送，含👍/👎反馈按钮",
      "自优化剧本——每周日根据反馈自动优化",
      "完全可配置：设定行业、竞争对手、地域焦点",
    ],
    metrics: [
      { label: "News Sources", labelCn: "信息来源", value: "6" },
      { label: "Analysis Lenses", labelCn: "分析视角", value: "3" },
      { label: "Status", labelCn: "状态", value: "v0.1 Live" },
    ],
  },
];

// ─── Status + Category configs ───

const STATUS_CONFIG = {
  active:       { label: "Active",      labelCn: "运行中",  color: "#16a34a" },
  beta:         { label: "Beta",        labelCn: "测试版",  color: "#d97706" },
  "coming-soon":{ label: "Coming Soon", labelCn: "即将推出", color: "#6b7280" },
};

const CATEGORY_CONFIG: Record<string, { label: string; labelCn: string; color: string }> = {
  content:    { label: "Content",    labelCn: "内容",    color: "#8b5cf6" },
  operations: { label: "Operations", labelCn: "运营",    color: "#3b82f6" },
  finance:    { label: "Finance",    labelCn: "财务",    color: "#ef4444" },
  analytics:  { label: "Analytics",  labelCn: "数据分析", color: "#06b6d4" },
};

type FilterCategory = "all" | "content" | "operations" | "finance" | "analytics";

// ─── Agent Card ───

function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { colors: C, theme, lang } = useApp();
  const status = STATUS_CONFIG[agent.status];
  const category = CATEGORY_CONFIG[agent.category];
  const hasRoute = !!agent.route || !!agent.externalUrl;
  const isDark = theme === "dark";

  // Status badge colors — theme-aware opacity tints
  const statusBg     = isDark ? `${status.color}18` : `${status.color}12`;
  const statusBorder = isDark ? `${status.color}40` : `${status.color}30`;

  const displayName        = lang === "zh" ? agent.nameCn        : agent.name;
  const displaySecondary   = lang === "zh" ? agent.name          : agent.nameCn;
  const displayDescription = lang === "zh" ? agent.descriptionCn : agent.description;
  const displayCaps        = lang === "zh" && agent.capabilitiesCn ? agent.capabilitiesCn : agent.capabilities;
  const statusLabel        = lang === "zh" ? status.labelCn  : status.label;
  const categoryLabel      = lang === "zh" ? category.labelCn : category.label;

  return (
    <div
      style={{
        background: C.s1,
        border: `1.5px solid ${agent.status === "active" ? C.ac + "44" : C.bd}`,
        borderRadius: 14,
        padding: "20px 22px",
        cursor: "pointer",
        transition: "all 0.2s ease",
        boxShadow: agent.status === "active"
          ? `0 4px 16px ${C.ac}18`
          : "none",
        opacity: agent.status === "coming-soon" ? 0.75 : 1,
      }}
      onClick={() => {
        if (agent.externalUrl) {
          window.location.href = agent.externalUrl;
        } else if (agent.route) {
          navigate(agent.route);
        } else {
          setExpanded(!expanded);
        }
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = `0 6px 20px ${C.ac}20`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
        (e.currentTarget as HTMLDivElement).style.boxShadow = agent.status === "active"
          ? `0 4px 16px ${C.ac}18`
          : "none";
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
                ? `linear-gradient(135deg, ${C.ac}, ${C.ac2})`
                : C.s2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
            }}
          >
            {agent.icon}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.tx }}>{displayName}</div>
            <div style={{ fontSize: 12, color: C.t2, marginTop: 1 }}>{displaySecondary}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 20,
              background: statusBg,
              color: status.color,
              border: `1px solid ${statusBorder}`,
            }}
          >
            {statusLabel}
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "3px 9px",
              borderRadius: 20,
              background: `${category.color}12`,
              color: category.color,
              border: `1px solid ${category.color}30`,
            }}
          >
            {categoryLabel}
          </span>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.55, margin: 0 }}>
        {displayDescription}
      </p>

      {/* Launch button for agents with routes */}
      {hasRoute && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 16px",
            background: `linear-gradient(135deg, ${C.ac}, ${C.ac2})`,
            borderRadius: 8,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            textAlign: "center",
          }}
        >
          {lang === "zh" ? "启动智能体 →" : "Launch Agent →"}
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
            borderTop: `1px solid ${C.bd}`,
          }}
        >
          {agent.metrics.map((m) => (
            <div
              key={m.label}
              style={{
                background: C.s2,
                borderRadius: 8,
                padding: "6px 12px",
                flex: 1,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>{m.value}</div>
              <div style={{ fontSize: 10, color: C.t2, marginTop: 2 }}>
                {lang === "zh" ? m.labelCn : m.label}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Expanded: capabilities */}
      {expanded && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.bd}` }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.t3, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
            {lang === "zh" ? "功能列表" : "Capabilities"}
          </div>
          {displayCaps.map((cap, i) => (
            <div
              key={i}
              style={{
                fontSize: 12,
                color: C.t2,
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
  const { colors: C, lang } = useApp();

  const categories: { key: FilterCategory; label: string; labelCn: string }[] = [
    { key: "all",        label: "All Agents",  labelCn: "全部" },
    { key: "content",    label: "Content",     labelCn: "内容" },
    { key: "operations", label: "Operations",  labelCn: "运营" },
    { key: "finance",    label: "Finance",     labelCn: "财务" },
    { key: "analytics",  label: "Analytics",   labelCn: "数据分析" },
  ];

  const filtered = filter === "all" ? AGENTS : AGENTS.filter((a) => a.category === filter);

  const activeCount    = AGENTS.filter((a) => a.status === "active").length;
  const betaCount      = AGENTS.filter((a) => a.status === "beta").length;
  const comingSoonCount = AGENTS.filter((a) => a.status === "coming-soon").length;

  const summaryStats = [
    { label: "Total Agents", labelCn: "智能体总数", value: AGENTS.length,    color: C.tx },
    { label: "Active",       labelCn: "运行中",     value: activeCount,      color: "#16a34a" },
    { label: "Beta",         labelCn: "测试版",     value: betaCount,        color: "#d97706" },
    { label: "Coming Soon",  labelCn: "即将推出",   value: comingSoonCount,  color: "#6b7280" },
  ];

  return (
    <div
      style={{
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, sans-serif",
        maxWidth: 960,
        margin: "0 auto",
        background: C.bg,
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.tx, margin: "0 0 6px" }}>
          {lang === "zh" ? "智能体执行监控" : "Agent Execution Monitor"}
        </h1>
        <p style={{ fontSize: 14, color: C.t2, margin: 0 }}>
          {lang === "zh"
            ? "驱动 Rebase 的虚拟员工——内容创作、运营自动化与数据分析。"
            : "Virtual employees powering Rebase — content creation, operations automation, and analytics."}
        </p>
      </div>

      {/* Summary stats */}
      <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
        {summaryStats.map((s) => (
          <div
            key={s.label}
            style={{
              flex: 1,
              background: C.s1,
              border: `1px solid ${C.bd}`,
              borderRadius: 10,
              padding: "14px 18px",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>
              {lang === "zh" ? s.labelCn : s.label}
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {categories.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            style={{
              background: filter === c.key ? C.tx : C.s1,
              color: filter === c.key ? C.bg : C.t2,
              border: `1px solid ${filter === c.key ? C.tx : C.bd}`,
              borderRadius: 8,
              padding: "7px 16px",
              fontSize: 13,
              fontWeight: filter === c.key ? 600 : 400,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "all 0.15s ease",
            }}
          >
            {lang === "zh" ? c.labelCn : c.label}
          </button>
        ))}
      </div>

      {/* Agent grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(420px, 1fr))",
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
