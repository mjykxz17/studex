import type { DashboardData, ModuleSummary, WeeklyTask, AnnouncementSummary } from "../page";

const moduleAccents = [
  {
    dot: "from-blue-500 to-indigo-500",
    panel: "from-blue-500/14 via-white/90 to-white/80",
    soft: "bg-blue-500/10 text-blue-700",
  },
  {
    dot: "from-violet-500 to-fuchsia-500",
    panel: "from-violet-500/14 via-white/90 to-white/80",
    soft: "bg-violet-500/10 text-violet-700",
  },
  {
    dot: "from-emerald-500 to-teal-500",
    panel: "from-emerald-500/14 via-white/90 to-white/80",
    soft: "bg-emerald-500/10 text-emerald-700",
  },
  {
    dot: "from-amber-500 to-orange-500",
    panel: "from-amber-500/14 via-white/90 to-white/80",
    soft: "bg-amber-500/10 text-amber-700",
  },
] as const;

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function getAccent(index: number) {
  return moduleAccents[index % moduleAccents.length];
}

function Surface({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "rounded-[28px] border border-white/60 bg-white/78 shadow-[0_22px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-blue-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">
      {children}
    </span>
  );
}

function Pill({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "muted" | "warning" | "danger" | "success" }) {
  const styles = {
    default: "bg-slate-950/[0.05] text-slate-700",
    muted: "bg-white/80 text-slate-500 ring-1 ring-slate-200/80",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-700",
    success: "bg-emerald-100 text-emerald-700",
  } as const;

  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", styles[tone])}>{children}</span>;
}

function SectionHeader({ title, subtitle, meta }: { title: string; subtitle: string; meta?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-5 sm:px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{subtitle}</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
      </div>
      {meta}
    </div>
  );
}

function StatCard({ value, label, note }: { value: string; label: string; note: string }) {
  return (
    <div className="rounded-[22px] bg-white/90 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] ring-1 ring-slate-200/70">
      <div className="text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
      <div className="mt-2 text-sm font-medium text-slate-700">{label}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{note}</div>
    </div>
  );
}

function ModuleRail({ modules, source }: { modules: ModuleSummary[]; source: DashboardData["source"] }) {
  return (
    <Surface className="sticky top-6 overflow-hidden p-5 sm:p-6 xl:min-h-[calc(100vh-3rem)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-[18px] bg-gradient-to-br from-blue-600 via-indigo-500 to-fuchsia-500 text-sm font-bold tracking-[0.22em] text-white shadow-[0_18px_36px_rgba(79,70,229,0.28)]">
              SX
            </div>
            <div>
              <p className="text-sm font-medium text-emerald-600">Studex</p>
              <h1 className="text-[28px] font-semibold tracking-tight text-slate-950">Dashboard</h1>
            </div>
          </div>
          <p className="mt-4 max-w-xs text-sm leading-6 text-slate-500">
            Study command center for modules, deadlines, teaching changes, and AI-assisted review.
          </p>
        </div>
        <Pill tone={source === "live" ? "success" : "warning"}>{source === "live" ? "Live data" : "Fallback"}</Pill>
      </div>

      <div className="mt-6 rounded-[26px] bg-[linear-gradient(135deg,rgba(15,23,42,0.96),rgba(37,99,235,0.88))] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.22)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65">Semester cockpit</p>
        <div className="mt-3 text-2xl font-semibold tracking-tight">Focus on what changed and what is due next.</div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-white/78">
          <div>
            <div className="text-2xl font-semibold text-white">{modules.length}</div>
            <div>Active modules</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-white">{modules.reduce((sum, module) => sum + module.taskCount, 0)}</div>
            <div>Tracked tasks</div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between px-1">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Modules</p>
          <p className="mt-1 text-sm text-slate-500">Canvas-backed sidebar cards</p>
        </div>
        <Pill tone="muted">{modules.length} total</Pill>
      </div>

      <div className="mt-4 space-y-3">
        {modules.map((module, index) => {
          const accent = getAccent(index);
          return (
            <article
              key={module.id}
              className={cn(
                "rounded-[24px] border border-white/70 bg-gradient-to-br p-4 shadow-[0_16px_38px_rgba(15,23,42,0.06)] transition hover:-translate-y-0.5",
                accent.panel,
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn("h-2.5 w-2.5 rounded-full bg-gradient-to-br", accent.dot)} />
                    <p className="text-xs font-semibold tracking-[0.18em] text-slate-700">{module.code}</p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{module.title}</p>
                </div>
                <Pill tone="muted">{module.lastSyncLabel}</Pill>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold", accent.soft)}>
                  {module.taskCount} tasks
                </span>
                <Pill>{module.announcementCount} updates</Pill>
              </div>
            </article>
          );
        })}
      </div>
    </Surface>
  );
}

function WeeklyTaskList({ tasks }: { tasks: WeeklyTask[] }) {
  return (
    <Surface className="overflow-hidden">
      <SectionHeader
        title="Weekly task view"
        subtitle="Execution layer"
        meta={<Pill tone="muted">Unified queue</Pill>}
      />
      <div className="space-y-3 p-5 sm:p-6">
        {tasks.map((task) => {
          const tone = task.status === "due-soon" ? "danger" : task.status === "upcoming" ? "warning" : "muted";
          return (
            <article
              key={task.id}
              className="flex flex-col gap-3 rounded-[24px] border border-slate-200/80 bg-white/85 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] sm:flex-row sm:items-center"
            >
              <div className="mt-1 h-4 w-4 rounded-full border-2 border-slate-300 bg-white" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-950">{task.title}</h3>
                  <Pill tone={tone}>{task.moduleCode}</Pill>
                </div>
                <div className="mt-1 text-sm text-slate-500">{task.source}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <Pill tone={tone}>{task.dueLabel}</Pill>
              </div>
            </article>
          );
        })}
      </div>
    </Surface>
  );
}

function AnnouncementList({ announcements }: { announcements: AnnouncementSummary[] }) {
  return (
    <Surface className="overflow-hidden">
      <SectionHeader
        title="Recent announcements"
        subtitle="Teaching changes"
        meta={<Pill tone="muted">Latest first</Pill>}
      />
      <div className="space-y-3 p-5 sm:p-6">
        {announcements.map((announcement) => {
          const tone =
            announcement.importance === "high"
              ? "danger"
              : announcement.importance === "low"
                ? "muted"
                : "default";

          return (
            <article key={announcement.id} className="rounded-[24px] border border-slate-200/80 bg-white/88 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-950">{announcement.title}</h3>
                <Pill tone={tone}>{announcement.moduleCode}</Pill>
                <Pill tone="muted">{announcement.postedLabel}</Pill>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">{announcement.summary}</p>
            </article>
          );
        })}
      </div>
    </Surface>
  );
}

function AIChatPanel({ dashboard }: { dashboard: DashboardData }) {
  return (
    <Surface className="overflow-hidden">
      <SectionHeader title="AI study chat" subtitle="Reasoning shell" meta={<Pill tone="muted">Panel ready</Pill>} />
      <div className="p-5 sm:p-6">
        <div className="rounded-[26px] border border-blue-100 bg-[linear-gradient(180deg,rgba(239,246,255,0.85),rgba(255,255,255,0.9))] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-700">Active scope</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{dashboard.chat.activeModule}</h3>
            </div>
            <Pill tone="default">RAG-ready</Pill>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            Production shell only. Data wiring stays intact while the final chat transport plugs into the existing route later.
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {dashboard.chat.suggestedPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              className="rounded-full border border-slate-200/80 bg-white/88 px-3.5 py-2 text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white"
            >
              {prompt}
            </button>
          ))}
        </div>

        <div className="mt-5 space-y-3">
          {dashboard.chat.recentMessages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "max-w-[92%] rounded-[22px] px-4 py-3 text-sm leading-6 shadow-[0_10px_28px_rgba(15,23,42,0.05)]",
                message.role === "assistant"
                  ? "bg-slate-100 text-slate-700"
                  : "ml-auto bg-slate-950 text-slate-50",
              )}
            >
              {message.content}
            </div>
          ))}
        </div>

        <form className="mt-5 rounded-[26px] border border-slate-200/80 bg-white/86 p-4">
          <textarea
            className="min-h-32 w-full resize-none border-none bg-transparent text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-400"
            placeholder="Ask about a lecture, announcement, or what is due this week…"
            disabled
          />
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-200/70 pt-3">
            <p className="max-w-xs text-xs leading-5 text-slate-500">
              UI shell is polished and ready. API behavior stays untouched.
            </p>
            <button
              type="submit"
              disabled
              className="rounded-full bg-slate-950 px-4 py-2 text-sm font-medium text-white opacity-60"
            >
              Send
            </button>
          </div>
        </form>
      </div>
    </Surface>
  );
}

export function DashboardShell({ dashboard }: { dashboard: DashboardData }) {
  const dueSoonCount = dashboard.tasks.filter((task) => task.status === "due-soon").length;
  const highImportanceCount = dashboard.announcements.filter((announcement) => announcement.importance === "high").length;
  const syncedModuleCount = dashboard.modules.filter(
    (module) => !["Awaiting sync", "Awaiting first Canvas sync"].includes(module.lastSyncLabel),
  ).length;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.18),transparent_24%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.16),transparent_24%),linear-gradient(180deg,#f7f8ff_0%,#eef3ff_100%)] text-slate-900">
      <div className="mx-auto max-w-[1380px] px-4 py-4 sm:px-6 sm:py-6 xl:px-8">
        <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
          <div>
            <ModuleRail modules={dashboard.modules} source={dashboard.source} />
          </div>

          <div className="space-y-6">
            <Surface className="overflow-hidden p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
                <div className="max-w-3xl">
                  <Eyebrow>Semester cockpit</Eyebrow>
                  <h2 className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">
                    Good evening. Keep the dashboard dense, calm, and useful.
                  </h2>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-[15px]">
                    A tighter academic workspace inspired by the prototype: better module cards, clearer pills, denser lists, and a more deliberate AI panel shell.
                  </p>
                </div>

                <div className="w-full max-w-sm rounded-[26px] bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(51,65,85,0.92))] p-5 text-white shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/60">Today’s mode</p>
                  <div className="mt-3 text-2xl font-semibold tracking-tight">Revision + deadlines</div>
                  <p className="mt-3 text-sm leading-6 text-white/75">
                    Prioritise urgent tasks first, then skim high-signal announcements before opening AI chat.
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-px overflow-hidden rounded-[26px] bg-slate-200/70 lg:grid-cols-[1.05fr_1fr_1fr]">
                <div className="bg-white/92 p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Planner glance</p>
                  <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">This week is loaded but manageable.</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    You have {dashboard.tasks.length} active tasks, {dueSoonCount} due soon, and {highImportanceCount} announcement{highImportanceCount === 1 ? "" : "s"} worth reading carefully.
                  </p>
                </div>
                <div className="grid gap-3 bg-white/96 p-5">
                  <StatCard value={String(dueSoonCount)} label="Urgent tasks" note="Due in the next 48 hours." />
                  <StatCard value={String(highImportanceCount)} label="High-signal updates" note="Announcements marked important." />
                </div>
                <div className="grid gap-3 bg-white/96 p-5">
                  <StatCard value={String(dashboard.modules.length)} label="Tracked modules" note="Cards in the module rail." />
                  <StatCard value={String(syncedModuleCount)} label="Synced recently" note="Using current sync labels from the database." />
                </div>
              </div>
            </Surface>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.16fr)_minmax(320px,0.84fr)]">
              <div className="space-y-6">
                <WeeklyTaskList tasks={dashboard.tasks} />
                <AnnouncementList announcements={dashboard.announcements} />
              </div>
              <div className="space-y-6">
                <Surface className="overflow-hidden">
                  <SectionHeader title="Snapshot" subtitle="This week" meta={<Pill tone="muted">Summary cards</Pill>} />
                  <div className="grid gap-px bg-slate-200/70 sm:grid-cols-2">
                    <StatCard value={String(dashboard.tasks.length)} label="Open tasks" note="Unified assignments and extracted deadlines." />
                    <StatCard value={String(dashboard.announcements.length)} label="Recent announcements" note="Processed from the latest Canvas items." />
                    <StatCard value={String(dueSoonCount)} label="Due soon" note="Use this to anchor what gets done tonight." />
                    <StatCard value={dashboard.chat.activeModule} label="AI scope" note="Current chat context shown in the panel." />
                  </div>
                </Surface>

                <AIChatPanel dashboard={dashboard} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
