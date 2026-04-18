# Phase A — Strip AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the entire AI surface (chat endpoint, embeddings, announcement summarization, AI-driven file classification) and consolidate the sprawling schema files into a canonical schema + numbered migrations. Result: smaller, faster, same Canvas coverage as today.

**Architecture:** Follow the "update consumers first, then delete producers" order so every intermediate state compiles and passes tests. Sync pipeline, UI mounts, and shared types are stripped of AI references before the AI modules are physically deleted. Finally, dependencies are uninstalled and schema files are consolidated.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest + Testing Library, Supabase (Postgres), Tailwind CSS. No AI libraries after this phase.

**Reference spec:** `docs/superpowers/specs/2026-04-18-better-canvas-pivot-design.md` §9 (Removal list).

---

## File Structure

**Created:**
- `supabase/migrations/0001_init.sql` — canonical baseline schema for fresh DBs, post-AI
- `supabase/migrations/0002_drop_ai_artifacts.sql` — idempotent cleanup for existing DBs

**Modified:**
- `lib/sync.ts` — drop all AI/embedding call sites, keep hash-based change detection
- `lib/dashboard.ts` — remove `ChatPreview` type, `chat` field, `ai_summary` reads
- `lib/contracts.ts` — remove `ChatSource`, `ChatResponse`, `embeddings` from `SyncCounts`
- `lib/config.ts` — remove AI env vars from `CONFIG_KEYS`, remove `ai` from `getServerHealth`
- `lib/demo-user.ts` — drop `ai_provider`/`ai_model` columns and `DEFAULT_AI_MODEL`
- `app/ui/dashboard/home-view.tsx` — remove `ChatPanel` import + mount
- `app/ui/dashboard/module-view.tsx` — remove chat tab + `ChatPanel`
- `app/ui/dashboard/manage-view.tsx` — update copy that mentions chat
- `app/dashboard-client.tsx` — update subtitle copy that mentions chat
- `app/layout.tsx` — update metadata description
- `tests/app/dashboard-client.test.tsx` — drop `baseChat` + `chat` from fixtures
- `supabase/schema.sql` — rewritten as canonical post-AI baseline
- `package.json` — uninstall AI deps
- `.env.example` — drop AI env vars
- `README.md` — drop AI sections

**Deleted:**
- `lib/ai.ts`
- `lib/embed.ts`
- `app/api/chat/route.ts`
- `app/ui/chat-panel.tsx`
- `tests/lib/ai.test.ts`
- `tests/lib/embed.test.ts`
- `tests/app/ui/chat-panel.test.tsx`
- `tests/app/api/chat-route.test.ts`
- `supabase/schema_local.sql`
- `supabase/schema_v7.sql`
- `supabase/schema_voyage.sql`
- `supabase/add_live_sync_metadata.sql`

**Already deleted in working tree, committed in Task 8:** `audit-db.js`, `check-db.js`, `migrate-db.js`, `supabase/migrate.js`.

---

## TDD framing for this phase

Phase A is a pure subtraction pass — no new product behavior is introduced, so classical red→green→refactor doesn't apply. The discipline is:

1. Run `npm test` at the start of every task to confirm a green baseline before touching code.
2. After every file modification, re-run `npm test` (or the specific affected test file) and confirm green.
3. Commit only when tests are green.

All tests that exercise the removed AI surface are deleted as part of the same commit that removes the code they cover. Tests that exercise behavior that survives the pivot (sync helpers, sync route SSE framing, dashboard fallback, file preview) must stay green throughout.

---

## Task 1: Establish green baseline, strip AI from lib/sync.ts, and drop SyncCounts.embeddings

**Files:**
- Modify: `lib/sync.ts`
- Modify: `lib/contracts.ts`

**Rationale:** `lib/sync.ts` is the only non-test consumer of `lib/ai.ts` and `lib/embed.ts`. Strip it first so those modules become orphan code — then deletion is risk-free. The `embeddings` field on `SyncCounts` must be dropped in the same commit because the rewritten `createCounts()` no longer produces it, and the two changes must land atomically for the commit to be type-green. `ChatSource` and `ChatResponse` stay in `contracts.ts` until Task 5 — their consumers (`chat-panel.tsx`, chat route) are still present.

- [ ] **Step 1: Confirm baseline is green**

Run: `npm test`
Expected: `Test Files  11 passed (11)  Tests  27 passed (27)`

- [ ] **Step 2: Replace `lib/sync.ts` with the AI-free version**

Fully replace the file with:

```typescript
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
```

**Rationale for key changes:**
- Removed `embeddings` from `SyncCounts` — the type itself is simplified in Step 3 below so the rewrite compiles.
- Removed `replaceEmbeddings`, `buildEmbeddingChunks`, `readCanvasFile`, `upsertFileRecord`, `createLimiter`, `LEGACY_OPTIONAL_COLUMNS`, `getMissingColumnName`, `omitKey`, `upsertSingleRow`, `FileExtractionResult`, `QueueTask`, `DatabaseErrorLike`, `SourceLabelInput`, `FileInsertRow`, `AnnouncementInsertRow`, `TaskInsertRow`, `pdf-parse` import, `@/lib/ai` import, `@/lib/embed` import.
- `loadExistingState` no longer needs graceful column fallback — the canonical schema always has `content_hash`/`source_updated_at` after Task 7.
- `syncFile` no longer downloads or parses file contents; it just records metadata and the Canvas temp URL.
- `announcements.ai_summary`, `announcements.importance`, `announcements.detected_deadlines`, `canvas_files.ai_summary`, `canvas_files.extracted_text`, `canvas_files.file_type`, `canvas_files.week_number` are no longer written. The DB columns may remain null; Task 7 decides which to drop.

- [ ] **Step 3: Update `lib/contracts.ts` to drop `SyncCounts.embeddings`**

Edit `lib/contracts.ts`. Change the `SyncCounts` type:

Old:
```typescript
export type SyncCounts = {
  modules: number;
  announcements: number;
  tasks: number;
  files: number;
  embeddings: number;
};
```

New:
```typescript
export type SyncCounts = {
  modules: number;
  announcements: number;
  tasks: number;
  files: number;
};
```

Leave `ChatSource` and `ChatResponse` in place for now — they're removed in Task 4 alongside their last consumers.

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors. (The existing `chat-panel.tsx` and `app/api/chat/route.ts` still compile because the types they import still exist.)

- [ ] **Step 5: Run tests to confirm no regression**

Run: `npm test`
Expected: `Test Files  11 passed (11)  Tests  27 passed (27)`. The four AI/chat test files still pass because they test `lib/ai.ts`, `lib/embed.ts`, `app/api/chat/route.ts`, and `app/ui/chat-panel.tsx` directly — those files still exist until Task 4.

- [ ] **Step 6: Confirm the sync helper test (`tests/lib/sync.test.ts`) still passes**

Run: `npx vitest run tests/lib/sync.test.ts`
Expected: `Test Files  1 passed (1)  Tests  4 passed (4)`. The helpers (`sanitizeSyncText`, `stripHtml`, `createContentHash`, `buildSourceLabel`) still have identical behavior.

- [ ] **Step 7: Commit**

```bash
git add lib/sync.ts lib/contracts.ts
git commit -m "$(cat <<'EOF'
refactor(sync): remove AI enrichment from sync pipeline

syncAnnouncement, syncAssignment, and syncFile no longer call AI
summarization, deadline extraction, file classification, or embedding
generation. File sync now records metadata + Canvas temp URL only;
PDF parsing is gone. Change-detection via content_hash / source_updated_at
is preserved. SyncCounts drops the embeddings field to match.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Remove ChatPanel from dashboard UI

**Files:**
- Modify: `app/ui/dashboard/home-view.tsx`
- Modify: `app/ui/dashboard/module-view.tsx`
- Modify: `app/ui/dashboard/manage-view.tsx`
- Modify: `app/dashboard-client.tsx`
- Modify: `app/layout.tsx`

**Rationale:** `ChatPanel` is the only consumer of the chat route. Remove all five mount points and chat-related copy so the chat surface vanishes from the UI. Test fixtures that reference `chat` are updated in Task 3.

- [ ] **Step 1: Remove ChatPanel from `app/ui/dashboard/home-view.tsx`**

Edit `app/ui/dashboard/home-view.tsx`:

Delete the import:
```tsx
import { ChatPanel } from "@/app/ui/chat-panel";
```

Remove the `ChatPanel` mount (currently inside the right-column `<div className="space-y-4">`):
```tsx
<ChatPanel
  activeModule="All synced modules"
  suggestedPrompts={data.chat.suggestedPrompts}
  initialMessages={data.chat.recentMessages}
  compact={true}
/>
```

The right column now contains only `<UpcomingPanel>` and `<ChangesPanel>`. The surrounding `<div className="space-y-4">` wrapper stays.

- [ ] **Step 2: Remove chat tab from `app/ui/dashboard/module-view.tsx`**

Edit `app/ui/dashboard/module-view.tsx`:

Delete the import:
```tsx
import { ChatPanel } from "@/app/ui/chat-panel";
```

Change the `ModuleTab` type:
```tsx
type ModuleTab = "overview" | "files" | "nusmods";
```

Remove the `chat` entry from `tabIds`:
```tsx
chat: {
  tab: `module-tab-chat-${module.id}`,
  panel: `module-panel-chat-${module.id}`,
},
```

Remove the `"chat"` entry from the tab list:
```tsx
["chat", "Chat"],
```

Remove the entire `{tab === "chat" ? ( ... ) : null}` block (lines that render the `ChatPanel` inside `tabIds.chat.panel`).

- [ ] **Step 3: Update copy in `app/ui/dashboard/manage-view.tsx`**

Edit `app/ui/dashboard/manage-view.tsx:20`:

Old:
```tsx
Enable only the modules you want in the command board, module workspace views, chat retrieval, and file intelligence surfaces.
```

New:
```tsx
Enable only the modules you want in the command board, module workspace views, and file listings.
```

- [ ] **Step 4: Update subtitle in `app/dashboard-client.tsx`**

Edit `app/dashboard-client.tsx:60`:

Old:
```tsx
? "Work, changes, schedule, and grounded chat."
```

New:
```tsx
? "Work, changes, and schedule."
```

- [ ] **Step 5: Update metadata in `app/layout.tsx`**

Edit `app/layout.tsx:22`:

Old:
```tsx
description: "AI-powered student dashboard for Canvas, tasks, announcements, and study chat.",
```

New:
```tsx
description: "A faster, cleaner window into your NUS Canvas workspace.",
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: existing dashboard tests may now fail because `FALLBACK_DASHBOARD.chat` is still present and tests still render `data.chat`. Specifically, `tests/app/dashboard-client.test.tsx` may pass (its fixtures still supply `chat`), but TypeScript compile will fail because `home-view.tsx` no longer reads `data.chat`. Confirm the failure mode:

Run: `npx tsc --noEmit`
Expected: no new TS errors from the edits above (the imports are removed, `data.chat` reads are removed). If TS reports `data.chat` as unused on the type, that's fine — the type is cleaned up in Task 3.

Run: `npm test` again.
Expected: `Test Files  11 passed (11)  Tests  27 passed (27)` still passes, because the chat tests exercise `ChatPanel` directly (which still exists until Task 4) and dashboard tests don't assert on the removed mount.

- [ ] **Step 7: Commit**

```bash
git add app/ui/dashboard/home-view.tsx app/ui/dashboard/module-view.tsx app/ui/dashboard/manage-view.tsx app/dashboard-client.tsx app/layout.tsx
git commit -m "$(cat <<'EOF'
refactor(ui): remove ChatPanel from dashboard and module views

Home sidebar no longer mounts the chat panel. Module workspace drops
the Chat tab. Copy on manage view, top bar, and metadata is updated
to stop advertising the AI chat surface.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Strip chat/AI from lib/dashboard.ts, lib/config.ts, lib/demo-user.ts, and dashboard test fixtures

**Files:**
- Modify: `lib/dashboard.ts`
- Modify: `lib/config.ts`
- Modify: `lib/demo-user.ts`
- Modify: `tests/app/dashboard-client.test.tsx`

**Rationale:** These files either define AI-related types (`ChatPreview`), read AI-related columns (`ai_summary`), or validate AI env vars. Strip them now so Task 4 can delete `lib/ai.ts` without leaving dangling imports.

- [ ] **Step 1: Edit `lib/dashboard.ts`**

Remove the `ChatPreview` type (currently lines 81-89):

```typescript
export type ChatPreview = {
  activeModule: string;
  suggestedPrompts: string[];
  recentMessages: Array<{
    id: string;
    role: "assistant" | "user";
    content: string;
  }>;
};
```

Remove the `chat` field from `DashboardData` type (currently line 98):

Old:
```typescript
latestChanges: DashboardChange[];
chat: ChatPreview;
source: "live" | "fallback";
```

New:
```typescript
latestChanges: DashboardChange[];
source: "live" | "fallback";
```

Remove `ai_summary` from the `canvas_files` inline type inside `ModuleQueryRow` (currently lines 115-123):

Old:
```typescript
canvas_files: Array<{
  id: string;
  filename: string | null;
  file_type: string | null;
  uploaded_at: string | null;
  ai_summary?: string | null;
  extracted_text: string | null;
  canvas_url: string | null;
}> | null;
```

New:
```typescript
canvas_files: Array<{
  id: string;
  filename: string | null;
  file_type: string | null;
  uploaded_at: string | null;
  extracted_text: string | null;
  canvas_url: string | null;
}> | null;
```

Remove `ai_summary` from the announcement inline type inside `AnnouncementQueryRow` (currently lines 136-143):

Old:
```typescript
type AnnouncementQueryRow = {
  id: string;
  title: string | null;
  ai_summary?: string | null;
  posted_at: string | null;
  importance: string | null;
  modules: RelationRecord | RelationRecord[] | null;
};
```

New:
```typescript
type AnnouncementQueryRow = {
  id: string;
  title: string | null;
  posted_at: string | null;
  importance: string | null;
  modules: RelationRecord | RelationRecord[] | null;
};
```

Remove the `chat: { ... }` block from `FALLBACK_DASHBOARD` (currently lines 176-190).

Old:
```typescript
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
```

New:
```typescript
  latestChanges: [],
};
```

Update `FALLBACK_DASHBOARD.setupMessage` to drop the "AI configuration" mention (currently line 167-168):

Old:
```typescript
  setupMessage:
    "Studex is waiting for Supabase, Canvas, and AI configuration. Add the required environment variables, run the SQL schema, then trigger your first sync.",
```

New:
```typescript
  setupMessage:
    "Studex is waiting for Supabase and Canvas configuration. Add the required environment variables, run the SQL schema, then trigger your first sync.",
```

**Simplify `loadModuleRows`** (currently lines 400-416). Replace the entire function with:

```typescript
async function loadModuleRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("modules")
    .select("id, code, title, last_canvas_sync, sync_enabled, canvas_files(id, filename, file_type, uploaded_at, extracted_text, canvas_url)")
    .eq("user_id", userId)
    .order("code", { ascending: true });
}
```

Rationale: `ai_summary` is dropped from the column list and the error-fallback branch is no longer needed because the canonical schema (Task 7) always has the surviving columns.

**Simplify `loadAnnouncementRows`** (currently lines 418-434). Replace the entire function with:

```typescript
async function loadAnnouncementRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("announcements")
    .select("id, title, body_raw, posted_at, importance, modules(code)")
    .eq("user_id", userId)
    .order("posted_at", { ascending: false, nullsFirst: false });
}
```

Rationale: drops `ai_summary`, adds `body_raw` (which replaces `ai_summary` as the source of the short summary shown in the UI), and removes the fallback branch.

**Update `AnnouncementQueryRow`** (currently lines 136-143) to include `body_raw`:

```typescript
type AnnouncementQueryRow = {
  id: string;
  title: string | null;
  body_raw: string | null;
  posted_at: string | null;
  importance: string | null;
  modules: RelationRecord | RelationRecord[] | null;
};
```

**Add a local `stripHtml` helper near the top of the file's private helpers** (duplicates the one in `lib/sync.ts` to avoid a server-only import into a module that is itself already "server-only"; this is a deliberate small duplication rather than a cross-module dependency):

```typescript
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
```

Place it alongside the other helpers (`getFileExtension`, `guessContentType`, etc).

**Update the file `summary` mapping** (currently lines 447-449) inside `buildFileSummary`:

Old:
```typescript
    summary:
      row.ai_summary?.trim() ||
      (extractedText ? `${extractedText.slice(0, 160).trim()}…` : "Summary will appear after file processing."),
```

New:
```typescript
    summary: extractedText ? `${extractedText.slice(0, 160).trim()}…` : "Open this file to preview it.",
```

**Update the announcement `summary` mapping** (currently lines 542-555) inside `loadDashboardData`. Replace the `announcements` map block with:

```typescript
    const announcements: AnnouncementSummary[] = ((announcementsData ?? []) as AnnouncementQueryRow[]).map((announcement) => {
      const bodyPreview = stripHtmlForSummary(announcement.body_raw);
      return {
        id: announcement.id,
        title: announcement.title ?? "Untitled announcement",
        moduleCode: getRelatedModuleCode(announcement.modules),
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
```

**Delete the now-unused `getMissingColumnName` helper** (if it has no remaining callers) and its dependency chain. Check with:

Run: `grep -n "getMissingColumnName" lib/dashboard.ts`
Expected: zero matches after the two simplified `loadXRows` functions above. If a match remains, leave the helper; otherwise delete it.

Run: `npx tsc --noEmit` after the full set of edits to this file.

- [ ] **Step 2: Edit `lib/config.ts`**

Replace the whole file with:

```typescript
export type ConfigRequirement = {
  key: string;
  required: boolean;
  present: boolean;
  description: string;
};

const CONFIG_KEYS = [
  { key: "SUPABASE_URL", required: true, description: "Supabase project URL" },
  { key: "SUPABASE_ANON_KEY", required: true, description: "Supabase browser key" },
  { key: "SUPABASE_SERVICE_KEY", required: true, description: "Supabase service role key" },
  { key: "CANVAS_TOKEN", required: true, description: "Canvas API token" },
  { key: "CANVAS_BASE_URL", required: false, description: "Canvas base URL" },
] as const;

export function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function hasSupabaseConfig() {
  return Boolean(readEnv("SUPABASE_URL") && readEnv("SUPABASE_ANON_KEY") && readEnv("SUPABASE_SERVICE_KEY"));
}

export function getConfigRequirements(): ConfigRequirement[] {
  return CONFIG_KEYS.map((entry) => ({
    ...entry,
    present: Boolean(readEnv(entry.key)),
  }));
}

export function getServerHealth() {
  const requirements = getConfigRequirements();
  const missingRequired = requirements.filter((entry) => entry.required && !entry.present).map((entry) => entry.key);

  return {
    ok: missingRequired.length === 0,
    missingRequired,
    requirements,
  };
}
```

Dropped: `resolveAIConfig` import, `AI_MODEL`/`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` entries, `ai` block in `getServerHealth`.

If `app/api/health/route.ts` consumed the `ai` field, update it to drop references. Check with:

Run: `grep -rn "defaultModel\|providerConfigured\|anthropicConfigured\|openaiConfigured" app lib tests`
Expected: no matches outside the files being deleted. If matches exist, remove the references in those files before committing.

- [ ] **Step 3: Edit `lib/demo-user.ts`**

Replace the whole file with:

```typescript
import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";

const DEFAULT_PHASE1_USER_EMAIL = "phase1-local@studex.local";

export type DemoUserRow = {
  id: string;
  email: string | null;
  last_synced_at: string | null;
};

export async function ensureDemoUser(): Promise<DemoUserRow> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: fetchError } = await supabase
    .from("users")
    .select("id, email, last_synced_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<DemoUserRow>();

  if (fetchError) {
    throw new Error(`Failed to load demo user: ${fetchError.message}`);
  }

  if (existing) {
    return existing;
  }

  const { data: created, error: insertError } = await supabase
    .from("users")
    .insert({
      email: DEFAULT_PHASE1_USER_EMAIL,
    })
    .select("id, email, last_synced_at")
    .single<DemoUserRow>();

  if (insertError || !created) {
    throw new Error(`Failed to create demo user: ${insertError?.message ?? "Unknown error"}`);
  }

  return created;
}
```

Dropped: `DEFAULT_AI_MODEL`, `ai_model` select/insert, `ai_provider` insert.

- [ ] **Step 4: Update `tests/app/dashboard-client.test.tsx`**

Remove the `baseChat` constant and drop the `chat: baseChat` field from every `DashboardData` fixture in the file. Apply the same change to both `beforeSync` and any later fixtures that include `chat`.

Expected diff for the top of the file:

Old:
```tsx
const baseChat = {
  activeModule: "All modules",
  suggestedPrompts: ["What is due this week?"],
  recentMessages: [{ id: "assistant-1", role: "assistant" as const, content: "Ask me anything." }],
};

const baseOverview = {
```

New:
```tsx
const baseOverview = {
```

In each fixture:

Old:
```tsx
  latestChanges: [],
  chat: baseChat,
  source: "fallback",
```

New:
```tsx
  latestChanges: [],
  source: "fallback",
```

Do this for every `DashboardData` literal in the file (there are at least two: `beforeSync` and one later fixture at line ~150).

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: `tests/app/dashboard-client.test.tsx` now passes against the updated type. `tests/lib/ai.test.ts`, `tests/lib/embed.test.ts`, `tests/app/ui/chat-panel.test.tsx`, `tests/app/api/chat-route.test.ts` still pass (they reference AI/chat code directly — deleted in Task 4).

If TS compile fails on any non-deleted file, fix before committing.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard.ts lib/config.ts lib/demo-user.ts tests/app/dashboard-client.test.tsx
git commit -m "$(cat <<'EOF'
refactor(lib): drop AI references from dashboard, config, and demo user

DashboardData no longer carries the ChatPreview field. FALLBACK_DASHBOARD
drops the chat block. lib/config drops AI_MODEL / ANTHROPIC_API_KEY /
OPENAI_API_KEY checks and the `ai` block from getServerHealth. Demo user
no longer writes or reads ai_model / ai_provider columns. Test fixtures
updated to match the new DashboardData shape.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Delete the orphaned AI modules, their tests, and drop ChatSource/ChatResponse

**Files:**
- Delete: `lib/ai.ts`
- Delete: `lib/embed.ts`
- Delete: `app/api/chat/route.ts`
- Delete: `app/ui/chat-panel.tsx`
- Delete: `tests/lib/ai.test.ts`
- Delete: `tests/lib/embed.test.ts`
- Delete: `tests/app/ui/chat-panel.test.tsx`
- Delete: `tests/app/api/chat-route.test.ts`
- Modify: `lib/contracts.ts`

**Rationale:** After Tasks 1–3 nothing else imports these files. Physical deletion is now a pure subtraction. `ChatSource` and `ChatResponse` are only used inside the files being deleted, so they're dropped from `contracts.ts` in the same commit to keep the change atomic and green.

- [ ] **Step 1: Verify no imports remain outside the files being deleted**

Run: `grep -rn "from \"@/lib/ai\"\|from \"@/lib/embed\"\|ChatPanel\|ChatSource\|ChatResponse\|\"@/app/api/chat/route\"" app lib tests`
Expected: matches only in the eight files being deleted plus `lib/contracts.ts`. If matches exist elsewhere, stop and fix.

- [ ] **Step 2: Delete the eight files**

```bash
rm lib/ai.ts lib/embed.ts
rm app/api/chat/route.ts
rm app/ui/chat-panel.tsx
rm tests/lib/ai.test.ts tests/lib/embed.test.ts
rm tests/app/ui/chat-panel.test.tsx
rm tests/app/api/chat-route.test.ts
rmdir app/api/chat 2>/dev/null || true
```

- [ ] **Step 3: Drop `ChatSource` and `ChatResponse` from `lib/contracts.ts`**

Edit `lib/contracts.ts` and remove both type exports:

```typescript
export type ChatSource = {
  id: string;
  label: string;
  moduleCode: string;
  sourceType: string;
  similarity: number;
  excerpt: string;
};

export type ChatResponse = {
  answer?: string;
  error?: string;
  sources?: ChatSource[];
  moduleId?: string | null;
  model?: string | null;
};
```

After removal, `lib/contracts.ts` should contain only the four Sync* types (`SyncStage`, `SyncStatus`, `SyncCounts`, `SyncEvent`).

- [ ] **Step 4: Run type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: `Test Files  7 passed (7)  Tests  17 passed (17)` (down from 11 files / 27 tests by exactly the four removed test files: 2+2+3+3 = 10 tests removed, matching 27 − 17 = 10). If numbers don't line up, something else broke — investigate.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: delete AI modules, their tests, and drop chat types

Removes lib/ai.ts, lib/embed.ts, app/api/chat/route.ts,
app/ui/chat-panel.tsx and their companion test files. All were
unreferenced after the preceding refactors. lib/contracts.ts drops
ChatSource and ChatResponse in the same commit since their last
callers lived in the files just deleted.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Uninstall AI dependencies

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Rationale:** Shrink the bundle, kill transitive supply-chain surface, prevent accidental re-introduction.

- [ ] **Step 1: Uninstall the five packages**

```bash
npm uninstall @anthropic-ai/sdk @huggingface/transformers openai pdf-parse crypto-js
```

- [ ] **Step 2: Confirm `package.json` dependencies**

The `dependencies` block in `package.json` should now contain only:

```json
"dependencies": {
  "@supabase/supabase-js": "^2.99.1",
  "axios": "^1.13.6",
  "dotenv": "^17.3.1",
  "next": "16.1.6",
  "react": "19.2.3",
  "react-dom": "19.2.3"
}
```

If any of the uninstalled packages remain, rerun `npm uninstall <name>` until clean.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build succeeds. Bundle size should drop noticeably (previously pulled in `@huggingface/transformers` WASM, OpenAI + Anthropic SDKs). Record the new `First Load JS shared by all` number — it's informational only, not a gate.

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: `Test Files  7 passed (7)  Tests  17 passed (17)`.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: uninstall AI dependencies

Drops @anthropic-ai/sdk, @huggingface/transformers, openai, pdf-parse,
and crypto-js. All were only used by the removed AI surface. crypto-js
will come back in Phase-2 when encrypted per-user tokens are introduced.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update env docs (.env.example, README.md)

**Files:**
- Modify: `.env.example`
- Modify: `README.md`

**Rationale:** The docs are the contract for anyone setting up the project. They must reflect the post-pivot env surface.

- [ ] **Step 1: Replace `.env.example`**

Fully replace with:

```bash
CANVAS_TOKEN=
CANVAS_BASE_URL=https://canvas.nus.edu.sg

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
```

- [ ] **Step 2: Rewrite the `Environment Setup` section of `README.md`**

Find the existing section in `README.md`:

```markdown
### 2. Environment Setup
Create a `.env.local` file:
```bash
CANVAS_TOKEN=your_canvas_token
CANVAS_BASE_URL=https://canvas.nus.edu.sg

ANTHROPIC_API_KEY=your_anthropic_key
AI_MODEL=claude-haiku-4-5

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```
```

Replace with:

```markdown
### 2. Environment Setup
Create a `.env.local` file:
```bash
CANVAS_TOKEN=your_canvas_token
CANVAS_BASE_URL=https://canvas.nus.edu.sg

SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_key
```
```

- [ ] **Step 3: Update the project description at the top of README.md**

Replace the first description paragraph and the `Key Features` bullets to remove the AI claims. Use this as the new top section (preserve the existing "Getting Started" layout below it):

```markdown
# Studex: A Faster Window Into NUS Canvas

Studex is a fast, unified dashboard that mirrors your NUS Canvas workspace — modules, files, announcements, assignments, learning-path modules, pages, and grades — so you can see everything across every course in one place without waiting on Canvas itself.

## 🚀 Key Features

- **Autonomous LMS Sync:** Deep integration with `canvas.nus.edu.sg` via REST API. Automatically pulls courses, files, announcements, and assignments.
- **Cached + Fresh:** Supabase holds the last-synced snapshot so page loads are instant; a background sync keeps the cache current.
- **Unified Dashboard:** One page shows deadlines, recent announcements, and new files across every course.

## 🛠️ Tech Stack

- **Framework:** Next.js 16 (App Router) with Turbopack.
- **Language:** TypeScript.
- **Styling:** Tailwind CSS v4.
- **Database:** Supabase (PostgreSQL).
```

Remove any AI-specific prerequisites (Anthropic API key, etc.) from the `Prerequisites` subsection.

- [ ] **Step 4: Confirm nothing else mentions AI, embeddings, chat, or Anthropic in the README**

Run: `grep -in "anthropic\|openai\|embedding\|chat\|ai " README.md`
Expected: only matches inside unrelated context (e.g. "available at" or "main" — visually inspect). If any remain that describe AI features, remove them.

- [ ] **Step 5: Commit**

```bash
git add .env.example README.md
git commit -m "$(cat <<'EOF'
docs: drop AI env vars and rewrite project description

.env.example no longer lists ANTHROPIC_API_KEY, OPENAI_API_KEY, AI_MODEL,
EMBED_MODEL, or ENCRYPTION_SECRET. README describes Studex as a
Canvas-mirror dashboard rather than an AI-first product.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Consolidate schema files and create migrations

**Files:**
- Modify: `supabase/schema.sql`
- Create: `supabase/migrations/0001_init.sql`
- Create: `supabase/migrations/0002_drop_ai_artifacts.sql`
- Delete: `supabase/schema_local.sql`
- Delete: `supabase/schema_v7.sql`
- Delete: `supabase/schema_voyage.sql`
- Delete: `supabase/add_live_sync_metadata.sql`

**Rationale:** Replace sprawling schema variants with one canonical source and two migrations: a baseline (for fresh DBs) and an idempotent cleanup (for existing pre-pivot DBs).

- [ ] **Step 1: Rewrite `supabase/schema.sql` as canonical post-AI baseline**

Replace the entire file with:

```sql
-- Studex canonical schema (post-Phase-A, pre-Phase-B).
-- This is the source of truth for the current DB shape.
-- For fresh projects, run this file once. For in-place upgrades from
-- a pre-pivot DB, apply migrations in order from supabase/migrations/.

create table users (
  id uuid default gen_random_uuid() primary key,
  email text unique,
  created_at timestamptz default now(),
  last_synced_at timestamptz
);

-- Note: this table will be renamed to `courses` in Phase B.
create table modules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  canvas_course_id text,
  code text,
  title text,
  last_canvas_sync timestamptz,
  sync_enabled bool default true,
  unique (user_id, canvas_course_id)
);

create table canvas_files (
  id uuid default gen_random_uuid() primary key,
  module_id uuid references modules(id),
  user_id uuid references users(id),
  canvas_file_id text,
  filename text,
  file_type text,
  canvas_url text,
  extracted_text text,
  content_hash text,
  processed bool default false,
  week_number int,
  uploaded_at timestamptz,
  source_updated_at timestamptz,
  unique (user_id, canvas_file_id)
);

create table announcements (
  id uuid default gen_random_uuid() primary key,
  module_id uuid references modules(id),
  user_id uuid references users(id),
  canvas_announcement_id text,
  title text,
  body_raw text,
  importance text,
  detected_deadlines jsonb,
  posted_at timestamptz,
  content_hash text,
  source_updated_at timestamptz,
  unique (user_id, canvas_announcement_id)
);

create table tasks (
  id uuid default gen_random_uuid() primary key,
  module_id uuid references modules(id),
  user_id uuid references users(id),
  title text,
  due_at timestamptz,
  source text,
  source_ref_id text,
  completed bool default false,
  description_hash text,
  weight float,
  unique (user_id, source, source_ref_id)
);

create table sync_log (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  sync_type text,
  status text,
  items_processed int,
  error_message text,
  ran_at timestamptz default now()
);
```

Dropped vs. the pre-pivot schema:
- `vector` extension, `embeddings` table, `match_chunks` function
- `users.canvas_token_enc`, `users.ai_provider`, `users.ai_key_enc`, `users.ai_model`
- `canvas_files.ai_summary`
- `announcements.ai_summary`

Retained nullable (carry data, no longer written by Task 1's sync):
- `canvas_files.extracted_text`, `canvas_files.file_type`, `canvas_files.week_number`
- `announcements.importance`, `announcements.detected_deadlines`

The `unique` constraints reflect the existing `onConflict` targets used in `lib/sync.ts` upserts (§3 of the spec — the Phase-B BRANCH_REVIEW idempotency work is a different, tighter set).

- [ ] **Step 2: Create `supabase/migrations/0001_init.sql`**

Create the file with the exact same content as `supabase/schema.sql` from Step 1. This is the baseline migration for a fresh DB.

- [ ] **Step 3: Create `supabase/migrations/0002_drop_ai_artifacts.sql`**

Create with:

```sql
-- Idempotent cleanup: drops AI-era artifacts from a pre-pivot Studex DB.
-- Safe to run on a fresh DB (no-op on missing objects).

drop function if exists match_chunks(vector(384), uuid, uuid, int);
drop table if exists embeddings;
drop extension if exists vector;

alter table canvas_files drop column if exists ai_summary;
alter table announcements drop column if exists ai_summary;
alter table users drop column if exists canvas_token_enc;
alter table users drop column if exists ai_provider;
alter table users drop column if exists ai_key_enc;
alter table users drop column if exists ai_model;
```

- [ ] **Step 4: Delete the dead schema files**

```bash
rm supabase/schema_local.sql
rm supabase/schema_v7.sql
rm supabase/schema_voyage.sql
rm supabase/add_live_sync_metadata.sql
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: `Test Files  7 passed (7)  Tests  17 passed (17)`. Tests don't hit real Supabase — SQL file changes are inert to the test suite.

- [ ] **Step 6: Commit**

```bash
git add supabase/schema.sql supabase/migrations/0001_init.sql supabase/migrations/0002_drop_ai_artifacts.sql
git rm supabase/schema_local.sql supabase/schema_v7.sql supabase/schema_voyage.sql supabase/add_live_sync_metadata.sql
git commit -m "$(cat <<'EOF'
chore(db): consolidate schema files and add numbered migrations

Replaces schema_local.sql / schema_v7.sql / schema_voyage.sql /
add_live_sync_metadata.sql with a single canonical supabase/schema.sql
(post-AI baseline) plus supabase/migrations/0001_init.sql and
supabase/migrations/0002_drop_ai_artifacts.sql. Existing DBs apply
0002 to strip AI-era tables, columns, functions, and the pgvector
extension; fresh DBs apply 0001 alone.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Commit the deletion of legacy scripts

**Files:**
- Delete (already gone in working tree): `audit-db.js`, `check-db.js`, `migrate-db.js`, `supabase/migrate.js`

**Rationale:** These files were deleted in a prior working-tree change but never committed. They reference the old AI/embedding pipeline. Commit their removal as part of Phase A hygiene.

- [ ] **Step 1: Confirm deletion status**

Run: `git status --short | grep -E "^ D "`
Expected: lines showing `audit-db.js`, `check-db.js`, `migrate-db.js`, `supabase/migrate.js` (and possibly others). If any of the four are missing, it means they were re-added or committed already — investigate before proceeding.

- [ ] **Step 2: Stage the deletions**

```bash
git add -u audit-db.js check-db.js migrate-db.js supabase/migrate.js
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore: remove legacy db helper scripts

audit-db.js, check-db.js, migrate-db.js, and supabase/migrate.js were
ad-hoc helpers for the AI-era schema. They reference pgvector and
embeddings columns that no longer exist. Supabase migrations now live
under supabase/migrations/.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

**Files:** none (verification only).

**Rationale:** Gate completion of Phase A on a clean full-suite run plus a live smoke test. This task writes nothing — its only job is to certify the phase.

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: `Test Files  7 passed (7)  Tests  17 passed (17)`.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors. Warnings in untouched legacy code are acceptable; any new errors are not.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Grep sweep for stray AI references**

Run: `grep -rnE "anthropic|openai|@huggingface|pdf-parse|crypto-js|ChatPanel|ai_summary|match_chunks|embeddings" app lib tests supabase --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.json"`

Expected: zero matches, or only matches in:
- `supabase/migrations/0002_drop_ai_artifacts.sql` (the cleanup SQL references AI names on purpose)
- `supabase/schema.sql` comments that mention the removal (if any)

Any match outside those exceptions is a bug. Fix and re-run.

- [ ] **Step 6: Start dev server and smoke test**

Run: `npm run dev` in one terminal. Visit `http://localhost:3000`.

Check:
- Page loads with no console errors referencing Anthropic / OpenAI / transformers / pdf-parse.
- No visible chat panel on home.
- Module workspace has no "Chat" tab.
- The "Sync now" button still opens the sync modal and can run a discovery/full sync end-to-end against a live Canvas (if `CANVAS_TOKEN` is set).

Stop the dev server when done.

- [ ] **Step 7: Update memory index if this phase is worth recording**

No new memory entries are required — the pivot itself is captured in the spec and plan files, which live in the repo.

- [ ] **Step 8: Announce completion**

Phase A is complete. Next up: plan for Phase B (extend Canvas coverage: Modules, Pages, Grades + schema rename) will be written as its own document once this phase lands.

---

## Summary of commits produced by this plan

1. `refactor(sync): remove AI enrichment from sync pipeline` (Task 1)
2. `refactor(ui): remove ChatPanel from dashboard and module views` (Task 2)
3. `refactor(lib): drop AI references from dashboard, config, and demo user` (Task 3)
4. `chore: delete AI modules, their tests, and drop chat types` (Task 4)
5. `chore: uninstall AI dependencies` (Task 5)
6. `docs: drop AI env vars and rewrite project description` (Task 6)
7. `chore(db): consolidate schema files and add numbered migrations` (Task 7)
8. `chore: remove legacy db helper scripts` (Task 8)

Task 9 produces no commit — it's verification-only.
