"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock, useEscapeToClose } from "@/app/ui/use-modal-behavior";

type Props = {
  title: string;
  embedUrl: string;
  moduleCode: string;
  buttonLabel?: string;
  buttonClassName?: string;
};

export function PanoptoDialog({
  title,
  embedUrl,
  moduleCode,
  buttonLabel = "Watch",
  buttonClassName = "rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));
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
