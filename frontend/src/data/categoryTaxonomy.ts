/**
 * Two-level product category taxonomy — TikTok-Shop-style.
 *
 * A workspace picks ONE major category (level 1) and one-or-more
 * sub-categories (level 2) under it.
 *
 * Value conventions (these strings are persisted to the DB):
 *   - major `value`  — stable English slug ("bags", "footwear", …).
 *                      Stored in workspaces.brand_category_l1.
 *   - sub   `value`  — the Chinese category string ("女包", "护肤", …).
 *                      Stored in workspaces.brand_subcategories (JSONB array).
 *
 * The legacy single-string column workspaces.brand_category is kept in
 * sync (set to the first selected sub-category) so the existing
 * scraping / scoring pipeline — which is bag-tuned and keys off that
 * column — keeps working unchanged. See TODO.md F10 for the plan to
 * extend the pipeline to non-bag verticals.
 */

export interface SubCategory {
  value: string; // Chinese category string — persisted
  en: string;
  zh: string;
}

export interface MajorCategory {
  value: string; // English slug — persisted to brand_category_l1
  en: string;
  zh: string;
  subcategories: SubCategory[];
}

export const CATEGORY_TAXONOMY: MajorCategory[] = [
  {
    value: "bags",
    en: "Bags & Accessories",
    zh: "箱包配饰",
    subcategories: [
      { value: "女包", en: "Women's Bags", zh: "女包" },
      { value: "男包", en: "Men's Bags", zh: "男包" },
      { value: "双肩包", en: "Backpacks", zh: "双肩包" },
      { value: "行李箱", en: "Luggage & Travel", zh: "行李箱" },
      { value: "钱包", en: "Wallets & Small Leather Goods", zh: "钱包" },
      { value: "腰带配饰", en: "Belts & Accessories", zh: "腰带配饰" },
    ],
  },
  {
    value: "footwear",
    en: "Footwear",
    zh: "鞋靴",
    subcategories: [
      { value: "女鞋", en: "Women's Shoes", zh: "女鞋" },
      { value: "男鞋", en: "Men's Shoes", zh: "男鞋" },
      { value: "运动鞋", en: "Sneakers & Athletic", zh: "运动鞋" },
      { value: "靴子", en: "Boots", zh: "靴子" },
      { value: "凉鞋拖鞋", en: "Sandals & Slippers", zh: "凉鞋拖鞋" },
      { value: "童鞋", en: "Kids' Shoes", zh: "童鞋" },
    ],
  },
  {
    value: "apparel",
    en: "Apparel",
    zh: "服饰",
    subcategories: [
      { value: "女装", en: "Womenswear", zh: "女装" },
      { value: "男装", en: "Menswear", zh: "男装" },
      { value: "内衣", en: "Underwear & Lingerie", zh: "内衣" },
      { value: "运动服", en: "Activewear", zh: "运动服" },
      { value: "外套", en: "Outerwear", zh: "外套" },
      { value: "童装", en: "Kidswear", zh: "童装" },
    ],
  },
  {
    value: "beauty",
    en: "Beauty & Personal Care",
    zh: "美妆个护",
    subcategories: [
      { value: "护肤", en: "Skincare", zh: "护肤" },
      { value: "彩妆", en: "Makeup", zh: "彩妆" },
      { value: "香水", en: "Fragrance", zh: "香水" },
      { value: "美发", en: "Haircare", zh: "美发" },
      { value: "个人护理", en: "Personal Care", zh: "个人护理" },
      { value: "美容仪器", en: "Beauty Devices", zh: "美容仪器" },
    ],
  },
  {
    value: "jewelry",
    en: "Jewelry & Watches",
    zh: "珠宝腕表",
    subcategories: [
      { value: "珠宝", en: "Fine Jewelry", zh: "珠宝" },
      { value: "时尚饰品", en: "Fashion Jewelry", zh: "时尚饰品" },
      { value: "手表", en: "Watches", zh: "手表" },
      { value: "眼镜", en: "Eyewear", zh: "眼镜" },
    ],
  },
  {
    value: "home",
    en: "Home & Lifestyle",
    zh: "家居生活",
    subcategories: [
      { value: "家居用品", en: "Home Goods", zh: "家居用品" },
      { value: "家纺", en: "Textiles & Bedding", zh: "家纺" },
      { value: "厨具", en: "Kitchenware", zh: "厨具" },
      { value: "收纳", en: "Storage & Organization", zh: "收纳" },
    ],
  },
];

/** Look up the major category that owns a given sub-category value. */
export function majorForSub(subValue: string): MajorCategory | undefined {
  return CATEGORY_TAXONOMY.find((m) =>
    m.subcategories.some((s) => s.value === subValue)
  );
}

/** Resolve a major-category slug to its definition. */
export function majorByValue(value: string): MajorCategory | undefined {
  return CATEGORY_TAXONOMY.find((m) => m.value === value);
}

/** Bilingual label for a sub-category value, with graceful fallback. */
export function subLabel(subValue: string, lang: "en" | "zh"): string {
  for (const m of CATEGORY_TAXONOMY) {
    const s = m.subcategories.find((x) => x.value === subValue);
    if (s) return lang === "zh" ? s.zh : s.en;
  }
  return subValue;
}
