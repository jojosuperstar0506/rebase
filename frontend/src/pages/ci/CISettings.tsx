import { useState, useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  MousePointerClick, Bot, Sparkles, Pencil,
  CheckCircle2, Circle,
} from 'lucide-react';
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
  requestDeepDive, getWorkspace, runAnalysis, saveWorkspace,
  addCompetitor, removeCompetitor, getCompetitors,
  type BrandResolution, type CompetitorSuggestion,
} from '../../services/ciApi';
import { categoryLabel } from '../../utils/categoryLabels';
import { CATEGORY_TAXONOMY } from '../../data/categoryTaxonomy';

// Category + platform values stay Chinese — they're foreign keys into the
// pipeline's INDEX_HIERARCHY weighting + scraper routing. The label is the
// only thing that switches with lang. The value never gets translated, or
// the backend's category-keyed lookups silently return zero rows.
// Category options now come from the shared two-level taxonomy
// (src/data/categoryTaxonomy.ts) — see the grouped <select> in
// BrandProfileSection. The old flat CATEGORIES list was bags-only.
const PLATFORM_OPTIONS: { value: string; label: { en: string; zh: string } }[] = [
  { value: '淘宝/天猫', label: { en: 'Taobao / Tmall', zh: '淘宝/天猫' } },
  { value: '京东',      label: { en: 'JD',             zh: '京东' } },
  { value: '小红书',    label: { en: 'Xiaohongshu',    zh: '小红书' } },
  { value: '抖音',      label: { en: 'Douyin',         zh: '抖音' } },
];
const MAX_WATCHLIST = 10;

// Reject inputs that aren't a real brand name. We saw production rows with
// brand_name = "XHS: 5d1c0475000000001203c34b" — the user typed/accepted the
// platform identifier as a name, and the scraper then can't find the brand
// because brand-keyed analysis lookups never match. Catches: "XHS: <id>"
// style prefixed strings, raw 16+ char hex IDs (XHS UIDs), and 14+ digit
// numeric IDs (Douyin sec_uid / Taobao shop ids).
function looksLikePlatformId(s: string): boolean {
  const t = s.trim();
  if (!t) return false;
  if (/^(xhs|douyin|taobao|tmall|jd|京东|淘宝|抖音|小红书)\s*[:：]\s*\S+/i.test(t)) return true;
  if (/^[a-f0-9]{16,}$/i.test(t)) return true;
  if (/^\d{14,}$/.test(t)) return true;
  return false;
}

// Inverse of the parser in backend/server.js — given a stored platform_id
// (which is what we end up with for badly-named legacy rows), rebuild a URL
// that the backend's POST /api/ci/parse-link can chew on so its DB lookup +
// registry + og:title chain has a chance of recovering the real name. Best
// guess per platform; returns null if we can't form a reasonable URL.
function reconstructPlatformUrl(platform: string, identifier: string): string | null {
  if (!platform || !identifier) return null;
  switch (platform) {
    case 'xhs':    return `https://www.xiaohongshu.com/user/profile/${identifier}`;
    case 'douyin': return `https://www.douyin.com/user/${identifier}`;
    case 'taobao':
      // Numeric → shop search; otherwise treat as subdomain
      if (/^\d+$/.test(identifier)) return `https://shop.taobao.com/?id=${identifier}`;
      return `https://${identifier}.taobao.com`;
    case 'tmall':  return `https://${identifier}.tmall.com`;
    case 'jd':     return `https://mall.jd.com/index-${identifier}.html`;
    default: return null;
  }
}

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
      <h2 style={{
        fontSize: 12, fontWeight: 600, marginBottom: 20, marginTop: 0,
        fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
        textTransform: 'uppercase', color: C.t3,
      }}>
        // {title}
      </h2>
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
  const [saving, setSaving] = useState(false);

  // Hydrate from the API on mount. The onboarding wizard writes the brand
  // profile to the DB (workspaces table), not localStorage — so a freshly-
  // onboarded user would otherwise see this form blank. localStorage stays
  // the synchronous initial value; the API result overrides it when present.
  useEffect(() => {
    getWorkspace()
      .then((ws) => {
        if (ws.source !== 'api' || !ws.data) return;
        const d = ws.data as Record<string, any>;
        setForm({
          brand_name: d.brand_name ?? '',
          brand_category: d.brand_category ?? '',
          price_range: d.brand_price_range ?? { min: 0, max: 0 },
          platforms: d.brand_platforms ? Object.keys(d.brand_platforms) : [],
        });
        // Keep localStorage in sync so other synchronous readers agree.
        saveCIWorkspace({
          brand_name: d.brand_name ?? '',
          brand_category: d.brand_category ?? '',
          price_range: d.brand_price_range ?? { min: 0, max: 0 },
          platforms: d.brand_platforms ? Object.keys(d.brand_platforms) : [],
        });
      })
      .catch(() => {});
  }, []);

  function togglePlatform(p: string) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }));
  }

  async function handleSave() {
    setSaving(true);
    // Local first so reads inside this session are immediate even if API is down.
    saveCIWorkspace(form);
    // Push to API so the workspace pill (which reads from /workspace/me via
    // useCIData) reflects the new brand name across every CI page. Without
    // this, the pill stays stale and "Save" only updates localStorage.
    if (form.brand_name && form.brand_category) {
      // W7 split: saveWorkspace dispatches to PATCH when an id is passed,
      // POST otherwise. We need to PATCH the existing workspace, not create
      // a new one — so look up the current workspace's id first.
      const current = await getWorkspace();
      const existingId = current.data?.id && current.data.id !== 'local' ? current.data.id : undefined;
      await saveWorkspace({
        ...(existingId ? { id: existingId } : {}),
        brand_name: form.brand_name,
        brand_category: form.brand_category,
        brand_price_range: form.price_range,
        brand_platforms: form.platforms.length ? Object.fromEntries(form.platforms.map(p => [p, ''])) : null,
      });
      // Force useCIData to refetch so WorkspaceSwitcher updates immediately
      window.dispatchEvent(new CustomEvent('ci-data-updated'));
    }
    setSaving(false);
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

  const labelStyle = { fontSize: 11, fontWeight: 500, color: C.t3, marginBottom: 6, display: 'block', textTransform: 'uppercase' as const, letterSpacing: '0.12em', fontFamily: 'var(--font-mono)' };

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

        {/* Category — two-level taxonomy, grouped by major category */}
        <div>
          <label style={labelStyle}>{t(T.ci.category, lang as any)}</label>
          <select
            style={{ ...inputStyle, cursor: 'pointer' }}
            value={form.brand_category}
            onChange={e => setForm(f => ({ ...f, brand_category: e.target.value }))}
          >
            <option value="">-- select --</option>
            {CATEGORY_TAXONOMY.map(major => (
              <optgroup key={major.value} label={lang === 'zh' ? major.zh : major.en}>
                {major.subcategories.map(sub => (
                  <option key={sub.value} value={sub.value}>
                    {lang === 'zh' ? sub.zh : sub.en}
                  </option>
                ))}
              </optgroup>
            ))}
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
              const checked = form.platforms.includes(p.value);
              return (
                <label key={p.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePlatform(p.value)}
                    style={{ accentColor: C.ac }}
                  />
                  {p.label[lang as 'en' | 'zh'] ?? p.label.en}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: 20,
          background: saving ? C.t3 : (savedOk ? C.success : C.ac),
          border: 'none',
          borderRadius: 8,
          padding: '10px 24px',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
          cursor: saving ? 'default' : 'pointer',
          minHeight: 44,
          width: isMobile ? '100%' : undefined,
        }}
      >
        {saving ? (lang === 'zh' ? '保存中…' : 'Saving…') : (savedOk ? t(T.ci.saved, lang as any) : t(T.ci.saveBrand, lang as any))}
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
  // All three tabs (Type Name / Paste Link / AI Suggestions) are exposed.
  // The earlier setting hid Type Name + Paste Link in favour of AI-only
  // onboarding, but that left users stranded when the AI tab gated on
  // workspace.brand_name (which is stale across CI page renders — see fix
  // in CISettings parent below). Restoring all three gives the user a
  // working manual fallback even when AI is loading or empty.
  const SHOW_MANUAL_TABS = true;
  const [activeTab, setActiveTab] = useState<'name' | 'link' | 'ai'>(SHOW_MANUAL_TABS ? 'name' : 'ai');
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
    // Guard against the API returning platform_ids: null (the DB column is
    // nullable even though the TS type is non-nullable). Without this guard,
    // Object.entries(null) throws "Cannot convert undefined or null to object".
    setResolvedPlatformIds(
      Object.fromEntries(
        Object.entries(brand.platform_ids || {}).filter(([, v]) => v != null)
      ) as Record<string, string>
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
    } else if (looksLikePlatformId(raw)) {
      setNameAdding(false);
      setError(lang === 'zh'
        ? '看起来你输入的是平台 ID（如 XHS UID），不是品牌名称。请在「粘贴链接」标签页粘贴完整 URL，或直接输入品牌名。'
        : 'That looks like a platform ID (e.g. an XHS UID), not a brand name. Try the "Paste Link" tab with a full URL, or type the brand name directly.');
      return;
    } else if (Object.keys(platformIds).length === 0) {
      const resolved = await resolveBrand(name);
      if (resolved) {
        // Guard against API returning platform_ids: null (DB column nullable).
        platformIds = Object.fromEntries(
          Object.entries(resolved.platform_ids || {}).filter(([, v]) => v != null)
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
    if (!result || !result.parsed) {
      setLinkParsing(false);
      setLinkError(result?.error ?? t(T.ci.unrecognizedLink, lang as any));
      return;
    }
    const platformIds: Record<string, string> = result.platform_ids ?? (result.platform && result.identifier ? { [result.platform]: result.identifier } : {});
    let brandName = (result.brand_name ?? '').trim();
    // The backend can usually extract a brand name from product/item URLs
    // but rarely from XHS profile URLs (they require a page scrape). When
    // we got an identifier but no brand name, take a second swing via the
    // brand registry — many merchants are already in our DB by their XHS
    // UID. This is what stops "XHS: <uid>" from leaking into brand_name.
    if (!brandName && result.identifier) {
      const resolved = await resolveBrand(result.identifier);
      if (resolved && resolved.brand_name && !looksLikePlatformId(resolved.brand_name)) {
        brandName = resolved.brand_name;
      }
    }
    setLinkParsing(false);
    setLinkResult({ platform: result.platform ?? '', brandName, platformIds });
    // If brand name couldn't be extracted, prompt user
    if (!brandName) setLinkBrandInput('');
  }

  function handleConfirmLink() {
    if (!linkResult) return;
    const finalBrandName = (linkResult.brandName || linkBrandInput.trim()).trim();
    if (!finalBrandName) return;
    if (looksLikePlatformId(finalBrandName)) {
      setLinkError(lang === 'zh'
        ? '请输入真正的品牌名称（如 "Songmont"），不是平台 ID。我们已经记下了平台 ID，你只需要给品牌起个名字。'
        : 'Please enter the actual brand name (e.g. "Songmont"), not a platform ID. We already saved the platform ID — you just need to give the brand a name.');
      return;
    }
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
    setLinkError('');
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
      const result = await suggestCompetitors(ws.brand_name, ws.brand_category, ws.price_range, lang);
      setAiSuggestions(result.suggestions);

      // Show actual cause to the user instead of a generic "unavailable"
      // banner. Backend now returns:
      //   - source='llm' + suggestions.length>0  → success, no banner
      //   - source='fallback' + suggestions      → seeded brands, optional banner
      //   - source='fallback' + empty + message  → registry has no seeded brands for this category
      //   - source='error'                       → upstream LLM/HTTP/proxy failure with message
      // The generic suggestionsUnavailable string is the last-resort fallback
      // when the backend gives us nothing actionable to show.
      if (result.source === 'error') {
        const base = t(T.ci.suggestionsUnavailable, lang as any);
        setAiError(result.message ? `${base}: ${result.message}` : base);
      } else if (result.suggestions.length === 0) {
        setAiError(result.message || t(T.ci.suggestionsUnavailable, lang as any));
      } else if (result.message) {
        // Suggestions present + message present (e.g. "showing seeded brands;
        // AI temporarily unavailable") — surface as a soft note so the user
        // knows these aren't the AI's pick. We use aiError because that's
        // the field the AI tab renders today; copy is honest, not alarming.
        setAiError(result.message);
      }
    } catch (err) {
      // Should rarely happen — suggestCompetitors catches everything itself.
      // This branch only fires on truly unexpected runtime errors (e.g. JSON
      // shape mismatch in the helper). Log and degrade.
      console.error('[CI] loadAiSuggestions threw unexpectedly:', err);
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
      {/* Tab bar — hidden while only AI Suggestions is exposed. The tab
          handlers and state above stay intact so flipping SHOW_MANUAL_TABS
          back to true in source restores Type Name + Paste Link instantly. */}
      {SHOW_MANUAL_TABS && (
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
      )}

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
              {Object.entries(resolvedPlatformIds || {}).map(([plat, id]) => (
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
              <MousePointerClick size={22} strokeWidth={1.75} color={C.t2} style={{ marginBottom: 8 }} />
              <div>{t(T.ci.setupBrandFirst, lang as any)}</div>
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
                {workspace.brand_category && ` (${categoryLabel(workspace.brand_category, lang)}`}
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
              <Bot size={28} strokeWidth={1.5} color={C.ac} style={{ marginBottom: 12 }} />
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
                <Sparkles size={14} strokeWidth={2} />
                {t(T.ci.generateSuggestions, lang as any)}
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
function CompetitorList({ C, lang, competitors, onChange, isMobile, readOnly = false }: {
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  competitors: CICompetitor[];
  onChange: (updated: CICompetitor[]) => void;
  isMobile: boolean;
  /** When true, hide rename + remove buttons. Used for demo workspaces
   *  where the curated dataset shouldn't be mutated mid-screen-recording. */
  readOnly?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [editError, setEditError] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveResult, setResolveResult] = useState<{ fixed: number; remaining: number } | null>(null);

  function remove(id: string) {
    onChange(competitors.filter(c => c.id !== id));
  }

  function startEdit(c: CICompetitor) {
    setEditingId(c.id);
    setEditValue(c.brand_name);
    setEditError('');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditValue('');
    setEditError('');
  }

  function saveEdit(id: string) {
    const next = editValue.trim();
    if (!next) return;
    if (looksLikePlatformId(next)) {
      setEditError(lang === 'zh'
        ? '请输入真正的品牌名称，不是平台 ID。'
        : 'Please enter the actual brand name, not a platform ID.');
      return;
    }
    onChange(competitors.map(c => c.id === id ? { ...c, brand_name: next } : c));
    cancelEdit();
  }

  // Bulk-resolve every row whose brand_name looks like a platform id, by
  // reconstructing a URL from the stored platform_ids and asking the backend
  // parse-link to do its DB → registry → og:title chain. Each platform_id
  // is tried in turn; the first real name wins. Cap concurrency to 4 so a
  // user with 50 bad rows doesn't blast the server.
  async function tryAutoResolve() {
    setResolving(true);
    setResolveResult(null);
    const targets = competitors.filter(c => looksLikePlatformId(c.brand_name));
    const updates = new Map<string, string>();

    async function resolveOne(c: CICompetitor) {
      const ids = Object.entries(c.platform_ids || {});
      for (const [platform, identifier] of ids) {
        const url = reconstructPlatformUrl(platform, identifier);
        if (!url) continue;
        try {
          const r = await parseLink(url);
          const candidate = r?.parsed ? r.brand_name?.trim() : '';
          if (candidate && !looksLikePlatformId(candidate)) {
            updates.set(c.id, candidate);
            return;
          }
        } catch { /* try next platform_id */ }
      }
    }

    // Run with bounded concurrency
    const queue = [...targets];
    const workers: Promise<void>[] = [];
    const concurrency = Math.min(4, queue.length);
    for (let i = 0; i < concurrency; i++) {
      workers.push((async () => {
        while (queue.length) {
          const c = queue.shift();
          if (c) await resolveOne(c);
        }
      })());
    }
    await Promise.all(workers);

    if (updates.size > 0) {
      onChange(competitors.map(c => updates.has(c.id) ? { ...c, brand_name: updates.get(c.id)! } : c));
    }
    setResolving(false);
    setResolveResult({ fixed: updates.size, remaining: targets.length - updates.size });
    // Auto-clear the result toast after a few seconds
    setTimeout(() => setResolveResult(null), 6000);
  }

  if (competitors.length === 0) {
    return (
      <p style={{ color: C.t3, fontSize: 14, margin: '12px 0 0' }}>
        {lang === 'zh' ? '还没有竞品，请在上方添加。' : 'No competitors added yet. Add one above.'}
      </p>
    );
  }

  // Surface a one-line nudge if any tracked row's brand_name looks like a
  // platform ID — those rows won't match analysis_results lookups, so the
  // analytics tab will be empty for them. The fix is to rename them inline.
  const badRows = competitors.filter(c => looksLikePlatformId(c.brand_name));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {badRows.length > 0 && (
        <div style={{
          padding: '12px 14px', background: `${C.danger}10`,
          border: `1px solid ${C.danger}44`, borderRadius: 8,
          fontSize: 12, color: C.t2, lineHeight: 1.6,
        }}>
          <div>
            <strong style={{ color: C.danger }}>
              {lang === 'zh'
                ? `${badRows.length} 个竞品看起来用了平台 ID 而不是品牌名。`
                : `${badRows.length} competitor${badRows.length === 1 ? '' : 's'} appear to use a platform ID instead of a brand name.`}
            </strong>{' '}
            {lang === 'zh'
              ? '没有真品牌名，分析无法匹配数据。点击下方按钮自动从平台抓取真名，剩余的可点「✎」手动改。'
              : 'Without a real brand name, analytics can\'t match data. Try the auto-resolve below, or click ✎ on each row to rename manually.'}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={tryAutoResolve}
              disabled={resolving}
              style={{
                background: resolving ? C.t3 : C.ac, border: 'none', borderRadius: 6,
                padding: '6px 14px', color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: resolving ? 'default' : 'pointer',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {resolving && (
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx={12} cy={12} r={10} strokeDasharray="31.4" strokeDashoffset="10" />
                </svg>
              )}
              {resolving
                ? (lang === 'zh' ? '正在解析…' : 'Resolving…')
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Sparkles size={11} strokeWidth={2} />
                    {lang === 'zh' ? `自动解析 ${badRows.length} 个名称` : `Auto-resolve ${badRows.length} name${badRows.length === 1 ? '' : 's'}`}
                  </span>}
            </button>
            {resolveResult && (
              <span style={{
                fontSize: 11, color: resolveResult.fixed > 0 ? C.success : C.t3,
                fontWeight: 600,
              }}>
                {resolveResult.fixed > 0 && (lang === 'zh'
                  ? `✓ 已修复 ${resolveResult.fixed} 个`
                  : `✓ Fixed ${resolveResult.fixed}`)}
                {resolveResult.fixed > 0 && resolveResult.remaining > 0 && ' · '}
                {resolveResult.remaining > 0 && (lang === 'zh'
                  ? `${resolveResult.remaining} 个无法解析（请手动重命名）`
                  : `${resolveResult.remaining} couldn\'t be resolved (rename manually)`)}
                {resolveResult.fixed === 0 && resolveResult.remaining === 0 && (lang === 'zh' ? '无可解析行' : 'Nothing to resolve')}
              </span>
            )}
          </div>
        </div>
      )}

      {competitors.map(c => {
        const isEditing = editingId === c.id;
        const isBad = !isEditing && looksLikePlatformId(c.brand_name);
        return (
        <div key={c.id} style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 16px',
          background: C.s2,
          border: `1px solid ${isBad ? `${C.danger}55` : C.bd}`,
          borderRadius: 8,
          fontSize: 13,
        }}>
          {/* Brand name + platform keyword labels */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    autoFocus
                    value={editValue}
                    onChange={e => { setEditValue(e.target.value); setEditError(''); }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') saveEdit(c.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    style={{
                      flex: 1, fontSize: 14, fontWeight: 600,
                      background: C.inputBg, color: C.tx,
                      border: `1px solid ${C.inputBd}`, borderRadius: 6,
                      padding: '6px 10px', outline: 'none',
                    }}
                    placeholder={lang === 'zh' ? '品牌名称（如 Songmont）' : 'Brand name (e.g. Songmont)'}
                  />
                  <button
                    onClick={() => saveEdit(c.id)}
                    style={{
                      background: C.ac, border: 'none', borderRadius: 6,
                      padding: '6px 12px', color: '#fff', fontSize: 12,
                      fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {lang === 'zh' ? '保存' : 'Save'}
                  </button>
                  <button
                    onClick={cancelEdit}
                    style={{
                      background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 6,
                      padding: '6px 12px', color: C.t2, fontSize: 12, cursor: 'pointer',
                    }}
                  >
                    {lang === 'zh' ? '取消' : 'Cancel'}
                  </button>
                </div>
                {editError && (
                  <div style={{ fontSize: 11, color: C.danger, marginTop: 4 }}>{editError}</div>
                )}
              </div>
            ) : (
              <span style={{
                fontWeight: 600, fontSize: 14,
                color: isBad ? C.danger : undefined,
              }}>
                {c.brand_name}
              </span>
            )}
            {/* Guard with `|| {}` — DB column platform_ids is nullable, but
                the TS type says it's required. Hitting a null here on initial
                render crashes the whole Settings page with "Cannot convert
                undefined or null to object". Defensive everywhere we touch it. */}
            {!isEditing && Object.keys(c.platform_ids || {}).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                {Object.entries(c.platform_ids || {}).map(([plat, id]) => (
                  <span key={plat} style={{ fontSize: 11, color: C.t3 }}>
                    <span style={{ color: PLATFORM_COLORS[plat] ?? C.ac, fontWeight: 600 }}>{PLATFORM_LABELS[plat] ?? plat}</span>: {id}
                  </span>
                ))}
              </div>
            )}
          </div>

          {!isEditing && (
            <>
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

              {/* Edit name + Remove — hidden when readOnly (demo lock) */}
              {!readOnly && (
                <>
                  <button
                    onClick={() => startEdit(c)}
                    style={{
                      background: 'none', border: 'none', color: isBad ? C.danger : C.t3,
                      cursor: 'pointer', padding: '0 6px',
                      minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title={lang === 'zh' ? '重命名品牌' : 'Rename brand'}
                    aria-label={lang === 'zh' ? '重命名品牌' : 'Rename brand'}
                  >
                    <Pencil size={14} strokeWidth={1.75} />
                  </button>

                  <button
                    onClick={() => remove(c.id)}
                    style={{
                      background: 'none', border: 'none', color: C.t3, cursor: 'pointer',
                      fontSize: 18, padding: '0 8px', lineHeight: 1,
                      minWidth: isMobile ? 44 : undefined, minHeight: isMobile ? 44 : undefined,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                    title={t(T.ci.removeCompetitor, lang as any)}
                    aria-label={t(T.ci.removeCompetitor, lang as any)}
                  >
                    ×
                  </button>
                </>
              )}
            </>
          )}
        </div>
      );
      })}
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
              <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                {isConnected
                  ? <CheckCircle2 size={18} strokeWidth={2} color={C.success} />
                  : <Circle size={18} strokeWidth={1.5} color={C.t3} />}
              </span>

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

    // Step 1: resolve a real workspace_id we can pass to runAnalysis.
    //
    // The previous version conflated three different failure modes ("API
    // returned 404 the first time", "save POST failed", "session JWT user_id
    // doesn't match any DB row") into a single "Cannot connect to backend
    // server" message. That was misleading — most testers saw the error
    // even though the orchestrator was actually starting up server-side
    // because of a transient proxy hiccup. Now each step reports its own
    // failure verbatim so we can tell what actually broke.
    let wsId: string | null | undefined = null;
    let stepThatFailed: 'fetch' | 'create' | 'analysis' | null = null;
    let stepDetail = '';

    try {
      const ws = await getWorkspace();
      wsId = ws.data?.id;
    } catch (err) {
      stepDetail = (err as Error).message || 'unknown error';
      console.warn('[CI] getWorkspace threw:', stepDetail);
    }

    // If we couldn't get a real id, try to create one. Only do so when
    // the local form has a name+category — otherwise the POST will 400.
    if (!wsId || wsId === 'local') {
      const localWs = getCIWorkspace();
      if (localWs?.brand_name && localWs?.brand_category) {
        console.log('[CI] No API workspace yet — creating from local form...');
        try {
          const apiWs = await saveWorkspace({
            brand_name: localWs.brand_name,
            brand_category: localWs.brand_category,
            brand_price_range: localWs.price_range || null,
            brand_platforms: null,
          });
          if (apiWs && apiWs.id && apiWs.id !== 'local') {
            wsId = apiWs.id;
            console.log(`[CI] Workspace created: ${wsId}`);

            // Sync local competitors. Sequential to keep ordering, but
            // each is fire-and-catch so one bad row doesn't poison the
            // remaining list. The backend POST upserts on
            // (workspace_id, brand_name) so re-runs are safe.
            const localComps = getCICompetitors();
            let synced = 0;
            for (const comp of localComps) {
              try {
                await addCompetitor({
                  workspace_id: wsId,
                  brand_name: comp.brand_name,
                  tier: comp.tier,
                  platform_ids: comp.platform_ids || {},
                  added_via: comp.added_via || 'manual',
                });
                synced += 1;
              } catch (err) {
                console.warn(`[CI] addCompetitor failed for ${comp.brand_name}:`, (err as Error).message);
              }
            }
            console.log(`[CI] Synced ${synced}/${localComps.length} competitors`);
          } else {
            stepThatFailed = 'create';
            stepDetail = 'API returned no id (likely 4xx/5xx — check network tab)';
          }
        } catch (err) {
          stepThatFailed = 'create';
          stepDetail = (err as Error).message || 'unknown error';
          console.warn('[CI] saveWorkspace threw:', stepDetail);
        }
      } else {
        stepThatFailed = 'fetch';
        stepDetail = 'No workspace on server and brand profile is incomplete locally';
      }
    }

    // Step 1.5: reconcile localStorage competitors against the backend list.
    //
    // The eager-sync inside AddCompetitorSection may have failed silently
    // earlier (e.g. transient proxy timeout, JWT user_id mismatch with the
    // workspace's row, or just an old session before the fix shipped).
    // If localStorage has more competitors than backend, the orchestrator
    // would only score whatever's in workspace_competitors — leaving the
    // user's Analytics scatter showing one brand instead of all six.
    //
    // We only run this when we have a real wsId (otherwise the create-step
    // above already did a full fresh sync). It's a small read + targeted
    // POSTs of the diff, so latency is one extra GET + N parallel writes.
    if (wsId && wsId !== 'local') {
      try {
        const apiComps = await getCompetitors(wsId);
        const apiNames = new Set(apiComps.data.map(c => c.brand_name));
        const localComps = getCICompetitors();
        const missing = localComps.filter(c => !apiNames.has(c.brand_name));
        if (missing.length > 0) {
          console.log(`[CI] Reconciling ${missing.length} competitor(s) missing from backend:`,
            missing.map(c => c.brand_name).join(', '));
          // Fire in parallel — order doesn't matter and the upsert on
          // (workspace_id, brand_name) makes them idempotent.
          await Promise.all(missing.map(c =>
            addCompetitor({
              workspace_id: wsId!,
              brand_name: c.brand_name,
              tier: c.tier,
              platform_ids: c.platform_ids || {},
              added_via: c.added_via || 'manual',
            }).catch(err => {
              console.warn(`[CI] reconcile failed for ${c.brand_name}:`, (err as Error).message);
            })
          ));
        }
      } catch (err) {
        console.warn('[CI] competitor reconcile read failed:', (err as Error).message);
        // Non-fatal — proceed to runAnalysis with whatever's in backend.
      }
    }

    // Step 2: stop here if we still don't have an id — but with a SPECIFIC
    // message naming the failed step so the user (and we, in console) can
    // diagnose without DevTools spelunking.
    if (!wsId || wsId === 'local') {
      const zh = stepThatFailed === 'fetch'
        ? `获取工作区失败：${stepDetail}`
        : stepThatFailed === 'create'
          ? `创建工作区失败：${stepDetail}`
          : `无法连接后端：${stepDetail || '未知错误'}`;
      const en = stepThatFailed === 'fetch'
        ? `Couldn't fetch your workspace: ${stepDetail}`
        : stepThatFailed === 'create'
          ? `Couldn't create the workspace: ${stepDetail}`
          : `Couldn't reach the backend: ${stepDetail || 'unknown error'}`;
      setStartError(lang === 'zh' ? zh : en);
      setStarting(false);
      return;
    }

    // Step 3: kick off the analysis job. Backend spawns a detached bash
    // process and returns ~50ms, so this should not be slow. If we DO
    // get null here it's almost always a Vercel→ECS transport problem
    // (the orchestrator may still have spawned server-side). We surface
    // that clearly AND store the workspace id so /ci can poll for any
    // job that did kick off.
    const job = await runAnalysis(wsId);
    if (!job || !job.job_id) {
      console.error('[CI] runAnalysis returned null — proxy/network failure or no competitors');
      // The user might already have an in-flight job from a prior click —
      // navigate to Brief so its polling can pick it up either way.
      const priorJob = localStorage.getItem('rebase_ci_analysis_job_id');
      if (priorJob) {
        console.log(`[CI] runAnalysis failed but a prior job (${priorJob}) is on file — navigating to Brief to track it.`);
        window.location.href = '/ci';
        return;
      }
      setStartError(lang === 'zh'
        ? '启动分析请求失败：后端可能正在处理（请1分钟后查看简报），或者请检查网络。'
        : "The 'start analysis' request failed. The orchestrator may already be running server-side (check Brief in ~1 min), or check your connection.");
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
  const catLabel = workspace?.brand_category ? `, ${categoryLabel(workspace.brand_category, lang)}` : '';

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

// ── Data sources status (3-state machine) ────────────────────────
// Derived state from competitor data, not a separate flag:
//   pending_setup → any competitor has xhs_profile_url IS NULL
//   scraping      → URLs set but no scrape data yet
//   ready         → all URLs + recent scrape data (StartAnalysisCard renders)
//
// Shown ABOVE the would-be StartAnalysisCard when state != ready. Replaces
// the analysis CTA with a curation-in-progress banner so the user has
// honest expectations + we (admin) have time to provision XHS profile URLs
// in /admin. Once admin completes both paste-URL + run-scrape steps, the
// state auto-derives to "ready" and StartAnalysisCard appears.
function DataSourcesStatus({
  competitors, needsSetup, needsScrape, C, lang, isMobile,
}: {
  competitors: CICompetitor[];
  needsSetup: number;
  needsScrape: number;
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  isMobile: boolean;
}) {
  const total = competitors.length;
  const connected = total - needsSetup;
  const isSettingUp = needsSetup > 0;

  // Visual: same shape as StartAnalysisCard so the transition between
  // "setting up" and "ready" feels like the same panel changing, not a
  // jarring layout shift. Dashed border + muted accent = "in progress".
  return (
    <div style={{
      background: `linear-gradient(135deg, ${C.s1} 0%, ${C.s2} 100%)`,
      border: `2px dashed ${C.t3}66`,
      borderRadius: 16,
      padding: isMobile ? '20px 16px' : '28px 32px',
      marginBottom: 24,
      textAlign: 'center',
    }}>
      {/* Eyebrow — monospace label, matches Joanna's section title convention */}
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: C.t3, marginBottom: 12,
      }}>
        {lang === 'zh'
          ? (isSettingUp ? '// 数据源 · 配置中' : '// 数据源 · 抓取中')
          : (isSettingUp ? '// data sources · setting up' : '// data sources · fetching')}
      </div>

      {/* Headline */}
      <div style={{
        fontSize: isMobile ? 16 : 18, fontWeight: 700, color: C.tx,
        marginBottom: 8, lineHeight: 1.4,
      }}>
        {isSettingUp
          ? (lang === 'zh' ? '正在连接您的竞品 XHS 数据源' : "Connecting your competitors' XHS profiles")
          : (lang === 'zh' ? '正在抓取最新竞争情报' : 'Fetching the latest competitive intelligence')}
      </div>

      {/* Body — sets expectation without over-promising. "Email" copy is
          aspirational tonight; emails not yet wired (TODO follow-up). */}
      <p style={{
        fontSize: 13, color: C.t2, marginBottom: 18, lineHeight: 1.7,
        maxWidth: 520, margin: '0 auto 18px',
      }}>
        {isSettingUp ? (
          lang === 'zh'
            ? '我们的团队正在为您手动整理 XHS 官方账号链接。完成后会通过邮件通知您，工作日通常在 1 小时内。'
            : "Our team is curating the official XHS profile links for your competitors. We'll email you when ready — typically within an hour during business hours."
        ) : (
          lang === 'zh'
            ? '马上就好 — 数据源已配置，正在拉取最新内容。'
            : 'Almost done — sources are configured, pulling the latest content now.'
        )}
      </p>

      {/* Progress chips — one per competitor, color-coded by state.
          Reuses the dashed-pill aesthetic from Coverage Pending so the
          user sees consistent visual grammar across the app. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
        marginBottom: 4,
      }}>
        {competitors.map(c => {
          const ready = !!c.xhs_profile_url && !!c.last_scraped_at;
          const partial = !!c.xhs_profile_url && !c.last_scraped_at;
          const pending = !c.xhs_profile_url;
          const fg = ready ? C.success : partial ? C.ac : C.t3;
          const bg = ready ? `${C.success}18` : partial ? `${C.ac}18` : C.s2;
          const label = ready
            ? (lang === 'zh' ? '✓ 已就绪' : '✓ ready')
            : partial
              ? (lang === 'zh' ? '· 抓取中' : '· fetching')
              : (lang === 'zh' ? '· 配置中' : '· connecting');
          return (
            <span key={c.id} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '4px 10px', borderRadius: 12, fontSize: 11,
              fontWeight: 600, background: bg, color: fg,
              border: `1px dashed ${fg}44`,
              fontFamily: 'var(--font-mono)',
            }}>
              <span style={{ color: C.tx, fontWeight: 700 }}>{c.brand_name}</span>
              <span>{label}</span>
            </span>
          );
        })}
      </div>

      {/* Footer — explicit count so user sees overall progress at a glance */}
      <div style={{ fontSize: 12, color: C.t3, marginTop: 14 }}>
        {isSettingUp
          ? (lang === 'zh'
              ? `${connected}/${total} 已连接`
              : `${connected} of ${total} connected`)
          : (lang === 'zh'
              ? `${total}/${total} 已连接 · 抓取中`
              : `${total} of ${total} connected · scraping`)}
      </div>
    </div>
  );
}

// ── Reset Data card ──────────────────────────────────────────────
// Sits right under Brand Profile rather than at the bottom of the page.
// Use case: user typed "Nike" + got AI competitor suggestions, then
// realized they meant Adidas — they need to see the reset button without
// scrolling past their suggestions.
function ResetDataCard({ C, lang, onReset, isMobile }: {
  C: ReturnType<typeof useApp>['colors'];
  lang: string;
  onReset: () => void;
  isMobile: boolean;
}) {
  const [confirming, setConfirming] = useState(false);

  function handleReset() {
    // Clear all CI localStorage keys (workspace, competitors, connections,
    // analysis flags, welcome banner state, and the multi-workspace cache
    // added in this PR — the active id and the known-workspaces list).
    localStorage.removeItem('rebase_ci_workspace');
    localStorage.removeItem('rebase_ci_competitors');
    localStorage.removeItem('rebase_ci_connections');
    localStorage.removeItem('rebase_ci_analysis_started');
    localStorage.removeItem('rebase_ci_analysis_job_id');
    localStorage.removeItem('rebase_ci_welcome_dismissed');
    localStorage.removeItem('rebase_ci_last_visit');
    localStorage.removeItem('rebase_ci_active_workspace_id');
    localStorage.removeItem('rebase_ci_known_workspaces');
    onReset();
    window.dispatchEvent(new CustomEvent('ci-data-updated'));
    setConfirming(false);
    window.location.href = '/ci/settings';
  }

  return (
    <div style={{
      background: C.s1,
      border: `1px dashed ${C.danger}55`,
      borderRadius: 12,
      padding: isMobile ? 14 : 18,
      marginBottom: 24,
      display: 'flex',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? 12 : 18,
      alignItems: isMobile ? 'stretch' : 'center',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.tx, marginBottom: 4 }}>
          {lang === 'zh' ? '切换品牌或行业？' : 'Switching to a different brand or industry?'}
        </div>
        <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
          {lang === 'zh'
            ? '一键清除：品牌档案、所有追踪的竞品、AI 推荐缓存、分析状态。然后在上方重新填写新品牌信息即可。'
            : 'One click clears: brand profile, all tracked competitors, AI suggestion cache, and analysis state. Then enter the new brand profile above to start fresh.'}
        </div>
      </div>
      {!confirming ? (
        <button
          onClick={() => setConfirming(true)}
          style={{
            background: 'transparent',
            border: `1px solid ${C.danger}`,
            color: C.danger,
            padding: '9px 18px',
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {lang === 'zh' ? '重置所有数据' : 'Reset all data'}
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: C.danger, fontWeight: 600 }}>
            {lang === 'zh' ? '确定？' : 'Sure?'}
          </span>
          <button
            onClick={handleReset}
            style={{
              background: C.danger,
              border: 'none',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {lang === 'zh' ? '确认重置' : 'Yes, reset'}
          </button>
          <button
            onClick={() => setConfirming(false)}
            style={{
              background: 'transparent',
              border: `1px solid ${C.bd}`,
              color: C.t2,
              padding: '8px 14px',
              borderRadius: 8,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
        </div>
      )}
    </div>
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

  // Force a re-render whenever workspace/competitor storage changes so child
  // components that read getCIWorkspace() / getCICompetitors() synchronously
  // (notably AddCompetitorSection, which gates the AI tab on workspace.brand_name)
  // pick up fresh values after the user saves brand profile or adds a competitor.
  // Without this, BrandProfileSection's notifyCIUpdate() event was firing but
  // CISettings + its children never rebound — so AI suggestions stayed stuck on
  // "set up brand profile above" even after a successful save.
  const [, forceRefresh] = useState(0);
  useEffect(() => {
    const handler = () => {
      forceRefresh(n => n + 1);
      setCompetitors(getCICompetitors());
    };
    window.addEventListener('ci-data-updated', handler);
    return () => window.removeEventListener('ci-data-updated', handler);
  }, []);

  // Hydrate competitors from the API on mount. The onboarding wizard writes
  // competitors to the DB (workspace_competitors), NOT localStorage — so
  // without this a freshly-onboarded user sees an empty list here.
  useEffect(() => {
    (async () => {
      const ws = await getWorkspace();
      const wsId = ws.data?.id;
      if (!wsId || wsId === 'local') return;
      const comps = await getCompetitors(wsId);
      if (comps.source === 'api' && comps.data.length > 0) {
        setCompetitors(comps.data as CICompetitor[]);
        saveCICompetitors(comps.data as CICompetitor[]);
      }
    })().catch(() => {});
  }, []);

  if (!ready) return <CISettingsSkeleton />;

  async function handleAddCompetitor(c: CICompetitor) {
    // Optimistic UI: write local state + storage immediately so the card
    // shows up without waiting for the round-trip.
    const updated = [...competitors, c];
    setCompetitors(updated);
    saveCICompetitors(updated);
    setRecentlyAdded(c.brand_name);
    setTimeout(() => setRecentlyAdded(null), 2000);

    // CRITICAL: also POST to backend so the cron / Brief generator picks
    // up this new competitor. Without this, settings adds only landed in
    // localStorage and the user saw "tracking only the onboarding-form
    // competitor" forever — workflow gap reported during testing.
    //
    // Note: workspace id only lives on the API-side Workspace type, not on
    // the CIWorkspace localStorage shape. So we fetch via getWorkspace()
    // which returns { data: Workspace | null } with id.
    const wsResp = await getWorkspace();
    const wsId = wsResp.data?.id;
    if (wsId && wsId !== 'local') {
      try {
        const apiResult = await addCompetitor({
          workspace_id: wsId,
          brand_name: c.brand_name,
          tier: c.tier || 'watchlist',
          platform_ids: c.platform_ids || {},
          added_via: c.added_via || 'manual',
        });
        // Backend assigns its own UUID — replace the client-generated one
        // so subsequent rename/remove use the canonical id.
        if (apiResult?.id && !apiResult.id.toString().startsWith('local-')) {
          const final = updated.map(x =>
            x.brand_name === c.brand_name ? { ...x, id: apiResult.id } : x
          );
          setCompetitors(final);
          saveCICompetitors(final);
        }
      } catch (err) {
        console.warn('[CI] backend sync failed for', c.brand_name, err);
      }
    }
  }

  async function handleCompetitorsChange(updated: CICompetitor[]) {
    // Detect removals by diffing the previous list against the new one.
    // Renames also fall through here as (remove + add) since CompetitorList
    // emits a fully-new array; backend POST upserts on (workspace_id,
    // brand_name) so name changes effectively re-add. We only sync the
    // delta to the backend to avoid spamming POST for every render.
    const prev = competitors;
    setCompetitors(updated);
    saveCICompetitors(updated);

    const wsResp = await getWorkspace();
    const wsId = wsResp.data?.id;
    if (!wsId || wsId === 'local') return;

    const prevIds = new Set(prev.map(c => c.id));
    const updatedIds = new Set(updated.map(c => c.id));
    const removed = prev.filter(c => !updatedIds.has(c.id));

    for (const c of removed) {
      // Skip purely-local rows (never made it to backend)
      if (!c.id || c.id.toString().startsWith('local-')) continue;
      try {
        await removeCompetitor(c.id, wsId);
      } catch (err) {
        console.warn('[CI] backend remove failed for', c.brand_name, err);
      }
    }

    // Detect newly-added rows (e.g., from rename creating a new entry)
    const added = updated.filter(c => !prevIds.has(c.id));
    for (const c of added) {
      try {
        await addCompetitor({
          workspace_id: wsId,
          brand_name: c.brand_name,
          tier: c.tier || 'watchlist',
          platform_ids: c.platform_ids || {},
          added_via: c.added_via || 'manual',
        });
      } catch (err) {
        console.warn('[CI] backend add failed for', c.brand_name, err);
      }
    }
  }

  const workspace = getCIWorkspace();
  const analysisStarted = localStorage.getItem('rebase_ci_analysis_started') === 'true';

  // 3-state derived from competitor data. The frontend never SETS state;
  // it READS what's in the DB (xhs_profile_url presence + last_scraped_at
  // freshness via lateral join in GET /api/ci/competitors). When admin
  // pastes a URL in /admin and triggers the scraper, the next refresh
  // here picks it up — no manual flag flipping anywhere.
  const needsSetup = competitors.filter(c => !c.xhs_profile_url).length;
  const needsScrape = competitors.filter(c => c.xhs_profile_url && !c.last_scraped_at).length;
  const dataReady = competitors.length > 0 && needsSetup === 0 && needsScrape === 0;
  const showStartCard = !!(workspace?.brand_name) && competitors.length > 0 && !analysisStarted && dataReady;
  const showSetupStatus = competitors.length > 0 && !dataReady;

  return (
    <div style={{ background: C.bg, color: C.tx, minHeight: '100vh', padding: isMobile ? '16px 12px' : '32px 24px', fontFamily: 'var(--font-sans)' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <CISubNav />

        <div style={{ marginBottom: isMobile ? 20 : 28, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.t3 }}>
            {lang === 'zh' ? '// 设置 · 工作区' : '// settings · workspace'}
          </span>
          <h1 style={{ fontSize: isMobile ? 26 : 36, fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)', letterSpacing: -0.5 }}>
            {t(T.ci.settings, lang)}
          </h1>
          <p style={{ color: C.t2, fontSize: 14, margin: 0, fontFamily: 'var(--font-mono)' }}>
            // {t(T.ci.subtitle, lang)}
          </p>
        </div>

        {/* 1 — Brand Profile */}
        <BrandProfileSection C={C} lang={lang} isMobile={isMobile} />

        {/* 1b — Reset Data (sits right under Brand Profile so it's reachable
                  without scrolling past the AI suggestions panel). */}
        <ResetDataCard C={C} lang={lang} isMobile={isMobile} onReset={() => {
          setCompetitors([]);
        }} />

        {/* 2 — My Competitors (renamed from "Manage Competitors") */}
        <Section title={t(T.ci.myCompetitors, lang as any)} C={C}>
          {/* When the workspace already has competitors tracked, the
              prominent "Type Name / Paste Link / AI Suggestions" tabs
              feel noisy — the user is already configured. Show a
              "configured" status banner + collapse the add UI behind a
              disclosure. Reset path goes via the ResetDataCard above
              (not duplicated here). When no competitors yet, show the
              add UI inline (the prominent setup flow). */}
          {competitors.length > 0 ? (
            <>
              {/* Configured banner */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '12px 16px', marginBottom: 16,
                background: `${C.success}12`,
                border: `1px solid ${C.success}33`,
                borderRadius: 10,
                fontSize: 13, color: C.tx,
              }}>
                <span style={{ fontSize: 16, color: C.success }}>✓</span>
                <span style={{ flex: 1 }}>
                  {lang === 'zh' ? (
                    <>
                      已配置 <strong>{competitors.length}</strong> 个竞品。如需重新设置，请使用上方的{' '}
                      <strong>重置所有数据</strong>。
                    </>
                  ) : (
                    <>
                      <strong>{competitors.length}</strong> competitor{competitors.length === 1 ? '' : 's'} configured. To start over, use{' '}
                      <strong>Reset all data</strong> above.
                    </>
                  )}
                </span>
              </div>

              {/* "Now tracking" toast (only on add) */}
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

              {/* Add-more disclosure — collapsed by default */}
              <details style={{ marginTop: 16 }}>
                <summary style={{
                  cursor: 'pointer', userSelect: 'none',
                  padding: '8px 12px',
                  background: C.s2, border: `1px solid ${C.bd}`, borderRadius: 8,
                  fontSize: 13, color: C.t2,
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ fontSize: 14 }}>+</span>
                  {lang === 'zh' ? '添加更多竞品' : 'Add another competitor'}
                </summary>
                <div style={{ marginTop: 12, paddingTop: 4 }}>
                  <AddCompetitorSection
                    C={C}
                    lang={lang}
                    competitors={competitors}
                    onAdd={handleAddCompetitor}
                  />
                </div>
              </details>
            </>
          ) : (
            <>
              {/* Empty state — show prominent add UI inline */}
              <AddCompetitorSection
                C={C}
                lang={lang}
                competitors={competitors}
                onAdd={handleAddCompetitor}
              />

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
            </>
          )}
        </Section>

        {/* 3a — Data sources status (shown when competitors exist but data
                isn't ready yet — replaces StartAnalysisCard during the
                admin-curation window). Renders honest "we're setting up"
                copy + per-competitor progress chips, sets expectation that
                we'll email when ready. Once admin completes paste-URL +
                scrape, the dataReady check below flips and StartCard
                renders in this same spot. */}
        {showSetupStatus && (
          <DataSourcesStatus
            competitors={competitors}
            needsSetup={needsSetup}
            needsScrape={needsScrape}
            C={C}
            lang={lang}
            isMobile={isMobile}
          />
        )}

        {/* 3b — Start Analysis card (shown when ready) */}
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

        {/* Reset moved up — see ResetDataCard immediately under Brand Profile. */}
      </div>
    </div>
  );
}
