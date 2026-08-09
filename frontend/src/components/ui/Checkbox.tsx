import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  id: string;
  label: string;
  description?: string;
}

export function Checkbox({ id, label, description, className, ...rest }: CheckboxProps) {
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 size-4 shrink-0 cursor-pointer rounded-[4px] border border-hairline-strong
                   bg-surface accent-accent transition-colors focus-ring
                   disabled:cursor-not-allowed disabled:opacity-50"
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-ink-subtle">{description}</p>}
      </div>
    </div>
  );
}
