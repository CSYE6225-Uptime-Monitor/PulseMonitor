import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "none" | "sm" | "md";
  interactive?: boolean;
}

const CARD_BASE = "overflow-hidden rounded-card border border-hairline bg-surface shadow-card";
const CARD_PADDING: Record<"none" | "sm" | "md", string> = { none: "", sm: "p-4", md: "p-6" };
const CARD_INTERACTIVE = "transition-shadow duration-200 hover:shadow-card-hover";

export function Card({ padding = "none", interactive = false, className, children, ...rest }: CardProps) {
  return (
    <div className={cn(CARD_BASE, CARD_PADDING[padding], interactive && CARD_INTERACTIVE, className)} {...rest}>
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, actions, className }: CardHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-hairline px-6 py-4", className)}>
      <div className="min-w-0">
        {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
        {description && <p className="mt-0.5 text-sm text-ink-subtle">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("p-6", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardFooter({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 border-t border-hairline bg-surface-subtle px-6 py-3",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
