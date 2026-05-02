import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import { CISettingsSkeleton } from '../../components/ci/CISkeleton';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import {
  getCIWorkspace, saveCIWorkspace,
  getCICompetitors, saveCICompetitors,
  getCIConnections, saveCIConnections,
  type CIWorkspace, type CICompetitor, type CIConnection,
} from '../../utils/ciStorage';
import {
  resolveBrand, parseLink, suggestCompetitors, searchBrands,
  requestDeepDive, getWorkspace, runAnalysis, saveWorkspace, addCompetitor,
  type BrandResolution, type CompetitorSuggestion,
} from '../../services/ciApi';

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
function BrandProfileSection({ C, lang, isMobile }: { C: ReturnType<typeof useApp>['colors']; lang: string; isMobile: boolean }) {
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
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
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
          minHeight: 44,
          width: isMobile ? '100%' : undefined,
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
  const [error, setError] = useState('');
  const watchlistCount = competitors.filter(c => c.tier === 'watchlist').length;

  // ── Name tab state ──────────────────────────────────────────────
  const [nameInput, setNameInput] = useState('');
  const [nameSuggestions, setNameSuggestions] = useState<BrandResolution[]>([]);
  const [showNameDrop, setShowNameDrop] = useState(false);
  const [resolvedPlatformIds, setResolvedPlatformIds] = useState<Record<string, string>>({});
  const [resolveSource, setResolveSource] = useState<'database' | 'registry' | 'default' | null>(null);
  const [nameAdding, setNameAdding] = useState(false);
  const nameDropRef = useRef<HTMLDivElement>(null);

  // Debounced search
  useEffect(() => {
    if (nameInput.length < 2) { setNameSuggestions([]); setShowNameDrop(false); return; }
    const timer = setTimeout(async () => {
      const results = await searchBrands(nameInput);
      setNameSuggestions(results);
      setShowNameDrop(results.length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [nameInput]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (nameDropRef.current && !nameDropRef.current.contains(e.target as Node)) {
        setShowNameDrop(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function selectNameSuggestion(brand: BrandResolution) {
    setNameInput(brand.brand_name);
    setResolvedPlatformIds(
      Object.fromEntries(Object.entries(brand.platform_ids).filter(([, v]) => v != null)) as Record<string, string>
    );
    setResolveSource(brand.source);
    setShowNameDrop(false);
    setNameSuggestions([]);
  }

  // Detect URLs the user pasted into the brand-name field. Without this,
  // strings like "https://xiaohongshu.com/user/profile/xyz" get saved
  // verbatim as a brand name, which then poisons scraped_brand_profiles.
  function looksLikeBrandUrl(s: string): boolean {
    return /^https?:\/\//i.test(s)
      || /\b(xiaohongshu\.com|xhs\.link|douyin\.com|taobao\.com|tmall\.com|jd\.com)\b/i.test(s);
  }

  async function handleAddName() {
    const raw = nameInput.trim();
    if (!raw) return;
    if (watchlistCount >= MAX_WATCHLIST) { setError(t(T.ci.maxWatchlist, lang as any)); return; }
    setNameAdding(true);
    setError('');

    let name = raw;
    let platformIds = resolvedPlatformIds;
    let addedVia: CICompetitor['added_via'] = 'manual';

    if (looksLikeBrandUrl(raw)) {
      const parsed = await parseLink(raw);
      const resolvedName = parsed?.parsed ? parsed.brand_name?.trim() : '';
      if (!resolvedName) {
        setNameAdding(false);
        setError(lang === 'zh'
          ? '无法识别该链接，请直接输入品牌名称。'
          : "We couldn't parse that link — please paste the brand name manually.");
        return;
      }
      name = resolvedName;
      addedVia = 'link_paste';
      platformIds = parsed!.platform_ids
        ?? (parsed!.platform && parsed!.identifier ? { [parsed!.platform]: parsed!.identifier } : {});
      setResolveSource('registry');
    } else if (Object.keys(platformIds).length === 0) {
      const resolved = await resolveBrand(name);
      if (resolved) {
        platformIds = Object.fromEntries(
          Object.entries(resolved.platform_ids).filter(([, v]) => v != null)
        ) as Record<string, string>;
        setResolveSource(resolved.source);
      }
    }

    onAdd({
      id: crypto.randomUUID(),
      brand_name: name,
      tier: watchlistCount < MAX_WATCHLIST ? 'watchlist' : 'landscape',
      platform_ids: platformIds,
      added_via: addedVia,
      created_at: new Date().toISOString(),
    });
    setNameInput('');
    setResolvedPlatformIds({});
    setResolveSource(null);
    setNameAdding(false);
  }

  // ── Link tab state ──────────────────────────────────────────────
  const [linkInput, setLinkInput] = useState('');
  const [linkParsing, setLinkParsing] = useState(false);
  const [linkResult, setLinkResult] = useState<{ platform: string; brandName: string; platformIds: Record<string, string> } | null>(null);
  const [linkError, setLinkError] = useState('');
  const [linkBrandInput, setLinkBrandInput] = useState(''); // for unknown brand name prompt

  async function handleParseLink() {
    const url = linkInput.trim();
    if (!url) return;
    if (watchlistCount >= MAX_WATCHLIST) { setError(t(T.ci.maxWatchlist, lang as any)); return; }
    setLinkParsing(true);
    setLinkResult(null);
    setLinkError('');
    setLinkBrandInput('');
    const result = await parseLink(url);
    setLinkParsing(false);
    if (!result || !result.parsed) {
      setLinkError(result?.error ?? t(T.ci.unrecognizedLink, lang as any));
      return;
    }
    const platformIds: Record<string, string> = result.platform_ids ?? (result.platform && result.identifier ? { [result.platform]: result.identifier } : {});
    const brandName = result.brand_name ?? '';
    setLinkResult({ platform: result.platform ?? '', brandName, platformIds });
    // If brand name couldn't be extracted, prompt user
    if (!brandName) setLinkBrandInput('');
  }

  function handleConfirmLink() {
    if (!linkResult) return;
    const finalBrandName = linkResult.brandName || linkBrandInput.trim();
    if (!finalBrandName) return;
    onAdd({
      id: crypto.randomUUID(),
      brand_name: finalBrandName,
      tier: watchlistCount < MAX_WATCHLIST ? 'watchlist' : 'landscape',
      platform_ids: linkResult.platformIds,
      added_via: 'link_paste',
      created_at: new Date().toISOString(),
    });
    setLinkInput('');
    setLinkResult(null);
    setLinkBrandInput('');
  }

  // ── AI tab state ────────────────────────────────────────────────
  const [aiSuggestions, setAiSuggestions] = useState<CompetitorSuggestion[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLoaded, setAiLoaded] = useState(false);
  const [aiError, setAiError] = useState('');

  async function loadAiSuggestions() {
    const ws = getCIWorkspace();
    if (!ws?.brand_name) return;
    setAiLoading(true);
    setAiError('');
    try {
      const result = await suggestCompetitors(ws.brand_name, ws.brand_category, ws.price_range);
      setAiSuggestions(result?.suggestions ?? []);
      if (!result?.suggestions?.length) {
        setAiError(t(T.ci.suggestionsUnavailable, lang as any));
      }
    } catch {
      setAiError(t(T.ci.suggestionsUnavailable, lang as any));
    }
    setAiLoading(false);
    setAiLoaded(true);
  }
  // No auto-load — user must click "Generate Suggestions" button (TASK-32)

  const trackedNames = new Set(competitors.map(c => c.brand_name));
  const workspace = getCIWorkspace();

  const inputStyle: CSSProperties = {
    background: C.inputBg,
    border: `1px solid ${C.inputBd}`,
    borderRadius: 8,
    padding: '10px 14px',
    color: C.tx,
    fontSize: 14,
    flex: 1,
    outline: 'none',
  };

  const tabs = [
    { key: 'name' as const, label: t(T.ci.typeName, lang as any) },
    { key: 'link' as const, label: t(T.ci.pasteLink, lang as any) },
    { key: 'ai' as const, label: t(T.ci.aiSuggestions, lang as any) },
  ];

  function groupLabel(group: CompetitorSuggestion['group']): string {
    if (group === 'direct') return t(T.ci.directCompetitor, lang as any);
    if (group === 'aspirational') return t(T.ci.aspirational, lang as any);
    return t(T.ci.emergingThreat, lang as any);
  }

  function priorityColor(priority: CompetitorSuggestion['priority']): string {
    if (priority === 'high') return C.danger;
    if (priority === 'medium') return '#f59e0b';
    return C.t3;
  }

  return (
    <div style={{ marginBottom: 20 }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, borderBottom: `1px solid ${C.bd}` }}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setError(''); }}
            style={{
              padding: '8px 16px', border: 'none',
              borderBottom: activeTab === tab.key ? `2px solid ${C.ac}` : '2px solid transparent',
              background: 'transparent',
              color: activeTab === tab.key ? C.ac : C.t2,
              fontWeight: activeTab === tab.key ? 600 : 400,
              fontSize: 13, cursor: 'pointer',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Name with autocomplete ────────────────────────── */}
      {activeTab === 'name' && (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Input wrapper — relative for dropdown */}
            <div ref={nameDropRef} style={{ flex: 1, position: 'relative' }}>
              <input
                style={inputStyle}
                value={nameInput}
                onChange={e => { setNameInput(e.target.value); setResolvedPlatformIds({}); setResolveSource(null); }}
                placeholder={lang === 'zh' ? '输入品牌名，如 Songmont、古良吉吉' : 'Brand name, e.g. Songmont, 古良吉吉'}
                onKeyDown={e => e.key === 'Enter' && !showNameDrop && handleAddName()}
                onFocus={() => nameSuggestions.length > 0 && setShowNameDrop(true)}
                autoComplete="off"
              />
              {/* Autocomplete dropdown */}
              {showNameDrop && nameSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                  background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 8,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.12)', marginTop: 4,
                  maxHeight: 200, overflowY: 'auto',
                }}>
                  {nameSuggestions.map((brand, i) => (
                    <div
                      key={i}
                      onMouseDown={() => selectNameSuggestion(brand)}
                      style={{
                        padding: '10px 14px', cursor: 'pointer',
                        borderBottom: i < nameSuggestions.length - 1 ? `1px solid ${C.bd}` : 'none',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = C.s2)}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <div style={{ fontWeight: 600, fontSize: 14, color: C.tx }}>{brand.brand_name}</div>
                      <div style={{ fontSize: 12, color: C.t2, marginTop: 2 }}>
                        {brand.badge ? `${brand.badge} · ` : ''}
                        {brand.source === 'default' ? t(T.ci.newBrand, lang as any) : t(T.ci.knownBrand, lang as any)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleAddName}
              disabled={nameAdding}
              style={{
                background: nameAdding ? C.t3 : C.ac, border: 'none', borderRadius: 8,
                padding: '10px 20px', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: nameAdding ? 'default' : 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {nameAdding ? '…' : t(T.ci.addCompetitor, lang as any)}
            </button>
          </div>

          {/* Resolution feedback */}
          {resolveSource && nameInput && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <span style={{
                fontSize: 11, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
                background: resolveSource === 'default' ? C.s2 : `${C.success}18`,
                color: resolveSource === 'default' ? C.t3 : C.success,
                border: `1px solid ${resolveSource === 'default' ? C.bd : C.success}44`,
              }}>
                {resolveSource === 'default' ? t(T.ci.newBrand, lang as any) : t(T.ci.knownBrand, lang as any)}
              </span>
              {Object.entries(resolvedPlatformIds).map(([plat, id]) => (
                <span key={plat} style={{ fontSize: 11, color: C.t3 }}>{plat}: {id}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Paste Link ────────────────────────────────────── */}
      {activeTab === 'link' && (
        <div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={inputStyle}
              value={linkInput}
              onChange={e => { setLinkInput(e.target.value); setLinkResult(null); setLinkError(''); }}
              placeholder={lang === 'zh' ? '粘贴小红书/淘宝/抖音/京东链接' : 'Paste a 小红书, 淘宝, 抖音, or 京东 URL'}
              onKeyDown={e => e.key === 'Enter' && handleParseLink()}
            />
            <button
              onClick={handleParseLink}
              disabled={linkParsing}
              style={{
                background: linkParsing ? C.t3 : C.ac, border: 'none', borderRadius: 8,
                padding: '10px 20px', color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: linkParsing ? 'default' : 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {linkParsing && (
                <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx={12} cy={12} r={10} strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              )}
              {linkParsing ? t(T.ci.detecting, lang as any) : t(T.ci.addCompetitor, lang as any)}
            </button>
          </div>

          {/* Parse result */}
          {/* Confirmation card with "Confirm & Track" */}
          {linkResult && (
            <div style={{
              marginTop: 10, padding: '14px 16px',
              background: `${C.success}10`, border: `1px solid ${C.success}44`, borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <svg width={14} height={14} viewBox="0 0 12 12" fill="none">
                  <circle cx={6} cy={6} r={6} fill={C.success} />
                  <polyline points="2.5,6 5,8.5 9.5,3.5" stroke="#fff" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span style={{ fontSize: 13, color: C.success, fontWeight: 600 }}>
                  {t(T.ci.foundOn, lang as any)}:
                </span>
                {linkResult.platform && (
                  <span style={{
                    background: PLATFORM_COLORS[linkResult.platform] ?? C.ac,
                    color: '#fff', padding: '1px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                  }}>
                    {PLATFORM_LABELS[linkResult.platform] ?? linkResult.platform}
                  </span>
                )}
                {linkResult.brandName && (
                  <span style={{ fontSize: 13, color: C.tx, fontWeight: 600 }}>{linkResult.brandName}</span>
                )}
              </div>

              {/* Brand name input if unknown */}
              {!linkResult.brandName && (
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, color: C.t2, display: 'block', marginBottom: 4 }}>
                    {t(T.ci.whatBrandName, lang as any)}
                  </label>
                  <input
                    style={{ ...inputStyle, fontSize: 13 }}
                    value={linkBrandInput}
                    onChange={e => setLinkBrandInput(e.target.value)}
                    placeholder={lang === 'zh' ? '输入品牌名称' : 'Enter brand name'}
                    autoFocus
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleConfirmLink}
                  disabled={!linkResult.brandName && !linkBrandInput.trim()}
                  style={{
                    background: (!linkResult.brandName && !linkBrandInput.trim()) ? C.t3 : C.ac,
                    border: 'none', borderRadius: 8, padding: '8px 18px',
                    color: '#fff', fontSize: 13, fontWeight: 600,
                    cursor: (!linkResult.brandName && !linkBrandInput.trim()) ? 'default' : 'pointer',
                  }}
                >
                  {t(T.ci.confirmTrack, lang as any)}
                </button>
                <button
                  onClick={() => { setLinkResult(null); setLinkBrandInput(''); }}
                  style={{
                    background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 8,
                    padding: '8px 18px', color: C.t2, fontSize: 13, cursor: 'pointer',
                  }}
                >
                  {lang === 'zh' ? '取消' : 'Cancel'}
                </button>
              </div>
            </div>
          )}

          {/* Parse error — unrecognized URL + example links */}
          {linkError && (
            <div style={{
              marginTop: 10, padding: '12px 16px',
              background: `${C.danger}08`, border: `1px solid ${C.danger}33`, borderRadius: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <svg width={14} height={14} viewBox="0 0 12 12" fill="none">
                  <circle cx={6} cy={6} r={6} fill={C.danger} />
                  <line x1={4} y1={4} x2={8} y2={8} stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
                  <line x1={8} y1={4} x2={4} y2={8} stroke="#fff" strokeWidth={1.5} strokeLinecap="round" />
                </svg>
                <span style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>{linkError}</span>
                <button onClick={() => setLinkError('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: C.t3, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>
              </div>
              <p style={{ fontSize: 12, color: C.t2, margin: '0 0 6px' }}>{t(T.ci.tryPasting, lang as any)}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {['xiaohongshu.com', 'douyin.com', 'item.taobao.com', 'item.jd.com'].map(d => (
                  <code key={d} style={{ fontSize: 11, background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 4, padding: '2px 6px', color: C.t3 }}>{d}</code>
                ))}
              </div>
            </div>
          )}

          {!linkResult && !linkError && (
            <p style={{ fontSize: 12, color: C.t3, marginTop: 6, marginBottom: 0 }}>
              {lang === 'zh' ? '我们将自动识别平台和品牌' : "We'll automatically detect the platform and brand"}
            </p>
          )}
        </div>
      )}

      {/* ── Tab: AI Suggestions ────────────────────────────────── */}
      {activeTab === 'ai' && (
        <div>
          {!workspace?.brand_name ? (
            <div style={{
              padding: '28px 20px', background: C.s2, borderRadius: 10, fontSize: 13,
              color: C.t3, textAlign: 'center', border: `1px solid ${C.bd}`,
            }}>
              <div style={{ fontSize: 22, marginBottom: 8 }}>👆</div>
              {t(T.ci.setupBrandFirst, lang as any)}
            </div>
          ) : aiLoading ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.t2, marginBottom: 12 }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }}>
                  <circle cx={12} cy={12} r={10} strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
                <span>{t(T.ci.loadingSuggestions, lang as any)}</span>
                <span style={{ color: C.t3, fontSize: 12 }}>— {t(T.ci.generatingTakes, lang as any)}</span>
              </div>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  height: 80, background: C.s2, borderRadius: 10, marginBottom: 10,
                  animation: 'shimmer 1.4s ease-in-out infinite',
                  opacity: 1 - i * 0.15,
                }} />
              ))}
            </div>
          ) : aiError ? (
            <div style={{
              padding: '24px 20px', textAlign: 'center',
              background: `${C.danger}08`, border: `1px solid ${C.danger}22`, borderRadius: 10,
            }}>
              <div style={{ fontSize: 14, color: C.t2, marginBottom: 16 }}>{aiError}</div>
              <button
                onClick={loadAiSuggestions}
                style={{
                  background: C.ac, border: 'none', borderRadius: 8,
                  padding: '9px 20px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t(T.ci.refreshSuggestions, lang as any)}
              </button>
            </div>
          ) : aiSuggestions.length > 0 ? (
            <div>
              {/* Header */}
              <div style={{ fontSize: 13, color: C.t2, marginBottom: 12 }}>
                {t(T.ci.aiRecommends, lang as any)}{' '}
                <strong style={{ color: C.tx }}>{workspace.brand_name}</strong>
                {workspace.brand_category && ` (${workspace.brand_category}`}
                {workspace.price_range?.min ? `, ¥${workspace.price_range.min}–${workspace.price_range.max})` : workspace.brand_category ? ')' : ''}
              </div>

              {/* Suggestion cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {aiSuggestions.map((s, i) => {
                  const isTracked = trackedNames.has(s.brand_name);
                  const pColor = priorityColor(s.priority);
                  return (
                    <div key={i} style={{
                      display: 'flex', gap: 12, alignItems: 'flex-start',
                      padding: '14px 16px', background: C.s2, borderRadius: 10,
                      border: `1px solid ${C.bd}`,
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 700, fontSize: 14, color: C.tx }}>{s.brand_name}</span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 4,
                            background: `${pColor}18`, color: pColor, border: `1px solid ${pColor}44`,
                            textTransform: 'uppercase' as CSSProperties['textTransform'], letterSpacing: '0.05em',
                          }}>
                            {s.priority.toUpperCase()}
                          </span>
                          <span style={{
                            fontSize: 10, color: C.t2, background: C.s1,
                            border: `1px solid ${C.bd}`, borderRadius: 4, padding: '1px 6px',
                          }}>
                            {groupLabel(s.group)}
                          </span>
                          {s.badge && <span style={{ fontSize: 11, color: C.t3 }}>{s.badge}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>{s.reason}</div>
                      </div>
                      {isTracked ? (
                        <span style={{ fontSize: 12, color: C.success, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {t(T.ci.alreadyTracking, lang as any)}
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            onAdd({
                              id: crypto.randomUUID(),
                              brand_name: s.brand_name,
                              tier: watchlistCount < MAX_WATCHLIST ? 'watchlist' : 'landscape',
                              platform_ids: s.platform_ids ?? {},
                              added_via: 'ai_suggestion',
                              created_at: new Date().toISOString(),
                            });
                          }}
                          style={{
                            background: C.ac, border: 'none', borderRadius: 6,
                            padding: '6px 14px', color: '#fff', fontSize: 12,
                            fontWeight: 600, cursor: 'pointer', flexShrink: 0,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          + {lang === 'zh' ? '添加' : 'Add'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Refresh button */}
              <button
                onClick={loadAiSuggestions}
                style={{
                  background: 'transparent', border: `1px solid ${C.bd}`,
                  borderRadius: 8, padding: '8px 18px', color: C.t2,
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                {t(T.ci.refreshSuggestions, lang as any)}
              </button>
            </div>
          ) : (
            /* Not yet loaded — show manual generate button */
            <div style={{
              padding: '32px 20px', textAlign: 'center',
              background: C.s2, borderRadius: 12, border: `1px solid ${C.bd}`,
            }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.tx, marginBottom: 6 }}>
                {lang === 'zh' ? 'AI竞品推荐' : 'AI Competitor Suggestions'}
              </div>
              <div style={{ fontSize: 13, color: C.t2, marginBottom: 20, lineHeight: 1.6 }}>
                {lang === 'zh'
                  ? `根据 ${workspace.brand_name} 的品类和价格带，AI将为您推荐值得关注的竞品。`
                  : `Based on ${workspace.brand_name}'s category and price range, AI will suggest competitors worth tracking.`}
              </div>
              <button
                onClick={loadAiSuggestions}
                style={{
                  background: C.ac, border: 'none', borderRadius: 8,
                  padding: '11px 28px', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                ✨ {t(T.ci.generateSuggestions, lang as any)}
              </button>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 10 }}>
                {t(T.ci.generatingTakes, lang as any)}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes shimmer { 0%,100% { opacity: 0.5; } 50% { opacity: 0.85; } }
      `}</style>

      {error && <p style={{ color: C.danger, fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>}
    </div>
  );
}

// ── Competitor list ───────────────────────────────────────────────
function CompetitorList({ C, lang, competitors, onChange, isMobile }: {
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  competitors: CICompetitor[];
  onChange: (updated: CICompetitor[]) => void;
  isMobile: boolean;
}) {
  function remove(id: string) {
    onChange(competitors.filter(c => c.id !== id));
  }

  if (competitors.length === 0) {
    return (
      <p style={{ color: C.t3, fontSize: 14, margin: '12px 0 0' }}>
        {lang === 'zh' ? '还没有竞品，请在上方添加。' : 'No competitors added yet. Add one above.'}
      </p>
    );
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
          border: `1px solid ${C.bd}`,
          borderRadius: 8,
          fontSize: 13,
        }}>
          {/* Brand name + platform keyword labels */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{c.brand_name}</span>
            {Object.keys(c.platform_ids).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {Object.entries(c.platform_ids).map(([plat, id]) => (
                  <span key={plat} style={{ fontSize: 11, color: C.t3 }}>
                    <span style={{ color: PLATFORM_COLORS[plat] ?? C.ac, fontWeight: 600 }}>{PLATFORM_LABELS[plat] ?? plat}</span>: {id}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* "Tracking" status pill — replaces tier toggle (TASK-32) */}
          <span style={{
            fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
            background: `${C.success}18`, color: C.success, border: `1px solid ${C.success}44`,
            flexShrink: 0,
          }}>
            ✓ {t(T.ci.tracking, lang as any)}
          </span>

          {/* Added date — hidden on mobile */}
          {!isMobile && (
            <span style={{ color: C.t3, fontSize: 11, whiteSpace: 'nowrap' }}>
              {new Date(c.created_at).toLocaleDateString()}
            </span>
          )}

          {/* Remove — 44px touch target on mobile */}
          <button
            onClick={() => remove(c.id)}
            style={{
              background: 'none', border: 'none', color: C.t3, cursor: 'pointer',
              fontSize: 18, padding: '0 8px', lineHeight: 1,
              minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
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
// Cookie connection UI removed for beta. See TASK-17 for backend. Bring back with browser extension in v2.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ConnectionsSection({ C, lang, isMobile }: { C: ReturnType<typeof useApp>['colors']; lang: string; isMobile: boolean }) {
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
                    style={{ background: C.ac, border: 'none', borderRadius: 8, padding: '8px 18px', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}
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
            display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000,
          }} onClick={() => setModalPlatform(null)}>
            <div style={{
              background: C.s1, border: `1px solid ${C.bd}`,
              borderRadius: isMobile ? '14px 14px 0 0' : 14,
              padding: isMobile ? '24px 20px 32px' : 28,
              maxWidth: isMobile ? '100%' : 480,
              width: isMobile ? '100%' : '90%',
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
                  width: '100%', minHeight: isMobile ? 120 : 100, background: C.inputBg,
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

// ── Start Analysis card ───────────────────────────────────────────
function StartAnalysisCard({ C, lang, competitorCount, workspaceName, isMobile }: {
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  competitorCount: number;
  workspaceName: string;
  isMobile: boolean;
}) {
  const [starting, setStarting] = useState(false);

  const [startError, setStartError] = useState('');

  async function handleStart() {
    setStarting(true);
    setStartError('');

    // Step 1: Get or create workspace on API
    let ws = await getWorkspace();
    let wsId = ws.data?.id;

    // If workspace only exists locally, sync it to the API first
    if (!wsId || wsId === 'local') {
      const localWs = getCIWorkspace();
      if (localWs?.brand_name) {
        console.log('[CI] Workspace is local-only, syncing to API...');
        const apiWs = await saveWorkspace({
          brand_name: localWs.brand_name,
          brand_category: localWs.brand_category || null,
          brand_price_range: localWs.price_range || null,
          brand_platforms: null,
        });
        if (apiWs && apiWs.id && apiWs.id !== 'local') {
          wsId = apiWs.id;
          console.log(`[CI] Workspace synced to API: ${wsId}`);

          // Sync competitors to API workspace
          const localComps = getCICompetitors();
          for (const comp of localComps) {
            await addCompetitor({
              workspace_id: wsId,
              brand_name: comp.brand_name,
              tier: comp.tier,
              platform_ids: comp.platform_ids || {},
              added_via: comp.added_via || 'manual',
            });
          }
          console.log(`[CI] Synced ${localComps.length} competitors to API`);
        }
      }
    }

    // Step 2: Verify we have a real workspace ID
    if (!wsId || wsId === 'local') {
      console.error('[CI] Cannot start analysis: workspace not synced to API');
      setStartError(lang === 'zh'
        ? '无法连接后端服务器，请检查网络连接后重试。'
        : 'Cannot connect to backend server. Please check your connection and try again.');
      setStarting(false);
      return;
    }

    // Step 3: Start the tracked analysis job
    const job = await runAnalysis(wsId);
    if (!job || !job.job_id) {
      console.error('[CI] runAnalysis returned null — backend may be unreachable or no competitors in DB');
      setStartError(lang === 'zh'
        ? '启动分析失败。请确认已添加竞品，并检查网络连接。'
        : 'Failed to start analysis. Make sure competitors are added and check your connection.');
      setStarting(false);
      return;
    }

    localStorage.setItem('rebase_ci_analysis_job_id', job.job_id);
    console.log(`[CI] Analysis job started: ${job.job_id}`);

    // Fire off deep dives for each tracked competitor (fire and forget)
    const comps = getCICompetitors();
    for (const comp of comps) {
      requestDeepDive(wsId, comp.brand_name).catch(() => {});
    }

    localStorage.setItem('rebase_ci_analysis_started', 'true');
    window.location.href = '/ci';
  }

  const workspace = getCIWorkspace();
  const priceMin = workspace?.price_range?.min;
  const priceMax = workspace?.price_range?.max;
  const priceLabel = priceMin && priceMax ? `, ¥${priceMin}–${priceMax}` : '';
  const catLabel = workspace?.brand_category ? `, ${workspace.brand_category}` : '';

  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.s1} 0%, ${C.s2} 100%)`,
      border: `2px solid ${C.ac}44`,
      borderRadius: 16,
      padding: isMobile ? '20px 16px' : '28px 32px',
      marginBottom: 24,
      textAlign: 'center',
    }}>
      {/* Status checks */}
      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 6, marginBottom: 20, textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.success }}>
          <span>✓</span>
          <span>
            {lang === 'zh' ? '品牌档案：' : 'Brand profile: '}
            <strong>{workspaceName}{catLabel}{priceLabel}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.success }}>
          <span>✓</span>
          <span>
            <strong>{competitorCount}</strong>
            {lang === 'zh' ? ' 个竞品已加入追踪' : ` competitor${competitorCount === 1 ? '' : 's'} tracked`}
          </span>
        </div>
      </div>

      <p style={{ fontSize: 14, color: C.tx, marginBottom: 20, lineHeight: 1.7, maxWidth: 480, margin: '0 auto 20px' }}>
        {t(T.ci.readyToAnalyze, lang as any)}
      </p>

      <button
        onClick={handleStart}
        disabled={starting}
        style={{
          background: starting ? C.t3 : C.ac,
          border: 'none', borderRadius: 10, padding: '13px 32px',
          color: '#fff', fontSize: 16, fontWeight: 700,
          cursor: starting ? 'default' : 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          boxShadow: starting ? 'none' : `0 4px 14px ${C.ac}44`,
        }}
      >
        {starting ? (lang === 'zh' ? '启动中...' : 'Starting...') : t(T.ci.startAnalysis, lang as any)}
      </button>

      <p style={{ fontSize: 12, color: C.t3, marginTop: 12, marginBottom: 0 }}>
        {t(T.ci.takesAbout, lang as any)}
      </p>

      {startError && (
        <div style={{
          marginTop: 16, padding: '10px 16px', borderRadius: 8,
          background: `${C.danger || '#ef4444'}12`, border: `1px solid ${C.danger || '#ef4444'}44`,
          color: C.danger || '#ef4444', fontSize: 13, textAlign: 'left',
        }}>
          ✗ {startError}
        </div>
      )}
    </div>
  );
}

// ── Reset Data Section ───────────────────────────────────────────
function ResetDataSection({ C, lang, onReset }: {
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  onReset: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  function handleReset() {
    // Clear all CI localStorage keys
    localStorage.removeItem('rebase_ci_workspace');
    localStorage.removeItem('rebase_ci_competitors');
    localStorage.removeItem('rebase_ci_connections');
    localStorage.removeItem('rebase_ci_analysis_started');
    localStorage.removeItem('rebase_ci_analysis_job_id');
    localStorage.removeItem('rebase_ci_welcome_dismissed');
    localStorage.removeItem('rebase_ci_last_visit');
    // Notify parent + other listeners
    onReset();
    window.dispatchEvent(new CustomEvent('ci-data-updated'));
    setConfirming(false);
    // Redirect to fresh settings
    window.location.href = '/ci/settings';
  }

  return (
    <Section title={lang === 'zh' ? '重置数据' : 'Reset Data'} C={C}>
      <p style={{ fontSize: 13, color: C.t2, lineHeight: 1.7, marginTop: 0, marginBottom: 16 }}>
        {lang === 'zh'
          ? '清除所有本地保存的品牌资料、竞品列表和分析状态，重新开始设置。此操作不可撤销。'
          : 'Clear all locally saved brand profile, competitor list, and analysis state. Start fresh. This cannot be undone.'}
      </p>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{
            background: 'transparent',
            border: `1px solid ${C.danger}`,
            color: C.danger,
            padding: '8px 20px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {lang === 'zh' ? '重置所有CI数据' : 'Reset All CI Data'}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: C.danger, fontWeight: 600 }}>
            {lang === 'zh' ? '确定要重置吗？' : 'Are you sure?'}
          </span>
          <button
            onClick={handleReset}
            style={{
              background: C.danger,
              border: 'none',
              color: '#fff',
              padding: '8px 20px',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {lang === 'zh' ? '确认重置' : 'Yes, Reset'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            style={{
              background: 'transparent',
              border: `1px solid ${C.bd}`,
              color: C.t2,
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
        </div>
      )}
    </Section>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function CISettings() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const [competitors, setCompetitors] = useState<CICompetitor[]>(getCICompetitors());
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);
  // Brief skeleton on first mount so the page feels consistent with other CI pages
  const [ready, setReady] = useState(false);
  useEffect(() => { const timer = setTimeout(() => setReady(true), 200); return () => clearTimeout(timer); }, []);

  if (!ready) return <CISettingsSkeleton />;

  function handleAddCompetitor(c: CICompetitor) {
    const updated = [...competitors, c];
    setCompetitors(updated);
    saveCICompetitors(updated);
    // Show "Now tracking" toast for 2s
    setRecentlyAdded(c.brand_name);
    setTimeout(() => setRecentlyAdded(null), 2000);
  }

  function handleCompetitorsChange(updated: CICompetitor[]) {
    setCompetitors(updated);
    saveCICompetitors(updated);
  }

  const workspace = getCIWorkspace();
  const analysisStarted = localStorage.getItem('rebase_ci_analysis_started') === 'true';
  const showStartCard = !!(workspace?.brand_name) && competitors.length > 0 && !analysisStarted;

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: isMobile ? '16px 12px' : '32px 24px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <CISubNav />

        <div style={{ marginBottom: isMobile ? 20 : 28 }}>
          <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, marginBottom: 8, marginTop: 0 }}>
            {t(T.ci.settings, lang)}
          </h1>
          <p style={{ color: C.t2, fontSize: 15, margin: 0 }}>
            {t(T.ci.subtitle, lang)}
          </p>
        </div>

        {/* 1 — Brand Profile */}
        <BrandProfileSection C={C} lang={lang} isMobile={isMobile} />

        {/* 2 — My Competitors (renamed from "Manage Competitors") */}
        <Section title={t(T.ci.myCompetitors, lang as any)} C={C}>
          <AddCompetitorSection
            C={C}
            lang={lang}
            competitors={competitors}
            onAdd={handleAddCompetitor}
          />

          {/* "Now tracking" toast */}
          {recentlyAdded && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', background: `${C.success}15`,
              border: `1px solid ${C.success}44`, borderRadius: 8,
              marginBottom: 12, fontSize: 13, color: C.success, fontWeight: 600,
            }}>
              <span>✓</span>
              <span>{t(T.ci.nowTracking, lang as any)}: <strong>{recentlyAdded}</strong></span>
            </div>
          )}

          <CompetitorList
            C={C}
            lang={lang}
            competitors={competitors}
            onChange={handleCompetitorsChange}
            isMobile={isMobile}
          />
        </Section>

        {/* 3 — Start Analysis card (shown when ready) */}
        {showStartCard && (
          <StartAnalysisCard
            C={C}
            lang={lang}
            competitorCount={competitors.length}
            workspaceName={workspace!.brand_name}
            isMobile={isMobile}
          />
        )}

        {/* 4 — Platform Connections: removed for beta (TASK-32) */}
        {/* Cookie connection UI removed for beta. See TASK-17 for backend. Bring back with browser extension in v2. */}
        {/* <ConnectionsSection C={C} lang={lang} isMobile={isMobile} /> */}

        {/* 5 — Reset All Data */}
        <ResetDataSection C={C} lang={lang} onReset={() => {
          setCompetitors([]);
        }} />
      </div>
    </div>
  );
}
