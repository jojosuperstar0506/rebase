import { cn } from "@/lib/utils";

export type StepKey = "account" | "brand" | "competitors" | "goals";

export const STEP_ORDER: StepKey[] = ["account", "brand", "competitors", "goals"];

const LABELS: Record<StepKey, string> = {
  account: "account",
  brand: "brand",
  competitors: "competitors",
  goals: "goals",
};

interface Props {
  current: StepKey;
  completed: Set<StepKey>;
  onJump?: (s: StepKey) => void;
}

export function ProgressRail({ current, completed, onJump }: Props) {
  return (
    <div
      className="flex items-center gap-3 w-full"
      style={{ fontFamily: "var(--font-mono)" }}
    >
      {STEP_ORDER.map((s, idx) => {
        const isCurrent = s === current;
        const isDone = completed.has(s);
        const isPast = STEP_ORDER.indexOf(s) < STEP_ORDER.indexOf(current);
        const clickable = isDone || isPast;
        return (
          <button
            key={s}
            type="button"
            onClick={clickable && onJump ? () => onJump(s) : undefined}
            disabled={!clickable}
            className={cn(
              "flex items-center gap-2 min-h-[44px] text-[0.75rem] uppercase tracking-[0.18em] transition-opacity",
              isCurrent ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-subtle)]",
              clickable && "hover:opacity-80 cursor-pointer",
              !clickable && "cursor-default"
            )}
          >
            <span
              className={cn(
                "inline-grid place-items-center h-6 w-6 rounded-[var(--radius-xs)] border text-[0.7rem]",
                isDone &&
                  "bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-neutral-900)]",
                isCurrent &&
                  !isDone &&
                  "bg-[var(--color-text-primary)] border-[var(--color-text-primary)] text-[var(--color-canvas)]",
                !isDone &&
                  !isCurrent &&
                  "bg-transparent border-[var(--color-border-hairline)] text-[var(--color-text-subtle)]"
              )}
            >
              {isDone ? "✓" : idx + 1}
            </span>
            <span>{LABELS[s]}</span>
            {idx < STEP_ORDER.length - 1 && (
              <span className="text-[var(--color-text-subtle)] ml-1">/</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
