/**
 * Composite indices service — 12 user-facing indices in 3 pillars.
 *
 * Spec: SPEC-COMPOSITE-INDICES-V1.md
 * Backend: GET /api/ci/indices?workspace_id=UUID&lang=zh|en
 *
 * Bilingual pattern (PR #31): the backend resolves all {zh, en} fields
 * server-side based on ?lang= and returns single-language strings. The
 * client passes lang, renders strings directly, no client-side ternary.
 *
 * Read-only on the client; the Python compute layer is the only writer.
 */

const API_BASE = '/api/ci';

// ─── Types ────────────────────────────────────────────────────────────────

export type IndexName =
  | 'brand_heat' | 'brand_nps' | 'pricing_power_index' | 'loyalty_index'
  | 'content_velocity_index' | 'influencer_footprint' | 'search_dominance'
  | 'hero_product_index' | 'launch_cadence' | 'trend_capture_index'
  | 'innovation_score' | 'promotional_discipline';

export type PillarName = 'brand_equity' | 'marketing_engine' | 'commerce_engine';

export type Direction = 'gaining' | 'steady' | 'losing' | null;

export interface IndexValue {
  score: number | null;
  version: string;
  pillar: PillarName;
  direction: Direction;
  delta: number | null;
  inputs: Record<string, unknown>;
  weights: Record<string, number>;
  /** Resolved server-side via resolveLang. Plain string array in the requested lang. */
  explain_text: string[];
  is_proxy: boolean;
  computed_at: string | null;
}

export interface PillarConfig {
  hero: IndexName;
  supporting: IndexName[];
}

export interface IndexLabelEntry {
  /** Resolved single-language label */
  label: string;
  pillar: PillarName;
}

export interface IndicesResponse {
  workspace_brand_name: string;
  brand_category: string | null;
  /** The lang the backend resolved — echoed for client sanity-checking. */
  lang: 'zh' | 'en';
  hierarchy: { pillars: Record<PillarName, PillarConfig> };
  /** name → resolved label string */
  pillar_labels: Record<PillarName, string>;
  /** name → { label: resolved string, pillar } */
  index_labels: Record<IndexName, IndexLabelEntry>;
  indices_by_competitor: Record<string, Partial<Record<IndexName, IndexValue>>>;
  computed_at: string | null;
}

// ─── Fetch helper (mirrors ciApi.ts pattern) ──────────────────────────────

// Stale-JWT detection — see ciApi.ts isValidAccountSub for rationale.
function isValidAccountSub(sub: string): boolean {
  if (!sub) return false;
  if (sub.includes('@')) return false;
  if (/^[+\-\s()0-9]+$/.test(sub)) return false;
  if (sub.startsWith('anon-')) return true;
  return /^[A-Z0-9_-]{3,}$/.test(sub);
}

function getHeaders(): Record<string, string> {
  const token = localStorage.getItem('rebase_token');
  let userId = '';
  if (token) {
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const candidate = (payload.sub || payload.id || payload.email || '').toString();
      if (isValidAccountSub(candidate)) {
        userId = candidate;
      } else if (candidate) {
        console.warn('[CI Indices] Stale JWT detected. Clearing token; please log in again.');
        localStorage.removeItem('rebase_token');
      }
    } catch {}
  }
  if (!userId) {
    let anonId = localStorage.getItem('rebase_anon_id');
    if (!anonId) {
      anonId = 'anon-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      localStorage.setItem('rebase_anon_id', anonId);
    }
    userId = anonId;
  }
  return { 'Content-Type': 'application/json', 'x-user-id': userId };
}

export async function getIndices(workspaceId: string, lang: 'zh' | 'en' = 'zh'): Promise<IndicesResponse | null> {
  try {
    const url = `${API_BASE}/indices?workspace_id=${encodeURIComponent(workspaceId)}&lang=${lang}`;
    const res = await fetch(url, { headers: getHeaders() });
    if (!res.ok) {
      console.warn(`[CI] GET /indices → ${res.status}`);
      return null;
    }
    return (await res.json()) as IndicesResponse;
  } catch (err) {
    console.warn(`[CI] GET /indices → network error`, (err as Error).message);
    return null;
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────

/**
 * Pick the right axis range for an index. NPS spans -100..100; everything
 * else is 0..100. Used by scatter-plot axis scaling and gauge clamping.
 */
export function indexRange(name: IndexName): { min: number; max: number } {
  if (name === 'brand_nps') return { min: -100, max: 100 };
  return { min: 0, max: 100 };
}

/**
 * Format a score for display. NPS gets explicit minus sign on negative
 * values to match real-world NPS convention; other indices show as integer.
 */
export function formatScore(score: number | null, name: IndexName): string {
  if (score === null) return '—';
  const rounded = Math.round(score);
  if (name === 'brand_nps' && rounded < 0) return `−${Math.abs(rounded)}`;
  return String(rounded);
}

/**
 * Direction → arrow character. Null direction = no prior period yet.
 */
export function directionArrow(d: Direction): string {
  if (d === 'gaining') return '▲';
  if (d === 'losing') return '▼';
  if (d === 'steady') return '→';
  return '';
}

/**
 * Are all competitors' scores null/missing for this index? Used to render
 * the "Coverage pending" honest gap state.
 */
export function isCoveragePending(
  indexName: IndexName,
  indicesByCompetitor: Record<string, Partial<Record<IndexName, IndexValue>>>,
): boolean {
  const entries = Object.values(indicesByCompetitor);
  if (entries.length === 0) return true;
  return entries.every(byBrand => {
    const v = byBrand[indexName];
    return !v || v.score === null;
  });
}
