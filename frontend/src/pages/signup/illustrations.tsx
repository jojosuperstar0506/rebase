import type { StepKey } from "./ProgressRail";

/**
 * Signup wizard step illustrations — one custom SVG per step (account,
 * brand, competitors, goals). Rendered in the inverse-scheme right panel
 * so they read like a Hex-style data-tool diagram, not stock art:
 *  - hairline strokes on a dark background
 *  - mono-font labels via var(--font-mono)
 *  - one lime accent per scene to mark the active element
 *
 * Designed to feel like the diagrams you'd find in a code-editor or
 * pipeline-monitoring tool — flat, technical, no gradients, no shadows.
 */

const STROKE = "currentColor";
const MUTED = "var(--fg-muted, #968d90)";
const ACCENT = "var(--color-accent, #c5e832)";
const AMBER = "var(--color-highlight, #fde68a)";

interface IllustrationProps {
  /** Tailwind class for sizing; default fills the parent width up to 240px. */
  className?: string;
}

/** Step 1 — "account": a stacked-input mock with the active field
 *  outlined lime, a `>` prompt + a key glyph in the corner. */
function AccountIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 180"
      className={className}
      role="img"
      aria-label="account setup illustration"
      style={{ color: "var(--fg, #f5f1f2)", fontFamily: "var(--font-mono)" }}
    >
      {/* Window chrome */}
      <rect x="8" y="8" width="224" height="164" rx="3" fill="none"
            stroke={STROKE} strokeWidth="1" opacity="0.5" />
      {/* Prompt line */}
      <text x="20" y="30" fontSize="9" fill={ACCENT} letterSpacing="1.6">{"> SETUP"}</text>
      {/* Field 1 — active (lime outline) */}
      <rect x="20" y="44" width="200" height="26" rx="2" fill="none"
            stroke={ACCENT} strokeWidth="1.5" />
      <text x="28" y="61" fontSize="10" fill={ACCENT}>email@brand.com</text>
      <rect x="208" y="56" width="2" height="8" fill={ACCENT}>
        <animate attributeName="opacity" values="1;0;1" dur="1s" repeatCount="indefinite" />
      </rect>
      {/* Field 2 */}
      <rect x="20" y="78" width="200" height="26" rx="2" fill="none"
            stroke={MUTED} strokeWidth="1" />
      <g fill={MUTED}>
        {[0,1,2,3,4,5,6,7,8].map(i => (
          <circle key={i} cx={32 + i * 8} cy={91} r="1.5" />
        ))}
      </g>
      {/* Field 3 */}
      <rect x="20" y="112" width="200" height="26" rx="2" fill="none"
            stroke={MUTED} strokeWidth="1" />
      <text x="28" y="129" fontSize="10" fill={MUTED}>brand name</text>
      {/* Key glyph */}
      <g stroke={MUTED} strokeWidth="1.2" fill="none">
        <circle cx="206" cy="158" r="4" />
        <line x1="210" y1="158" x2="222" y2="158" />
        <line x1="218" y1="158" x2="218" y2="162" />
      </g>
    </svg>
  );
}

/** Step 2 — "brand": one major category connected to 3 sub-categories,
 *  with one sub highlighted lime; plus 3 platform pills below. */
function BrandIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 180"
      className={className}
      role="img"
      aria-label="brand taxonomy illustration"
      style={{ color: "var(--fg, #f5f1f2)", fontFamily: "var(--font-mono)" }}
    >
      {/* Parent box — major category */}
      <rect x="86" y="14" width="68" height="26" rx="2" fill="none" stroke={STROKE} strokeWidth="1.2" />
      <text x="120" y="31" fontSize="10" textAnchor="middle" fill={STROKE}>BAGS</text>
      {/* Connector lines */}
      <g stroke={MUTED} strokeWidth="1" fill="none">
        <line x1="120" y1="42" x2="120" y2="56" />
        <line x1="44" y1="56" x2="196" y2="56" />
        <line x1="44" y1="56" x2="44" y2="68" />
        <line x1="120" y1="56" x2="120" y2="68" />
        <line x1="196" y1="56" x2="196" y2="68" />
      </g>
      {/* Child boxes — 3 sub-categories, middle one active (lime) */}
      <rect x="14" y="68" width="60" height="24" rx="2" fill="none" stroke={MUTED} strokeWidth="1" />
      <text x="44" y="84" fontSize="9" textAnchor="middle" fill={MUTED}>女包</text>
      <rect x="90" y="68" width="60" height="24" rx="2" fill="none" stroke={ACCENT} strokeWidth="1.5" />
      <text x="120" y="84" fontSize="9" textAnchor="middle" fill={ACCENT}>双肩包 ✓</text>
      <rect x="166" y="68" width="60" height="24" rx="2" fill="none" stroke={MUTED} strokeWidth="1" />
      <text x="196" y="84" fontSize="9" textAnchor="middle" fill={MUTED}>钱包</text>
      {/* Platform pills */}
      <g fontSize="9">
        <rect x="22" y="120" width="60" height="20" rx="10" fill="none" stroke={ACCENT} strokeWidth="1.5" />
        <text x="52" y="134" textAnchor="middle" fill={ACCENT}>xhs</text>
        <rect x="90" y="120" width="60" height="20" rx="10" fill="none" stroke={ACCENT} strokeWidth="1.5" />
        <text x="120" y="134" textAnchor="middle" fill={ACCENT}>douyin</text>
        <rect x="158" y="120" width="60" height="20" rx="10" fill="none" stroke={ACCENT} strokeWidth="1.5" />
        <text x="188" y="134" textAnchor="middle" fill={ACCENT}>tmall</text>
      </g>
      <text x="120" y="160" fontSize="8" textAnchor="middle" fill={MUTED} letterSpacing="1">3 PLATFORMS · TRACKING</text>
    </svg>
  );
}

/** Step 3 — "competitors": a constellation of 6 brand nodes around a
 *  central "you" node, 3 connected (lime) + 3 unselected. */
function CompetitorsIllustration({ className }: IllustrationProps) {
  // 6 nodes on a circle around center (120, 90)
  const cx = 120, cy = 90, r = 60;
  const nodes = [0, 1, 2, 3, 4, 5].map((i) => ({
    x: cx + r * Math.cos((i / 6) * Math.PI * 2 - Math.PI / 2),
    y: cy + r * Math.sin((i / 6) * Math.PI * 2 - Math.PI / 2),
    active: [0, 2, 4].includes(i),
  }));
  return (
    <svg
      viewBox="0 0 240 180"
      className={className}
      role="img"
      aria-label="competitor watchlist illustration"
      style={{ color: "var(--fg, #f5f1f2)", fontFamily: "var(--font-mono)" }}
    >
      {/* Connector lines from center to active nodes */}
      {nodes.map((n, i) => (
        n.active && (
          <line
            key={`l${i}`}
            x1={cx} y1={cy} x2={n.x} y2={n.y}
            stroke={ACCENT} strokeWidth="1" opacity="0.7" strokeDasharray="2 2"
          />
        )
      ))}
      {/* Center "you" node */}
      <circle cx={cx} cy={cy} r="14" fill="none" stroke={STROKE} strokeWidth="1.5" />
      <text x={cx} y={cy + 4} fontSize="9" textAnchor="middle" fill={STROKE}>you</text>
      {/* Competitor nodes */}
      {nodes.map((n, i) => (
        <g key={`n${i}`}>
          <rect
            x={n.x - 16} y={n.y - 9} width="32" height="18" rx="2"
            fill="none"
            stroke={n.active ? ACCENT : MUTED}
            strokeWidth={n.active ? 1.5 : 1}
          />
          <text
            x={n.x} y={n.y + 3} fontSize="8" textAnchor="middle"
            fill={n.active ? ACCENT : MUTED}
          >
            {n.active ? `B${i + 1} ✓` : `B${i + 1}`}
          </text>
        </g>
      ))}
      <text x={cx} y="170" fontSize="8" textAnchor="middle" fill={MUTED} letterSpacing="1">
        3 OF 6 TRACKED
      </text>
    </svg>
  );
}

/** Step 4 — "goals": a tiny dashboard — 3 stacked metric rows + a
 *  sparkline with the latest point highlighted amber. */
function GoalsIllustration({ className }: IllustrationProps) {
  return (
    <svg
      viewBox="0 0 240 180"
      className={className}
      role="img"
      aria-label="goals + tracking illustration"
      style={{ color: "var(--fg, #f5f1f2)", fontFamily: "var(--font-mono)" }}
    >
      {/* Header */}
      <text x="20" y="22" fontSize="9" fill={ACCENT} letterSpacing="1.6">{"> SIGNALS"}</text>
      {/* Three metric rows */}
      <g fontSize="9">
        {[
          { y: 36, label: "pricing", bar: 70, color: ACCENT },
          { y: 56, label: "launches", bar: 90, color: ACCENT },
          { y: 76, label: "content", bar: 50, color: ACCENT },
          { y: 96, label: "sales", bar: 0, color: MUTED },
          { y: 116, label: "kol", bar: 0, color: MUTED },
        ].map((row, i) => (
          <g key={i}>
            <rect x="20" y={row.y - 5} width="8" height="8" rx="1"
                  fill={row.bar > 0 ? row.color : "none"}
                  stroke={row.color} strokeWidth="1" />
            <text x="34" y={row.y + 2} fill={row.color}>{row.label}</text>
            <line x1="92" y1={row.y - 1} x2="220" y2={row.y - 1}
                  stroke={MUTED} strokeWidth="1" opacity="0.4" />
            {row.bar > 0 && (
              <line x1="92" y1={row.y - 1} x2={92 + (128 * row.bar) / 100} y2={row.y - 1}
                    stroke={row.color} strokeWidth="2" />
            )}
          </g>
        ))}
      </g>
      {/* Sparkline footer */}
      <g>
        <polyline
          points="20,160 50,150 80,155 110,140 140,148 170,128 200,134 220,118"
          fill="none" stroke={MUTED} strokeWidth="1.2"
        />
        <circle cx="220" cy="118" r="3" fill={AMBER} />
        <text x="220" y="170" fontSize="8" textAnchor="end" fill={MUTED} letterSpacing="1">
          MONDAY · 09:00
        </text>
      </g>
    </svg>
  );
}

/** Pick the right illustration for the current wizard step. */
export function StepIllustration({ step, className }: { step: StepKey; className?: string }) {
  switch (step) {
    case "account":     return <AccountIllustration className={className} />;
    case "brand":       return <BrandIllustration className={className} />;
    case "competitors": return <CompetitorsIllustration className={className} />;
    case "goals":       return <GoalsIllustration className={className} />;
  }
}
