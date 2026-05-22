/**
 * Design tokens — TypeScript mirror of src/index.css @theme block.
 *
 * Use these when you need a token in JS (dynamic styles, color math, etc.).
 * For static styling, prefer Tailwind classes which read the same CSS vars.
 *
 * Light-primary, Hex-leaning palette. Hex.tech rose accent on warm off-white.
 * Sections swap fg/bg via data-scheme on <Section>.
 */

export const color = {
  canvas: "#fcf8f8",
  raised: "#ffffff",
  sunken: "#f5f1f2",
  inverse: "#14141c",

  textPrimary: "#1a1416",
  textMuted: "#6b6266",
  textSubtle: "#968d90",
  textInverse: "#f5f1f2",

  borderHairline: "#e8e0e2",
  borderStrong: "#1a1416",

  accent: "#c5e832",
  accentDeep: "#1a2e05",
  accentSoft: "#f0fadc",

  highlight: "#fde68a",
  highlightStrong: "#fbbf24",

  dataBlue: "#2563eb",
  dataCyan: "#06b6d4",

  neutral: {
    50: "#fcf8f8",
    100: "#f5f1f2",
    200: "#e8e0e2",
    300: "#d4cacc",
    400: "#b0a4a7",
    500: "#8a7d80",
    600: "#6b6266",
    700: "#4f4548",
    800: "#312a2c",
    900: "#1a1416",
    950: "#0d090a",
  },

  success: "#2d8659",
  warning: "#b8741a",
  danger: "#c44848",
  info: "#3b6bb0",
} as const;

export const font = {
  display: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  sans: '"Inter", system-ui, -apple-system, sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
  serif: '"Instrument Serif", Georgia, serif',
} as const;

export const text = {
  eyebrow: "0.75rem",
  monoSm: "0.8125rem",
  sm: "0.875rem",
  base: "1rem",
  lg: "1.125rem",
  xl: "1.5rem",
  "2xl": "2rem",
  "3xl": "2.5rem",
  "4xl": "3.5rem",
  "5xl": "4.5rem",
} as const;

export const radius = {
  xs: "2px",
  sm: "4px",
  md: "6px",
  lg: "12px",
  pill: "999px",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  "2xl": 32,
  "3xl": 48,
  "4xl": 64,
  "5xl": 96,
} as const;

export type Scheme = "canvas" | "inverse" | "accent";
