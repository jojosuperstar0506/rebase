import { useApp } from '../../context/AppContext';
import { Link, useLocation } from 'react-router-dom';

/**
 * CI sub-navigation. After the Brief-centric redesign the tabs are:
 *   /ci              — Brief (the weekly action kit; landing page)
 *   /ci/library      — Library (archive of past briefs / content / products)
 *   /ci/competitors  — Brands (list of tracked competitors incl. own brand)
 *   /ci/settings     — Settings
 *   /ci/help         — Help
 *
 * Removed: the old Dashboard, Intelligence, Landscape, and DeepDive tabs —
 * their content is now surfaced inside the Brief (collapsed 'See all metrics'
 * panel) or inside per-brand detail views from the Brands page.
 */
interface CITab {
  path: string;
  label: { en: string; zh: string };
  icon: string;
}

const CI_TABS: CITab[] = [
  { path: '/ci',             label: { en: 'Brief',    zh: '简报'   }, icon: '📰' },
  { path: '/ci/library',     label: { en: 'Library',  zh: '资料库' }, icon: '📚' },
  { path: '/ci/competitors', label: { en: 'Brands',   zh: '品牌'   }, icon: '🏷️' },
  { path: '/ci/settings',    label: { en: 'Settings', zh: '设置'   }, icon: '⚙️' },
  { path: '/ci/help',        label: { en: 'Help',     zh: '帮助'   }, icon: '💡' },
];

export default function CISubNav() {
  const { colors: C, lang } = useApp();
  const location = useLocation();
  const current = location.pathname;

  return (
    <>
      <style>{`.ci-subnav::-webkit-scrollbar { display: none }`}</style>
      <div
        className="ci-subnav"
        style={{
          display: 'flex',
          gap: 4,
          padding: '8px 0',
          marginBottom: 24,
          borderBottom: `1px solid ${C.bd}`,
          overflowX: 'auto',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch' as any,
        }}
      >
        {CI_TABS.map(tab => {
          const active = tab.path === '/ci'
            ? current === '/ci'
            : current.startsWith(tab.path);
          return (
            <Link
              key={tab.path}
              to={tab.path}
              style={{
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: active ? 600 : 400,
                color: active ? C.ac : C.t2,
                background: active ? C.s2 : 'transparent',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                minHeight: 44,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontSize: 14 }}>{tab.icon}</span>
              <span>{lang === 'zh' ? tab.label.zh : tab.label.en}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
