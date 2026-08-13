/**
 * CIEvaluation — the trust layer.
 *
 * WHY THIS PAGE EXISTS
 * Every other CI page asserts things: "your Brand Heat is 64", "古良吉吉 is
 * absorbing your customers", "¥18.4M is at risk". A customer's reasonable
 * next question is "how do you know, and should I believe it?"
 *
 * This page answers that by running an LLM as a judge over our own output
 * and publishing what it finds — including the parts that do not hold up.
 * Three things get audited:
 *
 *   1. COLLECTION  — did we scrape the right brands, recently enough, with
 *                    plausible values? (Catches the class of bug where an
 *                    auth-walled scrape returns zeros and silently poisons
 *                    every downstream growth calculation.)
 *   2. COMPUTATION — do the stored index scores actually follow from their
 *                    inputs and weights? (Independent recompute + compare.)
 *   3. NARRATIVE   — is every number in the generated copy traceable to real
 *                    data, are all named brands tracked, and are causal
 *                    claims supported by causal evidence?
 *
 * DESIGN INTENT
 * A wall of green checkmarks would be worthless — it reads as marketing.
 * The value is in surfacing the warns honestly, with a recommendation
 * attached to each. A prospect who sees us flag our own linear-extrapolation
 * assumption trusts the other numbers more, not less.
 *
 * Data currently from demoFixtures.demoEvaluation(). The production version
 * calls a judge pipeline on the backend; the shape is identical so the swap
 * is a one-line change in the fetch helper.
 */

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import {
  ShieldCheck, CircleCheck, TriangleAlert, CircleX,
  Database, Calculator, MessageSquareQuote, ChevronDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import type { ColorSet } from '../../theme/colors';
import CISubNav from '../../components/ci/CISubNav';
import { CIPageHeader } from '../../components/ci/CIPageHeader';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { getEvaluation } from '../../services/ciEvaluation';
import type {
  EvaluationReport, EvalCheck, EvalCategory, JudgeVerdict,
} from '../../services/demoFixtures';

// ─── Verdict styling ─────────────────────────────────────────────────────

const VERDICT_COLOR: Record<JudgeVerdict, string> = {
  pass: '#22c55e',
  warn: '#f59e0b',
  fail: '#ef4444',
};

function VerdictIcon({ v, size = 15 }: { v: JudgeVerdict; size?: number }) {
  const color = VERDICT_COLOR[v];
  if (v === 'pass') return <CircleCheck size={size} color={color} />;
  if (v === 'warn') return <TriangleAlert size={size} color={color} />;
  return <CircleX size={size} color={color} />;
}

function verdictLabel(v: JudgeVerdict, lang: string): string {
  if (v === 'pass') return lang === 'zh' ? '通过' : 'Pass';
  if (v === 'warn') return lang === 'zh' ? '需注意' : 'Warning';
  return lang === 'zh' ? '未通过' : 'Fail';
}

// ─── Category metadata ───────────────────────────────────────────────────

const CATEGORY_ORDER: EvalCategory[] = ['collection', 'computation', 'narrative'];

function categoryMeta(c: EvalCategory, lang: string) {
  const zh = lang === 'zh';
  switch (c) {
    case 'collection':
      return {
        Icon: Database,
        title: zh ? '数据采集' : 'Data collection',
        blurb: zh
          ? '我们抓到的是不是正确的品牌、够不够新、数值是否合理。'
          : 'Whether we scraped the right brands, recently enough, with plausible values.',
      };
    case 'computation':
      return {
        Icon: Calculator,
        title: zh ? '指数计算' : 'Index computation',
        blurb: zh
          ? '独立重算每个分值，与存储值比对，验证权重与输入是否按规格应用。'
          : 'Independently recomputes each score against stored values to verify weights and inputs.',
      };
    case 'narrative':
      return {
        Icon: MessageSquareQuote,
        title: zh ? '叙述可信度' : 'Narrative grounding',
        blurb: zh
          ? '生成文案里的每个数字能否溯源，因果断言是否有因果证据支撑。'
          : 'Whether every number in generated copy is traceable, and causal claims have causal evidence.',
      };
  }
}

// ─── Page ────────────────────────────────────────────────────────────────

export default function CIEvaluation() {
  const { colors: C, lang } = useApp();
  const bp = useBreakpoint();
  const isMobile = bp === 'mobile';

  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'all' | JudgeVerdict>('all');

  useEffect(() => {
    let cancelled = false;
    getEvaluation(lang === 'en' ? 'en' : 'zh')
      .then(r => { if (!cancelled) { setReport(r); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [lang]);

  const visible = useMemo(() => {
    if (!report) return [];
    return filter === 'all' ? report.checks : report.checks.filter(c => c.verdict === filter);
  }, [report, filter]);

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const page: CSSProperties = {
    background: C.bg, color: C.tx, minHeight: '100vh',
    padding: isMobile ? '16px 12px' : '32px 24px',
  };
  const container: CSSProperties = { maxWidth: 980, margin: '0 auto' };

  if (loading) {
    return (
      <div style={page}>
        <div style={container}>
          <CISubNav />
          <div style={{ padding: 60, textAlign: 'center', color: C.t3, fontSize: 14 }}>
            {lang === 'zh' ? '正在评估…' : 'Evaluating…'}
          </div>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div style={page}>
        <div style={container}>
          <CISubNav />
          <CIPageHeader
            eyebrow={lang === 'zh' ? '// 评估 · 数据可信度' : '// evaluation · data trust'}
            title={lang === 'zh' ? '评估' : 'Evaluation'}
          />
          <div style={{
            padding: 40, textAlign: 'center', color: C.t3, fontSize: 13,
            border: `1px dashed ${C.bd}`, borderRadius: 12, lineHeight: 1.7,
          }}>
            {lang === 'zh'
              ? '尚无评估报告。评估在每次分析运行完成后自动生成。'
              : 'No evaluation report yet. Evaluation runs automatically after each analysis.'}
          </div>
        </div>
      </div>
    );
  }

  const { summary, trust_score, coverage } = report;

  return (
    <div style={page}>
      <div style={container}>
        <CISubNav />
        <CIPageHeader
          eyebrow={lang === 'zh' ? '// 评估 · 数据可信度' : '// evaluation · data trust'}
          title={lang === 'zh' ? '评估' : 'Evaluation'}
          subtitle={lang === 'zh'
            ? '// 用一个独立模型审计我们自己的采集、计算与叙述'
            : '// an independent model auditing our own collection, computation, and claims'}
        />

        {/* ─── Trust score hero ──────────────────────────────────────── */}
        <section style={{
          border: `1px solid ${C.bd}`, borderRadius: 14, padding: isMobile ? 18 : 24,
          marginBottom: 24, background: C.s1,
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? 18 : 28, alignItems: isMobile ? 'flex-start' : 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 190 }}>
            <ShieldCheck size={30} color={C.ac} />
            <div>
              <div style={{
                fontSize: 40, fontWeight: 700, lineHeight: 1,
                fontFamily: 'var(--font-mono)', color: C.tx,
              }}>
                {trust_score}
                <span style={{ fontSize: 16, color: C.t3, fontWeight: 500 }}>/100</span>
              </div>
              <div style={{ fontSize: 11, color: C.t3, marginTop: 5, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                {lang === 'zh' ? '可信度评分' : 'Trust score'}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginBottom: 10 }}>
              <Stat label={lang === 'zh' ? '通过' : 'Passed'} value={summary.passed} color={VERDICT_COLOR.pass} C={C} />
              <Stat label={lang === 'zh' ? '需注意' : 'Warnings'} value={summary.warned} color={VERDICT_COLOR.warn} C={C} />
              <Stat label={lang === 'zh' ? '未通过' : 'Failed'} value={summary.failed} color={VERDICT_COLOR.fail} C={C} />
            </div>
            <p style={{ fontSize: 12, color: C.t3, margin: 0, lineHeight: 1.65 }}>
              {lang === 'zh'
                ? `覆盖 ${coverage.brands} 个品牌 · ${coverage.indices} 项指数 · ${coverage.claims} 条数据引用。评估模型：${report.model}。`
                : `Covering ${coverage.brands} brands · ${coverage.indices} indices · ${coverage.claims} cited figures. Judge model: ${report.model}.`}
            </p>
          </div>
        </section>

        {/* ─── Why this exists ───────────────────────────────────────── */}
        <div style={{
          padding: '11px 15px', marginBottom: 22,
          background: `${C.ac}0A`, border: `1px dashed ${C.ac}33`,
          borderRadius: 9, fontSize: 12, color: C.t2, lineHeight: 1.7,
        }}>
          {lang === 'zh'
            ? '这一页故意展示我们没通过的检查。一份全是绿勾的报告没有信息量——真正有用的是知道哪些结论可以直接用、哪些需要打折扣。'
            : 'This page deliberately shows the checks we do not pass. An all-green report carries no information — what is useful is knowing which conclusions to act on directly and which to discount.'}
        </div>

        {/* ─── Filter ────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 7, marginBottom: 18, flexWrap: 'wrap' }}>
          {([
            ['all', lang === 'zh' ? `全部 ${summary.total}` : `All ${summary.total}`],
            ['pass', `${verdictLabel('pass', lang)} ${summary.passed}`],
            ['warn', `${verdictLabel('warn', lang)} ${summary.warned}`],
            ['fail', `${verdictLabel('fail', lang)} ${summary.failed}`],
          ] as Array<[typeof filter, string]>).map(([key, label]) => {
            const active = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                style={{
                  padding: '5px 12px', borderRadius: 20, fontSize: 12,
                  fontFamily: 'var(--font-mono)', cursor: 'pointer',
                  border: `1px solid ${active ? C.ac : C.bd}`,
                  background: active ? `${C.ac}18` : 'transparent',
                  color: active ? C.ac : C.t2,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ─── Checks by category ────────────────────────────────────── */}
        {CATEGORY_ORDER.map(cat => {
          const checks = visible.filter(c => c.category === cat);
          if (checks.length === 0) return null;
          const meta = categoryMeta(cat, lang);
          const { Icon } = meta;
          return (
            <section key={cat} style={{ marginBottom: 30 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5 }}>
                <Icon size={15} color={C.t2} />
                <h3 style={{
                  fontSize: 12, fontWeight: 600, color: C.t2, margin: 0,
                  letterSpacing: '0.14em', textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)',
                }}>
                  {meta.title}
                </h3>
                <span style={{ fontSize: 11, color: C.t3, fontFamily: 'var(--font-mono)' }}>
                  {checks.length}
                </span>
              </div>
              <p style={{ fontSize: 12, color: C.t3, margin: '0 0 13px', lineHeight: 1.6 }}>
                {meta.blurb}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {checks.map(check => (
                  <CheckCard
                    key={check.id}
                    check={check}
                    open={expanded.has(check.id)}
                    onToggle={() => toggle(check.id)}
                    C={C}
                    lang={lang}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            </section>
          );
        })}

        <div style={{
          marginTop: 28, paddingTop: 16, borderTop: `1px solid ${C.bd}`,
          fontSize: 11, color: C.t3, lineHeight: 1.7, fontFamily: 'var(--font-mono)',
        }}>
          {lang === 'zh'
            ? `最后评估于 ${new Date(report.evaluated_at).toLocaleString('zh-CN')} · 每次分析运行后自动重新评估`
            : `Last evaluated ${new Date(report.evaluated_at).toLocaleString('en-US')} · re-runs automatically after each analysis`}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────

function Stat({ label, value, color, C }: {
  label: string; value: number; color: string; C: ColorSet;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
      <span style={{ fontSize: 21, fontWeight: 700, color, fontFamily: 'var(--font-mono)' }}>
        {value}
      </span>
      <span style={{ fontSize: 11, color: C.t3, letterSpacing: '0.06em' }}>{label}</span>
    </div>
  );
}

function CheckCard({ check, open, onToggle, C, lang, isMobile }: {
  check: EvalCheck; open: boolean; onToggle: () => void;
  C: ColorSet; lang: string; isMobile: boolean;
}) {
  const color = VERDICT_COLOR[check.verdict];
  return (
    <div style={{
      border: `1px solid ${C.bd}`, borderLeft: `3px solid ${color}`,
      borderRadius: 10, background: C.s1, overflow: 'hidden',
    }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', textAlign: 'left', background: 'transparent',
          border: 'none', cursor: 'pointer', padding: isMobile ? '13px 14px' : '14px 17px',
          display: 'flex', alignItems: 'flex-start', gap: 11, color: 'inherit',
        }}
      >
        <span style={{ marginTop: 1, flexShrink: 0 }}><VerdictIcon v={check.verdict} /></span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 9,
            flexWrap: 'wrap', marginBottom: 3,
          }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, color: C.tx }}>{check.title}</span>
            <span style={{
              fontSize: 10.5, color: C.t3, fontFamily: 'var(--font-mono)',
              padding: '1px 7px', borderRadius: 4, background: C.s2,
            }}>
              {check.subject}
            </span>
          </span>
          <span style={{ display: 'block', fontSize: 12.5, color: C.t2, lineHeight: 1.65 }}>
            {check.finding}
          </span>
        </span>
        <span style={{
          display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0, marginTop: 1,
        }}>
          <span style={{ fontSize: 10.5, color: C.t3, fontFamily: 'var(--font-mono)' }}>
            {check.confidence}%
          </span>
          <ChevronDown
            size={14}
            color={C.t3}
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
          />
        </span>
      </button>

      {open && (
        <div style={{
          padding: isMobile ? '0 14px 14px 39px' : '0 17px 15px 42px',
          display: 'flex', flexDirection: 'column', gap: 11,
        }}>
          <div>
            <div style={{
              fontSize: 10, color: C.t3, letterSpacing: '0.12em',
              textTransform: 'uppercase', marginBottom: 5, fontFamily: 'var(--font-mono)',
            }}>
              {lang === 'zh' ? '证据' : 'Evidence'}
            </div>
            <ul style={{
              margin: 0, paddingLeft: 16, fontSize: 12, color: C.t2,
              lineHeight: 1.85, display: 'flex', flexDirection: 'column', gap: 1,
            }}>
              {check.evidence.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          </div>

          {check.recommendation && (
            <div style={{
              padding: '10px 13px', borderRadius: 8,
              background: `${color}0F`, border: `1px solid ${color}33`,
            }}>
              <div style={{
                fontSize: 10, color, letterSpacing: '0.12em',
                textTransform: 'uppercase', marginBottom: 4,
                fontFamily: 'var(--font-mono)', fontWeight: 700,
              }}>
                {lang === 'zh' ? '建议' : 'Recommendation'}
              </div>
              <div style={{ fontSize: 12.5, color: C.tx, lineHeight: 1.65 }}>
                {check.recommendation}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
