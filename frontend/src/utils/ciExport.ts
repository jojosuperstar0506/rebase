// ── CI Export Utilities ────────────────────────────────────────────────────────
// CSV: pure string generation + Blob download + BOM for Chinese Excel compatibility
// PDF: browser print dialog (user saves as PDF) — no npm deps required

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function toCsvRow(cells: (string | number | null | undefined)[]): string {
  return cells
    .map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`)
    .join(',');
}

// ── Toast notification ────────────────────────────────────────────────────────

export function showExportToast(message: string, colors: Record<string, string>): void {
  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: colors.s1 ?? '#1e1e2e',
    color: colors.tx ?? '#e2e8f0',
    border: `1px solid ${colors.bd ?? '#2d2d44'}`,
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '13px',
    fontFamily: 'system-ui, sans-serif',
    zIndex: '9999',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    whiteSpace: 'nowrap',
    opacity: '1',
    transition: 'opacity 0.3s',
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      if (document.body.contains(toast)) document.body.removeChild(toast);
    }, 300);
  }, 2200);
}

// ── CSV: competitor list from Dashboard ──────────────────────────────────────

export interface DashboardBrandRow {
  brand_name: string;
  tier?: string;
  momentum_score?: number;
  threat_index?: number;
  wtp_score?: number;
  group?: string;
  trend_signals?: string[];
}

export function exportDashboardCSV(brands: DashboardBrandRow[], filename?: string): void {
  const headers = [
    'Brand Name',
    'Tier',
    'Momentum Score',
    'Threat Index',
    'WTP Score',
    'Group',
    'Trend Signals',
  ];

  const rows = brands.map(b => [
    b.brand_name,
    b.tier ?? '',
    b.momentum_score ?? '',
    b.threat_index ?? '',
    b.wtp_score ?? '',
    b.group ?? '',
    (b.trend_signals ?? []).join('; '),
  ]);

  const csv = [headers, ...rows].map(toCsvRow).join('\n');

  // BOM is critical for Chinese characters to display correctly in Excel
  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename ?? `rebase-ci-dashboard-${dateStr()}.csv`);
}

// ── CSV: enriched competitor profiles from CICompetitors page ────────────────

export interface CompetitorProfileRow {
  brand_name: string;
  tier?: string;
  momentum_score?: number;
  threat_index?: number;
  wtp_score?: number;
  avg_price?: number;
  est_monthly_volume?: number;
  positioning?: string;
  group?: string;
  platforms?: { name: string; status: string }[];
  added_via?: string;
  created_at?: string;
}

export function exportCompetitorsCSV(brands: CompetitorProfileRow[], filename?: string): void {
  const headers = [
    'Brand Name',
    'Tier',
    'Momentum Score',
    'Threat Index',
    'WTP Score',
    'Avg Price (¥)',
    'Est Monthly Volume',
    'Positioning',
    'Group',
    'Platforms',
    'Added Via',
    'Added Date',
  ];

  const rows = brands.map(b => [
    b.brand_name,
    b.tier ?? '',
    b.momentum_score ?? '',
    b.threat_index ?? '',
    b.wtp_score ?? '',
    b.avg_price ?? '',
    b.est_monthly_volume ?? '',
    b.positioning ?? '',
    b.group ?? '',
    (b.platforms ?? [])
      .filter(p => p.status !== 'none')
      .map(p => p.name)
      .join('; '),
    b.added_via ?? '',
    b.created_at ? new Date(b.created_at).toLocaleDateString() : '',
  ]);

  const csv = [headers, ...rows].map(toCsvRow).join('\n');

  const bom = '\uFEFF';
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename ?? `rebase-competitors-${dateStr()}.csv`);
}

// ── PDF via browser print ─────────────────────────────────────────────────────

export function exportDashboardPDF(): void {
  const printStyles = `
    @media print {
      /* Hide everything by default */
      body > * { display: none !important; }

      /* Show only the print area */
      #ci-print-area {
        display: block !important;
        position: static !important;
        width: 100% !important;
        background: white !important;
        color: black !important;
        font-family: system-ui, sans-serif !important;
        padding: 0 !important;
        margin: 0 !important;
      }

      /* Make all children of print area visible */
      #ci-print-area * {
        visibility: visible !important;
        color: black !important;
        background: white !important;
        border-color: #e2e8f0 !important;
      }

      /* Hide elements tagged as no-print */
      #ci-print-area [data-no-print] {
        display: none !important;
      }

      /* Show elements tagged as print-only */
      #ci-print-area [data-print-only] {
        display: block !important;
      }

      /* Override colored score bars — keep them visible as gray */
      #ci-print-area .score-bar-fill {
        background: #94a3b8 !important;
      }

      /* SVG elements — let browser render them */
      #ci-print-area svg {
        max-width: 100% !important;
      }

      /* Page settings */
      @page {
        margin: 1.5cm;
        size: A4 landscape;
      }

      /* Clean up table */
      #ci-print-area table {
        border-collapse: collapse !important;
        width: 100% !important;
        font-size: 11px !important;
      }
      #ci-print-area th,
      #ci-print-area td {
        border: 1px solid #e2e8f0 !important;
        padding: 6px 8px !important;
        text-align: left !important;
      }
      #ci-print-area th {
        background: #f8fafc !important;
        font-weight: 700 !important;
      }

      /* Stat cards in a row */
      #ci-print-area .stat-card-grid {
        display: grid !important;
        grid-template-columns: repeat(4, 1fr) !important;
        gap: 12px !important;
      }
    }
  `;

  const style = document.createElement('style');
  style.id = 'ci-print-style';
  style.textContent = printStyles;
  document.head.appendChild(style);

  window.print();

  // Clean up after print dialog closes (slight delay for Safari)
  setTimeout(() => {
    const el = document.getElementById('ci-print-style');
    if (el) document.head.removeChild(el);
  }, 1500);
}
