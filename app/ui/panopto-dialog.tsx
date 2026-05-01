"use client";

import { useState } from "react";

import { Dialog } from "@/app/ui/primitives/dialog";

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
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        eyebrow={`${moduleCode} · Recording`}
        size="xl"
        bareBody
      >
        <iframe
          src={embedUrl}
          title={title}
          className="h-full w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </Dialog>
    </>
  );
}
