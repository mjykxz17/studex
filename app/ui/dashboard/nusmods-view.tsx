"use client";

import { useState } from "react";

import type { ModuleSummary, WeeklyTask } from "@/lib/contracts";

import { EmptyState, Pill, SectionCard } from "./shared";
import { ScheduleBoard } from "./widgets/schedule-board";
import { ProgressView } from "@/app/ui/progress/progress-view";

type NUSModsTab = "current-sem" | "progress" | "planning";

const TABS: Array<{ id: NUSModsTab; label: string }> = [
  { id: "current-sem", label: "Current sem" },
  { id: "progress", label: "Progress" },
  { id: "planning", label: "Planning" },
];

export function NUSModsView({
  modules,
  tasks,
}: {
  modules: ModuleSummary[];
  tasks: WeeklyTask[];
}) {
  const [tab, setTab] = useState<NUSModsTab>("current-sem");
  const [weekOffset, setWeekOffset] = useState(0);
  const syncedModules = modules.filter((module) => module.sync_enabled);

  return (
    <div className="space-y-4">
      <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">NUSMods</p>
        <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">
          Timetable, progress, and planning.
        </h1>
        <div role="tablist" aria-label="NUSMods sections" className="mt-4 flex border-b border-stone-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-[12px] font-medium ${
                tab === t.id ? "border-b-2 border-stone-900 text-stone-950" : "text-stone-500"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>

      {tab === "current-sem" ? (
        <>
          <SectionCard title="Weekly timetable" eyebrow="Lesson grid">
            {syncedModules.length === 0 ? (
              <EmptyState
                title="No synced modules"
                copy="Exam data will appear here once modules are enabled and synced."
              />
            ) : (
              <ScheduleBoard
                modules={syncedModules}
                tasks={tasks}
                weekOffset={weekOffset}
                onWeekOffsetChange={setWeekOffset}
                compact={true}
              />
            )}
          </SectionCard>
          <SectionCard title="Exam schedule" eyebrow="Assessment timing">
            {syncedModules.length === 0 ? (
              <EmptyState title="No exam data yet" copy="Enable modules and sync first." />
            ) : (
              <div className="space-y-2">
                {syncedModules.map((module) => (
                  <div
                    key={module.id}
                    className="flex flex-col gap-3 rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Pill tone="blue">{module.code}</Pill>
                        {module.nusmods?.mc ? <Pill>{module.nusmods.mc} MCs</Pill> : null}
                      </div>
                      <p className="mt-2 text-[13px] font-medium text-stone-900">{module.title}</p>
                    </div>
                    <div className="text-left lg:text-right">
                      <p className="text-[13px] font-medium text-stone-900">
                        {module.nusmods?.exam.date ?? "No exam data"}
                      </p>
                      <p className="mt-1 text-[11px] text-stone-500">
                        {module.nusmods?.exam.time ?? "—"} · {module.nusmods?.exam.venue ?? "Venue unavailable"} ·{" "}
                        {module.nusmods?.exam.duration ?? "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {tab === "progress" ? <ProgressView /> : null}

      {tab === "planning" ? (
        <SectionCard title="Planning" eyebrow="Coming in Phase B">
          <EmptyState
            title="Planning is not built yet"
            copy="Phase B will let you shortlist modules for next semester with prereq + exam-clash awareness."
          />
        </SectionCard>
      ) : null}
    </div>
  );
}
