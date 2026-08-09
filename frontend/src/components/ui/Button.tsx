import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control " +
  "font-medium transition-colors focus-ring disabled:pointer-events-none disabled:opacity-50";

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
};

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white shadow-control hover:bg-accent-hover active:bg-accent-active",
  secondary:
    "border border-hairline-strong bg-surface text-ink shadow-control " +
    "hover:bg-surface-subtle active:bg-surface-hover",
  danger: "bg-danger text-white shadow-control hover:bg-danger-hover active:bg-danger-active",
  ghost: "text-ink-subtle hover:bg-surface-hover hover:text-ink active:bg-hairline",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(BASE, SIZES[size], VARIANTS[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && (
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 animate-spin">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
          <path d="M14 8a6 6 0 0 0-6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )}
      {children}
    </button>
  );
}

export interface TextLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
}

export function TextLink({ href, className, ...rest }: TextLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring rounded-xs text-sm font-medium text-accent underline-offset-2 " +
          "transition-colors hover:text-accent-hover hover:underline active:text-accent-active",
        className
      )}
      {...rest}
    />
  );
}
