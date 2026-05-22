export interface ColorSet {
  // Layout & surfaces
  bg: string; s1: string; s2: string; bd: string;
  // Text
  tx: string; t2: string; t3: string;
  // Brand accents
  ac: string; ac2: string;
  // Nav
  navBg: string; navBd: string;
  // Inputs
  inputBg: string; inputBd: string;
  // Semantic state
  danger: string; success: string; warning: string; info: string;
  // Domain colors (Consumer / Product / Marketing — used in Analytics)
  domainConsumer: string; domainProduct: string; domainMarketing: string;
  // Platform brand colors (consistent wherever a platform logo / pill is shown)
  platformDouyin: string; platformXhs: string; platformTmall: string;
}

/**
 * LIGHT — the Rebase design system (builder-energy, Hex-leaning).
 *
 * This is the primary theme. Surfaces are warm off-white, text is warm
 * near-black, borders are hairlines. `ac` is intentionally near-black so
 * primary buttons read as confident dark blocks (and accent *text* stays
 * legible); `ac2` carries the chartreuse "pop" for highlights and badges.
 * The mono/amber/cyan signature pops live in semantic + domain colors.
 *
 * Canonical token values mirror src/index.css @theme + src/theme/tokens.ts.
 */
export const LIGHT: ColorSet = {
  bg: "#fcf8f8", s1: "#ffffff", s2: "#f5f1f2", bd: "#e8e0e2",
  tx: "#1a1416", t2: "#6b6266", t3: "#968d90",
  ac: "#1a1416", ac2: "#c5e832",
  navBg: "#ffffff", navBd: "#e8e0e2",
  inputBg: "#ffffff", inputBd: "#e8e0e2",
  danger: "#c44848", success: "#2d8659", warning: "#b8741a", info: "#3b6bb0",
  domainConsumer: "#2563eb", domainProduct: "#b8741a", domainMarketing: "#06b6d4",
  platformDouyin: "#fe2c55", platformXhs: "#ff2442", platformTmall: "#ff6a00",
};

/**
 * DARK — Hex-style dark variant. Cool near-black canvas, chartreuse accent.
 * Wired up properly in P3.1; kept here so the theme toggle never crashes.
 */
export const DARK: ColorSet = {
  bg: "#14141c", s1: "#1f1d27", s2: "#252128", bd: "#2b252c",
  tx: "#f5f1f2", t2: "#968d90", t3: "#6b6266",
  ac: "#f5f1f2", ac2: "#c5e832",
  navBg: "#14141c", navBd: "#2b252c",
  inputBg: "#1f1d27", inputBd: "#2b252c",
  danger: "#e07a7a", success: "#5cb98a", warning: "#d99a4a", info: "#6b9bd9",
  domainConsumer: "#5b8def", domainProduct: "#d99a4a", domainMarketing: "#22d3ee",
  platformDouyin: "#fe2c55", platformXhs: "#ff2442", platformTmall: "#ff6a00",
};
