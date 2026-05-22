import { type HTMLAttributes, type ElementType } from "react";
import { cn } from "@/lib/utils";

type Level = 1 | 2 | 3 | 4;
type Size = "display" | "hero" | "section" | "card";

interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: Level;
  size?: Size;
}

const sizeClasses: Record<Size, string> = {
  display: "text-[clamp(3rem,7vw,4.5rem)] leading-[1.02] tracking-[-0.02em] font-bold",
  hero: "text-[clamp(2.25rem,5vw,3.5rem)] leading-[1.05] tracking-[-0.015em] font-bold",
  section: "text-[clamp(1.75rem,3.5vw,2.5rem)] leading-[1.1] tracking-[-0.01em] font-semibold",
  card: "text-xl leading-snug tracking-tight font-semibold",
};

export function Heading({
  as = 2,
  size = "section",
  className,
  children,
  ...rest
}: HeadingProps) {
  const Tag = `h${as}` as ElementType;
  return (
    <Tag
      className={cn(
        "font-[var(--font-display)] text-[var(--fg)]",
        sizeClasses[size],
        className
      )}
      style={{ fontFamily: "var(--font-display)" }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
