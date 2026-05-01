"use client";

import type { ModuleSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, Pill, SectionCard } from "@/app/ui/dashboard/shared";
import { Card } from "@/app/ui/primitives/card";

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
            <Card key={module.id} hoverLift>
              <button
                type="button"
                onClick={() => onOpenModule(module.code)}
                className="w-full text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForModule(module.code) }} />
                      <p className="text-[11px] font-bold tracking-[0.08em]" style={{ color: colorForModule(module.code) }}>
                        {module.code}
                      </p>
                    </div>
                    <p className="mt-2 text-[13px] font-medium text-[var(--color-fg-primary)]">{module.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Pill>{module.taskCount} tasks</Pill>
                      <Pill>{module.files.length} files</Pill>
                    </div>
                  </div>
                  <span className="text-[11px] text-[var(--color-fg-tertiary)]">{module.lastSyncLabel}</span>
                </div>
              </button>
            </Card>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
