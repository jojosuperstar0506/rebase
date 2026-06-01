import type { CSSProperties } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { useApp } from '../../context/AppContext';

/**
 * Shared error state for the data-driven CI surfaces.
 *
 * The `useCIData` hook degrades to local/demo data on network failure, so an
 * actual error here means something unexpected threw (corrupt localStorage, a
 * bad data transform). Rather than hang on the loading skeleton, pages render
 * this with a retry that re-runs the load. On-brand: mono type, hairline
 * border, accent retry button. Bilingual EN/ZH.
 */
export default function CIErrorState({
  onRetry,
  detail,
}: {
  onRetry?: () => void;
  /** Optional technical detail (e.g. the thrown message), shown small + muted. */
  detail?: string | null;
}) {
  const { colors: C, lang } = useApp();

  const wrap: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    gap: 14,
    maxWidth: 420,
    margin: '0 auto',
    padding: '48px 24px',
  };

  return (
    <div style={wrap}>
      <span
        aria-hidden
        style={{
          display: 'inline-grid',
          placeItems: 'center',
          width: 48,
          height: 48,
          borderRadius: 8,
          background: C.s2,
          border: `1px solid ${C.bd}`,
          color: C.danger,
        }}
      >
        <AlertTriangle size={22} strokeWidth={1.75} />
      </span>

      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: C.t2, letterSpacing: '0.04em' }}>
        {lang === 'zh' ? '// 加载出错' : '// load error'}
      </div>

      <h2 style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700, color: C.tx, margin: 0 }}>
        {lang === 'zh' ? '数据加载失败' : "Couldn't load your data"}
      </h2>

      <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.6, color: C.t2, margin: 0 }}>
        {lang === 'zh'
          ? '出了点问题。请重试——如果反复出现,请联系我们。'
          : 'Something went wrong. Try again — if it keeps happening, reach out.'}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 44,
            padding: '0 20px',
            marginTop: 4,
            background: C.ac,
            color: C.bg,
            border: 'none',
            borderRadius: 2,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <RotateCcw size={14} strokeWidth={2} />
          {lang === 'zh' ? '重试' : 'Retry'}
        </button>
      )}

      {detail && (
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: C.t3,
            marginTop: 4,
            wordBreak: 'break-word',
          }}
        >
          {detail}
        </div>
      )}
    </div>
  );
}
