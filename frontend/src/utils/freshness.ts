/**
 * Data-freshness helpers — shared by every surface that displays
 * "scraped Nd ago" or color-codes data age.
 *
 * Single source of truth for what "fresh / stale / unknown" means so
 * the Brands page, Settings panel, Brief masthead etc. all agree.
 */

export type FreshnessTier = "fresh" | "recent" | "stale" | "unknown";

/** Bucket a scrape timestamp into 4 tiers. Mirrors the backend's 12h
 *  freshness guard (PR #102): scrapes <12h are "fresh", 12-72h "recent",
 *  >72h "stale", missing/invalid is "unknown". */
export function freshnessTier(iso: string | null | undefined): FreshnessTier {
  if (!iso) return "unknown";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "unknown";
  const hours = (Date.now() - t) / 3_600_000;
  if (hours < 12) return "fresh";
  if (hours < 72) return "recent";
  return "stale";
}

/** Pretty relative time: "just now", "4h ago", "2d ago", or a date. */
export function formatRelativeTime(iso: string | null | undefined, lang: "en" | "zh" = "en"): string {
  if (!iso) return lang === "zh" ? "未抓取" : "never scraped";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso || "";
  const diffMs = Date.now() - t;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);
  if (diffMin < 1) return lang === "zh" ? "刚刚" : "just now";
  if (diffMin < 60) return lang === "zh" ? `${diffMin} 分钟前` : `${diffMin} min ago`;
  if (diffHr < 24) return lang === "zh" ? `${diffHr} 小时前` : `${diffHr}h ago`;
  if (diffDay < 30) return lang === "zh" ? `${diffDay} 天前` : `${diffDay}d ago`;
  return new Date(iso).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

/** Map a freshness tier to a token colour for chips/dots. Returns CSS
 *  custom-property names so dark mode flips correctly. */
export function freshnessColor(tier: FreshnessTier): string {
  switch (tier) {
    case "fresh":   return "var(--color-success, #2d8659)";
    case "recent":  return "var(--color-text-muted, #6b6266)";
    case "stale":   return "var(--color-warning, #b8741a)";
    case "unknown": return "var(--color-text-subtle, #968d90)";
  }
}

/** Short platform-name labels used in mono chips. */
export function platformShortLabel(platform: string | null | undefined): string {
  if (!platform) return "";
  const p = platform.toLowerCase();
  if (p === "xhs" || p.includes("小红书")) return "xhs";
  if (p === "douyin" || p.includes("抖音")) return "douyin";
  if (p === "tmall" || p === "taobao" || p.includes("天猫") || p.includes("淘宝")) return "tmall";
  if (p === "jd" || p.includes("京东")) return "jd";
  return platform;
}
