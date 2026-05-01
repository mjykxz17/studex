"use client";

import { useState } from "react";

import type { AnnouncementSummary } from "@/lib/contracts";

import { Dialog } from "@/app/ui/primitives/dialog";

type Props = {
  announcement: AnnouncementSummary;
  buttonClassName?: string;
};

export function AnnouncementDetailDialog({
  announcement,
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        Read full
      </button>
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={announcement.title}
        eyebrow={`${announcement.moduleCode} · Announcement · ${announcement.postedLabel}`}
        size="md"
      >
        {announcement.bodyHtml ? (
          <div
            className="prose prose-stone max-w-none"
            dangerouslySetInnerHTML={{ __html: announcement.bodyHtml }}
          />
        ) : (
          <p className="text-sm text-[var(--color-fg-tertiary)]">No body content.</p>
        )}
      </Dialog>
    </>
  );
}
