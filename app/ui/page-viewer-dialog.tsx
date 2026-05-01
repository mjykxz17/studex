"use client";

import { useEffect, useState } from "react";

import type { CanvasPageSummary } from "@/lib/contracts";

import { Dialog } from "@/app/ui/primitives/dialog";

type Props = {
  page: CanvasPageSummary;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "ready"; html: string; title: string }
  | { kind: "error"; message: string };

export function PageViewerDialog({
  page,
  moduleCode,
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
  buttonLabel = "Open",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!isOpen || state.kind !== "idle") return;
    let cancelled = false;
    fetch(`/api/pages/${page.id}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load page" });
          return;
        }
        setState({ kind: "ready", html: json.bodyHtml, title: json.title });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, page.id, state.kind]);

  const closeDialog = () => {
    setIsOpen(false);
    setState({ kind: "idle" });
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      <Dialog
        open={isOpen}
        onClose={closeDialog}
        title={state.kind === "ready" ? state.title : page.title}
        eyebrow={`${moduleCode} · Page`}
        size="lg"
      >
        {state.kind === "error" ? (
          <p className="text-sm text-[var(--color-danger)]">Failed to load page: {state.message}</p>
        ) : state.kind === "ready" ? (
          <div
            className="prose prose-stone max-w-none"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        ) : (
          <p className="text-sm text-[var(--color-fg-tertiary)]">Loading…</p>
        )}
      </Dialog>
    </>
  );
}
