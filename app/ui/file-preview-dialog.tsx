"use client";

import { useEffect, useState } from "react";

import type { CanvasFileSummary } from "@/lib/contracts";

import { isVideoFilename } from "@/lib/canvas-url";
import { Dialog } from "@/app/ui/primitives/dialog";

type FilePreviewDialogProps = {
  file: CanvasFileSummary;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

export function FilePreviewDialog({
  file,
  moduleCode,
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
  buttonLabel = "Preview",
}: FilePreviewDialogProps) {
  const [isOpen, setIsOpen] = useState(false);

  const [docxState, setDocxState] = useState<
    | { kind: "idle" }
    | { kind: "ready"; html: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const isDocx = file.name.toLowerCase().endsWith(".docx");

  useEffect(() => {
    if (!isOpen || !isDocx || docxState.kind !== "idle") return;
    let cancelled = false;
    fetch(`/api/files/${file.id}/docx`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setDocxState({ kind: "error", message: json.error ?? "Failed to render DOCX" });
          return;
        }
        setDocxState({ kind: "ready", html: json.html });
      })
      .catch((err) => {
        if (cancelled) return;
        setDocxState({ kind: "error", message: err instanceof Error ? err.message : "Failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, isDocx, file.id, docxState.kind]);

  const previewUrl = `/api/files/${file.id}/preview`;
  const extractedPreview = file.extractedText?.slice(0, 20_000).trim() ?? "";

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={file.name}
        eyebrow={`${moduleCode} preview`}
        size="xl"
        bodyClassName="min-h-0 flex-1 flex flex-col"
      >
        {/* Meta-strip: pill chips + secondary source link + open raw */}
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-border)] px-6 py-3 text-[11px]">
          <span className="rounded-full bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-fg-primary)]">
            {file.category}
          </span>
          <span className="rounded-full bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-fg-primary)]">
            {file.uploadedLabel}
          </span>
          {file.canvasUrl ? (
            <a
              href={file.canvasUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-medium text-[var(--color-fg-tertiary)] underline-offset-2 hover:text-[var(--color-fg-primary)] hover:underline"
            >
              View source on Canvas
            </a>
          ) : null}
          {file.previewKind === "pdf" || file.previewKind === "image" ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] font-medium text-[var(--color-fg-tertiary)] underline-offset-2 hover:text-[var(--color-fg-primary)] hover:underline"
            >
              Open raw preview
            </a>
          ) : null}
        </div>
        {/* Body — full conditional ladder */}
        <div className="min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-primary)]">
          {isVideoFilename(file.name) ? (
            <video
              controls
              src={previewUrl}
              className="h-full w-full bg-black"
              preload="metadata"
            >
              <p className="p-4 text-sm">Your browser doesn&apos;t support inline video playback.</p>
            </video>
          ) : file.previewKind === "image" ? (
            <div className="flex h-full items-center justify-center overflow-auto bg-[var(--color-bg-secondary)] p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt={file.name} className="max-h-full max-w-full rounded-xl object-contain shadow-sm" />
            </div>
          ) : file.previewKind === "pdf" ? (
            <iframe title={file.name} src={previewUrl} className="h-full w-full bg-white" />
          ) : isDocx ? (
            docxState.kind === "ready" ? (
              <div className="h-full overflow-auto p-6">
                <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: docxState.html }} />
              </div>
            ) : docxState.kind === "error" ? (
              <div className="p-5 text-sm text-[var(--color-danger)]">DOCX render failed: {docxState.message}</div>
            ) : (
              <div className="p-5 text-sm text-[var(--color-fg-tertiary)]">Rendering DOCX…</div>
            )
          ) : file.previewKind === "text" && extractedPreview ? (
            <div className="h-full overflow-auto p-5">
              <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[var(--color-fg-primary)]">{extractedPreview}</pre>
            </div>
          ) : file.previewKind === "office" && extractedPreview ? (
            <div className="h-full overflow-auto p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-fg-tertiary)]">Extracted text fallback</p>
              <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[var(--color-fg-primary)]">{extractedPreview}</pre>
            </div>
          ) : extractedPreview ? (
            <div className="h-full overflow-auto p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--color-fg-tertiary)]">Extracted text</p>
              <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-[var(--color-fg-primary)]">{extractedPreview}</pre>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <p className="text-sm font-semibold text-[var(--color-fg-primary)]">Inline preview is not available for this format yet.</p>
                <p className="mt-2 text-sm leading-6 text-[var(--color-fg-tertiary)]">
                  Studex hasn&apos;t added a renderer for this format. The extracted text (when available) will appear in the cheatsheet pipeline.
                </p>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
