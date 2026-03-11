import { createClient } from "@supabase/supabase-js";
import { DashboardShell } from "./ui/dashboard-shell";

export type ModuleSummary = {
  id: string;
  code: string;
  title: string;
  taskCount: number;
  announcementCount: number;
  lastSyncLabel: string;
};

export type WeeklyTask = {
  id: string;
  title: string;
  moduleCode: string;
  dueLabel: string;
  dueDate?: string | null;
  status: "due-soon" | "upcoming" | "no-date";
  source: string;
};

export type AnnouncementSummary = {
  id: string;
  title: string;
  moduleCode: string;
  summary: string;
  postedLabel: string;
  importance: "high" | "normal" | "low";
};

export type ChatPreview = {
  activeModule: string;
  suggestedPrompts: string[];
  recentMessages: Array<{
    id: string;
    role: "assistant" | "user";
    content: string;
  }>;
};

export type DashboardData = {
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

export default async function Home() {
  const dashboard = await loadDashboardData();

  return <DashboardShell dashboard={dashboard} />;
}
