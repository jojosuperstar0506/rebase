import { useState, useEffect } from "react";

// ─── DATA ───────────────────────────────────────────────────────────────────
// Each question now has `options` array for multi-select.
// Each selected option adds its `score` to the department total.
// reversed questions: selecting an option means MORE pain = we invert by subtracting from max.

const DEPARTMENTS = [
  {
    id: "media", name: "自媒体/内容部", nameEn: "Content & Social Media", icon: "📱", aiLevel: 78,
    capQuestions: [
      { q: "你们的自媒体团队目前在以下哪些环节已经用上了AI？", key: "fullloop", reversed: false,
        options: [
          { label: "竞品分析/行业调研", score: 1 },
          { label: "选题策划/热点追踪", score: 1 },
          { label: "文案撰写/改写", score: 1 },
          { label: "配图/海报生成", score: 1 },
          { label: "排版/发布自动化", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
      { q: "以下哪些问题仍然存在于你们的内容生产流程中？", key: "async", reversed: true,
        options: [
          { label: "每篇内容仍需人工从零撰写", score: 1 },
          { label: "设计师是瓶颈——配图要排队等", score: 1 },
          { label: "团队下班后内容生产完全停滞", score: 1 },
          { label: "缺乏数据驱动的选题决策", score: 1 },
          { label: "多平台发布需要手动逐个适配", score: 1 },
          { label: "以上问题基本都解决了", score: 0, exclusive: true },
        ]},
      { q: "在内容数据复盘方面，你们目前做到了哪些？", key: "dataloop", reversed: false,
        options: [
          { label: "AI自动生成各平台数据报表", score: 1 },
          { label: "AI分析内容表现并归因", score: 1 },
          { label: "AI预测选题/时段的流量趋势", score: 1 },
          { label: "AI根据数据自动调整内容策略", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "内容编辑/撰稿", current: { count: 0, salary: 8000 }, withAI: { ratio: 0.4, note: "1人+AI可替代2.5人的产出" }, fullAI: { ratio: 0.15, note: "仅保留1名内容总监把关调性" },
        aiCanDo: ["批量生成多平台适配文案", "根据热点自动生成选题库并排序", "A/B测试标题与封面图", "自动改写/翻译/多平台适配"],
        talentProfile: "「AI内容操盘手」——懂Prompt Engineering，能搭建通义千问/Kimi写作工作流、审核AI输出质量。" },
      { title: "短视频编导/剪辑", current: { count: 0, salary: 10000 }, withAI: { ratio: 0.5, note: "AI脚本+自动剪辑，人负责创意把控" }, fullAI: { ratio: 0.25, note: "保留创意总监+AI执行全部生产" },
        aiCanDo: ["AI生成分镜脚本和拍摄方案", "自动粗剪+字幕+配乐（剪映AI）", "批量生成不同时长版本", "AI数字人口播（HeyGen/硅基智能）"],
        talentProfile: "「AI视频制片人」——精通剪映AI/可灵/即梦等工具链，用Prompt指导AI完成90%制作。" },
      { title: "平面设计/美工", current: { count: 0, salary: 8000 }, withAI: { ratio: 0.35, note: "AI出图+人微调，效率提升3倍" }, fullAI: { ratio: 0.1, note: "1名设计总监管理AI设计流水线" },
        aiCanDo: ["批量生成社媒配图/海报", "品牌视觉一致性自动检查", "AI抠图/修图/背景替换", "根据文案自动匹配视觉风格"],
        talentProfile: "「AI视觉总监」——能搭建通义万相/SD工作流，建立品牌LoRA模型。" },
      { title: "数据运营/分析", current: { count: 0, salary: 12000 }, withAI: { ratio: 0.5, note: "AI自动出报表，人做战略决策" }, fullAI: { ratio: 0.2, note: "AI全自动数据追踪+异常告警" },
        aiCanDo: ["自动抓取各平台数据汇总看板", "AI分析内容表现并归因", "预测下一波流量趋势", "自动生成周报/月报"],
        talentProfile: "「增长策略师」——定义AI监控指标、设计自动化决策树。" },
    ],
    insight: "一个「AI全能操盘手」+合适的工具链，可以替代传统5-8人的自媒体团队。",
    futureVision: "2026年：1名内容总监 + 1名AI操盘手 + AI工具链 = 过去10人团队的产出。", tools: ["通义千问/Kimi", "通义万相/即梦", "剪映AI/可灵", "飞书多维表格"],
  },
  {
    id: "customer_service", name: "客服部门", nameEn: "Customer Service", icon: "🎧", aiLevel: 85,
    capQuestions: [
      { q: "你们的客服目前以下哪些环节仍高度依赖人工？", key: "manual", reversed: true,
        options: [
          { label: "回复退款/物流/售后等重复性问题", score: 1 },
          { label: "手动分类和分配工单", score: 1 },
          { label: "质检靠抽检，覆盖率低于20%", score: 1 },
          { label: "夜间/周末基本无人值守", score: 1 },
          { label: "知识库更新靠人工手动维护", score: 1 },
          { label: "以上问题基本都解决了", score: 0, exclusive: true },
        ]},
      { q: "以下哪些AI客服能力你们已经部署？", key: "tiered", reversed: false,
        options: [
          { label: "AI机器人自动回复常见问题", score: 1 },
          { label: "AI自动分流（简单→AI / 复杂→人工）", score: 1 },
          { label: "AI实时情感分析和预警升级", score: 1 },
          { label: "AI自动生成质检报告", score: 1 },
          { label: "7×24小时AI自动接待", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "一线客服专员", current: { count: 0, salary: 6000 }, withAI: { ratio: 0.3, note: "AI处理70%常规咨询" }, fullAI: { ratio: 0.1, note: "仅保留VIP和危机处理" },
        aiCanDo: ["7×24智能客服机器人", "多语言实时翻译", "自动识别情绪调整话术", "自动查询订单/库存/物流"],
        talentProfile: "「客户体验经理」——训练AI客服、优化话术库、处理边缘案例。" },
      { title: "工单/质检专员", current: { count: 0, salary: 6500 }, withAI: { ratio: 0.25, note: "AI自动分类+100%质检" }, fullAI: { ratio: 0.05, note: "AI全自动质检" },
        aiCanDo: ["自动分类优先级排序工单", "100%对话质检", "实时情感分析+预警", "自动生成改进建议"],
        talentProfile: "「AI客服训练师」——优化AI模型、更新知识库、设计升级策略。" },
    ],
    insight: "客服是AI替代最成熟的领域。已有企业通过AI客服节省60%运营成本。",
    futureVision: "2026年：2-3名体验架构师 + AI = 过去20-30人客服团队的覆盖。", tools: ["钉钉智能客服", "企业微信AI", "网易七鱼", "智齿科技"],
  },
  {
    id: "sales", name: "销售部门", nameEn: "Sales", icon: "💼", aiLevel: 68,
    capQuestions: [
      { q: "你们的销售团队目前以下哪些环节仍靠手动完成？", key: "manual_research", reversed: true,
        options: [
          { label: "客户背景调研靠手动查", score: 1 },
          { label: "CRM数据录入靠销售手动填", score: 1 },
          { label: "报价方案每次手动定制", score: 1 },
          { label: "跟进提醒靠自己记/Excel", score: 1 },
          { label: "竞品话术靠口口相传", score: 1 },
          { label: "以上基本都自动化了", score: 0, exclusive: true },
        ]},
      { q: "以下哪些AI销售能力你们已经在使用？", key: "crm_ai", reversed: false,
        options: [
          { label: "AI自动线索评分和优先级排序", score: 1 },
          { label: "AI自动生成客户背景调研报告", score: 1 },
          { label: "AI辅助生成定制化提案/报价", score: 1 },
          { label: "通话录音AI分析+成交归因", score: 1 },
          { label: "AI自动跟进未回复的潜客", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "SDR/获客专员", current: { count: 0, salary: 8000 }, withAI: { ratio: 0.35, note: "AI自动挖线索+初触达" }, fullAI: { ratio: 0.1, note: "AI全自动培育" },
        aiCanDo: ["多渠道自动挖掘潜客", "AI个性化冷启动消息", "智能线索评分排序", "自动跟进未回复"],
        talentProfile: "「AI获客策略师」——设计AI获客流程、定义客户画像。" },
      { title: "销售代表/AE", current: { count: 0, salary: 15000 }, withAI: { ratio: 0.65, note: "AI做准备，人做关系" }, fullAI: { ratio: 0.45, note: "标准产品可AI全自动" },
        aiCanDo: ["自动客户背调报告", "实时话术辅助", "自动定制化提案", "通话分析+归因"],
        talentProfile: "「AI增强型顾问」——专注关系和复杂谈判，AI做全部准备。" },
    ],
    insight: "AI可替代67%的销售代表任务。AI使成交周期缩短78%。",
    futureVision: "2026年：5人AI增强团队 = 过去15人传统团队的业绩。", tools: ["飞书CRM", "纷享销客AI", "钉钉智能助理", "探迹智能获客"],
  },
  {
    id: "finance", name: "财务部门", nameEn: "Finance & Accounting", icon: "💰", aiLevel: 72,
    capQuestions: [
      { q: "以下哪些财务痛点在你们公司仍然存在？", key: "invoice", reversed: true,
        options: [
          { label: "发票仍靠人工逐张录入核对", score: 1 },
          { label: "月度报表编制需要3天以上", score: 1 },
          { label: "费用审批缺乏自动异常检测", score: 1 },
          { label: "银行流水对账靠手工", score: 1 },
          { label: "税务申报主要靠人工", score: 1 },
          { label: "以上基本都解决了", score: 0, exclusive: true },
        ]},
      { q: "以下哪些AI财务能力你们已经在用？", key: "expense", reversed: false,
        options: [
          { label: "发票OCR自动识别录入", score: 1 },
          { label: "AI自动三单匹配", score: 1 },
          { label: "AI自动生成财务报表", score: 1 },
          { label: "智能费用分类和科目匹配", score: 1 },
          { label: "现金流预测和偏差分析", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "记账/数据录入", current: { count: 0, salary: 5500 }, withAI: { ratio: 0.15, note: "AI处理90%录入" }, fullAI: { ratio: 0.05, note: "OCR+AI几乎完全取代" },
        aiCanDo: ["发票OCR自动识别", "银行流水自动对账", "自动三单匹配", "异常交易自动标记"],
        talentProfile: "此岗位将基本消失。转型方向：财务数据分析师。" },
      { title: "会计/报表编制", current: { count: 0, salary: 8000 }, withAI: { ratio: 0.45, note: "AI自动出报表" }, fullAI: { ratio: 0.2, note: "保留高级会计做战略分析" },
        aiCanDo: ["自动生成财务报表", "智能费用分类", "AI辅助税务申报", "现金流预测"],
        talentProfile: "「AI财务分析师」——从做报表转向读报表，驱动财务决策。" },
    ],
    insight: "数据录入面临95%自动化风险。AI每小时处理1000+文档，错误率仅0.1%。",
    futureVision: "2026年：1名CFO + 1-2名AI分析师 = 过去5-8人财务团队。", tools: ["用友/金蝶AI", "百望云票据AI", "合思智能报销", "通义千问"],
  },
  {
    id: "hr", name: "人力资源部", nameEn: "Human Resources", icon: "👥", aiLevel: 62,
    capQuestions: [
      { q: "以下哪些HR痛点在你们公司仍然突出？", key: "screening", reversed: true,
        options: [
          { label: "简历筛选靠HR手动逐份翻阅", score: 1 },
          { label: "员工日常咨询大量占用HRBP时间", score: 1 },
          { label: "薪酬核算仍有大量手工环节", score: 1 },
          { label: "培训内容缺乏个性化", score: 1 },
          { label: "离职预警靠感觉而非数据", score: 1 },
          { label: "以上基本都解决了", score: 0, exclusive: true },
        ]},
      { q: "以下哪些AI人事能力你们已经在用？", key: "training", reversed: false,
        options: [
          { label: "AI简历筛选和匹配评分", score: 1 },
          { label: "AI视频初面或能力评估", score: 1 },
          { label: "HR智能问答机器人", score: 1 },
          { label: "自动薪酬计算和社保处理", score: 1 },
          { label: "AI个性化学习路径推荐", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "招聘专员", current: { count: 0, salary: 8000 }, withAI: { ratio: 0.35, note: "AI筛简历+初面" }, fullAI: { ratio: 0.15, note: "AI全流程，人做终面" },
        aiCanDo: ["AI筛选简历匹配评分", "AI视频初面", "自动生成面试问题", "Offer薪资对标分析"],
        talentProfile: "「人才策略师」——定义人才标准+训练AI招聘模型+做最终判断。" },
      { title: "薪酬/员工服务", current: { count: 0, salary: 7500 }, withAI: { ratio: 0.3, note: "AI自动算薪+问答机器人" }, fullAI: { ratio: 0.1, note: "全自动化+AI服务台" },
        aiCanDo: ["自动薪酬社保个税处理", "HR智能问答机器人", "自动生成HR证明文件", "员工满意度智能监测"],
        talentProfile: "「员工体验设计师」——设计AI驱动的员工服务体系。" },
    ],
    insight: "IBM AskHR年处理1150万次互动。AI可降低HR成本15-20%。",
    futureVision: "2026年：CHRO + 2名策略师 + AI = 过去6-10人HR团队。", tools: ["北森AI/Moka", "飞书人事AI", "钉钉智能人事", "薪人薪事"],
  },
  {
    id: "admin", name: "行政/运营部", nameEn: "Admin & Operations", icon: "🏢", aiLevel: 66,
    capQuestions: [
      { q: "以下哪些行政事务仍主要靠人工处理？", key: "manual_admin", reversed: true,
        options: [
          { label: "排班/会议安排", score: 1 },
          { label: "合同/文档归档检索", score: 1 },
          { label: "资产盘点和管理", score: 1 },
          { label: "采购比价和下单", score: 1 },
          { label: "办公用品库存管理", score: 1 },
          { label: "以上基本都自动化了", score: 0, exclusive: true },
        ]},
      { q: "以下哪些智能办公能力你们已经在用？", key: "procurement", reversed: false,
        options: [
          { label: "AI智能排班/会议室优化", score: 1 },
          { label: "文档自动归档和智能检索", score: 1 },
          { label: "AI采购比价和供应商推荐", score: 1 },
          { label: "库存智能预测和自动补货", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "行政助理/前台", current: { count: 0, salary: 5500 }, withAI: { ratio: 0.4, note: "AI处理日程/文档/预约" }, fullAI: { ratio: 0.15, note: "AI接待+智能办公" },
        aiCanDo: ["AI排班和会议预约", "来访自动登记引导", "文档自动归档检索", "库存监控自动补货"],
        talentProfile: "「AI办公运营经理」——管理智能办公系统。" },
      { title: "采购/资产管理", current: { count: 0, salary: 7000 }, withAI: { ratio: 0.4, note: "AI比价+库存预测" }, fullAI: { ratio: 0.15, note: "AI全自动采购" },
        aiCanDo: ["多供应商自动比价", "库存智能预测", "供应商绩效AI评估", "合同到期提醒"],
        talentProfile: "「供应链策略师」——管理AI采购系统和供应商关系。" },
    ],
    insight: "数据录入95%可自动化。智能办公系统可降低30%设施管理成本。",
    futureVision: "2026年：1名运营经理 + AI = 过去4-6人行政团队。", tools: ["飞书智能办公", "钉钉智能行政", "甄云采购", "用友BIP"],
  },
  {
    id: "legal", name: "法务/合规部", nameEn: "Legal & Compliance", icon: "⚖️", aiLevel: 55,
    capQuestions: [
      { q: "以下哪些法务痛点仍然存在？", key: "contract", reversed: true,
        options: [
          { label: "合同审查靠逐条人工阅读", score: 1 },
          { label: "每份标准合同耗时2小时以上", score: 1 },
          { label: "法规检索靠手动翻数据库", score: 1 },
          { label: "合规报告每次从头手写", score: 1 },
          { label: "以上基本都解决了", score: 0, exclusive: true },
        ]},
      { q: "以下哪些AI法务能力已经在用？", key: "compliance", reversed: false,
        options: [
          { label: "AI合同条款自动审阅/风险标注", score: 1 },
          { label: "AI法规智能检索和案例匹配", score: 1 },
          { label: "AI自动生成合规报告", score: 1 },
          { label: "AI辅助尽职调查", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "合同审查/法律助理", current: { count: 0, salary: 10000 }, withAI: { ratio: 0.4, note: "AI预审+人终审" }, fullAI: { ratio: 0.2, note: "标准合同全自动" },
        aiCanDo: ["合同条款自动审阅", "偏差对比分析", "历史合同检索", "自动修改建议"],
        talentProfile: "「AI法务经理」——管理AI法务系统、处理复杂判断。" },
    ],
    insight: "法律助理面临80%自动化风险。AI合同审查从2-3小时缩短到10分钟。",
    futureVision: "2026年：1名法务总监 + AI = 过去3-5人法务团队。", tools: ["幂律智能", "秘塔AI法律", "通义千问", "法大大"],
  },
  {
    id: "it", name: "IT/技术部", nameEn: "IT & Engineering", icon: "💻", aiLevel: 74,
    capQuestions: [
      { q: "你们的技术团队目前以下哪些环节仍高度依赖人工？", key: "testing", reversed: true,
        options: [
          { label: "代码编写主要靠手写", score: 1 },
          { label: "测试用例靠QA手动编写", score: 1 },
          { label: "回归测试靠手动执行", score: 1 },
          { label: "运维告警靠人工值守", score: 1 },
          { label: "技术文档靠开发者手写", score: 1 },
          { label: "以上基本都用AI了", score: 0, exclusive: true },
        ]},
      { q: "以下哪些AI开发能力已经在用？", key: "coding", reversed: false,
        options: [
          { label: "AI编程助手(通义灵码/Cursor/Copilot)", score: 1 },
          { label: "AI自动生成测试用例", score: 1 },
          { label: "AI自动Debug和代码优化", score: 1 },
          { label: "AI生成技术文档", score: 1 },
          { label: "AI运维监控→自动诊断→自动修复", score: 1 },
          { label: "以上都没有", score: 0, exclusive: true },
        ]},
    ],
    roles: [
      { title: "初/中级开发", current: { count: 0, salary: 18000 }, withAI: { ratio: 0.55, note: "AI写代码，人做架构" }, fullAI: { ratio: 0.35, note: "AI Agent自主完成80%开发" },
        aiCanDo: ["代码生成和补全", "自动Debug优化", "自动编写测试", "AI生成文档"],
        talentProfile: "「AI架构师」——设计架构、Review AI代码、管理AI开发流。" },
      { title: "QA/测试", current: { count: 0, salary: 13000 }, withAI: { ratio: 0.4, note: "AI自动生成用例+执行" }, fullAI: { ratio: 0.15, note: "AI全自动测试流水线" },
        aiCanDo: ["自动生成测试用例", "AI回归和性能测试", "自动定位Bug", "覆盖率智能分析"],
        talentProfile: "「QA策略师」——定义质量标准，管理AI测试系统。" },
    ],
    insight: "微软30%代码由AI编写，40%裁员涉及工程师。AI编程助手让效率提升55%。",
    futureVision: "2026年：架构师 + AI系统 = 过去大团队的产能。", tools: ["通义灵码", "Cursor", "飞书项目AI", "阿里云AI运维"],
  },
];

// ─── COMPONENTS ─────────────────────────────────────────────────────────────
function PB({ pct, color = "#10b981", delay = 0, h = 8 }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(pct), delay + 100); return () => clearTimeout(t); }, [pct, delay]);
  return <div style={{ width: "100%", height: h, borderRadius: h / 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
    <div style={{ width: `${w}%`, height: "100%", borderRadius: h / 2, background: `linear-gradient(90deg,${color},${color}bb)`, transition: "width 1s cubic-bezier(.4,0,.2,1)" }} />
  </div>;
}
function AN({ value, suffix = "", prefix = "" }) {
  const [d, setD] = useState(0);
  useEffect(() => { if (!value) { setD(0); return; } let c = 0; const i = value / 40; const t = setInterval(() => { c += i; if (c >= value) { setD(value); clearInterval(t); } else setD(c); }, 25); return () => clearInterval(t); }, [value]);
  return <span>{prefix}{Math.round(d).toLocaleString()}{suffix}</span>;
}

const A1 = "#00d4aa", A2 = "#7c5cfc", WN = "#ff6b6b", OR = "#ffa500", YL = "#eab308";
const BG = "linear-gradient(160deg,#08080f 0%,#0f1024 40%,#0c1628 100%)";
const cd = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24 };
const inp = { width: "100%", padding: "12px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: "#fff", fontSize: 15, outline: "none", boxSizing: "border-box" };
const bP = (a) => ({ flex: 1, padding: "14px 24px", borderRadius: 12, border: "none", background: a ? `linear-gradient(135deg,${A1},${A2})` : "rgba(255,255,255,0.07)", color: a ? "#0a0a16" : "#555", cursor: a ? "pointer" : "not-allowed", fontSize: 16, fontWeight: 700 });
const bB = { padding: "12px 20px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "#888", cursor: "pointer", fontSize: 14 };
const pill = (c) => ({ display: "inline-block", padding: "3px 10px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: `${c}15`, color: c, border: `1px solid ${c}30` });

// ─── MAIN ───────────────────────────────────────────────────────────────────
export default function App() {
  const [step, setStep] = useState(0);
  const [cn, setCn] = useState(""); const [cs, setCs] = useState(""); const [rev, setRev] = useState(""); const [ind, setInd] = useState("");
  const [sel, setSel] = useState([]); const [dhc, setDhc] = useState({});
  // Multi-select: cap[`${deptId}_${key}`] = Set of selected option indices
  const [cap, setCap] = useState({});
  const [ccd, setCcd] = useState(0);
  const [re, setRe] = useState({}); const [crd, setCrd] = useState(0);
  const [exp, setExp] = useState(null);
  const [leadName, setLeadName] = useState(""); const [leadContact, setLeadContact] = useState(""); const [leadSubmitted, setLeadSubmitted] = useState(false);

  const te = parseInt(cs) || 0; const rv = parseInt(rev) || 0;
  const ad = DEPARTMENTS.filter(d => sel.includes(d.id));

  const toggleOpt = (deptId, key, optIdx, exclusive, options) => {
    setCap(prev => {
      const k = `${deptId}_${key}`;
      const current = new Set(prev[k] || []);
      if (exclusive) {
        // If clicking exclusive option, clear all others and toggle this one
        if (current.has(optIdx)) { current.delete(optIdx); }
        else { current.clear(); current.add(optIdx); }
      } else {
        // Remove any exclusive option first
        const exclIdx = options.findIndex(o => o.exclusive);
        if (exclIdx >= 0) current.delete(exclIdx);
        if (current.has(optIdx)) current.delete(optIdx);
        else current.add(optIdx);
      }
      return { ...prev, [k]: current };
    });
  };
  const getSelected = (deptId, key) => cap[`${deptId}_${key}`] || new Set();
  const isAnswered = (deptId, key) => (cap[`${deptId}_${key}`] || new Set()).size > 0;

  const getQScore = (deptId, cq) => {
    const selected = getSelected(deptId, cq.key);
    if (selected.size === 0) return 0;
    const rawScore = [...selected].reduce((s, idx) => s + cq.options[idx].score, 0);
    const maxScore = cq.options.filter(o => !o.exclusive).reduce((s, o) => s + o.score, 0);
    if (cq.reversed) return maxScore - rawScore; // higher pain = lower score
    return rawScore;
  };

  const src = (did, i, v) => setRe(p => ({ ...p, [`${did}_${i}`]: parseInt(v) || 0 }));
  const grc = (did, i) => re[`${did}_${i}`] ?? 0;

  const initRC = () => {
    const e = {};
    ad.forEach(d => {
      const h = dhc[d.id] || 0; const pr = Math.max(1, Math.floor(h / d.roles.length)); let rem = h;
      d.roles.forEach((_, i) => { const c = i === d.roles.length - 1 ? rem : Math.min(pr, rem); e[`${d.id}_${i}`] = c; rem -= c; });
    });
    setRe(e);
  };

  const calc = () => ad.map(dept => {
    const rr = dept.roles.map((role, i) => {
      const cc = grc(dept.id, i);
      const wa = Math.max(cc > 0 ? 1 : 0, Math.round(cc * role.withAI.ratio));
      const fa = Math.max(cc > 0 ? 1 : 0, Math.round(cc * role.fullAI.ratio));
      return { role, cc, wa, fa, cwAI: (cc - wa) * role.current.salary * 14, cfAI: (cc - fa) * role.current.salary * 14 };
    });
    const tc = rr.reduce((s, r) => s + r.cc, 0), twAI = rr.reduce((s, r) => s + r.wa, 0), tfAI = rr.reduce((s, r) => s + r.fa, 0);
    const tcwAI = rr.reduce((s, r) => s + r.cwAI, 0), tcfAI = rr.reduce((s, r) => s + r.cfAI, 0);
    const totalQScore = dept.capQuestions.reduce((s, cq) => s + getQScore(dept.id, cq), 0);
    const maxQScore = dept.capQuestions.reduce((s, cq) => s + cq.options.filter(o => !o.exclusive).reduce((ss, o) => ss + o.score, 0), 0);
    const capP = maxQScore > 0 ? Math.round((totalQScore / maxQScore) * 100) : 0;
    return { dept, rr, tc, twAI, tfAI, tcwAI, tcfAI, capP };
  });

  const ct = { minHeight: "100vh", background: BG, color: "#e0e0f0", fontFamily: "'SF Pro Display',-apple-system,'Noto Sans SC',sans-serif", position: "relative", overflow: "hidden" };
  const gl1 = { position: "absolute", top: -200, right: -200, width: 500, height: 500, borderRadius: "50%", background: `radial-gradient(circle,${A1}12,transparent 70%)`, pointerEvents: "none" };
  const gl2 = { position: "absolute", bottom: -150, left: -150, width: 400, height: 400, borderRadius: "50%", background: `radial-gradient(circle,${A2}10,transparent 70%)`, pointerEvents: "none" };
  const SI = ({ c, t }) => (<div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24 }}>{Array.from({ length: t }, (_, i) => <div key={i} style={{ width: i + 1 === c ? 28 : 10, height: 10, borderRadius: 5, background: i + 1 < c ? A1 : i + 1 === c ? `linear-gradient(90deg,${A1},${A2})` : "rgba(255,255,255,0.08)", transition: "all 0.4s" }} />)}<span style={{ marginLeft: 8, fontSize: 12, color: "#555" }}>STEP {c}/{t}</span></div>);

  // ═══════ STEP 0 — LANDING ═══════
  if (step === 0) return (
    <div style={ct}><div style={gl1} /><div style={gl2} />
      <div style={{ maxWidth: 780, margin: "0 auto", padding: "50px 20px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 44 }}>
          <div style={{ ...pill(A1), marginBottom: 16, letterSpacing: 1.5, fontSize: 12 }}>2026 · AI企业降本实战诊断</div>
          <h1 style={{ fontSize: "clamp(26px,5vw,44px)", fontWeight: 800, lineHeight: 1.15, margin: "0 0 16px", background: `linear-gradient(135deg,#fff 30%,${A1})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>你的企业，还需要这么多人吗？</h1>
          <p style={{ fontSize: 17, color: "#9090a8", maxWidth: 520, margin: "0 auto", lineHeight: 1.75 }}>5分钟深度诊断，看清每个部门的 AI 替代率——<br />从<span style={{ color: A1 }}>岗位</span>到<span style={{ color: A2 }}>工作流</span>，算出你能省多少人、多少钱。</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 36 }}>
          {[{ n: "37%", d: "的企业计划2026年底前用AI替岗" }, { n: "50%+", d: "的中层管理将被AI扁平化消除" }, { n: "30%", d: "的代码已由AI编写（微软数据）" }].map((s, i) => (
            <div key={i} style={{ ...cd, padding: "16px 12px", textAlign: "center" }}><div style={{ fontSize: 22, fontWeight: 800, color: [A1, A2, WN][i] }}>{s.n}</div><div style={{ fontSize: 11, color: "#777", lineHeight: 1.5, marginTop: 4 }}>{s.d}</div></div>
          ))}
        </div>
        <div style={{ ...cd, padding: 20, marginBottom: 36 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc", marginBottom: 12 }}>这份诊断报告会告诉你：</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {["每个部门的 AI 成熟度评分", "可被AI部分/完全替代的岗位", "AI能接管的具体工作流清单", "当前 vs AI辅助 vs 全AI三种状态对比", "每个岗位未来需要什么人才画像", "精确到万元的年度资源释放额"].map((t, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: "#aaa", lineHeight: 1.5 }}><span style={{ color: A1, marginTop: 1 }}>✦</span>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <button onClick={() => setStep(1)} style={{ padding: "16px 52px", fontSize: 18, fontWeight: 700, borderRadius: 14, border: "none", background: `linear-gradient(135deg,${A1},${A2})`, color: "#0a0a16", cursor: "pointer", boxShadow: `0 0 50px ${A1}35` }}>开始5分钟AI诊断 →</button>
          <p style={{ fontSize: 12, color: "#555", marginTop: 14 }}>数据来源：McKinsey · Gartner · WEF · Goldman Sachs · Bloomberg</p>
        </div>
      </div>
    </div>
  );

  // ═══════ STEP 1 — INFO ═══════
  if (step === 1) {
    const ok = cs && rev;
    return (<div style={ct}><div style={{ maxWidth: 560, margin: "0 auto", padding: "50px 20px" }}>
      <SI c={1} t={5} /><h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>企业基本信息</h2><p style={{ color: "#777", marginBottom: 28, fontSize: 14 }}>我们将基于这些信息生成定制化AI替代率报告</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div><label style={{ fontSize: 13, color: "#999", display: "block", marginBottom: 6 }}>公司名称（选填）</label><input placeholder="便于报告展示" value={cn} onChange={e => setCn(e.target.value)} style={inp} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <div><label style={{ fontSize: 13, color: "#999", display: "block", marginBottom: 6 }}>公司总人数 *</label><input type="number" placeholder="例如：150" value={cs} onChange={e => setCs(e.target.value)} style={inp} /></div>
          <div><label style={{ fontSize: 13, color: "#999", display: "block", marginBottom: 6 }}>年营收（万元）*</label><input type="number" placeholder="例如：5000" value={rev} onChange={e => setRev(e.target.value)} style={inp} /></div>
        </div>
        <div><label style={{ fontSize: 13, color: "#999", display: "block", marginBottom: 6 }}>所属行业</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{["电商/零售", "SaaS/科技", "教育/培训", "金融/保险", "制造业", "医疗健康", "专业服务", "其他"].map(x => (
            <button key={x} onClick={() => setInd(x)} style={{ padding: "8px 14px", borderRadius: 8, fontSize: 13, cursor: "pointer", border: ind === x ? `1px solid ${A1}` : "1px solid rgba(255,255,255,0.1)", background: ind === x ? `${A1}15` : "rgba(255,255,255,0.03)", color: ind === x ? A1 : "#999" }}>{x}</button>
          ))}</div></div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 30 }}><button onClick={() => setStep(0)} style={bB}>←</button><button onClick={() => ok && setStep(2)} disabled={!ok} style={bP(ok)}>下一步 →</button></div>
    </div></div>);
  }

  // ═══════ STEP 2 — DEPTS ═══════
  if (step === 2) {
    const ok = sel.length > 0 && sel.every(id => dhc[id] > 0);
    return (<div style={ct}><div style={{ maxWidth: 680, margin: "0 auto", padding: "50px 20px" }}>
      <SI c={2} t={5} /><h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 6px" }}>选择部门并填入人数</h2><p style={{ color: "#777", marginBottom: 24, fontSize: 14 }}>勾选现有部门，我们将逐个进行AI能力诊断</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
        {DEPARTMENTS.map(d => { const s = sel.includes(d.id); return (
          <div key={d.id} style={{ ...cd, padding: 14, cursor: "pointer", border: s ? `1px solid ${A1}70` : "1px solid rgba(255,255,255,0.06)", background: s ? `${A1}08` : "rgba(255,255,255,0.025)" }}
            onClick={() => setSel(p => p.includes(d.id) ? p.filter(x => x !== d.id) : [...p, d.id])}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 24 }}>{d.icon}</span><div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{d.name}</div><div style={{ fontSize: 11, color: "#666" }}>{d.nameEn}</div></div>
              <div style={{ width: 20, height: 20, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${s ? A1 : "rgba(255,255,255,0.15)"}`, background: s ? A1 : "transparent" }}>{s && <span style={{ color: "#0a0a16", fontSize: 13, fontWeight: 800 }}>✓</span>}</div></div>
            {s && <div onClick={e => e.stopPropagation()} style={{ marginTop: 10 }}><input type="number" placeholder="该部门总人数" value={dhc[d.id] || ""} onChange={e => setDhc(p => ({ ...p, [d.id]: parseInt(e.target.value) || 0 }))} style={{ ...inp, background: "rgba(0,0,0,0.3)", fontSize: 13, padding: "10px 12px" }} /></div>}
          </div>); })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 28 }}><button onClick={() => setStep(1)} style={bB}>←</button><button onClick={() => { if (ok) { setCcd(0); setStep(3); } }} disabled={!ok} style={bP(ok)}>开始AI能力诊断 →</button></div>
    </div></div>);
  }

  // ═══════ STEP 3 — MULTI-SELECT ASSESSMENT (no per-dept result box) ═══════
  if (step === 3) {
    const dept = ad[ccd];
    if (!dept) { setStep(4); initRC(); setCrd(0); return null; }
    const allA = dept.capQuestions.every(cq => isAnswered(dept.id, cq.key));
    const isL = ccd === ad.length - 1;

    return (<div style={ct}><div style={{ maxWidth: 640, margin: "0 auto", padding: "50px 20px" }}>
      <SI c={3} t={5} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 28 }}>{dept.icon}</span>
        <div><div style={{ fontSize: 12, color: "#777" }}>部门 {ccd + 1} / {ad.length}</div><h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{dept.name} — AI能力诊断</h2></div>
      </div>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 24, lineHeight: 1.6 }}>勾选所有适用的选项（可多选）。越诚实，报告越精准。</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {dept.capQuestions.map((cq, qi) => {
          const selected = getSelected(dept.id, cq.key);
          return (
            <div key={cq.key} style={{ ...cd, padding: "18px 16px" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#ddd", marginBottom: 12, lineHeight: 1.6 }}>
                <span style={{ color: A1, marginRight: 6 }}>Q{qi + 1}.</span>{cq.q}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {cq.options.map((opt, oi) => {
                  const isSel = selected.has(oi);
                  const isExcl = opt.exclusive;
                  return (
                    <button key={oi} onClick={() => toggleOpt(dept.id, cq.key, oi, isExcl, cq.options)} style={{
                      width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 10, fontSize: 13, cursor: "pointer",
                      border: isSel ? `1px solid ${isExcl ? A1 : A2}` : "1px solid rgba(255,255,255,0.06)",
                      background: isSel ? `${isExcl ? A1 : A2}12` : "rgba(255,255,255,0.02)",
                      color: isSel ? (isExcl ? A1 : "#ddd") : "#999", transition: "all 0.15s",
                      display: "flex", alignItems: "center", gap: 10,
                    }}>
                      <div style={{
                        width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSel ? (isExcl ? A1 : A2) : "rgba(255,255,255,0.2)"}`,
                        background: isSel ? (isExcl ? A1 : A2) : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.15s",
                      }}>{isSel && <span style={{ color: "#0a0a16", fontSize: 11, fontWeight: 800 }}>✓</span>}</div>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
        <button onClick={() => ccd > 0 ? setCcd(p => p - 1) : setStep(2)} style={bB}>←</button>
        <button onClick={() => { if (!allA) return; if (isL) { initRC(); setCrd(0); setStep(4); } else setCcd(p => p + 1); }} disabled={!allA} style={bP(allA)}>
          {isL ? "进入岗位配置 →" : `下一个：${ad[ccd + 1]?.name} →`}
        </button>
      </div>
    </div></div>);
  }

  // ═══════ STEP 4 — ROLE HEADCOUNT ═══════
  if (step === 4) {
    const dept = ad[crd]; if (!dept) { setStep(5); return null; }
    const isL = crd === ad.length - 1;
    const ta = dept.roles.reduce((s, _, i) => s + grc(dept.id, i), 0); const dh = dhc[dept.id] || 0;
    return (<div style={ct}><div style={{ maxWidth: 660, margin: "0 auto", padding: "50px 20px" }}>
      <SI c={4} t={5} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}><span style={{ fontSize: 28 }}>{dept.icon}</span><div><div style={{ fontSize: 12, color: "#777" }}>部门 {crd + 1} / {ad.length}</div><h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>{dept.name} — 岗位人数配置</h2></div></div>
      <p style={{ color: "#888", fontSize: 13, marginBottom: 6 }}>确认各岗位当前人数（已按 <span style={{ color: A1, fontWeight: 600 }}>{dh}人</span> 初始分配）</p>
      <div style={{ fontSize: 12, color: ta === dh ? "#555" : WN, marginBottom: 18 }}>已分配：{ta}/{dh}人</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {dept.roles.map((role, i) => { const c = grc(dept.id, i); const wa = Math.max(c > 0 ? 1 : 0, Math.round(c * role.withAI.ratio)); const fa = Math.max(c > 0 ? 1 : 0, Math.round(c * role.fullAI.ratio)); return (
          <div key={i} style={{ ...cd, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: c > 0 ? 12 : 0 }}>
              <div style={{ flex: 1 }}><div style={{ fontSize: 15, fontWeight: 600 }}>{role.title}</div><div style={{ fontSize: 12, color: "#777" }}>月薪 ¥{role.current.salary.toLocaleString()}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 12, color: "#888" }}>当前</span><input type="number" min={0} value={c} onChange={e => src(dept.id, i, e.target.value)} style={{ ...inp, width: 70, textAlign: "center", padding: 8, fontSize: 16, fontWeight: 600 }} /><span style={{ fontSize: 12, color: "#888" }}>人</span></div>
            </div>
            {c > 0 && (<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div style={{ background: `${A1}08`, borderRadius: 10, padding: "10px 12px", border: `1px solid ${A1}15` }}><div style={{ fontSize: 11, color: "#888" }}>人+AI协作</div><div style={{ fontSize: 20, fontWeight: 700, color: A1 }}>{wa}人</div><div style={{ fontSize: 10, color: "#666" }}>{role.withAI.note}</div></div>
              <div style={{ background: `${A2}08`, borderRadius: 10, padding: "10px 12px", border: `1px solid ${A2}15` }}><div style={{ fontSize: 11, color: "#888" }}>全AI管理</div><div style={{ fontSize: 20, fontWeight: 700, color: A2 }}>{fa}人</div><div style={{ fontSize: 10, color: "#666" }}>{role.fullAI.note}</div></div>
            </div>)}
          </div>); })}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 24 }}><button onClick={() => crd > 0 ? setCrd(p => p - 1) : setStep(3)} style={bB}>←</button><button onClick={() => isL ? setStep(5) : setCrd(p => p + 1)} style={bP(true)}>{isL ? "生成完整报告 →" : "下一个部门 →"}</button></div>
    </div></div>);
  }

  // ═══════ STEP 5 — RESULTS with 3-STATE COMPARISON ═══════
  const results = calc();
  const gtc = results.reduce((s, r) => s + r.tc, 0);
  const gwa = results.reduce((s, r) => s + r.twAI, 0);
  const gfa = results.reduce((s, r) => s + r.tfAI, 0);
  const gcw = results.reduce((s, r) => s + r.tcwAI, 0);
  const gcf = results.reduce((s, r) => s + r.tcfAI, 0);
  const avgCap = results.length > 0 ? Math.round(results.reduce((s, r) => s + r.capP, 0) / results.length) : 0;

  // 3-state calculations
  const currentLaborCost = results.reduce((s, r) => s + r.rr.reduce((ss, rr) => ss + rr.cc * rr.role.current.salary * 14, 0), 0);
  const outputGrowthA = Math.round(15 + (100 - avgCap) * 0.35); // less mature = more room to grow
  const outputGrowthB = Math.round(30 + (100 - avgCap) * 0.55);
  const prodPerCapitaA = gwa > 0 ? Math.round(((gtc / gwa) - 1) * 100) : 0;
  const prodPerCapitaB = gfa > 0 ? Math.round(((gtc / gfa) - 1) * 100) : 0;

  const stateCard = (state) => {
    const colors = { current: "#8888a0", withAI: A1, fullAI: A2 };
    const c = colors[state.id];
    return (
      <div style={{ ...cd, padding: "20px 16px", flex: 1, borderColor: `${c}30`, background: `${c}06`, position: "relative", overflow: "hidden" }}>
        {state.id !== "current" && <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${c}, ${c}60)` }} />}
        <div style={{ fontSize: 11, color: "#777", marginBottom: 2, textTransform: "uppercase", letterSpacing: 1 }}>{state.phase}</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: c, marginBottom: 12, lineHeight: 1.4 }}>{state.title}</div>
        <div style={{ fontSize: 12, color: "#999", lineHeight: 1.6, marginBottom: 16, minHeight: 40 }}>{state.desc}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 10, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: "#777" }}>年度释放资源</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: c }}><AN value={state.savings} prefix="¥" suffix="万" /></div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#777" }}>产出增长</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>+{state.outputGrowth}%</div>
            </div>
            <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: 8, padding: "8px 10px" }}>
              <div style={{ fontSize: 10, color: "#777" }}>人效提升</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>+{state.prodGrowth}%</div>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#777", paddingTop: 6, borderTop: "1px solid rgba(255,255,255,0.05)" }}>
            <span>团队规模</span><span style={{ fontWeight: 600, color: c }}>{state.headcount}人</span>
          </div>
        </div>
      </div>
    );
  };

  const states = [
    { id: "current", phase: "当前状态", title: `${cn || "你的公司"}现状`, desc: `年营收${rv.toLocaleString()}万 · ${te}人 · ${ind || "综合"}行业 · AI成熟度${avgCap}%`, savings: 0, outputGrowth: 0, prodGrowth: 0, headcount: gtc },
    { id: "withAI", phase: "方案A · AI辅助人工", title: "AI自动化重复工作\n人类负责判断和决策", desc: "AI接管数据录入、文档处理、常规客服、基础分析等重复性工作。人专注于策略、关系和创意。", savings: Math.round(gcw / 10000), outputGrowth: outputGrowthA, prodGrowth: prodPerCapitaA, headcount: gwa },
    { id: "fullAI", phase: "方案B · AI Agent全管理", title: "AI Agent自主运行\n人类负责监督和战略", desc: "AI Agent全流程自动执行，从任务拆解到交付。人只做最终审核、战略规划和例外处理。", savings: Math.round(gcf / 10000), outputGrowth: outputGrowthB, prodGrowth: prodPerCapitaB, headcount: gfa },
  ];

  return (
    <div style={ct}><div style={gl1} /><div style={gl2} />
      <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px", position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ ...pill(A1), marginBottom: 10 }}>AI 降本诊断报告</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>{cn || "贵公司"} · AI替代全景分析</h2>
          <p style={{ color: "#777", fontSize: 13 }}>{te}人 · 年营收{rv.toLocaleString()}万 · {ind || "综合"} · AI成熟度 {avgCap}%</p>
        </div>

        {/* ═══ 3-STATE BEFORE & AFTER ═══ */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#ddd", marginBottom: 12, textAlign: "center" }}>三种状态对比：你的企业可以进化到哪一步？</div>
          <div style={{ display: "flex", gap: 10 }}>
            {states.map(s => <div key={s.id} style={{ flex: 1 }}>{stateCard(s)}</div>)}
          </div>
          {/* Arrow labels */}
          <div style={{ display: "flex", justifyContent: "center", gap: 0, marginTop: 12 }}>
            <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: "#666" }}>现在</div>
            <div style={{ flex: 1, textAlign: "center" }}><span style={{ fontSize: 18, color: A1 }}>→</span><div style={{ fontSize: 10, color: A1 }}>3-6个月可达</div></div>
            <div style={{ flex: 1, textAlign: "center" }}><span style={{ fontSize: 18, color: A2 }}>→</span><div style={{ fontSize: 10, color: A2 }}>12-18个月目标</div></div>
          </div>
        </div>

        {/* Department Cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {results.map(({ dept, rr, tc, twAI, tfAI, tcwAI, tcfAI, capP }, idx) => {
            const isE = exp === dept.id;
            return (
              <div key={dept.id} style={{ ...cd, padding: 0, overflow: "hidden" }}>
                <div onClick={() => setExp(isE ? null : dept.id)} style={{ padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 24 }}>{dept.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}><span style={{ fontSize: 14, fontWeight: 600 }}>{dept.name}</span><span style={pill(capP < 30 ? WN : capP < 60 ? OR : A1)}>你：{capP}%</span><span style={pill(dept.aiLevel >= 75 ? WN : dept.aiLevel >= 60 ? OR : A1)}>行业：{dept.aiLevel}%</span></div>
                    <PB pct={dept.aiLevel} color={dept.aiLevel >= 75 ? WN : dept.aiLevel >= 60 ? OR : A1} delay={idx * 80} />
                  </div>
                  <div style={{ textAlign: "right", minWidth: 90 }}><div style={{ fontSize: 13, color: "#aaa" }}>{tc} → <span style={{ color: A1 }}>{twAI}</span> → <span style={{ color: A2 }}>{tfAI}</span></div><div style={{ fontSize: 11, color: "#666" }}>释放¥{(tcwAI / 10000).toFixed(0)}~{(tcfAI / 10000).toFixed(0)}万</div></div>
                  <span style={{ color: "#444", fontSize: 12, transition: "transform 0.3s", transform: isE ? "rotate(180deg)" : "none" }}>▼</span>
                </div>
                {isE && (
                  <div style={{ padding: "0 16px 18px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <div style={{ margin: "14px 0", background: `linear-gradient(135deg,${A1}06,${A2}06)`, borderRadius: 12, padding: "12px 14px", border: `1px solid ${A1}12` }}><div style={{ fontSize: 12, fontWeight: 700, color: A1, marginBottom: 4 }}>🔮 未来图景</div><div style={{ fontSize: 13, color: "#ccc", lineHeight: 1.7 }}>{dept.futureVision}</div></div>
                    <div style={{ marginBottom: 14 }}><div style={{ fontSize: 12, fontWeight: 600, color: OR, marginBottom: 6 }}>🛠 推荐AI工具（国内适配）</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{dept.tools.map((t, i) => <span key={i} style={{ padding: "4px 10px", borderRadius: 8, background: `${OR}10`, border: `1px solid ${OR}20`, fontSize: 12, color: OR }}>{t}</span>)}</div></div>
                    {rr.map(({ role, cc, wa, fa, cwAI, cfAI }, ri) => (
                      <div key={ri} style={{ marginBottom: 14, background: "rgba(0,0,0,0.15)", borderRadius: 12, padding: 14, border: "1px solid rgba(255,255,255,0.03)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                          <div><div style={{ fontSize: 14, fontWeight: 600 }}>{role.title}</div><div style={{ fontSize: 11, color: "#666" }}>当前{cc}人 · ¥{role.current.salary.toLocaleString()}/月</div></div>
                          <div style={{ display: "flex", gap: 6 }}>
                            <div style={{ textAlign: "center", padding: "3px 10px", borderRadius: 8, background: `${A1}10` }}><div style={{ fontSize: 15, fontWeight: 700, color: A1 }}>{wa}</div><div style={{ fontSize: 9, color: "#777" }}>AI辅助</div></div>
                            <div style={{ textAlign: "center", padding: "3px 10px", borderRadius: 8, background: `${A2}10` }}><div style={{ fontSize: 15, fontWeight: 700, color: A2 }}>{fa}</div><div style={{ fontSize: 9, color: "#777" }}>全AI</div></div>
                          </div>
                        </div>
                        <div style={{ marginBottom: 8 }}><div style={{ fontSize: 11, fontWeight: 600, color: OR, marginBottom: 5 }}>⚡ AI能做什么</div><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 3 }}>{role.aiCanDo.map((t, i) => <div key={i} style={{ fontSize: 11, color: "#bbb", display: "flex", alignItems: "flex-start", gap: 4 }}><span style={{ color: OR, fontSize: 7, marginTop: 4 }}>●</span>{t}</div>)}</div></div>
                        <div style={{ background: `${A2}08`, borderRadius: 8, padding: "8px 10px", border: `1px solid ${A2}10`, marginBottom: 8 }}><div style={{ fontSize: 11, fontWeight: 600, color: A2, marginBottom: 3 }}>👤 未来人才画像</div><div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.6 }}>{role.talentProfile}</div></div>
                      </div>
                    ))}
                    <div style={{ background: `${A1}06`, borderRadius: 10, padding: "10px 12px", border: `1px solid ${A1}12` }}><div style={{ fontSize: 12, color: "#ccc", lineHeight: 1.7 }}>💡 {dept.insight}</div></div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footnote */}
        <div style={{ ...cd, marginTop: 16, padding: 14, fontSize: 11, color: "#666", lineHeight: 1.6, textAlign: "center" }}>
          📌 数据基于McKinsey、Gartner、WEF、Goldman Sachs等研究报告建模。产出增长和人效提升基于行业平均AI部署效果估算。实际结果因企业具体情况而异。
        </div>

        {/* CTA */}
        <div style={{ ...cd, marginTop: 14, textAlign: "center", background: `linear-gradient(135deg,${A2}08,${A1}08)`, border: `1px solid ${A2}25` }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>想把这份报告变成落地方案？</div>
          <p style={{ fontSize: 13, color: "#aaa", marginBottom: 16, lineHeight: 1.7 }}>从诊断到执行：AI工具选型 → 工作流重构 → 人才转型路径 → ROI追踪</p>
          {!leadSubmitted ? (
            <div style={{ maxWidth: 400, margin: "0 auto" }}>
              <div style={{ display: "flex", gap: 10, marginBottom: 10 }}><input placeholder="您的称呼" value={leadName} onChange={e => setLeadName(e.target.value)} style={{ ...inp, flex: 1, fontSize: 13, padding: "10px 12px" }} /><input placeholder="微信号 / 手机号" value={leadContact} onChange={e => setLeadContact(e.target.value)} style={{ ...inp, flex: 1.3, fontSize: 13, padding: "10px 12px" }} /></div>
              <button onClick={() => { if (leadName && leadContact) setLeadSubmitted(true); }} disabled={!leadName || !leadContact} style={{ width: "100%", padding: "14px 44px", fontSize: 16, fontWeight: 700, borderRadius: 14, border: "none", background: leadName && leadContact ? `linear-gradient(135deg,${A2},${A1})` : "rgba(255,255,255,0.08)", color: leadName && leadContact ? "#0a0a16" : "#555", cursor: leadName && leadContact ? "pointer" : "not-allowed", boxShadow: leadName && leadContact ? `0 0 40px ${A2}25` : "none" }}>预约1v1 AI转型咨询（¥19.9）</button>
              <div style={{ fontSize: 11, color: "#666", marginTop: 10, display: "flex", justifyContent: "center", gap: 10, flexWrap: "wrap" }}><span>✅ 60分钟深度诊断</span><span>✅ 定制落地方案</span><span>✅ 工具选型清单</span><span>✅ 人才转型路线图</span></div>
            </div>
          ) : (
            <div style={{ padding: "20px 0" }}><div style={{ fontSize: 36, marginBottom: 8 }}>✅</div><div style={{ fontSize: 16, fontWeight: 700, color: A1, marginBottom: 4 }}>提交成功！</div><div style={{ fontSize: 13, color: "#aaa", lineHeight: 1.7 }}>AI转型顾问将在 <span style={{ color: A1, fontWeight: 600 }}>24小时内</span> 通过微信联系你。</div></div>
          )}
        </div>

        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button onClick={() => { setStep(0); setSel([]); setDhc({}); setCs(""); setRev(""); setCap({}); setRe({}); setExp(null); setCn(""); setInd(""); setLeadSubmitted(false); setLeadName(""); setLeadContact(""); }} style={{ ...bB, fontSize: 12 }}>重新诊断</button>
        </div>
        <div style={{ textAlign: "center", marginTop: 24, paddingBottom: 16, fontSize: 10, color: "#333" }}>AI Workforce Intelligence · McKinsey, Gartner, WEF, Goldman Sachs, Bloomberg · 2026</div>
      </div>
    </div>
  );
}
