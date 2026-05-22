import { Mail, ShieldCheck, Clock, Users } from "lucide-react";
import { useApp } from "../context/AppContext";

/**
 * /contact — public-facing contact page.
 *
 * Replaces the previous mailto-only nav link. Goal: when a YC reviewer or
 * prospective customer hits this page, they should immediately understand
 * (1) who they're contacting, (2) how to reach us, (3) when to expect a
 * reply, and (4) how we handle their data. No backend / form here — it's
 * a static information page with a mailto link as the action.
 *
 * Push-back vs. an in-app feedback form: a textarea + send + backend +
 * spam/abuse handling + admin inbox is a full mini-feature. The mailto
 * answer is 80% of the value at 5% of the effort, and emails route into
 * an inbox we already monitor.
 */
const SUPPORT_EMAIL = "hello@rebase.io";

export default function Contact() {
  const { colors: C, lang } = useApp();

  const headline = lang === "zh" ? "联系 Rebase" : "Get in touch with Rebase";
  const subhead = lang === "zh"
    ? "我们正在与一小群消费品牌合作打磨这个产品。如有问题、反馈、合作意向，请直接联系我们——一般 24 小时内回复。"
    : "We're working closely with a small group of consumer brands to shape this product. Reach out for questions, feedback, or partnership inquiries — typically replied within 24 hours.";

  return (
    <div style={{
      background: C.bg, color: C.tx, minHeight: "100vh",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px" }}>

        {/* Hero */}
        <header style={{ marginBottom: 40 }}>
          <h1 style={{
            fontSize: "clamp(28px, 4.5vw, 42px)", fontWeight: 800,
            margin: "0 0 14px", letterSpacing: -0.5, lineHeight: 1.15,
          }}>
            {headline}
          </h1>
          <p style={{
            fontSize: 16, color: C.t2, lineHeight: 1.7, margin: 0, maxWidth: 580,
          }}>
            {subhead}
          </p>
        </header>

        {/* Email card — primary CTA */}
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Rebase%20feedback`}
          style={{
            display: "flex", alignItems: "center", gap: 18,
            background: C.s1, border: `1px solid ${C.bd}`,
            borderRadius: 14, padding: "22px 26px",
            textDecoration: "none", color: "inherit",
            marginBottom: 16,
            transition: "border-color .15s ease",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = C.ac)}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = C.bd)}
        >
          <div style={{
            width: 48, height: 48, borderRadius: 10,
            background: `${C.ac}18`, display: "flex",
            alignItems: "center", justifyContent: "center",
            color: C.ac, flexShrink: 0,
          }}>
            <Mail size={22} strokeWidth={1.75} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
              {lang === "zh" ? "邮件联系" : "Email us"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>
              {SUPPORT_EMAIL}
            </div>
            <div style={{ fontSize: 13, color: C.t2, marginTop: 4 }}>
              {lang === "zh"
                ? "点击此处打开邮件客户端"
                : "Click to open your mail client"}
            </div>
          </div>
        </a>

        {/* Info row — 3 cards */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12, marginBottom: 32,
        }}>
          {/* Response time */}
          <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: "18px 20px" }}>
            <Clock size={18} strokeWidth={1.75} color={C.ac} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
              {lang === "zh" ? "回复时间" : "Response time"}
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
              {lang === "zh"
                ? "我们一般在 24 小时内回复（工作日北京 / 香港时间）。"
                : "Typically within 24 hours (HK / Beijing business hours)."}
            </div>
          </div>

          {/* Team */}
          <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: "18px 20px" }}>
            <Users size={18} strokeWidth={1.75} color={C.ac} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
              {lang === "zh" ? "团队" : "Team"}
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
              {lang === "zh"
                ? "由 Joanna（CEO，前麦肯锡 / 德勤运营）和 William（CTO，前德勤并购消费分析）创建。"
                : "Built by Joanna (CEO, ex-McKinsey + ex-Deloitte operator) and William (CTO, ex-Deloitte M&A consumer analytics)."}
            </div>
          </div>

          {/* Privacy */}
          <div style={{ background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12, padding: "18px 20px" }}>
            <ShieldCheck size={18} strokeWidth={1.75} color={C.ac} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
              {lang === "zh" ? "数据隐私" : "Data privacy"}
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>
              {lang === "zh"
                ? "您的工作区数据仅用于您自己的简报与分析，不与其他客户共享。"
                : "Your workspace data is used only for your own briefs and analytics — never shared across customers."}
            </div>
          </div>
        </div>

        {/* Privacy / data handling — fuller copy */}
        <section style={{
          background: C.s2, border: `1px solid ${C.bd}`,
          borderRadius: 12, padding: "24px 28px", marginBottom: 32,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.ac, letterSpacing: 2, textTransform: "uppercase", marginBottom: 12 }}>
            {lang === "zh" ? "我们如何处理您的数据" : "How we handle your data"}
          </div>
          <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.7, margin: "0 0 12px" }}>
            {lang === "zh"
              ? "Rebase 收集的数据分两类：（1）您主动提供的工作区配置（品牌名、追踪的竞品列表、行业分类）；（2）从公开平台（小红书、抖音、天猫、生意参谋）抓取的竞品公开数据。所有工作区数据都按账号隔离 —— 您的简报、分析、内容草稿不会出现在其他客户的工作区。"
              : "Rebase collects two kinds of data: (1) workspace configuration you provide (brand name, competitor list, industry tag); (2) competitor public data scraped from public platforms (Xiaohongshu, Douyin, Tmall, 生意参谋). Every workspace's data is isolated by account — your briefs, analytics, and content drafts never surface in another customer's workspace."}
          </p>
          <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.7, margin: "0 0 12px" }}>
            {lang === "zh"
              ? "我们不出售用户数据，也不向第三方广告网络共享。LLM 调用（DeepSeek、Anthropic Claude 等）仅在生成简报或内容草稿时触发，仅传输生成所需的工作区数据，不包含您的认证凭据或私人信息。"
              : "We do not sell user data and do not share with third-party ad networks. LLM calls (DeepSeek, Anthropic Claude, etc.) are triggered only when generating a brief or content draft, and only transmit the workspace data required for generation — never authentication credentials or personally identifying information."}
          </p>
          <p style={{ fontSize: 14, color: C.t2, lineHeight: 1.7, margin: 0 }}>
            {lang === "zh"
              ? "如果您希望删除工作区或导出数据，请通过上方邮箱联系我们。"
              : "To delete a workspace or export your data, email us at the address above."}
          </p>
        </section>

        {/* Footer */}
        <p style={{ fontSize: 12, color: C.t3, textAlign: "center", margin: 0 }}>
          {lang === "zh"
            ? "© 2026 Rebase · AI 原生消费品牌增长智能体平台"
            : "© 2026 Rebase · AI-Native Agency for Consumer Brand GTM"}
        </p>
      </div>
    </div>
  );
}
