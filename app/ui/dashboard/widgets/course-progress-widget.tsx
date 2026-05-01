"use client";

import type { CourseProgressSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";
import { Card } from "@/app/ui/primitives/card";
import { ProgressBar } from "@/app/ui/primitives/progress-bar";

export function CourseProgressWidget({
  courses,
  onOpenModule,
}: {
  courses: CourseProgressSummary[];
  onOpenModule: (code: string) => void;
}) {
  return (
    <SectionCard title="Course progress" eyebrow="Where you are in each course">
      {courses.length === 0 ? (
        <EmptyState title="Canvas Modules not synced yet." copy="Trigger a sync for a course to see its progress here." />
      ) : (
        <div className="space-y-2">
          {courses.map((course) => {
            const isEmpty = course.totalModules === 0 || course.currentModulePosition == null;
            const pct =
              !isEmpty && course.totalModules > 0
                ? Math.round((course.currentModulePosition! / course.totalModules) * 100)
                : 0;
            return (
              <Card key={course.courseId}>
                <button
                  type="button"
                  onClick={() => onOpenModule(course.moduleCode)}
                  className="w-full text-left"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-bold tracking-[0.08em]"
                      style={{ color: colorForModule(course.moduleCode) }}
                    >
                      {course.moduleCode}
                    </span>
                    {!isEmpty ? (
                      <span className="text-[10px] text-[var(--color-fg-tertiary)]">
                        Module {course.currentModulePosition} of {course.totalModules}
                      </span>
                    ) : null}
                  </div>
                  {isEmpty ? (
                    <p className="mt-2 text-[12px] leading-5 text-[var(--color-fg-tertiary)]">Canvas Modules not synced yet.</p>
                  ) : (
                    <>
                      <p className="mt-2 text-[13px] font-medium leading-5 text-[var(--color-fg-primary)]">{course.currentModuleName}</p>
                      {course.nextItemTitle ? (
                        <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-secondary)]">
                          Next:{" "}
                          <span>{course.nextItemTitle}</span>
                        </p>
                      ) : null}
                      <div className="mt-2">
                        <ProgressBar value={pct} tone="accent" />
                      </div>
                    </>
                  )}
                </button>
              </Card>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
