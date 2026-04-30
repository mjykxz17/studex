"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { CanvasFileSummary } from "@/lib/contracts";

import { isVideoFilename } from "@/lib/canvas-url";
import { useBodyScrollLock, useEscapeToClose } from "./use-modal-behavior";

type FilePreviewDialogProps = {
  file: CanvasFileSummary;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

export function FilePreviewDialog({
  file,
  moduleCode,
  buttonClassName = "rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700",
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
    fetch(`/api/files/${file.id}/docx`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setDocxState({ kind: "error", message: json.error ?? "Failed to render DOCX" });
          return;
        }
        setDocxState({ kind: "ready", html: json.html });
      })
      .catch((err) => setDocxState({ kind: "error", message: err instanceof Error ? err.message : "Failed" }));
  }, [isOpen, isDocx, file.id, docxState.kind]);

  const previewUrl = `/api/files/${file.id}/preview`;
  const extractedPreview = file.extractedText?.slice(0, 20_000).trim() ?? "";
  const description =
    file.summary ||
    "View synced Canvas content directly in Studex — PDFs, images, DOCX, and videos render inline. Use the source link only as a fallback.";

  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));

  return (
    <>
      <button type="button" aria-haspopup="dialog" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>

      {typeof document !== "undefined" && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  setIsOpen(false);
                }
              }}
            >
              <div className="flex h-full items-center justify-center">
                <div
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby={`file-preview-title-${file.id}`}
                  aria-describedby={`file-preview-description-${file.id}`}
                  className="flex h-[calc(100vh-2rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-[rgba(255,255,252,0.98)] shadow-2xl sm:h-[calc(100vh-3rem)]"
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4 sm:px-6">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">{moduleCode} preview</p>
                      <h2 id={`file-preview-title-${file.id}`} className="mt-2 text-lg font-semibold tracking-tight text-stone-950">
                        {file.name}
                      </h2>
                      <p
                        id={`file-preview-description-${file.id}`}
                        className="mt-2 max-w-3xl whitespace-pre-line text-[12px] leading-6 text-stone-500"
                      >
                        {description}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col gap-4 bg-stone-50/80 p-4 sm:p-6">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-100/80 px-2.5 py-1 text-xs font-semibold text-blue-800">{file.category}</span>
                      <span className="rounded-full bg-stone-200/80 px-2.5 py-1 text-xs font-semibold text-stone-700">{file.uploadedLabel}</span>
                      {file.canvasUrl ? (
                        <a
                          href={file.canvasUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[10px] font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
                        >
                          View source on Canvas
                        </a>
                      ) : null}
                      {(file.previewKind === "pdf" || file.previewKind === "image") ? (
                        <a
                          href={previewUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-[8px] border border-stone-300 px-3 py-1.5 text-[11px] font-semibold text-stone-700"
                        >
                          Open raw preview
                        </a>
                      ) : null}
                    </div>

                    <div className="min-h-0 flex-1 overflow-hidden rounded-[10px] border border-stone-200 bg-white">
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
                        <div className="flex h-full items-center justify-center overflow-auto bg-stone-100 p-4">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={previewUrl} alt={file.name} className="max-h-full max-w-full rounded-xl object-contain shadow-sm" />
                        </div>
                      ) : file.previewKind === "pdf" ? (
                        <iframe title={file.name} src={previewUrl} className="h-full w-full bg-white" />
                      ) : file.previewKind === "text" && extractedPreview ? (
                        <div className="h-full overflow-auto p-5">
                          <pre className="whitespace-pre-wrap break-words font-mono text-sm leading-6 text-stone-700">{extractedPreview}</pre>
                        </div>
                      ) : isDocx ? (
                        docxState.kind === "ready" ? (
                          <div className="h-full overflow-auto p-6">
                            <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: docxState.html }} />
                          </div>
                        ) : docxState.kind === "error" ? (
                          <div className="p-5 text-sm text-rose-700">DOCX render failed: {docxState.message}</div>
                        ) : (
                          <div className="p-5 text-sm text-stone-500">Rendering DOCX…</div>
                        )
                      ) : file.previewKind === "office" && extractedPreview ? (
                        <div className="h-full overflow-auto p-5">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Extracted text fallback</p>
                          <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-stone-700">{extractedPreview}</pre>
                        </div>
                      ) : extractedPreview ? (
                        <div className="h-full overflow-auto p-5">
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-stone-400">Extracted text</p>
                          <pre className="mt-4 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-stone-700">{extractedPreview}</pre>
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center px-6 text-center">
                          <div>
                            <p className="text-sm font-semibold text-stone-900">Inline preview is not available for this format yet.</p>
                            <p className="mt-2 text-sm leading-6 text-stone-500">
                              Studex hasn&apos;t added a renderer for this format. The extracted text (when available) will appear in the cheatsheet pipeline.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
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
