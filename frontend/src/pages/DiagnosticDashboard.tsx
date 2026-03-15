import { useState, useEffect, useRef } from "react";
import { mockData, type Department, type PainPoint, type AIAgent } from "../data/mockVisualization";

// ─── Layout positions for department bubbles (grid layout) ───
const POSITIONS: Record<string, { x: number; y: number }> = {
  sales: { x: 80, y: 40 },
  production: { x: 420, y: 40 },
  procurement: { x: 80, y: 260 },
  warehouse: { x: 420, y: 260 },
  finance: { x: 80, y: 480 },
  qc: { x: 420, y: 480 },
};

// ─── Animated counter hook ───
function useAnimatedCounter(target: number, duration: number, active: boolean) {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      setValue(0);
      return;
    }
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setValue(Math.round(target * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration, active]);

  return value;
}

// ─── Department Bubble ───
function DepartmentBubble({ dept, showAI }: { dept: Department; showAI: boolean }) {
  const pos = POSITIONS[dept.id] || { x: 0, y: 0 };
  const size = Math.max(120, 80 + dept.headcount * 4);

  return (
    <g transform={`translate(${pos.x}, ${pos.y})`} style={{ transition: "all 0.6s ease" }}>
      <rect
        width={size}
        height={100}
        rx={12}
        fill="white"
        stroke={showAI ? "#50B83C" : dept.color}
        strokeWidth={2.5}
        style={{ transition: "stroke 0.6s ease", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.08))" }}
      />
      <text x={14} y={28} fontSize={22}>
        {dept.icon}
      </text>
      <text x={42} y={28} fontSize={14} fontWeight={600} fill="#1a1a1a">
        {dept.name}
      </text>
      <text x={42} y={44} fontSize={11} fill="#666">
        {dept.nameCn}
      </text>
      <text x={14} y={68} fontSize={11} fill="#888">
        {dept.headcount} people
      </text>
      <text x={14} y={84} fontSize={10} fill="#aaa">
        {dept.tools.join(", ")}
      </text>
    </g>
  );
}

// ─── Connection Line ───
function ConnectionLine({
  from,
  to,
  conn,
  painPoint,
  agent,
  showAI,
}: {
  from: string;
  to: string;
  conn: { type: string; frequency: string };
  painPoint?: PainPoint;
  agent?: AIAgent;
  showAI: boolean;
}) {
  const p1 = POSITIONS[from];
  const p2 = POSITIONS[to];
  if (!p1 || !p2) return null;

  const x1 = p1.x + 80;
  const y1 = p1.y + 100;
  const x2 = p2.x + 80;
  const y2 = p2.y;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;

  const isActive = showAI && agent;
  const lineColor = isActive ? "#50B83C" : painPoint ? "#E8453C" : "#ccc";

  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke={lineColor}
        strokeWidth={painPoint ? 2.5 : 1.5}
        strokeDasharray={isActive ? "none" : "6 4"}
        style={{ transition: "all 0.6s ease" }}
      />
      {/* Connection label */}
      <rect
        x={mx - 40}
        y={my - 12}
        width={80}
        height={24}
        rx={12}
        fill={isActive ? "#E8F5E9" : painPoint ? "#FFF3F0" : "#f5f5f5"}
        style={{ transition: "fill 0.6s ease" }}
      />
      <text x={mx} y={my + 4} textAnchor="middle" fontSize={9} fill={isActive ? "#2E7D32" : "#888"}>
        {isActive ? "🤖 auto" : conn.type}
      </text>
    </g>
  );
}

// ─── Pain Hotspot Card ───
function PainCard({ pain, agent, showAI }: { pain: PainPoint; agent?: AIAgent; showAI: boolean }) {
  const isResolved = showAI && agent;

  return (
    <div
      style={{
        padding: "14px 18px",
        borderRadius: 10,
        border: `1.5px solid ${isResolved ? "#C8E6C9" : "#FFCDD2"}`,
        background: isResolved ? "#F1F8E9" : "#FFF8F6",
        transition: "all 0.5s ease",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 16 }}>{isResolved ? "🤖" : "🔴"}</span>
            <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>
              {isResolved ? agent!.name : `${pain.connection[0]} → ${pain.connection[1]}`}
            </span>
          </div>
          <p style={{ margin: "4px 0", fontSize: 12.5, color: "#444", lineHeight: 1.5 }}>
            {isResolved ? agent!.description : pain.description}
          </p>
          <p style={{ margin: "2px 0", fontSize: 11, color: "#888" }}>
            {isResolved ? agent!.descriptionCn : pain.descriptionCn}
          </p>
        </div>
        <div style={{ textAlign: "right", minWidth: 130, paddingLeft: 12 }}>
          {isResolved ? (
            <>
              <div style={{ fontSize: 12, color: "#2E7D32", fontWeight: 600 }}>
                ⏱ {pain.hoursPerWeek} hrs → {agent!.residualHoursPerWeek} hr
              </div>
              <div style={{ fontSize: 14, color: "#2E7D32", fontWeight: 700, marginTop: 4 }}>
                💰 Saves ¥{agent!.savingsRmbMonthly.toLocaleString()}/mo
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 12, color: "#C62828", fontWeight: 600 }}>
                ⏱ {pain.hoursPerWeek} hrs/week
              </div>
              <div style={{ fontSize: 14, color: "#C62828", fontWeight: 700, marginTop: 4 }}>
                💰 ¥{pain.costRmbMonthly.toLocaleString()}/mo
              </div>
            </>
          )}
        </div>
      </div>
      {!showAI && pain.clientQuote && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            background: "#fff",
            borderRadius: 6,
            borderLeft: "3px solid #E8453C",
            fontSize: 11.5,
            color: "#666",
            fontStyle: "italic",
          }}
        >
          "{pain.clientQuote}"
        </div>
      )}
    </div>
  );
}

// ─── ROI Summary Section ───
function ROISummary() {
  const { roi } = mockData;
  const animatedSavings = useAnimatedCounter(roi.netSavingsRmbMonthly, 1500, true);
  const animatedHours = useAnimatedCounter(roi.hoursFreedPerWeek, 1200, true);
  const annualSavings = roi.netSavingsRmbMonthly * 12;

  return (
    <div>
      {/* Hero number */}
      <div
        style={{
          textAlign: "center",
          padding: "40px 20px",
          background: "linear-gradient(135deg, #1B5E20 0%, #2E7D32 50%, #43A047 100%)",
          borderRadius: 16,
          color: "white",
          marginBottom: 24,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.85, marginBottom: 8 }}>Net Monthly Savings / 每月净省</div>
        <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: -1 }}>
          ¥{animatedSavings.toLocaleString()}
        </div>
        <div style={{ fontSize: 14, opacity: 0.7, marginTop: 8 }}>
          Annual: ¥{annualSavings.toLocaleString()} | Payback: &lt; 1 month
        </div>
      </div>

      {/* Stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: 12,
          marginBottom: 24,
        }}
      >
        {[
          {
            icon: "💰",
            label: "Monthly waste eliminated",
            labelCn: "每月减少浪费",
            value: `¥${roi.totalWasteRmbMonthly.toLocaleString()}`,
          },
          {
            icon: "🖥️",
            label: "Platform cost",
            labelCn: "平台费用",
            value: `¥${roi.platformCostRmbMonthly.toLocaleString()}`,
          },
          {
            icon: "📋",
            label: "Hours freed / week",
            labelCn: "每周释放工时",
            value: `${animatedHours} hrs`,
          },
          {
            icon: "❌",
            label: "Error reduction",
            labelCn: "错误减少",
            value: `~${roi.errorReductionPercent}%`,
          },
        ].map((stat, i) => (
          <div
            key={i}
            style={{
              padding: "16px",
              background: "#FAFAFA",
              borderRadius: 10,
              border: "1px solid #E8E8E8",
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 6 }}>{stat.icon}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{stat.value}</div>
            <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 11, color: "#aaa" }}>{stat.labelCn}</div>
          </div>
        ))}
      </div>

      {/* What your team gets back */}
      <div
        style={{
          padding: "20px 24px",
          background: "#F1F8E9",
          borderRadius: 12,
          border: "1px solid #C8E6C9",
          marginBottom: 24,
        }}
      >
        <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12, color: "#2E7D32" }}>
          What your team gets back / 您的团队将获得
        </div>
        {[
          { icon: "📋", text: `${roi.hoursFreedPerWeek} hrs/week freed from repetitive work`, textCn: "每周释放重复性工作时间" },
          { icon: "❌", text: `~${roi.errorReductionPercent}% fewer data entry errors`, textCn: "数据录入错误大幅减少" },
          { icon: "⚡", text: `Customer responses: ${roi.responseTimeImprovement}`, textCn: "客户响应速度大幅提升" },
          { icon: "🧑‍💼", text: "Staff can focus on growth, not paperwork", textCn: "员工专注业务增长，而非文书工作" },
        ].map((item, i) => (
          <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 13, color: "#333" }}>{item.text}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{item.textCn}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          textAlign: "center",
          padding: "32px 20px",
          background: "linear-gradient(135deg, #0D47A1, #1565C0)",
          borderRadius: 16,
          color: "white",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>开始免费试用</div>
        <div style={{ fontSize: 15, marginBottom: 16 }}>Start Free Pilot</div>
        <div style={{ fontSize: 12, opacity: 0.8 }}>
          Want deeper analysis? Upload your documents for a full operational audit (free during pilot)
        </div>
        <button
          style={{
            marginTop: 16,
            padding: "12px 32px",
            borderRadius: 8,
            border: "2px solid white",
            background: "transparent",
            color: "white",
            fontSize: 14,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Upload Documents / 上传文件 →
        </button>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───
export default function DiagnosticDashboard() {
  const [showAI, setShowAI] = useState(false);
  const data = mockData;

  // Map pain points to connections
  const painByConnection = new Map<string, PainPoint>();
  data.painPoints.forEach((p) => {
    painByConnection.set(`${p.connection[0]}-${p.connection[1]}`, p);
  });

  // Map agents to pain points
  const agentByPainId = new Map<number, AIAgent>();
  data.aiAgents.forEach((a) => {
    agentByPainId.set(a.replacesPainPoint, a);
  });

  const totalWaste = data.painPoints.reduce((sum, p) => sum + p.costRmbMonthly, 0);
  const totalSavings = data.aiAgents.reduce((sum, a) => sum + a.savingsRmbMonthly, 0);
  const totalHoursWasted = data.painPoints.reduce((sum, p) => sum + p.hoursPerWeek, 0);

  return (
    <div style={{ fontFamily: "'Inter', 'SF Pro Display', system-ui, sans-serif", background: "#FAFBFC", minHeight: "100vh" }}>
      {/* Header */}
      <div
        style={{
          padding: "24px 32px",
          background: "white",
          borderBottom: "1px solid #E8E8E8",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>
            {data.companyName}
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "#888" }}>
            {data.vertical} · {data.departments.reduce((s, d) => s + d.headcount, 0)} employees ·{" "}
            {data.departments.length} departments
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "6px 6px 6px 16px",
            background: "#F5F5F5",
            borderRadius: 24,
          }}
        >
          <span style={{ fontSize: 13, color: showAI ? "#888" : "#C62828", fontWeight: showAI ? 400 : 600 }}>
            现状 Current
          </span>
          <button
            onClick={() => setShowAI(!showAI)}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              border: "none",
              background: showAI ? "#43A047" : "#ccc",
              position: "relative",
              cursor: "pointer",
              transition: "background 0.3s ease",
            }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: "50%",
                background: "white",
                position: "absolute",
                top: 2,
                left: showAI ? 24 : 2,
                transition: "left 0.3s ease",
                boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }}
            />
          </button>
          <span style={{ fontSize: 13, color: showAI ? "#2E7D32" : "#888", fontWeight: showAI ? 600 : 400 }}>
            AI 赋能 With AI
          </span>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "24px 16px" }}>
        {/* ─── SCREEN 1 & 2: Department Map ─── */}
        <div style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
            {showAI ? "AI 赋能后  Your Business with AI" : "您的企业现状  Your Business Today"}
          </h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
            {showAI
              ? "Toggle off to see your current state. Each 🤖 is an AI agent handling work automatically."
              : "This is your business as you described it. Toggle 'With AI' to see the transformation."}
          </p>

          {/* SVG Department Map */}
          <div
            style={{
              background: "white",
              borderRadius: 16,
              border: "1px solid #E8E8E8",
              padding: "16px",
              marginBottom: 16,
              overflow: "hidden",
            }}
          >
            <svg viewBox="0 0 620 600" style={{ width: "100%", height: "auto" }}>
              {/* Connection lines */}
              {data.connections.map((conn, i) => {
                const key = `${conn.from}-${conn.to}`;
                const pain = painByConnection.get(key);
                const agent = pain ? agentByPainId.get(pain.id) : undefined;
                return (
                  <ConnectionLine
                    key={i}
                    from={conn.from}
                    to={conn.to}
                    conn={conn}
                    painPoint={pain}
                    agent={agent}
                    showAI={showAI}
                  />
                );
              })}
              {/* Department bubbles */}
              {data.departments.map((dept) => (
                <DepartmentBubble key={dept.id} dept={dept} showAI={showAI} />
              ))}
            </svg>
          </div>

          {/* Pain Hotspot / AI Agent Cards */}
          <div
            style={{
              background: "white",
              borderRadius: 16,
              border: "1px solid #E8E8E8",
              padding: "20px",
            }}
          >
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: 14,
                fontWeight: 600,
                color: showAI ? "#2E7D32" : "#C62828",
                transition: "color 0.4s ease",
              }}
            >
              {showAI ? "🟢 What AI Handles" : "🔴 Pain Hotspots"}
            </h3>
            {data.painPoints.map((pain) => {
              const agent = agentByPainId.get(pain.id);
              return <PainCard key={pain.id} pain={pain} agent={agent} showAI={showAI} />;
            })}
            <div
              style={{
                marginTop: 16,
                padding: "14px 20px",
                borderRadius: 10,
                background: showAI ? "#E8F5E9" : "#FFF3E0",
                textAlign: "center",
                fontWeight: 700,
                fontSize: 15,
                color: showAI ? "#2E7D32" : "#E65100",
                transition: "all 0.4s ease",
              }}
            >
              {showAI
                ? `✅ Recovered: ⏱ ${data.aiAgents.reduce((s, a) => s + a.hoursSavedPerWeek, 0)} hrs/week  💰 ¥${totalSavings.toLocaleString()}/month saved`
                : `⚠️ Total wasted: ⏱ ${totalHoursWasted} hrs/week  💰 ¥${totalWaste.toLocaleString()}/month`}
            </div>
          </div>
        </div>

        {/* ─── SCREEN 3: The Bottom Line ─── */}
        <div style={{ marginBottom: 48 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>
            投资回报  Return on Investment
          </h2>
          <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>
            The bottom line — what this means for your business.
          </p>
          <ROISummary />
        </div>
      </div>
    </div>
  );
}
