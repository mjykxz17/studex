import { createClient } from "@supabase/supabase-js";

type ModuleSummary = {
  id: string;
  code: string;
  title: string;
  taskCount: number;
  announcementCount: number;
  lastSyncLabel: string;
};

type WeeklyTask = {
  id: string;
  title: string;
  moduleCode: string;
  dueLabel: string;
  dueDate?: string | null;
  status: "due-soon" | "upcoming" | "no-date";
  source: string;
};

type AnnouncementSummary = {
  id: string;
  title: string;
  moduleCode: string;
  summary: string;
  postedLabel: string;
  importance: "high" | "normal" | "low";
};

type ChatPreview = {
  activeModule: string;
  suggestedPrompts: string[];
  recentMessages: Array<{
    id: string;
    role: "assistant" | "user";
    content: string;
  }>;
};

type DashboardData = {
  modules: ModuleSummary[];
  tasks: WeeklyTask[];
  announcements: AnnouncementSummary[];
  chat: ChatPreview;
  source: "live" | "fallback";
};

const FALLBACK_DASHBOARD: DashboardData = {
  source: "fallback",
  modules: [
    {
      id: "cs3235",
      code: "CS3235",
      title: "Computer Security",
      taskCount: 3,
      announcementCount: 2,
      lastSyncLabel: "Awaiting first Canvas sync",
    },
    {
      id: "is4231",
      code: "IS4231",
      title: "Information Security Management",
      taskCount: 2,
      announcementCount: 1,
      lastSyncLabel: "Awaiting first Canvas sync",
    },
    {
      id: "tra3203",
      code: "TRA3203",
      title: "Translation Theory and Practice",
      taskCount: 1,
      announcementCount: 3,
      lastSyncLabel: "Awaiting first Canvas sync",
    },
  ],
  tasks: [
    {
      id: "task-1",
      title: "Problem Set 2",
      moduleCode: "CS3235",
      dueLabel: "Thu · 11:59 PM",
      dueDate: null,
      status: "due-soon",
      source: "Canvas assignment",
    },
    {
      id: "task-2",
      title: "Case study reflection",
      moduleCode: "IS4231",
      dueLabel: "Fri · 5:00 PM",
      dueDate: null,
      status: "upcoming",
      source: "AI-extracted deadline",
    },
    {
      id: "task-3",
      title: "Tutorial submission",
      moduleCode: "TRA3203",
      dueLabel: "No due date found yet",
      dueDate: null,
      status: "no-date",
      source: "Canvas task draft",
    },
  ],
  announcements: [
    {
      id: "announcement-1",
      title: "Week 8 lecture slides uploaded",
      moduleCode: "CS3235",
      summary:
        "New lecture slides and a short note about quiz coverage are ready for review.",
      postedLabel: "Today",
      importance: "normal",
    },
    {
      id: "announcement-2",
      title: "Project milestone reminder",
      moduleCode: "IS4231",
      summary:
        "The lecturer highlighted the deliverable rubric and clarified what must be included this week.",
      postedLabel: "Yesterday",
      importance: "high",
    },
    {
      id: "announcement-3",
      title: "Reading list update",
      moduleCode: "TRA3203",
      summary:
        "One additional article was added for tutorial discussion, with no new graded work attached.",
      postedLabel: "2 days ago",
      importance: "low",
    },
  ],
  chat: {
    activeModule: "All modules",
    suggestedPrompts: [
      "What is due this week?",
      "Summarise the latest announcements.",
      "What changed since my last lecture?",
    ],
    recentMessages: [
      {
        id: "assistant-1",
        role: "assistant",
        content:
          "I can answer questions across your modules once sync data is available. The UI is ready for the chat route to plug into later.",
      },
      {
        id: "user-1",
        role: "user",
        content: "What should I focus on tonight?",
      },
      {
        id: "assistant-2",
        role: "assistant",
        content:
          "Start with anything marked due soon, then skim high-importance announcements for hidden deadlines or format changes.",
      },
    ],
  },
};

const weekdayFormatter = new Intl.DateTimeFormat("en-SG", {
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
});

const relativeFormatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatRelativeDate(value?: string | null) {
  if (!value) return "No due date found yet";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return weekdayFormatter.format(date);
}

function formatRelativeDayLabel(value?: string | null) {
  if (!value) return "Awaiting sync";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown sync time";

  const today = startOfToday();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayDiff = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (Math.abs(dayDiff) <= 7) {
    return relativeFormatter.format(dayDiff, "day");
  }

  return new Intl.DateTimeFormat("en-SG", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function getTaskStatus(dueAt?: string | null): WeeklyTask["status"] {
  if (!dueAt) return "no-date";

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return "no-date";

  const diffHours = (due.getTime() - Date.now()) / 3_600_000;
  if (diffHours <= 48) return "due-soon";
  return "upcoming";
}

function getRelatedModuleCode(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0] as { code?: string } | undefined;
    return first?.code ?? "General";
  }

  if (value && typeof value === "object" && "code" in value) {
    return (value as { code?: string }).code ?? "General";
  }

  return "General";
}

async function loadDashboardData(): Promise<DashboardData> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    return FALLBACK_DASHBOARD;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const [{ data: modulesData, error: modulesError }, { data: tasksData, error: tasksError }, { data: announcementsData, error: announcementsError }] =
      await Promise.all([
        supabase
          .from("modules")
          .select("id, code, title, last_canvas_sync, tasks(count), announcements(count)")
          .order("code", { ascending: true }),
        supabase
          .from("tasks")
          .select("id, title, due_at, source, modules(code)")
          .eq("completed", false)
          .order("due_at", { ascending: true, nullsFirst: false })
          .limit(6),
        supabase
          .from("announcements")
          .select("id, title, ai_summary, posted_at, importance, modules(code)")
          .order("posted_at", { ascending: false, nullsFirst: false })
          .limit(5),
      ]);

    if (modulesError || tasksError || announcementsError) {
      throw modulesError ?? tasksError ?? announcementsError;
    }

    const modules: ModuleSummary[] =
      modulesData?.map((module) => ({
        id: String(module.id),
        code: module.code ?? "MOD",
        title: module.title ?? "Untitled module",
        taskCount: Array.isArray(module.tasks) ? module.tasks[0]?.count ?? 0 : 0,
        announcementCount: Array.isArray(module.announcements)
          ? module.announcements[0]?.count ?? 0
          : 0,
        lastSyncLabel: formatRelativeDayLabel(module.last_canvas_sync),
      })) ?? [];

    const tasks: WeeklyTask[] =
      tasksData?.map((task) => ({
        id: String(task.id),
        title: task.title ?? "Untitled task",
        moduleCode: getRelatedModuleCode(task.modules),
        dueLabel: formatRelativeDate(task.due_at),
        dueDate: task.due_at,
        status: getTaskStatus(task.due_at),
        source: task.source ?? "Canvas",
      })) ?? [];

    const announcements: AnnouncementSummary[] =
      announcementsData?.map((announcement) => ({
        id: String(announcement.id),
        title: announcement.title ?? "Untitled announcement",
        moduleCode: getRelatedModuleCode(announcement.modules),
        summary:
          announcement.ai_summary?.trim() ||
          "Summary will appear here once announcements are processed by the sync pipeline.",
        postedLabel: formatRelativeDayLabel(announcement.posted_at),
        importance:
          announcement.importance === "high" ||
          announcement.importance === "low" ||
          announcement.importance === "normal"
            ? announcement.importance
            : "normal",
      })) ?? [];

    return {
      source: "live",
      modules: modules.length > 0 ? modules : FALLBACK_DASHBOARD.modules,
      tasks: tasks.length > 0 ? tasks : FALLBACK_DASHBOARD.tasks,
      announcements: announcements.length > 0 ? announcements : FALLBACK_DASHBOARD.announcements,
      chat: {
        activeModule: modules[0]?.code ?? FALLBACK_DASHBOARD.chat.activeModule,
        suggestedPrompts: [
          "What is due this week?",
          "Summarise the latest announcement for this module.",
          "What should I revise before tutorial?",
        ],
        recentMessages: FALLBACK_DASHBOARD.chat.recentMessages,
      },
    };
  } catch {
    return FALLBACK_DASHBOARD;
  }
}

function Badge({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "warn" | "danger" | "muted" }) {
  const styles = {
    default: "bg-slate-100 text-slate-700",
    warn: "bg-amber-100 text-amber-800",
    danger: "bg-rose-100 text-rose-700",
    muted: "bg-slate-900/5 text-slate-600",
  } as const;

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}>
      {children}
    </span>
  );
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

export default async function Home() {
  const dashboard = await loadDashboardData();

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 p-4 sm:p-6 xl:flex-row xl:p-8">
        <aside className="xl:w-80 xl:flex-none">
          <div className="sticky top-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-emerald-600">Studex</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  Dashboard
                </h1>
              </div>
              <Badge tone={dashboard.source === "live" ? "default" : "warn"}>
                {dashboard.source === "live" ? "Live data" : "Fallback data"}
              </Badge>
            </div>

            <div className="mt-6 rounded-2xl bg-slate-950 p-4 text-slate-50">
              <p className="text-sm text-slate-300">This week at a glance</p>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-3xl font-semibold">{dashboard.tasks.length}</p>
                  <p className="text-sm text-slate-300">Open tasks</p>
                </div>
                <div>
                  <p className="text-3xl font-semibold">{dashboard.announcements.length}</p>
                  <p className="text-sm text-slate-300">Recent updates</p>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <SectionHeading
                title="Modules"
                subtitle="Server-rendered list wired for Canvas-backed modules."
              />
              <div className="mt-4 space-y-3">
                {dashboard.modules.map((module) => (
                  <article
                    key={module.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-slate-300 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{module.code}</p>
                        <p className="mt-1 text-sm text-slate-600">{module.title}</p>
                      </div>
                      <Badge tone="muted">{module.lastSyncLabel}</Badge>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge>{module.taskCount} tasks</Badge>
                      <Badge>{module.announcementCount} announcements</Badge>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </aside>

        <section className="grid flex-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-6">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionHeading
                title="Weekly task view"
                subtitle="Assignments and extracted deadlines grouped into one focused list."
              />
              <div className="mt-5 space-y-3">
                {dashboard.tasks.map((task) => (
                  <article
                    key={task.id}
                    className="flex flex-col gap-4 rounded-2xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                        <Badge
                          tone={
                            task.status === "due-soon"
                              ? "danger"
                              : task.status === "upcoming"
                                ? "warn"
                                : "muted"
                          }
                        >
                          {task.moduleCode}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">{task.source}</p>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Badge
                        tone={
                          task.status === "due-soon"
                            ? "danger"
                            : task.status === "upcoming"
                              ? "warn"
                              : "muted"
                        }
                      >
                        {task.dueLabel}
                      </Badge>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <SectionHeading
                title="Recent announcements"
                subtitle="Important teaching updates surfaced with room for AI summaries and extracted deadlines."
              />
              <div className="mt-5 space-y-3">
                {dashboard.announcements.map((announcement) => (
                  <article key={announcement.id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{announcement.title}</p>
                      <Badge
                        tone={
                          announcement.importance === "high"
                            ? "danger"
                            : announcement.importance === "low"
                              ? "muted"
                              : "default"
                        }
                      >
                        {announcement.moduleCode}
                      </Badge>
                      <Badge tone="muted">{announcement.postedLabel}</Badge>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-slate-600">{announcement.summary}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeading
              title="AI study chat"
              subtitle="UI shell only for now — ready for the Phase 1 RAG endpoint to plug in later."
            />

            <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-900">
              Active scope: <span className="font-semibold">{dashboard.chat.activeModule}</span>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {dashboard.chat.suggestedPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700 transition hover:border-slate-300 hover:bg-white"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="mt-5 space-y-3">
              {dashboard.chat.recentMessages.map((message) => (
                <div
                  key={message.id}
                  className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-6 ${
                    message.role === "assistant"
                      ? "bg-slate-100 text-slate-700"
                      : "ml-auto bg-slate-950 text-slate-50"
                  }`}
                >
                  {message.content}
                </div>
              ))}
            </div>

            <form className="mt-5 space-y-3">
              <textarea
                className="min-h-32 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
                placeholder="Ask about a lecture, announcement, or what is due this week…"
                disabled
              />
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Chat transport intentionally left untouched. This page only provides the production-ready shell.
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
        </section>
      </div>
    </main>
  );
}
