import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface FieldProps {
  htmlFor: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ htmlFor, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {/* The required marker is a CSS ::after, not a DOM text node - Testing
          Library's getByLabelText matches on the label's raw textContent, so
          a "*" span here would silently break every `getByLabelText("Name")`
          call in the app the moment `required` is passed. */}
      <label
        htmlFor={htmlFor}
        className={cn(
          "block text-sm font-medium text-ink",
          required && "after:ml-0.5 after:text-danger after:content-['*']"
        )}
      >
        {label}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-ink-subtle">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
