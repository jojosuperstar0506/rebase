import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import { CISettingsSkeleton } from '../../components/ci/CISkeleton';
import {
  getCIWorkspace, saveCIWorkspace,
  getCICompetitors, saveCICompetitors,
  getCIConnections, saveCIConnections,
  parsePlatformFromUrl,
  type CIWorkspace, type CICompetitor, type CIConnection,
} from '../../utils/ciStorage';

const CATEGORIES = ['女包', '男包', '箱包配件', '鞋类', '服饰', '其他'];
const PLATFORM_OPTIONS = ['淘宝/天猫', '京东', '小红书', '抖音'];
const MAX_WATCHLIST = 10;

const PLATFORM_COLORS: Record<string, string> = {
  xhs: '#ff2442',
  taobao: '#ff6a00',
  douyin: '#161823',
  jd: '#cc0000',
};
const PLATFORM_LABELS: Record<string, string> = {
  xhs: 'XHS',
  taobao: '淘宝',
  douyin: '抖音',
  jd: '京东',
};

const CONNECTIONS_CONFIG: Array<{
  key: CIConnection['platform'];
  name: string;
  descKey: keyof typeof T.ci;
  domain: string;
}> = [
  { key: 'sycm', name: '生意参谋 (SYCM)', descKey: 'sycmDesc', domain: 'sycm.taobao.com' },
  { key: 'xhs_analytics', name: '小红书 Analytics', descKey: 'xhsAnalyticsDesc', domain: 'xiaohongshu.com' },
  { key: 'douyin_compass', name: '抖音电商罗盘', descKey: 'douyinCompassDesc', domain: 'douyin.com' },
];

// ── Section wrapper ───────────────────────────────────────────────
function Section({ title, children, C }: { title: string; children: React.ReactNode; C: ReturnType<typeof useApp>['colors'] }) {
  return (
    <div style={{
      background: C.s1,
      border: `1px solid ${C.bd}`,
      borderRadius: 12,
      padding: 24,
      marginBottom: 24,
    }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, marginTop: 0 }}>{title}</h2>
      {children}
    </div>
  );
}

// ── Brand Profile ─────────────────────────────────────────────────
function BrandProfileSection({ C, lang }: { C: ReturnType<typeof useApp>['colors']; lang: string }) {
  const saved = getCIWorkspace();
  const [form, setForm] = useState<CIWorkspace>({
    brand_name: saved?.brand_name ?? '',
    brand_category: saved?.brand_category ?? '',
    price_range: saved?.price_range ?? { min: 0, max: 0 },
    platforms: saved?.platforms ?? [],
  });
  const [savedOk, setSavedOk] = useState(false);

  function togglePlatform(p: string) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }));
  }

  function handleSave() {
    saveCIWorkspace(form);
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 2000);
  }

  const inputStyle = {
    background: C.inputBg,
    border: `1px solid ${C.inputBd}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: C.tx,
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box' as const,
    outline: 'none',
  };

  const labelStyle = { fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6, display: 'block', textTransform: 'uppercase' as const, letterSpacing: 0.5 };

  return (
    <Section title={t(T.ci.brandProfile, lang as any)} C={C}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Brand name */}
        <div>
          <label style={labelStyle}>{t(T.ci.brandName, lang as any)}</label>
          <input
            style={inputStyle}
            value={form.brand_name}
            onChange={e => setForm(f => ({ ...f, brand_name: e.target.value }))}
            placeholder="e.g. OMI, 古良吉吉"
          />
        </div>

        {/* Category */}
        <div>
          <label style={labelStyle}>{t(T.ci.category, lang as any)}</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.brand_category}
            onChange={e => setForm(f => ({ ...f, brand_category: e.target.value }))}
          >
            <option value="">-- select --</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        {/* Price range */}
        <div>
          <label style={labelStyle}>{t(T.ci.priceRange, lang as any)}</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              style={{ ...inputStyle, width: '45%' }}
              type="number"
              min={0}
              placeholder="Min"
              value={form.price_range.min || ''}
              onChange={e => setForm(f => ({ ...f, price_range: { ...f.price_range, min: Number(e.target.value) } }))}
            />
            <span style={{ color: C.t3 }}>–</span>
            <input
              style={{ ...inputStyle, width: '45%' }}
              type="number"
              min={0}
              placeholder="Max"
              value={form.price_range.max || ''}
              onChange={e => setForm(f => ({ ...f, price_range: { ...f.price_range, max: Number(e.target.value) } }))}
            />
          </div>
        </div>

        {/* Platforms */}
        <div>
          <label style={labelStyle}>{t(T.ci.platforms, lang as any)}</label>
          <div style={{ display: 'flex', flexWrap: 'wrap' as const, gap: 8 }}>
            {PLATFORM_OPTIONS.map(p => {
              const checked = form.platforms.includes(p);
              return (
                <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePlatform(p)}
                    style={{ accentColor: C.ac }}
                  />
                  {p}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        style={{
          marginTop: 20,
          background: savedOk ? C.success : C.ac,
          border: 'none',
          borderRadius: 8,
          padding: '10px 24px',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {savedOk ? t(T.ci.saved, lang as any) : t(T.ci.saveBrand, lang as any)}
      </button>
    </Section>
  );
}

// ── Add competitor tabs ───────────────────────────────────────────
function AddCompetitorSection({ C, lang, competitors, onAdd }: {
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  competitors: CICompetitor[];
  onAdd: (c: CICompetitor) => void;
}) {
  const [activeTab, setActiveTab] = useState<'name' | 'link' | 'ai'>('name');
  const [nameInput, setNameInput] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [error, setError] = useState('');

  const watchlistCount = competitors.filter(c => c.tier === 'watchlist').length;

  function makeCompetitor(brand_name: string, platform_ids: Record<string, string>, added_via: CICompetitor['added_via']): CICompetitor {
    return {
      id: crypto.randomUUID(),
      brand_name,
      tier: watchlistCount < MAX_WATCHLIST ? 'watchlist' : 'landscape',
      platform_ids,
      added_via,
      created_at: new Date().toISOString(),
    };
  }

  function handleAddName() {
    const name = nameInput.trim();
    if (!name) return;
    if (watchlistCount >= MAX_WATCHLIST) {
      setError(t(T.ci.maxWatchlist, lang as any));
      return;
    }
    onAdd(makeCompetitor(name, {}, 'manual'));
    setNameInput('');
    setError('');
  }

  function handleAddLink() {
    const url = linkInput.trim();
    if (!url) return;
    if (watchlistCount >= MAX_WATCHLIST) {
      setError(t(T.ci.maxWatchlist, lang as any));
      return;
    }
    const parsed = parsePlatformFromUrl(url);
    const platform_ids = parsed ? { [parsed.platform]: parsed.identifier } : {};
    const brand_name = parsed ? `${PLATFORM_LABELS[parsed.platform] ?? 'Brand'}: ${parsed.identifier}` : url;
    onAdd(makeCompetitor(brand_name, platform_ids, 'link_paste'));
    setLinkInput('');
    setError('');
  }

  const tabs = [
    { key: 'name' as const, label: t(T.ci.typeName, lang as any) },
    { key: 'link' as const, label: t(T.ci.pasteLink, lang as any) },
    { key: 'ai' as const, label: t(T.ci.aiSuggestions, lang as any) },
  ];

  const inputStyle = {
    background: C.inputBg,
    border: `1px solid ${C.inputBd}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: C.tx,
    fontSize: 14,
    flex: 1,
    outline: 'none',
  };

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.bd}`, paddingBottom: 0 }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(''); }}
            style={{
              padding: '8px 16px',
              border: 'none',
              borderBottom: activeTab === tab.key ? `2px solid ${C.ac}` : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab.key ? C.ac : C.t2,
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 13,
              cursor: 'pointer',
              opacity: tab.key === 'ai' ? 0.45 : 1,
            }}
            disabled={tab.key === 'ai'}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Name */}
      {activeTab === 'name' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={inputStyle}
            value={nameInput}
            onChange={e => setNameInput(e.target.value)}
            placeholder="Enter brand name, e.g. Songmont, 古良吉吉"
            onKeyDown={e => e.key === 'Enter' && handleAddName()}
          />
          <button onClick={handleAddName} style={{ background: C.ac, border: 'none', borderRadius: 8, padding: '10px 20px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            {t(T.ci.addCompetitor, lang as any)}
          </button>
        </div>
      )}

      {/* Tab: Link */}
      {activeTab === 'link' && (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={inputStyle}
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              placeholder="Paste a 小红书, 淘宝, 抖音, or 京东 URL"
              onKeyDown={e => e.key === 'Enter' && handleAddLink()}
            />
            <button onClick={handleAddLink} style={{ background: C.ac, border: 'none', borderRadius: 8, padding: '10px 20px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {t(T.ci.addCompetitor, lang as any)}
            </button>
          </div>
          <p style={{ fontSize: 12, color: C.t3, marginTop: 6, marginBottom: 0 }}>
            We'll automatically detect the platform and brand
          </p>
        </div>
      )}

      {/* Tab: AI (placeholder) */}
      {activeTab === 'ai' && (
        <div style={{ padding: '16px', background: C.s2, borderRadius: 8, color: C.t3, fontSize: 13 }}>
          Based on your brand profile, AI will suggest competitors you should be tracking. Coming in a future update.
        </div>
      )}

      {error && (
        <p style={{ color: C.danger, fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>
      )}
    </div>
  );
}

// ── Competitor list ───────────────────────────────────────────────
function CompetitorList({ C, lang, competitors, onChange }: {
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  competitors: CICompetitor[];
  onChange: (updated: CICompetitor[]) => void;
}) {
  const watchlistCount = competitors.filter(c => c.tier === 'watchlist').length;

  function toggleTier(id: string) {
    const updated = competitors.map(c => {
      if (c.id !== id) return c;
      if (c.tier === 'landscape') {
        // Promote to watchlist only if under limit
        if (watchlistCount >= MAX_WATCHLIST) return c;
        return { ...c, tier: 'watchlist' as const };
      }
      return { ...c, tier: 'landscape' as const };
    });
    onChange(updated);
  }

  function remove(id: string) {
    onChange(competitors.filter(c => c.id !== id));
  }

  if (competitors.length === 0) {
    return <p style={{ color: C.t3, fontSize: 14 }}>No competitors added yet.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {competitors.map(c => (
        <div key={c.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: C.s2,
          borderRadius: 8,
          fontSize: 13,
        }}>
          {/* Brand name */}
          <span style={{ fontWeight: 600, flex: 1 }}>{c.brand_name}</span>

          {/* Platform badges */}
          <div style={{ display: 'flex', gap: 4 }}>
            {Object.keys(c.platform_ids).map(p => (
              <span key={p} style={{
                background: PLATFORM_COLORS[p] ?? C.ac,
                color: '#fff',
                padding: '2px 7px',
                borderRadius: 4,
                fontSize: 11,
                fontWeight: 600,
              }}>
                {PLATFORM_LABELS[p] ?? p}
              </span>
            ))}
          </div>

          {/* Tier toggle */}
          <button
            onClick={() => toggleTier(c.id)}
            title={c.tier === 'watchlist' ? 'Click to move to Landscape' : 'Click to promote to Watchlist'}
            style={{
              background: c.tier === 'watchlist' ? C.ac : C.s1,
              border: `1px solid ${c.tier === 'watchlist' ? C.ac : C.bd}`,
              borderRadius: 4,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
              color: c.tier === 'watchlist' ? '#fff' : C.t2,
              cursor: 'pointer',
            }}
          >
            {c.tier === 'watchlist' ? t(T.ci.watchlist, lang as any) : t(T.ci.landscapeTier, lang as any)}
          </button>

          {/* Added date */}
          <span style={{ color: C.t3, fontSize: 11, whiteSpace: 'nowrap' }}>
            {new Date(c.created_at).toLocaleDateString()}
          </span>

          {/* Remove */}
          <button
            onClick={() => remove(c.id)}
            style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }}
            title={t(T.ci.removeCompetitor, lang as any)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Platform connections ──────────────────────────────────────────
function ConnectionsSection({ C, lang }: { C: ReturnType<typeof useApp>['colors']; lang: string }) {
  const [connections, setConnections] = useState<CIConnection[]>(getCIConnections());
  const [modalPlatform, setModalPlatform] = useState<CIConnection['platform'] | null>(null);
  const [cookieInput, setCookieInput] = useState('');

  function getStatus(platform: CIConnection['platform']): CIConnection | undefined {
    return connections.find(c => c.platform === platform);
  }

  function saveConn() {
    if (!modalPlatform || !cookieInput.trim()) return;
    const updated = connections.filter(c => c.platform !== modalPlatform);
    const newConn: CIConnection = { platform: modalPlatform, status: 'connected', connected_at: new Date().toISOString() };
    const final = [...updated, newConn];
    setConnections(final);
    saveCIConnections(final);
    setCookieInput('');
    setModalPlatform(null);
  }

  return (
    <Section title={t(T.ci.connectAccountsTitle, lang as any)} C={C}>
      <p style={{ color: C.t2, fontSize: 13, marginTop: 0, marginBottom: 20 }}>
        {t(T.ci.connectDesc, lang as any)}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {CONNECTIONS_CONFIG.map(cfg => {
          const conn = getStatus(cfg.key);
          const isConnected = conn?.status === 'connected';
          return (
            <div key={cfg.key} style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              padding: '16px',
              background: C.s2,
              borderRadius: 10,
              border: `1px solid ${isConnected ? C.success : C.bd}`,
            }}>
              {/* Status dot */}
              <span style={{ fontSize: 18, flexShrink: 0 }}>{isConnected ? '✅' : '⬜'}</span>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{cfg.name}</div>
                <div style={{ color: C.t2, fontSize: 12, marginTop: 2 }}>
                  {t(T.ci[cfg.descKey] as any, lang as any)}
                </div>
                {isConnected && conn?.connected_at && (
                  <div style={{ color: C.t3, fontSize: 11, marginTop: 4 }}>
                    Last connected: {new Date(conn.connected_at).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Status / Connect button */}
              <div style={{ flexShrink: 0 }}>
                {isConnected ? (
                  <span style={{ color: C.success, fontSize: 13, fontWeight: 600 }}>
                    {t(T.ci.connected, lang as any)}
                  </span>
                ) : (
                  <button
                    onClick={() => { setModalPlatform(cfg.key); setCookieInput(''); }}
                    style={{ background: C.ac, border: 'none', borderRadius: 8, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    {t(T.ci.connect, lang as any)}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal */}
      {modalPlatform && (() => {
        const cfg = CONNECTIONS_CONFIG.find(c => c.key === modalPlatform)!;
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          }} onClick={() => setModalPlatform(null)}>
            <div style={{
              background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14,
              padding: 28, maxWidth: 480, width: '90%',
            }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, marginTop: 0 }}>
                Connect {cfg.name}
              </h3>

              <ol style={{ color: C.t2, fontSize: 13, lineHeight: 1.8, paddingLeft: 20, marginBottom: 20 }}>
                <li>Log into <strong>{cfg.domain}</strong> in your browser</li>
                <li>Open browser dev tools (F12) → Application → Cookies</li>
                <li>Copy all cookies for {cfg.domain}</li>
                <li>Paste below</li>
              </ol>

              <textarea
                style={{
                  width: '100%', minHeight: 100, background: C.inputBg,
                  border: `1px solid ${C.inputBd}`, borderRadius: 8,
                  padding: 12, color: C.tx, fontSize: 13, resize: 'vertical',
                  boxSizing: 'border-box', outline: 'none', fontFamily: 'monospace',
                }}
                value={cookieInput}
                onChange={e => setCookieInput(e.target.value)}
                placeholder={t(T.ci.pasteHere, lang as any)}
              />

              <div style={{ display: 'flex', gap: 10, marginTop: 16, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setModalPlatform(null)}
                  style={{ background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8, padding: '9px 20px', color: C.t2, fontSize: 13, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={saveConn}
                  disabled={!cookieInput.trim()}
                  style={{
                    background: cookieInput.trim() ? C.ac : C.t3,
                    border: 'none', borderRadius: 8, padding: '9px 20px',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: cookieInput.trim() ? 'pointer' : 'default',
                  }}
                >
                  {t(T.ci.saveConnection, lang as any)}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Section>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function CISettings() {
  const { colors: C, lang } = useApp();
  const [competitors, setCompetitors] = useState<CICompetitor[]>(getCICompetitors());
  // Brief skeleton on first mount so the page feels consistent with other CI pages
  const [ready, setReady] = useState(false);
  useEffect(() => { const t = setTimeout(() => setReady(true), 200); return () => clearTimeout(t); }, []);

  if (!ready) return <CISettingsSkeleton />;

  function handleAddCompetitor(c: CICompetitor) {
    const updated = [...competitors, c];
    setCompetitors(updated);
    saveCICompetitors(updated);
  }

  function handleCompetitorsChange(updated: CICompetitor[]) {
    setCompetitors(updated);
    saveCICompetitors(updated);
  }

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <CISubNav />

        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
            {t(T.ci.settings, lang)}
          </h1>
          <p style={{ color: C.t2, fontSize: 15, margin: 0 }}>
            {t(T.ci.subtitle, lang)}
          </p>
        </div>

        {/* 1 — Brand Profile */}
        <BrandProfileSection C={C} lang={lang} />

        {/* 2 — Competitor Management */}
        <Section title={t(T.ci.manageCompetitors, lang as any)} C={C}>
          <AddCompetitorSection
            C={C}
            lang={lang}
            competitors={competitors}
            onAdd={handleAddCompetitor}
          />
          <CompetitorList
            C={C}
            lang={lang}
            competitors={competitors}
            onChange={handleCompetitorsChange}
          />
        </Section>

        {/* 3 — Platform Connections */}
        <ConnectionsSection C={C} lang={lang} />
      </div>
    </div>
  );
}
