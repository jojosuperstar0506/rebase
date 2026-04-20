/**
 * CILibrary — archive of past weekly briefs, content drafts, and product
 * opportunities.
 *
 * Purpose: give users a reason to come back and look things up ("what did
 * we post last month? what products have we already considered?"). Creates
 * compounding value over time — the longer the user stays, the more
 * reference material the Library contains.
 *
 * Data currently from services/ciMocks.ts — will swap to real API once
 * backend is wired.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import CISubNav from '../../components/ci/CISubNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCIData } from '../../hooks/useCIData';
import {
  getLibrary,
  type LibraryEntry, type TrendDirection,
} from '../../services/ciMocks';

function trendIcon(t: TrendDirection) { return t === 'gaining' ? '↑' : t === 'losing' ? '↓' : '→'; }
function trendColor(t: TrendDirection) { return t === 'gaining' ? '#22c55e' : t === 'losing' ? '#ef4444' : '#94a3b8'; }

function formatWeek(iso: string, lang: string): string {
  return new Date(iso).toLocaleDateString(
    lang === 'zh' ? 'zh-CN' : 'en-US',
    { year: 'numeric', month: 'short', day: 'numeric' },
  );
}

// ─── Component ───────────────────────────────────────────────────────────

export default function CILibrary() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { workspace } = useCIData();

  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'briefs' | 'content' | 'products'>('briefs');
  const [search, setSearch] = useState('');

  const workspaceId = workspace?.id || 'mock';

  useEffect(() => {
    setLoading(true);
    getLibrary(workspaceId).then(data => {
      setEntries(data);
      setLoading(false);
    });
  }, [workspaceId]);

  // Flatten all past content across all weeks for the Content view
  const allContent = useMemo(() => {
    return entries.flatMap(e =>
      e.content_drafts.map(c => ({ ...c, week_of: e.week_of }))
    );
  }, [entries]);

  // Flatten product opportunities across all weeks
  const allProducts = useMemo(() => {
    return entries
      .filter(e => e.product_opportunity)
      .map(e => ({ ...e.product_opportunity!, week_of: e.week_of }));
  }, [entries]);

  // Filter by search across whichever view is active
  const q = search.trim().toLowerCase();
  const filteredBriefs = useMemo(() => {
    if (!q) return entries;
    return entries.filter(e => e.verdict_headline.toLowerCase().includes(q));
  }, [entries, q]);
  const filteredContent = useMemo(() => {
    if (!q) return allContent;
    return allContent.filter(c =>
      (c.title + c.reasoning + c.hashtags.join(' ')).toLowerCase().includes(q)
    );
  }, [allContent, q]);
  const filteredProducts = useMemo(() => {
    if (!q) return allProducts;
    return allProducts.filter(p =>
      (p.concept_name + p.positioning + p.why_now).toLowerCase().includes(q)
    );
  }, [allProducts, q]);

  // ─── Styles ────────────────────────────────────────────────────────────

  const pageStyle: CSSProperties = {
    background: C.bg, color: C.tx, minHeight: '100vh',
    padding: isMobile ? '16px 12px' : '32px 24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const container: CSSProperties = { maxWidth: 900, margin: '0 auto' };
  const card: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
    padding: isMobile ? 14 : 18,
  };

  const tabBtn = (active: boolean): CSSProperties => ({
    background: active ? C.ac : 'transparent',
    color: active ? '#fff' : C.t2,
    border: `1px solid ${active ? C.ac : C.bd}`,
    borderRadius: 8, padding: '7px 14px',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  });

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div style={{ ...card, textAlign: 'center', padding: 40, marginTop: 20 }}>
            <div style={{ fontSize: 13, color: C.t2 }}>
              {lang === 'zh' ? '加载中…' : 'Loading…'}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      <div style={container}>
        <CISubNav />

        <header style={{ margin: '20px 0 24px' }}>
          <h1 style={{ fontSize: isMobile ? 24 : 30, fontWeight: 800, margin: 0, letterSpacing: -0.3 }}>
            {lang === 'zh' ? '资料库' : 'Library'}
          </h1>
          <p style={{ color: C.t2, fontSize: 14, margin: '6px 0 0' }}>
            {lang === 'zh'
              ? '历史简报、已发布内容与产品概念的归档 — 随着使用时间积累价值。'
              : 'Past briefs, published content, and product concepts — builds value as you keep using Rebase.'}
          </p>
        </header>

        {/* View switcher + search */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center',
        }}>
          <button onClick={() => setView('briefs')} style={tabBtn(view === 'briefs')}>
            📰 {lang === 'zh' ? '历史简报' : 'Past Briefs'} · {entries.length}
          </button>
          <button onClick={() => setView('content')} style={tabBtn(view === 'content')}>
            📱 {lang === 'zh' ? '所有内容' : 'All Content'} · {allContent.length}
          </button>
          <button onClick={() => setView('products')} style={tabBtn(view === 'products')}>
            💡 {lang === 'zh' ? '产品概念' : 'Product Concepts'} · {allProducts.length}
          </button>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={lang === 'zh' ? '搜索…' : 'Search…'}
            style={{
              marginLeft: 'auto',
              background: C.inputBg, border: `1px solid ${C.inputBd}`, borderRadius: 8,
              padding: '6px 12px', color: C.tx, fontSize: 13, outline: 'none',
              width: isMobile ? '100%' : 200,
            }}
          />
        </div>

        {/* Empty state */}
        {entries.length === 0 && (
          <div style={{ ...card, textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📚</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
              {lang === 'zh' ? '还没有历史记录' : 'Nothing archived yet'}
            </h3>
            <p style={{ fontSize: 13, color: C.t3, margin: 0 }}>
              {lang === 'zh'
                ? '当你开始生成每周简报后，历史记录将自动保存在这里。'
                : 'Weekly briefs will archive here automatically once you start generating them.'}
            </p>
          </div>
        )}

        {/* ─── View: Briefs ──────────────────────────────────────────── */}
        {view === 'briefs' && filteredBriefs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredBriefs.map(e => (
              <div key={e.week_of} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: C.t3, letterSpacing: '0.05em' }}>
                    {formatWeek(e.week_of, lang)}
                  </span>
                  <span style={{
                    fontSize: 11, fontWeight: 700,
                    color: trendColor(e.trend), background: `${trendColor(e.trend)}15`,
                    padding: '2px 8px', borderRadius: 4,
                  }}>
                    {trendIcon(e.trend)}
                  </span>
                  <span style={{ fontSize: 11, color: C.t3, marginLeft: 'auto' }}>
                    {e.moves_count} {lang === 'zh' ? '项动态' : 'moves'}
                    · {e.content_drafts.length} {lang === 'zh' ? '条内容' : 'drafts'}
                  </span>
                </div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, lineHeight: 1.5 }}>
                  {e.verdict_headline}
                </h3>
              </div>
            ))}
          </div>
        )}

        {/* ─── View: Content ─────────────────────────────────────────── */}
        {view === 'content' && filteredContent.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredContent.map(c => (
              <div key={c.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, color: '#000',
                    background: c.platform === 'douyin' ? '#fe2c55' : '#ff2442',
                    padding: '3px 8px', borderRadius: 4, textTransform: 'uppercase',
                  }}>
                    {c.platform === 'douyin' ? '抖音' : '小红书'}
                  </span>
                  <span style={{ fontSize: 11, color: C.t3 }}>
                    {formatWeek((c as any).week_of, lang)}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: c.status === 'posted' ? '#22c55e' : c.status === 'dismissed' ? C.t3 : C.ac,
                    marginLeft: 'auto',
                  }}>
                    {c.status === 'posted'
                      ? '✓ ' + (lang === 'zh' ? '已发布' : 'Posted')
                      : c.status === 'dismissed'
                        ? (lang === 'zh' ? '已忽略' : 'Dismissed')
                        : (lang === 'zh' ? '草稿' : 'Draft')}
                  </span>
                </div>
                <h4 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 6px' }}>{c.title}</h4>
                <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>{c.reasoning}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {c.hashtags.slice(0, 4).map(h => (
                    <span key={h} style={{ fontSize: 10, color: C.ac, background: `${C.ac}12`, padding: '2px 6px', borderRadius: 3 }}>{h}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── View: Products ────────────────────────────────────────── */}
        {view === 'products' && filteredProducts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredProducts.map(p => (
              <div key={p.id} style={card}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>💡</span>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, flex: 1 }}>{p.concept_name}</h3>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: p.status === 'accepted' ? '#22c55e' : p.status === 'dismissed' ? C.t3 : C.ac,
                  }}>
                    {p.status === 'accepted'
                      ? '✓ ' + (lang === 'zh' ? '已采纳' : 'Accepted')
                      : p.status === 'dismissed'
                        ? (lang === 'zh' ? '已忽略' : 'Dismissed')
                        : (lang === 'zh' ? '待评估' : 'Proposed')}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: C.t3, marginBottom: 6 }}>
                  {formatWeek((p as any).week_of, lang)} · {p.target_price}
                </div>
                <p style={{ fontSize: 13, color: C.t2, margin: 0, lineHeight: 1.6 }}>
                  {p.positioning}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Empty filtered state */}
        {((view === 'briefs' && filteredBriefs.length === 0)
          || (view === 'content' && filteredContent.length === 0 && allContent.length > 0)
          || (view === 'products' && filteredProducts.length === 0 && allProducts.length > 0)) && q && (
          <div style={{ ...card, textAlign: 'center', padding: 30 }}>
            <div style={{ fontSize: 13, color: C.t3 }}>
              {lang === 'zh' ? '没有匹配的结果' : 'No matches'}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
