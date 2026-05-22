import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Inline serif-italic for editorial accents inside body copy.
 * Hex.tech-style "pull phrase" — adds gravitas without changing layout.
 *
 *   <p>We help teams <Editorial>see clearly</Editorial> through the noise.</p>
 */
export function Editorial({ className, children, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn("italic", className)}
      style={{ fontFamily: "var(--font-serif)" }}
      {...rest}
    >
      {children}
    </span>
  );
}
