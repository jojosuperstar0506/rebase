import { useApp } from '../../context/AppContext';
import { Link, useLocation } from 'react-router-dom';
import WorkspaceSwitcher from './WorkspaceSwitcher';

/**
 * CI sub-navigation. Builder-energy treatment: mono labels, no emoji,
 * lowercase, hairline divider. Active tab gets a solid accent underline.
 *
 * Tabs are grouped by purpose:
 *   ── Current state ──  brief · analytics · library · brands
 *   ── Recommend next ─  actions · opportunity
 *   ── Admin ──────────  settings · help
 */
interface CITab {
  path: string;
  label: { en: string; zh: string };
  groupBreakAfter?: boolean;
}

const CI_TABS: CITab[] = [
  { path: '/ci',             label: { en: 'brief',       zh: '简报'    } },
  { path: '/ci/analytics',   label: { en: 'analytics',   zh: '分析'    } },
  { path: '/ci/library',     label: { en: 'library',     zh: '资料库'  } },
  { path: '/ci/competitors', label: { en: 'brands',      zh: '品牌'    }, groupBreakAfter: true },
  { path: '/ci/actions',     label: { en: 'actions',     zh: '今日'    } },
  { path: '/ci/opportunity', label: { en: 'opportunity', zh: '本月机会' }, groupBreakAfter: true },
  { path: '/ci/settings',    label: { en: 'settings',    zh: '设置'    } },
  { path: '/ci/help',        label: { en: 'help',        zh: '帮助'    } },
];

export default function CISubNav() {
  const { lang } = useApp();
  const location = useLocation();
  const current = location.pathname;

  return (
    <>
      <style>{`.ci-subnav::-webkit-scrollbar { display: none }`}</style>
      <div style={{ paddingTop: 8, marginBottom: 4 }}>
        <WorkspaceSwitcher />
      </div>
      <div
        className="ci-subnav"
        style={{
          display: 'flex',
          gap: 2,
          padding: '4px 0 0',
          marginBottom: 24,
          borderBottom: '1px solid var(--color-border-hairline)',
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
            <span key={tab.path} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Link
                to={tab.path}
                style={{
                  padding: '10px 14px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                  background: 'transparent',
                  textDecoration: 'none',
                  whiteSpace: 'nowrap',
                  minHeight: 40,
                  display: 'flex',
                  alignItems: 'center',
                  borderBottom: active
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
                  marginBottom: -1,
                }}
              >
                {lang === 'zh' ? tab.label.zh : tab.label.en}
              </Link>
              {tab.groupBreakAfter && (
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    height: 16,
                    background: 'var(--color-border-hairline)',
                    margin: '0 8px',
                    flexShrink: 0,
                  }}
                />
              )}
            </span>
          );
        })}
      </div>
    </>
  );
}
