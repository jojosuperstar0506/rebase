import { cn } from "@/lib/utils";

interface BrandChipProps {
  name: string;
  category?: string;
  initials?: string;
  className?: string;
}

export function BrandChip({ name, category, initials, className }: BrandChipProps) {
  const computedInitials =
    initials ??
    name
      .split(/\s+/)
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 pl-1.5 pr-3 py-1.5",
        "border border-[var(--border,var(--color-border-hairline))]",
        "rounded-[var(--radius-pill)] bg-[var(--bg-raised,var(--color-raised))]",
        className
      )}
    >
      <span
        className="grid place-items-center h-6 w-6 rounded-full bg-[var(--color-accent)] text-[var(--color-neutral-900)] text-[0.7rem] font-semibold"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        {computedInitials}
      </span>
      <span className="text-sm font-medium text-[var(--fg)] leading-none">{name}</span>
      {category && (
        <>
          <span className="text-[var(--color-text-subtle)]">·</span>
          <span
            className="text-[0.7rem] uppercase tracking-wider text-[var(--fg-muted,var(--color-text-muted))] leading-none"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {category}
          </span>
        </>
      )}
    </div>
  );
}
