import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-11 w-full bg-[var(--bg-raised,var(--color-raised))] px-3 text-base",
        "border border-[var(--border,var(--color-border-hairline))] rounded-[var(--radius-xs)]",
        "text-[var(--fg,var(--color-text-primary))] placeholder:text-[var(--color-text-subtle)]",
        "transition-all duration-150 ease-out",
        "focus-visible:outline-none focus-visible:border-[var(--color-text-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent-soft)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
