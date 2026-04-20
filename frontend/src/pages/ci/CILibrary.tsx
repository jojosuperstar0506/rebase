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
import type { ColorSet } from '../../theme/colors';
import CISubNav from '../../components/ci/CISubNav';
import CIDrillDownModal from '../../components/ci/CIDrillDownModal';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCIData } from '../../hooks/useCIData';
import {
  getLibrary, getBriefByWeek,
  type LibraryEntry, type TrendDirection,
  type WeeklyBrief, type ContentDraft, type ProductOpportunity,
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
  const [error, setError] = useState(false);
  const [view, setView] = useState<'briefs' | 'content' | 'products'>('briefs');
  const [search, setSearch] = useState('');

  // Drill-down slot — one at a time, any entry type
  type Drill =
    | { kind: 'brief'; weekOf: string; loading: boolean; brief: WeeklyBrief | null }
    | { kind: 'content'; content: ContentDraft & { week_of?: string } }
    | { kind: 'product'; product: ProductOpportunity & { week_of?: string } }
    | null;
  const [drill, setDrill] = useState<Drill>(null);

  const workspaceId = workspace?.id || 'mock';

  async function openBriefDrill(weekOf: string) {
    setDrill({ kind: 'brief', weekOf, loading: true, brief: null });
    const full = await getBriefByWeek(workspaceId, weekOf);
    setDrill({ kind: 'brief', weekOf, loading: false, brief: full });
  }

  useEffect(() => {
    setLoading(true);
    setError(false);
    getLibrary(workspaceId).then(data => {
      setEntries(data);
      setLoading(false);
    }).catch(() => {
      setError(true);
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

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div style={{ ...card, textAlign: 'center', padding: 40, marginTop: 20 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
            <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px' }}>
              {lang === 'zh' ? '加载失败' : 'Could not load library'}
            </h3>
            <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>
              {lang === 'zh' ? '请稍后重试。' : 'Check your connection and try again.'}
            </p>
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
              <div
                key={e.week_of}
                style={{ ...card, cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => openBriefDrill(e.week_of)}
                onMouseEnter={ev => (ev.currentTarget.style.borderColor = `${C.ac}55`)}
                onMouseLeave={ev => (ev.currentTarget.style.borderColor = C.bd)}
              >
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
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: '0 0 8px', lineHeight: 1.5 }}>
                  {e.verdict_headline}
                </h3>
                <div style={{ fontSize: 11, color: C.ac, fontWeight: 600 }}>
                  {lang === 'zh' ? '查看完整简报 →' : 'View full brief →'}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ─── View: Content ─────────────────────────────────────────── */}
        {view === 'content' && filteredContent.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredContent.map(c => (
              <div
                key={c.id}
                style={{ ...card, cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => setDrill({ kind: 'content', content: c })}
                onMouseEnter={ev => (ev.currentTarget.style.borderColor = `${C.ac}55`)}
                onMouseLeave={ev => (ev.currentTarget.style.borderColor = C.bd)}
              >
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
              <div
                key={p.id}
                style={{ ...card, cursor: 'pointer', transition: 'all 0.15s' }}
                onClick={() => setDrill({ kind: 'product', product: p })}
                onMouseEnter={ev => (ev.currentTarget.style.borderColor = `${C.ac}55`)}
                onMouseLeave={ev => (ev.currentTarget.style.borderColor = C.bd)}
              >
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

      {/* ─── Drill-down modals ──────────────────────────────────────── */}
      {drill?.kind === 'brief' && (
        <CIDrillDownModal
          open={true}
          onClose={() => setDrill(null)}
          title={lang === 'zh' ? `简报 · ${formatWeek(drill.weekOf, lang)}` : `Brief · ${formatWeek(drill.weekOf, lang)}`}
          subtitle={lang === 'zh' ? '完整周度简报回顾' : 'Full weekly brief replay'}
          size="lg"
        >
          {drill.loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: C.t3, fontSize: 13 }}>
              {lang === 'zh' ? '加载简报…' : 'Loading brief…'}
            </div>
          ) : drill.brief ? (
            <BriefFullView brief={drill.brief} C={C} lang={lang} />
          ) : (
            <div style={{ textAlign: 'center', padding: 30, color: C.t3, fontSize: 13 }}>
              {lang === 'zh' ? '找不到该周简报' : 'Brief not found for this week'}
            </div>
          )}
        </CIDrillDownModal>
      )}

      {drill?.kind === 'content' && (
        <CIDrillDownModal
          open={true}
          onClose={() => setDrill(null)}
          title={drill.content.title}
          subtitle={
            (drill.content.platform === 'douyin' ? '抖音' : '小红书')
            + (drill.content.week_of ? ` · ${formatWeek(drill.content.week_of, lang)}` : '')
          }
          size="md"
        >
          <ContentFullView content={drill.content} C={C} lang={lang} />
        </CIDrillDownModal>
      )}

      {drill?.kind === 'product' && (
        <CIDrillDownModal
          open={true}
          onClose={() => setDrill(null)}
          title={`💡 ${drill.product.concept_name}`}
          subtitle={drill.product.week_of ? formatWeek(drill.product.week_of, lang) : undefined}
          size="md"
        >
          <ProductFullView product={drill.product} C={C} lang={lang} />
        </CIDrillDownModal>
      )}
    </div>
  );
}

// ─── Drill-down content components ───────────────────────────────────────

function BriefFullView({ brief, C, lang }: {
  brief: WeeklyBrief; C: ColorSet; lang: string;
}) {
  return (
    <div>
      {/* Verdict */}
      <div style={{
        padding: 14, background: C.s2, borderRadius: 8, marginBottom: 16,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>
          {lang === 'zh' ? '本周结论' : 'Verdict'}
        </div>
        <h4 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.4 }}>
          {brief.verdict.headline}
        </h4>
        <p style={{ fontSize: 13, color: C.t2, margin: 0, lineHeight: 1.7 }}>
          {brief.verdict.sentence}
        </p>
        <div style={{ marginTop: 10, fontSize: 12, color: C.tx }}>
          <span style={{ fontWeight: 700 }}>{lang === 'zh' ? '重点行动：' : 'Top action: '}</span>
          {brief.verdict.top_action}
        </div>
      </div>

      {/* Moves */}
      <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
        {lang === 'zh' ? '3件值得关注的事' : '3 things that moved'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {brief.moves.map((m, i) => (
          <div key={m.id} style={{
            padding: '10px 12px', background: C.s2, borderRadius: 6,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span>{m.icon}</span>
              <span style={{ fontSize: 11, color: C.t3 }}>#{i + 1} · {m.brand}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 4 }}>{m.headline}</div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{m.detail}</div>
          </div>
        ))}
      </div>

      {/* Content drafts */}
      {brief.content_drafts.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
            {lang === 'zh' ? '本周内容剧本' : 'Content drafts'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
            {brief.content_drafts.map(c => (
              <div key={c.id} style={{
                padding: '10px 12px', background: C.s2, borderRadius: 6,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, marginBottom: 4 }}>{c.title}</div>
                <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.5 }}>{c.reasoning}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Product opportunity */}
      {brief.product_opportunity && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', margin: '0 0 10px' }}>
            {lang === 'zh' ? '产品机会' : 'Product opportunity'}
          </div>
          <div style={{ padding: '12px 14px', background: C.s2, borderRadius: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.tx, marginBottom: 6 }}>
              💡 {brief.product_opportunity.concept_name}
            </div>
            <div style={{ fontSize: 12, color: C.t2, lineHeight: 1.6 }}>
              {brief.product_opportunity.positioning}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ContentFullView({ content, C, lang }: {
  content: ContentDraft; C: ColorSet; lang: string;
}) {
  const parts: string[] = [];
  if (content.hook_3s)  parts.push(`【开场3秒】\n${content.hook_3s}`);
  if (content.main_15s) parts.push(`【主体15秒】\n${content.main_15s}`);
  if (content.cta_3s)   parts.push(`【结尾3秒】\n${content.cta_3s}`);
  if (content.hashtags.length) parts.push(content.hashtags.join(' '));
  const copyable = parts.join('\n\n');

  return (
    <div>
      {/* Script */}
      {content.hook_3s && (
        <ScriptSection label={lang === 'zh' ? '开场3秒' : 'Hook (3s)'} text={content.hook_3s} color="#fe2c55" C={C} />
      )}
      {content.main_15s && (
        <ScriptSection label={lang === 'zh' ? '主体15秒' : 'Main (15s)'} text={content.main_15s} color={C.ac} C={C} />
      )}
      {content.cta_3s && (
        <ScriptSection label={lang === 'zh' ? '结尾3秒' : 'CTA (3s)'} text={content.cta_3s} color="#f59e0b" C={C} />
      )}

      {/* Hashtags */}
      <div style={{ margin: '14px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {content.hashtags.map(h => (
          <span key={h} style={{
            fontSize: 12, color: C.ac, background: `${C.ac}12`, padding: '3px 8px', borderRadius: 4,
          }}>{h}</span>
        ))}
      </div>

      {/* Reasoning */}
      <div style={{ padding: '12px 14px', background: C.s2, borderRadius: 6, fontSize: 12, color: C.t2, lineHeight: 1.7, marginBottom: 14 }}>
        <div style={{ marginBottom: 6 }}>
          <span style={{ fontWeight: 700, color: C.tx }}>{lang === 'zh' ? '为什么这个角度：' : 'Why this angle: '}</span>
          {content.reasoning}
        </div>
        <div>
          <span style={{ fontWeight: 700, color: C.tx }}>{lang === 'zh' ? '为什么是现在：' : 'Why now: '}</span>
          {content.why_now}
        </div>
      </div>

      {/* Based on */}
      {content.based_on && (
        <div style={{ fontSize: 11, color: C.t3, marginBottom: 14 }}>
          {lang === 'zh' ? '信号来源：' : 'Based on: '}{content.based_on}
        </div>
      )}

      {/* Copy button */}
      <button
        onClick={() => navigator.clipboard.writeText(copyable).catch(() => {})}
        style={{
          background: C.ac, color: '#fff', border: 'none', borderRadius: 6,
          padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}
      >
        {lang === 'zh' ? '📋 复制完整脚本' : '📋 Copy full script'}
      </button>
    </div>
  );
}

function ScriptSection({ label, text, color, C }: { label: string; text: string; color: string; C: ColorSet }) {
  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
      <div style={{
        width: 68, flexShrink: 0, fontSize: 10, fontWeight: 700,
        color, letterSpacing: '0.05em', textTransform: 'uppercase', paddingTop: 2,
      }}>
        {label}
      </div>
      <div style={{
        flex: 1, fontSize: 13, color: C.tx, lineHeight: 1.7,
        borderLeft: `2px solid ${color}33`, paddingLeft: 12,
      }}>
        {text}
      </div>
    </div>
  );
}

function ProductFullView({ product, C, lang }: {
  product: ProductOpportunity; C: ColorSet; lang: string;
}) {
  return (
    <div>
      {/* Positioning */}
      <p style={{ fontSize: 13, color: C.t2, margin: '0 0 14px', lineHeight: 1.7 }}>
        {product.positioning}
      </p>

      {/* Why now */}
      <div style={{
        padding: '12px 14px', background: `${C.ac}10`, borderLeft: `3px solid ${C.ac}`,
        borderRadius: 6, marginBottom: 14,
      }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          {lang === 'zh' ? '为什么是现在' : 'Why now'}
        </div>
        <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.7 }}>{product.why_now}</div>
      </div>

      {/* Signals */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.t2, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 8 }}>
          {lang === 'zh' ? '支撑信号' : 'Supporting signals'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {product.signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 12px', background: C.s2, borderRadius: 6, fontSize: 12 }}>
              <span style={{ color: C.t3, minWidth: 100 }}>{s.label}</span>
              <span style={{ color: C.tx, fontWeight: 600, flex: 1 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <div style={{ padding: 10, background: C.s2, borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>{lang === 'zh' ? '目标价' : 'Price'}</div>
          <div style={{ fontSize: 13, color: C.tx, fontWeight: 600 }}>{product.target_price}</div>
        </div>
        <div style={{ padding: 10, background: C.s2, borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>{lang === 'zh' ? '周期' : 'Timeline'}</div>
          <div style={{ fontSize: 13, color: C.tx, fontWeight: 600 }}>{product.launch_timeline}</div>
        </div>
        <div style={{ padding: 10, background: C.s2, borderRadius: 6 }}>
          <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>{lang === 'zh' ? '渠道' : 'Channels'}</div>
          <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>
            {product.target_channels.slice(0, 2).join(' · ')}
          </div>
        </div>
      </div>
    </div>
  );
}
