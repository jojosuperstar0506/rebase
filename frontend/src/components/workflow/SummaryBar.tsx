import { useState, useEffect, useRef, useCallback } from "react";
import type { GapAnalysis, ComparisonData } from "../../types/workflow";

// Design tokens
const S1 = "#14141e";
const S2 = "#1c1c28";
const BD = "#2a2a3a";
const TX = "#e4e4ec";
const T2 = "#9898a8";
const AC = "#06b6d4";

const RED = "#ef4444";
const AMBER = "#f59e0b";
const GREEN = "#22c55e";

interface SummaryBarProps {
  analysis: GapAnalysis;
  comparison: ComparisonData | null;
  currentView: "original" | "optimized";
}

// ─── Animated counter ───

function useAnimatedCounter(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  const animate = useCallback(
    (timestamp: number) => {
      if (startTime.current === null) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(target * eased));
      if (progress < 1) {
        rafId.current = requestAnimationFrame(animate);
      }
    },
    [target, duration]
  );

  useEffect(() => {
    startTime.current = null;
    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
  }, [animate]);

  return value;
}

// ─── Single metric card (v1.0 layout) ───

interface MetricCardProps {
  icon: string;
  label: string;
  value: string;
  accentColor: string;
}

function MetricCard({ icon, label, value, accentColor }: MetricCardProps) {
  return (
    <div
      className="sb-card"
      style={{
        padding: "12px 16px",
        borderLeft: `3px solid ${accentColor}`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <div className="sb-label" style={{ fontSize: 13, color: T2 }}>
        {icon} {label}
      </div>
      <div
        className="sb-value"
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: accentColor === TX ? TX : accentColor,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// ─── Comparison table ───

const COLS = [
  { key: "manual",    label: "手动步骤" },
  { key: "time",      label: "总耗时" },
  { key: "dailyCost", label: "每日成本" },
  { key: "autoRate",  label: "自动化率" },
  { key: "monthly",   label: "月成本" },
] as const;

type ColKey = (typeof COLS)[number]["key"];

interface RowValues {
  manual:    string;
  time:      string;
  dailyCost: string;
  autoRate:  string;
  monthly:   string;
}

interface DeltaNumbers {
  manual:    number;
  time:      number;
  dailyCost: number;
  autoRate:  number;
  monthly:   number;
}

function ComparisonTable({
  analysis,
  comparison,
  currentView,
}: {
  analysis: GapAnalysis;
  comparison: ComparisonData;
  currentView: "original" | "optimized";
}) {
  const totalSteps = analysis.manual_step_count + analysis.automated_step_count;
  const origAutoRate = Math.round(analysis.automation_rate * 100);
  const origDailyCost = Math.round(analysis.total_cost_rmb);
  const origMonthly = Math.round(origDailyCost * 22);

  // Optimized metrics derived from optimized graph nodes
  const optNodes = comparison.optimized.nodes;
  const optTotal = optNodes.length;
  const optManual = optNodes.filter((n) => n.is_manual).length;
  const optAutomated = optNodes.filter((n) => !n.is_manual).length;
  const optTime = Math.round(optNodes.reduce((s, n) => s + (n.avg_time_minutes ?? 0), 0));
  const optDailyCost = Math.round(optTime * 0.75);
  const optAutoRate = optTotal > 0 ? Math.round((optAutomated / optTotal) * 100) : 0;
  const optMonthly = Math.round(optDailyCost * 22);

  const origRow: RowValues = {
    manual:    `${analysis.manual_step_count}/${totalSteps}`,
    time:      `${analysis.total_time_minutes}分钟`,
    dailyCost: `¥${origDailyCost}`,
    autoRate:  `${origAutoRate}%`,
    monthly:   `¥${origMonthly.toLocaleString()}`,
  };

  const optRow: RowValues = {
    manual:    `${optManual}/${optTotal}`,
    time:      `${optTime}分钟`,
    dailyCost: `¥${optDailyCost}`,
    autoRate:  `${optAutoRate}%`,
    monthly:   `¥${optMonthly.toLocaleString()}`,
  };

  // Raw delta numbers for animated counters
  const deltaRaw: DeltaNumbers = {
    manual:    analysis.manual_step_count - optManual,
    time:      analysis.total_time_minutes - optTime,
    dailyCost: origDailyCost - optDailyCost,
    autoRate:  optAutoRate - origAutoRate,
    monthly:   origMonthly - optMonthly,
  };

  // Animated delta counters
  const animManual    = useAnimatedCounter(deltaRaw.manual);
  const animTime      = useAnimatedCounter(deltaRaw.time);
  const animDailyCost = useAnimatedCounter(deltaRaw.dailyCost);
  const animAutoRate  = useAnimatedCounter(deltaRaw.autoRate);
  const animMonthly   = useAnimatedCounter(deltaRaw.monthly);

  const animDelta: Record<ColKey, string> = {
    manual:    deltaRaw.manual    >= 0 ? `↓${animManual}步`          : `↑${Math.abs(animManual)}步`,
    time:      deltaRaw.time      >= 0 ? `↓${animTime}分钟`          : `↑${Math.abs(animTime)}分钟`,
    dailyCost: deltaRaw.dailyCost >= 0 ? `↓¥${animDailyCost}`        : `↑¥${Math.abs(animDailyCost)}`,
    autoRate:  deltaRaw.autoRate  >= 0 ? `↑${animAutoRate}%`         : `↓${Math.abs(animAutoRate)}%`,
    monthly:   deltaRaw.monthly   >= 0 ? `↓¥${animMonthly.toLocaleString()}` : `↑¥${Math.abs(animMonthly).toLocaleString()}`,
  };

  const cellStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 13,
    textAlign: "right" as const,
    whiteSpace: "nowrap" as const,
  };

  const labelCellStyle: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: 13,
    color: T2,
    fontWeight: 600,
    whiteSpace: "nowrap" as const,
    minWidth: 80,
  };

  function renderRow(
    rowLabel: string,
    values: RowValues,
    rowBg: string,
    valueColor: string,
    leftBorder?: string,
    isDelta?: boolean
  ) {
    return (
      <tr style={{ background: rowBg, borderLeft: leftBorder ? `3px solid ${leftBorder}` : "3px solid transparent" }}>
        <td style={{ ...labelCellStyle, color: T2 }}>{rowLabel}</td>
        {COLS.map((col) => (
          <td
            key={col.key}
            style={{
              ...cellStyle,
              color: valueColor,
              fontWeight: isDelta ? 700 : 400,
              fontSize: isDelta ? 14 : 13,
            }}
          >
            {values[col.key]}
          </td>
        ))}
      </tr>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: S1,
          border: `1px solid ${BD}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <thead>
          <tr style={{ background: S2 }}>
            <th style={{ ...labelCellStyle, color: T2, fontWeight: 600, textAlign: "left" }}></th>
            {COLS.map((col) => (
              <th
                key={col.key}
                style={{
                  ...cellStyle,
                  color: T2,
                  fontWeight: 600,
                  borderBottom: `1px solid ${BD}`,
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Row 1 — Current workflow */}
          {renderRow(
            "当前流程",
            origRow,
            S2,
            TX,
            currentView === "original" ? RED : undefined
          )}
          {/* Row 2 — Optimized / best-in-class */}
          {renderRow(
            "🏆 行业标杆",
            optRow,
            S1,
            AC,
            currentView === "optimized" ? AC : undefined
          )}
          {/* Divider */}
          <tr><td colSpan={6} style={{ height: 1, background: BD, padding: 0 }} /></tr>
          {/* Row 3 — Delta */}
          {renderRow(
            "可优化空间",
            animDelta,
            `${GREEN}0a`,
            GREEN,
            undefined,
            true
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main export ───

export default function SummaryBar({ analysis, comparison, currentView }: SummaryBarProps) {
  const totalSteps = analysis.manual_step_count + analysis.automated_step_count;
  const manualPct = totalSteps > 0 ? analysis.manual_step_count / totalSteps : 0;
  const automationPct = Math.round(analysis.automation_rate * 100);
  const benchmarkPct = Math.round(analysis.industry_benchmark_rate * 100);

  const totalMonthlySavings = analysis.opportunities.reduce(
    (sum, o) => sum + o.estimated_cost_saved_rmb,
    0
  );

  // Animated values (v1.0 single-row mode)
  const animManual   = useAnimatedCounter(analysis.manual_step_count);
  const animTime     = useAnimatedCounter(analysis.total_time_minutes);
  const animCost     = useAnimatedCounter(Math.round(analysis.total_cost_rmb));
  const animRate     = useAnimatedCounter(automationPct);
  const animSavings  = useAnimatedCounter(totalMonthlySavings);

  // Color logic
  const manualColor = manualPct > 0.6 ? RED : TX;
  const timeColor   = analysis.total_time_minutes > 120 ? AMBER : TX;
  const rateColor   = automationPct < 30 ? RED : automationPct < 50 ? AMBER : GREEN;

  return (
    <div
      style={{
        background: S1,
        borderBottom: `1px solid ${BD}`,
        padding: "16px 24px",
      }}
    >
      <style>{`
        .sb-grid { display: flex; flex-wrap: wrap; gap: 8px; }
        .sb-card { flex: 1 1 140px; min-width: 130px; }
        @media (max-width: 768px) {
          .sb-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
          .sb-card { flex: unset; min-width: unset; padding: 10px 12px !important; }
          .sb-card .sb-label { font-size: 11px !important; }
          .sb-card .sb-value { font-size: 18px !important; }
        }
        @media (max-width: 480px) {
          .sb-grid { grid-template-columns: repeat(2, 1fr); }
        }
      `}</style>

      {comparison ? (
        <ComparisonTable
          analysis={analysis}
          comparison={comparison}
          currentView={currentView}
        />
      ) : (
        <div className="sb-grid">
          <MetricCard icon={"\u{1F534}"} label="手动步骤"  value={`${animManual}/${totalSteps}`}          accentColor={manualColor} />
          <MetricCard icon={"\u23F1\uFE0F"} label="总耗时" value={`${animTime}分钟`}                     accentColor={timeColor}   />
          <MetricCard icon={"\u{1F4B0}"} label="每日成本"  value={`¥${animCost}`}                        accentColor={TX}          />
          <MetricCard icon={"\u{1F4CA}"} label="自动化率"  value={`${animRate}%`}                        accentColor={rateColor}   />
          <MetricCard icon={"\u{1F3C6}"} label="行业标杆"  value={`${benchmarkPct}%`}                    accentColor={AC}          />
          <MetricCard icon={"\u{1F4A1}"} label="月节省潜力" value={`¥${animSavings.toLocaleString()}`}   accentColor={GREEN}       />
        </div>
      )}
    </div>
  );
}
