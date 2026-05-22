// Market Intelligence Agent — Setup & Status Page
// Phase 2: Full onboarding form coming soon
// For now shows what the agent does and how to get started

import {
  Radar, Settings as SettingsIcon, Globe, Search,
  Flame, Target, Zap, Rocket,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useApp } from "../context/AppContext";

export default function MarketIntelligence() {
  const { colors: C, lang } = useApp();

  return (
    <div style={{ background: C.bg, minHeight: "100vh", color: C.tx, fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <Radar size={36} strokeWidth={1.75} color={C.ac} style={{ marginBottom: 12 }} />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: C.tx, margin: "0 0 8px" }}>
            {lang === "zh" ? "市场情报智能体" : "Market Intelligence Agent"}
          </h1>
          <p style={{ fontSize: 14, color: C.t2, margin: 0 }}>
            {lang === "zh" ? "市场情报助手 — 每日个性化竞品与趋势报告" : "Daily personalised competitor & trend reports, straight to your inbox."}
          </p>
        </div>

        {/* How it works */}
        <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: 24, marginBottom: 20 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.ac, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <SettingsIcon size={16} strokeWidth={2} />
            {lang === "zh" ? "运作方式" : "How It Works"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(lang === "zh" ? [
              { step: "1", text: "设置您的行业、竞品和产品类别" },
              { step: "2", text: "每天早上6:30（香港时间），智能体从6个来源抓取最新资讯" },
              { step: "3", text: "Claude用3个维度分析：趋势雷达、竞争动态、机会信号" },
              { step: "4", text: "早上7点，报告发送到您的邮箱，附带点赞/差评反馈按钮" },
              { step: "5", text: "每周日，根据您的反馈重写策略手册——报告越来越精准" },
            ] : [
              { step: "1", text: "You set your industry, competitors, and product categories" },
              { step: "2", text: "Every morning at 6:30am HK, the agent fetches news from 6 sources" },
              { step: "3", text: "Claude analyzes with 3 lenses: Trend Radar, Competitive Dynamics, Opportunity Signals" },
              { step: "4", text: "Report arrives in your inbox at 7am with thumbs-up / thumbs-down feedback buttons" },
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
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.ac, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <Globe size={16} strokeWidth={2} />
            {lang === "zh" ? "资讯来源" : "News Sources"}
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            {[
              { name: "Google News EN", region: lang === "zh" ? "全球" : "Global" },
              { name: "Google News CN", region: lang === "zh" ? "中国" : "China" },
              { name: "Reddit", region: lang === "zh" ? "美国情绪" : "US Sentiment" },
              { name: "36氪", region: lang === "zh" ? "中国科技" : "CN Tech" },
              { name: "虎嗅", region: lang === "zh" ? "中国商业" : "CN Business" },
              { name: "Reuters", region: lang === "zh" ? "全球" : "Global" },
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
          <h2 style={{ fontSize: 16, fontWeight: 700, color: C.ac, margin: "0 0 16px", display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={16} strokeWidth={2} />
            {lang === "zh" ? "三维分析框架" : "3-Lens Analysis"}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {(lang === "zh" ? [
              { Icon: Flame as LucideIcon, name: "趋势雷达", desc: "您所在行业正在发生的2-3个重大趋势——驱动因素、发展速度与走向。" },
              { Icon: Target as LucideIcon, name: "竞争动态", desc: "竞争对手的最新动向、战略信号，以及每个举措的市场反应分析。" },
              { Icon: Zap as LucideIcon, name: "机会信号", desc: "基于今日资讯，本周3个具体可执行的机会，附优先级评估。" },
            ] : [
              { Icon: Flame as LucideIcon, name: "Trend Radar", desc: "Top 2-3 trends moving in your industry right now — what's driving them, how fast, and where." },
              { Icon: Target as LucideIcon, name: "Competitive Dynamics", desc: "What your competitors are doing, their strategic signals, and sentiment for each move." },
              { Icon: Zap as LucideIcon, name: "Opportunity Signals", desc: "3 specific, actionable opportunities this week based on today's news — with priority levels." },
            ]).map(l => (
              <div key={l.name} style={{ display: "flex", gap: 14, padding: "12px 14px", background: C.s2, borderRadius: 8, border: `1px solid ${C.bd}` }}>
                <l.Icon size={20} strokeWidth={1.75} color={C.ac} style={{ flexShrink: 0, marginTop: 2 }} />
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
          <Rocket size={22} strokeWidth={1.75} color={C.ac} style={{ marginBottom: 8 }} />
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
