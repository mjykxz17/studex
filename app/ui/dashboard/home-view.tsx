"use client";

import { useMemo, useState } from "react";

import { FilePreviewDialog } from "@/app/ui/file-preview-dialog";
import type { DashboardChange, DashboardData, ModuleSummary } from "@/lib/contracts";

import { FileCard } from "./file-card";
import { colorForModule, EmptyState, Pill, SectionCard } from "./shared";
import { ScheduleBoard } from "./schedule-board";

function getGreeting() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Good morning.";
  }

  if (hour < 18) {
    return "Good afternoon.";
  }

  return "Good evening.";
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function HomeView({
  data,
  onOpenModule,
  seenAnnouncements,
  onMarkAnnouncementSeen,
}: {
  data: DashboardData;
  onOpenModule: (code: string) => void;
  seenAnnouncements: Record<string, boolean>;
  onMarkAnnouncementSeen: (id: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const activeModules = data.modules.filter((module) => module.sync_enabled);
  const activeModuleCodes = useMemo(() => new Set(activeModules.map((module) => module.code)), [activeModules]);
  const filteredTasks = useMemo(
    () => data.tasks.filter((task) => activeModuleCodes.has(task.moduleCode)),
    [activeModuleCodes, data.tasks],
  );
  const filteredRecentFiles = useMemo(
    () => data.recentFiles.filter((file) => activeModuleCodes.has(file.moduleCode)),
    [activeModuleCodes, data.recentFiles],
  );
  const recentFiles = useMemo(() => {
    if (filteredRecentFiles.length > 0) {
      return filteredRecentFiles;
    }

    return [...activeModules]
      .flatMap((module) =>
        module.files.map((file) => ({
          ...file,
          moduleCode: module.code,
          moduleTitle: module.title,
        })),
      )
      .sort((left, right) => {
        const leftTime = left.uploadedAt ? new Date(left.uploadedAt).getTime() : 0;
        const rightTime = right.uploadedAt ? new Date(right.uploadedAt).getTime() : 0;
        return rightTime - leftTime;
      });
  }, [activeModules, filteredRecentFiles]);
  const filteredChanges = useMemo(
    () => data.latestChanges.filter((change) => activeModuleCodes.has(change.moduleCode)),
    [activeModuleCodes, data.latestChanges],
  );

  const upcomingTasks = useMemo(
    () =>
      [...filteredTasks]
        .filter((task) => task.status !== "no-date")
        .sort((left, right) => {
          const leftTime = left.dueDate ? new Date(left.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          const rightTime = right.dueDate ? new Date(right.dueDate).getTime() : Number.MAX_SAFE_INTEGER;
          return leftTime - rightTime;
        })
        .slice(0, 6),
    [filteredTasks],
  );

  const recentChanges = filteredChanges.slice(0, 6);
  const unreadAnnouncements = filteredChanges.filter(
    (change) => change.kind === "announcement" && !seenAnnouncements[change.id],
  ).length;
  const dueSoonCount = filteredTasks.filter((task) => task.status === "due-soon").length;

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Home</p>
            <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">
              {getGreeting()}
            </h1>
            <p className="mt-1 text-sm text-stone-500">{formatTodayLabel()} · live Canvas workspace</p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
            <StatCard value={dueSoonCount} label="Due soon" accent={dueSoonCount > 0 ? "#dc2626" : "#a8a29e"} />
            <StatCard value={filteredTasks.length} label="Open tasks" accent="#d97706" />
            <StatCard value={unreadAnnouncements} label="Changes" accent="#2563eb" />
          </div>
        </div>
      </section>

      {activeModules.length === 0 ? (
        <EmptyState
          title="No modules synced yet"
          copy="Use Sync Canvas to discover modules from Canvas, then enable the ones that should power your command board."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-4">
            <SectionCard title="This week" eyebrow="Schedule and deadlines">
              <ScheduleBoard modules={activeModules} tasks={filteredTasks} weekOffset={weekOffset} onWeekOffsetChange={setWeekOffset} />
            </SectionCard>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.9fr)]">
              <RecentFilesBoard files={recentFiles.slice(0, 8)} onOpenModule={onOpenModule} />
              <ModuleBoard modules={activeModules} onOpenModule={onOpenModule} />
            </div>
          </div>

          <div className="space-y-4">
            <UpcomingPanel tasks={upcomingTasks} />
            <ChangesPanel
              changes={recentChanges}
              onOpenModule={onOpenModule}
              seenAnnouncements={seenAnnouncements}
              onMarkAnnouncementSeen={onMarkAnnouncementSeen}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, accent }: { value: number; label: string; accent: string }) {
  return (
    <div className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-3 text-center">
      <p className="font-[var(--font-lora)] text-2xl font-semibold leading-none" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-stone-400">{label}</p>
    </div>
  );
}

function UpcomingPanel({ tasks }: { tasks: DashboardData["tasks"] }) {
  return (
    <SectionCard title="Upcoming" eyebrow="Next two weeks">
      {tasks.length === 0 ? (
        <EmptyState title="Nothing urgent" copy="You are clear for the next two weeks based on synced assignments." />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: colorForModule(task.moduleCode) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-stone-900">{task.title}</p>
                <p className="mt-1 text-[11px] text-stone-500">
                  <span className="font-semibold" style={{ color: colorForModule(task.moduleCode) }}>
                    {task.moduleCode}
                  </span>{" "}
                  · {task.dueLabel}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ChangesPanel({
  changes,
  onOpenModule,
  seenAnnouncements,
  onMarkAnnouncementSeen,
}: {
  changes: DashboardChange[];
  onOpenModule: (code: string) => void;
  seenAnnouncements: Record<string, boolean>;
  onMarkAnnouncementSeen: (id: string) => void;
}) {
  return (
    <SectionCard title="What changed" eyebrow="Recent updates">
      {changes.length === 0 ? (
        <EmptyState title="No changes yet" copy="Announcements and file drops will appear here after sync." />
      ) : (
        <div className="space-y-2">
          {changes.map((change) => {
            const unseen = change.kind !== "announcement" || !seenAnnouncements[change.id];

            return (
              <div
                key={`${change.kind}-${change.id}`}
                className={`rounded-[10px] border px-3 py-3 ${unseen ? "border-blue-200 bg-blue-50/40" : "border-stone-200 bg-[#fcfbf9]"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.08em]" style={{ color: colorForModule(change.moduleCode) }}>
                    {change.moduleCode}
                  </span>
                  <span className="text-[10px] text-stone-400">{change.happenedLabel}</span>
                </div>
                <p className="mt-2 text-[13px] font-medium leading-5 text-stone-900">{change.title}</p>
                <p className="mt-1 line-clamp-3 text-[12px] leading-5 text-stone-600">{change.summary}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {change.kind === "announcement" ? (
                    <button
                      type="button"
                      onClick={() => onMarkAnnouncementSeen(change.id)}
                      className="rounded-[7px] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600"
                    >
                      {seenAnnouncements[change.id] ? "Seen" : "Mark seen"}
                    </button>
                  ) : change.file ? (
                    <FilePreviewDialog
                      file={change.file}
                      moduleCode={change.moduleCode}
                      buttonClassName="rounded-[7px] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600"
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onOpenModule(change.moduleCode)}
                    className="rounded-[7px] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600"
                  >
                    Open module
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function RecentFilesBoard({
  files,
  onOpenModule,
}: {
  files: DashboardData["recentFiles"];
  onOpenModule: (code: string) => void;
}) {
  return (
    <SectionCard title="Recent files" eyebrow="Study material">
      {files.length === 0 ? (
        <EmptyState title="No synced files" copy="Enable file parsing during sync and recent study material will land here." />
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <FileCard key={file.id} file={file} moduleCode={file.moduleCode} onOpenModule={onOpenModule} showModuleCode={true} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function ModuleBoard({
  modules,
  onOpenModule,
}: {
  modules: ModuleSummary[];
  onOpenModule: (code: string) => void;
}) {
  return (
    <SectionCard title="Modules" eyebrow="Course workspaces">
      <div className="space-y-2">
        {modules.map((module) => (
          <button
            key={module.id}
            type="button"
            onClick={() => onOpenModule(module.code)}
            className="w-full rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3 text-left transition hover:border-stone-300 hover:bg-white"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForModule(module.code) }} />
                  <p className="text-[11px] font-bold tracking-[0.08em]" style={{ color: colorForModule(module.code) }}>
                    {module.code}
                  </p>
                </div>
                <p className="mt-2 text-[13px] font-medium text-stone-900">{module.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Pill>{module.taskCount} tasks</Pill>
                  <Pill>{module.files.length} files</Pill>
                </div>
              </div>
              <span className="text-[11px] text-stone-400">{module.lastSyncLabel}</span>
            </div>
          </button>
        ))}
      </div>
    </SectionCard>
  );
}
