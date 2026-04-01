// Market Intelligence Agent — Setup & Status Page
// Phase 2: Full onboarding form coming soon
// For now shows what the agent does and how to get started

import { useApp } from "../context/AppContext";

export default function MarketIntelligence() {
  const { colors: C, lang } = useApp();

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.tx, fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.tx, margin: "0 0 8px" }}>
            {lang === "zh" ? "市场情报智能体" : "Market Intelligence Agent"}
          </h1>
          <p style={{ fontSize: 14, color: C.t2, margin: 0 }}>
            {lang === "zh" ? "市场情报助手 — 每日个性化竞品与趋势报告" : "Daily personalised competitor & trend reports, straight to your inbox."}
          </p>
        </div>

        {/* How it works */}
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.ac, margin: "0 0 16px" }}>
            {lang === "zh" ? "⚙️ 运作方式" : "⚙️ How It Works"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(lang === "zh" ? [
              { step: "1", text: "设置您的行业、竞品和产品类别" },
              { step: "2", text: "每天早上6:30（香港时间），智能体从6个来源抓取最新资讯" },
              { step: "3", text: "Claude用3个维度分析：趋势雷达、竞争动态、机会信号" },
              { step: "4", text: "早上7点，报告发送到您的邮箱，附带👍/👎反馈按钮" },
              { step: "5", text: "每周日，根据您的反馈重写策略手册——报告越来越精准" },
            ] : [
              { step: "1", text: "You set your industry, competitors, and product categories" },
              { step: "2", text: "Every morning at 6:30am HK, the agent fetches news from 6 sources" },
              { step: "3", text: "Claude analyzes with 3 lenses: Trend Radar, Competitive Dynamics, Opportunity Signals" },
              { step: "4", text: "Report arrives in your inbox at 7am with 👍/👎 feedback buttons" },
              { step: "5", text: "Every Sunday, your playbook is rewritten based on your feedback — reports get smarter" },
            ]).map(item => (
              <div key={item.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: C.ac, color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {item.step}
                </div>
                <p style={{ margin: 0, fontSize: 14, color: C.tx, lineHeight: 1.6 }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* News sources */}
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.ac, margin: "0 0 16px" }}>
            {lang === "zh" ? "🌐 资讯来源" : "🌐 News Sources"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { name: "Google News EN", region: "🌍 Global" },
              { name: "Google News CN", region: "🇨🇳 China" },
              { name: "Reddit", region: "🇺🇸 US Sentiment" },
              { name: "36氪", region: "🇨🇳 CN Tech" },
              { name: "虎嗅", region: "🇨🇳 CN Business" },
              { name: "Reuters", region: "🌍 Global" },
            ].map(s => (
              <div key={s.name} style={{ background: C.s2, borderRadius: 8, padding: "10px 14px", border: `1px solid ${C.bd}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx }}>{s.name}</div>
                <div style={{ fontSize: 11, color: C.t2, marginTop: 2 }}>{s.region}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 lenses */}
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.ac, margin: "0 0 16px" }}>
            {lang === "zh" ? "🔍 三维分析框架" : "🔍 3-Lens Analysis"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(lang === "zh" ? [
              { icon: "🔥", name: "趋势雷达", desc: "您所在行业正在发生的2-3个重大趋势——驱动因素、发展速度与走向。" },
              { icon: "🎯", name: "竞争动态", desc: "竞争对手的最新动向、战略信号，以及每个举措的市场反应分析。" },
              { icon: "⚡", name: "机会信号", desc: "基于今日资讯，本周3个具体可执行的机会，附优先级评估。" },
            ] : [
              { icon: "🔥", name: "Trend Radar", desc: "Top 2-3 trends moving in your industry right now — what's driving them, how fast, and where." },
              { icon: "🎯", name: "Competitive Dynamics", desc: "What your competitors are doing, their strategic signals, and sentiment for each move." },
              { icon: "⚡", name: "Opportunity Signals", desc: "3 specific, actionable opportunities this week based on today's news — with priority levels." },
            ]).map(l => (
              <div key={l.name} style={{ display: "flex", gap: 14, padding: "12px 14px", background: C.s2, borderRadius: 8, border: `1px solid ${C.bd}` }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{l.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 4 }}>{l.name}</div>
                  <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.55 }}>{l.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Setup CTA */}
        <div style={{ background: `${C.ac}15`, border: `1px solid ${C.ac}40`, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🚀</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.tx, margin: "0 0 8px" }}>
            {lang === "zh" ? "个性化配置即将上线" : "Personalized Setup Coming Soon"}
          </h2>
          <p style={{ fontSize: 13, color: C.t2, margin: "0 0 16px", lineHeight: 1.6 }}>
            {lang === "zh"
              ? "您将能够直接在此配置行业、竞品和地域范围。\n如需提前体验，请联系 Rebase 团队。"
              : "You'll be able to configure your industry, competitors, and geography directly here.\nFor early access, contact the Rebase team."}
          </p>
          <div style={{ display: "inline-block", padding: "10px 24px", background: C.ac, color: "#000", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            {lang === "zh" ? "联系 Rebase 获取早期访问权限" : "Contact Rebase for Early Access"}
          </div>
        </div>

      </div>
    </div>
  );
}
