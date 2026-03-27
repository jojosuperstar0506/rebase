// Market Intelligence Agent — Setup & Status Page
// Phase 2: Full onboarding form coming soon
// For now shows what the agent does and how to get started

const BG = "#0c0c14";
const S1 = "#14141e";
const S2 = "#1c1c28";
const BD = "#2a2a3a";
const AC = "#06b6d4";
const TX = "#e4e4ec";
const T2 = "#9898a8";

export default function MarketIntelligence() {
  return (
    <div style={{ background: BG, minHeight: "100vh", color: TX, fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>
            Market Intelligence Agent
          </h1>
          <p style={{ fontSize: 14, color: T2, margin: 0 }}>市场情报助手 — 每日个性化竞品与趋势报告</p>
        </div>

        {/* How it works */}
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: AC, margin: "0 0 16px" }}>⚙️ How It Works</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { step: "1", text: "You set your industry, competitors, and product categories" },
              { step: "2", text: "Every morning at 6:30am HK, the agent fetches news from 6 sources" },
              { step: "3", text: "Claude analyzes with 3 lenses: Trend Radar, Competitive Dynamics, Opportunity Signals" },
              { step: "4", text: "Report arrives in your inbox at 7am with 👍/👎 feedback buttons" },
              { step: "5", text: "Every Sunday, your playbook is rewritten based on your feedback — reports get smarter" },
            ].map(item => (
              <div key={item.step} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: AC, color: "#000", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {item.step}
                </div>
                <p style={{ margin: 0, fontSize: 14, color: TX, lineHeight: 1.6 }}>{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* News sources */}
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: AC, margin: "0 0 16px" }}>🌐 News Sources</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { name: "Google News EN", region: "🌍 Global" },
              { name: "Google News CN", region: "🇨🇳 China" },
              { name: "Reddit", region: "🇺🇸 US Sentiment" },
              { name: "36氪", region: "🇨🇳 CN Tech" },
              { name: "虎嗅", region: "🇨🇳 CN Business" },
              { name: "Reuters", region: "🌍 Global" },
            ].map(s => (
              <div key={s.name} style={{ background: S2, borderRadius: 8, padding: "10px 14px", border: `1px solid ${BD}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: TX }}>{s.name}</div>
                <div style={{ fontSize: 11, color: T2, marginTop: 2 }}>{s.region}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 3 lenses */}
        <div style={{ background: S1, border: `1px solid ${BD}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: AC, margin: "0 0 16px" }}>🔍 3-Lens Analysis</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              { icon: "🔥", name: "Trend Radar", desc: "Top 2-3 trends moving in your industry right now — what's driving them, how fast, and where." },
              { icon: "🎯", name: "Competitive Dynamics", desc: "What your competitors are doing, their strategic signals, and sentiment for each move." },
              { icon: "⚡", name: "Opportunity Signals", desc: "3 specific, actionable opportunities this week based on today's news — with priority levels." },
            ].map(l => (
              <div key={l.name} style={{ display: "flex", gap: 14, padding: "12px 14px", background: S2, borderRadius: 8, border: `1px solid ${BD}` }}>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{l.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 4 }}>{l.name}</div>
                  <div style={{ fontSize: 13, color: T2, lineHeight: 1.55 }}>{l.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Setup CTA */}
        <div style={{ background: `${AC}15`, border: `1px solid ${AC}40`, borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>🚀</div>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#fff", margin: "0 0 8px" }}>
            Personalized Setup Coming Soon
          </h2>
          <p style={{ fontSize: 13, color: T2, margin: "0 0 16px", lineHeight: 1.6 }}>
            You'll be able to configure your industry, competitors, and geography directly here.<br />
            For early access, contact the Rebase team.
          </p>
          <div style={{ display: "inline-block", padding: "10px 24px", background: AC, color: "#000", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
            Contact Rebase for Early Access
          </div>
        </div>

      </div>
    </div>
  );
}
