"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@/app/ui/primitives/dialog";

type Props = {
  taskId: string;
  title: string;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "ready"; descriptionHtml: string; dueAt: string | null; title: string }
  | { kind: "error"; message: string };

export function AssignmentDetailDialog({
  taskId,
  title,
  moduleCode,
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
  buttonLabel = "Details",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!isOpen || state.kind !== "idle") return;
    let cancelled = false;
    fetch(`/api/tasks/${taskId}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load assignment" });
          return;
        }
        setState({
          kind: "ready",
          descriptionHtml: json.descriptionHtml,
          dueAt: json.dueAt,
          title: json.title,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "Failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, taskId, state.kind]);

  const closeDialog = () => {
    setIsOpen(false);
    setState({ kind: "idle" });
  };

  const dueLabel =
    state.kind === "ready" && state.dueAt
      ? new Date(state.dueAt).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })
      : null;

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      <Dialog
        open={isOpen}
        onClose={closeDialog}
        title={state.kind === "ready" ? state.title : title}
        eyebrow={`${moduleCode} · Assignment${dueLabel ? ` · Due ${dueLabel}` : ""}`}
        size="md"
      >
        {state.kind === "error" ? (
          <p className="text-sm text-[var(--color-danger)]">Failed to load: {state.message}</p>
        ) : state.kind === "ready" ? (
          state.descriptionHtml ? (
            <div
              className="prose prose-stone max-w-none"
              dangerouslySetInnerHTML={{ __html: state.descriptionHtml }}
            />
          ) : (
            <p className="text-sm text-[var(--color-fg-tertiary)]">No description provided.</p>
          )
        ) : (
          <p className="text-sm text-[var(--color-fg-tertiary)]">Loading…</p>
        )}
      </Dialog>
    </>
  );
}
