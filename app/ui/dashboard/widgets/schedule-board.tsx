import type { ModuleSummary, WeeklyTask } from "@/lib/contracts";

import { colorForModule, Pill } from "../shared";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

function startOfWeek(base = new Date(), weekOffset = 0) {
  const value = new Date(base);
  const day = value.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  value.setHours(0, 0, 0, 0);
  value.setDate(value.getDate() + diff + weekOffset * 7);
  return value;
}

function addDays(date: Date, amount: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + amount);
  return value;
}

function formatDayLabel(date: Date) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
  }).format(date);
}

function formatWeekLabel(start: Date) {
  const end = addDays(start, 4);
  return `${formatDayLabel(start)} - ${formatDayLabel(end)}`;
}

function parseLessonStart(time: string) {
  const [start] = time.split("–");
  const [hourText, minuteText = "0"] = start.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : Number.MAX_SAFE_INTEGER;
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

type ScheduleBoardProps = {
  modules: ModuleSummary[];
  tasks?: WeeklyTask[];
  weekOffset: number;
  onWeekOffsetChange: (offset: number) => void;
  compact?: boolean;
};

export function ScheduleBoard({
  modules,
  tasks = [],
  weekOffset,
  onWeekOffsetChange,
  compact = false,
}: ScheduleBoardProps) {
  const activeModules = modules.filter((module) => module.sync_enabled);
  const weekStart = startOfWeek(new Date(), weekOffset);
  const weekDays = WEEKDAY_NAMES.map((name, index) => ({
    key: name,
    label: WEEKDAY_LABELS[index],
    name,
    date: addDays(weekStart, index),
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-[8px] border border-stone-200 bg-stone-50 p-1">
          <button
            type="button"
            onClick={() => onWeekOffsetChange(weekOffset - 1)}
            className="grid h-7 w-7 place-items-center rounded-[6px] text-sm text-stone-500 transition hover:bg-white hover:text-stone-900"
          >
            ‹
          </button>
          <span className="min-w-[120px] px-2 text-center text-xs font-medium text-stone-700">{formatWeekLabel(weekStart)}</span>
          <button
            type="button"
            onClick={() => onWeekOffsetChange(weekOffset + 1)}
            className="grid h-7 w-7 place-items-center rounded-[6px] text-sm text-stone-500 transition hover:bg-white hover:text-stone-900"
          >
            ›
          </button>
        </div>
        <button
          type="button"
          onClick={() => onWeekOffsetChange(0)}
          className="rounded-[8px] border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 transition hover:border-stone-300 hover:text-stone-900"
        >
          Today
        </button>
        <div className="ml-auto hidden flex-wrap gap-3 xl:flex">
          {activeModules.slice(0, 6).map((module) => (
            <div key={module.id} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForModule(module.code) }} />
              <span className="text-[10px] font-medium text-stone-500">{module.code}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={`grid gap-3 ${compact ? "md:grid-cols-5" : "lg:grid-cols-5"}`}>
        {weekDays.map((day) => {
          const lessonRows = activeModules
            .flatMap((module) =>
              (module.nusmods?.lessons ?? [])
                .filter((lesson) => lesson.day === day.name)
                .map((lesson) => ({
                  key: `${module.id}-${lesson.type}-${lesson.day}-${lesson.time}`,
                  kind: "lesson" as const,
                  module,
                  title: lesson.type,
                  subtitle: lesson.time,
                  meta: lesson.venue,
                  sortKey: parseLessonStart(lesson.time),
                })),
            )
            .sort((left, right) => left.sortKey - right.sortKey);

          const taskRows = tasks
            .filter((task) => {
              if (!task.dueDate) {
                return false;
              }

              const due = new Date(task.dueDate);
              return !Number.isNaN(due.getTime()) && sameDay(due, day.date);
            })
            .flatMap((task) => {
              const relatedModule = activeModules.find((entry) => entry.code === task.moduleCode) ?? null;

              if (!relatedModule) {
                return [];
              }

              return {
                key: task.id,
                kind: "task" as const,
                module: relatedModule,
                title: task.title,
                subtitle: task.dueLabel,
                meta: task.source,
                sortKey: 10_000,
              };
            });

          const rows = [...lessonRows, ...taskRows].sort((left, right) => left.sortKey - right.sortKey);
          const isToday = sameDay(day.date, new Date());

          return (
            <div key={day.key} className={`rounded-[10px] border ${isToday ? "border-blue-200 bg-blue-50/40" : "border-stone-200 bg-[#fcfbf9]"}`}>
              <div className="border-b border-stone-200 px-3 py-3">
                <p className={`text-[10px] font-bold uppercase tracking-[0.14em] ${isToday ? "text-blue-700" : "text-stone-400"}`}>{day.label}</p>
                <p className="mt-1 text-sm font-semibold text-stone-900">{formatDayLabel(day.date)}</p>
              </div>

              <div className="space-y-2 p-3">
                {rows.length === 0 ? (
                  <div className="rounded-[8px] border border-dashed border-stone-200 bg-white px-3 py-4 text-center text-xs text-stone-400">
                    No lessons or deadlines.
                  </div>
                ) : (
                  rows.map((row) => {
                    const accent = row.module ? colorForModule(row.module.code) : "#78716c";

                    return (
                      <div
                        key={row.key}
                        className="rounded-[8px] border border-stone-200 bg-white px-3 py-3 shadow-[0_4px_12px_rgba(28,25,23,0.04)]"
                        style={{ borderLeftWidth: 3, borderLeftColor: accent }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          {row.module ? (
                            <span className="text-[10px] font-bold tracking-[0.08em]" style={{ color: accent }}>
                              {row.module.code}
                            </span>
                          ) : null}
                          <Pill tone={row.kind === "task" ? "rose" : "slate"}>{row.kind === "task" ? "Deadline" : row.title}</Pill>
                        </div>
                        <p className="mt-2 text-[12.5px] font-semibold leading-5 text-stone-900">
                          {row.kind === "task" ? row.title : row.subtitle}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-stone-500">
                          {row.kind === "task" ? `${row.subtitle} · ${row.meta}` : `${row.title} · ${row.meta}`}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
