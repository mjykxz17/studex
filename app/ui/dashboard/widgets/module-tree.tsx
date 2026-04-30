"use client";

import { useState } from "react";

import type {
  CanvasFileSummary,
  CanvasPageSummary,
  CourseModuleSummary,
  WeeklyTask,
} from "@/lib/contracts";

import { isZoomUrl, panoptoEmbedUrl, parseZoomPasscode } from "@/lib/canvas-url";
import { AssignmentDetailDialog } from "@/app/ui/assignment-detail-dialog";
import { FilePreviewDialog } from "@/app/ui/file-preview-dialog";
import { PageViewerDialog } from "@/app/ui/page-viewer-dialog";
import { PanoptoDialog } from "@/app/ui/panopto-dialog";

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
                const zoomPasscode = isZoomUrl(it.externalUrl) ? parseZoomPasscode(it.title) : null;
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <div className="flex items-center gap-2">
                      {zoomPasscode ? <CopyPasscodeButton passcode={zoomPasscode} /> : null}
                      <a
                        href={it.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
                      >
                        Open link
                      </a>
                    </div>
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

function CopyPasscodeButton({ passcode }: { passcode: string }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(passcode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in insecure contexts; silently no-op.
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Copy passcode: ${passcode}`}
      className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
    >
      {copied ? "Copied" : "Copy passcode"}
    </button>
  );
}

