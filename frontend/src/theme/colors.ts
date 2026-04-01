export interface ColorSet {
  bg: string; s1: string; s2: string; bd: string;
  tx: string; t2: string; t3: string;
  ac: string; ac2: string;
  navBg: string; navBd: string;
  inputBg: string; inputBd: string;
  danger: string; success: string;
}

export const DARK: ColorSet = {
  bg: "#0c0c14", s1: "#14141e", s2: "#1a1a28", bd: "#2a2a3a",
  tx: "#e4e4ec", t2: "#9898a8", t3: "#5a5a72",
  ac: "#06b6d4", ac2: "#8b5cf6",
  navBg: "#0c0c14", navBd: "#2a2a3a",
  inputBg: "#0c0c14", inputBd: "#2a2a3a",
  danger: "#f87171", success: "#22c55e",
};

export const LIGHT: ColorSet = {
  bg: "#f8f9fb", s1: "#ffffff", s2: "#f0f4f8", bd: "#e2e8f0",
  tx: "#1a202c", t2: "#4a5568", t3: "#a0aec0",
  ac: "#0891b2", ac2: "#7c3aed",
  navBg: "#ffffff", navBd: "#e2e8f0",
  inputBg: "#ffffff", inputBd: "#cbd5e0",
  danger: "#e53e3e", success: "#38a169",
};
