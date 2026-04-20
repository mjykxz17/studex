"use client";

import type { ModuleSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, Pill, SectionCard } from "@/app/ui/dashboard/shared";

export function CourseListWidget({
  modules,
  onOpenModule,
}: {
  modules: ModuleSummary[];
  onOpenModule: (code: string) => void;
}) {
  return (
    <SectionCard title="Modules" eyebrow="Course workspaces">
      {modules.length === 0 ? (
        <EmptyState title="No courses yet." copy="Run Sync Canvas to discover your courses." />
      ) : (
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
      )}
    </SectionCard>
  );
}
