import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const INPUT_BASE =
  "block h-10 w-full rounded-control border border-hairline-strong bg-surface px-3 " +
  "text-sm text-ink shadow-control transition-colors " +
  "placeholder:text-ink-faint hover:border-ink-subtle focus-ring " +
  "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-ink-faint";

const INPUT_INVALID = "border-danger hover:border-danger";

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input
      className={cn(INPUT_BASE, invalid && INPUT_INVALID, className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}
