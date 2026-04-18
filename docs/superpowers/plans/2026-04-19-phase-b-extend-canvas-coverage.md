# Phase B — Extend Canvas Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `modules` table to `courses` (clearing the naming clash with Canvas's learning-path "Modules" concept), then extend Canvas API coverage and the sync pipeline to include Grades, Pages, and Canvas learning Modules. Dashboard UI work happens in Phase C — Phase B only writes new resources to Supabase.

**Architecture:** Each of the four new resource types gets its own vertical slice (migration + Canvas fetcher(s) + sync upserts + tests), landing as its own PR. The rename is Task 1 and all subsequent tasks use `courses` / `course_id` exclusively. Page bodies are fetched lazily based on `updated_at` diffing; Canvas Module items are fetched inline when ≤10 items per module with a per-module fallback otherwise.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest + Testing Library, Supabase (Postgres), Tailwind CSS.

**Reference spec:** [docs/superpowers/specs/2026-04-18-better-canvas-pivot-design.md](../specs/2026-04-18-better-canvas-pivot-design.md) §§5-7, 11 (Phase B).

---

## File Structure

**Created:**
- `supabase/migrations/0003_rename_modules_to_courses.sql`
- `supabase/migrations/0004_add_grades.sql`
- `supabase/migrations/0005_add_pages.sql`
- `supabase/migrations/0006_add_learning_modules.sql`
- `tests/lib/canvas.test.ts` — unit tests for new Canvas fetchers (mocked fetch)

**Modified:**
- `supabase/schema.sql` — evolves across tasks to reflect current canonical state
- `lib/canvas.ts` — new types + fetchers (`getAssignmentsWithSubmissions`, `getPages`, `getPage`, `getModules`, `getModuleItems`)
- `lib/sync.ts` — rename cascade + new upsert logic for each resource
- `lib/dashboard.ts` — rename cascade only (`modules` → `courses` in query selects and join aliases). No reads from the new tables yet — that's Phase C.
- `app/api/modules/list/route.ts` — rename cascade (table ref only; URL path stays `/api/modules/list` because "module" is product-facing NUS vocabulary for a course)
- `app/api/modules/toggle-sync/route.ts` — same

**Naming rule used throughout:**
- DB layer: table `courses`, columns `course_id`. Always plural-singular this way.
- Internal TypeScript types in `lib/sync.ts`: `CourseRow`, `upsertCourse`, `processCourseSync`, parameter name `course`.
- External / UI-facing types, API request bodies, URLs: keep `module` / `moduleId` / `selectedModuleIds`. NUS students call courses "modules"; that vocabulary stays.

---

## TDD framing for this phase

Phase B adds new behavior (Canvas fetchers, upserts into new tables). Classical red-green-refactor applies for each Canvas fetcher and for each upsert path.

For the rename (Task 1), TDD doesn't apply — it's a refactor that preserves behavior. Discipline is "tests green before and after." All 17 existing tests must still pass after the rename.

---

## Task 1: Rename `modules` → `courses` and cascade through the codebase

**Files:**
- Create: `supabase/migrations/0003_rename_modules_to_courses.sql`
- Modify: `supabase/schema.sql`
- Modify: `lib/sync.ts` (full rewrite — all `modules`/`module_id` references become `courses`/`course_id`; internal type and function names renamed)
- Modify: `lib/dashboard.ts` (targeted edits — three query-select strings and two query-row type field names)
- Modify: `app/api/modules/list/route.ts` (one-line table rename)
- Modify: `app/api/modules/toggle-sync/route.ts` (one-line table rename)

**Rationale:** The DB rename is the single most-invasive change in Phase B. Doing it first means every later task's new SQL and sync code can simply use `courses` / `course_id` and there's no two-step process. Every test stays green because tests mock DB calls (sync tests mock Supabase; dashboard tests supply fixtures not tied to the DB table name).

- [ ] **Step 1: Confirm baseline is green**

Run: `npm test`
Expected: `Test Files  7 passed (7)  Tests  17 passed (17)`

- [ ] **Step 2: Create `supabase/migrations/0003_rename_modules_to_courses.sql`**

```sql
-- Rename the pre-pivot `modules` table (which stored Canvas courses) to `courses`,
-- clearing the naming clash with Canvas's own "Modules" concept (ordered learning
-- units inside a course). Cascade-renames the `module_id` FK column across the
-- three child tables.
--
-- Idempotent via pg_catalog introspection; safe to re-run.

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'modules') then
    alter table modules rename to courses;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'canvas_files' and column_name = 'module_id') then
    alter table canvas_files rename column module_id to course_id;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'announcements' and column_name = 'module_id') then
    alter table announcements rename column module_id to course_id;
  end if;

  if exists (select 1 from information_schema.columns where table_name = 'tasks' and column_name = 'module_id') then
    alter table tasks rename column module_id to course_id;
  end if;
end $$;
```

- [ ] **Step 3: Update `supabase/schema.sql` to reflect the renamed table and columns**

Replace the entire file with:

```sql
-- Studex canonical schema (Phase B, ongoing).
-- This is the source of truth for the current DB shape.
-- For fresh projects, apply migrations 0001..NNNN in order.

create table users (
  id uuid default gen_random_uuid() primary key,
  email text unique,
  created_at timestamptz default now(),
  last_synced_at timestamptz
);

create table courses (
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
  course_id uuid references courses(id),
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
  course_id uuid references courses(id),
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
  course_id uuid references courses(id),
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

- [ ] **Step 4: Rewrite `lib/sync.ts` with the rename cascade**

Fully replace `lib/sync.ts` with the following. Changes vs. the current file:
- `ModuleRow` type → `CourseRow` (structure unchanged)
- `upsertModule` function → `upsertCourse`
- `processModuleSync` → `processCourseSync`
- `inferModuleCode` → stays (it computes a code like `CS3235` from course metadata — name is not DB-scoped, just an internal concept)
- All `.from("modules")` → `.from("courses")`
- All `module_id:` payload/select/eq usages → `course_id:`
- Local variable `moduleRow` → `courseRow`; `moduleCode` stays (the display code like "CS3235" is a product concept)
- `upsertedModules` → `upsertedCourses`
- `SyncConfig.selectedModuleIds` stays (external contract from UI) but internally that field is treated as a course-id list
- `buildSourceLabel.moduleCode` param stays (product vocabulary)

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
      course_id: params.course.id,
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
    getAssignments(params.course.canvas_course_id).then(
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

  params.counts.modules += 1;
  await params.supabase
    .from("courses")
    .update({ last_canvas_sync: new Date().toISOString() })
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
```

- [ ] **Step 5: Update `lib/dashboard.ts` query selects and query-row types**

Three targeted edits.

**5a. `loadModuleRows` (around line 380):** replace the body:

Old:
```typescript
async function loadModuleRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("modules")
    .select("id, code, title, last_canvas_sync, sync_enabled, canvas_files(id, filename, file_type, uploaded_at, extracted_text, canvas_url)")
    .eq("user_id", userId)
    .order("code", { ascending: true });
}
```

New:
```typescript
async function loadModuleRows(supabase: ReturnType<typeof createServiceClient>, userId: string) {
  return supabase
    .from("courses")
    .select("id, code, title, last_canvas_sync, sync_enabled, canvas_files(id, filename, file_type, uploaded_at, extracted_text, canvas_url)")
    .eq("user_id", userId)
    .order("code", { ascending: true });
}
```

**5b. `loadAnnouncementRows` select string (around line 390):** change `modules(code)` to `courses(code)`:

Old: `.select("id, title, body_raw, posted_at, importance, modules(code)")`
New: `.select("id, title, body_raw, posted_at, importance, courses(code)")`

**5c. tasks query inside `loadDashboardData` (around line 478):** change `modules(code)` to `courses(code)`:

Old: `.select("id, title, due_at, source, modules(code)")`
New: `.select("id, title, due_at, source, courses(code)")`

**5d. Update the related query-row types** so the join key matches the new select:

Locate `TaskQueryRow` (around line 128-134) and change the `modules` field to `courses`:

Old:
```typescript
type TaskQueryRow = {
  id: string;
  title: string | null;
  due_at: string | null;
  source: string | null;
  modules: RelationRecord | RelationRecord[] | null;
};
```

New:
```typescript
type TaskQueryRow = {
  id: string;
  title: string | null;
  due_at: string | null;
  source: string | null;
  courses: RelationRecord | RelationRecord[] | null;
};
```

Locate `AnnouncementQueryRow` (around line 136-143) and change the `modules` field to `courses`:

Old:
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

New:
```typescript
type AnnouncementQueryRow = {
  id: string;
  title: string | null;
  body_raw: string | null;
  posted_at: string | null;
  importance: string | null;
  courses: RelationRecord | RelationRecord[] | null;
};
```

**5e. Update `getRelatedModuleCode` callers that read the `modules` field:**

Search the file for `task.modules` and `announcement.modules` references. There should be exactly two call sites (one each for tasks, announcements). Replace both `task.modules` → `task.courses` and `announcement.modules` → `announcement.courses`.

Run: `grep -n "\.modules" lib/dashboard.ts`
Expected: only matches inside comments or unrelated contexts. If any `task.modules` or `announcement.modules` remains, fix.

- [ ] **Step 6: Update `app/api/modules/list/route.ts`**

One-line table rename:

Old: `.from("modules")`
New: `.from("courses")`

- [ ] **Step 7: Update `app/api/modules/toggle-sync/route.ts`**

One-line table rename:

Old: `.from("modules")`
New: `.from("courses")`

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: `Test Files  7 passed (7)  Tests  17 passed (17)`. Tests mock Supabase, so the table rename is invisible to the suite.

- [ ] **Step 9: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/**` or `lib/**`. Pre-existing vitest-globals noise in `tests/**` is acceptable.

- [ ] **Step 10: Grep sweep for leftover references**

Run: `grep -rnE "\.from\(.modules.\)|module_id|modules\(code\)" app lib supabase --include="*.ts" --include="*.tsx" --include="*.sql" | grep -v "supabase/migrations/"`
Expected: zero matches outside migration files (migrations 0001, 0003 intentionally reference the old names).

- [ ] **Step 11: Commit**

```bash
git add supabase/migrations/0003_rename_modules_to_courses.sql supabase/schema.sql lib/sync.ts lib/dashboard.ts app/api/modules/list/route.ts app/api/modules/toggle-sync/route.ts
git commit -m "$(cat <<'EOF'
refactor(db): rename modules table to courses

Phase B rename clears the naming clash between the Studex table name
(which stored Canvas courses) and Canvas's own "Modules" concept
(ordered learning units within a course). Cascade-renames the
module_id FK columns on canvas_files, announcements, and tasks to
course_id. lib/sync.ts, lib/dashboard.ts, and both /api/modules
routes are updated to use the new names. Internal TS types that
bind to DB shape (CourseRow, upsertCourse, processCourseSync) are
renamed for clarity; UI-facing names (ModuleSummary, selectedModuleIds,
URL paths) keep NUS "module" vocabulary.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add `grades` table, `getAssignmentsWithSubmissions` fetcher, and grade upsert

**Files:**
- Create: `supabase/migrations/0004_add_grades.sql`
- Modify: `supabase/schema.sql`
- Modify: `lib/canvas.ts`
- Modify: `lib/sync.ts`
- Create: `tests/lib/canvas.test.ts` (first file — establishes the pattern for Canvas fetcher tests)

**Rationale:** Grades ride on assignments via `?include[]=submission`. One Canvas call, two Supabase upserts. Submissions-included responses are a drop-in replacement for the existing assignments call, which simplifies the migration.

- [ ] **Step 1: Write the failing unit test for `getAssignmentsWithSubmissions`**

Create `tests/lib/canvas.test.ts`:

```typescript
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { getAssignmentsWithSubmissions } from "@/lib/canvas";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubEnv("CANVAS_TOKEN", "test-token");
  vi.stubEnv("CANVAS_BASE_URL", "https://canvas.test");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("getAssignmentsWithSubmissions", () => {
  it("fetches /courses/:id/assignments with include[]=submission and returns the parsed array", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        {
          id: 42,
          name: "Assignment 1",
          due_at: "2026-05-01T00:00:00Z",
          submission: {
            id: 999,
            score: 85,
            grade: "85",
            submitted_at: "2026-04-30T22:00:00Z",
            graded_at: "2026-05-02T09:00:00Z",
            workflow_state: "graded",
          },
        },
      ]);
    }) as unknown as typeof fetch;

    const result = await getAssignmentsWithSubmissions(7);

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("/api/v1/courses/7/assignments");
    expect(capturedCalls[0]).toContain("include%5B%5D=submission");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42);
    expect(result[0].submission?.score).toBe(85);
    expect(result[0].submission?.workflow_state).toBe("graded");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run tests/lib/canvas.test.ts`
Expected: FAIL with a "getAssignmentsWithSubmissions is not exported" or similar error.

- [ ] **Step 3: Add `CanvasSubmission` type and `getAssignmentsWithSubmissions` to `lib/canvas.ts`**

Add near the existing `CanvasAssignment` interface (around line 62):

```typescript
export interface CanvasSubmission {
  id: number;
  score?: number | null;
  grade?: string | null;
  submitted_at?: string | null;
  graded_at?: string | null;
  workflow_state?: string | null;
  missing?: boolean;
  late?: boolean;
  excused?: boolean;
  points_deducted?: number | null;
}

export interface CanvasAssignmentWithSubmission extends CanvasAssignment {
  submission?: CanvasSubmission | null;
}
```

Add the fetcher after the existing `getAssignments` function (around line 287):

```typescript
export async function getAssignmentsWithSubmissions(
  courseId: number | string,
): Promise<CanvasAssignmentWithSubmission[]> {
  return paginate<CanvasAssignmentWithSubmission>(`/courses/${courseId}/assignments`, {
    order_by: "due_at",
    "include[]": "submission",
  });
}
```

Note on the query key: `include[]` is intentionally double-bracketed per Canvas API convention. The existing `buildApiUrl` helper uses `url.searchParams.set(key, String(value))`, which URL-encodes `[` and `]` as `%5B` and `%5D`. This matches what Canvas expects — the test asserts `include%5B%5D=submission` in the URL.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run tests/lib/canvas.test.ts`
Expected: PASS, 1 test.

- [ ] **Step 5: Create `supabase/migrations/0004_add_grades.sql`**

```sql
-- Phase B: add the grades table. One row per (user, assignment) submission.
-- Populated from Canvas's ?include[]=submission field alongside assignment
-- upserts in the sync pipeline.

create table if not exists grades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  assignment_id uuid references tasks(id),
  score numeric,
  grade_text text,
  points_possible numeric,
  submitted_at timestamptz,
  graded_at timestamptz,
  state text,
  unique (user_id, assignment_id)
);
```

- [ ] **Step 6: Update `supabase/schema.sql` to include the grades table**

Append to the end of `supabase/schema.sql`, after the `sync_log` block:

```sql

create table grades (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  assignment_id uuid references tasks(id),
  score numeric,
  grade_text text,
  points_possible numeric,
  submitted_at timestamptz,
  graded_at timestamptz,
  state text,
  unique (user_id, assignment_id)
);
```

- [ ] **Step 7: Extend `lib/sync.ts` to upsert grades alongside assignments**

Two changes:

**7a. Swap the import** at the top of the file. Change this line:
```typescript
  getAssignments,
```
to:
```typescript
  getAssignmentsWithSubmissions,
```

**7b. Update `syncAssignment`** to (a) accept the wider type, (b) return the upserted task id, and (c) upsert the grades row inline when a submission is present. Replace the entire function:

```typescript
async function syncAssignment(params: {
  supabase: SupabaseClient;
  userId: string;
  course: CourseRow;
  assignment: CanvasAssignmentWithSubmission;
  existing: TaskRow | undefined;
}) {
  const descriptionText = sanitizeSyncText(stripHtml(params.assignment.description ?? ""));
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
```

**7c. Update the call site in `processCourseSync`** to use the new fetcher. Change this line:
```typescript
    getAssignments(params.course.canvas_course_id).then(
```
to:
```typescript
    getAssignmentsWithSubmissions(params.course.canvas_course_id).then(
```

**7d. Update the import of `CanvasAssignment` type** (top of sync.ts) to reference the new type:

Old:
```typescript
  type CanvasAssignment,
```

New:
```typescript
  type CanvasAssignmentWithSubmission,
```

And update the parameter type in `syncAssignment` (already done in 7b) — no further edits needed.

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: `Test Files  8 passed (8)  Tests  18 passed (18)` (one new file, one new test).

- [ ] **Step 9: Type check and grep sweep**

Run: `npx tsc --noEmit` — no new errors in `app/**` or `lib/**`.
Run: `grep -n "getAssignments\b" lib/sync.ts` — zero matches (only `getAssignmentsWithSubmissions` should remain).

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/0004_add_grades.sql supabase/schema.sql lib/canvas.ts lib/sync.ts tests/lib/canvas.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): sync Canvas submissions into a grades table

Adds a grades table with one row per (user, assignment) and extends
the sync pipeline to populate it via include[]=submission on the
assignments fetch. getAssignmentsWithSubmissions replaces getAssignments
in the sync hot path; tests/lib/canvas.test.ts establishes the mocked-
fetch pattern for Canvas unit tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add `canvas_pages` table, `getPages` + `getPage` fetchers, and lazy-body sync

**Files:**
- Create: `supabase/migrations/0005_add_pages.sql`
- Modify: `supabase/schema.sql`
- Modify: `lib/canvas.ts`
- Modify: `lib/sync.ts`
- Modify: `tests/lib/canvas.test.ts`

**Rationale:** Pages are the single biggest freshness trap — bodies can be large and many pages never change between syncs. Lazy body fetching (only re-fetch when `canvas.updated_at > cached.updated_at`) keeps steady-state sync cheap.

- [ ] **Step 1: Write failing unit tests for `getPages` and `getPage`**

Append to `tests/lib/canvas.test.ts`:

```typescript
import { getPages, getPage } from "@/lib/canvas";

describe("getPages", () => {
  it("fetches /courses/:id/pages (list only, no body)", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        { page_id: 1, url: "syllabus", title: "Syllabus", updated_at: "2026-03-01T00:00:00Z", published: true, front_page: true },
        { page_id: 2, url: "project-brief", title: "Project Brief", updated_at: "2026-04-10T00:00:00Z", published: true, front_page: false },
      ]);
    }) as unknown as typeof fetch;

    const result = await getPages(11);

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("/api/v1/courses/11/pages");
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("syllabus");
    expect(result[0].front_page).toBe(true);
  });
});

describe("getPage", () => {
  it("fetches /courses/:id/pages/:url and returns the full page including body", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        page_id: 1,
        url: "syllabus",
        title: "Syllabus",
        body: "<p>Welcome to CS3235.</p>",
        updated_at: "2026-03-01T00:00:00Z",
        published: true,
        front_page: true,
      }),
    ) as unknown as typeof fetch;

    const result = await getPage(11, "syllabus");

    expect(result).not.toBeNull();
    expect(result?.body).toContain("CS3235");
    expect(result?.url).toBe("syllabus");
  });
});
```

- [ ] **Step 2: Run the new tests and confirm they fail**

Run: `npx vitest run tests/lib/canvas.test.ts`
Expected: two new FAILures ("getPages/getPage is not exported").

- [ ] **Step 3: Add page types and fetchers to `lib/canvas.ts`**

Append after `downloadCanvasFile` (end of file):

```typescript
export interface CanvasPage {
  page_id: number;
  url: string;
  title: string;
  updated_at?: string | null;
  published?: boolean;
  front_page?: boolean;
}

export interface CanvasPageWithBody extends CanvasPage {
  body?: string | null;
}

export async function getPages(courseId: number | string): Promise<CanvasPage[]> {
  return paginate<CanvasPage>(`/courses/${courseId}/pages`, {
    sort: "updated_at",
    order: "desc",
    published: "true",
  });
}

export async function getPage(
  courseId: number | string,
  pageUrl: string,
): Promise<CanvasPageWithBody | null> {
  const response = await requestJson<CanvasPageWithBody>(
    buildApiUrl(`/courses/${courseId}/pages/${encodeURIComponent(pageUrl)}`),
    { allowNotFound: true },
  );
  return response.data ?? null;
}
```

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/lib/canvas.test.ts`
Expected: 3 tests passing (the original assignments test plus two new).

- [ ] **Step 5: Create `supabase/migrations/0005_add_pages.sql`**

```sql
-- Phase B: add the canvas_pages table. Stores Canvas wiki-style pages.
-- Metadata is populated first during sync; body is fetched lazily only when
-- Canvas's updated_at is newer than the cached copy.

create table if not exists canvas_pages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_id uuid references courses(id),
  page_url text,
  title text,
  body_html text,
  updated_at timestamptz,
  published bool default true,
  front_page bool default false,
  unique (course_id, page_url)
);
```

- [ ] **Step 6: Update `supabase/schema.sql` to include `canvas_pages`**

Append after the `grades` block:

```sql

create table canvas_pages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_id uuid references courses(id),
  page_url text,
  title text,
  body_html text,
  updated_at timestamptz,
  published bool default true,
  front_page bool default false,
  unique (course_id, page_url)
);
```

- [ ] **Step 7: Add page sync logic to `lib/sync.ts`**

**7a. Add to the imports** from `@/lib/canvas`:

Old:
```typescript
  getAssignmentsWithSubmissions,
  getCourses,
  getFiles,
  getFileDownloadUrl,
```

New:
```typescript
  getAssignmentsWithSubmissions,
  getCourses,
  getFiles,
  getFileDownloadUrl,
  getPage,
  getPages,
  type CanvasPage,
```

**7b. Add a new helper above `processCourseSync`** (after `syncFile`):

```typescript
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
```

**7c. Call `syncPages` from `processCourseSync`** after the file-sync block, just before the final `params.counts.modules += 1;`.

Pages are cheap in steady state (metadata batch upsert + body fetches only for pages whose `updated_at` moved) and independent of file downloads, so the call sits OUTSIDE the `if (params.syncFiles)` gate. The structure becomes:

```typescript
  if (params.syncFiles) {
    for (const file of files) {
      // ... existing file sync loop ...
    }
  }

  await syncPages({
    supabase: params.supabase,
    userId: params.userId,
    course: params.course,
    send: params.send,
    counts: params.counts,
  });

  params.counts.modules += 1;
```

- [ ] **Step 8: Run tests**

Run: `npm test`
Expected: `Test Files  8 passed (8)  Tests  20 passed (20)` (two new page tests).

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0005_add_pages.sql supabase/schema.sql lib/canvas.ts lib/sync.ts tests/lib/canvas.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): sync Canvas wiki pages with lazy body fetching

Adds the canvas_pages table and two Canvas fetchers (getPages for the
list, getPage for a single page's body). Sync upserts page metadata
for every page in one batch, then fetches body_html only for pages
whose Canvas updated_at is newer than the cached copy, with a
concurrency cap of 5.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add `course_modules` + `course_module_items`, `getModules` + `getModuleItems`, and sync

**Files:**
- Create: `supabase/migrations/0006_add_learning_modules.sql`
- Modify: `supabase/schema.sql`
- Modify: `lib/canvas.ts`
- Modify: `lib/sync.ts`
- Modify: `tests/lib/canvas.test.ts`

**Rationale:** Canvas "Modules" (learning paths inside a course) are the single most-used tab in NUS Canvas. Items are inline when there are ≤10 per module; for larger modules, a per-module fallback call is required.

- [ ] **Step 1: Write failing tests for `getModules` and `getModuleItems`**

Append to `tests/lib/canvas.test.ts`:

```typescript
import { getModules, getModuleItems } from "@/lib/canvas";

describe("getModules", () => {
  it("requests /courses/:id/modules with include=items and include=content_details", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        {
          id: 101,
          name: "Week 1",
          position: 1,
          unlock_at: null,
          state: "unlocked",
          items_count: 3,
          items: [
            { id: 201, title: "Lecture 1 Slides", type: "File", position: 1, indent: 0, content_id: 301 },
            { id: 202, title: "Week 1 Reading", type: "Page", position: 2, indent: 0, page_url: "week-1-reading" },
            { id: 203, title: "External link", type: "ExternalUrl", position: 3, indent: 0, external_url: "https://example.com" },
          ],
        },
      ]);
    }) as unknown as typeof fetch;

    const result = await getModules(12);

    expect(capturedCalls[0]).toContain("/api/v1/courses/12/modules");
    expect(capturedCalls[0]).toContain("include%5B%5D=items");
    expect(capturedCalls[0]).toContain("include%5B%5D=content_details");
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items?.[0].type).toBe("File");
  });
});

describe("getModuleItems", () => {
  it("fetches items for a single module when the inline list was truncated", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        { id: 210, title: "Item A", type: "File", position: 1, indent: 0, content_id: 301 },
        { id: 211, title: "Item B", type: "Assignment", position: 2, indent: 0, content_id: 401 },
      ]);
    }) as unknown as typeof fetch;

    const result = await getModuleItems(12, 101);

    expect(capturedCalls[0]).toContain("/api/v1/courses/12/modules/101/items");
    expect(capturedCalls[0]).toContain("include%5B%5D=content_details");
    expect(result).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run tests/lib/canvas.test.ts`
Expected: two new FAILures.

- [ ] **Step 3: Add types and fetchers to `lib/canvas.ts`**

Append at the end of the file:

```typescript
export type CanvasModuleItemType =
  | "File"
  | "Page"
  | "Assignment"
  | "Quiz"
  | "Discussion"
  | "ExternalUrl"
  | "ExternalTool"
  | "SubHeader";

export interface CanvasModuleItem {
  id: number;
  title: string;
  type: CanvasModuleItemType | string;
  position: number;
  indent: number;
  content_id?: number | null;
  page_url?: string | null;
  external_url?: string | null;
  completion_requirement?: {
    type?: string;
    completed?: boolean;
  } | null;
}

export interface CanvasModule {
  id: number;
  name: string;
  position: number;
  unlock_at?: string | null;
  state?: string | null;
  items_count?: number;
  items?: CanvasModuleItem[];
}

export async function getModules(courseId: number | string): Promise<CanvasModule[]> {
  return paginate<CanvasModule>(`/courses/${courseId}/modules`, {
    "include[]": "items",
    // Note: buildApiUrl's searchParams.set overwrites on duplicate keys, so for
    // two include[] values we chain by using a second key that's identical but
    // relies on Canvas accepting repeated include[]=... from the URL. Since set
    // overwrites, we append a second include[] manually through the query
    // parameter merging — the helper below handles both values.
  });
}
```

**Hmm — wait.** `buildApiUrl` uses `url.searchParams.set(key, String(value))` which *overwrites* on duplicate keys. To pass two `include[]=...` values, we cannot just add two entries to the `query` object with the same key. The existing `paginate` signature accepts `Record<string, string | number | boolean | null | undefined>` which doesn't allow arrays. We need to either (a) extend `paginate` to support arrays, or (b) build the URL manually.

Option (b) is simpler and localised. Revise the implementation as follows — replace the `getModules` stub with:

```typescript
export async function getModules(courseId: number | string): Promise<CanvasModule[]> {
  const baseUrl = buildApiUrl(`/courses/${courseId}/modules`, {
    per_page: DEFAULT_PER_PAGE,
  });
  baseUrl.searchParams.append("include[]", "items");
  baseUrl.searchParams.append("include[]", "content_details");

  const items: CanvasModule[] = [];
  let nextUrl: string | null = baseUrl.toString();
  while (nextUrl) {
    const response = await requestJson<CanvasModule[]>(nextUrl);
    if (response.data) items.push(...response.data);
    nextUrl = parseNextLink(response.headers.get("Link"));
  }
  return items;
}

export async function getModuleItems(
  courseId: number | string,
  moduleId: number | string,
): Promise<CanvasModuleItem[]> {
  const baseUrl = buildApiUrl(`/courses/${courseId}/modules/${moduleId}/items`, {
    per_page: DEFAULT_PER_PAGE,
  });
  baseUrl.searchParams.append("include[]", "content_details");

  const items: CanvasModuleItem[] = [];
  let nextUrl: string | null = baseUrl.toString();
  while (nextUrl) {
    const response = await requestJson<CanvasModuleItem[]>(nextUrl);
    if (response.data) items.push(...response.data);
    nextUrl = parseNextLink(response.headers.get("Link"));
  }
  return items;
}
```

This uses `searchParams.append` (instead of `set`) to emit `include[]=items&include[]=content_details` correctly. It also duplicates the pagination loop from `paginate` — acceptable scope cost to avoid modifying the shared helper.

- [ ] **Step 4: Run tests and confirm they pass**

Run: `npx vitest run tests/lib/canvas.test.ts`
Expected: 5 tests passing.

- [ ] **Step 5: Create `supabase/migrations/0006_add_learning_modules.sql`**

```sql
-- Phase B: add Canvas "Modules" (ordered learning units within a course) and
-- their items. Canvas's Modules tab is the single most-used tab in NUS Canvas.

create table if not exists course_modules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_id uuid references courses(id),
  canvas_module_id text,
  name text,
  position int,
  unlock_at timestamptz,
  state text,
  items_count int,
  unique (course_id, canvas_module_id)
);

create table if not exists course_module_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_module_id uuid references course_modules(id),
  canvas_item_id text,
  title text,
  item_type text,
  position int,
  indent int,
  content_ref text,
  external_url text,
  unique (course_module_id, canvas_item_id)
);
```

- [ ] **Step 6: Update `supabase/schema.sql`**

Append after the `canvas_pages` block:

```sql

create table course_modules (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_id uuid references courses(id),
  canvas_module_id text,
  name text,
  position int,
  unlock_at timestamptz,
  state text,
  items_count int,
  unique (course_id, canvas_module_id)
);

create table course_module_items (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references users(id),
  course_module_id uuid references course_modules(id),
  canvas_item_id text,
  title text,
  item_type text,
  position int,
  indent int,
  content_ref text,
  external_url text,
  unique (course_module_id, canvas_item_id)
);
```

- [ ] **Step 7: Add learning-module sync to `lib/sync.ts`**

**7a. Extend the `@/lib/canvas` imports** to bring in the new functions and types:

Add to the import block:
```typescript
  getModules,
  getModuleItems,
  type CanvasModule,
  type CanvasModuleItem,
```

**7b. Add a helper to derive `content_ref` from an item:**

Insert above `syncPages`:

```typescript
function resolveContentRef(item: CanvasModuleItem): string | null {
  if (item.content_id) return String(item.content_id);
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
  for (const module of canvasModules) {
    const { data: moduleData, error: moduleError } = await params.supabase
      .from("course_modules")
      .upsert(
        {
          user_id: params.userId,
          course_id: params.course.id,
          canvas_module_id: String(module.id),
          name: module.name,
          position: module.position,
          unlock_at: module.unlock_at ?? null,
          state: module.state ?? null,
          items_count: module.items_count ?? null,
        },
        { onConflict: "course_id, canvas_module_id" },
      )
      .select("id")
      .single<{ id: string }>();

    if (moduleError || !moduleData) {
      console.error(`Failed to upsert course module ${module.id} in ${moduleCode}:`, moduleError);
      continue;
    }

    // Decide whether to trust the inline items or fetch via getModuleItems.
    let items = module.items ?? [];
    const expected = module.items_count ?? items.length;
    if (items.length < expected) {
      try {
        items = await getModuleItems(params.course.canvas_course_id, module.id);
      } catch (error) {
        console.error(`Failed to fetch items for module ${module.id} in ${moduleCode}:`, error);
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
      console.error(`Failed to upsert module items for ${module.id} in ${moduleCode}:`, itemsError);
    }
  }
}
```

**7c. Call `syncCourseModules` from `processCourseSync`** right after `syncPages(...)` and before `params.counts.modules += 1;`:

```typescript
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
```

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: `Test Files  8 passed (8)  Tests  22 passed (22)`.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/0006_add_learning_modules.sql supabase/schema.sql lib/canvas.ts lib/sync.ts tests/lib/canvas.test.ts
git commit -m "$(cat <<'EOF'
feat(sync): sync Canvas learning modules and their items

Adds the course_modules and course_module_items tables. getModules
uses include[]=items&include[]=content_details to pull item metadata
inline for the common ≤10-item case; syncCourseModules falls back to
getModuleItems when Canvas reports more items than it returned
inline. Items are stored with a canonical content_ref that Phase C's
Modules tab UI will resolve against canvas_files / tasks / canvas_pages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: `Test Files  8 passed (8)  Tests  22 passed (22)` (17 from Phase A + 5 added in Phase B: 1 for grades, 2 for pages, 2 for learning modules).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no errors in `app/**` or `lib/**`. Pre-existing vitest-globals noise in `tests/**` is acceptable.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Grep sweep for leftover rename debris**

Run: `grep -rnE "\.from\(.modules.\)|module_id|modules\(code\)" app lib supabase tests --include="*.ts" --include="*.tsx" --include="*.sql" | grep -v "supabase/migrations/"`

Expected: zero matches outside the migrations folder. Matches in `supabase/migrations/0001_init.sql` and `supabase/migrations/0003_rename_modules_to_courses.sql` are the frozen history and the rename migration itself — they are supposed to reference the old names.

- [ ] **Step 6: Manual DB verification against real Canvas**

With `.env.local` configured (Canvas token + Supabase):
1. Apply migrations `0003..0006` to the Supabase project in order.
2. Run `npm run dev` and trigger a sync through the UI (`Sync now`).
3. Use Supabase SQL editor to spot-check:
   - `select count(*) from grades where user_id = (select id from users limit 1);` — should be > 0 for any course with graded submissions.
   - `select count(*) from canvas_pages where user_id = (select id from users limit 1);` — should equal Canvas's published pages count for the synced courses.
   - `select count(*) from course_modules;` and `select count(*) from course_module_items;` — should match Canvas's Modules tab for one representative course.
4. Re-run the sync a second time. Verify the same counts (idempotency — no duplicates).

- [ ] **Step 7: Announce completion**

Phase B is complete. Next up: Phase C (home widget dashboard reading from the new tables).

---

## Summary of commits produced by this plan

1. `refactor(db): rename modules table to courses` (Task 1)
2. `feat(sync): sync Canvas submissions into a grades table` (Task 2)
3. `feat(sync): sync Canvas wiki pages with lazy body fetching` (Task 3)
4. `feat(sync): sync Canvas learning modules and their items` (Task 4)

Task 5 produces no commit — it's verification-only.

---

## Known gotchas / risks

| Risk | Mitigation |
|---|---|
| Migration 0003 runs but application code still uses `modules` briefly — e.g. a long-lived dev server | Deploy migration + code together. If caught mid-deploy, `npm run dev` will error on the first query; fix by running the migration. |
| `searchParams.set` in `buildApiUrl` can't emit duplicate `include[]=` keys | Tasks 3 & 4 bypass `paginate()` helpers for fetchers that need multiple `include[]` values — they append to `searchParams` manually. Scope cost accepted. |
| Pages on a course with hundreds of rarely-updated pages | Task 3 uses `updated_at` diffing; first sync is expensive, subsequent syncs only fetch bodies for changed pages. |
| Large modules (>10 items) require a fallback per-module fetch | Task 4 detects `items_count > items.length` and triggers `getModuleItems` for that case. |
| Module item `content_ref` doesn't resolve in Phase B (no UI reads it yet) | Phase C's Modules tab will resolve `content_ref` against `canvas_files` / `tasks` / `canvas_pages`; if unresolved, falls back to "Open in Canvas" link. |
| `app/api/modules/list` URL path still says "modules" but queries `courses` | Intentional — URL is UI-facing product vocabulary (NUS students call courses "modules"); the DB layer rename is internal. |
