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

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CSSProperties } from 'react';
import {
  Newspaper, AlertTriangle, RefreshCw, Hourglass,
  Lightbulb, ClipboardCopy, BarChart3,
} from 'lucide-react';
import { MetricIcon } from '../../utils/metricIcons';
import { useApp } from '../../context/AppContext';
import type { ColorSet } from '../../theme/colors';
import CISubNav from '../../components/ci/CISubNav';
import CIWelcomeBanner from '../../components/ci/CIWelcomeBanner';
import CIAlertFeed from '../../components/ci/CIAlertFeed';
import IndexScatterPlot from '../../components/ci/IndexScatterPlot';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCIData } from '../../hooks/useCIData';
import {
  getBrief, getLibrary, getDomainScores,
  markContentStatus, getContentStatus,
  markOpportunityStatus, getOpportunityStatus,
  type WeeklyBrief, type ContentDraft, type ProductOpportunity,
  type DomainScores, type TrendDirection,
} from '../../services/ciMocks';
import { getIndices, type IndicesResponse } from '../../services/ciIndices';
import { runAnalysis, getAnalysisStatus, type AnalysisJob } from '../../services/ciApi';
import { categoryLabel } from '../../utils/categoryLabels';
import { Heading } from '@/components/ui/Heading';
import { Eyebrow } from '@/components/ui/Eyebrow';
import { Highlight } from '@/components/ui/Highlight';
import { Button } from '@/components/ui/Button';

// Show "data is stale" warning if the brief is older than this many days.
const STALE_DAYS_THRESHOLD = 7;

/**
 * Defensive language resolver — handles fields that should already be
 * single-language strings (resolved by the backend) but might still be
 * bilingual `{zh, en}` objects if:
 *   - the backend hasn't been restarted after a deploy that added new
 *     resolveLang fields, or
 *   - resolveLang missed a nested structure (e.g. an array we didn't
 *     teach it to walk)
 *
 * Without this, `<div>{p.someField}</div>` would render `[object Object]`
 * and `{evidence.map(...)}` would crash with `evidence.map is not a
 * function` because the value is `{zh: [...], en: [...]}` instead of
 * a flat array. The fix on the backend is one PM2 restart away, but the
 * frontend should never crash on data shape regressions.
 *
 * Usage:
 *   pickLang(value, lang, '')        // string fallback
 *   pickLang(value, lang, [])        // array fallback
 */
function pickLang<T>(val: unknown, lang: string, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === 'string' || Array.isArray(val)) return val as unknown as T;
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>;
    const picked = obj[lang] ?? obj.zh ?? obj.en;
    if (picked != null) return picked as T;
  }
  return fallback;
}

// Pretty-print a relative timestamp: "2 hours ago", "5 days ago", "just now".
// Falls back to absolute date for anything > 30 days.
function formatRelativeTime(iso: string, lang: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = Date.now() - then;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return lang === 'zh' ? '刚刚' : 'just now';
  if (diffMin < 60) {
    return lang === 'zh' ? `${diffMin} 分钟前` : `${diffMin} min ago`;
  }
  if (diffHr < 24) {
    return lang === 'zh' ? `${diffHr} 小时前` : `${diffHr}h ago`;
  }
  if (diffDay < 30) {
    return lang === 'zh' ? `${diffDay} 天前` : `${diffDay} day${diffDay === 1 ? '' : 's'} ago`;
  }
  // > 30 days — fall back to absolute date
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function ageInDays(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.floor((Date.now() - then) / 86_400_000);
}

// Map an in-flight AnalysisJob.status into the user-facing label shown on the
// Refresh button. Mirrors the orchestrator stages from
// services/competitor_intel/run_analysis_for_workspace.sh.
function jobStageLabel(status: AnalysisJob['status'] | null, lang: string): string {
  switch (status) {
    case 'queued':
      return lang === 'zh' ? '排队中…' : 'Queued…';
    case 'scoring':
      return lang === 'zh' ? '评分竞品…' : 'Scoring competitors…';
    case 'narrating':
      return lang === 'zh' ? '生成简报…' : 'Generating brief…';
    case 'complete':
      return lang === 'zh' ? '完成 ✓' : 'Done ✓';
    case 'failed':
      return lang === 'zh' ? '分析失败' : 'Analysis failed';
    default:
      return lang === 'zh' ? '准备中…' : 'Starting…';
  }
}

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

// Deterministic brand-color hue per brand name. Same brand always gets the
// same color across pages (Brief, Analytics, Library) so the user can scan
// "where's CASSILE this week" by spotting one chip.
function brandColorHsl(brand: string, sat = 60, light = 50): string {
  let h = 0;
  for (let i = 0; i < brand.length; i++) {
    h = (h * 31 + brand.charCodeAt(i)) >>> 0;
  }
  return `hsl(${h % 360}, ${sat}%, ${light}%)`;
}

function formatWeek(iso: string, lang: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

// Copy a Douyin script to clipboard in a format the user can paste directly.
// W8: respect current `lang` so English-locale users get English section headers.
function formatScriptForCopy(c: ContentDraft, lang: 'zh' | 'en' = 'zh'): string {
  const parts: string[] = [];
  const labels = lang === 'en'
    ? { hook: 'Hook (3s)', main: 'Main (15s)', cta: 'CTA (3s)' }
    : { hook: '开场3秒',     main: '主体15秒',     cta: '结尾3秒' };
  if (c.hook_3s)  parts.push(`【${labels.hook}】\n${c.hook_3s}`);
  if (c.main_15s) parts.push(`【${labels.main}】\n${c.main_15s}`);
  if (c.cta_3s)   parts.push(`【${labels.cta}】\n${c.cta_3s}`);
  if (c.hashtags.length) parts.push(`\n${c.hashtags.join(' ')}`);
  return parts.join('\n\n');
}

// ─── Component ───────────────────────────────────────────────────────────

export default function CIBrief() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';
  const { workspace, competitors } = useCIData();
  const navigate = useNavigate();

  const [brief, setBrief] = useState<WeeklyBrief | null>(null);
  const [domains, setDomains] = useState<DomainScores | null>(null);
  const [hasHistory, setHasHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // While regenerating: track the orchestrator stage so the user sees real
  // progress (queued → scoring → narrating → complete) rather than a fake
  // spinner. Polled from /api/ci/analysis/status.
  const [jobStatus, setJobStatus] = useState<AnalysisJob['status'] | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // Composite indices powering the scatter plot. Fetched in the same
  // useEffect as brief data; falls through gracefully when the endpoint
  // returns null (older backend or empty workspace).
  const [indices, setIndices] = useState<IndicesResponse | null>(null);

  // Local state mirror of content / opportunity status so the UI updates
  // instantly on click without refetching.
  const [contentStatusMap, setContentStatusMap] = useState<Record<string, string>>({});
  const [oppStatus, setOppStatus] = useState<string | null>(null);

  const workspaceId = workspace?.id || 'mock';

  useEffect(() => {
    // Don't fire API calls before workspace state hydrates — backend will
    // 404 on the placeholder workspace_id but it spams logs and adds latency.
    if (!workspace?.id || workspace.id === 'mock' || workspace.id === 'local') {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    Promise.all([
      getBrief(workspaceId, lang),
      getLibrary(workspaceId, lang),
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
    // Indices fetch is independent of the main brief data — failure here
    // just hides the scatter section, doesn't break the page.
    getIndices(workspaceId, lang).then(setIndices).catch(() => setIndices(null));
  }, [workspaceId, lang]);

  // Cleanup any in-flight polling when the component unmounts.
  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // Resume polling when navigating into Brief with a job in flight.
  //
  // Background: clicking "Start Analysis" in Settings spawns the orchestrator
  // server-side (detached bash) and stores rebase_ci_analysis_job_id +
  // rebase_ci_analysis_started in localStorage, then navigates here. Without
  // this effect the user lands on a stale Brief with no progress signal and
  // has to click Refresh themselves to see the orchestrator running.
  //
  // Same effect also recovers when the click in Settings showed a transient
  // error but the orchestrator did kick off — they navigate here, we find
  // the job_id, and resume polling.
  useEffect(() => {
    if (!workspace?.id || workspace.id === 'mock' || workspace.id === 'local') return;
    if (regenerating) return; // already polling

    const storedJobId = localStorage.getItem('rebase_ci_analysis_job_id');
    const justStarted = localStorage.getItem('rebase_ci_analysis_started');
    if (!storedJobId || !justStarted) return;

    // We don't refresh the page on completion via this path (handleRegenerate
    // does that). Instead, we mirror the polling and let the existing logic
    // refresh `brief` + `domains` once the job settles.
    setRegenerating(true);
    setJobError(null);
    setJobStatus('queued');

    const POLL_MS = 1500;
    const MAX_POLLS = Math.floor((3 * 60_000) / POLL_MS);
    let polls = 0;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      polls += 1;
      const status = await getAnalysisStatus(workspaceId);
      if (cancelled) return;
      if (!status) {
        if (polls < MAX_POLLS) {
          pollTimerRef.current = window.setTimeout(poll, POLL_MS);
        }
        return;
      }
      setJobStatus(status.status);
      if (status.status === 'complete') {
        const [fresh, lib, ds] = await Promise.all([
          getBrief(workspaceId, lang),
          getLibrary(workspaceId, lang),
          getDomainScores(workspaceId),
        ]);
        if (cancelled) return;
        setBrief(fresh);
        setHasHistory((lib || []).length > 0);
        setDomains(ds);
        // Once the resumed job completes, drop the started flag so future
        // navigations don't redundantly re-poll. job_id stays in localStorage
        // for ~debugging until next Start.
        localStorage.removeItem('rebase_ci_analysis_started');
        window.setTimeout(() => {
          setRegenerating(false);
          setJobStatus(null);
        }, 1200);
        return;
      }
      if (status.status === 'failed') {
        setJobError(status.error
          || (lang === 'zh' ? '分析失败,请重试' : 'Analysis failed. Please retry.'));
        localStorage.removeItem('rebase_ci_analysis_started');
        window.setTimeout(() => {
          setRegenerating(false);
          setJobStatus(null);
        }, 3000);
        return;
      }
      if (polls >= MAX_POLLS) {
        setJobError(lang === 'zh'
          ? '分析超时(>3分钟),请稍后查看'
          : 'Analysis is taking longer than expected. Refresh the page in a few minutes.');
        setJobStatus('failed');
        localStorage.removeItem('rebase_ci_analysis_started');
        window.setTimeout(() => {
          setRegenerating(false);
          setJobStatus(null);
        }, 3000);
        return;
      }
      pollTimerRef.current = window.setTimeout(poll, POLL_MS);
    };
    pollTimerRef.current = window.setTimeout(poll, POLL_MS);

    return () => {
      cancelled = true;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
    // workspaceId/lang baked into the closures used by poll(); listing them
    // ensures the resume effect re-arms after lang switch or workspace swap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, lang]);

  // Trigger the real run_analysis_for_workspace.sh orchestrator and poll status
  // every 1.5s. The orchestrator transitions queued → scoring → narrating →
  // complete in roughly 12s on a small workspace; we hard-cap polling at 3 min
  // so a wedged backend doesn't leave the UI spinning forever.
  async function handleRegenerate() {
    if (regenerating) return;
    if (!workspaceId || workspaceId === 'mock' || workspaceId === 'local') {
      // No real workspace — bail rather than firing a useless API call.
      return;
    }

    setRegenerating(true);
    setJobError(null);
    setJobStatus('queued');

    const job = await runAnalysis(workspaceId);
    if (!job || !job.job_id) {
      setJobError(lang === 'zh'
        ? '启动分析失败,请稍后重试'
        : 'Could not start analysis. Please try again.');
      setJobStatus('failed');
      // Keep the failed state visible for ~3s so the user can read it
      window.setTimeout(() => {
        setRegenerating(false);
        setJobStatus(null);
      }, 3000);
      return;
    }
    setJobStatus(job.status || 'queued');

    const POLL_MS = 1500;
    const MAX_POLLS = Math.floor((3 * 60_000) / POLL_MS); // 3-minute hard cap
    let polls = 0;

    const poll = async () => {
      polls += 1;
      const status = await getAnalysisStatus(workspaceId);
      if (!status) {
        // Network blip — back off but keep trying
        if (polls < MAX_POLLS) {
          pollTimerRef.current = window.setTimeout(poll, POLL_MS);
        }
        return;
      }
      setJobStatus(status.status);

      if (status.status === 'complete') {
        // Refresh the brief + domains + library now that the pipeline finished
        const [fresh, lib, ds] = await Promise.all([
          getBrief(workspaceId, lang),
          getLibrary(workspaceId, lang),
          getDomainScores(workspaceId),
        ]);
        setBrief(fresh);
        setHasHistory((lib || []).length > 0);
        setDomains(ds);
        // Show the ✓ briefly, then reset
        window.setTimeout(() => {
          setRegenerating(false);
          setJobStatus(null);
        }, 1200);
        return;
      }
      if (status.status === 'failed') {
        setJobError(status.error
          || (lang === 'zh' ? '分析失败,请重试' : 'Analysis failed. Please retry.'));
        window.setTimeout(() => {
          setRegenerating(false);
          setJobStatus(null);
        }, 3000);
        return;
      }
      if (polls >= MAX_POLLS) {
        setJobError(lang === 'zh'
          ? '分析超时(>3分钟),请稍后查看'
          : 'Analysis is taking longer than expected. Refresh the page in a few minutes.');
        setJobStatus('failed');
        window.setTimeout(() => {
          setRegenerating(false);
          setJobStatus(null);
        }, 3000);
        return;
      }
      pollTimerRef.current = window.setTimeout(poll, POLL_MS);
    };

    pollTimerRef.current = window.setTimeout(poll, POLL_MS);
  }

  async function handleCopy(c: ContentDraft) {
    try {
      await navigator.clipboard.writeText(formatScriptForCopy(c, lang));
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
    fontFamily: 'var(--font-sans)',
  };
  const container: CSSProperties = { maxWidth: 840, margin: '0 auto' };
  const card: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 6,
    padding: isMobile ? 16 : 24,
  };

  // ─── Loading / error / empty states ───────────────────────────────────

  if (loading) {
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />
          <div className="mt-8 flex items-center gap-3">
            <span
              className="inline-block w-2 h-2 rounded-full animate-pulse"
              style={{ background: 'var(--color-accent)' }}
            />
            <span
              className="text-sm text-[var(--color-text-muted)]"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {lang === 'zh' ? '// 正在生成本周简报…' : '// generating this week’s brief…'}
            </span>
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
          <div className="mt-8 flex flex-col gap-5 items-start">
            <Eyebrow>// error</Eyebrow>
            <Heading as={2} size="section">
              couldn't load the brief
            </Heading>
            <p
              className="text-sm text-[var(--color-text-muted)] border-l-2 border-[var(--color-danger)] pl-3 py-1"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              {lang === 'zh'
                ? '// 无法加载本周简报，请检查网络后重试。'
                : '// could not load this week’s brief. check your connection and retry.'}
            </p>
            <Button variant="accent" size="md" onClick={() => { setError(false); setLoading(true); }}>
              {lang === 'zh' ? '↻ 重试' : '↻ retry'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!brief) {
    const compCount = competitors.length;
    return (
      <div style={pageStyle}>
        <div style={container}>
          <CISubNav />

          {/* Post-onboarding landing — the brief is being generated.
              Builder-energy treatment: dark inverse hero + a recap of what
              the user just configured so the wait feels intentional. */}
          <div
            data-scheme="inverse"
            className="grid-hairline mt-6 rounded-[var(--radius-md)] flex flex-col gap-5 p-8 md:p-10"
            style={{ background: 'var(--color-inverse)', color: 'var(--color-text-inverse)' }}
          >
            <div className="flex items-center gap-3">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: 'var(--color-accent)' }}
              />
              <Eyebrow>// workspace · live</Eyebrow>
            </div>
            <Heading as={1} size="hero">
              your first brief is <Highlight color="amber">being built</Highlight>
            </Heading>
            <div className="flex flex-col gap-2" style={{ fontFamily: 'var(--font-mono)' }}>
              <p className="text-sm">
                <span className="text-[var(--fg-muted)]">{'>'}</span>{' '}
                {lang === 'zh'
                  ? '正在抓取小红书、抖音、天猫的竞品数据'
                  : 'scraping competitor data across xhs, douyin + tmall'}
              </p>
              <p className="text-sm">
                <span className="text-[var(--fg-muted)]">{'>'}</span>{' '}
                {lang === 'zh'
                  ? '首份简报通常在 24–48 小时内生成'
                  : 'your first brief usually lands within 24–48h'}
              </p>
              <p className="text-sm">
                <span className="text-[var(--fg-muted)]">{'>'}</span>{' '}
                {lang === 'zh' ? '准备好后我们会发邮件通知你' : 'we’ll email you the moment it’s ready'}
              </p>
            </div>
          </div>

          {/* Recap — what they set up in onboarding */}
          {workspace?.brand_name && (
            <div
              className="mt-4 rounded-[var(--radius-md)] p-6 flex flex-col gap-4"
              style={{ background: 'var(--color-raised)', border: '1px solid var(--color-border-hairline)' }}
            >
              <Eyebrow>// tracking</Eyebrow>
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className="text-xl font-semibold text-[var(--color-text-primary)]"
                  style={{ fontFamily: 'var(--font-display)' }}
                >
                  {workspace.brand_name}
                </span>
                {workspace.brand_category && (
                  <span
                    className="text-xs text-[var(--color-text-muted)]"
                    style={{ fontFamily: 'var(--font-mono)' }}
                  >
                    {categoryLabel(workspace.brand_category, lang)}
                  </span>
                )}
              </div>
              {compCount > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {competitors.map((c) => (
                    <span
                      key={c.id || c.brand_name}
                      className="text-xs px-2.5 py-1 rounded-[var(--radius-pill)]"
                      style={{
                        fontFamily: 'var(--font-mono)',
                        background: 'var(--color-sunken)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {c.brand_name}
                    </span>
                  ))}
                </div>
              ) : (
                <p
                  className="text-sm text-[var(--color-text-muted)]"
                  style={{ fontFamily: 'var(--font-mono)' }}
                >
                  // {lang === 'zh' ? '前往「品牌」页添加竞品' : 'add competitors from the brands tab'}
                </p>
              )}
              <div className="pt-1">
                <Button variant="outline" size="sm" onClick={() => navigate('/ci/competitors')}>
                  {lang === 'zh' ? '管理竞品 →' : 'manage competitors →'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────────────────────

  return (
    <div style={pageStyle}>
      <div style={container}>
        <CISubNav />

        {/* Page header — masthead style, left-aligned builder treatment */}
        <header
          className="flex flex-col gap-3"
          style={{ margin: '24px 0 32px' }}
        >
          <Eyebrow>
            {lang === 'zh' ? '// 每周竞品行动简报' : '// weekly action brief'}
          </Eyebrow>
          {/* size="section" — matches the shared CIPageHeader used on every
              other CI page so headers are consistent tab-to-tab (issue #79) */}
          <Heading as={1} size="section">
            {formatWeek(brief.week_of, lang)}
          </Heading>
          <div
            className="text-[13px] text-[var(--color-text-muted)]"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {brief.workspace_brand_name} · {lang === 'zh' ? '更新于' : 'updated'}{' '}
            {formatRelativeTime(brief.generated_at, lang)}
          </div>

          {workspace?.brand_name && competitors.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span
                className="text-xs text-[var(--color-text-muted)]"
                style={{ fontFamily: 'var(--font-mono)' }}
              >
                {lang === 'zh' ? '// 追踪' : '// tracking'}{' '}
                <strong className="text-[var(--color-text-primary)]">
                  {workspace.brand_name}
                </strong>{' '}
                {lang === 'zh' ? '对比' : 'vs'}
              </span>
              {competitors.map((c) => (
                <span
                  key={c.id || c.brand_name}
                  title={c.brand_name}
                  className="text-[11px] px-2 py-0.5 rounded-[var(--radius-pill)]"
                  style={{
                    fontFamily: 'var(--font-mono)',
                    background: 'var(--color-sunken)',
                    color: 'var(--color-text-muted)',
                  }}
                >
                  {c.brand_name}
                </span>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Button
              variant={regenerating ? 'outline' : 'accent'}
              size="md"
              onClick={handleRegenerate}
              disabled={regenerating}
            >
              {regenerating
                ? jobStageLabel(jobStatus, lang)
                : `↻ ${lang === 'zh' ? '更新本周简报' : "refresh this week's brief"}`}
            </Button>
          </div>

          {jobError && (
            <div
              className="text-xs text-[var(--color-danger)] border-l-2 border-[var(--color-danger)] pl-3 py-1"
              style={{ fontFamily: 'var(--font-mono)' }}
            >
              // {jobError}
            </div>
          )}
        </header>

        {/* Stale-data warning — softly nudges the user to refresh if the brief
            is older than STALE_DAYS_THRESHOLD days. Disappears while a refresh
            is in progress to avoid flicker. */}
        {!regenerating && brief.generated_at && ageInDays(brief.generated_at) >= STALE_DAYS_THRESHOLD && (
          <div style={{
            marginBottom: 24,
            padding: '12px 16px',
            background: '#f59e0b14',
            border: '1px solid #f59e0b55',
            borderRadius: 10,
            fontSize: 13,
            color: C.t2,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            lineHeight: 1.6,
          }}>
            <span style={{ fontSize: 16 }}>⏰</span>
            <span>
              {lang === 'zh'
                ? `本周简报已生成 ${ageInDays(brief.generated_at)} 天,可能已过期。点击上方"更新本周简报"重新分析。`
                : `This brief is ${ageInDays(brief.generated_at)} days old and may be stale. Click "Refresh This Week's Brief" above to regenerate.`}
            </span>
          </div>
        )}

        {/* ─── SECTION 1: Verdict ─────────────────────────────────────── */}
        {/* Layout (when verdict.pressure_points is present — the structured shape):
              Hero band:    trend pill · context label · headline · 1-line summary
              Pressure grid: 3 cards (one per threat vector), magnitude badge +
                             headline + 2-3 evidence bullets + source citation
              At-risk:      single dramatic stat callout
              Top action:   accent-bordered card (existing pattern)
              Sources:      collapsed disclosure at bottom

            When pressure_points is missing (LLM-generated briefs that pre-date
            the structured shape), we fall back to the legacy single-paragraph
            sentence rendering — see the `else` branch.
        */}
        <section style={{ marginBottom: 28 }}>
          <div style={{
            ...card,
            background: `linear-gradient(135deg, ${C.s1} 0%, ${trendColor(brief.verdict.trend)}08 100%)`,
            borderColor: `${trendColor(brief.verdict.trend)}44`,
          }}>
            {/* Hero band */}
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
              <span style={{ fontSize: 11, color: C.t3, fontFamily: 'var(--font-mono)' }}>
                {lang === 'zh' ? '// 本周市场地位' : '// your position this week'}
              </span>
            </div>
            <h2 style={{
              fontSize: isMobile ? 22 : 30, fontWeight: 700, margin: '0 0 10px',
              lineHeight: 1.2, letterSpacing: -0.5, fontFamily: 'var(--font-display)',
            }}>
              {brief.verdict.headline}
            </h2>
            {(() => {
              const summary = pickLang<string>(brief.verdict.summary, lang, '');
              return summary ? (
                <p style={{ fontSize: isMobile ? 14 : 15, color: C.t2, margin: '0 0 22px', lineHeight: 1.65 }}>
                  {summary}
                </p>
              ) : null;
            })()}

            {/* Structured pressure grid (when present) */}
            {Array.isArray(brief.verdict.pressure_points) && brief.verdict.pressure_points.length > 0 ? (
              <>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(brief.verdict.pressure_points.length, 3)}, 1fr)`,
                  gap: 12,
                  marginBottom: 18,
                }}>
                  {brief.verdict.pressure_points.map((p, idx) => {
                    // Defensive: if backend hasn't been restarted after adding the
                    // resolveLang for these nested fields, badge/headline/evidence/
                    // source still arrive as bilingual {zh, en} objects. pickLang
                    // handles both shapes so the UI never crashes.
                    const badge = pickLang<string>(p.badge, lang, '');
                    const headline = pickLang<string>(p.headline, lang, '');
                    const evidence = pickLang<string[]>(p.evidence, lang, []);
                    const source = pickLang<string>(p.source, lang, '');
                    return (
                      <div key={`${p.brand}-${idx}`} style={{
                        background: C.bg,
                        border: `1px solid ${C.bd}`,
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                          <span style={{
                            fontSize: 13, fontWeight: 800, color: C.tx, letterSpacing: -0.1,
                            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }} title={p.brand}>
                            {p.brand}
                          </span>
                          {badge ? (
                            <span style={{
                              fontSize: 10, fontWeight: 700,
                              color: trendColor(brief.verdict.trend),
                              background: `${trendColor(brief.verdict.trend)}1a`,
                              padding: '3px 8px', borderRadius: 12,
                              letterSpacing: '0.05em', whiteSpace: 'nowrap', flexShrink: 0,
                            }}>
                              {badge}
                            </span>
                          ) : null}
                        </div>
                        {headline ? (
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.tx, lineHeight: 1.4 }}>
                            {headline}
                          </div>
                        ) : null}
                        {Array.isArray(evidence) && evidence.length > 0 ? (
                          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.t2, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {evidence.map((line, i) => (
                              <li key={i}>{typeof line === 'string' ? line : ''}</li>
                            ))}
                          </ul>
                        ) : null}
                        {source ? (
                          <div style={{ fontSize: 10, color: C.t3, marginTop: 'auto', paddingTop: 4, fontStyle: 'italic' }}>
                            {lang === 'zh' ? '来源：' : 'Source: '}{source}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* At-risk callout */}
                {brief.verdict.at_risk ? (() => {
                  const metric = pickLang<string>(brief.verdict.at_risk.metric, lang, '');
                  const magnitude = pickLang<string>(brief.verdict.at_risk.magnitude, lang, '');
                  const narrative = pickLang<string>(brief.verdict.at_risk.narrative, lang, '');
                  // Only render if at least one field has content — otherwise the
                  // callout shows up as an empty colored box.
                  if (!metric && !magnitude && !narrative) return null;
                  return (
                    <div style={{
                      background: `${trendColor(brief.verdict.trend)}0d`,
                      border: `1px solid ${trendColor(brief.verdict.trend)}40`,
                      borderRadius: 10,
                      padding: isMobile ? '14px 16px' : '16px 20px',
                      display: 'flex',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: isMobile ? 10 : 18,
                      marginBottom: 18,
                    }}>
                      <div style={{ flexShrink: 0 }}>
                        {metric ? (
                          <div style={{ fontSize: 10, fontWeight: 700, color: trendColor(brief.verdict.trend), letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>
                            {metric}
                          </div>
                        ) : null}
                        {magnitude ? (
                          <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 800, color: trendColor(brief.verdict.trend), letterSpacing: -0.5, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                            {magnitude}
                          </div>
                        ) : null}
                      </div>
                      {narrative ? (
                        <div style={{ fontSize: 13, color: C.t2, lineHeight: 1.6 }}>
                          {narrative}
                        </div>
                      ) : null}
                    </div>
                  );
                })() : null}
              </>
            ) : (
              /* Legacy fallback: render the single paragraph sentence as before.
                 pickLang handles the rare case where sentence comes through
                 unresolved as a bilingual object. */
              <p style={{ fontSize: 14, color: C.t2, margin: '0 0 18px', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                {pickLang<string>(brief.verdict.sentence, lang, '')}
              </p>
            )}

            {/* Top action — same accent-bordered card as before */}
            <div style={{
              padding: '14px 16px',
              background: `${C.ac}10`, borderLeft: `3px solid ${C.ac}`, borderRadius: 6,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.ac, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
                {lang === 'zh' ? '本周最该做的一件事' : "If you only do one thing"}
              </div>
              <div style={{ fontSize: 14, color: C.tx, lineHeight: 1.6 }}>
                {brief.verdict.top_action}
              </div>
            </div>

            {/* Sources disclosure (collapsed by default) */}
            {Array.isArray(brief.verdict.sources) && brief.verdict.sources.length > 0 ? (
              <details style={{ marginTop: 16 }}>
                <summary style={{
                  fontSize: 11, color: C.t3, cursor: 'pointer', userSelect: 'none',
                  letterSpacing: '0.05em', textTransform: 'uppercase', fontWeight: 600,
                  outline: 'none',
                }}>
                  {lang === 'zh' ? `数据来源 · ${brief.verdict.sources.length} 项` : `Data sources · ${brief.verdict.sources.length}`}
                </summary>
                <ul style={{
                  margin: '8px 0 0', paddingLeft: 18, fontSize: 11, color: C.t3,
                  lineHeight: 1.7, display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  {brief.verdict.sources.map((s, i) => (
                    <li key={i}>{pickLang<string>(s, lang, '')}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </section>

        {/* ─── SECTION 1.5: Competitive map (scatter) ─────────────────────
             Visual companion to the verdict — shows where the user sits vs
             every competitor across any 2 of the 12 indices the user cares
             about. Lives on Brief (not Analytics) because the verdict
             interprets competitive position; the scatter shows it. Falls
             through silently if the indices endpoint returns null. */}
        {indices && Object.keys(indices.indices_by_competitor).length > 0 && (
          <section style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.t3, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', margin: '0 0 6px' }}>
              {lang === 'zh' ? '竞争地图' : 'Competitive map'}
            </h3>
            <p style={{ fontSize: 12, color: C.t3, margin: '0 0 14px', lineHeight: 1.55 }}>
              {lang === 'zh'
                ? '任选 2 项指数作为 X / Y 轴 — 看自己和竞品在矩阵中的相对位置。'
                : "Pick any 2 indices as X / Y — see where you sit vs every competitor in the matrix."}
            </p>
            <IndexScatterPlot data={indices} />
          </section>
        )}

        {/* ─── SECTION 1b: Three moves ──────────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <h3 style={{ fontSize: 12, fontWeight: 600, color: C.t3, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', margin: '0 0 14px' }}>
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
          {/* AI-generated deltas disclaimer — interim trust signal until the
              brand_positioning_pipeline coercer validates numbers against
              raw_inputs. See DATA-FLOW-AND-METRICS-ANALYSIS-2026-05-02.md §3
              Issue 3. Remove this block after the coercer ships. */}
          <div style={{
            padding: '8px 12px', fontSize: 11, color: C.t3,
            background: 'transparent', borderLeft: `2px solid ${C.bd}`,
            marginBottom: 14, lineHeight: 1.6, fontStyle: 'italic',
          }}>
            {lang === 'zh'
              ? '提示:行动叙述由 AI 基于评分数据生成,具体数字请以「分析」页为准。'
              : 'Note: move details are AI-generated from underlying scores. For exact figures, see the Analytics tab.'}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {brief.moves.map((m, i) => (
              <div key={m.id} style={{
                ...card,
                padding: isMobile ? 14 : 18,
                borderLeft: `4px solid ${impactBg(m.impact)}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flexShrink: 0, marginTop: 2 }}>
                    <MetricIcon name={m.icon} size={22} color={impactBg(m.impact)} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.t3, letterSpacing: '0.05em' }}>
                        #{i + 1}
                      </span>
                      {/* Brand chip — combines #17 (deterministic color per
                          brand so it's scannable across Brief/Analytics/Library)
                          + cross-link to Analytics drill (#7 from quick-wins).
                          Click navigates to /ci/analytics?focus_brand=<name>
                          so the user can verify the move's claims against
                          raw score data without losing context. */}
                      <button
                        onClick={() => navigate(`/ci/analytics?focus_brand=${encodeURIComponent(m.brand)}`)}
                        title={lang === 'zh'
                          ? `点击查看 ${m.brand} 的指标得分详情`
                          : `Click to see ${m.brand}'s metric scores on Analytics`}
                        style={{
                          fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
                          padding: '2px 8px', borderRadius: 10,
                          background: brandColorHsl(m.brand, 60, 88),
                          color: brandColorHsl(m.brand, 70, 30),
                          border: `1px solid ${brandColorHsl(m.brand, 50, 75)}`,
                          cursor: 'pointer', lineHeight: 1.2,
                        }}
                      >
                        {m.brand} →
                      </button>
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

        {/* ─── SECTION 1c (W12): Recent alerts ─────────────────────────
            CIAlertFeed renders real alerts from /api/ci/alerts when
            available, falling back to lightweight mock alerts derived
            from the competitor scores so the section has content even
            on first-week visits. The empty state inside the component
            is honest ("No alerts this week — check back soon"). */}
        <section style={{ marginBottom: 40 }}>
          <CIAlertFeed
            workspaceId={workspaceId}
            competitors={[]}
            source="api"
          />
        </section>

        {/* ─── SECTION 2: Content playbook ───────────────────────────── */}
        <section style={{ marginBottom: 40 }}>
          <div style={{ marginBottom: 14 }}>
            <h3 style={{ fontSize: 12, fontWeight: 600, color: C.t3, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', margin: 0 }}>
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {copiedId === c.id
                          ? <>{lang === 'zh' ? '✓ 已复制' : '✓ Copied'}</>
                          : <><ClipboardCopy size={12} strokeWidth={2} />{lang === 'zh' ? '复制脚本' : 'Copy Script'}</>}
                      </span>
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
              <h3 style={{ fontSize: 12, fontWeight: 600, color: C.t3, letterSpacing: '0.16em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', margin: 0 }}>
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
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={14} strokeWidth={2} />
              {lang === 'zh' ? '查看全部12项指标分数（分析师视图）' : 'See all 12 metric scores (analyst view)'}
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
        <Lightbulb size={26} strokeWidth={1.75} color={C.ac} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: C.t3, letterSpacing: '0.14em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            {lang === 'zh' ? '// 产品概念' : '// product concept'}
          </div>
          <h3 style={{ fontSize: isMobile ? 17 : 22, fontWeight: 700, margin: '2px 0 0', fontFamily: 'var(--font-display)', letterSpacing: -0.3 }}>
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
