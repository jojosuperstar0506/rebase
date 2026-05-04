import type { CSSProperties, ReactNode } from 'react';
import { useApp } from '../../context/AppContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';

/**
 * Reusable "coming soon" page scaffold for tabs in pre-launch state.
 * Shows: hero headline + tagline + value prop + preview cards + status badge.
 *
 * Used by /ci/actions (daily marketing material) and /ci/opportunity
 * (monthly GTM playbook). Both are large workstreams — this scaffold
 * lets us seat them in the nav and start building user anticipation
 * without committing to a delivery date.
 */
interface PreviewCard {
  /** One-line title for the card. */
  title: string;
  /** 1–2 sentence preview of what the card will contain when launched. */
  description: string;
  /** Emoji icon at the top of the card. */
  icon: string;
  /** Optional small label above title (e.g. "Douyin", "Monthly", "Q4"). */
  badge?: string;
}

interface ComingSoonHeroProps {
  /** Page-level icon shown above the headline. Accepts a React node (lucide icon)
   *  or a string (legacy emoji). */
  pageIcon: ReactNode;
  /** Big headline at the top. ≤ ~10 words. */
  headline: string;
  /** 1-line tagline under the headline explaining what this tab will do. */
  tagline: string;
  /** Value-prop callout — the "why this matters" statement. */
  valueProp: string;
  /** Preview cards showing concrete examples of what's coming. */
  cards: PreviewCard[];
  /** Translation of "Coming Soon" badge text — pass localized version. */
  badgeText: string;
  /** Translation of "What's coming" heading above the preview cards. */
  cardsHeading: string;
  /** Optional extra content rendered under the cards. */
  footer?: ReactNode;
}

export default function ComingSoonHero(props: ComingSoonHeroProps) {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const heroStyle: CSSProperties = {
    background: `linear-gradient(135deg, ${C.s1} 0%, ${C.s2} 100%)`,
    border: `1px solid ${C.bd}`,
    borderRadius: 16,
    padding: isMobile ? '32px 20px' : '56px 48px',
    textAlign: 'center',
    marginBottom: 32,
    position: 'relative',
    overflow: 'hidden',
  };

  const badgeStyle: CSSProperties = {
    display: 'inline-block',
    padding: '4px 12px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: C.ac,
    background: C.s1,
    border: `1px solid ${C.ac}`,
    borderRadius: 999,
    marginBottom: 20,
  };

  const cardGrid: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: 16,
    marginBottom: 24,
    opacity: 0.55, // greyed-out — these are previews, not active features
    pointerEvents: 'none',
  };

  const cardStyle: CSSProperties = {
    background: C.s1,
    border: `1px dashed ${C.bd}`,
    borderRadius: 12,
    padding: '20px 18px',
    minHeight: 120,
  };

  return (
    <div>
      <div style={heroStyle}>
        <div style={badgeStyle}>{props.badgeText}</div>
        <div style={{ marginBottom: 12, display: 'inline-flex', justifyContent: 'center', alignItems: 'center', fontSize: isMobile ? 36 : 56, lineHeight: 1 }}>
          {props.pageIcon}
        </div>
        <h1 style={{
          fontSize: isMobile ? 24 : 32,
          fontWeight: 700,
          color: C.tx,
          margin: '0 0 12px 0',
          lineHeight: 1.2,
        }}>
          {props.headline}
        </h1>
        <p style={{
          fontSize: isMobile ? 14 : 16,
          color: C.t2,
          margin: '0 auto',
          maxWidth: 600,
          lineHeight: 1.5,
        }}>
          {props.tagline}
        </p>
        <div style={{
          marginTop: 24,
          padding: '14px 20px',
          background: C.bg,
          border: `1px solid ${C.bd}`,
          borderLeft: `3px solid ${C.ac}`,
          borderRadius: 8,
          maxWidth: 600,
          margin: '24px auto 0',
          fontSize: isMobile ? 13 : 14,
          color: C.tx,
          textAlign: 'left',
          fontStyle: 'italic',
        }}>
          {props.valueProp}
        </div>
      </div>

      <h3 style={{
        fontSize: 13,
        fontWeight: 600,
        color: C.t2,
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 16,
      }}>
        {props.cardsHeading}
      </h3>

      <div style={cardGrid}>
        {props.cards.map((card, i) => (
          <div key={i} style={cardStyle}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>{card.icon}</div>
            {card.badge && (
              <div style={{
                display: 'inline-block',
                fontSize: 10,
                fontWeight: 600,
                color: C.t2,
                padding: '2px 8px',
                background: C.s2,
                borderRadius: 4,
                marginBottom: 8,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                {card.badge}
              </div>
            )}
            <div style={{
              fontSize: 15,
              fontWeight: 600,
              color: C.tx,
              marginBottom: 6,
            }}>
              {card.title}
            </div>
            <div style={{
              fontSize: 13,
              color: C.t2,
              lineHeight: 1.5,
            }}>
              {card.description}
            </div>
          </div>
        ))}
      </div>

      {props.footer && (
        <div style={{ marginTop: 24 }}>{props.footer}</div>
      )}

      <div style={{
        marginTop: 32,
        padding: '16px 20px',
        background: C.s2,
        border: `1px solid ${C.bd}`,
        borderRadius: 8,
        fontSize: 13,
        color: C.t3,
        textAlign: 'center',
      }}>
        {lang === 'zh'
          ? '我们正在打造这个功能。当前的 Brief、Analytics 和 Library 仍是核心 — 这只是路线图的一瞥。'
          : 'We\'re building this now. The current Brief, Analytics, and Library tabs remain core — this is just a preview of what\'s next.'}
      </div>
    </div>
  );
}
