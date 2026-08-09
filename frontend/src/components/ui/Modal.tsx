"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Modal({ open, onClose, title, children, className }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener("cancel", handleCancel);
    return () => dialog.removeEventListener("cancel", handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={cn(
        "m-auto mx-4 w-[calc(100%-2rem)] max-w-md rounded-card border border-hairline bg-surface p-0 shadow-lg sm:mx-auto sm:w-full",
        "backdrop:bg-ink/40 backdrop:backdrop-blur-[2px]",
        "open:animate-in open:fade-in-0 open:zoom-in-95",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3 border-b border-hairline px-6 py-4">
        {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="focus-ring -mr-1 -mt-1 ml-auto rounded-xs p-1 text-ink-muted hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="px-6 py-5">{children}</div>
    </dialog>
  );
}
