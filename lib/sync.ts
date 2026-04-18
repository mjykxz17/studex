import "server-only";

import crypto from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getAnnouncements,
  getAssignments,
  getCourses,
  getFiles,
  getFileDownloadUrl,
  type CanvasAnnouncement,
  type CanvasAssignment,
  type CanvasCourse,
  type CanvasFile,
} from "@/lib/canvas";
import { type SyncCounts, type SyncEvent } from "@/lib/contracts";
import { ensureDemoUser } from "@/lib/demo-user";
import { fetchNUSModsModule } from "@/lib/nusmods";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type SyncSender = (event: SyncEvent) => void;

type ModuleRow = {
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

async function upsertModule(userId: string, course: CanvasCourse) {
  const supabase = getSupabaseAdminClient();
  const code = inferModuleCode(course);
  const { data, error } = await supabase
    .from("modules")
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
    .single<ModuleRow>();

  if (error || !data) {
    throw new Error(`Failed to upsert module ${code}: ${error?.message ?? "Unknown error"}`);
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

async function loadExistingState(supabase: SupabaseClient, moduleId: string) {
  const [announcementsResult, tasksResult, filesResult] = await Promise.all([
    supabase
      .from("announcements")
      .select("id, canvas_announcement_id, source_updated_at, content_hash")
      .eq("module_id", moduleId),
    supabase
      .from("tasks")
      .select("id, source_ref_id, due_at, description_hash")
      .eq("module_id", moduleId)
      .eq("source", "canvas"),
    supabase
      .from("canvas_files")
      .select("id, canvas_file_id, source_updated_at, content_hash, processed")
      .eq("module_id", moduleId),
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
  module: ModuleRow;
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
      module_id: params.module.id,
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
  module: ModuleRow;
  assignment: CanvasAssignment;
  existing: TaskRow | undefined;
}) {
  const descriptionText = sanitizeSyncText(stripHtml(params.assignment.description ?? ""));
  const descriptionHash = createContentHash(descriptionText);
  const dueAt = params.assignment.due_at ?? null;

  if (params.existing && params.existing.due_at === dueAt && params.existing.description_hash === descriptionHash) {
    return { changed: false };
  }

  const { error } = await params.supabase.from("tasks").upsert(
    {
      module_id: params.module.id,
      user_id: params.userId,
      title: sanitizeSyncText(params.assignment.name) || "Untitled task",
      due_at: dueAt,
      source: "canvas",
      source_ref_id: String(params.assignment.id),
      completed: false,
      description_hash: descriptionHash,
    },
    { onConflict: "user_id, source, source_ref_id" },
  );

  if (error) {
    throw new Error(`Failed to upsert task: ${error.message}`);
  }

  return { changed: true };
}

async function syncFile(params: {
  supabase: SupabaseClient;
  userId: string;
  module: ModuleRow;
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
      module_id: params.module.id,
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

async function processModuleSync(params: {
  supabase: SupabaseClient;
  userId: string;
  module: ModuleRow;
  syncFiles: boolean;
  send: SyncSender;
  counts: SyncCounts;
}) {
  const moduleCode = params.module.code ?? "MOD";

  params.send({
    status: "progress",
    stage: "module",
    moduleCode,
    message: `Syncing ${moduleCode}...`,
    counts: params.counts,
  });

  const [existing, announcementsResult, assignmentsResult, filesResult] = await Promise.all([
    loadExistingState(params.supabase, params.module.id),
    getAnnouncements(params.module.canvas_course_id).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    ),
    getAssignments(params.module.canvas_course_id).then(
      (value) => ({ ok: true as const, value }),
      (error) => ({ ok: false as const, error }),
    ),
    (params.syncFiles ? getFiles(params.module.canvas_course_id) : Promise.resolve([])).then(
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
        module: params.module,
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
        module: params.module,
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
          module: params.module,
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

  params.counts.modules += 1;
  await params.supabase
    .from("modules")
    .update({ last_canvas_sync: new Date().toISOString() })
    .eq("id", params.module.id)
    .eq("user_id", params.userId);
}

export async function runDiscoverySync(send: SyncSender) {
  const user = await ensureDemoUser();
  const courses = await getCourses();
  const upsertedModules: ModuleRow[] = [];

  send({
    status: "started",
    stage: "discovery",
    message: "Fetching modules from Canvas...",
  });

  for (const course of courses) {
    const moduleRow = await upsertModule(user.id, course);
    upsertedModules.push(moduleRow);
    void fetchNUSModsModule(moduleRow.code ?? "");
  }

  send({
    status: "complete",
    stage: "discovery",
    message: `Discovery complete. Found ${upsertedModules.length} modules.`,
    counts: { modules: upsertedModules.length },
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
    .from("modules")
    .select("id, canvas_course_id, code, title, sync_enabled")
    .eq("user_id", user.id)
    .in("id", config.selectedModuleIds)
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`Failed to load selected modules: ${error.message}`);
  }

  const modules = ((data ?? []) as ModuleRow[]).filter((moduleRow) => Boolean(moduleRow.canvas_course_id));

  if (modules.length === 0) {
    throw new Error("No matching modules found for this sync.");
  }

  send({
    status: "started",
    stage: "module",
    message: `Starting sync for ${modules.length} module${modules.length === 1 ? "" : "s"}...`,
    counts,
  });

  for (const moduleRow of modules) {
    await processModuleSync({
      supabase,
      userId: user.id,
      module: moduleRow,
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
