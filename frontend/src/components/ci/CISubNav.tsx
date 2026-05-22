import { useApp } from '../../context/AppContext';
import { Link, useLocation } from 'react-router-dom';
import {
  Newspaper, BarChart3, Library, Tag,
  Target, Map as MapIcon,
  Settings as SettingsIcon, HelpCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import WorkspaceSwitcher from './WorkspaceSwitcher';

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
  Icon: LucideIcon;
  /** When true, render a thin vertical divider AFTER this tab to separate
   *  conceptual groups (current state | recommend next | admin). */
  groupBreakAfter?: boolean;
}

// Tab order is intentional — grouped by purpose:
//   ── Current state ────────────────────────────────────────
//     Brief (week summary) → Analytics (deep dive) →
//     Library (archive) → Brands (tracked competitors)
//   ── Recommended next ─────────────────────────────────────
//     Actions (today) → Opportunity (this month)
//   ── Admin ────────────────────────────────────────────────
//     Settings → Help
//
// The visual breaks between groups help customers understand:
// "first half is what's happening, second half is what to do."
const CI_TABS: CITab[] = [
  // ── Current state
  { path: '/ci',             label: { en: 'Brief',       zh: '简报'    }, Icon: Newspaper },
  { path: '/ci/analytics',   label: { en: 'Analytics',   zh: '分析'    }, Icon: BarChart3 },
  { path: '/ci/library',     label: { en: 'Library',     zh: '资料库'  }, Icon: Library },
  { path: '/ci/competitors', label: { en: 'Brands',      zh: '品牌'    }, Icon: Tag, groupBreakAfter: true },
  // ── Recommended next
  { path: '/ci/actions',     label: { en: 'Actions',     zh: '今日'    }, Icon: Target },
  { path: '/ci/opportunity', label: { en: 'Opportunity', zh: '本月机会' }, Icon: MapIcon, groupBreakAfter: true },
  // ── Admin
  { path: '/ci/settings',    label: { en: 'Settings',    zh: '设置'    }, Icon: SettingsIcon },
  { path: '/ci/help',        label: { en: 'Help',        zh: '帮助'    }, Icon: HelpCircle },
];

export default function CISubNav() {
  const { colors: C, lang } = useApp();
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
            <span key={tab.path} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              <Link
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
                  minHeight: 44,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <tab.Icon size={14} strokeWidth={1.75} />
                <span>{lang === 'zh' ? tab.label.zh : tab.label.en}</span>
              </Link>
              {tab.groupBreakAfter && (
                <span
                  aria-hidden
                  style={{
                    width: 1,
                    height: 20,
                    background: C.bd,
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
