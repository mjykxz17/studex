"use client";

import { useState } from "react";

import type { AnnouncementSummary, ModuleSummary, WeeklyTask } from "@/lib/contracts";

import { FileCard } from "./widgets/file-card";
import { colorForModule, EmptyState, Pill, SectionCard } from "./shared";
import { CheatsheetPanel } from "@/app/ui/cheatsheet/cheatsheet-panel";
import { AnnouncementDetailDialog } from "@/app/ui/announcement-detail-dialog";
import { AssignmentDetailDialog } from "@/app/ui/assignment-detail-dialog";

type ModuleTab = "overview" | "files" | "nusmods" | "cheatsheets";

export function ModuleView({
  module,
  tasks,
  announcements,
  onBack,
}: {
  module: ModuleSummary;
  tasks: WeeklyTask[];
  announcements: AnnouncementSummary[];
  onBack: () => void;
}) {
  const [tab, setTab] = useState<ModuleTab>("overview");
  const moduleColor = colorForModule(module.code);
  const tabIds = {
    overview: {
      tab: `module-tab-overview-${module.id}`,
      panel: `module-panel-overview-${module.id}`,
    },
    files: {
      tab: `module-tab-files-${module.id}`,
      panel: `module-panel-files-${module.id}`,
    },
    nusmods: {
      tab: `module-tab-nusmods-${module.id}`,
      panel: `module-panel-nusmods-${module.id}`,
    },
    cheatsheets: {
      tab: `module-tab-cheatsheets-${module.id}`,
      panel: `module-panel-cheatsheets-${module.id}`,
    },
  } as const;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[12px] font-medium text-stone-600"
      >
        <span aria-hidden="true">‹</span>
        Modules
      </button>

      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: moduleColor }} />
              <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: moduleColor }}>
                {module.code}
              </span>
              {module.nusmods?.mc ? <span className="text-[11px] text-stone-400">{module.nusmods.mc} MCs</span> : null}
            </div>
            <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">{module.title}</h1>
            <p className="mt-2 text-sm text-stone-500">
              Synced Canvas work, file intelligence, and NUSMods context for this module.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Pill tone="blue">{module.lastSyncLabel}</Pill>
              <Pill>{tasks.length} tasks</Pill>
              <Pill>{announcements.length} updates</Pill>
              <Pill>{module.files.length} files</Pill>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:w-[280px]">
            <TopInfoCard label="Next task" title={module.nextTask?.title ?? "No open task"} detail={module.nextTask?.dueLabel ?? "No due date"} />
            <TopInfoCard
              label="Exam"
              title={module.examSummary?.date ?? "No exam data"}
              detail={module.examSummary ? `${module.examSummary.time} · ${module.examSummary.venue}` : "Awaiting NUSMods"}
            />
          </div>
        </div>
      </section>

      <div className="overflow-x-auto">
        <div role="tablist" aria-label={`${module.code} workspace sections`} className="flex min-w-max border-b border-stone-200">
          {[
            ["overview", "Overview"],
            ["files", "Files"],
            ["nusmods", "NUSMods"],
            ["cheatsheets", "Cheatsheets"],
          ].map(([key, label]) => {
            const active = tab === key;

            return (
              <button
                key={key}
                type="button"
                id={tabIds[key as ModuleTab].tab}
                role="tab"
                aria-selected={active}
                aria-controls={tabIds[key as ModuleTab].panel}
                onClick={() => setTab(key as ModuleTab)}
                className={`border-b-2 px-4 py-3 text-sm font-medium transition ${
                  active ? "border-stone-950 text-stone-950" : "border-transparent text-stone-500"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "overview" ? (
        <div
          id={tabIds.overview.panel}
          role="tabpanel"
          aria-labelledby={tabIds.overview.tab}
          className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]"
        >
          <div className="space-y-4">
            <SectionCard title="This week" eyebrow="Latest context">
              <div className="grid gap-3 md:grid-cols-2">
                <ContextCard label="Latest update" title={module.latestAnnouncement?.title ?? "No announcement yet"} body={module.latestAnnouncement?.summary ?? "No announcement has been synced for this module yet."} />
                <ContextCard label="Newest file" title={module.recentFile?.name ?? "No file yet"} body={module.recentFile?.summary ?? "Recent file summaries will appear here after sync."} />
              </div>
            </SectionCard>

            <SectionCard title="Tasks" eyebrow="Open work">
              {tasks.length === 0 ? (
                <EmptyState title="No open tasks" copy="Canvas assignments for this module will appear here after sync." />
              ) : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-start justify-between gap-2 rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Pill tone={task.status === "due-soon" ? "rose" : "slate"}>{task.dueLabel}</Pill>
                          <Pill>{task.source}</Pill>
                        </div>
                        <p className="mt-2 text-[13px] font-medium text-stone-900">{task.title}</p>
                      </div>
                      {task.hasDescription ? (
                        <AssignmentDetailDialog taskId={task.id} title={task.title} moduleCode={module.code} />
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard title="Announcements" eyebrow="Recent updates">
              {announcements.length === 0 ? (
                <EmptyState title="No recent announcements" copy="Once the sync pipeline processes announcements, they’ll show up here." />
              ) : (
                <div className="space-y-2">
                  {announcements.map((announcement) => (
                    <div key={announcement.id} className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
                      <div className="flex items-center justify-between gap-2">
                        <Pill tone={announcement.importance === "high" ? "rose" : "slate"}>{announcement.postedLabel}</Pill>
                        <AnnouncementDetailDialog announcement={announcement} />
                      </div>
                      <p className="mt-2 text-[13px] font-medium text-stone-900">{announcement.title}</p>
                      <p className="mt-2 whitespace-pre-line text-[12px] leading-5 text-stone-600">{announcement.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <div className="space-y-4">
            <CompactNUSMods module={module} />
          </div>
        </div>
      ) : null}

      {tab === "files" ? (
        <div id={tabIds.files.panel} role="tabpanel" aria-labelledby={tabIds.files.tab}>
          <SectionCard title="Files" eyebrow="Study material">
            {module.files.length === 0 ? (
              <EmptyState title="No synced files" copy="Enable file parsing during sync to populate file summaries and retrieval context." />
            ) : (
              <div className="space-y-2">
                {module.files.map((file) => (
                  <FileCard key={file.id} file={file} moduleCode={module.code} />
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}

      {tab === "nusmods" ? (
        <div id={tabIds.nusmods.panel} role="tabpanel" aria-labelledby={tabIds.nusmods.tab}>
          <CompactNUSMods module={module} expanded={true} />
        </div>
      ) : null}

      {tab === "cheatsheets" ? (
        <div id={tabIds.cheatsheets.panel} role="tabpanel" aria-labelledby={tabIds.cheatsheets.tab}>
          <CheatsheetPanel
            courseId={module.id}
            files={module.files.map((f) => ({
              id: f.id,
              filename: f.name,
              week_number: null,
              uploaded_at: f.uploadedAt ?? null,
            }))}
          />
        </div>
      ) : null}
    </div>
  );
}

function TopInfoCard({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="rounded-[8px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{label}</p>
      <p className="mt-2 text-[12.5px] font-medium text-stone-900">{title}</p>
      <p className="mt-1 text-[11px] text-stone-500">{detail}</p>
    </div>
  );
}

function ContextCard({ label, title, body }: { label: string; title: string; body: string }) {
  return (
    <div className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{label}</p>
      <p className="mt-2 text-[13px] font-semibold text-stone-900">{title}</p>
      <p className="mt-2 text-[12px] leading-6 text-stone-600">{body}</p>
    </div>
  );
}

function CompactNUSMods({ module, expanded = false }: { module: ModuleSummary; expanded?: boolean }) {
  return (
    <div className="space-y-4">
      <SectionCard title="Schedule" eyebrow="Lesson blocks">
        {module.nusmods?.lessons.length ? (
          <div className="space-y-2">
            {module.nusmods.lessons.map((lesson) => (
              <div key={`${lesson.type}-${lesson.day}-${lesson.time}`} className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone="blue">{lesson.type}</Pill>
                  <Pill>{lesson.day}</Pill>
                </div>
                <p className="mt-2 text-[13px] font-medium text-stone-900">{lesson.time}</p>
                <p className="mt-1 text-[11px] text-stone-500">{lesson.venue}</p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No timetable rows" copy="NUSMods did not return timetable details for this module yet." />
        )}
      </SectionCard>

      <SectionCard title="Exam" eyebrow="Assessment timing">
        <div className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
          <p className="text-[13px] font-medium text-stone-900">{module.nusmods?.exam.date ?? "No exam data"}</p>
          <p className="mt-1 text-[11px] text-stone-500">
            {module.nusmods?.exam.time ?? "—"} · {module.nusmods?.exam.duration ?? "—"}
          </p>
          <p className="mt-1 text-[11px] text-stone-500">{module.nusmods?.exam.venue ?? "Venue unavailable"}</p>
        </div>
      </SectionCard>

      {expanded && module.nusmods?.faculty ? (
        <SectionCard title="Metadata" eyebrow="NUSMods">
          <div className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3 text-[12px] text-stone-600">
            Faculty: {module.nusmods.faculty}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}
