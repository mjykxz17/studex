import "server-only";

import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAnnouncements,
  getAssignmentsWithSubmissions,
  getCourses,
  getFiles,
  getFileDownloadUrl,
  getModules,
  getModuleItems,
  getPage,
  getPages,
  type CanvasAnnouncement,
  type CanvasAssignmentWithSubmission,
  type CanvasCourse,
  type CanvasFile,
  type CanvasModule,
  type CanvasModuleItem,
  type CanvasPage,
} from "@/lib/canvas";
import { type SyncCounts, type SyncEvent } from "@/lib/contracts";
import { ensureDemoUser } from "@/lib/demo-user";
import { fetchNUSModsModule } from "@/lib/nusmods";
import { sanitizeHtml } from "@/lib/sanitize";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type SyncSender = (event: SyncEvent) => void;

type CourseRow = {
  id: string;
  canvas_course_id: string;
  code: string | null;
  title: string | null;
  sync_enabled: boolean | null;
};

type FileRow = {
  id: string;
  canvas_file_id: string | null;
  source_updated_at: string | null;
  content_hash: string | null;
  processed: boolean | null;
};

type AnnouncementRow = {
  id: string;
  canvas_announcement_id: string | null;
  source_updated_at: string | null;
  content_hash: string | null;
};

type TaskRow = {
  id: string;
  source_ref_id: string | null;
  due_at: string | null;
  description_hash: string | null;
};

type SyncConfig = {
  selectedModuleIds: string[];
  syncFiles: boolean;
};

export function sanitizeSyncText(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\0/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "")
    .trim();
}

export function stripHtml(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/&amp;/gi, "&")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

export function createContentHash(text: string) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export function buildSourceLabel({
  moduleCode,
  sourceType,
  title,
  weekNumber,
}: {
  moduleCode: string;
  sourceType: "file" | "announcement" | "task";
  title: string;
  weekNumber?: number | null;
}) {
  const normalizedTitle = sanitizeSyncText(title) || "Untitled";
  const weekSuffix = weekNumber ? ` · Week ${weekNumber}` : "";
  return `${moduleCode} · ${sourceType}${weekSuffix} · ${normalizedTitle}`;
}

function createCounts(): SyncCounts {
  return {
    modules: 0,
    announcements: 0,
    tasks: 0,
    files: 0,
  };
}

function inferModuleCode(course: CanvasCourse): string {
  const candidates = [course.course_code, course.original_name, course.name]
    .map((value) => sanitizeSyncText(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = candidate.match(/[A-Z]{2,4}\d{4}[A-Z]?/);
    if (match) {
      return match[0];
    }
  }

  return sanitizeSyncText(course.course_code) || sanitizeSyncText(course.name) || `course-${course.id}`;
}

async function upsertCourse(userId: string, course: CanvasCourse) {
  const supabase = getSupabaseAdminClient();
  const code = inferModuleCode(course);
  const { data, error } = await supabase
    .from("courses")
    .upsert(
      {
        user_id: userId,
        canvas_course_id: String(course.id),
        code,
        title: sanitizeSyncText(course.name) || code,
        last_canvas_sync: new Date().toISOString(),
      },
      { onConflict: "user_id, canvas_course_id" },
    )
    .select("id, canvas_course_id, code, title, sync_enabled")
    .single<CourseRow>();

  if (error || !data) {
    throw new Error(`Failed to upsert course ${code}: ${error?.message ?? "Unknown error"}`);
  }

  return data;
}

async function getSafeFileDownloadUrl(fileId: number | string) {
  try {
    return await getFileDownloadUrl(fileId);
  } catch {
    return null;
  }
}

async function loadExistingState(supabase: SupabaseClient, courseId: string) {
  const [announcementsResult, tasksResult, filesResult] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, canvas_announcement_id, source_updated_at, content_hash")
      .eq("course_id", courseId),
    supabase
      .from("tasks")
      .select("id, source_ref_id, due_at, description_hash")
      .eq("course_id", courseId)
      .eq("source", "canvas"),
    supabase
      .from("canvas_files")
      .select("id, canvas_file_id, source_updated_at, content_hash, processed")
      .eq("course_id", courseId),
  ]);

  if (announcementsResult.error) {
    throw new Error(announcementsResult.error.message);
  }
  if (tasksResult.error) {
    throw new Error(tasksResult.error.message);
  }
  if (filesResult.error) {
    throw new Error(filesResult.error.message);
  }

  const announcementRows = (announcementsResult.data ?? []) as AnnouncementRow[];
  const taskRows = (tasksResult.data ?? []) as TaskRow[];
  const fileRows = (filesResult.data ?? []) as FileRow[];

  return {
    announcements: new Map(announcementRows.map((row) => [String(row.canvas_announcement_id), row])),
    tasks: new Map(taskRows.map((row) => [String(row.source_ref_id), row])),
    files: new Map(fileRows.map((row) => [String(row.canvas_file_id), row])),
  };
}

async function syncAnnouncement(params: {
  supabase: SupabaseClient;
  userId: string;
  course: CourseRow;
  announcement: CanvasAnnouncement;
  existing: AnnouncementRow | undefined;
}) {
  const bodyText = sanitizeSyncText(stripHtml(params.announcement.message ?? ""));
  const contentHash = createContentHash(bodyText);
  const sourceUpdatedAt = params.announcement.updated_at ?? params.announcement.posted_at ?? null;

  if (
    params.existing &&
    params.existing.source_updated_at === sourceUpdatedAt &&
    params.existing.content_hash === contentHash
  ) {
    return { changed: false };
  }

  const { error } = await params.supabase.from("announcements").upsert(
    {
      course_id: params.course.id,
      user_id: params.userId,
      canvas_announcement_id: String(params.announcement.id),
      title: sanitizeSyncText(params.announcement.title),
      body_raw: params.announcement.message ?? null,
      posted_at: params.announcement.posted_at ?? null,
      source_updated_at: sourceUpdatedAt,
      content_hash: contentHash,
    },
    { onConflict: "user_id, canvas_announcement_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert announcement: ${error.message}`);
  }

  return { changed: true };
}

async function syncAssignment(params: {
  supabase: SupabaseClient;
  userId: string;
  course: CourseRow;
  assignment: CanvasAssignmentWithSubmission;
  existing: TaskRow | undefined;
}) {
  const descriptionRaw = params.assignment.description ?? "";
  const descriptionText = sanitizeSyncText(stripHtml(descriptionRaw));
  const descriptionHtml = sanitizeHtml(descriptionRaw);
  const descriptionHash = createContentHash(descriptionText);
  const dueAt = params.assignment.due_at ?? null;

  const taskPayload = {
    course_id: params.course.id,
    user_id: params.userId,
    title: sanitizeSyncText(params.assignment.name) || "Untitled task",
    due_at: dueAt,
    source: "canvas",
    source_ref_id: String(params.assignment.id),
    completed: false,
    description_hash: descriptionHash,
    description_html: descriptionHtml,
    description_text: descriptionText,
  };

  const taskUnchanged =
    params.existing && params.existing.due_at === dueAt && params.existing.description_hash === descriptionHash;

  let taskId = params.existing?.id ?? null;

  if (!taskUnchanged) {
    const { data, error } = await params.supabase
      .from("tasks")
      .upsert(taskPayload, { onConflict: "user_id, source, source_ref_id" })
      .select("id")
      .single<{ id: string }>();

    if (error || !data) {
      throw new Error(`Failed to upsert task: ${error?.message ?? "Unknown error"}`);
    }

    taskId = data.id;
  }

  // Upsert grade if Canvas returned a submission for this assignment.
  const submission = params.assignment.submission ?? null;
  if (submission && taskId) {
    const gradePayload = {
      user_id: params.userId,
      assignment_id: taskId,
      score: submission.score ?? null,
      grade_text: submission.grade ?? null,
      points_possible: params.assignment.points_possible ?? null,
      submitted_at: submission.submitted_at ?? null,
      graded_at: submission.graded_at ?? null,
      state: submission.workflow_state ?? null,
    };

    const { error: gradeError } = await params.supabase
      .from("grades")
      .upsert(gradePayload, { onConflict: "user_id, assignment_id" });

    if (gradeError) {
      throw new Error(`Failed to upsert grade: ${gradeError.message}`);
    }
  }

  return { changed: !taskUnchanged };
}

async function syncFile(params: {
  supabase: SupabaseClient;
  userId: string;
  course: CourseRow;
  file: CanvasFile;
  existing: FileRow | undefined;
}) {
  const sourceUpdatedAt = params.file.updated_at ?? params.file.modified_at ?? null;

  if (params.existing?.processed && params.existing.source_updated_at === sourceUpdatedAt) {
    return { changed: false };
  }

  const canvasUrl = await getSafeFileDownloadUrl(params.file.id);
  const contentHash = createContentHash(
    `${params.file.id}:${sourceUpdatedAt ?? "no-updated-at"}:${canvasUrl ?? "no-url"}`,
  );

  if (
    params.existing &&
    params.existing.source_updated_at === sourceUpdatedAt &&
    params.existing.content_hash === contentHash &&
    params.existing.processed
  ) {
    return { changed: false };
  }

  const { error } = await params.supabase.from("canvas_files").upsert(
    {
      course_id: params.course.id,
      user_id: params.userId,
      canvas_file_id: String(params.file.id),
      filename: sanitizeSyncText(params.file.display_name || params.file.filename),
      canvas_url: canvasUrl,
      processed: true,
      uploaded_at: params.file.updated_at ?? params.file.created_at ?? null,
      source_updated_at: sourceUpdatedAt,
      content_hash: contentHash,
    },
    { onConflict: "user_id, canvas_file_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert file: ${error.message}`);
  }

  return { changed: true };
}

function resolveContentRef(item: CanvasModuleItem): string | null {
  if (item.content_id != null) return String(item.content_id);
  if (item.page_url) return item.page_url;
  return null;
}

async function syncCourseModules(params: {
  supabase: SupabaseClient;
  userId: string;
  course: CourseRow;
  send: SyncSender;
  counts: SyncCounts;
}) {
  const moduleCode = params.course.code ?? "MOD";

  let canvasModules: CanvasModule[] = [];
  try {
    canvasModules = await getModules(params.course.canvas_course_id);
  } catch (error) {
    console.error(`Failed to fetch course modules for ${moduleCode}:`, error);
    params.send({
      status: "progress",
      stage: "module",
      moduleCode,
      message: `Canvas modules fetch failed for ${moduleCode}; continuing.`,
      counts: params.counts,
    });
    return;
  }

  // Upsert each module and collect the DB ids in order.
  for (const canvasModule of canvasModules) {
    const { data: moduleData, error: moduleError } = await params.supabase
      .from("course_modules")
      .upsert(
        {
          user_id: params.userId,
          course_id: params.course.id,
          canvas_module_id: String(canvasModule.id),
          name: canvasModule.name,
          position: canvasModule.position,
          unlock_at: canvasModule.unlock_at ?? null,
          state: canvasModule.state ?? null,
          items_count: canvasModule.items_count ?? null,
        },
        { onConflict: "course_id, canvas_module_id" },
      )
      .select("id")
      .single<{ id: string }>();

    if (moduleError || !moduleData) {
      console.error(`Failed to upsert course module ${canvasModule.id} in ${moduleCode}:`, moduleError);
      continue;
    }

    // Decide whether to trust the inline items or fetch via getModuleItems.
    let items = canvasModule.items ?? [];
    const expected = canvasModule.items_count ?? items.length;
    if (items.length < expected) {
      try {
        items = await getModuleItems(params.course.canvas_course_id, canvasModule.id);
      } catch (error) {
        console.error(`Failed to fetch items for module ${canvasModule.id} in ${moduleCode}:`, error);
        continue;
      }
    }

    if (items.length === 0) continue;

    const itemRows = items.map((item) => ({
      user_id: params.userId,
      course_module_id: moduleData.id,
      canvas_item_id: String(item.id),
      title: item.title,
      item_type: item.type,
      position: item.position,
      indent: item.indent,
      content_ref: resolveContentRef(item),
      external_url: item.external_url ?? null,
    }));

    const { error: itemsError } = await params.supabase
      .from("course_module_items")
      .upsert(itemRows, { onConflict: "course_module_id, canvas_item_id" });

    if (itemsError) {
      console.error(`Failed to upsert module items for ${canvasModule.id} in ${moduleCode}:`, itemsError);
    }
  }
}

type PageRow = {
  id: string;
  page_url: string | null;
  updated_at: string | null;
};

async function syncPages(params: {
  supabase: SupabaseClient;
  userId: string;
  course: CourseRow;
  send: SyncSender;
  counts: SyncCounts;
}) {
  const moduleCode = params.course.code ?? "MOD";

  let canvasPages: CanvasPage[] = [];
  try {
    canvasPages = await getPages(params.course.canvas_course_id);
  } catch (error) {
    console.error(`Failed to fetch pages for ${moduleCode}:`, error);
    params.send({
      status: "progress",
      stage: "file",
      moduleCode,
      message: `Canvas pages fetch failed for ${moduleCode}; continuing.`,
      counts: params.counts,
    });
    return;
  }

  // Load existing cached pages for change detection.
  const { data: existingData, error: existingError } = await params.supabase
    .from("canvas_pages")
    .select("id, page_url, updated_at")
    .eq("course_id", params.course.id);

  if (existingError) {
    throw new Error(`Failed to load existing pages for ${moduleCode}: ${existingError.message}`);
  }

  const existingByUrl = new Map(((existingData ?? []) as PageRow[]).map((row) => [String(row.page_url), row]));

  // Step 1: upsert metadata for every Canvas page in one shot.
  const metadataRows = canvasPages.map((page) => ({
    user_id: params.userId,
    course_id: params.course.id,
    page_url: page.url,
    title: page.title,
    updated_at: page.updated_at ?? null,
    published: page.published ?? true,
    front_page: page.front_page ?? false,
  }));

  if (metadataRows.length > 0) {
    const { error: metaError } = await params.supabase
      .from("canvas_pages")
      .upsert(metadataRows, { onConflict: "course_id, page_url" });

    if (metaError) {
      throw new Error(`Failed to upsert page metadata: ${metaError.message}`);
    }
  }

  // Step 2: for each page whose Canvas updated_at is newer than the cached copy,
  // fetch the body and update that row. Bounded concurrency cap of 5.
  const stalePages = canvasPages.filter((page) => {
    const existing = existingByUrl.get(page.url);
    if (!existing) return true;
    if (!existing.updated_at) return true;
    if (!page.updated_at) return false;
    return new Date(page.updated_at).getTime() > new Date(existing.updated_at).getTime();
  });

  const CONCURRENCY = 5;
  let inFlight = 0;
  let index = 0;
  await new Promise<void>((resolve, reject) => {
    const next = () => {
      if (index >= stalePages.length && inFlight === 0) {
        resolve();
        return;
      }
      while (inFlight < CONCURRENCY && index < stalePages.length) {
        const page = stalePages[index];
        index += 1;
        inFlight += 1;
        (async () => {
          try {
            const full = await getPage(params.course.canvas_course_id, page.url);
            if (full) {
              const { error } = await params.supabase
                .from("canvas_pages")
                .update({ body_html: full.body ?? null })
                .eq("course_id", params.course.id)
                .eq("page_url", page.url);
              if (error) throw error;
              params.send({
                status: "progress",
                stage: "file",
                moduleCode,
                message: `Updated page: ${page.title}`,
                counts: params.counts,
              });
            }
          } catch (error) {
            console.error(`Failed to sync page ${page.url} in ${moduleCode}:`, error);
            params.send({
              status: "progress",
              stage: "file",
              moduleCode,
              message: `Skipped page "${page.title}" after a sync error.`,
              counts: params.counts,
            });
          } finally {
            inFlight -= 1;
            next();
          }
        })().catch(reject);
      }
    };
    next();
  });
}

async function processCourseSync(params: {
  supabase: SupabaseClient;
  userId: string;
  course: CourseRow;
  syncFiles: boolean;
  send: SyncSender;
  counts: SyncCounts;
}) {
  const moduleCode = params.course.code ?? "MOD";

  params.send({
    status: "progress",
    stage: "module",
    moduleCode,
    message: `Syncing ${moduleCode}...`,
    counts: params.counts,
  });

  const [existing, announcementsResult, assignmentsResult, filesResult] = await Promise.all([
    loadExistingState(params.supabase, params.course.id),
    getAnnouncements(params.course.canvas_course_id).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    ),
    getAssignmentsWithSubmissions(params.course.canvas_course_id).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    ),
    (params.syncFiles ? getFiles(params.course.canvas_course_id) : Promise.resolve([])).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    ),
  ]);

  const announcements = announcementsResult.ok ? announcementsResult.value : [];
  const assignments = assignmentsResult.ok ? assignmentsResult.value : [];
  const files = filesResult.ok ? filesResult.value : [];

  if (!announcementsResult.ok) {
    console.error(`Failed to fetch announcements for ${moduleCode}:`, announcementsResult.error);
    params.send({
      status: "progress",
      stage: "announcement",
      moduleCode,
      message: `Canvas announcements fetch failed for ${moduleCode}; continuing.`,
      counts: params.counts,
    });
  }

  if (!assignmentsResult.ok) {
    console.error(`Failed to fetch assignments for ${moduleCode}:`, assignmentsResult.error);
    params.send({
      status: "progress",
      stage: "task",
      moduleCode,
      message: `Canvas assignments fetch failed for ${moduleCode}; continuing.`,
      counts: params.counts,
    });
  }

  if (!filesResult.ok) {
    console.error(`Failed to fetch files for ${moduleCode}:`, filesResult.error);
    params.send({
      status: "progress",
      stage: "file",
      moduleCode,
      message: `Canvas files fetch failed for ${moduleCode}; continuing.`,
      counts: params.counts,
    });
  }

  for (const announcement of announcements) {
    try {
      const result = await syncAnnouncement({
        supabase: params.supabase,
        userId: params.userId,
        course: params.course,
        announcement,
        existing: existing.announcements.get(String(announcement.id)),
      });

      if (result.changed) {
        params.counts.announcements += 1;
        params.send({
          status: "progress",
          stage: "announcement",
          moduleCode,
          message: `Updated announcement: ${announcement.title}`,
          counts: params.counts,
        });
      }
    } catch (error) {
      console.error(`Failed to sync announcement ${announcement.id} in ${moduleCode}:`, error);
      params.send({
        status: "progress",
        stage: "announcement",
        moduleCode,
        message: `Skipped announcement "${announcement.title}" after a sync error.`,
        counts: params.counts,
      });
    }
  }

  for (const assignment of assignments) {
    try {
      const result = await syncAssignment({
        supabase: params.supabase,
        userId: params.userId,
        course: params.course,
        assignment,
        existing: existing.tasks.get(String(assignment.id)),
      });

      if (result.changed) {
        params.counts.tasks += 1;
        params.send({
          status: "progress",
          stage: "task",
          moduleCode,
          message: `Updated task: ${assignment.name}`,
          counts: params.counts,
        });
      }
    } catch (error) {
      console.error(`Failed to sync assignment ${assignment.id} in ${moduleCode}:`, error);
      params.send({
        status: "progress",
        stage: "task",
        moduleCode,
        message: `Skipped task "${assignment.name}" after a sync error.`,
        counts: params.counts,
      });
    }
  }

  if (params.syncFiles) {
    for (const file of files) {
      try {
        const result = await syncFile({
          supabase: params.supabase,
          userId: params.userId,
          course: params.course,
          file,
          existing: existing.files.get(String(file.id)),
        });

        if (result.changed) {
          params.counts.files += 1;
          params.send({
            status: "progress",
            stage: "file",
            moduleCode,
            message: `Updated file: ${file.display_name}`,
            counts: params.counts,
          });
        }
      } catch (error) {
        console.error(`Failed to sync file ${file.id} in ${moduleCode}:`, error);
        params.send({
          status: "progress",
          stage: "file",
          moduleCode,
          message: `Skipped file "${file.display_name}" after a sync error.`,
          counts: params.counts,
        });
      }
    }
  }

  await syncPages({
    supabase: params.supabase,
    userId: params.userId,
    course: params.course,
    send: params.send,
    counts: params.counts,
  });

  await syncCourseModules({
    supabase: params.supabase,
    userId: params.userId,
    course: params.course,
    send: params.send,
    counts: params.counts,
  });

  params.counts.modules += 1;
  await params.supabase
    .from("courses")
    .update({ last_canvas_sync: new Date().toISOString(), sync_enabled: true })
    .eq("id", params.course.id)
    .eq("user_id", params.userId);
}

export async function runDiscoverySync(send: SyncSender) {
  const user = await ensureDemoUser();
  const courses = await getCourses();
  const upsertedCourses: CourseRow[] = [];

  send({
    status: "started",
    stage: "discovery",
    message: "Fetching modules from Canvas...",
  });

  for (const course of courses) {
    const courseRow = await upsertCourse(user.id, course);
    upsertedCourses.push(courseRow);
    void fetchNUSModsModule(courseRow.code ?? "");
  }

  send({
    status: "complete",
    stage: "discovery",
    message: `Discovery complete. Found ${upsertedCourses.length} modules.`,
    counts: { modules: upsertedCourses.length },
  });
}

export async function runSelectedModuleSync(config: SyncConfig, send: SyncSender) {
  if (config.selectedModuleIds.length === 0) {
    throw new Error("Select at least one module to sync.");
  }

  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const counts = createCounts();
  const { data, error } = await supabase
    .from("courses")
    .select("id, canvas_course_id, code, title, sync_enabled")
    .eq("user_id", user.id)
    .in("id", config.selectedModuleIds)
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`Failed to load selected modules: ${error.message}`);
  }

  const courses = ((data ?? []) as CourseRow[]).filter((courseRow) => Boolean(courseRow.canvas_course_id));

  if (courses.length === 0) {
    throw new Error("No matching modules found for this sync.");
  }

  send({
    status: "started",
    stage: "module",
    message: `Starting sync for ${courses.length} module${courses.length === 1 ? "" : "s"}...`,
    counts,
  });

  for (const courseRow of courses) {
    await processCourseSync({
      supabase,
      userId: user.id,
      course: courseRow,
      syncFiles: config.syncFiles,
      send,
      counts,
    });
  }

  await supabase.from("users").update({ last_synced_at: new Date().toISOString() }).eq("id", user.id);

  send({
    status: "complete",
    stage: "finalizing",
    message:
      counts.announcements || counts.tasks || counts.files
        ? `Sync complete. Updated ${counts.modules} modules, ${counts.announcements} announcements, ${counts.tasks} tasks, and ${counts.files} files.`
        : "Sync complete. Everything was already up to date.",
    counts,
  });
}
