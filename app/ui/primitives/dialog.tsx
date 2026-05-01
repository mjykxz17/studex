"use client";

import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import { cn } from "@/app/ui/primitives/cn";
import { useBodyScrollLock, useEscapeToClose } from "@/app/ui/use-modal-behavior";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  size?: Size;
  bodyClassName?: string;
  bareBody?: boolean;
  children: ReactNode;
};

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  size = "lg",
  bodyClassName,
  bareBody = false,
  children,
}: Props) {
  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      data-testid="dialog-backdrop"
      className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "flex h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lift)] sm:h-[calc(100vh-3rem)]",
            SIZE_CLASSES[size],
          )}
          style={{ animation: "studex-dialog-in 250ms var(--ease-out)" }}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-4 sm:px-6">
            <div>
              {eyebrow ? (
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-[var(--color-fg-primary)]">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-secondary)] motion-hover hover:text-[var(--color-fg-primary)]"
            >
              Close
            </button>
          </div>
          <div className={cn(bareBody ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-auto p-6", bodyClassName)}>
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
