import { useApp } from "../context/AppContext";

export default function CostDashboard() {
  const { colors: C, lang } = useApp();

  const features = [
    {
      icon: "💸",
      title: lang === "zh" ? "实时 AI 成本追踪" : "Real-time AI Cost Tracking",
      desc: lang === "zh"
        ? "按智能体、按任务追踪每月 AI API 消耗，精确到每次调用。"
        : "Track monthly AI API spend by agent and task, down to every API call.",
    },
    {
      icon: "📈",
      title: lang === "zh" ? "ROI 仪表盘" : "ROI Dashboard",
      desc: lang === "zh"
        ? "节省工时 × 城市薪资 = 每月量化节省额，一眼看清 AI 的真实回报。"
        : "Hours saved × salary benchmark = monthly savings — see the real return on your AI investment.",
    },
    {
      icon: "🏆",
      title: lang === "zh" ? "行业对标" : "Industry Benchmarking",
      desc: lang === "zh"
        ? "与同行业企业的 AI 支出效率对比，找到优化空间。"
        : "Compare your AI spend efficiency against peers in the same industry.",
    },
    {
      icon: "🔔",
      title: lang === "zh" ? "预算预警" : "Budget Alerts",
      desc: lang === "zh"
        ? "自定义每月预算上限，超阈值自动推送告警通知。"
        : "Set monthly budget caps and get instant alerts when you're approaching the limit.",
    },
  ];

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: 3, color: C.ac, background: C.ac + "18", border: `1px solid ${C.ac}44`, borderRadius: 20, padding: "4px 14px", marginBottom: 16, textTransform: "uppercase" }}>
            {lang === "zh" ? "即将推出" : "Coming Soon"}
          </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: C.tx, margin: "0 0 10px" }}>
            {lang === "zh" ? "成本 & ROI 仪表盘" : "Cost & ROI Dashboard"}
          </h1>
          <p style={{ fontSize: 15, color: C.t2, margin: 0, lineHeight: 1.65, maxWidth: 520 }}>
            {lang === "zh"
              ? "清晰看懂 AI 投入与产出，让每一分 AI 费用都产生可量化的业务价值。"
              : "See exactly what your AI investment is returning — measurable business value from every token spent."}
          </p>
        </div>

        {/* Feature preview cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginBottom: 40 }}>
          {features.map((f) => (
            <div key={f.title} style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 24, opacity: 0.85 }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.tx, marginBottom: 6 }}>{f.title}</div>
              <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>

        {/* ETA note */}
        <div style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 12, padding: "24px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 10 }}>🛠️</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.tx, marginBottom: 6 }}>
            {lang === "zh" ? "正在开发中" : "Under Active Development"}
          </div>
          <p style={{ fontSize: 13, color: C.t2, margin: 0, lineHeight: 1.6 }}>
            {lang === "zh"
              ? "成本追踪模块将在平台下一个版本中上线。届时您将看到完整的 AI 支出分析与 ROI 报告。"
              : "Cost tracking will ship in the next platform release. You'll see full AI spend analytics and ROI reporting when it's ready."}
          </p>
        </div>

      </div>
    </div>
  );
}
