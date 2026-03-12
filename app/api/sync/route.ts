export const dynamic = "force-dynamic";

import pdf from "pdf-parse/lib/pdf-parse.js";
import { callAI, classifyFile, extractDeadlines, getProvider } from "@/lib/ai";
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
import { chunkText, generateEmbedding, generateEmbeddings } from "@/lib/embed";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { fetchNUSModsModule } from "@/lib/nusmods";

const DEFAULT_PHASE1_USER_EMAIL = "phase1-local@studex.local";
const DEFAULT_SUMMARY_MODEL = process.env.AI_MODEL ?? "claude-haiku-4-5";
const SYNC_TYPE = "full";

type UserRow = { id: string; email: string | null; last_synced_at: string | null };
type ModuleRow = { id: string; canvas_course_id: string | null; code: string | null; title: string | null; sync_enabled: boolean };
type CanvasFileRow = { id: string; canvas_file_id: string | null };
type AnnouncementRow = { id: string; canvas_announcement_id: string | null };
type TaskRow = { id: string; source_ref_id: string | null };

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
  return { modulesUpserted: 0, newFiles: 0, processedFiles: 0, newAnnouncements: 0, processedAnnouncements: 0, newTasks: 0, processedTaskDescriptions: 0, embeddingsCreated: 0 };
}

function sanitizePostgresText(text: string): string {
  return text.replace(/\0/g, "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, "").trim();
}

function sanitizeText(value: string | null | undefined): string {
  return sanitizePostgresText((value ?? "").replace(/\r\n/g, "\n"));
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<script[\s\S]*?<\/script[^>]*>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&#x27;/gi, "'").replace(/&#x2F;/gi, "/").replace(/&amp;/gi, "&").replace(/\n{3,}/g, "\n\n").replace(/[ \t]{2,}/g, " ").trim();
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

async function summarizeAnnouncement(title: string, bodyText: string): Promise<{ summary: string | null; importance: "high" | "normal" | "low" }> {
  const text = sanitizeText(bodyText);
  if (!text) return { summary: null, importance: "low" };
  const prompt = [
    "Summarize this Canvas announcement for a student. Focus on academic impact.",
    "Specifically look for and include in the summary if present:",
    "- Actionable deadlines (dates, times, tasks)",
    "- Exam hints or focus areas mentioned by professors",
    "- Changes to grading rubrics or assessment criteria",
    "- Key weekly concepts or learning objectives",
    'Return ONLY valid JSON with no markdown: {"summary":"string","importance":"high|normal|low"}',
    `Title: ${title}`,
    "Body:",
    truncate(text, 5000)
  ].join("\n\n");
  try {
    const raw = await callAI(prompt, DEFAULT_SUMMARY_MODEL);
    const parsed = JSON.parse(raw);
    return { summary: parsed.summary?.trim() || null, importance: parsed.importance || "normal" };
  } catch { return { summary: truncate(text, 280) || null, importance: "normal" }; }
}

function inferModuleCode(course: CanvasCourse): string {
  const candidates = [course.course_code, course.original_name, course.name].map(v => sanitizeText(v)).filter(Boolean);
  for (const candidate of candidates) {
    const match = candidate.match(/[A-Z]{2,4}\d{4}[A-Z]?/);
    if (match) return match[0];
  }
  return sanitizeText(course.course_code) || sanitizeText(course.name) || `course-${course.id}`;
}

async function ensurePhase1User(): Promise<UserRow> {
  const supabase = getSupabaseAdminClient();
  const { data: users } = await supabase.from("users").select("id, email, last_synced_at").order("created_at", { ascending: true }).limit(1);
  if (users?.[0]) return users[0] as UserRow;
  const { data: user, error } = await supabase.from("users").insert({ email: DEFAULT_PHASE1_USER_EMAIL, ai_provider: "anthropic", ai_model: DEFAULT_SUMMARY_MODEL }).select("id, email, last_synced_at").single();
  if (error || !user) throw new Error("Failed to create user");
  return user as UserRow;
}

async function upsertModule(userId: string, course: CanvasCourse): Promise<ModuleRow> {
  const supabase = getSupabaseAdminClient();
  const code = inferModuleCode(course);
  const payload = { user_id: userId, canvas_course_id: String(course.id), code, title: sanitizeText(course.name) || code, last_canvas_sync: new Date().toISOString() };
  const { data, error } = await supabase.from("modules").upsert(payload, { onConflict: "user_id, canvas_course_id" }).select("id, canvas_course_id, code, title, sync_enabled").single();
  if (error || !data) throw new Error("Failed to upsert module");
  return data as ModuleRow;
}

async function extractCanvasFileText(file: CanvasFile): Promise<{ text: string; canvasUrl: string | null; isOptimized: boolean }> {
  const downloadUrl = await getFileDownloadUrl(file.id);
  if (!downloadUrl) return { text: "", canvasUrl: null, isOptimized: false };
  const contentType = sanitizeText(file.content_type).toLowerCase();
  const filename = sanitizeText(file.display_name || file.filename).toLowerCase();
  let text = "";
  let isOptimized = false;

  if (contentType.includes("pdf") || filename.endsWith(".pdf")) {
    const response = await fetch(downloadUrl, { cache: "no-store" });
    const buffer = Buffer.from(await response.arrayBuffer());
    const parsed = await pdf(buffer);
    text = sanitizeText(parsed.text);
    // Rough estimate: 4 chars per token. 3000 tokens = 12000 chars.
    // Let's be more aggressive: first 8000 + last 4000 for a mix.
    if (text.length > 12000) {
      const head = text.slice(0, 8000);
      const tail = text.slice(-4000);
      text = `${head}\n\n[... content truncated for cost-efficiency ...]\n\n${tail}`;
      isOptimized = true;
    }
    return { text, canvasUrl: downloadUrl, isOptimized };
  }
  if (contentType.startsWith("text/") || filename.endsWith(".txt") || filename.endsWith(".md")) {
    const response = await fetch(downloadUrl, { cache: "no-store" });
    text = sanitizeText(await response.text());
    return { text, canvasUrl: downloadUrl, isOptimized: false };
  }
  return { text: "", canvasUrl: downloadUrl, isOptimized: false };
}

async function insertEmbeddings(params: { userId: string; moduleId: string; sourceType: "file" | "announcement" | "task"; sourceId: string; chunks: string[] }): Promise<number> {
  const supabase = getSupabaseAdminClient();
  if (params.chunks.length === 0) return 0;
  try {
    const embeddings = await generateEmbeddings(params.chunks);
    const rows = params.chunks.map((chunk, index) => ({ user_id: params.userId, module_id: params.moduleId, source_type: params.sourceType, source_id: params.sourceId, chunk_index: index, chunk_text: chunk, embedding: embeddings[index] }));
    const { error } = await supabase.from("embeddings").insert(rows);
    if (error) return 0;
    return rows.length;
  } catch { return 0; }
}

async function summarizeFile(filename: string, text: string): Promise<string | null> {
  const sanitized = sanitizeText(text);
  if (!sanitized) return null;

  const prompt = [
    "Summarize this academic course file for a student.",
    "Specifically identify:",
    "- Key concepts covered",
    "- Mention of specific assignment requirements or exam hints",
    "- Deadlines mentioned in the text",
    "The summary must be at most 3 concise bullet points.",
    `Filename: ${filename}`,
    "Content:",
    truncate(sanitized, 5000),
  ].join("\n\n");

  try {
    const raw = await callAI(prompt, DEFAULT_SUMMARY_MODEL);
    return raw.trim();
  } catch {
    return truncate(sanitized, 280);
  }
}

async function processNewFile(params: { userId: string; module: ModuleRow; file: CanvasFile; counters: SyncCounters; send: (data: any) => void }): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const { text, canvasUrl, isOptimized } = await extractCanvasFileText(params.file);
    if (isOptimized) {
      params.send({ status: "syncing_file", message: `  📄 ${params.module.code}: ${params.file.display_name} (Optimizing extraction for cost-efficiency)` });
    }
    
    const [classification, summary] = await Promise.all([
      classifyFile(params.file.display_name, text),
      summarizeFile(params.file.display_name, text)
    ]);

    let insertPayload: any = { 
      module_id: params.module.id, 
      user_id: params.userId, 
      canvas_file_id: String(params.file.id), 
      filename: params.file.display_name, 
      file_type: classification.file_type, 
      canvas_url: canvasUrl, 
      extracted_text: text || null, 
      ai_summary: summary,
      processed: false, 
      week_number: classification.week_number, 
      uploaded_at: params.file.updated_at || null 
    };

    let { data: insertedFile, error } = await supabase.from("canvas_files").insert(insertPayload).select("id").single();

    if (error && (error.code === '42703' || (error.message && error.message.includes('ai_summary')))) {
      delete insertPayload.ai_summary;
      const fallbackResult = await supabase.from("canvas_files").insert(insertPayload).select("id").single();
      insertedFile = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error || !insertedFile) {
      console.error(`Database error inserting file ${params.file.display_name}:`, error);
      params.send({ status: "syncing_file", message: `  ⚠️ Failed to save ${params.file.display_name} metadata.` });
      return;
    }
    params.counters.newFiles += 1;
    const prefix = `[Module: ${params.module.code} | Week: ${classification.week_number ?? "unknown"} | Source: ${params.file.display_name}]`;
    const chunks = text ? chunkText(text).map(c => `${prefix}\n${c}`) : [];
    const embeddingsCreated = await insertEmbeddings({ userId: params.userId, moduleId: params.module.id, sourceType: "file", sourceId: (insertedFile as any).id, chunks });
    params.counters.embeddingsCreated += embeddingsCreated;
    await supabase.from("canvas_files").update({ processed: true }).eq("id", (insertedFile as any).id);
    params.counters.processedFiles += 1;
  } catch (err: any) {
    console.error(`Failed to process file ${params.file.display_name}:`, err);
  }
}

async function processNewAnnouncement(params: { userId: string; module: ModuleRow; announcement: CanvasAnnouncement; counters: SyncCounters }): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const bodyText = stripHtml(params.announcement.message ?? "");
    const deadlines = await extractDeadlines(bodyText);
    const summary = await summarizeAnnouncement(params.announcement.title, bodyText);
    const { data: insertedAnn, error } = await supabase.from("announcements").insert({ module_id: params.module.id, user_id: params.userId, canvas_announcement_id: String(params.announcement.id), title: params.announcement.title, body_raw: params.announcement.message, ai_summary: summary.summary, importance: summary.importance, detected_deadlines: deadlines.deadlines, posted_at: params.announcement.posted_at || null }).select("id").single();
    if (error || !insertedAnn) return;
    params.counters.newAnnouncements += 1;
    const chunks = bodyText ? chunkText(bodyText).map(c => `[Announcement: ${params.announcement.title}]\n${c}`) : [];
    await insertEmbeddings({ userId: params.userId, moduleId: params.module.id, sourceType: "announcement", sourceId: (insertedAnn as any).id, chunks });
    params.counters.processedAnnouncements += 1;
  } catch (err: any) {
    console.error(`Failed to process announcement ${params.announcement.title}:`, err);
  }
}

async function processNewAssignment(params: { userId: string; module: ModuleRow; assignment: CanvasAssignment; counters: SyncCounters }): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const { data: insertedTask, error } = await supabase.from("tasks").insert({ module_id: params.module.id, user_id: params.userId, title: params.assignment.name, due_at: params.assignment.due_at || null, source: "canvas", source_ref_id: String(params.assignment.id), completed: false }).select("id").single();
    if (error || !insertedTask) return;
    params.counters.newTasks += 1;
    const descText = stripHtml(params.assignment.description || "");
    if (descText) {
      const chunks = chunkText(descText).map(c => `[Assignment: ${params.assignment.name}]\n${c}`);
      await insertEmbeddings({ userId: params.userId, moduleId: params.module.id, sourceType: "task", sourceId: (insertedTask as any).id, chunks });
      params.counters.processedTaskDescriptions += 1;
    }
  } catch (err: any) {
    console.error(`Failed to process assignment ${params.assignment.name}:`, err);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode") || "discovery";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      try {
        const user = await ensurePhase1User();
        send({ status: "started", message: "Fetching modules from Canvas..." });
        const courses = await getCourses();
        const results = await Promise.all(courses.map(async (c) => {
          const row = await upsertModule(user.id, c);
          await fetchNUSModsModule(row.code || ""); // Parallel NUSMods grab
          return row;
        }));
        send({ status: "complete", message: `Discovery complete. Found ${results.length} courses.` });
      } catch (err: any) { send({ status: "error", message: err.message }); }
      controller.close();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { selectedModuleIds, syncFiles } = body;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      const counters = createEmptyCounters();
      try {
        const supabase = getSupabaseAdminClient();
        const user = await ensurePhase1User();
        const { data: modules } = await supabase.from("modules").select("*").in("id", selectedModuleIds);
        if (!modules) throw new Error("No modules found");

        for (const mod of modules) {
          send({ status: "syncing", message: `Syncing ${mod.code}...` });
          
          // 1. Fetch all items in parallel from Canvas
          const [anns, asgns, files] = await Promise.all([
            getAnnouncements(mod.canvas_course_id),
            getAssignments(mod.canvas_course_id),
            syncFiles ? getFiles(mod.canvas_course_id) : Promise.resolve([]),
          ]);

          // 2. Fetch existing IDs from Supabase for this module
          const { data: existingAnns } = await supabase.from("announcements").select("canvas_announcement_id").eq("module_id", mod.id);
          const { data: existingAsgns } = await supabase.from("tasks").select("source_ref_id").eq("module_id", mod.id).eq("source", "canvas");
          const { data: existingFiles } = await supabase.from("canvas_files").select("canvas_file_id").eq("module_id", mod.id);

          const existingAnnIds = new Set(existingAnns?.map(a => String(a.canvas_announcement_id)) || []);
          const existingAsgnIds = new Set(existingAsgns?.map(a => String(a.source_ref_id)) || []);
          const existingFileIds = new Set(existingFiles?.map(f => String(f.canvas_file_id)) || []);

          // 3. Filter items that are already synced
          const newAnns = anns.filter(ann => !existingAnnIds.has(String(ann.id)));
          const newAsgns = asgns.filter(asgn => !existingAsgnIds.has(String(asgn.id)));
          const newFilesList = files.filter(file => !existingFileIds.has(String(file.id)));

          if (anns.length > newAnns.length) {
            send({ status: "syncing", message: `  ℹ️ Skipped ${anns.length - newAnns.length} already-synced announcements.` });
          }
          if (asgns.length > newAsgns.length) {
            send({ status: "syncing", message: `  ℹ️ Skipped ${asgns.length - newAsgns.length} already-synced tasks.` });
          }
          if (files.length > newFilesList.length) {
            send({ status: "syncing", message: `  ℹ️ Skipped ${files.length - newFilesList.length} already-synced files.` });
          }

          // 4. Process new announcements and assignments in parallel
          await Promise.all([
            ...newAnns.map(ann => processNewAnnouncement({ userId: user.id, module: mod, announcement: ann, counters })),
            ...newAsgns.map(asgn => processNewAssignment({ userId: user.id, module: mod, assignment: asgn, counters })),
          ]);

          // 5. Process new files with concurrency limit
          if (syncFiles && newFilesList.length > 0) {
            const CONCURRENCY_LIMIT = 3;
            for (let i = 0; i < newFilesList.length; i += CONCURRENCY_LIMIT) {
              const batch = newFilesList.slice(i, i + CONCURRENCY_LIMIT);
              await Promise.all(batch.map(async (file) => {
                send({ status: "syncing_file", message: `  📄 ${mod.code}: ${file.display_name}` });
                await processNewFile({ userId: user.id, module: mod, file, counters, send });
              }));
            }
          }
        }
        // Stream final summary with counts
        const parts: string[] = [];
        if (counters.newFiles > 0) parts.push(`${counters.processedFiles} files`);
        if (counters.newAnnouncements > 0) parts.push(`${counters.processedAnnouncements} announcements`);
        if (counters.newTasks > 0) parts.push(`${counters.newTasks} tasks`);
        if (counters.embeddingsCreated > 0) parts.push(`${counters.embeddingsCreated} embeddings`);
        const summary = parts.length > 0
          ? `Sync complete — processed ${parts.join(", ")}.`
          : "Sync complete — everything was already up to date.";
        send({ status: "complete", message: summary });

        // Update last_synced_at
        await supabase.from("users").update({ last_synced_at: new Date().toISOString() }).eq("id", user.id);
      } catch (err: any) { send({ status: "error", message: err.message }); }
      controller.close();
    }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } });
}
