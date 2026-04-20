import "server-only";

import { createClient } from "@supabase/supabase-js";

import { hasSupabaseConfig } from "@/lib/config";
import type {
  AnnouncementSummary,
  CanvasFileSummary,
  CourseProgressSummary,
  DashboardChange,
  DashboardData,
  GradeSummary,
  ModuleSummary,
  WeeklyTask,
} from "@/lib/contracts";
import { fetchNUSModsModule, type NUSModsData } from "@/lib/nusmods";

type RelationRecord = { code?: string | null };

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
  courses: RelationRecord | RelationRecord[] | null;
};

type AnnouncementQueryRow = {
  id: string;
  title: string | null;
  body_raw: string | null;
  posted_at: string | null;
  importance: string | null;
  courses: RelationRecord | RelationRecord[] | null;
};

type GradeQueryRow = {
  id: string;
  score: number | null;
  grade_text: string | null;
  points_possible: number | null;
  graded_at: string | null;
  state: string | null;
  tasks:
    | {
        id: string;
        title: string | null;
        source_ref_id: string | null;
        courses:
          | { code: string | null; canvas_course_id: string | null }
          | Array<{ code: string | null; canvas_course_id: string | null }>
          | null;
      }
    | null;
};

type CourseModuleQueryRow = {
  id: string;
  course_id: string;
  name: string | null;
  position: number | null;
  state: string | null;
  items_count: number | null;
  courses:
    | { code: string | null; title: string | null }
    | Array<{ code: string | null; title: string | null }>
    | null;
  course_module_items: Array<{
    id: string;
    title: string | null;
    item_type: string | null;
    position: number | null;
  }> | null;
};


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
    "Studex is waiting for Supabase and Canvas configuration. Add the required environment variables, run the SQL schema, then trigger your first sync.",
  userId: null,
  lastSyncedAt: null,
  modules: [],
  tasks: [],
  announcements: [],
  recentFiles: [],
  latestChanges: [],
  recentGrades: [],
  courseProgress: [],
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

function stripHtmlForSummary(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function loadModuleRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("courses")
    .select("id, code, title, last_canvas_sync, sync_enabled, canvas_files(id, filename, file_type, uploaded_at, extracted_text, canvas_url)")
    .eq("user_id", userId)
    .order("code", { ascending: true });
}

async function loadAnnouncementRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("announcements")
    .select("id, title, body_raw, posted_at, importance, courses(code)")
    .eq("user_id", userId)
    .order("posted_at", { ascending: false, nullsFirst: false });
}

async function loadGradeRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("grades")
    .select(
      "id, score, grade_text, points_possible, graded_at, state, tasks(id, title, source_ref_id, courses(code, canvas_course_id))",
    )
    .eq("user_id", userId)
    .order("graded_at", { ascending: false, nullsFirst: false })
    .limit(5);
}

async function loadCourseModuleRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("course_modules")
    .select(
      "id, course_id, name, position, state, items_count, courses(code, title), course_module_items(id, title, item_type, position)",
    )
    .eq("user_id", userId)
    .order("position", { ascending: true });
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
    summary: extractedText ? `${extractedText.slice(0, 160).trim()}…` : "Open this file to preview it.",
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

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function deriveCanvasAssignmentUrl(
  canvasBaseUrl: string,
  canvasCourseId: string | null,
  sourceRefId: string | null,
): string | null {
  if (!canvasCourseId || !sourceRefId) return null;
  return `${canvasBaseUrl.replace(/\/+$/, "")}/courses/${canvasCourseId}/assignments/${sourceRefId}`;
}

function buildGradeSummary(row: GradeQueryRow, canvasBaseUrl: string): GradeSummary {
  const task = row.tasks;
  const course = firstRelation(task?.courses ?? null);
  const moduleCode = course?.code ?? "MOD";
  const canvasCourseId = course?.canvas_course_id ?? null;
  const sourceRefId = task?.source_ref_id ?? null;
  const state = row.state === "submitted" || row.state === "graded" || row.state === "missing" || row.state === "unsubmitted"
    ? (row.state as GradeSummary["state"])
    : null;

  return {
    id: row.id,
    moduleCode,
    assignmentTitle: task?.title ?? "Untitled assignment",
    score: row.score,
    gradeText: row.grade_text,
    pointsPossible: row.points_possible,
    state,
    gradedAt: row.graded_at,
    gradedLabel: formatRelativeDayLabel(row.graded_at),
    canvasUrl: deriveCanvasAssignmentUrl(canvasBaseUrl, canvasCourseId, sourceRefId),
  };
}

function buildCourseProgressSummaries(rows: CourseModuleQueryRow[]): CourseProgressSummary[] {
  // Group modules by course_id, keeping the grouping order stable (first-seen).
  const byCourse = new Map<string, CourseModuleQueryRow[]>();
  for (const row of rows) {
    const list = byCourse.get(row.course_id);
    if (list) {
      list.push(row);
    } else {
      byCourse.set(row.course_id, [row]);
    }
  }

  const summaries: CourseProgressSummary[] = [];
  for (const [courseId, courseModules] of byCourse.entries()) {
    const sorted = [...courseModules].sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
    const course = firstRelation(sorted[0]?.courses ?? null);
    const moduleCode = course?.code ?? "MOD";
    const courseTitle = course?.title ?? "Untitled course";

    const currentModule =
      sorted.find((module) => module.state !== "completed") ?? sorted[sorted.length - 1] ?? null;
    const nextItem = (currentModule?.course_module_items ?? [])
      .filter((item) => item.item_type !== "SubHeader")
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0))[0];

    summaries.push({
      courseId,
      moduleCode,
      courseTitle,
      totalModules: sorted.length,
      currentModulePosition: currentModule?.position ?? null,
      currentModuleName: currentModule?.name ?? null,
      nextItemTitle: nextItem?.title ?? null,
    });
  }

  return summaries;
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
      { data: gradesData, error: gradesError },
      { data: courseModulesData, error: courseModulesError },
    ] = await Promise.all([
      loadModuleRows(supabase, userId),
      supabase
        .from("tasks")
        .select("id, title, due_at, source, courses(code)")
        .eq("user_id", userId)
        .eq("completed", false)
        .order("due_at", { ascending: true, nullsFirst: false }),
      loadAnnouncementRows(supabase, userId),
      loadGradeRows(supabase, userId),
      loadCourseModuleRows(supabase, userId),
    ]);

    if (modulesError || tasksError || announcementsError || gradesError || courseModulesError) {
      throw new Error(
        modulesError?.message ??
          tasksError?.message ??
          announcementsError?.message ??
          gradesError?.message ??
          courseModulesError?.message ??
          "Failed to load dashboard data.",
      );
    }

    const tasks: WeeklyTask[] = ((tasksData ?? []) as TaskQueryRow[]).map((task) => ({
      id: task.id,
      title: task.title ?? "Untitled task",
      moduleCode: getRelatedModuleCode(task.courses),
      dueLabel: formatRelativeDate(task.due_at),
      dueDate: task.due_at,
      status: getTaskStatus(task.due_at),
      source: task.source ?? "Canvas",
    }));

    const announcements: AnnouncementSummary[] = ((announcementsData ?? []) as AnnouncementQueryRow[]).map((announcement) => {
      const bodyPreview = stripHtmlForSummary(announcement.body_raw);
      return {
        id: announcement.id,
        title: announcement.title ?? "Untitled announcement",
        moduleCode: getRelatedModuleCode(announcement.courses),
        summary: bodyPreview
          ? `${bodyPreview.slice(0, 220).trim()}${bodyPreview.length > 220 ? "…" : ""}`
          : "Open this announcement to read the full message.",
        postedLabel: formatRelativeDayLabel(announcement.posted_at),
        postedAt: announcement.posted_at,
        importance:
          announcement.importance === "high" || announcement.importance === "low" || announcement.importance === "normal"
            ? announcement.importance
            : "normal",
      };
    });

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

    const canvasBaseUrl = process.env.CANVAS_BASE_URL?.trim() || "https://canvas.nus.edu.sg";
    const recentGrades: GradeSummary[] = ((gradesData ?? []) as unknown as GradeQueryRow[]).map((row) =>
      buildGradeSummary(row, canvasBaseUrl),
    );
    const courseProgress = buildCourseProgressSummaries((courseModulesData ?? []) as unknown as CourseModuleQueryRow[]);

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
      recentGrades,
      courseProgress,
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
