"use client";

import type { CourseProgressSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

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
            return (
              <button
                key={course.courseId}
                type="button"
                onClick={() => onOpenModule(course.moduleCode)}
                className="w-full rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3 text-left transition hover:border-stone-300 hover:bg-white"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-bold tracking-[0.08em]"
                    style={{ color: colorForModule(course.moduleCode) }}
                  >
                    {course.moduleCode}
                  </span>
                  {!isEmpty ? (
                    <span className="text-[10px] text-stone-400">
                      Module {course.currentModulePosition} of {course.totalModules}
                    </span>
                  ) : null}
                </div>
                {isEmpty ? (
                  <p className="mt-2 text-[12px] leading-5 text-stone-500">Canvas Modules not synced yet.</p>
                ) : (
                  <>
                    <p className="mt-2 text-[13px] font-medium leading-5 text-stone-900">{course.currentModuleName}</p>
                    {course.nextItemTitle ? (
                      <p className="mt-1 text-[12px] leading-5 text-stone-600">
                        Next:{" "}
                        <span>{course.nextItemTitle}</span>
                      </p>
                    ) : null}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
