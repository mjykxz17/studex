"use client";

import { useState } from "react";

import type { AnnouncementSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

export function RecentAnnouncementsWidget({
  announcements,
  seenAnnouncements,
  onMarkAnnouncementSeen,
}: {
  announcements: AnnouncementSummary[];
  seenAnnouncements: Record<string, boolean>;
  onMarkAnnouncementSeen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <SectionCard title="Recent announcements" eyebrow="Latest updates across all modules">
      {announcements.length === 0 ? (
        <EmptyState title="No recent announcements." copy="Announcements will appear here once Canvas publishes them." />
      ) : (
        <div className="space-y-2">
          {announcements.map((announcement) => {
            const unseen = !seenAnnouncements[announcement.id];
            const isExpanded = !!expanded[announcement.id];
            return (
              <div
                key={announcement.id}
                role="button"
                tabIndex={0}
                onClick={() => toggle(announcement.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggle(announcement.id);
                  }
                }}
                aria-expanded={isExpanded}
                className={`w-full rounded-[10px] border px-3 py-3 text-left cursor-pointer ${unseen ? "border-blue-200 bg-blue-50/40" : "border-stone-200 bg-[#fcfbf9]"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.08em]" style={{ color: colorForModule(announcement.moduleCode) }}>
                    {announcement.moduleCode}
                  </span>
                  <span className="text-[10px] text-stone-400">{announcement.postedLabel}</span>
                </div>
                <p className="mt-2 text-[13px] font-medium leading-5 text-stone-900">{announcement.title}</p>
                <p className={`mt-1 text-[12px] leading-5 text-stone-600 ${isExpanded ? "" : "line-clamp-3"}`}>
                  {announcement.summary}
                </p>
                {isExpanded ? (
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onMarkAnnouncementSeen(announcement.id);
                      }}
                      className="rounded-[7px] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600"
                    >
                      {seenAnnouncements[announcement.id] ? "Seen" : "Mark seen"}
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
