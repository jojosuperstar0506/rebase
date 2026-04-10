// Reference brands from the OMI competitive landscape
// These appear as faded dots on the landscape map to show the broader market
// Users' tracked competitors overlay on top with full color
export const LANDSCAPE_SEED = [
  // Group D — International reference
  { brand_name: "小CK", group: "D", avg_price: 450, est_monthly_volume: 15000, category: "女包", positioning: "东南亚快时尚" },
  { brand_name: "COACH", group: "D", avg_price: 2800, est_monthly_volume: 8000, category: "女包", positioning: "美式轻奢" },
  { brand_name: "MK", group: "D", avg_price: 1800, est_monthly_volume: 6000, category: "女包", positioning: "美式轻奢" },
  { brand_name: "Kipling", group: "D", avg_price: 600, est_monthly_volume: 4000, category: "女包", positioning: "功能休闲" },
  // Group C — Direct competitors
  { brand_name: "La Festin", group: "C", avg_price: 380, est_monthly_volume: 5000, category: "女包", positioning: "法式定位" },
  { brand_name: "Cnolés蔻一", group: "C", avg_price: 320, est_monthly_volume: 4500, category: "女包", positioning: "国产设计师" },
  { brand_name: "ECODAY", group: "C", avg_price: 280, est_monthly_volume: 3000, category: "女包", positioning: "环保定位" },
  { brand_name: "VINEY", group: "C", avg_price: 200, est_monthly_volume: 8000, category: "女包", positioning: "性价比" },
  { brand_name: "FOXER", group: "C", avg_price: 350, est_monthly_volume: 3500, category: "女包", positioning: "中端女包" },
  { brand_name: "muva", group: "C", avg_price: 260, est_monthly_volume: 2000, category: "女包", positioning: "极简风" },
  // Group B — Aspirational
  { brand_name: "Songmont", group: "B", avg_price: 1200, est_monthly_volume: 5000, category: "女包", positioning: "国货高端" },
  { brand_name: "古良吉吉", group: "B", avg_price: 800, est_monthly_volume: 3000, category: "女包", positioning: "国货匠心" },
  { brand_name: "裘真", group: "B", avg_price: 900, est_monthly_volume: 2500, category: "女包", positioning: "国货轻奢" },
  { brand_name: "DISSONA", group: "B", avg_price: 700, est_monthly_volume: 4000, category: "女包", positioning: "国货优质" },
  { brand_name: "CASSILE", group: "B", avg_price: 350, est_monthly_volume: 2000, category: "女包", positioning: "新兴竞品" },
  { brand_name: "红谷", group: "B", avg_price: 500, est_monthly_volume: 3500, category: "女包", positioning: "成熟国货皮具" },
];

export interface LandscapeBrand {
  brand_name: string;
  group: string;
  avg_price: number;
  est_monthly_volume: number;
  category: string;
  positioning: string;
}
