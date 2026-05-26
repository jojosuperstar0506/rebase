import type { ReactNode } from 'react';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Heading } from '@/components/ui/Heading';

interface CIPageHeaderProps {
  /** Mono uppercase eyebrow, e.g. "// settings · workspace" */
  eyebrow: string;
  /** Display-font page title */
  title: string;
  /** Optional mono subtitle line */
  subtitle?: string;
  /** Optional top-right slot — view toggles, export buttons, etc. */
  right?: ReactNode;
}

/**
 * Canonical header for every CI page (Brief, Analytics, Library, Brands,
 * Settings). Before this existed each page hand-rolled its own eyebrow +
 * h1 with slightly different sizes and letter-spacing — see issue #79.
 *
 * Built on the design-system Eyebrow + Heading primitives so every CI
 * page header is pixel-identical. `data-scheme="canvas"` resolves the
 * --fg / --fg-muted vars the primitives read (and keeps them theme-correct
 * in dark mode) even though CI pages aren't wrapped in a <Section>.
 */
export function CIPageHeader({ eyebrow, title, subtitle, right }: CIPageHeaderProps) {
  return (
    <header
      data-scheme="canvas"
      className="flex justify-between items-start gap-4 flex-wrap"
      style={{ margin: '24px 0 28px', background: 'transparent' }}
    >
      <div className="flex flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Heading as={1} size="section">
          {title}
        </Heading>
        {subtitle && (
          <p
            className="text-sm"
            style={{ fontFamily: 'var(--font-mono)', color: 'var(--fg-muted)' }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </header>
  );
}
