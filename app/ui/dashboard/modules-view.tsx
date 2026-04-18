import { FilePreviewDialog } from "@/app/ui/file-preview-dialog";
import type { ModuleSummary } from "@/lib/dashboard";

import { colorForModule, EmptyState, Pill, SectionCard } from "./shared";

export function ModulesView({
  modules,
  onOpenModule,
}: {
  modules: ModuleSummary[];
  onOpenModule: (code: string) => void;
}) {
  const syncedModules = modules.filter((module) => module.sync_enabled);

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Modules</p>
        <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">
          Course workspaces built from synced reality.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-stone-500">
          A denser view of every synced course: deadlines, updates, newest study material, and exam context from NUSMods.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Pill tone="blue">{syncedModules.length} synced</Pill>
          <Pill>{modules.length - syncedModules.length} muted</Pill>
        </div>
      </section>

      <SectionCard title="All modules" eyebrow="Workspace board">
        {syncedModules.length === 0 ? (
          <EmptyState title="No enabled modules" copy="Enable modules from Manage and run sync to populate the course workspace board." />
        ) : (
          <div className="space-y-2">
            {syncedModules.map((module) => {
              const accent = colorForModule(module.code);

              return (
                <div key={module.id} className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
                        <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: accent }}>
                          {module.code}
                        </span>
                        <Pill tone="blue">{module.lastSyncLabel}</Pill>
                        {module.examSummary ? <Pill tone="rose">{module.examSummary.date}</Pill> : null}
                      </div>
                      <p className="mt-2 text-[15px] font-semibold tracking-tight text-stone-950">{module.title}</p>
                      <div className="mt-3 grid gap-2 md:grid-cols-3">
                        <SummaryCell label="Next task" title={module.nextTask?.title ?? "No open task"} detail={module.nextTask?.dueLabel ?? "No due date"} />
                        <SummaryCell
                          label="Latest update"
                          title={module.latestAnnouncement?.title ?? "No announcement yet"}
                          detail={module.latestAnnouncement?.postedLabel ?? "Awaiting sync"}
                        />
                        <SummaryCell
                          label="Newest file"
                          title={module.recentFile?.name ?? "No file yet"}
                          detail={module.recentFile?.uploadedLabel ?? "Awaiting sync"}
                        />
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-start gap-2 xl:w-[190px] xl:items-end">
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Pill>{module.taskCount} tasks</Pill>
                        <Pill>{module.announcementCount} updates</Pill>
                        <Pill>{module.files.length} files</Pill>
                      </div>
                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {module.recentFile ? (
                          <FilePreviewDialog
                            file={module.recentFile}
                            moduleCode={module.code}
                            buttonClassName="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-600"
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => onOpenModule(module.code)}
                          className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-600"
                        >
                          Open module
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function SummaryCell({ label, title, detail }: { label: string; title: string; detail: string }) {
  return (
    <div className="rounded-[8px] border border-stone-200 bg-white px-3 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{label}</p>
      <p className="mt-2 text-[12.5px] font-medium text-stone-900">{title}</p>
      <p className="mt-1 text-[11px] text-stone-500">{detail}</p>
    </div>
  );
}
