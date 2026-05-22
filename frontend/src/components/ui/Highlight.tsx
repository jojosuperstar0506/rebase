import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Color = "lime" | "amber" | "cyan";

interface HighlightProps extends HTMLAttributes<HTMLSpanElement> {
  color?: Color;
}

const bgByColor: Record<Color, string> = {
  lime: "var(--color-accent)",
  amber: "var(--color-highlight)",
  cyan: "var(--color-data-cyan)",
};

/**
 * Syntax-highlighter marker behind text. Builder-energy emphasis —
 * like a code editor selection or a yellow highlighter pen.
 *
 *   <Heading>We help teams <Highlight>see clearly</Highlight></Heading>
 */
export function Highlight({ color = "lime", className, children, style, ...rest }: HighlightProps) {
  return (
    <span
      className={cn("relative inline-block px-1.5 -mx-1.5", className)}
      style={{
        background: bgByColor[color],
        color: color === "cyan" ? "#fff" : "var(--color-neutral-900)",
        ...style,
      }}
      {...rest}
    >
      {children}
    </span>
  );
}
