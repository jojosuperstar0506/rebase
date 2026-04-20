/**
 * Shared drill-down modal used across Analytics, Library, and (future) Brief
 * signal-pill clicks. Renders a centered panel with backdrop; closes on
 * Escape or backdrop click.
 *
 * This is deliberately a container — callers supply the content. The goal
 * is a single consistent modal shell so the app feels cohesive.
 */

import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useApp } from '../../context/AppContext';
import { useBreakpoint } from '../../hooks/useBreakpoint';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** 'md' (default) for most drill-downs, 'lg' for dense detail views. */
  size?: 'md' | 'lg';
}

export default function CIDrillDownModal({
  open, onClose, title, subtitle, children, size = 'md',
}: Props) {
  const { colors: C } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  // Close on Escape — standard modal accessibility
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    // Lock body scroll while modal is open
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handler);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  const maxWidth = size === 'lg' ? 900 : 640;

  const backdrop: CSSProperties = {
    position: 'fixed', inset: 0,
    background: 'rgba(0, 0, 0, 0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: isMobile ? 0 : 20,
    animation: 'rebase_fade_in 0.15s ease',
  };
  const panel: CSSProperties = {
    background: C.bg,
    color: C.tx,
    border: `1px solid ${C.bd}`,
    borderRadius: isMobile ? 0 : 14,
    width: '100%', maxWidth,
    maxHeight: isMobile ? '100vh' : '85vh',
    display: 'flex', flexDirection: 'column',
    boxShadow: '0 10px 40px rgba(0,0,0,0.35)',
    animation: 'rebase_slide_up 0.2s ease',
  };

  return (
    <div style={backdrop} onClick={onClose}>
      <style>{`
        @keyframes rebase_fade_in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes rebase_slide_up { from { transform: translateY(10px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
      <div
        style={panel}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 12,
          padding: isMobile ? '16px 16px 12px' : '20px 24px 14px',
          borderBottom: `1px solid ${C.bd}`,
          flexShrink: 0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ fontSize: isMobile ? 16 : 18, fontWeight: 700, margin: 0, lineHeight: 1.35 }}>
              {title}
            </h3>
            {subtitle && (
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4, lineHeight: 1.5 }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent', border: 'none',
              color: C.t3, fontSize: 22, cursor: 'pointer',
              padding: 0, lineHeight: 1, marginTop: -2,
            }}
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div style={{
          flex: 1, overflow: 'auto',
          padding: isMobile ? '14px 16px 20px' : '18px 24px 24px',
        }}>
          {children}
        </div>
      </div>
    </div>
  );
}
