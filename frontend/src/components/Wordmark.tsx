import { cn } from "@/lib/cn";

export interface WordmarkProps {
  size?: "md" | "lg";
  className?: string;
}

export function Wordmark({ size = "md", className }: WordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cn("shrink-0 text-accent", size === "lg" ? "size-7" : "size-5")}
      >
        <path
          d="M2 12h4l2-7 4 14 3-10 2 3h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={cn("font-semibold tracking-tight text-ink", size === "lg" ? "text-xl" : "text-base")}>
        PulseMonitor
      </span>
    </span>
  );
}
