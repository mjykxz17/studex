"use client";

import type { WeeklyTask } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

export function DueThisWeekWidget({ tasks }: { tasks: WeeklyTask[] }) {
  return (
    <SectionCard title="Due this week" eyebrow="Next 7 days">
      {tasks.length === 0 ? (
        <EmptyState title="Nothing due this week." copy="You are clear for the next 7 days based on synced assignments." />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 rounded-[10px] border border-[color:var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3">
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: colorForModule(task.moduleCode) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-[var(--color-fg-primary)]">{task.title}</p>
                <p className="mt-1 text-[11px] text-[var(--color-fg-tertiary)]">
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
