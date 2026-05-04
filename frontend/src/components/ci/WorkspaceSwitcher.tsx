import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCIData } from '../../hooks/useCIData';
import {
  getKnownWorkspaces, setActiveWorkspaceId, removeKnownWorkspace, addKnownWorkspace,
  type KnownWorkspace,
} from '../../utils/ciStorage';
import { listWorkspaces } from '../../services/ciApi';

/**
 * Workspace switcher pill — sits at the top of CISubNav so the user always
 * knows which workspace they're looking at and can switch between any they've
 * visited. The dropdown lists all workspaces owned by the current user
 * (from GET /api/ci/workspaces) merged with any locally-cached ones.
 *
 * 2026-05-03 update: backend GET /api/ci/workspaces (W6) and split POST
 * (insert) / PATCH (update) (W7) shipped, so the switcher now hydrates
 * its list from the server on mount instead of relying solely on
 * localStorage. The local cache stays as a fast-path / fallback.
 */
export default function WorkspaceSwitcher() {
  const { colors: C, lang } = useApp();
  const { workspace, loading } = useCIData();
  const [open, setOpen] = useState(false);
  const [known, setKnown] = useState<KnownWorkspace[]>(getKnownWorkspaces());
  const [listError, setListError] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const refresh = () => setKnown(getKnownWorkspaces());
    window.addEventListener('ci-data-updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('ci-data-updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Hydrate the dropdown from the server on mount — populates workspaces
  // that haven't been visited locally yet (e.g. a user with multiple
  // workspaces logging in on a fresh device). Soft-fail: if the API is
  // unreachable we keep the local cache and surface a small note.
  useEffect(() => {
    let cancelled = false;
    listWorkspaces().then(serverList => {
      if (cancelled) return;
      if (!serverList || serverList.length === 0) {
        setListError(true);
        return;
      }
      // Merge server-known into local cache (addKnownWorkspace is idempotent).
      for (const w of serverList) {
        addKnownWorkspace({
          id: w.id,
          brand_name: w.brand_name,
          brand_category: w.brand_category,
        });
      }
      setKnown(getKnownWorkspaces());
      setListError(false);
    }).catch(() => {
      if (!cancelled) setListError(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  if (loading) return null;
  if (!workspace || workspace.id === 'local') return null;

  const currentName = workspace.brand_name || (lang === 'zh' ? '未命名工作区' : 'Untitled workspace');

  function switchTo(id: string) {
    setActiveWorkspaceId(id);
    setOpen(false);
  }

  function handleRemove(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (id === workspace?.id) return; // can't remove the active one
    removeKnownWorkspace(id);
  }

  const triggerStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 8,
    padding: '6px 10px 6px 12px',
    background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8,
    color: C.tx, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', minHeight: 36, lineHeight: 1.2,
    maxWidth: 280,
  };

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={triggerStyle}
        title={lang === 'zh' ? '切换工作区' : 'Switch workspace'}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}>
          {lang === 'zh' ? '工作区' : 'Workspace'}
        </span>
        <span style={{
          maxWidth: 180, overflow: 'hidden',
          textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {currentName}
        </span>
        <span style={{
          fontSize: 10, color: C.t3, marginLeft: 2,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
        }}>
          ▼
        </span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 280, maxWidth: 360, zIndex: 50,
          background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 10,
          boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
          padding: 6,
        }}>
          <div style={{
            padding: '6px 10px 8px', fontSize: 10, fontWeight: 700,
            color: C.t3, letterSpacing: '0.08em', textTransform: 'uppercase',
            borderBottom: `1px solid ${C.bd}`,
          }}>
            {lang === 'zh' ? '已知工作区' : 'Your workspaces'}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 280, overflowY: 'auto' }}>
            {known.length === 0 && (
              <div style={{ padding: '10px 12px', fontSize: 12, color: C.t3 }}>
                {lang === 'zh' ? '暂无缓存的工作区。' : 'No cached workspaces yet.'}
              </div>
            )}
            {known.map(ws => {
              const isActive = ws.id === workspace.id;
              return (
                <button
                  key={ws.id}
                  onClick={() => switchTo(ws.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 10px', borderRadius: 6,
                    background: isActive ? C.s2 : 'transparent',
                    border: 'none', textAlign: 'left',
                    color: C.tx, fontSize: 13, cursor: 'pointer',
                    width: '100%',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = C.s2; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: isActive ? C.ac : C.t3, flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, fontWeight: isActive ? 700 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ws.brand_name}
                  </span>
                  {ws.brand_category && (
                    <span style={{ fontSize: 10, color: C.t3, flexShrink: 0 }}>
                      {ws.brand_category}
                    </span>
                  )}
                  {!isActive && (
                    <span
                      onClick={e => handleRemove(e, ws.id)}
                      style={{
                        color: C.t3, fontSize: 14, lineHeight: 1, padding: '0 4px',
                        cursor: 'pointer',
                      }}
                      title={lang === 'zh' ? '从列表移除（不会删除工作区）' : 'Remove from list (does not delete workspace)'}
                    >×</span>
                  )}
                </button>
              );
            })}
          </div>

          {listError && (
            <div style={{
              borderTop: `1px solid ${C.bd}`,
              padding: '8px 10px',
              fontSize: 11, color: C.t3, lineHeight: 1.5,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <AlertTriangle size={11} strokeWidth={2} color="#f59e0b" />
                {lang === 'zh'
                  ? '无法从服务器获取工作区列表，显示的是本地缓存。'
                  : 'Could not load workspaces from server — showing locally cached list.'}
              </span>
            </div>
          )}
          <div style={{
            borderTop: `1px solid ${C.bd}`,
            padding: '8px 10px',
            fontSize: 11, color: C.t3, lineHeight: 1.5,
          }}>
            {lang === 'zh'
              ? '在「设置」中可创建/编辑工作区。'
              : 'Create / edit workspaces in Settings.'}
          </div>
        </div>
      )}
    </div>
  );
}
