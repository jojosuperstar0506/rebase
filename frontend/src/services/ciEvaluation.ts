/**
 * ciEvaluation — fetch helper for the evaluation (LLM-as-judge) layer.
 *
 * Mirrors the ciIndices.ts pattern: try the API, fall back to null, and
 * short-circuit to fixtures in demo mode.
 *
 * BACKEND CONTRACT (not yet implemented — see SPEC-EVALUATION-LAYER-V1.md)
 *   GET /api/ci/evaluation?workspace_id=<uuid>&lang=<zh|en>
 *   → EvaluationReport
 *
 * The judge pipeline that produces this runs after composite_indices in the
 * orchestrator, reading analysis_results.raw_inputs + weekly_briefs and
 * asking a model to audit them. Shape is identical to demoEvaluation() so
 * swapping the demo for the real endpoint requires no UI change.
 */

import type { EvaluationReport } from './demoFixtures';

const API_BASE = '/api/ci';

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('rebase_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function getEvaluation(
  lang: 'zh' | 'en' = 'zh',
  workspaceId?: string,
): Promise<EvaluationReport | null> {
  // Demo mode: serve the fixture report. Also covers the cost-saving window
  // where the backend is intentionally stopped.
  if (import.meta.env.VITE_DEMO_MODE === 'true') {
    const { demoEvaluation } = await import('./demoFixtures');
    return demoEvaluation(lang);
  }

  if (!workspaceId) return null;

  try {
    const url = `${API_BASE}/evaluation?workspace_id=${encodeURIComponent(workspaceId)}&lang=${lang}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
      // 404 is the expected response until the judge pipeline ships — the
      // page renders its own empty state rather than an error.
      console.warn(`[CI] GET /evaluation → ${res.status}`);
      return null;
    }
    return (await res.json()) as EvaluationReport;
  } catch (err) {
    console.warn('[CI] GET /evaluation → network error', (err as Error).message);
    return null;
  }
}
