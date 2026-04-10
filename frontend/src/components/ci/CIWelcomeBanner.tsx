import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';

const STORAGE_KEY = 'rebase_ci_welcome_dismissed';

export default function CIWelcomeBanner() {
  const { colors: C, lang } = useApp();
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true',
  );

  if (dismissed) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div style={{
      background: `${C.ac}12`,
      border: `1px solid ${C.ac}40`,
      borderRadius: 10,
      padding: '14px 18px',
      marginBottom: 20,
      display: 'flex',
      gap: 12,
      alignItems: 'flex-start',
      fontSize: 13,
      color: C.t2,
      lineHeight: 1.7,
    }}>
      <div style={{ flex: 1 }}>
        {t(T.ci.welcomeBanner, lang)}
      </div>
      <button
        onClick={dismiss}
        style={{
          background: C.ac,
          border: 'none',
          borderRadius: 6,
          padding: '5px 14px',
          color: '#fff',
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          flexShrink: 0,
          alignSelf: 'center',
        }}
      >
        {t(T.ci.gotIt, lang)}
      </button>
    </div>
  );
}
