"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import type {
  CanvasFileSummary,
  CanvasPageSummary,
  CourseModuleSummary,
  WeeklyTask,
} from "@/lib/contracts";

import { panoptoEmbedUrl } from "@/lib/canvas-url";
import { useBodyScrollLock, useEscapeToClose } from "@/app/ui/use-modal-behavior";
import { AssignmentDetailDialog } from "@/app/ui/assignment-detail-dialog";
import { FilePreviewDialog } from "@/app/ui/file-preview-dialog";
import { PageViewerDialog } from "@/app/ui/page-viewer-dialog";

import { Pill } from "../shared";

type Props = {
  moduleCode: string;
  courseModules: CourseModuleSummary[];
  pages: CanvasPageSummary[];
  files: CanvasFileSummary[];
  tasks: WeeklyTask[];
};

export function ModuleTree({ moduleCode, courseModules, pages, files, tasks }: Props) {
  if (courseModules.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center">
        <p className="text-[12px] text-stone-500">No Canvas modules yet — sync to populate the lecturer&apos;s structure.</p>
      </div>
    );
  }

  // Lookup maps that mirror Canvas's content_ref semantics:
  // - Page items: content_ref is the Canvas page_url (matches pages[].pageUrl)
  // - File items: content_ref is the Canvas file_id (matches files[].canvasFileId)
  // - Assignment items: content_ref is the Canvas assignment_id (matches tasks[].sourceRefId, NOT tasks[].id)
  const pagesByUrl = new Map(pages.map((p) => [p.pageUrl, p]));
  const fileByCanvasId = new Map(
    files
      .filter((f): f is CanvasFileSummary & { canvasFileId: string } => Boolean(f.canvasFileId))
      .map((f) => [f.canvasFileId, f]),
  );
  const taskBySourceRef = new Map<string, WeeklyTask>();
  for (const t of tasks) {
    if (t.sourceRefId) taskBySourceRef.set(t.sourceRefId, t);
  }

  return (
    <div className="flex flex-col gap-4">
      {courseModules.map((m) => (
        <section key={m.id} className="rounded-[10px] border border-stone-200 bg-white">
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Pill tone="blue">#{m.position ?? "?"}</Pill>
              <h4 className="text-[13px] font-semibold text-stone-900">{m.name}</h4>
            </div>
            <span className="text-[11px] text-stone-500">{m.itemsCount ?? m.items.length} items</span>
          </header>
          <ul className="flex flex-col">
            {m.items.map((it) => {
              const indentPx = 16 + (it.indent ?? 0) * 16;
              const baseClass = "flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-2 last:border-b-0";
              const titleClass = "text-[12px] text-stone-800";

              if (it.itemType === "SubHeader") {
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{it.title}</span>
                  </li>
                );
              }

              if (it.itemType === "Page" && it.contentRef) {
                const page = pagesByUrl.get(it.contentRef);
                if (!page) {
                  return (
                    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                      <span className={titleClass}>{it.title}</span>
                      <span className="text-[10px] text-stone-400">page not synced</span>
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <PageViewerDialog page={page} moduleCode={moduleCode} buttonLabel="Open" />
                  </li>
                );
              }

              if (it.itemType === "File" && it.contentRef) {
                const file = fileByCanvasId.get(it.contentRef);
                if (!file) {
                  return (
                    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                      <span className={titleClass}>{it.title}</span>
                      <span className="text-[10px] text-stone-400">file not synced</span>
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <FilePreviewDialog file={file} moduleCode={moduleCode} buttonLabel="Open" />
                  </li>
                );
              }

              if (it.itemType === "Assignment" && it.contentRef) {
                const task = taskBySourceRef.get(it.contentRef);
                if (!task) {
                  return (
                    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                      <span className={titleClass}>{it.title}</span>
                      <span className="text-[10px] text-stone-400">assignment not synced</span>
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <AssignmentDetailDialog taskId={task.id} title={task.title} moduleCode={moduleCode} buttonLabel="Open" />
                  </li>
                );
              }

              if (it.itemType === "ExternalUrl" && it.externalUrl) {
                const embed = panoptoEmbedUrl(it.externalUrl);
                if (embed) {
                  return (
                    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                      <span className={titleClass}>{it.title}</span>
                      <PanoptoDialog title={it.title} embedUrl={embed} moduleCode={moduleCode} />
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <a
                      href={it.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
                    >
                      Open link
                    </a>
                  </li>
                );
              }

              return (
                <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                  <span className={titleClass}>{it.title}</span>
                  <span className="text-[10px] text-stone-400">{it.itemType}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PanoptoDialog({ title, embedUrl, moduleCode }: { title: string; embedUrl: string; moduleCode: string }) {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
      >
        Watch
      </button>
      {typeof document !== "undefined" && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
              }}
            >
              <div className="flex h-full items-center justify-center">
                <div className="flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-black shadow-2xl">
                  <div className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                      {moduleCode} · Recording
                    </p>
                    <h2 className="text-lg font-semibold tracking-tight text-stone-950 truncate">{title}</h2>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>
                  <iframe
                    src={embedUrl}
                    title={title}
                    className="h-full w-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
