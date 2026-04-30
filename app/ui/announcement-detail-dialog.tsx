"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import type { AnnouncementSummary } from "@/lib/contracts";

import { useBodyScrollLock, useEscapeToClose } from "./use-modal-behavior";

type Props = {
  announcement: AnnouncementSummary;
  buttonClassName?: string;
};

export function AnnouncementDetailDialog({
  announcement,
  buttonClassName = "rounded-[8px] border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-medium text-stone-700",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        Read full
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
                <div
                  role="dialog"
                  aria-modal="true"
                  className="flex h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white shadow-2xl"
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                        {announcement.moduleCode} · Announcement · {announcement.postedLabel}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold tracking-tight text-stone-950">
                        {announcement.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-6">
                    {announcement.bodyHtml ? (
                      <div
                        className="prose prose-stone max-w-none"
                        dangerouslySetInnerHTML={{ __html: announcement.bodyHtml }}
                      />
                    ) : (
                      <p className="text-sm text-stone-500">No body content.</p>
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
