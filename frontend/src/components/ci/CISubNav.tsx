import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import { Link, useLocation } from 'react-router-dom';

const CI_TABS = [
  { path: '/ci', labelKey: T.ci.dashboard },
  { path: '/ci/landscape', labelKey: T.ci.landscape },
  { path: '/ci/competitors', labelKey: T.ci.competitors },
  { path: '/ci/settings', labelKey: T.ci.settings },
];

export default function CISubNav() {
  const { colors: C, lang } = useApp();
  const location = useLocation();
  const current = location.pathname;

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '8px 0',
      marginBottom: 24,
      borderBottom: `1px solid ${C.bd}`,
    }}>
      {CI_TABS.map(tab => {
        const active = tab.path === '/ci'
          ? current === '/ci'
          : current.startsWith(tab.path);
        return (
          <Link
            key={tab.path}
            to={tab.path}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? C.ac : C.t2,
              background: active ? C.s2 : 'transparent',
              textDecoration: 'none',
            }}
          >
            {t(tab.labelKey, lang)}
          </Link>
        );
      })}
    </div>
  );
}
