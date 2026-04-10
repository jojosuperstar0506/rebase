import { useState, useEffect, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { t, T } from '../../i18n';
import CISubNav from '../../components/ci/CISubNav';
import CITrendChart from '../../components/ci/CITrendChart';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useCIData } from '../../hooks/useCIData';
import {
  requestDeepDive, getDeepDiveStatus, getDeepDiveResult, getBrandInsights,
  stableScore,
} from '../../services/ciApi';
import type { DeepDiveJob, DeepDiveResult } from '../../services/ciApi';

// ── Dimension definitions ─────────────────────────────────────────

const DIMENSIONS = [
  { key: 'd1', enKey: 'searchIndex' as const,        zhLabel: '搜索指数',   dotColor: '#6366f1' },
  { key: 'd2', enKey: 'brandVoice' as const,         zhLabel: '品牌声量',   dotColor: '#ec4899' },
  { key: 'd3', enKey: 'contentStrategy' as const,    zhLabel: '内容策略',   dotColor: '#f59e0b' },
  { key: 'd4', enKey: 'kolEcosystem' as const,       zhLabel: 'KOL生态',    dotColor: '#10b981' },
  { key: 'd5', enKey: 'socialCommerce' as const,     zhLabel: '社交电商',   dotColor: '#3b82f6' },
  { key: 'd6', enKey: 'consumerMindshare' as const,  zhLabel: '消费者心智', dotColor: '#8b5cf6' },
  { key: 'd7', enKey: 'channelAuthority' as const,   zhLabel: '渠道权威',   dotColor: '#ef4444' },
];

// Pipeline stages
const STAGES = [
  { status: 'queued',    labelKey: 'queued' as const },
  { status: 'scraping',  labelKey: 'scrapingData' as const },
  { status: 'scoring',   labelKey: 'computingScores' as const },
  { status: 'narrating', labelKey: 'generatingNarrative' as const },
  { status: 'complete',  labelKey: 'detectingAlerts' as const },
];

const STATUS_ORDER = ['queued', 'scraping', 'scoring', 'narrating', 'complete'];

// ── Helpers ───────────────────────────────────────────────────────

function scoreColor(value: number, C: Record<string, string>): string {
  if (value < 40) return C.success;
  if (value < 70) return '#f59e0b';
  return C.danger;
}

function scoreBg(value: number, C: Record<string, string>): string {
  if (value < 40) return `${C.success}14`;
  if (value < 70) return '#f59e0b14';
  return `${C.danger}14`;
}

function formatDateShort(iso: string | null, lang: 'en' | 'zh'): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function generateTrendData(score: number, days: number): { date: string; value: number }[] {
  const result: { date: string; value: number }[] = [];
  const now = new Date();
  for (let i = days; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const noise = Math.sin(i * 0.5) * 8 + Math.cos(i * 0.3) * 5;
    const value = Math.max(0, Math.min(100, Math.round(score - i * 0.3 + noise)));
    result.push({ date: date.toISOString().slice(0, 10), value });
  }
  return result;
}

// ── Pipeline progress ─────────────────────────────────────────────

function PipelineProgress({ job, C, lang }: {
  job: DeepDiveJob;
  C: Record<string, string>;
  lang: 'en' | 'zh';
}) {
  const currentIdx = STATUS_ORDER.indexOf(job.status);

  return (
    <div style={{
      background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
      padding: '24px 28px', marginBottom: 24,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 20, color: C.tx }}>
        {t(T.ci.analysisInProgress, lang)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {STAGES.map((stage, i) => {
          const isDone = currentIdx > i || job.status === 'complete';
          const isActive = currentIdx === i && job.status !== 'complete';
          const isPending = currentIdx < i && job.status !== 'complete';

          return (
            <div key={stage.status} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {/* Status icon */}
              {isDone ? (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', background: C.success,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <svg width={11} height={11} viewBox="0 0 12 12" fill="none">
                    <polyline points="2,6 5,9 10,3" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ) : isActive ? (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', border: `3px solid ${C.ac}`,
                  background: `${C.ac}33`, flexShrink: 0,
                  animation: 'pulse 1.4s ease-in-out infinite',
                }} />
              ) : (
                <div style={{
                  width: 20, height: 20, borderRadius: '50%',
                  border: `2px solid ${C.bd}`, flexShrink: 0,
                }} />
              )}

              {/* Label */}
              <span style={{
                fontSize: 14, color: isDone ? C.success : isActive ? C.ac : C.t3,
                fontWeight: isActive ? 600 : 400,
              }}>
                {t(T.ci[stage.labelKey], lang)}
              </span>

              {/* Status pill */}
              <span style={{ marginLeft: 'auto', fontSize: 11, color: isDone ? C.success : isActive ? C.ac : C.t3 }}>
                {isDone
                  ? t(T.ci.ddComplete, lang)
                  : isActive
                  ? t(T.ci.ddInProgress, lang)
                  : t(T.ci.ddPending, lang)}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(0.88); }
        }
      `}</style>
    </div>
  );
}

// ── Score card ─────────────────────────────────────────────────────

function ScoreCard({ label, value, C, isMobile }: {
  label: string; value: number; C: Record<string, string>; isMobile: boolean;
}) {
  const color = scoreColor(value, C);
  const bg = scoreBg(value, C);
  return (
    <div style={{
      background: bg, border: `1px solid ${color}44`, borderRadius: 12,
      padding: isMobile ? '14px 16px' : '18px 24px', flex: 1, minWidth: 100,
      textAlign: 'center',
    }}>
      <div style={{ fontSize: isMobile ? 28 : 36, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.t2, marginTop: 6, fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ── Dimension tab content ──────────────────────────────────────────

function DimensionContent({ dimKey, rawDimensions, C, lang }: {
  dimKey: string; rawDimensions: any; C: Record<string, string>; lang: 'en' | 'zh';
}) {
  const data = rawDimensions?.[dimKey] || rawDimensions?.[`${dimKey}_search`] || null;

  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return (
      <div style={{ padding: '32px 0', textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
        <div style={{ fontSize: 14, color: C.t3 }}>
          {t(T.ci.noDimensionData, lang)}
        </div>
        <div style={{ fontSize: 12, color: C.t3, marginTop: 6 }}>
          {lang === 'zh'
            ? '连接平台账号或运行采集脚本以获取数据'
            : 'Connect platform accounts or run the scraping agent to collect data'}
        </div>
      </div>
    );
  }

  // Render as key-value pairs
  const entries = typeof data === 'object'
    ? Object.entries(data)
    : [['value', data]];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {entries.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', gap: 12, alignItems: 'flex-start',
          padding: '10px 12px', background: C.s2, borderRadius: 8,
        }}>
          <span style={{
            fontSize: 12, color: C.t2, fontWeight: 600, minWidth: 140, flexShrink: 0,
            textTransform: 'capitalize' as CSSProperties['textTransform'],
          }}>
            {String(k).replace(/_/g, ' ')}
          </span>
          <span style={{ fontSize: 13, color: C.tx, lineHeight: 1.5 }}>
            {String(v)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Products table ─────────────────────────────────────────────────

type ProdSort = 'name' | 'price' | 'sales_volume' | 'review_count' | 'rating';

function ProductsTable({ products, C, lang }: {
  products: any[]; C: Record<string, string>; lang: 'en' | 'zh';
}) {
  const [sortKey, setSortKey] = useState<ProdSort>('sales_volume');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sorted = useMemo(() => {
    return [...products].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });
  }, [products, sortKey, sortDir]);

  function handleSort(key: ProdSort) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  }

  const thStyle: CSSProperties = {
    padding: '9px 12px', fontSize: 11, fontWeight: 700, color: C.t2,
    textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em',
    cursor: 'pointer', userSelect: 'none', background: C.s2,
    borderBottom: `1px solid ${C.bd}`, whiteSpace: 'nowrap',
  };
  const tdStyle: CSSProperties = {
    padding: '9px 12px', fontSize: 13, color: C.tx,
    borderBottom: `1px solid ${C.bd}`, verticalAlign: 'middle',
  };

  const cols: { key: ProdSort; label: string }[] = [
    { key: 'name', label: lang === 'zh' ? '商品名称' : 'Product' },
    { key: 'price', label: lang === 'zh' ? '价格' : 'Price' },
    { key: 'sales_volume', label: lang === 'zh' ? '销量' : 'Sales' },
    { key: 'review_count', label: lang === 'zh' ? '评价数' : 'Reviews' },
    { key: 'rating', label: lang === 'zh' ? '评分' : 'Rating' },
  ];

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {cols.map(col => (
              <th key={col.key} style={thStyle} onClick={() => handleSort(col.key)}>
                {col.label} {sortKey === col.key ? (sortDir === 'desc' ? '▼' : '▲') : '↕'}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((prod, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : `${C.s2}55` }}>
              <td style={tdStyle}>{prod.name || prod.title || '—'}</td>
              <td style={tdStyle}>{prod.price ? `¥${prod.price}` : '—'}</td>
              <td style={tdStyle}>{prod.sales_volume ?? prod.sales ?? '—'}</td>
              <td style={tdStyle}>{prod.review_count ?? prod.reviews ?? '—'}</td>
              <td style={tdStyle}>{prod.rating ? `${prod.rating}★` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────

export default function CIDeepDive() {
  const { colors: C, lang } = useApp();
  const { brandName: encodedBrandName } = useParams<{ brandName: string }>();
  const brandName = decodeURIComponent(encodedBrandName ?? '');
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const { workspace, competitors, dashboard } = useCIData();
  const workspaceId = workspace?.id || '';

  // Find this competitor in the competitors list
  const competitor = competitors.find(c => c.brand_name === brandName);

  // Scores from dashboard brands (fallback to stable seed)
  const brandScores = useMemo(() => {
    const brand = dashboard?.brands?.find(b => b.brand_name === brandName);
    if (brand) return { momentum: brand.momentum_score, threat: brand.threat_index, wtp: brand.wtp_score };
    return {
      momentum: stableScore(brandName, 7, 30, 60),
      threat: stableScore(brandName, 13, 20, 70),
      wtp: stableScore(brandName, 11, 25, 65),
    };
  }, [dashboard, brandName]);

  // Deep dive state
  const [job, setJob] = useState<DeepDiveJob | null>(null);
  const [result, setResult] = useState<DeepDiveResult | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [activeDim, setActiveDim] = useState('d1');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPolling = job && !['complete', 'failed', 'none'].includes(job.status);

  // Stop polling
  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  // Load initial status + result on mount
  useEffect(() => {
    if (!workspaceId || workspaceId === 'local') return;

    // Check if there's an existing job
    getDeepDiveStatus(workspaceId, brandName).then(j => {
      if (j) setJob(j);
      if (j?.status === 'complete') {
        loadResult();
      }
    });

    // Load per-brand insight
    getBrandInsights(workspaceId).then(map => {
      setInsight(map[brandName] ?? null);
    });
  }, [workspaceId, brandName]);

  async function loadResult() {
    if (!workspaceId || workspaceId === 'local') return;
    const r = await getDeepDiveResult(workspaceId, brandName);
    if (r) setResult(r);
  }

  // Poll while job is in progress
  useEffect(() => {
    if (!isPolling) { stopPolling(); return; }
    if (!workspaceId || workspaceId === 'local') return;

    stopPolling();
    pollRef.current = setInterval(async () => {
      const status = await getDeepDiveStatus(workspaceId, brandName);
      if (status) {
        setJob(status);
        if (status.status === 'complete') {
          stopPolling();
          setRunning(false);
          loadResult();
        } else if (status.status === 'failed') {
          stopPolling();
          setRunning(false);
        }
      }
    }, 3000);

    return () => stopPolling();
  }, [isPolling, workspaceId, brandName]);

  async function handleRunAnalysis() {
    if (!workspaceId || workspaceId === 'local') return;
    setRunning(true);
    const j = await requestDeepDive(workspaceId, brandName);
    if (j) {
      setJob(j);
    } else {
      setRunning(false);
    }
  }

  // Styles
  const card: CSSProperties = {
    background: C.s1, border: `1px solid ${C.bd}`, borderRadius: 12,
    padding: isMobile ? 14 : 24, marginBottom: isMobile ? 16 : 24,
  };
  const sectionTitle: CSSProperties = {
    fontSize: 15, fontWeight: 700, marginBottom: 16,
    paddingBottom: 10, borderBottom: `1px solid ${C.bd}`,
  };

  const isInProgress = job && !['complete', 'failed', 'none', null].includes(job.status as any);
  const hasResult = result !== null;
  const lastAnalyzed = result?.last_deep_dive ?? job?.completed_at ?? null;

  return (
    <div style={{
      background: C.bg, color: C.tx, minHeight: '100vh',
      padding: isMobile ? '16px 12px' : '32px 24px',
      fontFamily: 'system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <CISubNav />

        {/* Back link */}
        <Link to="/ci/competitors" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          color: C.t2, textDecoration: 'none', fontSize: 13,
          marginBottom: 20, marginTop: 8,
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {t(T.ci.backToCompetitors, lang)}
        </Link>

        {/* Header card */}
        <div style={card}>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: isMobile ? 'flex-start' : 'center',
            flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? 14 : 0,
          }}>
            <div>
              <h1 style={{ fontSize: isMobile ? 22 : 28, fontWeight: 800, margin: 0, marginBottom: 8 }}>
                {brandName}
              </h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {competitor && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: competitor.tier === 'watchlist' ? `${C.ac}22` : C.s2,
                    color: competitor.tier === 'watchlist' ? C.ac : C.t2,
                    border: `1px solid ${competitor.tier === 'watchlist' ? C.ac : C.bd}`,
                  }}>
                    {competitor.tier === 'watchlist' ? t(T.ci.watchlist, lang) : t(T.ci.landscapeTier, lang)}
                  </span>
                )}
                <span style={{ fontSize: 12, color: C.t3 }}>
                  {lastAnalyzed
                    ? `${t(T.ci.lastAnalyzed, lang)}: ${formatDateShort(lastAnalyzed, lang)}`
                    : t(T.ci.notAnalyzedYet, lang)}
                </span>
              </div>
            </div>

            {/* Run/Re-run Analysis button */}
            <button
              onClick={handleRunAnalysis}
              disabled={running || (isInProgress as boolean)}
              style={{
                background: (running || isInProgress) ? C.s2 : C.ac,
                color: (running || isInProgress) ? C.t2 : '#fff',
                border: 'none', borderRadius: 8,
                padding: isMobile ? '12px 20px' : '10px 20px',
                fontSize: 14, fontWeight: 700, cursor: (running || isInProgress) ? 'default' : 'pointer',
                opacity: (running || isInProgress) ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
                width: isMobile ? '100%' : undefined, justifyContent: 'center',
                minHeight: 44,
              }}
            >
              {(running || isInProgress) ? (
                <>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                    <circle cx={12} cy={12} r={10} strokeDasharray="31.4" strokeDashoffset="10" style={{ animation: 'spin 1s linear infinite' }} />
                  </svg>
                  {t(T.ci.analysisInProgress, lang)}
                </>
              ) : hasResult ? (
                t(T.ci.rerunAnalysis, lang)
              ) : (
                t(T.ci.runAnalysis, lang)
              )}
            </button>
          </div>
        </div>

        <style>{`
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        `}</style>

        {/* Pipeline progress — shown while in progress */}
        {job && isInProgress && (
          <PipelineProgress
            job={job}
            C={C as unknown as Record<string, string>}
            lang={lang}
          />
        )}

        {/* Failed state */}
        {job?.status === 'failed' && (
          <div style={{
            ...card,
            borderLeft: `3px solid ${C.danger}`,
            background: `${C.danger}0a`,
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.danger, marginBottom: 8 }}>
              {t(T.ci.analysisFailed, lang)}
            </div>
            {job.error && (
              <div style={{ fontSize: 13, color: C.t2, marginBottom: 12 }}>{job.error}</div>
            )}
            <button
              onClick={handleRunAnalysis}
              style={{
                background: C.danger, color: '#fff', border: 'none',
                borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {t(T.ci.retry, lang)}
            </button>
          </div>
        )}

        {/* Score cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : 'repeat(3, 1fr)',
          gap: isMobile ? 10 : 16,
          marginBottom: isMobile ? 16 : 24,
        }}>
          <ScoreCard
            label={t(T.ci.momentum, lang)}
            value={brandScores.momentum}
            C={C as unknown as Record<string, string>}
            isMobile={isMobile}
          />
          <ScoreCard
            label={t(T.ci.threat, lang)}
            value={brandScores.threat}
            C={C as unknown as Record<string, string>}
            isMobile={isMobile}
          />
          <ScoreCard
            label={t(T.ci.wtp, lang)}
            value={brandScores.wtp}
            C={C as unknown as Record<string, string>}
            isMobile={isMobile}
          />
        </div>

        {/* AI Insight */}
        <div style={{
          ...card,
          borderLeft: `3px solid ${C.ac}`,
          padding: isMobile ? '14px 16px' : '20px 24px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <svg width={16} height={16} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
              <path d="M8 1L9.5 5.5L14 7L9.5 8.5L8 13L6.5 8.5L2 7L6.5 5.5Z" fill={C.ac} />
            </svg>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{t(T.ci.aiInsight, lang)}</span>
          </div>

          {insight ? (
            <p style={{ fontSize: 14, color: C.tx, lineHeight: 1.8, margin: 0 }}>{insight}</p>
          ) : (
            <p style={{ fontSize: 13, color: C.t3, fontStyle: 'italic', margin: 0 }}>
              {t(T.ci.runInsightHint, lang)}
            </p>
          )}
        </div>

        {/* 7-Dimension Profile */}
        <div style={card}>
          <div style={sectionTitle}>{t(T.ci.dimensionProfile, lang)}</div>

          {/* Dimension tabs */}
          <div style={{
            display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' as CSSProperties['flexWrap'],
          }}>
            {DIMENSIONS.map(dim => {
              const isActive = activeDim === dim.key;
              return (
                <button
                  key={dim.key}
                  onClick={() => setActiveDim(dim.key)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: isMobile ? '6px 10px' : '6px 14px',
                    borderRadius: 20, fontSize: isMobile ? 11 : 12, fontWeight: isActive ? 700 : 400,
                    border: `1px solid ${isActive ? dim.dotColor : C.bd}`,
                    background: isActive ? `${dim.dotColor}18` : 'transparent',
                    color: isActive ? dim.dotColor : C.t2,
                    cursor: 'pointer', whiteSpace: 'nowrap' as CSSProperties['whiteSpace'],
                  }}
                >
                  <div style={{
                    width: 7, height: 7, borderRadius: '50%',
                    background: isActive ? dim.dotColor : C.t3, flexShrink: 0,
                  }} />
                  {lang === 'zh' ? dim.zhLabel : t(T.ci[dim.enKey], lang)}
                </button>
              );
            })}
          </div>

          {/* Selected dimension content */}
          <DimensionContent
            dimKey={activeDim}
            rawDimensions={result?.raw_dimensions}
            C={C as unknown as Record<string, string>}
            lang={lang}
          />
        </div>

        {/* Products table */}
        <div style={card}>
          <div style={sectionTitle}>
            {t(T.ci.productsTitle, lang)}
            {(result?.products?.length ?? 0) > 0 && (
              <span style={{ fontSize: 12, fontWeight: 400, color: C.t3, marginLeft: 8 }}>
                ({result!.products.length})
              </span>
            )}
          </div>

          {(result?.products?.length ?? 0) > 0 ? (
            <ProductsTable
              products={result!.products}
              C={C as unknown as Record<string, string>}
              lang={lang}
            />
          ) : (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📦</div>
              <div style={{ fontSize: 14, color: C.t3 }}>{t(T.ci.noProducts, lang)}</div>
            </div>
          )}
        </div>

        {/* Score Trends */}
        <div style={card}>
          <div style={sectionTitle}>
            {t(T.ci.scoreTrends, lang)}
            <span style={{ fontSize: 11, color: C.t3, fontWeight: 400, marginLeft: 8 }}>
              (30d{lang === 'zh' ? ' · 模拟数据' : ' · simulated'})
            </span>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
            gap: 16,
          }}>
            {[
              { label: t(T.ci.momentum, lang), score: brandScores.momentum, color: C.ac },
              { label: t(T.ci.threat, lang), score: brandScores.threat, color: C.danger },
              { label: t(T.ci.wtp, lang), score: brandScores.wtp, color: C.success },
            ].map(({ label, score, color }) => {
              const trendData = generateTrendData(score, 30);
              return (
                <div key={label} style={{ background: C.s2, borderRadius: 10, padding: '14px 16px', border: `1px solid ${C.bd}` }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 10 }}>{label}</div>
                  <CITrendChart data={trendData} label={label} color={color} height={140} />
                  <div style={{ fontSize: 20, fontWeight: 700, color, marginTop: 8 }}>{score}</div>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
