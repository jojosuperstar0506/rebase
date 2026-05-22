/**
 * Map canonical Chinese category + platform values → display labels.
 *
 * The DB and pipelines key on the Chinese strings ("女包", "淘宝/天猫"…) —
 * INDEX_HIERARCHY weights, scraper routing, and analysis lookups all
 * expect that exact form. So the value never gets translated. This file
 * is purely for rendering: pass the stored value + the active language,
 * get a human-readable label back.
 *
 * Unknown values pass through as-is — supports user-typed custom
 * categories without breaking the EN UI.
 */

type Lang = 'en' | 'zh';

const CATEGORY_LABELS: Record<string, { en: string; zh: string }> = {
  '女包':     { en: "Women's bags",       zh: '女包' },
  '男包':     { en: "Men's bags",         zh: '男包' },
  '箱包配件': { en: 'Bags & accessories', zh: '箱包配件' },
  '鞋类':     { en: 'Footwear',           zh: '鞋类' },
  '服饰':     { en: 'Apparel',            zh: '服饰' },
  '其他':     { en: 'Other',              zh: '其他' },
};

const PLATFORM_LABELS: Record<string, { en: string; zh: string }> = {
  '淘宝/天猫': { en: 'Taobao / Tmall', zh: '淘宝/天猫' },
  '京东':      { en: 'JD',             zh: '京东' },
  '小红书':    { en: 'Xiaohongshu',    zh: '小红书' },
  '抖音':      { en: 'Douyin',         zh: '抖音' },
};

export function categoryLabel(value: string | null | undefined, lang: string): string {
  if (!value) return '';
  const entry = CATEGORY_LABELS[value];
  if (!entry) return value;
  return entry[(lang as Lang)] ?? entry.en;
}

export function platformLabel(value: string | null | undefined, lang: string): string {
  if (!value) return '';
  const entry = PLATFORM_LABELS[value];
  if (!entry) return value;
  return entry[(lang as Lang)] ?? entry.en;
}
