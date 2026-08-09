import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export function Table({ children, className, ...rest }: HTMLAttributes<HTMLTableElement> & { children: ReactNode }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn("w-full border-separate border-spacing-0 text-sm", className)} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-surface-subtle">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="[&>tr:last-child>td]:border-b-0">{children}</tbody>;
}

export function TR({ children, className, ...rest }: HTMLAttributes<HTMLTableRowElement> & { children: ReactNode }) {
  return (
    <tr className={cn("transition-colors hover:bg-surface-subtle", className)} {...rest}>
      {children}
    </tr>
  );
}

export interface THProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right";
}

export function TH({ children, align = "left", className, ...rest }: THProps) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-hairline px-4 py-2.5 text-left text-xs font-medium uppercase " +
          "tracking-wide text-ink-subtle",
        align === "right" && "text-right",
        className
      )}
      {...rest}
    >
      {children}
    </th>
  );
}

export interface TDProps extends TdHTMLAttributes<HTMLTableCellElement> {
  numeric?: boolean;
  strong?: boolean;
}

export function TD({ children, numeric, strong, className, ...rest }: TDProps) {
  return (
    <td
      className={cn(
        "border-b border-hairline px-4 py-3 align-middle text-ink-muted",
        numeric && "text-right tabular-nums text-ink",
        strong && "font-medium text-ink",
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
