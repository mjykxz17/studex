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
          "I can answer questions across your modules once sync data is available. The UI is ready for the chat route to plug in later.",
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

    const [
      { data: modulesData, error: modulesError },
      { data: tasksData, error: tasksError },
      { data: announcementsData, error: announcementsError },
    ] = await Promise.all([
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
      announcements:
        announcements.length > 0 ? announcements : FALLBACK_DASHBOARD.announcements,
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
              <button
                type="button"
                className="grid h-11 w-11 place-items-center rounded-2xl border border-slate-200 bg-white text-lg text-slate-700 shadow-sm lg:hidden"
                aria-label="Toggle modules"
              >
                ☰
              </button>
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,#2563eb,#7c3aed_62%,#ec4899)] text-xs font-extrabold tracking-[0.18em] text-white shadow-[0_16px_30px_rgba(99,102,241,0.25)]">
                SX
              </div>
              <div>
                <p className="font-serif text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl">
                  Studex
                </p>
                <p className="text-sm text-slate-500">Study command center for Aiden</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:items-end">
              <nav className="hidden items-center gap-2 lg:flex">
                {([
                  ["Home", true],
                  ["Planner", false],
                  ["Changes", false],
                  ["Settings", false],
                ] as const).map(([label, active]) => (
                  <button
                    key={label}
                    type="button"
                    className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                      active
                        ? "bg-blue-50 text-slate-950"
                        : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between lg:justify-end">
                <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                  <Badge tone={dashboard.source === "live" ? "success" : "warn"}>
                    {dashboard.source === "live" ? "Live data" : "Fallback data"}
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

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300"
                  >
                    Sync
                  </button>
                  <button
                    type="button"
                    className="rounded-2xl bg-[linear-gradient(135deg,#111827,#334155)] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(15,23,42,0.16)] transition hover:-translate-y-0.5"
                  >
                    Ask AI
                  </button>
                </div>
              </div>
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
                {dashboard.modules.map((module, index) => (
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
                ))}
              </div>

              <div className="mt-4 rounded-[22px] border border-slate-200/80 bg-slate-50/80 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Flow note</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  The shell now mirrors the approved Studex-style navigation frame while keeping the current data pipeline untouched.
                </p>
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
                    Focus on what changed, what is due next, and what deserves attention tonight.
                    Studex keeps the dashboard frame clean even when Canvas content is messy.
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

              <section className="mt-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/85 shadow-[0_10px_30px_rgba(15,23,42,0.04)]">
                <div className="grid gap-px bg-slate-200/80 lg:grid-cols-[1.1fr_0.8fr_1fr]">
                  <div className="bg-white p-5 sm:p-6">
                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                      Planning surface
                    </p>
                    <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                      This week at a glance
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      A cleaner command-center overview for weekly workload, recent module activity, and what to tackle next.
                    </p>
                  </div>

                  <div className="grid gap-3 bg-white p-5 sm:p-6">
                    <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 p-4">
                      <p className="text-2xl font-semibold tracking-tight text-slate-950">{dashboard.modules.length}</p>
                      <p className="mt-1 text-xs text-slate-400">Modules in rotation</p>
                    </div>
                    <div className="rounded-[20px] border border-slate-200/70 bg-slate-50/90 p-4">
                      <p className="text-2xl font-semibold tracking-tight text-slate-950">{changeCount}</p>
                      <p className="mt-1 text-xs text-slate-400">High-signal changes</p>
                    </div>
                  </div>

                  <div className="bg-white p-5 sm:p-6">
                    <div className="space-y-3">
                      {dashboard.tasks.slice(0, 3).map((task) => (
                        <div key={task.id} className="flex items-start justify-between gap-3 border-b border-slate-200/70 pb-3 last:border-b-0 last:pb-0">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{task.title}</p>
                            <p className="mt-1 text-sm text-slate-500">{task.moduleCode}</p>
                          </div>
                          <Badge tone={toneForTask(task.status)}>{task.dueLabel}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.16fr)_minmax(320px,0.84fr)]">
                <div className="min-w-0 space-y-6">
                  <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <SectionHeading
                      kicker="Due next"
                      title="Weekly task view"
                      subtitle="Assignments and extracted deadlines in one focused queue."
                      action={<Badge tone="danger">{dueSoonCount} urgent</Badge>}
                    />
                    <div>
                      {dashboard.tasks.map((task) => (
                        <article
                          key={task.id}
                          className="flex flex-col gap-4 border-b border-slate-200/70 px-5 py-4 last:border-b-0 sm:px-6 lg:flex-row lg:items-center lg:justify-between"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-950">{task.title}</p>
                              <Badge tone="muted">{task.moduleCode}</Badge>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{task.source}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge tone={toneForTask(task.status)}>{task.dueLabel}</Badge>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <SectionHeading
                      kicker="What changed"
                      title="Recent announcements"
                      subtitle="Teaching updates surfaced with stronger card hierarchy and room for AI summaries."
                      action={<Badge tone="default">{dashboard.announcements.length} items</Badge>}
                    />
                    <div>
                      {dashboard.announcements.map((announcement) => (
                        <article
                          key={announcement.id}
                          className="border-b border-slate-200/70 px-5 py-5 last:border-b-0 sm:px-6"
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
                  </section>
                </div>

                <div className="min-w-0 space-y-6">
                  <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(248,250,255,0.98))] shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <SectionHeading
                      kicker="Action queue"
                      title="AI study chat"
                      subtitle="Shell only for now — framed like the approved prototype, ready for the RAG route later."
                    />

                    <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
                      <div className="rounded-[22px] border border-emerald-100 bg-emerald-50/90 p-4 text-sm text-emerald-900">
                        Active scope: <span className="font-semibold">{dashboard.chat.activeModule}</span>
                      </div>

                      <div className="mt-4 flex flex-wrap gap-2">
                        {dashboard.chat.suggestedPrompts.map((prompt) => (
                          <button
                            key={prompt}
                            type="button"
                            className="rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:-translate-y-0.5 hover:border-slate-300"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>

                      <div className="mt-5 space-y-3">
                        {dashboard.chat.recentMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`max-w-[92%] rounded-[22px] px-4 py-3 text-sm leading-7 ${
                              message.role === "assistant"
                                ? "bg-slate-100 text-slate-700"
                                : "ml-auto bg-slate-950 text-white"
                            }`}
                          >
                            {message.content}
                          </div>
                        ))}
                      </div>

                      <form className="mt-5 space-y-3">
                        <textarea
                          className="min-h-32 w-full resize-none rounded-[24px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white"
                          placeholder="Ask about a lecture, announcement, or what is due this week…"
                          disabled
                        />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs leading-5 text-slate-500">
                            Chat transport intentionally left untouched. This work only upgrades the production shell and layout system.
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

                  <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <SectionHeading
                      kicker="Snapshot"
                      title="Module focus"
                      subtitle="A compact right-column summary panel, similar to the approved prototype’s supporting stack."
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
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Shell status</p>
                        <p className="mt-3 text-lg font-semibold tracking-tight text-slate-950">
                          Prototype-aligned
                        </p>
                        <p className="mt-2 text-sm leading-6 text-slate-500">
                          Glass top bar, persistent module rail, stronger dashboard hierarchy, and mobile-safe stacking are now built into the real app.
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
