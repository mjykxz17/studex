import "server-only";

import { createClient } from "@supabase/supabase-js";

import { hasSupabaseConfig } from "@/lib/config";
import { fetchNUSModsModule, type NUSModsData, type NUSModsExam } from "@/lib/nusmods";

export type FilePreviewKind = "pdf" | "image" | "text" | "office" | "binary";

export type CanvasFileSummary = {
  id: string;
  name: string;
  type: string;
  category: string;
  uploadedLabel: string;
  uploadedAt: string | null;
  summary: string;
  canvasUrl: string | null;
  extractedText: string | null;
  previewKind: FilePreviewKind;
  contentType: string | null;
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
  postedAt: string | null;
  importance: "high" | "normal" | "low";
};

export type DashboardChange = {
  id: string;
  kind: "announcement" | "file";
  moduleCode: string;
  title: string;
  summary: string;
  happenedAt: string | null;
  happenedLabel: string;
  importance: "high" | "normal" | "low";
  file: CanvasFileSummary | null;
};

export type DashboardOverview = {
  syncedModuleCount: number;
  openTaskCount: number;
  recentChangeCount: number;
  fileCount: number;
  dueSoonCount: number;
  lastSyncedLabel: string;
};

export type ModuleSummary = {
  id: string;
  code: string;
  title: string;
  taskCount: number;
  announcementCount: number;
  lastSyncLabel: string;
  sync_enabled: boolean;
  files: CanvasFileSummary[];
  nextTask: WeeklyTask | null;
  latestAnnouncement: AnnouncementSummary | null;
  recentFile: CanvasFileSummary | null;
  examSummary: NUSModsExam | null;
  nusmods?: NUSModsData | null;
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
  overview: DashboardOverview;
  modules: ModuleSummary[];
  tasks: WeeklyTask[];
  announcements: AnnouncementSummary[];
  recentFiles: Array<CanvasFileSummary & { moduleCode: string; moduleTitle: string }>;
  latestChanges: DashboardChange[];
  chat: ChatPreview;
  source: "live" | "fallback";
  status: "ready" | "needs-setup" | "error";
  setupMessage: string;
  userId: string | null;
  lastSyncedAt: string | null;
};

type RelationRecord = { code?: string | null };
type QueryErrorLike = { message?: string | null };

type ModuleQueryRow = {
  id: string;
  code: string | null;
  title: string | null;
  last_canvas_sync: string | null;
  sync_enabled: boolean | null;
  canvas_files: Array<{
    id: string;
    filename: string | null;
    file_type: string | null;
    uploaded_at: string | null;
    ai_summary?: string | null;
    extracted_text: string | null;
    canvas_url: string | null;
  }> | null;
};

type ModuleFileRow = NonNullable<ModuleQueryRow["canvas_files"]>[number];

type TaskQueryRow = {
  id: string;
  title: string | null;
  due_at: string | null;
  source: string | null;
  modules: RelationRecord | RelationRecord[] | null;
};

type AnnouncementQueryRow = {
  id: string;
  title: string | null;
  ai_summary?: string | null;
  posted_at: string | null;
  importance: string | null;
  modules: RelationRecord | RelationRecord[] | null;
};

function getMissingColumnName(error: QueryErrorLike | null | undefined) {
  const message = error?.message ?? "";
  const postgresMatch = message.match(/column\s+(?:"?[\w]+"?\.)?"?([\w]+)"?\s+does not exist/i);
  if (postgresMatch) {
    return postgresMatch[1];
  }

  const schemaCacheMatch = message.match(/could not find the ['"]?([\w]+)['"]? column/i);
  return schemaCacheMatch ? schemaCacheMatch[1] : null;
}

export const FALLBACK_DASHBOARD: DashboardData = {
  overview: {
    syncedModuleCount: 0,
    openTaskCount: 0,
    recentChangeCount: 0,
    fileCount: 0,
    dueSoonCount: 0,
    lastSyncedLabel: "Awaiting sync",
  },
  source: "fallback",
  status: "needs-setup",
  setupMessage:
    "Studex is waiting for Supabase, Canvas, and AI configuration. Add the required environment variables, run the SQL schema, then trigger your first sync.",
  userId: null,
  lastSyncedAt: null,
  modules: [],
  tasks: [],
  announcements: [],
  recentFiles: [],
  latestChanges: [],
  chat: {
    activeModule: "All modules",
    suggestedPrompts: [
      "What is due this week?",
      "Summarise the latest announcements.",
      "Which module changed most recently?",
    ],
    recentMessages: [
      {
        id: "assistant-bootstrap",
        role: "assistant",
        content: "Once sync finishes, I’ll answer from your real Canvas files, tasks, and announcements.",
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

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"]);
const TEXT_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log", "xml", "yaml", "yml", "html", "htm"]);
const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx"]);

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toTimestamp(value?: string | null) {
  if (!value) {
    return 0;
  }

  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getFileExtension(fileName: string | null | undefined) {
  if (!fileName) {
    return "";
  }

  const parts = fileName.toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

function guessContentType(fileName: string | null | undefined) {
  const extension = getFileExtension(fileName);

  switch (extension) {
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "svg":
      return "image/svg+xml";
    case "txt":
      return "text/plain";
    case "md":
      return "text/markdown";
    case "csv":
      return "text/csv";
    case "json":
      return "application/json";
    case "html":
    case "htm":
      return "text/html";
    case "xml":
      return "application/xml";
    case "yaml":
    case "yml":
      return "application/yaml";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "ppt":
      return "application/vnd.ms-powerpoint";
    case "pptx":
      return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    default:
      return null;
  }
}

function getPreviewKind(fileName: string | null | undefined, extractedText: string | null) {
  const extension = getFileExtension(fileName);

  if (extension === "pdf") {
    return "pdf" as const;
  }

  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image" as const;
  }

  if (TEXT_EXTENSIONS.has(extension)) {
    return "text" as const;
  }

  if (OFFICE_EXTENSIONS.has(extension)) {
    return "office" as const;
  }

  if (extractedText?.trim()) {
    return "text" as const;
  }

  return "binary" as const;
}

function sortNewestFirst<T>(items: T[], getDate: (item: T) => string | null | undefined) {
  return [...items].sort((left, right) => toTimestamp(getDate(right)) - toTimestamp(getDate(left)));
}

function groupByModuleCode<T extends { moduleCode: string }>(items: T[]) {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const group = groups.get(item.moduleCode) ?? [];
    group.push(item);
    groups.set(item.moduleCode, group);
  }

  return groups;
}

export function formatRelativeDate(value?: string | null) {
  if (!value) {
    return "No due date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return weekdayFormatter.format(date);
}

export function formatRelativeDayLabel(value?: string | null) {
  if (!value) {
    return "Awaiting sync";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  const today = startOfToday();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (Math.abs(diffDays) <= 7) {
    return relativeFormatter.format(diffDays, "day");
  }

  return new Intl.DateTimeFormat("en-SG", {
    month: "short",
    day: "numeric",
  }).format(date);
}

export function getTaskStatus(dueAt?: string | null): WeeklyTask["status"] {
  if (!dueAt) {
    return "no-date";
  }

  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return "no-date";
  }

  return (due.getTime() - Date.now()) / 3_600_000 <= 48 ? "due-soon" : "upcoming";
}

function getRelatedModuleCode(value: RelationRecord | RelationRecord[] | null | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.code ?? "General";
  }

  return value?.code ?? "General";
}

function getFileCategory(type: string | null) {
  switch (type) {
    case "lecture":
      return "Lecture";
    case "tutorial":
      return "Tutorial";
    case "assignment":
      return "Assignment";
    default:
      return "Reference";
  }
}

function createServiceClient() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function loadModuleRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const full = await supabase
    .from("modules")
    .select("id, code, title, last_canvas_sync, sync_enabled, canvas_files(id, filename, file_type, uploaded_at, ai_summary, extracted_text, canvas_url)")
    .eq("user_id", userId)
    .order("code", { ascending: true });

  if (full.error && getMissingColumnName(full.error) === "ai_summary") {
    return supabase
      .from("modules")
      .select("id, code, title, last_canvas_sync, sync_enabled, canvas_files(id, filename, file_type, uploaded_at, extracted_text, canvas_url)")
      .eq("user_id", userId)
      .order("code", { ascending: true });
  }

  return full;
}

async function loadAnnouncementRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  const full = await supabase
    .from("announcements")
    .select("id, title, ai_summary, posted_at, importance, modules(code)")
    .eq("user_id", userId)
    .order("posted_at", { ascending: false, nullsFirst: false });

  if (full.error && getMissingColumnName(full.error) === "ai_summary") {
    return supabase
      .from("announcements")
      .select("id, title, posted_at, importance, modules(code)")
      .eq("user_id", userId)
      .order("posted_at", { ascending: false, nullsFirst: false });
  }

  return full;
}

function buildFileSummary(row: ModuleFileRow): CanvasFileSummary {
  const name = row.filename ?? "Untitled file";
  const extractedText = row.extracted_text ?? null;

  return {
    id: row.id,
    name,
    type: row.file_type ?? "other",
    category: getFileCategory(row.file_type),
    uploadedLabel: formatRelativeDayLabel(row.uploaded_at),
    uploadedAt: row.uploaded_at,
    summary:
      row.ai_summary?.trim() ||
      (extractedText ? `${extractedText.slice(0, 160).trim()}…` : "Summary will appear after file processing."),
    canvasUrl: row.canvas_url,
    extractedText,
    previewKind: getPreviewKind(name, extractedText),
    contentType: guessContentType(name),
  };
}

function buildLatestChanges(announcements: AnnouncementSummary[], recentFiles: Array<CanvasFileSummary & { moduleCode: string }>) {
  const announcementChanges: DashboardChange[] = announcements.map((announcement) => ({
    id: announcement.id,
    kind: "announcement",
    moduleCode: announcement.moduleCode,
    title: announcement.title,
    summary: announcement.summary,
    happenedAt: announcement.postedAt,
    happenedLabel: announcement.postedLabel,
    importance: announcement.importance,
    file: null,
  }));

  const fileChanges: DashboardChange[] = recentFiles.map((file) => ({
    id: file.id,
    kind: "file",
    moduleCode: file.moduleCode,
    title: file.name,
    summary: file.summary,
    happenedAt: file.uploadedAt,
    happenedLabel: file.uploadedLabel,
    importance: "normal",
    file,
  }));

  return sortNewestFirst([...announcementChanges, ...fileChanges], (change) => change.happenedAt).slice(0, 12);
}

export async function loadDashboardData(): Promise<DashboardData> {
  if (!hasSupabaseConfig()) {
    return FALLBACK_DASHBOARD;
  }

  try {
    const supabase = createServiceClient();
    const { data: userRow, error: userError } = await supabase
      .from("users")
      .select("id, last_synced_at")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ id: string; last_synced_at: string | null }>();

    if (userError) {
      throw new Error(userError.message);
    }

    const userId = userRow?.id ?? null;
    const lastSyncedAt = userRow?.last_synced_at ?? null;

    if (!userId) {
      return {
        ...FALLBACK_DASHBOARD,
        setupMessage: "No demo user exists yet. Run sync once to create the local user and import your Canvas content.",
      };
    }

    const [
      { data: modulesData, error: modulesError },
      { data: tasksData, error: tasksError },
      { data: announcementsData, error: announcementsError },
    ] = await Promise.all([
      loadModuleRows(supabase, userId),
      supabase
        .from("tasks")
        .select("id, title, due_at, source, modules(code)")
        .eq("user_id", userId)
        .eq("completed", false)
        .order("due_at", { ascending: true, nullsFirst: false }),
      loadAnnouncementRows(supabase, userId),
    ]);

    if (modulesError || tasksError || announcementsError) {
      throw new Error(modulesError?.message ?? tasksError?.message ?? announcementsError?.message ?? "Failed to load dashboard data.");
    }

    const tasks: WeeklyTask[] = ((tasksData ?? []) as TaskQueryRow[]).map((task) => ({
      id: task.id,
      title: task.title ?? "Untitled task",
      moduleCode: getRelatedModuleCode(task.modules),
      dueLabel: formatRelativeDate(task.due_at),
      dueDate: task.due_at,
      status: getTaskStatus(task.due_at),
      source: task.source ?? "Canvas",
    }));

    const announcements: AnnouncementSummary[] = ((announcementsData ?? []) as AnnouncementQueryRow[]).map((announcement) => ({
      id: announcement.id,
      title: announcement.title ?? "Untitled announcement",
      moduleCode: getRelatedModuleCode(announcement.modules),
      summary:
        announcement.ai_summary?.trim() ||
        "Summary will appear here once the announcement has been processed by the sync pipeline.",
      postedLabel: formatRelativeDayLabel(announcement.posted_at),
      postedAt: announcement.posted_at,
      importance:
        announcement.importance === "high" || announcement.importance === "low" || announcement.importance === "normal"
          ? announcement.importance
          : "normal",
    }));

    const tasksByModule = groupByModuleCode(tasks);
    const announcementsByModule = groupByModuleCode(announcements);

    const modules: ModuleSummary[] = await Promise.all(
      ((modulesData ?? []) as ModuleQueryRow[]).map(async (module) => {
        let nusmods: NUSModsData | null = null;

        try {
          nusmods = await fetchNUSModsModule(module.code ?? "");
        } catch {
          nusmods = null;
        }

        const moduleFiles = sortNewestFirst((module.canvas_files ?? []).map((file) => buildFileSummary(file)), (file) => file.uploadedAt);
        const moduleCode = module.code ?? "MOD";
        const nextTask = tasksByModule.get(moduleCode)?.[0] ?? null;
        const latestAnnouncement = announcementsByModule.get(moduleCode)?.[0] ?? null;

        return {
          id: module.id,
          code: moduleCode,
          title: module.title ?? "Untitled module",
          taskCount: tasksByModule.get(moduleCode)?.length ?? 0,
          announcementCount: announcementsByModule.get(moduleCode)?.length ?? 0,
          lastSyncLabel: formatRelativeDayLabel(module.last_canvas_sync),
          sync_enabled: module.sync_enabled ?? true,
          files: moduleFiles,
          nextTask,
          latestAnnouncement,
          recentFile: moduleFiles[0] ?? null,
          examSummary: nusmods?.exam ?? null,
          nusmods,
        };
      }),
    );

    const recentFiles = sortNewestFirst(
      modules.flatMap((module) =>
        module.files.map((file) => ({
          ...file,
          moduleCode: module.code,
          moduleTitle: module.title,
        })),
      ),
      (file) => file.uploadedAt,
    ).slice(0, 10);

    const latestChanges = buildLatestChanges(announcements, recentFiles);
    const hasLiveContent = modules.length > 0 || tasks.length > 0 || announcements.length > 0;
    const syncedModules = modules.filter((module) => module.sync_enabled);

    return {
      overview: {
        syncedModuleCount: syncedModules.length,
        openTaskCount: tasks.length,
        recentChangeCount: latestChanges.length,
        fileCount: modules.reduce((count, module) => count + module.files.length, 0),
        dueSoonCount: tasks.filter((task) => task.status === "due-soon").length,
        lastSyncedLabel: formatRelativeDayLabel(lastSyncedAt),
      },
      source: hasLiveContent ? "live" : "fallback",
      status: hasLiveContent ? "ready" : "needs-setup",
      setupMessage: hasLiveContent
        ? "Studex is rendering live Canvas-backed data from Supabase."
        : "Supabase is reachable, but no synced course content exists yet. Run a sync to pull your Canvas data in.",
      userId,
      lastSyncedAt,
      modules,
      tasks,
      announcements,
      recentFiles,
      latestChanges,
      chat: {
        activeModule: modules[0]?.code ?? FALLBACK_DASHBOARD.chat.activeModule,
        suggestedPrompts: [
          "What is due this week?",
          "Summarise the latest announcement for this module.",
          "Which files should I revise first?",
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
