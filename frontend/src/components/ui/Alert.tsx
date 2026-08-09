import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export type AlertTone = "error" | "success" | "info";

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

const ALERT_BASE = "flex gap-2.5 rounded-control border px-3.5 py-3 text-sm";

const ALERT_TONES: Record<AlertTone, string> = {
  error: "border-down-hairline bg-down-wash text-down",
  success: "border-success-hairline bg-success-wash text-success",
  info: "border-accent-hairline bg-accent-wash text-accent",
};

export function Alert({ tone = "info", title, children, className }: AlertProps) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn(ALERT_BASE, ALERT_TONES[tone], className)}>
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}
