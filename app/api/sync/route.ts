import { PDFParse } from "pdf-parse";

import { callAI, classifyFile, extractDeadlines, getDefaultAIConfig } from "@/lib/ai";
import {
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
import { chunkText, generateEmbedding } from "@/lib/embed";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_PHASE1_USER_EMAIL = "phase1-local@studex.local";
const DEFAULT_SUMMARY_MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";
const SYNC_TYPE = "full";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type UserRow = {
  id: string;
  email: string | null;
  last_synced_at: string | null;
};

type ModuleRow = {
  id: string;
  canvas_course_id: string | null;
  code: string | null;
  title: string | null;
};

type CanvasFileRow = {
  id: string;
  canvas_file_id: string | null;
};

type AnnouncementRow = {
  id: string;
  canvas_announcement_id: string | null;
};

type TaskRow = {
  id: string;
  source_ref_id: string | null;
};

type SyncCounters = {
  modulesUpserted: number;
  newFiles: number;
  processedFiles: number;
  newAnnouncements: number;
  processedAnnouncements: number;
  newTasks: number;
  processedTaskDescriptions: number;
  embeddingsCreated: number;
};

function createEmptyCounters(): SyncCounters {
  return {
    modulesUpserted: 0,
    newFiles: 0,
    processedFiles: 0,
    newAnnouncements: 0,
    processedAnnouncements: 0,
    newTasks: 0,
    processedTaskDescriptions: 0,
    embeddingsCreated: 0,
  };
}

function sanitizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, "/")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

async function summarizeAnnouncement(title: string, bodyText: string): Promise<{ summary: string | null; importance: "high" | "normal" | "low" }> {
  const text = sanitizeText(bodyText);

  if (!text) {
    return { summary: null, importance: "low" };
  }

  const prompt = [
    "Summarize this Canvas announcement for a student.",
    'Return ONLY valid JSON with no markdown in this exact shape: {"summary":"string","importance":"high|normal|low"}',
    "The summary must be at most 2 concise sentences.",
    "Mark importance as high only for urgent or action-required updates, low for FYI/minor notes, otherwise normal.",
    `Title: ${title}`,
    "Body:",
    truncate(text, 5000),
  ].join("\n\n");

  try {
    const raw = await callAI(prompt, DEFAULT_SUMMARY_MODEL);
    const parsed = JSON.parse(raw) as { summary?: unknown; importance?: unknown };
    const importance = parsed.importance;

    return {
      summary: typeof parsed.summary === "string" && parsed.summary.trim() ? parsed.summary.trim() : null,
      importance: importance === "high" || importance === "normal" || importance === "low" ? importance : "normal",
    };
  } catch {
    return { summary: truncate(text, 280) || null, importance: "normal" };
  }
}

function inferModuleCode(course: CanvasCourse): string {
  const candidates = [course.course_code, course.original_name, course.name]
    .map((value) => sanitizeText(value))
    .filter(Boolean);

  for (const candidate of candidates) {
    const match = candidate.match(/[A-Z]{2,4}\d{4}[A-Z]?/);
    if (match) {
      return match[0];
    }
  }

  return sanitizeText(course.course_code) || sanitizeText(course.name) || `course-${course.id}`;
}

async function ensurePhase1User(): Promise<UserRow> {
  const supabase = getSupabaseAdminClient();
  const { data: existingUsers, error: existingUsersError } = await supabase
    .from("users")
    .select("id, email, last_synced_at")
    .order("created_at", { ascending: true })
    .limit(1);

  if (existingUsersError) {
    throw new Error(`Failed to load users: ${existingUsersError.message}`);
  }

  const existingUser = existingUsers?.[0] as UserRow | undefined;
  if (existingUser) {
    return existingUser;
  }

  const { data: insertedUser, error: insertUserError } = await supabase
    .from("users")
    .insert({
      email: process.env.PHASE1_USER_EMAIL?.trim() || DEFAULT_PHASE1_USER_EMAIL,
      ai_provider: getDefaultAIConfig().provider,
      ai_model: getDefaultAIConfig().model,
    })
    .select("id, email, last_synced_at")
    .single();

  if (insertUserError || !insertedUser) {
    throw new Error(`Failed to create Phase 1 user row: ${insertUserError?.message ?? "Unknown error"}`);
  }

  return insertedUser as UserRow;
}

async function upsertModule(userId: string, course: CanvasCourse): Promise<ModuleRow> {
  const supabase = getSupabaseAdminClient();
  const payload = {
    user_id: userId,
    canvas_course_id: String(course.id),
    code: inferModuleCode(course),
    title: sanitizeText(course.name) || inferModuleCode(course),
    last_canvas_sync: new Date().toISOString(),
  };

  const { data: existingModule, error: existingModuleError } = await supabase
    .from("modules")
    .select("id, canvas_course_id, code, title")
    .eq("user_id", userId)
    .eq("canvas_course_id", String(course.id))
    .maybeSingle();

  if (existingModuleError) {
    throw new Error(`Failed to load module for course ${course.id}: ${existingModuleError.message}`);
  }

  if (existingModule) {
    const { data: updatedModule, error: updateModuleError } = await supabase
      .from("modules")
      .update(payload)
      .eq("id", existingModule.id)
      .select("id, canvas_course_id, code, title")
      .single();

    if (updateModuleError || !updatedModule) {
      throw new Error(`Failed to update module for course ${course.id}: ${updateModuleError?.message ?? "Unknown error"}`);
    }

    return updatedModule as ModuleRow;
  }

  const { data: insertedModule, error: insertModuleError } = await supabase
    .from("modules")
    .insert(payload)
    .select("id, canvas_course_id, code, title")
    .single();

  if (insertModuleError || !insertedModule) {
    throw new Error(`Failed to insert module for course ${course.id}: ${insertModuleError?.message ?? "Unknown error"}`);
  }

  return insertedModule as ModuleRow;
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Failed to download Canvas file (${response.status} ${response.statusText}) from ${url}`);
  }

  return response.arrayBuffer();
}

async function extractCanvasFileText(file: CanvasFile): Promise<{ text: string; canvasUrl: string | null }> {
  const downloadUrl = await getFileDownloadUrl(file.id);

  if (!downloadUrl) {
    return { text: "", canvasUrl: null };
  }

  const contentType = sanitizeText(file.content_type).toLowerCase();
  const filename = sanitizeText(file.display_name || file.filename).toLowerCase();

  if (contentType.includes("pdf") || filename.endsWith(".pdf")) {
    const buffer = Buffer.from(await fetchArrayBuffer(downloadUrl));
    const parser = new PDFParse({ data: buffer });

    try {
      const parsed = await parser.getText();
      return { text: sanitizeText(parsed.text), canvasUrl: downloadUrl };
    } finally {
      await parser.destroy();
    }
  }

  if (
    contentType.startsWith("text/") ||
    contentType.includes("json") ||
    contentType.includes("xml") ||
    filename.endsWith(".txt") ||
    filename.endsWith(".md") ||
    filename.endsWith(".csv")
  ) {
    const response = await fetch(downloadUrl, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Failed to read text file (${response.status} ${response.statusText}) for ${file.display_name}`);
    }

    return { text: sanitizeText(await response.text()), canvasUrl: downloadUrl };
  }

  return { text: "", canvasUrl: downloadUrl };
}

async function insertEmbeddings(params: {
  userId: string;
  moduleId: string;
  sourceType: "file" | "announcement" | "task";
  sourceId: string;
  chunks: string[];
}): Promise<number> {
  const supabase = getSupabaseAdminClient();

  if (params.chunks.length === 0) {
    return 0;
  }

  const rows = [] as Array<{
    user_id: string;
    module_id: string;
    source_type: "file" | "announcement" | "task";
    source_id: string;
    chunk_index: number;
    chunk_text: string;
    embedding: number[];
  }>;

  for (const [index, chunk] of params.chunks.entries()) {
    const embedding = await generateEmbedding(chunk);
    rows.push({
      user_id: params.userId,
      module_id: params.moduleId,
      source_type: params.sourceType,
      source_id: params.sourceId,
      chunk_index: index,
      chunk_text: chunk,
      embedding,
    });
  }

  const { error } = await supabase.from("embeddings").insert(rows);

  if (error) {
    throw new Error(`Failed to insert embeddings for ${params.sourceType} ${params.sourceId}: ${error.message}`);
  }

  return rows.length;
}

function withChunkMetadata(moduleCode: string, sourceLabel: string, weekNumber: number | null, text: string): string[] {
  const prefix = `[Module: ${moduleCode} | Week: ${weekNumber ?? "unknown"} | Source: ${sourceLabel}]`;
  return chunkText(text).map((chunk) => `${prefix}\n${chunk}`);
}

function normalizeDeadlines(deadlines: Awaited<ReturnType<typeof extractDeadlines>>["deadlines"]): JsonValue {
  return deadlines.map((deadline) => ({
    title: deadline.title,
    due_date: deadline.due_date,
    weight: deadline.weight,
  }));
}

async function processNewFile(params: {
  userId: string;
  module: ModuleRow;
  file: CanvasFile;
  counters: SyncCounters;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { text, canvasUrl } = await extractCanvasFileText(params.file);
  const classification = await classifyFile(params.file.display_name, text);

  const { data: insertedFile, error: insertFileError } = await supabase
    .from("canvas_files")
    .insert({
      module_id: params.module.id,
      user_id: params.userId,
      canvas_file_id: String(params.file.id),
      filename: params.file.display_name,
      file_type: classification.file_type,
      canvas_url: canvasUrl,
      extracted_text: text || null,
      processed: false,
      week_number: classification.week_number,
      uploaded_at: params.file.updated_at ?? params.file.created_at ?? null,
    })
    .select("id, canvas_file_id")
    .single();

  if (insertFileError || !insertedFile) {
    throw new Error(`Failed to insert Canvas file ${params.file.id}: ${insertFileError?.message ?? "Unknown error"}`);
  }

  params.counters.newFiles += 1;

  const chunks = text
    ? withChunkMetadata(params.module.code ?? "Unknown", params.file.display_name, classification.week_number, text)
    : [];

  const embeddingsCreated = await insertEmbeddings({
    userId: params.userId,
    moduleId: params.module.id,
    sourceType: "file",
    sourceId: (insertedFile as CanvasFileRow).id,
    chunks,
  });

  params.counters.embeddingsCreated += embeddingsCreated;

  const { error: markProcessedError } = await supabase
    .from("canvas_files")
    .update({ processed: true })
    .eq("id", (insertedFile as CanvasFileRow).id);

  if (markProcessedError) {
    throw new Error(`Failed to mark Canvas file ${params.file.id} as processed: ${markProcessedError.message}`);
  }

  params.counters.processedFiles += 1;
}

async function processNewAnnouncement(params: {
  userId: string;
  module: ModuleRow;
  announcement: CanvasAnnouncement;
  counters: SyncCounters;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const bodyText = stripHtml(params.announcement.message ?? "");
  const deadlines = await extractDeadlines(bodyText);
  const summary = await summarizeAnnouncement(params.announcement.title, bodyText);

  const { data: insertedAnnouncement, error: insertAnnouncementError } = await supabase
    .from("announcements")
    .insert({
      module_id: params.module.id,
      user_id: params.userId,
      canvas_announcement_id: String(params.announcement.id),
      title: params.announcement.title,
      body_raw: params.announcement.message ?? null,
      ai_summary: summary.summary,
      importance: summary.importance,
      detected_deadlines: normalizeDeadlines(deadlines.deadlines),
      posted_at: params.announcement.posted_at ?? params.announcement.created_at ?? null,
    })
    .select("id, canvas_announcement_id")
    .single();

  if (insertAnnouncementError || !insertedAnnouncement) {
    throw new Error(
      `Failed to insert Canvas announcement ${params.announcement.id}: ${insertAnnouncementError?.message ?? "Unknown error"}`,
    );
  }

  params.counters.newAnnouncements += 1;

  const chunks = bodyText
    ? withChunkMetadata(params.module.code ?? "Unknown", params.announcement.title, null, bodyText)
    : [];

  const embeddingsCreated = await insertEmbeddings({
    userId: params.userId,
    moduleId: params.module.id,
    sourceType: "announcement",
    sourceId: (insertedAnnouncement as AnnouncementRow).id,
    chunks,
  });

  params.counters.embeddingsCreated += embeddingsCreated;
  params.counters.processedAnnouncements += 1;
}

function parseTaskWeight(pointsPossible: number | null | undefined, deadlines: Awaited<ReturnType<typeof extractDeadlines>>["deadlines"]): number | null {
  if (typeof pointsPossible === "number" && Number.isFinite(pointsPossible)) {
    return pointsPossible;
  }

  const candidate = deadlines
    .map((deadline) => deadline.weight)
    .find((weight) => /\d/.test(weight));

  if (!candidate) {
    return null;
  }

  const parsed = Number(candidate.replace(/[^\d.]+/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

async function processNewAssignment(params: {
  userId: string;
  module: ModuleRow;
  assignment: CanvasAssignment;
  counters: SyncCounters;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const descriptionText = stripHtml(params.assignment.description ?? "");
  const deadlines = descriptionText ? await extractDeadlines(descriptionText) : { deadlines: [] };

  const { data: insertedTask, error: insertTaskError } = await supabase
    .from("tasks")
    .insert({
      module_id: params.module.id,
      user_id: params.userId,
      title: params.assignment.name,
      due_at: params.assignment.due_at ?? null,
      source: "canvas",
      source_ref_id: String(params.assignment.id),
      completed: false,
      weight: parseTaskWeight(params.assignment.points_possible, deadlines.deadlines),
    })
    .select("id, source_ref_id")
    .single();

  if (insertTaskError || !insertedTask) {
    throw new Error(`Failed to insert Canvas assignment ${params.assignment.id}: ${insertTaskError?.message ?? "Unknown error"}`);
  }

  params.counters.newTasks += 1;

  if (!descriptionText) {
    return;
  }

  const chunks = withChunkMetadata(params.module.code ?? "Unknown", params.assignment.name, null, descriptionText);
  const embeddingsCreated = await insertEmbeddings({
    userId: params.userId,
    moduleId: params.module.id,
    sourceType: "task",
    sourceId: (insertedTask as TaskRow).id,
    chunks,
  });

  params.counters.embeddingsCreated += embeddingsCreated;
  params.counters.processedTaskDescriptions += 1;
}

async function logSyncResult(params: {
  userId: string;
  status: "success" | "error" | "partial";
  itemsProcessed: number;
  errorMessage?: string;
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sync_log").insert({
    user_id: params.userId,
    sync_type: SYNC_TYPE,
    status: params.status,
    items_processed: params.itemsProcessed,
    error_message: params.errorMessage ?? null,
  });

  if (error) {
    throw new Error(`Failed to write sync log: ${error.message}`);
  }
}

function totalItemsProcessed(counters: SyncCounters): number {
  return (
    counters.modulesUpserted +
    counters.newFiles +
    counters.processedFiles +
    counters.newAnnouncements +
    counters.processedAnnouncements +
    counters.newTasks +
    counters.processedTaskDescriptions +
    counters.embeddingsCreated
  );
}

export async function GET() {
  const counters = createEmptyCounters();
  let phase1User: UserRow | null = null;

  try {
    const supabase = getSupabaseAdminClient();
    phase1User = await ensurePhase1User();

    const courses = await getCourses();

    for (const course of courses) {
      const moduleRow = await upsertModule(phase1User.id, course);
      counters.modulesUpserted += 1;

      const existingFilesResponse = await supabase
        .from("canvas_files")
        .select("id, canvas_file_id")
        .eq("user_id", phase1User.id)
        .eq("module_id", moduleRow.id);

      if (existingFilesResponse.error) {
        throw new Error(`Failed to load existing files for ${course.id}: ${existingFilesResponse.error.message}`);
      }

      const existingAnnouncementsResponse = await supabase
        .from("announcements")
        .select("id, canvas_announcement_id")
        .eq("user_id", phase1User.id)
        .eq("module_id", moduleRow.id);

      if (existingAnnouncementsResponse.error) {
        throw new Error(
          `Failed to load existing announcements for ${course.id}: ${existingAnnouncementsResponse.error.message}`,
        );
      }

      const existingTasksResponse = await supabase
        .from("tasks")
        .select("id, source_ref_id")
        .eq("user_id", phase1User.id)
        .eq("module_id", moduleRow.id)
        .eq("source", "canvas");

      if (existingTasksResponse.error) {
        throw new Error(`Failed to load existing tasks for ${course.id}: ${existingTasksResponse.error.message}`);
      }

      const existingFileIds = new Set(
        ((existingFilesResponse.data ?? []) as CanvasFileRow[])
          .map((row) => row.canvas_file_id)
          .filter((value): value is string => Boolean(value)),
      );
      const existingAnnouncementIds = new Set(
        ((existingAnnouncementsResponse.data ?? []) as AnnouncementRow[])
          .map((row) => row.canvas_announcement_id)
          .filter((value): value is string => Boolean(value)),
      );
      const existingTaskSourceIds = new Set(
        ((existingTasksResponse.data ?? []) as TaskRow[])
          .map((row) => row.source_ref_id)
          .filter((value): value is string => Boolean(value)),
      );

      const files = await getFiles(course.id);
      for (const file of files) {
        if (existingFileIds.has(String(file.id))) {
          continue;
        }

        await processNewFile({
          userId: phase1User.id,
          module: moduleRow,
          file,
          counters,
        });
      }

      const announcements = await getAnnouncements(course.id);
      for (const announcement of announcements) {
        if (existingAnnouncementIds.has(String(announcement.id))) {
          continue;
        }

        await processNewAnnouncement({
          userId: phase1User.id,
          module: moduleRow,
          announcement,
          counters,
        });
      }

      const assignments = await getAssignments(course.id);
      for (const assignment of assignments) {
        if (existingTaskSourceIds.has(String(assignment.id))) {
          continue;
        }

        await processNewAssignment({
          userId: phase1User.id,
          module: moduleRow,
          assignment,
          counters,
        });
      }
    }

    const now = new Date().toISOString();
    const { error: updateUserError } = await getSupabaseAdminClient()
      .from("users")
      .update({ last_synced_at: now })
      .eq("id", phase1User.id);

    if (updateUserError) {
      throw new Error(`Failed to update user's last_synced_at: ${updateUserError.message}`);
    }

    const itemsProcessed = totalItemsProcessed(counters);
    await logSyncResult({
      userId: phase1User.id,
      status: "success",
      itemsProcessed,
    });

    return Response.json({
      ok: true,
      userId: phase1User.id,
      syncedAt: now,
      counters,
      coursesSeen: courses.length,
      itemsProcessed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync failure";

    if (phase1User) {
      try {
        await logSyncResult({
          userId: phase1User.id,
          status: "error",
          itemsProcessed: totalItemsProcessed(counters),
          errorMessage: message,
        });
      } catch {
        // Best-effort logging only.
      }
    }

    return Response.json(
      {
        ok: false,
        error: message,
        counters,
      },
      { status: 500 },
    );
  }
}
