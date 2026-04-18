import "server-only";

import crypto from "node:crypto";

import pdf from "pdf-parse/lib/pdf-parse.js";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyFile,
  extractDeadlines,
  summarizeAnnouncement,
  summarizeFile,
  type FileClassification,
} from "@/lib/ai";
import {
  downloadCanvasFile,
  getAnnouncements,
  getAssignments,
  getCourses,
  getFileDownloadUrl,
  getFiles,
  type CanvasAnnouncement,
  type CanvasAssignment,
  type CanvasCourse,
  type CanvasFile,
} from "@/lib/canvas";
import { type SyncCounts, type SyncEvent } from "@/lib/contracts";
import { ensureDemoUser } from "@/lib/demo-user";
import { chunkText, generateEmbeddings } from "@/lib/embed";
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

type FileInsertRow = {
  id: string;
};

type AnnouncementInsertRow = {
  id: string;
};

type TaskInsertRow = {
  id: string;
};

type SyncConfig = {
  selectedModuleIds: string[];
  syncFiles: boolean;
};

type SourceLabelInput = {
  moduleCode: string;
  sourceType: "file" | "announcement" | "task";
  title: string;
  weekNumber?: number | null;
};

type QueueTask<T> = () => Promise<T>;

type FileExtractionResult = {
  text: string;
  canvasUrl: string | null;
  processed: boolean;
  reason?: string;
};

type DatabaseErrorLike = {
  code?: string;
  message?: string;
};

const LEGACY_OPTIONAL_COLUMNS = {
  announcements: ["content_hash", "source_updated_at"],
  tasks: ["description_hash"],
  canvas_files: ["ai_summary", "content_hash", "source_updated_at"],
  embeddings: ["source_label", "module_code"],
} as const;

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

export function buildSourceLabel({ moduleCode, sourceType, title, weekNumber }: SourceLabelInput) {
  const normalizedTitle = sanitizeSyncText(title) || "Untitled";
  const weekSuffix = weekNumber ? ` · Week ${weekNumber}` : "";
  return `${moduleCode} · ${sourceType}${weekSuffix} · ${normalizedTitle}`;
}

function getMissingColumnName(error: DatabaseErrorLike | null | undefined) {
  const message = error?.message ?? "";
  const postgresMatch = message.match(/column\s+(?:"?[\w]+"?\.)?"?([\w]+)"?\s+does not exist/i);
  if (postgresMatch) {
    return postgresMatch[1];
  }

  const schemaCacheMatch = message.match(/could not find the ['"]?([\w]+)['"]? column/i);
  return schemaCacheMatch ? schemaCacheMatch[1] : null;
}

function omitKey<T extends Record<string, unknown>>(payload: T, key: string) {
  const nextPayload = { ...payload };
  delete nextPayload[key];
  return nextPayload;
}

function createLimiter(maxConcurrent: number) {
  let activeCount = 0;
  const queue: Array<() => void> = [];

  const next = () => {
    activeCount -= 1;
    const job = queue.shift();
    if (job) {
      job();
    }
  };

  return async function limit<T>(task: QueueTask<T>): Promise<T> {
    if (activeCount >= maxConcurrent) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }

    activeCount += 1;

    try {
      return await task();
    } finally {
      next();
    }
  };
}

function createCounts(): SyncCounts {
  return {
    modules: 0,
    announcements: 0,
    tasks: 0,
    files: 0,
    embeddings: 0,
  };
}

function inferModuleCode(course: CanvasCourse): string {
  const candidates = [course.course_code, course.original_name, course.name].map((value) => sanitizeSyncText(value)).filter(Boolean);

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

async function readCanvasFile(file: CanvasFile): Promise<FileExtractionResult> {
  const contentType = sanitizeSyncText(file.content_type).toLowerCase();
  const filename = sanitizeSyncText(file.display_name || file.filename).toLowerCase();

  if (file.locked || file.hidden || file.locked_for_user) {
    return {
      text: "",
      canvasUrl: null,
      processed: true,
      reason: "Canvas marked this file as unavailable to the current user.",
    };
  }

  if (!(contentType.includes("pdf") || filename.endsWith(".pdf") || contentType.startsWith("text/") || filename.endsWith(".txt") || filename.endsWith(".md"))) {
    const downloadUrl = await getSafeFileDownloadUrl(file.id);
    return {
      text: "",
      canvasUrl: downloadUrl,
      processed: true,
      reason: "Binary file stored without text extraction.",
    };
  }

  try {
    const download = await downloadCanvasFile(file.id);

    if (!download) {
      return {
        text: "",
        canvasUrl: null,
        processed: false,
        reason: "Canvas did not return a temporary download URL for this file.",
      };
    }

    if (contentType.includes("pdf") || filename.endsWith(".pdf")) {
      const buffer = Buffer.from(await download.response.arrayBuffer());
      const parsed = await pdf(buffer);
      return {
        text: sanitizeSyncText(parsed.text),
        canvasUrl: download.downloadUrl,
        processed: true,
      };
    }

    return {
      text: sanitizeSyncText(await download.response.text()),
      canvasUrl: download.downloadUrl,
      processed: true,
    };
  } catch (error) {
    return {
      text: "",
      canvasUrl: null,
      processed: false,
      reason: error instanceof Error ? error.message : "File extraction failed.",
    };
  }
}

async function getSafeFileDownloadUrl(fileId: number | string) {
  try {
    return await getFileDownloadUrl(fileId);
  } catch {
    return null;
  }
}

async function replaceEmbeddings(params: {
  supabase: SupabaseClient;
  userId: string;
  moduleId: string;
  moduleCode: string;
  sourceType: "file" | "announcement" | "task";
  sourceId: string;
  sourceLabel: string;
  chunks: string[];
}) {
  await params.supabase
    .from("embeddings")
    .delete()
    .eq("user_id", params.userId)
    .eq("source_type", params.sourceType)
    .eq("source_id", params.sourceId);

  if (params.chunks.length === 0) {
    return 0;
  }

  const embeddings = await generateEmbeddings(params.chunks);
  let rows = params.chunks.map((chunk, index) => ({
    user_id: params.userId,
    module_id: params.moduleId,
    module_code: params.moduleCode,
    source_type: params.sourceType,
    source_id: params.sourceId,
    source_label: params.sourceLabel,
    chunk_index: index,
    chunk_text: chunk,
    embedding: embeddings[index],
  }));

  while (true) {
    const { error } = await params.supabase.from("embeddings").insert(rows);

    if (!error) {
      return rows.length;
    }

    const missingColumn = getMissingColumnName(error);
    const fallbackColumns = [
      ...(missingColumn ? [missingColumn] : []),
      ...LEGACY_OPTIONAL_COLUMNS.embeddings,
    ].filter((column, index, allColumns) => allColumns.indexOf(column) === index);

    if ((missingColumn || error.code === "PGRST204") && rows[0]) {
      const removableColumns = fallbackColumns.filter((column) => column in rows[0]);
      if (removableColumns.length > 0) {
        rows = rows.map((row) => removableColumns.reduce((nextRow, column) => omitKey(nextRow, column), row));
        continue;
      }
    }

    if (missingColumn && rows[0] && missingColumn in rows[0]) {
      rows = rows.map((row) => omitKey(row, missingColumn));
      continue;
    }

    throw new Error(`Failed to insert embeddings: ${error.message}`);
  }
}

function buildEmbeddingChunks(params: {
  moduleCode: string;
  sourceType: "file" | "announcement" | "task";
  title: string;
  bodyText: string;
  weekNumber?: number | null;
}) {
  const sourceLabel = buildSourceLabel(params);
  return chunkText(params.bodyText).map((chunk) => [sourceLabel, chunk].join("\n"));
}

async function loadExistingState(supabase: SupabaseClient, moduleId: string) {
  let announcementRows: AnnouncementRow[] = [];
  let taskRows: TaskRow[] = [];
  let fileRows: FileRow[] = [];

  {
    const full = await supabase
      .from("announcements")
      .select("id, canvas_announcement_id, source_updated_at, content_hash")
      .eq("module_id", moduleId);

    if (full.error && getMissingColumnName(full.error)) {
      const fallback = await supabase.from("announcements").select("id, canvas_announcement_id").eq("module_id", moduleId);
      if (fallback.error) {
        throw new Error(fallback.error.message);
      }
      announcementRows = ((fallback.data ?? []) as AnnouncementRow[]).map((row) => ({
        ...row,
        source_updated_at: null,
        content_hash: null,
      }));
    } else if (full.error) {
      throw new Error(full.error.message);
    } else {
      announcementRows = (full.data ?? []) as AnnouncementRow[];
    }
  }

  {
    const full = await supabase
      .from("tasks")
      .select("id, source_ref_id, due_at, description_hash")
      .eq("module_id", moduleId)
      .eq("source", "canvas");

    if (full.error && getMissingColumnName(full.error)) {
      const fallback = await supabase
        .from("tasks")
        .select("id, source_ref_id, due_at")
        .eq("module_id", moduleId)
        .eq("source", "canvas");
      if (fallback.error) {
        throw new Error(fallback.error.message);
      }
      taskRows = ((fallback.data ?? []) as TaskRow[]).map((row) => ({
        ...row,
        description_hash: null,
      }));
    } else if (full.error) {
      throw new Error(full.error.message);
    } else {
      taskRows = (full.data ?? []) as TaskRow[];
    }
  }

  {
    const full = await supabase
      .from("canvas_files")
      .select("id, canvas_file_id, source_updated_at, content_hash, processed")
      .eq("module_id", moduleId);

    if (full.error && getMissingColumnName(full.error)) {
      const fallback = await supabase.from("canvas_files").select("id, canvas_file_id, processed").eq("module_id", moduleId);
      if (fallback.error) {
        throw new Error(fallback.error.message);
      }
      fileRows = ((fallback.data ?? []) as FileRow[]).map((row) => ({
        ...row,
        source_updated_at: null,
        content_hash: null,
      }));
    } else if (full.error) {
      throw new Error(full.error.message);
    } else {
      fileRows = (full.data ?? []) as FileRow[];
    }
  }

  return {
    announcements: new Map(announcementRows.map((row) => [String(row.canvas_announcement_id), row])),
    tasks: new Map(taskRows.map((row) => [String(row.source_ref_id), row])),
    files: new Map(fileRows.map((row) => [String(row.canvas_file_id), row])),
  };
}

async function upsertSingleRow<T extends Record<string, unknown>, TResult>(params: {
  supabase: SupabaseClient;
  table: "announcements" | "tasks" | "canvas_files";
  payload: T;
  onConflict: string;
  select: string;
}) {
  let payload = { ...params.payload };

  while (true) {
    const { data, error } = await params.supabase
      .from(params.table)
      .upsert(payload, { onConflict: params.onConflict })
      .select(params.select)
      .single<TResult>();

    if (!error && data) {
      return data;
    }

    const missingColumn = getMissingColumnName(error);
    const fallbackColumns = [
      ...(missingColumn ? [missingColumn] : []),
      ...LEGACY_OPTIONAL_COLUMNS[params.table],
    ].filter((column, index, allColumns) => allColumns.indexOf(column) === index);

    if (missingColumn || error?.code === "PGRST204") {
      const removableColumns = fallbackColumns.filter((column) => column in payload);
      if (removableColumns.length > 0) {
        payload = removableColumns.reduce((nextPayload, column) => omitKey(nextPayload, column), payload);
        continue;
      }
    }

    throw new Error(error?.message ?? `Failed to upsert row in ${params.table}.`);
  }
}

async function syncAnnouncement(params: {
  supabase: SupabaseClient;
  userId: string;
  module: ModuleRow;
  announcement: CanvasAnnouncement;
  existing: AnnouncementRow | undefined;
  aiLimit: ReturnType<typeof createLimiter>;
}) {
  const bodyText = sanitizeSyncText(stripHtml(params.announcement.message ?? ""));
  const contentHash = createContentHash(bodyText);
  const sourceUpdatedAt = params.announcement.updated_at ?? params.announcement.posted_at ?? null;

  if (
    params.existing &&
    params.existing.source_updated_at === sourceUpdatedAt &&
    params.existing.content_hash === contentHash
  ) {
    return { changed: false, embeddingsCreated: 0 };
  }

  const [deadlineResult, summary] = await Promise.all([
    params.aiLimit(() => extractDeadlines(bodyText)),
    params.aiLimit(() => summarizeAnnouncement(params.announcement.title, bodyText)),
  ]);

  const data = await upsertSingleRow<Record<string, unknown>, AnnouncementInsertRow>({
    supabase: params.supabase,
    table: "announcements",
    payload: {
      module_id: params.module.id,
      user_id: params.userId,
      canvas_announcement_id: String(params.announcement.id),
      title: sanitizeSyncText(params.announcement.title),
      body_raw: params.announcement.message ?? null,
      ai_summary: summary.summary,
      importance: summary.importance,
      detected_deadlines: deadlineResult.deadlines,
      posted_at: params.announcement.posted_at ?? null,
      source_updated_at: sourceUpdatedAt,
      content_hash: contentHash,
    },
    onConflict: "user_id, canvas_announcement_id",
    select: "id",
  });

  const sourceLabel = buildSourceLabel({
    moduleCode: params.module.code ?? "MOD",
    sourceType: "announcement",
    title: params.announcement.title,
  });
  const chunks = bodyText
    ? buildEmbeddingChunks({
        moduleCode: params.module.code ?? "MOD",
        sourceType: "announcement",
        title: params.announcement.title,
        bodyText,
      })
    : [];
  const embeddingsCreated = await replaceEmbeddings({
    supabase: params.supabase,
    userId: params.userId,
    moduleId: params.module.id,
    moduleCode: params.module.code ?? "MOD",
    sourceType: "announcement",
    sourceId: data.id,
    sourceLabel,
    chunks,
  });

  return { changed: true, embeddingsCreated };
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
    return { changed: false, embeddingsCreated: 0 };
  }

  const data = await upsertSingleRow<Record<string, unknown>, TaskInsertRow>({
    supabase: params.supabase,
    table: "tasks",
    payload: {
      module_id: params.module.id,
      user_id: params.userId,
      title: sanitizeSyncText(params.assignment.name) || "Untitled task",
      due_at: dueAt,
      source: "canvas",
      source_ref_id: String(params.assignment.id),
      completed: false,
      description_hash: descriptionHash,
    },
    onConflict: "user_id, source, source_ref_id",
    select: "id",
  });

  const sourceLabel = buildSourceLabel({
    moduleCode: params.module.code ?? "MOD",
    sourceType: "task",
    title: params.assignment.name,
  });
  const chunks = descriptionText
    ? buildEmbeddingChunks({
        moduleCode: params.module.code ?? "MOD",
        sourceType: "task",
        title: params.assignment.name,
        bodyText: descriptionText,
      })
    : [];
  const embeddingsCreated = await replaceEmbeddings({
    supabase: params.supabase,
    userId: params.userId,
    moduleId: params.module.id,
    moduleCode: params.module.code ?? "MOD",
    sourceType: "task",
    sourceId: data.id,
    sourceLabel,
    chunks,
  });

  return { changed: true, embeddingsCreated };
}

async function syncFile(params: {
  supabase: SupabaseClient;
  userId: string;
  module: ModuleRow;
  file: CanvasFile;
  existing: FileRow | undefined;
  fileLimit: ReturnType<typeof createLimiter>;
  aiLimit: ReturnType<typeof createLimiter>;
}) {
  const sourceUpdatedAt = params.file.updated_at ?? params.file.modified_at ?? null;

  if (params.existing?.processed && params.existing.source_updated_at === sourceUpdatedAt) {
    return { changed: false, embeddingsCreated: 0 };
  }

  const extraction = await params.fileLimit(() => readCanvasFile(params.file));
  const extractedText = extraction.text;
  const contentHash = createContentHash(
    extractedText || `${params.file.id}:${sourceUpdatedAt ?? "no-updated-at"}:${extraction.reason ?? "metadata-only"}`,
  );

  if (
    params.existing &&
    params.existing.source_updated_at === sourceUpdatedAt &&
    params.existing.content_hash === contentHash &&
    params.existing.processed
  ) {
    return { changed: false, embeddingsCreated: 0 };
  }

  const [classification, summary] = await Promise.all([
    params.aiLimit(() => classifyFile(params.file.display_name, extractedText)),
    params.aiLimit(() => summarizeFile(params.file.display_name, extractedText)),
  ]);

  return upsertFileRecord({
    supabase: params.supabase,
    userId: params.userId,
    module: params.module,
    file: params.file,
    extractedText,
    canvasUrl: extraction.canvasUrl,
    classification,
    summary: summary ?? (extraction.reason ? `- ${extraction.reason}` : null),
    contentHash,
    sourceUpdatedAt,
    processed: extraction.processed,
  });
}

async function upsertFileRecord(params: {
  supabase: SupabaseClient;
  userId: string;
  module: ModuleRow;
  file: CanvasFile;
  extractedText: string;
  canvasUrl: string | null;
  classification: FileClassification;
  summary: string | null;
  contentHash: string;
  sourceUpdatedAt: string | null;
  processed: boolean;
}) {
  const data = await upsertSingleRow<Record<string, unknown>, FileInsertRow>({
    supabase: params.supabase,
    table: "canvas_files",
    payload: {
      module_id: params.module.id,
      user_id: params.userId,
      canvas_file_id: String(params.file.id),
      filename: sanitizeSyncText(params.file.display_name || params.file.filename),
      file_type: params.classification.file_type,
      canvas_url: params.canvasUrl,
      extracted_text: params.extractedText || null,
      ai_summary: params.summary,
      processed: params.processed,
      week_number: params.classification.week_number,
      uploaded_at: params.file.updated_at ?? params.file.created_at ?? null,
      source_updated_at: params.sourceUpdatedAt,
      content_hash: params.contentHash,
    },
    onConflict: "user_id, canvas_file_id",
    select: "id",
  });

  const sourceLabel = buildSourceLabel({
    moduleCode: params.module.code ?? "MOD",
    sourceType: "file",
    title: params.file.display_name,
    weekNumber: params.classification.week_number,
  });
  const chunks = params.extractedText
    ? buildEmbeddingChunks({
        moduleCode: params.module.code ?? "MOD",
        sourceType: "file",
        title: params.file.display_name,
        bodyText: params.extractedText,
        weekNumber: params.classification.week_number,
      })
    : [];
  const embeddingsCreated = await replaceEmbeddings({
    supabase: params.supabase,
    userId: params.userId,
    moduleId: params.module.id,
    moduleCode: params.module.code ?? "MOD",
    sourceType: "file",
    sourceId: data.id,
    sourceLabel,
    chunks,
  });

  return { changed: true, embeddingsCreated };
}

async function processModuleSync(params: {
  supabase: SupabaseClient;
  userId: string;
  module: ModuleRow;
  syncFiles: boolean;
  send: SyncSender;
  counts: SyncCounts;
  aiLimit: ReturnType<typeof createLimiter>;
  fileLimit: ReturnType<typeof createLimiter>;
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
      message: `Canvas announcements fetch failed for ${moduleCode}; continuing with other resources.`,
      counts: params.counts,
    });
  }

  if (!assignmentsResult.ok) {
    console.error(`Failed to fetch assignments for ${moduleCode}:`, assignmentsResult.error);
    params.send({
      status: "progress",
      stage: "task",
      moduleCode,
      message: `Canvas assignments fetch failed for ${moduleCode}; continuing with other resources.`,
      counts: params.counts,
    });
  }

  if (!filesResult.ok) {
    console.error(`Failed to fetch files for ${moduleCode}:`, filesResult.error);
    params.send({
      status: "progress",
      stage: "file",
      moduleCode,
      message: `Canvas files fetch failed for ${moduleCode}; continuing with other resources.`,
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
        aiLimit: params.aiLimit,
      });

      if (result.changed) {
        params.counts.announcements += 1;
        params.counts.embeddings += result.embeddingsCreated;
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
        params.counts.embeddings += result.embeddingsCreated;
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
          fileLimit: params.fileLimit,
          aiLimit: params.aiLimit,
        });

        if (result.changed) {
          params.counts.files += 1;
          params.counts.embeddings += result.embeddingsCreated;
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
  const aiLimit = createLimiter(4);
  const fileLimit = createLimiter(2);
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
      aiLimit,
      fileLimit,
    });
  }

  await supabase.from("users").update({ last_synced_at: new Date().toISOString() }).eq("id", user.id);

  send({
    status: "complete",
    stage: "finalizing",
    message:
      counts.announcements || counts.tasks || counts.files
        ? `Sync complete. Updated ${counts.modules} modules, ${counts.announcements} announcements, ${counts.tasks} tasks, ${counts.files} files, and ${counts.embeddings} embeddings.`
        : "Sync complete. Everything was already up to date.",
    counts,
  });
}
