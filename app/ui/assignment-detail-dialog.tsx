"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock, useEscapeToClose } from "./use-modal-behavior";

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
  buttonClassName = "rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700",
  buttonLabel = "Details",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useBodyScrollLock(isOpen);

  const closeDialog = () => {
    setIsOpen(false);
    setState({ kind: "idle" });
  };

  useEscapeToClose(isOpen, closeDialog);

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

  const dueLabel =
    state.kind === "ready" && state.dueAt
      ? new Date(state.dueAt).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })
      : null;

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      {typeof document !== "undefined" && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) closeDialog();
              }}
            >
              <div className="flex h-full items-center justify-center">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="flex h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white shadow-2xl"
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                        {moduleCode} · Assignment {dueLabel ? `· Due ${dueLabel}` : ""}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold tracking-tight text-stone-950">
                        {state.kind === "ready" ? state.title : title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={closeDialog}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-6">
                    {state.kind === "ready" ? (
                      state.descriptionHtml ? (
                        <div
                          className="prose prose-stone max-w-none"
                          dangerouslySetInnerHTML={{ __html: state.descriptionHtml }}
                        />
                      ) : (
                        <p className="text-sm text-stone-500">No description provided.</p>
                      )
                    ) : state.kind === "error" ? (
                      <p className="text-sm text-rose-700">Failed to load: {state.message}</p>
                    ) : (
                      <p className="text-sm text-stone-500">Loading…</p>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
