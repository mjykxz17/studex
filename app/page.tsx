import { ChatPanel } from "@/app/ui/chat-panel";
import { SyncButton } from "@/app/ui/sync-button";
import { loadDashboardData, type AnnouncementSummary, type WeeklyTask } from "@/lib/dashboard";

function toneForTask(status: WeeklyTask["status"]) {
  if (status === "due-soon") return "danger" as const;
  if (status === "upcoming") return "warn" as const;
  return "muted" as const;
}

function toneForAnnouncement(importance: AnnouncementSummary["importance"]) {
  if (importance === "high") return "danger" as const;
  if (importance === "low") return "muted" as const;
  return "default" as const;
}

function Badge({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "warn" | "danger" | "muted" | "success";
}) {
  const styles = {
    default: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200/70",
    warn: "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200/70",
    danger: "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200/80",
    muted: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200/80",
    success: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200/80",
  } as const;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${styles[tone]}`}
    >
      {children}
    </span>
  );
}

function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 p-5 text-sm text-slate-500">
      <p className="font-semibold text-slate-700">{title}</p>
      <p className="mt-2 leading-6">{body}</p>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  subtitle,
  action,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200/70 px-5 py-5 sm:px-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">{kicker}</p>
        <h2 className="mt-2 text-lg font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

export default async function Home() {
  const dashboard = await loadDashboardData();
  const dueSoonCount = dashboard.tasks.filter((task) => task.status === "due-soon").length;
  const changeCount = dashboard.announcements.filter(
    (announcement) => announcement.importance === "high",
  ).length;
  const primaryModule = dashboard.modules[0];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(167,139,250,0.20),_transparent_26%),radial-gradient(circle_at_top_right,_rgba(59,130,246,0.16),_transparent_24%),linear-gradient(180deg,_#f8faff_0%,_#eef3ff_100%)] text-slate-900">
      <div className="mx-auto w-full max-w-[1380px] px-3 pb-6 pt-3 sm:px-5 sm:pb-8 sm:pt-5 xl:px-6">
        <header className="sticky top-3 z-30 rounded-[26px] border border-white/70 bg-white/75 px-4 py-4 shadow-[0_12px_40px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:px-5 lg:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,#2563eb,#7c3aed_62%,#ec4899)] text-xs font-extrabold tracking-[0.18em] text-white shadow-[0_16px_30px_rgba(99,102,241,0.25)]">
                SX
              </div>
              <div>
                <p className="font-serif text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  Studex
                </p>
                <p className="text-sm text-slate-500">Phase 1 personal dashboard</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <Badge tone={dashboard.source === "live" ? "success" : "warn"}>
                  {dashboard.source === "live" ? "Live data" : "Setup mode"}
                </Badge>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  {dashboard.modules.length} active modules
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  Urgent {dueSoonCount}
                </span>
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">
                  Changes {changeCount}
                </span>
              </div>

              <SyncButton initialLastSyncedAt={dashboard.lastSyncedAt} />
            </div>
          </div>
        </header>

        <div className="mt-4 grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
          <aside className="xl:sticky xl:top-[112px] xl:max-h-[calc(100vh-132px)] xl:overflow-auto">
            <div className="rounded-[28px] border border-white/70 bg-white/78 p-4 shadow-[0_14px_42px_rgba(15,23,42,0.07)] backdrop-blur-xl sm:p-5">
              <div className="px-1 pb-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-400">
                  Semester cockpit
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                  Module rail
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                {dashboard.modules.length > 0 ? (
                  dashboard.modules.map((module, index) => (
                    <article
                      key={module.id}
                      className={`rounded-[22px] border p-4 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.08)] ${
                        index === 0
                          ? "border-blue-200/80 bg-[linear-gradient(180deg,rgba(239,246,255,0.95),rgba(255,255,255,0.98))] shadow-[0_10px_28px_rgba(37,99,235,0.08)]"
                          : "border-slate-200/80 bg-slate-50/85"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-extrabold tracking-[0.12em] text-slate-700">
                            {module.code}
                          </p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{module.title}</p>
                        </div>
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-white">
                          {module.taskCount + module.announcementCount}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <Badge tone="muted">{module.taskCount} tasks</Badge>
                        <Badge tone="default">{module.announcementCount} updates</Badge>
                      </div>
                      <p className="mt-4 text-xs text-slate-400">Last sync {module.lastSyncLabel}</p>
                    </article>
                  ))
                ) : (
                  <EmptyState
                    title="No modules yet"
                    body="Your module list appears here after the first successful Canvas sync."
                  />
                )}
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Phase 1 status</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{dashboard.setupMessage}</p>
              </div>
            </div>
          </aside>

          <section className="min-w-0">
            <div className="rounded-[30px] border border-white/70 bg-white/70 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-5 lg:p-6">
              <div className="flex flex-col gap-5 border-b border-slate-200/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-3xl">
                  <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-blue-700">
                    Home
                  </span>
                  <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
                    Good evening, Aiden.
                  </h1>
                  <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-[15px]">
                    The dashboard is now wired for real data flow: Supabase-backed cards, a manual sync surface, and a chat panel that talks to the RAG endpoint instead of pretending.
                  </p>
                </div>

                <div className="w-full rounded-[26px] bg-[linear-gradient(135deg,rgba(15,23,42,0.97),rgba(37,99,235,0.86))] p-5 text-white shadow-[0_18px_38px_rgba(37,99,235,0.18)] lg:max-w-sm">
                  <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70">
                    Today’s mode
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight">Revision + deadlines</h2>
                  <p className="mt-3 text-sm leading-6 text-white/80">
                    Prioritise urgent tasks first, then skim high-signal announcements for hidden deadline or format changes.
                  </p>
                  <div className="mt-5 grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-2xl font-semibold">{dashboard.tasks.length}</p>
                      <p className="text-xs text-white/70">Open tasks</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{dashboard.announcements.length}</p>
                      <p className="text-xs text-white/70">Updates</p>
                    </div>
                    <div>
                      <p className="text-2xl font-semibold">{dueSoonCount}</p>
                      <p className="text-xs text-white/70">Urgent</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_10px_28px_rgba(15,23,42,0.05)] sm:p-6">
                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">System state</p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Badge tone={dashboard.status === "ready" ? "success" : dashboard.status === "error" ? "danger" : "warn"}>
                    {dashboard.status === "ready"
                      ? "Ready"
                      : dashboard.status === "error"
                        ? "Needs attention"
                        : "Waiting for first sync"}
                  </Badge>
                  {dashboard.userId ? <Badge tone="muted">Phase 1 user provisioned</Badge> : null}
                </div>
                <p className="mt-4 text-sm leading-7 text-slate-600">{dashboard.setupMessage}</p>
              </div>

              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(320px,0.84fr)]">
                <div className="min-w-0 space-y-6">
                  <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <SectionHeading
                      kicker="Due next"
                      title="Weekly task view"
                      subtitle="Assignments and extracted deadlines in one focused queue."
                      action={<Badge tone="danger">{dueSoonCount} urgent</Badge>}
                    />
                    <div className="p-5 sm:p-6">
                      {dashboard.tasks.length > 0 ? (
                        <div className="space-y-4">
                          {dashboard.tasks.map((task) => (
                            <article
                              key={task.id}
                              className="flex flex-col gap-4 rounded-[22px] border border-slate-200/70 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-sm font-semibold text-slate-950">{task.title}</p>
                                  <Badge tone="muted">{task.moduleCode}</Badge>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-slate-500">{task.source}</p>
                              </div>
                              <Badge tone={toneForTask(task.status)}>{task.dueLabel}</Badge>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="No tasks loaded"
                          body="Tasks will show up here after sync pulls Canvas assignments or AI-extracted deadlines into Supabase."
                        />
                      )}
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <SectionHeading
                      kicker="What changed"
                      title="Recent announcements"
                      subtitle="Recent teaching updates with AI summaries where available."
                      action={<Badge tone="default">{dashboard.announcements.length} items</Badge>}
                    />
                    <div className="p-5 sm:p-6">
                      {dashboard.announcements.length > 0 ? (
                        <div className="space-y-4">
                          {dashboard.announcements.map((announcement) => (
                            <article
                              key={announcement.id}
                              className="rounded-[22px] border border-slate-200/70 px-4 py-4"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold text-slate-950">{announcement.title}</p>
                                <Badge tone={toneForAnnouncement(announcement.importance)}>
                                  {announcement.moduleCode}
                                </Badge>
                                <Badge tone="muted">{announcement.postedLabel}</Badge>
                              </div>
                              <p className="mt-3 text-sm leading-7 text-slate-600">{announcement.summary}</p>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <EmptyState
                          title="No announcements yet"
                          body="Announcement summaries appear here after sync stores Canvas discussion topics and processes them."
                        />
                      )}
                    </div>
                  </section>
                </div>

                <div className="min-w-0 space-y-6">
                  <ChatPanel
                    userId={dashboard.userId}
                    activeModule={dashboard.chat.activeModule}
                    suggestedPrompts={dashboard.chat.suggestedPrompts}
                    initialMessages={dashboard.chat.recentMessages}
                  />

                  <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <SectionHeading
                      kicker="Snapshot"
                      title="Module focus"
                      subtitle="A compact summary panel that reflects real synced state instead of design-only filler."
                    />
                    <div className="grid gap-px bg-slate-200/80 sm:grid-cols-2">
                      <div className="bg-white p-5 sm:p-6">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Primary module</p>
                        <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
                          {primaryModule?.code ?? "No module yet"}
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          {primaryModule?.title ?? "Run your first sync to load the academic workspace."}
                        </p>
                      </div>
                      <div className="bg-white p-5 sm:p-6">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">MVP plumbing</p>
                        <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
                          Server-safe
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Dashboard reads on the server, sync runs through <code>/api/sync</code>, and chat now calls <code>/api/chat</code>. If setup is incomplete, the UI says so plainly instead of faking readiness.
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
