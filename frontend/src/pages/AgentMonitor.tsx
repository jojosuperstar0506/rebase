import { useState } from "react";

// ─── Agent Registry ───
interface Agent {
  id: string;
  name: string;
  nameCn: string;
  owner: string;
  status: "live" | "dev" | "planned";
  description: string;
  descriptionCn: string;
  dashboardUrl: string;
  tags: string[];
  lastRun?: string;
  schedule?: string;
}

const AGENTS: Agent[] = [
  {
    id: "jo-competitive-intel",
    name: "Jo Competitive Intel",
    nameCn: "竞品情报",
    owner: "Joanna",
    status: "live",
    description:
      "7-dimension brand equity tracker across 20 competitor handbag brands. Scrapes XHS, Douyin, and 生意参谋 every 3 days.",
    descriptionCn:
      "7维品牌资产追踪系统，覆盖20个竞品箱包品牌。每3天自动采集小红书、抖音、生意参谋数据。",
    dashboardUrl: "/competitor-intel.html",
    tags: ["XHS", "Douyin", "生意参谋", "Anthropic AI"],
    lastRun: "2026-03-28",
    schedule: "Every 3 days",
  },
  {
    id: "product-structure",
    name: "Product Structure Agent",
    nameCn: "产品结构分析",
    owner: "Joanna",
    status: "live",
    description:
      "Analyzes ERP exports (聚水潭) to produce product portfolio insights — what to make, why products fail, inventory health, purchase recommendations.",
    descriptionCn:
      "分析聚水潭ERP导出数据，生成产品组合洞察——该做什么、为什么滞销、库存健康度、采购建议。",
    dashboardUrl: "",
    tags: ["ERP", "聚水潭", "Excel"],
  },
  {
    id: "diagnostics-intake",
    name: "Diagnostics Intake",
    nameCn: "诊断问卷",
    owner: "William",
    status: "dev",
    description:
      "AI chatbot that conducts a 15-20 minute diagnostic interview, producing a structured company profile for analysis.",
    descriptionCn:
      "AI聊天机器人，进行15-20分钟诊断访谈，生成结构化企业画像用于深度分析。",
    dashboardUrl: "",
    tags: ["Dify", "Intake"],
  },
];

const STATUS_CONFIG = {
  live: { label: "Live", color: "#2E7D32", bg: "#E8F5E9" },
  dev: { label: "In Dev", color: "#E65100", bg: "#FFF3E0" },
  planned: { label: "Planned", color: "#888", bg: "#F5F5F5" },
};

// ─── Agent Card ───
function AgentCard({
  agent,
  isSelected,
  onSelect,
}: {
  agent: Agent;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const status = STATUS_CONFIG[agent.status];

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "20px 24px",
        borderRadius: 12,
        border: `2px solid ${isSelected ? "#667eea" : "#E8E8E8"}`,
        background: isSelected ? "#F8F9FF" : "white",
        cursor: "pointer",
        transition: "all 0.2s ease",
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a" }}>
              {agent.name}
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                borderRadius: 10,
                background: status.bg,
                color: status.color,
                fontWeight: 600,
              }}
            >
              {status.label}
            </span>
          </div>
          <div style={{ fontSize: 12, color: "#888" }}>
            {agent.nameCn} · Owner: {agent.owner}
          </div>
        </div>
        {agent.dashboardUrl && (
          <a
            href={agent.dashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 12,
              color: "#667eea",
              textDecoration: "none",
              padding: "4px 12px",
              borderRadius: 6,
              border: "1px solid #667eea",
              whiteSpace: "nowrap",
            }}
          >
            Open Dashboard ↗
          </a>
        )}
      </div>

      <p
        style={{
          margin: "8px 0 4px",
          fontSize: 13,
          color: "#444",
          lineHeight: 1.5,
        }}
      >
        {agent.description}
      </p>
      <p style={{ margin: "2px 0 10px", fontSize: 12, color: "#999" }}>
        {agent.descriptionCn}
      </p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {agent.tags.map((tag) => (
          <span
            key={tag}
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 10,
              background: "#F0F0F0",
              color: "#666",
            }}
          >
            {tag}
          </span>
        ))}
        {agent.schedule && (
          <span
            style={{
              fontSize: 11,
              padding: "2px 8px",
              borderRadius: 10,
              background: "#E3F2FD",
              color: "#1565C0",
            }}
          >
            ⏱ {agent.schedule}
          </span>
        )}
        {agent.lastRun && (
          <span style={{ fontSize: 11, color: "#aaa", marginLeft: 4 }}>
            Last run: {agent.lastRun}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───
export default function AgentMonitor() {
  const [selectedAgent, setSelectedAgent] = useState<string>("jo-competitive-intel");
  const selected = AGENTS.find((a) => a.id === selectedAgent);

  return (
    <div
      style={{
        fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif",
        background: "#FAFBFC",
        minHeight: "100vh",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "24px 32px",
          background: "white",
          borderBottom: "1px solid #E8E8E8",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 700,
            color: "#1a1a1a",
          }}
        >
          Virtual Employees
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
          AI agents that work for your business · 为您企业工作的AI员工
        </p>
      </div>

      <div
        style={{
          display: "flex",
          maxWidth: 1400,
          margin: "0 auto",
          padding: "24px 16px",
          gap: 24,
        }}
      >
        {/* Agent List (left side) */}
        <div style={{ width: 420, flexShrink: 0 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "#888",
              marginBottom: 12,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {AGENTS.length} Agents
          </div>
          {AGENTS.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              isSelected={selectedAgent === agent.id}
              onSelect={() => setSelectedAgent(agent.id)}
            />
          ))}
        </div>

        {/* Dashboard Preview (right side) */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {selected?.dashboardUrl ? (
            <div
              style={{
                background: "white",
                borderRadius: 12,
                border: "1px solid #E8E8E8",
                overflow: "hidden",
                height: "calc(100vh - 140px)",
                position: "sticky",
                top: 16,
              }}
            >
              <div
                style={{
                  padding: "10px 16px",
                  background: "#1a1a24",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span
                  style={{ fontSize: 13, fontWeight: 600, color: "#667eea" }}
                >
                  {selected.name} — {selected.nameCn}
                </span>
                <a
                  href={selected.dashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    color: "#8090a0",
                    textDecoration: "none",
                  }}
                >
                  Open in new tab ↗
                </a>
              </div>
              <iframe
                src={selected.dashboardUrl}
                title={selected.name}
                style={{
                  width: "100%",
                  height: "calc(100% - 40px)",
                  border: "none",
                }}
              />
            </div>
          ) : (
            <div
              style={{
                background: "white",
                borderRadius: 12,
                border: "1px solid #E8E8E8",
                padding: "60px 40px",
                textAlign: "center",
                color: "#999",
              }}
            >
              <div style={{ fontSize: 48, marginBottom: 16 }}>🛠️</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "#666" }}>
                {selected?.name}
              </div>
              <div style={{ fontSize: 13, marginTop: 8 }}>
                Dashboard coming soon — {selected?.status === "dev" ? "currently in development" : "planned for future sprint"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
