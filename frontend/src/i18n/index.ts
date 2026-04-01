export type Lang = "en" | "zh";

export const T = {
  // ── Nav ─────────────────────────────────────────────────────────
  nav: {
    diagnostics: { en: "Diagnostics", zh: "AI诊断" },
    requestAccess: { en: "Request Access", zh: "申请使用" },
    agents: { en: "Agents", zh: "智能体" },
    workflows: { en: "Workflow Discovery", zh: "流程扫描" },
    costs: { en: "Costs", zh: "费用" },
    admin: { en: "Admin", zh: "管理" },
    login: { en: "Log in", zh: "登录" },
    logout: { en: "Log out", zh: "退出" },
    darkMode: { en: "Dark", zh: "深色" },
    lightMode: { en: "Light", zh: "浅色" },
  },

  // ── Home ────────────────────────────────────────────────────────
  home: {
    badge: { en: "AI Intelligence Platform for Chinese SMBs", zh: "专为中国中小企业打造的AI智能平台" },
    heroTitle1: { en: "Your business,", zh: "您的企业，" },
    heroTitle2: { en: "powered by AI", zh: "AI赋能未来" },
    heroSubtitle: {
      en: "Rebase gives Chinese SMBs a dedicated AI team — market intelligence, competitor tracking, content creation, and operations automation — all in one workspace built around your business.",
      zh: "Rebase 为中国中小企业提供专属AI团队——市场情报、竞品追踪、内容创作、运营自动化——所有功能围绕您的业务定制，集于一个工作台。",
    },
    ctaAccess: { en: "Request Access →", zh: "申请早期使用 →" },
    ctaDiag: { en: "Run AI Diagnostic", zh: "运行AI诊断" },
    earlyAccess: { en: "Early access · Invite only · Personally reviewed by Will & Joanna", zh: "限量早期体验 · 仅限邀请 · Will & Joanna 亲自审核" },
    whatWeDoLabel: { en: "What We Do", zh: "我们做什么" },
    whatWeDoTitle: { en: "Four AI agents. One workspace.", zh: "四大智能体，一个工作台。" },
    whatWeDoSub: {
      en: "Each agent is pre-loaded with your company profile so it works for your business from day one — not a generic tool you have to train.",
      zh: "每个智能体均预载您的公司档案，从第一天起就为您的业务服务——不是需要您从头训练的通用工具。",
    },
    pillars: [
      {
        icon: "📡",
        title: { en: "Market Intelligence", zh: "市场情报" },
        desc: {
          en: "Daily AI-powered reports aggregating competitor moves, industry trends, and opportunity signals across 6 data sources — delivered before you start your day.",
          zh: "每日AI报告，汇聚6大数据源的竞品动态、行业趋势和机会信号——在您开始新一天前送达。",
        },
      },
      {
        icon: "🎯",
        title: { en: "Competitor Tracking", zh: "竞品追踪" },
        desc: {
          en: "7-dimension brand equity tracking across your key competitors on XHS, Douyin, and Tmall. Updated every 3 days.",
          zh: "7维品牌资产追踪，覆盖小红书、抖音、天猫上的核心竞品，每3天更新一次。",
        },
      },
      {
        icon: "✍️",
        title: { en: "Content Creation", zh: "内容创作" },
        desc: {
          en: "From competitor analysis to publish-ready XHS notes in minutes. AI-powered pipeline that understands Chinese consumer psychology.",
          zh: "从竞品分析到可发布的小红书笔记，数分钟内完成。AI流水线深度理解中国消费者心理。",
        },
      },
      {
        icon: "⚙️",
        title: { en: "Operations Automation", zh: "运营自动化" },
        desc: {
          en: "AI agents that handle order syncing, inventory tracking, reconciliation, and invoicing — so your team focuses on growth.",
          zh: "AI智能体处理订单同步、库存追踪、对账和开票——让您的团队专注于增长。",
        },
      },
    ],
    diagLabel: { en: "Free Tool", zh: "免费工具" },
    diagTitle: { en: "How much could AI unlock for your business?", zh: "AI能为您的企业释放多少潜力？" },
    diagDesc: {
      en: "Answer 10 questions about your operations. Our diagnostic calculates your AI opportunity — in hours saved, cost reduced, and revenue unlocked.",
      zh: "回答10个关于您运营的问题，我们的诊断工具将计算您的AI机会——节省的时间、降低的成本、释放的营收。",
    },
    diagCta: { en: "Run Free Diagnostic →", zh: "立即运行免费诊断 →" },
    diagNote: { en: "No account needed", zh: "无需注册账号" },
    howLabel: { en: "How It Works", zh: "如何使用" },
    howTitle: { en: "From application to AI workspace in 24 hours", zh: "从申请到AI工作台，仅需24小时" },
    steps: [
      {
        step: "01",
        title: { en: "Tell us about your business", zh: "介绍您的业务" },
        desc: { en: "Fill out a short profile — your industry, competitors, and goals. Takes 2 minutes.", zh: "填写简短档案——您的行业、竞品和目标，仅需2分钟。" },
      },
      {
        step: "02",
        title: { en: "We review and approve", zh: "我们审核并批准" },
        desc: { en: "Will and Joanna personally review each application and send you a unique access code.", zh: "Will 和 Joanna 亲自审核每份申请，并为您发送专属访问码。" },
      },
      {
        step: "03",
        title: { en: "Access your AI workspace", zh: "进入您的AI工作台" },
        desc: { en: "Log in with your code. Every agent is pre-configured with your business context.", zh: "使用您的访问码登录，每个智能体均已预配置您的业务背景。" },
      },
    ],
    finalTitle: { en: "Ready to see what AI can do for your business?", zh: "准备好探索AI能为您的业务做什么了吗？" },
    finalSub: { en: "Early access is limited. We personally onboard every client.", zh: "早期名额有限，我们亲自为每位客户完成配置。" },
    finalCta: { en: "Apply for Early Access →", zh: "申请早期使用 →" },
    footer: { en: "© 2026 Rebase · AI Intelligence for Chinese SMBs · Built by Will & Joanna", zh: "© 2026 Rebase · 专为中国中小企业的AI智能平台 · Will & Joanna 创建" },
  },

  // ── Success ─────────────────────────────────────────────────────
  success: {
    badge: { en: "Application Received", zh: "申请已收到" },
    title: { en: "Your first step toward AI empowerment", zh: "您迈向AI赋能的第一步" },
    subtitle: {
      en: "Thank you for applying to Rebase. Will and Joanna will personally review your application and reach out within 24 hours with your access details.",
      zh: "感谢您申请使用 Rebase。Will 和 Joanna 将亲自审核您的申请，并在24小时内与您联系，提供详细的访问方式。",
    },
    whatNextTitle: { en: "What happens next", zh: "接下来会发生什么" },
    steps: [
      { icon: "📋", title: { en: "Your profile is saved", zh: "您的档案已保存" }, desc: { en: "Your business information is securely stored and ready for agent configuration.", zh: "您的业务信息已安全保存，随时可为智能体配置。" } },
      { icon: "🔍", title: { en: "We review your application", zh: "我们审核您的申请" }, desc: { en: "Will and Joanna personally review every application — usually within a few hours.", zh: "Will 和 Joanna 亲自审核每份申请——通常在几小时内完成。" } },
      { icon: "🔑", title: { en: "You receive your invite code", zh: "您收到邀请码" }, desc: { en: "We'll reach out with a unique invite code personalised to your business within 24 hours.", zh: "我们将在24小时内为您发送专属邀请码，完全为您的业务量身定制。" } },
      { icon: "🚀", title: { en: "Your AI workspace is ready", zh: "您的AI工作台就绪" }, desc: { en: "Log in and access agents pre-loaded with your company profile, competitors, and goals.", zh: "登录后即可访问已预载您的公司档案、竞品信息和目标的智能体。" } },
    ],
    aboutTitle: { en: "What is Rebase?", zh: "什么是 Rebase？" },
    aboutDesc: {
      en: "Rebase is an AI intelligence platform built specifically for Chinese SMBs. We believe every business — no matter the size — deserves the same AI capabilities that enterprise companies have. Our agents run 24/7, learning your business and delivering insights that used to require an entire research team.",
      zh: "Rebase 是专为中国中小企业打造的AI智能平台。我们相信，无论规模大小，每家企业都应该拥有与大型企业同等的AI能力。我们的智能体全天候运行，学习您的业务，并提供过去需要整个研究团队才能产出的洞察。",
    },
    backHome: { en: "← Back to Home", zh: "← 返回首页" },
    loginPrompt: { en: "Already have an invite code?", zh: "已有邀请码？" },
    loginLink: { en: "Log in →", zh: "立即登录 →" },
  },

  // ── Login ───────────────────────────────────────────────────────
  login: {
    subtitle: { en: "Enter your invite code to access your workspace", zh: "输入邀请码访问您的工作台" },
    label: { en: "INVITE CODE", zh: "邀请码" },
    placeholder: { en: "RB-YOURCO-XXXX", zh: "RB-YOURCO-XXXX" },
    button: { en: "Enter Rebase →", zh: "进入 Rebase →" },
    loading: { en: "Checking...", zh: "验证中..." },
    noCode: { en: "Don't have a code?", zh: "还没有邀请码？" },
    requestLink: { en: "Request access", zh: "申请使用" },
  },

  // ── Onboarding ──────────────────────────────────────────────────
  onboarding: {
    badge: { en: "Early Access Application", zh: "早期使用申请" },
    title: { en: "Tell us about your business", zh: "介绍您的业务" },
    subtitle: { en: "2 minutes. No commitment. Will & Joanna review every application personally.", zh: "仅需2分钟，无需承诺，Will & Joanna 亲自审核每份申请。" },
    fields: {
      name: { en: "FULL NAME *", zh: "姓名 *" },
      phone: { en: "PHONE NUMBER *", zh: "手机号 *" },
      company: { en: "COMPANY NAME", zh: "公司名称" },
      industry: { en: "INDUSTRY *", zh: "行业 *" },
      competitors: { en: "KEY COMPETITORS", zh: "主要竞品" },
      email: { en: "EMAIL", zh: "电子邮件" },
      goal: { en: "WHAT DO YOU WANT AI TO HELP WITH?", zh: "您希望AI帮助您解决什么问题？" },
    },
    placeholders: {
      name: { en: "Your name", zh: "您的姓名" },
      phone: { en: "+86 138 0000 0000", zh: "+86 138 0000 0000" },
      company: { en: "Your company", zh: "您的公司" },
      industry: { en: "e.g. Fashion, SaaS, F&B", zh: "例如：服装、SaaS、餐饮" },
      competitors: { en: "e.g. Brand A, Brand B", zh: "例如：品牌A、品牌B" },
      email: { en: "you@company.com", zh: "you@company.com" },
      goal: { en: "e.g. Market intelligence, content creation", zh: "例如：市场情报、内容创作" },
    },
    validation: { en: "Please fill in Name, Phone, and Industry at minimum.", zh: "请至少填写姓名、手机号和行业。" },
    submit: { en: "Request Early Access →", zh: "申请早期使用 →" },
    submitting: { en: "Submitting...", zh: "提交中..." },
    error: { en: "Something went wrong. Please try again.", zh: "出现错误，请重试。" },
  },
} as const;

export function t(key: { en: string; zh: string }, lang: Lang): string {
  return key[lang];
}
