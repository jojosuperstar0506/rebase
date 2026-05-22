import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "font-mono text-[0.75rem] uppercase tracking-[0.18em] text-[var(--fg-muted)]",
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
