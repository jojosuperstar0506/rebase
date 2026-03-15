/**
 * Mock visualization data derived from the export manufacturer intake conversation.
 * In production, this comes from GET /api/diagnostics/self-serve/sessions/{id}/visualization
 */

export interface Department {
  id: string;
  name: string;
  nameCn: string;
  icon: string;
  headcount: number;
  tools: string[];
  color: string;
}

export interface Connection {
  from: string;
  to: string;
  type: string;
  frequency: string;
  isManual: boolean;
}

export interface PainPoint {
  id: number;
  connection: [string, string];
  description: string;
  descriptionCn: string;
  hoursPerWeek: number;
  costRmbMonthly: number;
  clientQuote?: string;
}

export interface AIAgent {
  name: string;
  nameCn: string;
  replacesPainPoint: number;
  hoursSavedPerWeek: number;
  residualHoursPerWeek: number;
  savingsRmbMonthly: number;
  description: string;
  descriptionCn: string;
}

export interface ROI {
  totalWasteRmbMonthly: number;
  platformCostRmbMonthly: number;
  netSavingsRmbMonthly: number;
  paybackMonths: number;
  hoursFreedPerWeek: number;
  errorReductionPercent: number;
  responseTimeImprovement: string;
}

export interface VisualizationData {
  companyName: string;
  vertical: string;
  departments: Department[];
  connections: Connection[];
  painPoints: PainPoint[];
  aiAgents: AIAgent[];
  roi: ROI;
}

export const mockData: VisualizationData = {
  companyName: "Brightway Kitchen Appliances",
  vertical: "Export Manufacturing",
  departments: [
    {
      id: "sales",
      name: "Sales",
      nameCn: "销售部",
      icon: "🧑‍💼",
      headcount: 8,
      tools: ["WeChat", "Excel"],
      color: "#4A90D9",
    },
    {
      id: "production",
      name: "Production",
      nameCn: "生产部",
      icon: "🏭",
      headcount: 22,
      tools: ["Paper forms", "WhatsApp"],
      color: "#E8913A",
    },
    {
      id: "procurement",
      name: "Procurement",
      nameCn: "采购部",
      icon: "📋",
      headcount: 5,
      tools: ["Excel", "Phone"],
      color: "#50B83C",
    },
    {
      id: "warehouse",
      name: "Warehouse",
      nameCn: "仓库",
      icon: "📦",
      headcount: 6,
      tools: ["Excel", "Manual count"],
      color: "#9C6ADE",
    },
    {
      id: "finance",
      name: "Finance",
      nameCn: "财务部",
      icon: "💰",
      headcount: 3,
      tools: ["Yongyou U8"],
      color: "#DE3618",
    },
    {
      id: "qc",
      name: "Quality Control",
      nameCn: "质检部",
      icon: "🔍",
      headcount: 4,
      tools: ["Paper checklists"],
      color: "#00848E",
    },
  ],
  connections: [
    { from: "sales", to: "production", type: "orders", frequency: "~15/week", isManual: true },
    { from: "sales", to: "finance", type: "invoices", frequency: "~15/week", isManual: true },
    { from: "procurement", to: "warehouse", type: "materials", frequency: "daily", isManual: true },
    { from: "production", to: "qc", type: "inspection", frequency: "per batch", isManual: true },
    { from: "production", to: "warehouse", type: "finished goods", frequency: "daily", isManual: true },
    { from: "warehouse", to: "finance", type: "stock reports", frequency: "monthly", isManual: true },
  ],
  painPoints: [
    {
      id: 0,
      connection: ["sales", "production"],
      description: "Order specs re-entered from WeChat to paper production sheets",
      descriptionCn: "订单规格从微信手动抄写到纸质生产单",
      hoursPerWeek: 14,
      costRmbMonthly: 5600,
      clientQuote: "Every order has custom specs. My staff copies them by hand — mistakes happen weekly.",
    },
    {
      id: 1,
      connection: ["procurement", "warehouse"],
      description: "Material arrivals logged manually, procurement has no real-time visibility",
      descriptionCn: "物料到货手工登记，采购无法实时掌握库存",
      hoursPerWeek: 8,
      costRmbMonthly: 3200,
      clientQuote: "Sometimes we order materials we already have because nobody updated the spreadsheet.",
    },
    {
      id: 2,
      connection: ["warehouse", "finance"],
      description: "Month-end stock count takes 3 days, always mismatches with Yongyou",
      descriptionCn: "月底盘点耗时3天，与用友系统数据总是对不上",
      hoursPerWeek: 6,
      costRmbMonthly: 2400,
    },
    {
      id: 3,
      connection: ["production", "qc"],
      description: "QC reports are paper-based, production doesn't see results until next day",
      descriptionCn: "质检报告用纸质记录，生产部隔天才能看到结果",
      hoursPerWeek: 5,
      costRmbMonthly: 2000,
    },
    {
      id: 4,
      connection: ["sales", "finance"],
      description: "Invoice creation is manual — sales sends details via WeChat, finance re-types",
      descriptionCn: "开票手动操作——销售微信发信息，财务重新录入",
      hoursPerWeek: 7,
      costRmbMonthly: 2800,
    },
  ],
  aiAgents: [
    {
      name: "Order Sync Agent",
      nameCn: "订单同步助手",
      replacesPainPoint: 0,
      hoursSavedPerWeek: 13,
      residualHoursPerWeek: 1,
      savingsRmbMonthly: 5200,
      description: "Auto-captures order specs from WeChat and generates production sheets",
      descriptionCn: "自动从微信提取订单规格并生成生产单",
    },
    {
      name: "Inventory Sync Agent",
      nameCn: "库存同步助手",
      replacesPainPoint: 1,
      hoursSavedPerWeek: 7,
      residualHoursPerWeek: 1,
      savingsRmbMonthly: 2800,
      description: "Syncs material arrivals to procurement in real-time",
      descriptionCn: "实时同步物料到货信息至采购系统",
    },
    {
      name: "Reconciliation Agent",
      nameCn: "对账助手",
      replacesPainPoint: 2,
      hoursSavedPerWeek: 5,
      residualHoursPerWeek: 1,
      savingsRmbMonthly: 2000,
      description: "Auto-reconciles warehouse stock with Yongyou ERP daily",
      descriptionCn: "每日自动对账仓库库存与用友ERP",
    },
    {
      name: "QC Digitization Agent",
      nameCn: "质检数字化助手",
      replacesPainPoint: 3,
      hoursSavedPerWeek: 4,
      residualHoursPerWeek: 1,
      savingsRmbMonthly: 1600,
      description: "Digitizes QC reports and pushes results to production instantly",
      descriptionCn: "数字化质检报告，实时推送结果至生产部",
    },
    {
      name: "Invoice Agent",
      nameCn: "开票助手",
      replacesPainPoint: 4,
      hoursSavedPerWeek: 6,
      residualHoursPerWeek: 1,
      savingsRmbMonthly: 2400,
      description: "Auto-generates invoices from confirmed orders, syncs to Yongyou",
      descriptionCn: "从确认订单自动生成发票，同步至用友系统",
    },
  ],
  roi: {
    totalWasteRmbMonthly: 16000,
    platformCostRmbMonthly: 3800,
    netSavingsRmbMonthly: 10200,
    paybackMonths: 0.4,
    hoursFreedPerWeek: 35,
    errorReductionPercent: 90,
    responseTimeImprovement: "2 days → instant",
  },
};
