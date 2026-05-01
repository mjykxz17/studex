"use client";

import type { GradeSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

function formatScore(grade: GradeSummary): string | null {
  if (grade.score == null) return null;
  if (grade.pointsPossible != null) return `${grade.score} / ${grade.pointsPossible}`;
  return `${grade.score}`;
}

export function RecentGradesWidget({ grades }: { grades: GradeSummary[] }) {
  return (
    <SectionCard title="Recent grades" eyebrow="Last 5 submissions">
      {grades.length === 0 ? (
        <EmptyState title="No grades yet." copy="Once Canvas posts a grade, it will appear here." />
      ) : (
        <div className="space-y-2">
          {grades.map((grade) => {
            const scoreLabel = formatScore(grade);
            const content = (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: colorForModule(grade.moduleCode) }}>
                    {grade.moduleCode}
                  </span>
                  {grade.state ? <span className="text-[10px] text-[var(--color-fg-tertiary)]">{grade.state}</span> : null}
                  {grade.gradedLabel ? <span className="text-[10px] text-[var(--color-fg-tertiary)]">{grade.gradedLabel}</span> : null}
                </div>
                <p className="mt-2 text-[13px] font-medium leading-5 text-[var(--color-fg-primary)]">{grade.assignmentTitle}</p>
                {scoreLabel ? <p className="mt-1 text-[12px] leading-5 text-[var(--color-fg-secondary)]">{scoreLabel}</p> : null}
              </>
            );

            return grade.canvasUrl ? (
              <a
                key={grade.id}
                href={grade.canvasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[10px] border border-[color:var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3 transition hover:border-[color:var(--color-border)] hover:bg-[var(--color-bg-primary)]"
              >
                {content}
              </a>
            ) : (
              <div
                key={grade.id}
                className="rounded-[10px] border border-[color:var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
