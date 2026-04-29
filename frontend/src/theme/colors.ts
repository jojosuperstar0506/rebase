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

export const DARK: ColorSet = {
  bg: "#0c0c14", s1: "#14141e", s2: "#1a1a28", bd: "#2a2a3a",
  tx: "#e4e4ec", t2: "#9898a8", t3: "#5a5a72",
  ac: "#06b6d4", ac2: "#8b5cf6",
  navBg: "#0c0c14", navBd: "#2a2a3a",
  inputBg: "#0c0c14", inputBd: "#2a2a3a",
  danger: "#f87171", success: "#22c55e", warning: "#f59e0b", info: "#3b82f6",
  domainConsumer: "#ec4899", domainProduct: "#f97316", domainMarketing: "#0ea5e9",
  platformDouyin: "#fe2c55", platformXhs: "#ff2442", platformTmall: "#ff6a00",
};

export const LIGHT: ColorSet = {
  bg: "#f8f9fb", s1: "#ffffff", s2: "#f0f4f8", bd: "#e2e8f0",
  tx: "#1a202c", t2: "#4a5568", t3: "#a0aec0",
  ac: "#0891b2", ac2: "#7c3aed",
  navBg: "#ffffff", navBd: "#e2e8f0",
  inputBg: "#ffffff", inputBd: "#cbd5e0",
  danger: "#e53e3e", success: "#38a169", warning: "#d97706", info: "#2563eb",
  domainConsumer: "#db2777", domainProduct: "#ea580c", domainMarketing: "#0284c7",
  platformDouyin: "#fe2c55", platformXhs: "#ff2442", platformTmall: "#ff6a00",
};
