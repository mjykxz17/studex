import "server-only";

import { createClient } from "@supabase/supabase-js";

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
  status: "ready" | "needs-setup" | "error";
  setupMessage: string;
  userId: string | null;
  lastSyncedAt: string | null;
};

export const FALLBACK_DASHBOARD: DashboardData = {
  source: "fallback",
  status: "needs-setup",
  setupMessage:
    "Studex is waiting for Supabase, Canvas, and AI environment variables. Add them, run the Supabase schema, then trigger your first sync.",
  userId: null,
  lastSyncedAt: null,
  modules: [],
  tasks: [],
  announcements: [],
  chat: {
    activeModule: "All modules",
    suggestedPrompts: [
      "What is due this week?",
      "Summarise the latest announcements.",
      "What changed since my last lecture?",
    ],
    recentMessages: [
      {
        id: "assistant-bootstrap",
        role: "assistant",
        content:
          "Once you run the first sync, I’ll answer against your real Canvas files, announcements, and assignment data.",
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

function hasRequiredEnv() {
  return Boolean(
    process.env.SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_KEY?.trim() &&
      process.env.SUPABASE_ANON_KEY?.trim(),
  );
}

export async function loadDashboardData(): Promise<DashboardData> {
  if (!hasRequiredEnv()) {
    return FALLBACK_DASHBOARD;
  }

  try {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id, last_synced_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (userError) {
      throw userError;
    }

    const userId = userRow?.id ?? null;
    const lastSyncedAt = userRow?.last_synced_at ?? null;

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

    const hasLiveContent = modules.length > 0 || tasks.length > 0 || announcements.length > 0;

    return {
      source: hasLiveContent ? "live" : "fallback",
      status: hasLiveContent ? "ready" : "needs-setup",
      setupMessage: hasLiveContent
        ? "Studex is reading real Canvas-backed data from Supabase."
        : "Supabase is reachable, but no synced course content is stored yet. Trigger a sync to pull your Canvas data in.",
      userId,
      lastSyncedAt,
      modules,
      tasks,
      announcements,
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
  } catch (error) {
    const message = error instanceof Error ? error.message : FALLBACK_DASHBOARD.setupMessage;

    return {
      ...FALLBACK_DASHBOARD,
      status: "error",
      setupMessage: `Dashboard data failed to load: ${message}`,
    };
  }
}
