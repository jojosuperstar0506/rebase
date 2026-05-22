import { type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Scheme } from "@/theme/tokens";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  scheme?: Scheme;
  hairlineGrid?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
}

const padBySize = {
  sm: "py-12 px-6 md:px-10",
  md: "py-20 px-6 md:px-10",
  lg: "py-28 px-6 md:px-10",
  xl: "py-40 px-6 md:px-10",
} as const;

export function Section({
  scheme = "canvas",
  hairlineGrid = false,
  size = "md",
  className,
  children,
  ...rest
}: SectionProps) {
  return (
    <section
      data-scheme={scheme}
      className={cn(
        "w-full bg-[var(--bg)] text-[var(--fg)]",
        padBySize[size],
        hairlineGrid && "grid-hairline",
        className
      )}
      {...rest}
    >
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}
