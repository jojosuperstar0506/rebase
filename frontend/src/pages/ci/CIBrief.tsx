/**
 * CIBrief — the weekly action kit.
 *
 * This is the new /ci landing page. It replaces the old Dashboard +
 * Intelligence + Landscape split. The page is a single magazine-style
 * scroll with four sections:
 *
 *   1. Where you stand (verdict + 3 moves that mattered)
 *   2. This week's content (Douyin drafts ready to copy-paste)
 *   3. Product opportunity (a concept to evaluate)
 *   4. See all metrics (collapsed, for analytical users)
 *
 * Data flows from services/ciMocks.ts today — will swap to real API
 * once brief_generator / gtm_content / product_opportunity pipelines
 * ship on ECS.
 */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useApp } from '../../context/AppContext';
import type { ColorSet } from '../../theme/colors';
import CISubNav from '../../components/ci/CISubNav';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCIData } from '../../hooks/useCIData';
import {
  getBrief, getLibrary, getDomainScores,
  markContentStatus, getContentStatus,
  markOpportunityStatus, getOpportunityStatus,
  type WeeklyBrief, type ContentDraft, type ProductOpportunity,
  type DomainScores, type TrendDirection,
} from '../../services/ciMocks';

// ─── Helpers ─────────────────────────────────────────────────────────────

function trendIcon(t: TrendDirection): string {
  return t === 'gaining' ? '↑' : t === 'losing' ? '↓' : '→';
}
function trendColor(t: TrendDirection): string {
  return t === 'gaining' ? '#22c55e' : t === 'losing' ? '#ef4444' : '#94a3b8';
}
function trendLabel(t: TrendDirection, lang: string): string {
  if (t === 'gaining') return lang === 'zh' ? '上升中' : 'Gaining';
  if (t === 'losing')  return lang === 'zh' ? '下降中' : 'Losing';
  return lang === 'zh' ? '保持稳定' : 'Holding steady';
}
function impactBg(impact: 'high' | 'medium' | 'low'): string {
  return impact === 'high' ? '#ef4444' : impact === 'medium' ? '#f59e0b' : '#94a3b8';
}

function formatWeek(iso: string, lang: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Copy a Douyin script to clipboard in a format the user can paste directly
function formatScriptForCopy(c: ContentDraft): string {
  const parts: string[] = [];
  if (c.hook_3s) parts.push(`【开场3秒】\n${c.hook_3s}`);
  if (c.main_15s) parts.push(`【主体15秒】\n${c.main_15s}`);
  if (c.cta_3s) parts.push(`【结尾3秒】\n${c.cta_3s}`);
  if (c.hashtags.length) parts.push(`\n${c.hashtags.join(' ')}`);
  return parts.join('\n\n');
}

// ─── Component ───────────────────────────────────────────────────────────

export default function CIBrief() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { workspace } = useCIData();

  const [brief, setBrief] = useState<WeeklyBrief | null>(null);
  const [domains, setDomains] = useState<DomainScores | null>(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Local state mirror of content / opportunity status so the UI updates
  // instantly on click without refetching.
  const [contentStatusMap, setContentStatusMap] = useState<Record<string, string>>({});
  const [oppStatus, setOppStatus] = useState<string | null>(null);

  const workspaceId = workspace?.id || 'mock';

  useEffect(() => {
    setLoading(true);
    setError(false);
    Promise.all([
      getBrief(workspaceId),
      getLibrary(workspaceId),
      getDomainScores(workspaceId),
    ]).then(([b, lib, ds]) => {
      setBrief(b);
      setHasHistory((lib || []).length > 0);
      setDomains(ds);
      // hydrate status maps namespaced by workspaceId
      if (b) {
        const cMap: Record<string, string> = {};
        b.content_drafts.forEach(c => {
          const s = getContentStatus(c.id, workspaceId);
          if (s) cMap[c.id] = s;
        });
        setContentStatusMap(cMap);
        if (b.product_opportunity) {
          setOppStatus(getOpportunityStatus(b.product_opportunity.id, workspaceId));
        }
      }
      setLoading(false);
    }).catch(() => {
      setError(true);
      setLoading(false);
    });
  }, [workspaceId]);

  async function handleRegenerate() {
    setRegenerating(true);
    // Simulate analysis delay — replace with real runAnalysis + polling later
    await new Promise(r => setTimeout(r, 1400));
    const fresh = await getBrief(workspaceId);
    setBrief(fresh);
    setRegenerating(false);
  }

  async function handleCopy(c: ContentDraft) {
    try {
      await navigator.clipboard.writeText(formatScriptForCopy(c));
      setCopiedId(c.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // clipboard blocked — surface nothing, fall through
    }
  }

  function handleMarkPosted(id: string) {
    markContentStatus(id, 'posted', workspaceId);
    setContentStatusMap(prev => ({ ...prev, [id]: 'posted' }));
  }
  function handleDismissContent(id: string) {
    markContentStatus(id, 'dismissed', workspaceId);
    setContentStatusMap(prev => ({ ...prev, [id]: 'dismissed' }));
  }
  function handleAcceptOpp(id: string) {
    markOpportunityStatus(id, 'accepted', workspaceId);
    setOppStatus('accepted');
  }
  function handleDismissOpp(id: string) {
    markOpportunityStatus(id, 'dismissed', workspaceId);
    setOppStatus('dismissed');
  }

  // ─── Styles ────────────────────────────────────────────────────────────

  const pageStyle: CSSProperties = {
    background: C.bg, color: C.tx, minHeight: '100vh',
    padding: isMobile ? '16px 12px' : '32px 24px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  };
  const container: CSSProperties = { maxWidth: 840, margin: '0 auto' };
  const card: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 14,
    padding: isMobile ? 16 : 24,
  };

  // ─── Loading / error / empty states ───────────────────────────────────

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div style={{ ...card, textAlign: 'center', padding: 60, marginTop: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>📰</div>
            <div style={{ fontSize: 15, color: C.t2 }}>
              {lang === 'zh' ? '正在生成本周简报…' : 'Generating this week\'s brief…'}
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
          <div style={{ ...card, textAlign: 'center', padding: 60, marginTop: 20 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>
              {lang === 'zh' ? '加载失败' : 'Something went wrong'}
            </h3>
            <p style={{ fontSize: 13, color: C.t3, margin: '0 0 18px' }}>
              {lang === 'zh'
                ? '无法加载本周简报，请稍后重试。'
                : 'Could not load this week\'s brief. Check your connection and try again.'}
            </p>
            <button
              onClick={() => { setError(false); setLoading(true); }}
              style={{
                background: C.ac, color: '#fff', border: 'none', borderRadius: 8,
                padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {lang === 'zh' ? '重试' : 'Retry'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!brief) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div style={{ ...card, textAlign: 'center', padding: 60, marginTop: 20 }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📰</div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 10px' }}>
              {lang === 'zh' ? '简报即将出炉' : 'Your brief is on its way'}
            </h3>
            <p style={{ fontSize: 14, color: C.t2, margin: '0 0 8px', lineHeight: 1.7, maxWidth: 420, marginLeft: 'auto', marginRight: 'auto' }}>
              {lang === 'zh'
                ? '每周简报将在竞品数据抓取并分析完成后自动生成。'
                : 'Your first brief will appear after your competitors are scraped and analysed.'}
            </p>
            <p style={{ fontSize: 12, color: C.t3, margin: 0, lineHeight: 1.6 }}>
              {lang === 'zh'
                ? '前往「品牌」页面确认已添加竞品，然后在设置中触发数据同步。'
                : 'Make sure you\'ve added competitors in the Brands tab, then trigger a sync in Settings.'}
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

        {/* Page header — masthead style */}
        <header style={{ margin: '20px 0 28px', textAlign: isMobile ? 'left' : 'center' }}>
          <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: 6 }}>
            {lang === 'zh' ? '每周竞品行动简报' : 'Weekly Action Brief'}
          </div>
          <h1 style={{ fontSize: isMobile ? 26 : 34, fontWeight: 800, margin: 0, letterSpacing: -0.5 }}>
            {formatWeek(brief.week_of, lang)}
          </h1>
          <div style={{ marginTop: 8, fontSize: 13, color: C.t3 }}>
            {brief.workspace_brand_name} · {lang === 'zh'
              ? `更新于 ${new Date(brief.generated_at).toLocaleString('zh-CN')}`
              : `Updated ${new Date(brief.generated_at).toLocaleString('en-US')}`}
          </div>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            style={{
              marginTop: 14,
              background: regenerating ? C.s2 : C.ac,
              color: regenerating ? C.t2 : '#fff',
              border: 'none', borderRadius: 8, padding: '8px 18px',
              fontSize: 13, fontWeight: 700,
              cursor: regenerating ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
            }}
          >
            <span>{regenerating ? '⏳' : '🔄'}</span>
            <span>{regenerating
              ? (lang === 'zh' ? '分析中…' : 'Analyzing…')
              : (lang === 'zh' ? '更新本周简报' : "Refresh This Week's Brief")}</span>
          </button>
        </header>

        {/* ─── SECTION 1: Verdict ─────────────────────────────────────── */}
        <section style={{ marginBottom: 28 }}>
          <div style={{
            ...card,
            background: `linear-gradient(135deg, ${C.s1} 0%, ${trendColor(brief.verdict.trend)}08 100%)`,
            borderColor: `${trendColor(brief.verdict.trend)}44`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: trendColor(brief.verdict.trend),
                background: `${trendColor(brief.verdict.trend)}18`,
                padding: '4px 10px', borderRadius: 20,
                letterSpacing: '0.05em', textTransform: 'uppercase',
              }}>
                {trendIcon(brief.verdict.trend)} {trendLabel(brief.verdict.trend, lang)}
              </span>
              <span style={{ fontSize: 11, color: C.t3 }}>
                {lang === 'zh' ? '本周市场地位' : 'Your position this week'}
              </span>
            </div>
            <h2 style={{
              fontSize: isMobile ? 19 : 22, fontWeight: 700, margin: '0 0 12px',
              lineHeight: 1.4, letterSpacing: -0.2,
            }}>
              {brief.verdict.headline}
            </h2>
            <p style={{ fontSize: 14, color: C.t2, margin: 0, lineHeight: 1.7 }}>
              {brief.verdict.sentence}
            </p>
            <div style={{
              marginTop: 18, padding: '14px 16px',
              background: `${C.ac}10`, borderLeft: `3px solid ${C.ac}`, borderRadius: 6,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                {lang === 'zh' ? '本周最该做的一件事' : "If you only do one thing"}
              </div>
              <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.6 }}>
                {brief.verdict.top_action}
              </div>
            </div>
          </div>
        </section>

        {/* ─── SECTION 1b: Three moves ──────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 14px' }}>
            {lang === 'zh' ? '本周3件值得关注的事' : '3 things that moved'}
          </h3>
          {!hasHistory && (
            <div style={{
              padding: '10px 14px', fontSize: 12, color: C.t3,
              background: `${C.ac}08`, border: `1px dashed ${C.ac}33`, borderRadius: 8,
              marginBottom: 14, lineHeight: 1.6,
            }}>
              {lang === 'zh'
                ? 'ℹ️ 第一周简报基于当前快照生成。下周起将显示同比变化。'
                : 'ℹ️ Week 1 brief is based on current snapshot only. Week-over-week deltas start next week.'}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {brief.moves.map((m, i) => (
              <div key={m.id} style={{
                ...card,
                padding: isMobile ? 14 : 18,
                borderLeft: `4px solid ${impactBg(m.impact)}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ fontSize: 24, lineHeight: 1, flexShrink: 0 }}>{m.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: '0.05em' }}>
                        #{i + 1} · {m.brand}
                      </span>
                    </div>
                    <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', lineHeight: 1.4 }}>
                      {m.headline}
                    </h4>
                    <div style={{ fontSize: 13, color: C.t2, marginBottom: 8, lineHeight: 1.6 }}>
                      {m.detail}
                    </div>
                    <div style={{
                      padding: '8px 12px', background: C.s2, borderRadius: 6,
                      fontSize: 12, color: C.t2, lineHeight: 1.6, marginBottom: 8,
                    }}>
                      <span style={{ fontWeight: 700, color: C.tx }}>
                        {lang === 'zh' ? '为什么重要：' : 'So what: '}
                      </span>
                      {m.so_what}
                    </div>
                    <div style={{ fontSize: 12, color: C.ac, fontWeight: 600, lineHeight: 1.6 }}>
                      → {m.action}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ─── SECTION 2: Content playbook ───────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
              {lang === 'zh' ? '本周内容剧本' : "This week's content"}
            </h3>
            <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
              {lang === 'zh'
                ? '基于本周竞品动态，已为你生成可直接发布的抖音脚本。'
                : 'Ready-to-publish Douyin scripts, grounded in this week\'s competitor signals.'}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {brief.content_drafts.map(c => {
              const status = contentStatusMap[c.id];
              const isPosted = status === 'posted';
              const isDismissed = status === 'dismissed';
              if (isDismissed) return null;
              return (
                <div key={c.id} style={{
                  ...card,
                  padding: isMobile ? 14 : 18,
                  opacity: isPosted ? 0.65 : 1,
                  borderColor: isPosted ? '#22c55e44' : C.bd,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700,
                      color: '#000', background: C.platformDouyin,
                      padding: '3px 8px', borderRadius: 4,
                      letterSpacing: '0.05em', textTransform: 'uppercase',
                    }}>
                      抖音 Douyin
                    </span>
                    <span style={{ fontSize: 10, color: C.t3 }}>
                      {lang === 'zh' ? '15秒短视频脚本' : '15-sec short video script'}
                    </span>
                    {isPosted && (
                      <span style={{ fontSize: 11, color: C.success, fontWeight: 700, marginLeft: 'auto' }}>
                        ✓ {lang === 'zh' ? '已发布' : 'Posted'}
                      </span>
                    )}
                  </div>

                  <h4 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px' }}>{c.title}</h4>

                  {/* Script blocks */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                    {c.hook_3s && (
                      <ScriptBlock label={lang === 'zh' ? '开场3秒' : 'Hook (3s)'} text={c.hook_3s} color={C.platformDouyin} C={C} />
                    )}
                    {c.main_15s && (
                      <ScriptBlock label={lang === 'zh' ? '主体15秒' : 'Main (15s)'} text={c.main_15s} color={C.ac} C={C} />
                    )}
                    {c.cta_3s && (
                      <ScriptBlock label={lang === 'zh' ? '结尾3秒' : 'CTA (3s)'} text={c.cta_3s} color={C.warning} C={C} />
                    )}
                  </div>

                  {/* Hashtags */}
                  <div style={{ marginBottom: 14, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {c.hashtags.map(h => (
                      <span key={h} style={{
                        fontSize: 11, color: C.ac,
                        background: `${C.ac}12`, padding: '3px 8px', borderRadius: 4,
                      }}>
                        {h}
                      </span>
                    ))}
                  </div>

                  {/* Reasoning */}
                  <div style={{
                    padding: '10px 12px', background: C.s2, borderRadius: 6,
                    fontSize: 11, color: C.t2, lineHeight: 1.6, marginBottom: 14,
                  }}>
                    <div style={{ marginBottom: 4 }}>
                      <span style={{ fontWeight: 700, color: C.tx }}>
                        {lang === 'zh' ? '为什么用这个角度：' : 'Why this angle: '}
                      </span>
                      {c.reasoning}
                    </div>
                    <div>
                      <span style={{ fontWeight: 700, color: C.tx }}>
                        {lang === 'zh' ? '为什么是现在：' : 'Why now: '}
                      </span>
                      {c.why_now}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      onClick={() => handleCopy(c)}
                      disabled={isPosted}
                      style={{
                        background: copiedId === c.id ? '#22c55e' : C.ac,
                        color: '#fff', border: 'none', borderRadius: 6,
                        padding: '7px 14px', fontSize: 12, fontWeight: 700,
                        cursor: isPosted ? 'default' : 'pointer',
                        opacity: isPosted ? 0.5 : 1,
                      }}
                    >
                      {copiedId === c.id
                        ? (lang === 'zh' ? '✓ 已复制' : '✓ Copied')
                        : (lang === 'zh' ? '📋 复制脚本' : '📋 Copy Script')}
                    </button>
                    {!isPosted && (
                      <button
                        onClick={() => handleMarkPosted(c.id)}
                        style={{
                          background: 'transparent', color: C.t2,
                          border: `1px solid ${C.bd}`, borderRadius: 6,
                          padding: '6px 14px', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        {lang === 'zh' ? '标记为已发' : 'Mark as Posted'}
                      </button>
                    )}
                    <button
                      onClick={() => handleDismissContent(c.id)}
                      style={{
                        background: 'transparent', color: C.t3,
                        border: 'none', borderRadius: 6,
                        padding: '6px 10px', fontSize: 12,
                        cursor: 'pointer', marginLeft: 'auto',
                      }}
                    >
                      {lang === 'zh' ? '忽略' : 'Dismiss'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── SECTION 3: Product opportunity ────────────────────────── */}
        {brief.product_opportunity && oppStatus !== 'dismissed' && (
          <section style={{ marginBottom: 40 }}>
            <div style={{ marginBottom: 14 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: C.t2, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                {lang === 'zh' ? '产品机会' : 'Product Opportunity'}
              </h3>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>
                {lang === 'zh'
                  ? '基于市场关键词趋势和竞品价位空缺，为你识别的下一款产品方向。'
                  : 'The next product concept we identified from keyword trends and competitor pricing gaps.'}
              </div>
            </div>
            <ProductOpportunityCard
              opp={brief.product_opportunity}
              accepted={oppStatus === 'accepted'}
              onAccept={handleAcceptOpp}
              onDismiss={handleDismissOpp}
              C={C}
              lang={lang}
              isMobile={isMobile}
            />
          </section>
        )}

        {/* ─── SECTION 4: See all metrics (collapsed) ────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <button
            onClick={() => setShowMetrics(v => !v)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'transparent', border: `1px solid ${C.bd}`, borderRadius: 10,
              padding: '12px 16px', color: C.t2, fontSize: 13, fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <span>
              {lang === 'zh' ? '📊 查看全部12项指标分数（分析师视图）' : '📊 See all 12 metric scores (analyst view)'}
            </span>
            <span style={{ fontSize: 11, color: C.t3, transform: showMetrics ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              ▼
            </span>
          </button>
          {showMetrics && domains && (
            <div style={{ ...card, marginTop: 10 }}>
              <DomainScoreComparison domains={domains} C={C} lang={lang} />
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.bd}`, fontSize: 11, color: C.t3, lineHeight: 1.6 }}>
                {lang === 'zh'
                  ? '注：这些分数由12项独立指标加权汇总而成。想查看每个指标的详细评分与竞品对比，请前往「品牌」页面点击具体品牌进入深度视图。'
                  : 'Note: Each domain score is a weighted roll-up of underlying metrics. For per-metric detail and competitor comparison, click any brand in the Brands tab.'}
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer style={{ textAlign: 'center', fontSize: 11, color: C.t3, padding: '20px 0' }}>
          {lang === 'zh'
            ? 'Rebase · 你的AI竞品情报 + 内容团队'
            : 'Rebase · Your AI competitive intel + content team'}
        </footer>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function ScriptBlock({ label, text, color, C }: {
  label: string; text: string; color: string; C: ColorSet;
}) {
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{
        width: 60, flexShrink: 0, fontSize: 10, fontWeight: 700,
        color, letterSpacing: '0.05em', textTransform: 'uppercase',
        paddingTop: 2,
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

function ProductOpportunityCard({ opp, accepted, onAccept, onDismiss, C, lang, isMobile }: {
  opp: ProductOpportunity;
  accepted: boolean;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  C: ColorSet;
  lang: string;
  isMobile: boolean;
}) {
  return (
    <div style={{
      background: C.s1, border: `1px solid ${accepted ? '#22c55e55' : C.bd}`, borderRadius: 14,
      padding: isMobile ? 16 : 22,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span style={{ fontSize: 28, lineHeight: 1 }}>💡</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            {lang === 'zh' ? '产品概念' : 'Product Concept'}
          </div>
          <h3 style={{ fontSize: isMobile ? 17 : 20, fontWeight: 700, margin: '2px 0 0' }}>
            {opp.concept_name}
          </h3>
        </div>
        {accepted && (
          <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>
            ✓ {lang === 'zh' ? '已采纳' : 'Accepted'}
          </span>
        )}
      </div>

      <p style={{ fontSize: 13, color: C.t2, margin: '0 0 14px', lineHeight: 1.7 }}>
        {opp.positioning}
      </p>

      <div style={{ padding: '12px 14px', background: C.s2, borderRadius: 8, marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          {lang === 'zh' ? '为什么是现在' : 'Why now'}
        </div>
        <div style={{ fontSize: 13, color: C.tx, lineHeight: 1.6 }}>{opp.why_now}</div>
      </div>

      {/* Signals */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>
          {lang === 'zh' ? '支撑信号' : 'Supporting signals'}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 8 }}>
          {opp.signals.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '6px 10px', background: C.s2, borderRadius: 6 }}>
              <span style={{ color: C.t3, minWidth: 76 }}>{s.label}:</span>
              <span style={{ color: C.tx, fontWeight: 600 }}>{s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Meta grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(3, 1fr)',
        gap: 10, marginBottom: 16,
      }}>
        <MetaBox label={lang === 'zh' ? '目标价' : 'Target price'} value={opp.target_price} C={C} />
        <MetaBox label={lang === 'zh' ? '周期' : 'Timeline'} value={opp.launch_timeline} C={C} />
        <MetaBox
          label={lang === 'zh' ? '渠道建议' : 'Channels'}
          value={opp.target_channels.slice(0, 2).join(' · ')}
          C={C}
        />
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        {!accepted && (
          <button
            onClick={() => onAccept(opp.id)}
            style={{
              background: C.ac, color: '#fff', border: 'none', borderRadius: 6,
              padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {lang === 'zh' ? '加入产品规划' : 'Add to product roadmap'}
          </button>
        )}
        <button
          onClick={() => onDismiss(opp.id)}
          style={{
            background: 'transparent', color: C.t3, border: 'none',
            padding: '8px 12px', fontSize: 12, cursor: 'pointer', marginLeft: 'auto',
          }}
        >
          {lang === 'zh' ? '不感兴趣' : 'Not interested'}
        </button>
      </div>
    </div>
  );
}

function MetaBox({ label, value, C }: { label: string; value: string; C: ColorSet }) {
  return (
    <div style={{ padding: '8px 10px', background: C.s2, borderRadius: 6 }}>
      <div style={{ fontSize: 10, color: C.t3, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 12, color: C.tx, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function DomainScoreComparison({ domains, C, lang }: {
  domains: DomainScores; C: ColorSet; lang: string;
}) {
  const rows: Array<{ key: keyof DomainScores; label: string; color: string }> = [
    { key: 'consumer',  label: lang === 'zh' ? '消费者' : 'Consumer',  color: '#ec4899' },
    { key: 'product',   label: lang === 'zh' ? '产品'   : 'Product',   color: '#f97316' },
    { key: 'marketing', label: lang === 'zh' ? '营销'   : 'Marketing', color: '#0ea5e9' },
  ];

  return (
    <div>
      <div style={{ fontSize: 11, color: C.t3, marginBottom: 12, letterSpacing: '0.05em' }}>
        {lang === 'zh' ? '你 vs 竞品 · 三大类评分（满分100）' : 'You vs competitors · 3-domain scores (out of 100)'}
      </div>
      {rows.map(row => {
        const ownScore = domains[row.key].own;
        const competitors = Object.entries(domains[row.key].competitors);
        const allScores = [ownScore, ...competitors.map(([, v]) => v)];
        const maxScore = Math.max(...allScores, 100);
        return (
          <div key={row.key} style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, background: row.color, borderRadius: 2 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>{row.label}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <BarRow
                name={lang === 'zh' ? '你的品牌' : 'Your brand'}
                score={ownScore} max={maxScore} color={row.color} highlight
                C={C}
              />
              {competitors.map(([name, score]) => (
                <BarRow key={name} name={name} score={score} max={maxScore} color={row.color} C={C} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BarRow({ name, score, max, color, highlight, C }: {
  name: string; score: number; max: number; color: string; highlight?: boolean; C: ColorSet;
}) {
  const pct = (score / max) * 100;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{
        width: 80, color: highlight ? C.tx : C.t2,
        fontWeight: highlight ? 700 : 400, flexShrink: 0,
      }}>
        {name}
      </span>
      <div style={{ flex: 1, height: 8, background: C.s2, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: highlight ? color : `${color}88`,
          borderRadius: 4, transition: 'width 0.5s ease',
        }} />
      </div>
      <span style={{
        width: 28, textAlign: 'right',
        color: highlight ? C.tx : C.t2,
        fontWeight: highlight ? 700 : 400, flexShrink: 0,
      }}>
        {score}
      </span>
    </div>
  );
}
