import { useState, useEffect, useRef, useCallback } from "react";
import type { GapAnalysis } from "../../types/workflow";

// Design tokens
const S1 = "#14141e";
const BD = "#2a2a3a";
const TX = "#e4e4ec";
const T2 = "#9898a8";
const AC = "#06b6d4";

const RED = "#ef4444";
const AMBER = "#f59e0b";
const GREEN = "#22c55e";

interface SummaryBarProps {
  analysis: GapAnalysis;
}

function useAnimatedCounter(target: number, duration = 800): number {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  const animate = useCallback(
    (timestamp: number) => {
      if (startTime.current === null) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out: 1 - (1 - t)^3
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

interface MetricCardProps {
  icon: string;
  label: string;
  value: string;
  accentColor: string;
  animatedNumber?: number;
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

export default function SummaryBar({ analysis }: SummaryBarProps) {
  const totalSteps = analysis.manual_step_count + analysis.automated_step_count;
  const manualPct = totalSteps > 0 ? analysis.manual_step_count / totalSteps : 0;
  const automationPct = Math.round(analysis.automation_rate * 100);
  const benchmarkPct = Math.round(analysis.industry_benchmark_rate * 100);

  const totalMonthlySavings = analysis.opportunities.reduce(
    (sum, o) => sum + o.estimated_cost_saved_rmb,
    0
  );

  // Animated values
  const animManual = useAnimatedCounter(analysis.manual_step_count);
  const animTime = useAnimatedCounter(analysis.total_time_minutes);
  const animCost = useAnimatedCounter(Math.round(analysis.total_cost_rmb));
  const animRate = useAnimatedCounter(automationPct);
  const animSavings = useAnimatedCounter(totalMonthlySavings);

  // Color logic
  const manualColor = manualPct > 0.6 ? RED : TX;
  const timeColor = analysis.total_time_minutes > 120 ? AMBER : TX;
  const rateColor = automationPct < 30 ? RED : automationPct < 50 ? AMBER : GREEN;

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
      <div className="sb-grid">
        <MetricCard
          icon={"\u{1F534}"}
          label="手动步骤"
          value={`${animManual}/${totalSteps}`}
          accentColor={manualColor}
        />
        <MetricCard
          icon={"\u23F1\uFE0F"}
          label="总耗时"
          value={`${animTime}分钟`}
          accentColor={timeColor}
        />
        <MetricCard
          icon={"\u{1F4B0}"}
          label="每日成本"
          value={`¥${animCost}`}
          accentColor={TX}
        />
        <MetricCard
          icon={"\u{1F4CA}"}
          label="自动化率"
          value={`${animRate}%`}
          accentColor={rateColor}
        />
        <MetricCard
          icon={"\u{1F3C6}"}
          label="行业标杆"
          value={`${benchmarkPct}%`}
          accentColor={AC}
        />
        <MetricCard
          icon={"\u{1F4A1}"}
          label="月节省潜力"
          value={`¥${animSavings.toLocaleString()}`}
          accentColor={GREEN}
        />
      </div>
    </div>
  );
}
