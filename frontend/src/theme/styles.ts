/**
 * Shared style helpers — micro-interactions and design-system tokens.
 *
 * Why this exists:
 *   The frontend audit (2026-04-23) found 1100+ inline `style={{}}` instances
 *   with arbitrary radius/spacing/transition values. We can't refactor all
 *   pages into a component library in one session, but we CAN ship cheap
 *   wins that pay back wherever they're imported:
 *
 *     - hoverable()    — reusable hover-lift effect for any clickable card
 *     - focusable()    — focus-ring to replace `outline: none`
 *     - radii / space  — design tokens so new code stops inventing values
 *     - transitions    — single source of truth for animation timing
 *
 *   New pages should import these. Existing pages can be migrated
 *   opportunistically; nothing breaks if they don't.
 */

import type { CSSProperties } from 'react';
import type { ColorSet } from './colors';

// ─── Tokens ──────────────────────────────────────────────────────────────

/** Standard border-radius scale. Replaces the 16 unique values we found. */
export const radii = {
  sm: 4,    // pills, small badges
  md: 8,    // buttons, inputs
  lg: 12,   // cards, modals
  xl: 16,   // hero / feature cards
  pill: 999,
} as const;

/** Spacing scale (4px grid). New code should use these instead of arbitrary numbers. */
export const space = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
} as const;

/** Animation timings — single source of truth. */
export const motion = {
  fast: '0.12s',
  base: '0.18s',
  slow: '0.28s',
  ease: 'ease',
  easeOut: 'cubic-bezier(0.16, 1, 0.3, 1)',  // crisp settle, AI-feeling
} as const;

/** Common transition string used across hover-lift / focus / color shifts. */
export const transitionAll = `all ${motion.base} ${motion.easeOut}`;

// ─── Style helpers (composable) ──────────────────────────────────────────

/**
 * Make any clickable card / button feel responsive on hover.
 * Returns inline style + handler refs you can spread into onMouseEnter/Leave.
 *
 * Usage in a component:
 *   const hover = useHover(C);
 *   <div style={{ ...cardStyle, ...hover.style }} {...hover.handlers}>...</div>
 *
 * Or non-stateful — just style:
 *   <div style={{ ...cardStyle, transition: transitionAll, cursor: 'pointer' }}>
 */
export function hoverableCard(C: ColorSet): CSSProperties {
  return {
    cursor: 'pointer',
    transition: transitionAll,
  };
}

/**
 * Mouse handlers that lift a card on hover by changing its border + shadow.
 * Pair with hoverableCard() above.
 *
 *   const C = useApp().colors;
 *   const handlers = onHoverLift(C);
 *   <div {...handlers}>...</div>
 */
export function onHoverLift(C: ColorSet) {
  const enter = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = `${C.ac}66`;
    e.currentTarget.style.boxShadow = `0 4px 12px ${C.ac}22`;
    e.currentTarget.style.transform = 'translateY(-1px)';
  };
  const leave = (e: React.MouseEvent<HTMLElement>) => {
    e.currentTarget.style.borderColor = C.bd;
    e.currentTarget.style.boxShadow = 'none';
    e.currentTarget.style.transform = 'translateY(0)';
  };
  return { onMouseEnter: enter, onMouseLeave: leave };
}

/**
 * Focus-ring style. Use as event handlers on form inputs that previously
 * had `outline: 'none'` — restores the a11y signal that focus is visible.
 *
 *   <input style={inputStyle} {...focusableInput(C)} />
 */
export function focusableInput(C: ColorSet) {
  return {
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = C.ac;
      e.currentTarget.style.boxShadow = `0 0 0 3px ${C.ac}22`;
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      e.currentTarget.style.borderColor = C.inputBd;
      e.currentTarget.style.boxShadow = 'none';
    },
  };
}

// ─── Reusable button presets ─────────────────────────────────────────────

/** Primary CTA — accent background, white text. */
export function btnPrimary(C: ColorSet, opts: { disabled?: boolean } = {}): CSSProperties {
  return {
    background: opts.disabled ? C.s2 : C.ac,
    color: opts.disabled ? C.t2 : '#fff',
    border: 'none',
    borderRadius: radii.md,
    padding: `${space.sm}px ${space.lg}px`,
    fontSize: 13,
    fontWeight: 700,
    cursor: opts.disabled ? 'default' : 'pointer',
    transition: transitionAll,
    opacity: opts.disabled ? 0.6 : 1,
  };
}

/** Secondary button — outlined, transparent. */
export function btnSecondary(C: ColorSet, opts: { disabled?: boolean } = {}): CSSProperties {
  return {
    background: 'transparent',
    color: opts.disabled ? C.t3 : C.t2,
    border: `1px solid ${C.bd}`,
    borderRadius: radii.md,
    padding: `${space.xs + 2}px ${space.md}px`,
    fontSize: 12,
    fontWeight: 600,
    cursor: opts.disabled ? 'default' : 'pointer',
    transition: transitionAll,
    opacity: opts.disabled ? 0.5 : 1,
  };
}

/** Ghost button — no border, text-only, used for tertiary actions like Dismiss. */
export function btnGhost(C: ColorSet): CSSProperties {
  return {
    background: 'transparent',
    color: C.t3,
    border: 'none',
    padding: `${space.xs + 2}px ${space.md}px`,
    fontSize: 12,
    cursor: 'pointer',
    transition: transitionAll,
  };
}
