# Studex — "Better Canvas" Pivot Design

**Date:** 2026-04-18
**Status:** Approved design, ready for implementation planning
**Author:** Aiden Ma (with Claude)

## 1. Context & motivation

Studex started as an AI-forward academic dashboard for NUS students (Canvas + RAG + summaries). The current codebase wires together Canvas sync, local embeddings (`Xenova/all-MiniLM-L6-v2`), an Anthropic chat endpoint, and a partially mocked dashboard UI.

The pivot: **Studex becomes a clean, fast over-skin of Canvas first.** AI is removed. The product promise becomes "open Studex, see everything across all your courses instantly, never need to open Canvas itself."

AI can be re-added later as a separate, additive phase from git history — it is not lost, just out of scope for this pivot.

## 2. Hero value & non-goals

**Hero:** Speed + unification. One fast page showing everything across all modules — deadlines, announcements, new files, current learning-path progress, recent grades.

**Non-goals for this pivot:**

- AI chat, RAG, embeddings, announcement summaries, deadline extraction.
- Multi-user auth, onboarding, token encryption (deferred to Phase-2).
- Live Canvas calls on page load (we serve from Supabase cache).
- Panopto / video embed sophistication beyond a deep-link fallback.
- NUSMods integration is out of scope for this pivot (lib remains untouched).

## 3. Finalised decisions

| Decision | Choice |
|---|---|
| Product hero | Speed + unification |
| Asset coverage | Courses, Files, Announcements, Assignments, Canvas Modules (learning path), Pages, Grades |
| Freshness model | Supabase cache + 15-min Vercel cron + manual "Sync now" |
| AI scope | Removed entirely in Phase A |
| User model | Single-user (env-var token) with `user_id`-scoped queries for Phase-2 readiness |
| Home layout | Widget dashboard |
| Navigation | Per-course pages + in-app file preview via `file-preview-dialog` |
| Migration strategy | Phased strangler — 4 shippable PRs |
| `modules` table rename | Rename to `courses` to resolve clash with Canvas's "Modules" |

## 4. Architecture

### Data flow

```
Canvas API ──► lib/canvas.ts (extended: modules, pages, grades)
                      │
                      ▼
             app/api/sync/route.ts (simplified, no AI)
                      │
                      ▼
             Supabase tables (courses, canvas_files, announcements,
                              tasks, grades, course_modules,
                              course_module_items, canvas_pages)
                      │
        ┌─────────────┴─────────────┐
        ▼                           ▼
  app/page.tsx              app/courses/[id]/page.tsx
  (widget dashboard)         (per-course deep-dive)
        │                           │
        ▼                           ▼
  lib/dashboard.ts           lib/course.ts (new)
```

### Invariants

- **Reads are one Postgres round-trip.** No page fetches Canvas directly.
- **Writes are sync-only.** Only `app/api/sync/route.ts` mutates Canvas-mirrored tables.
- **Every query scopes by `user_id`** even with one user today.
- **No AI module imported anywhere.** Not flagged, not lazy — absent.
- **Sync is idempotent.** DB-level unique constraints + upsert make re-sync safe under concurrency.

## 5. Data model

### Naming: rename `modules` → `courses`

The existing `modules` table stores Canvas courses. Canvas itself calls ordered learning units within a course "Modules." To prevent permanent confusion, rename in Phase B as part of `0002_rename_modules_to_courses.sql`. One-shot migration + codebase find-and-replace (`module_id` FKs → `course_id`).

### New tables (post-rename)

```sql
-- Ordered learning units within a course ("Modules" tab in Canvas)
course_modules (
  id uuid pk,
  user_id uuid,
  course_id uuid fk courses,
  canvas_module_id text,
  name text,
  position int,
  unlock_at timestamptz,
  state text,                  -- 'locked' | 'unlocked' | 'completed'
  items_count int,
  UNIQUE(course_id, canvas_module_id)
);

course_module_items (
  id uuid pk,
  user_id uuid,
  course_module_id uuid fk course_modules,
  canvas_item_id text,
  title text,
  item_type text,              -- 'File' | 'Page' | 'Assignment' | 'Quiz' | 'ExternalUrl' | 'SubHeader'
  position int,
  indent int,
  content_ref text,            -- canvas id or slug of the linked resource
  external_url text,
  UNIQUE(course_module_id, canvas_item_id)
);

canvas_pages (
  id uuid pk,
  user_id uuid,
  course_id uuid fk courses,
  page_url text,               -- Canvas slug, stable identifier
  title text,
  body_html text,
  updated_at timestamptz,
  published bool,
  front_page bool,
  UNIQUE(course_id, page_url)
);

grades (
  id uuid pk,
  user_id uuid,
  assignment_id uuid fk tasks,
  score numeric,
  grade_text text,
  points_possible numeric,
  submitted_at timestamptz,
  graded_at timestamptz,
  state text,                  -- 'submitted' | 'graded' | 'missing' | 'unsubmitted'
  UNIQUE(user_id, assignment_id)
);
```

### Unique constraints on existing tables (BRANCH_REVIEW #3)

```sql
ALTER TABLE announcements ADD UNIQUE (course_id, canvas_announcement_id);
ALTER TABLE tasks         ADD UNIQUE (course_id, source, source_ref_id);
ALTER TABLE canvas_files  ADD UNIQUE (course_id, canvas_file_id);
```

### Dropped

- `embeddings` table
- `match_chunks()` SQL function
- `canvas_files.ai_summary` column (AI-specific)

### Kept (useful for sync change detection)

- `canvas_files.content_hash`, `canvas_files.source_updated_at`
- `announcements.content_hash`, `announcements.source_updated_at`
- `tasks.description_hash`

These columns already exist via `add_live_sync_metadata.sql` and support idempotent sync / change detection (analogous to the `updated_at`-based page-body logic in §7). They stay in `0001_init.sql`.

### Schema-file consolidation

Replace the sprawl (`schema.sql`, `schema_local.sql`, `schema_v7.sql`, `schema_voyage.sql`) with a single canonical `supabase/schema.sql` plus numbered migrations:

- `supabase/migrations/0001_init.sql` — baseline after Phase A
- `supabase/migrations/0002_rename_modules_to_courses.sql` — Phase B
- `supabase/migrations/0003_add_learning_modules.sql` — Phase B
- `supabase/migrations/0004_add_pages_and_grades.sql` — Phase B
- `supabase/migrations/0005_unique_constraints.sql` — Phase B

## 6. Canvas API coverage extensions

New functions in `lib/canvas.ts`:

```ts
getModules(courseId): CanvasModule[]
  // GET /api/v1/courses/:id/modules?include[]=items&include[]=content_details
  // Inline items when ≤10 per module; fall back to getModuleItems otherwise.

getModuleItems(courseId, moduleId): CanvasModuleItem[]
  // GET /api/v1/courses/:id/modules/:mid/items?include[]=content_details

getPages(courseId): CanvasPage[]    // list only, no body
  // GET /api/v1/courses/:id/pages

getPage(courseId, pageUrl): CanvasPageWithBody
  // GET /api/v1/courses/:id/pages/:url

getAssignmentsWithSubmissions(courseId): CanvasAssignmentWithSubmission[]
  // GET /api/v1/courses/:id/assignments?include[]=submission
  // Replaces getAssignments. Piggybacks submission/grade in one call.
```

Design choices:

- Submissions ride on assignments — one call, two upsert targets, no race.
- Module items inline for common case (≤10 items); per-module fallback for larger modules.
- Page bodies fetched only when `canvas.updated_at > cached.updated_at` — avoids re-downloading unchanged pages every 15 min.
- All new calls reuse the existing `paginate()`, retry, and timeout machinery.

## 7. Sync pipeline

```
Sync start
  ├─ Fetch courses ───────────────────────────────► upsert courses
  └─ For each course (sequential per Canvas token):
       ├─ getFiles           ──► upsert canvas_files
       ├─ getAnnouncements   ──► upsert announcements
       ├─ getAssignmentsWithSubmissions
       │                     ──► upsert tasks
       │                     ──► upsert grades       (one call, two tables)
       ├─ getModules         ──► upsert course_modules
       │                     ──► upsert course_module_items (inline or per-module)
       └─ getPages           ──► upsert canvas_pages (metadata)
             └─ For pages where canvas.updated_at > cached.updated_at:
                  getPage    ──► update body_html
Sync end
  └─ INSERT sync_log row per course with status + counts
```

Properties:

- Upserts everywhere (`INSERT … ON CONFLICT DO UPDATE`), no app-layer "check then insert."
- Per-course error isolation: a failing course logs `status='error'`, other courses still sync.
- Sequential per user token (Canvas rate-limits per token).
- Bounded parallelism within a course (cap ~5) for page bodies and large-module item fetches via a small helper in `lib/sync.ts`.
- No AI path — `lib/embed.ts` and `lib/ai.ts` are deleted in Phase A, not disabled.

Sync route remains `POST /api/sync`. Manual trigger via existing Sync button. Vercel cron posts on the existing 15-min schedule in Phase-2.

## 8. UI components

### Home page `/`

```
app/page.tsx (server component)
  └─ loadDashboardData()          ──► single Postgres round-trip
  └─ <DashboardClient data>
       ├─ <DueThisWeekWidget>         — assignments/quizzes next 7 days, cross-course
       ├─ <RecentAnnouncementsWidget> — top 10 across all courses
       ├─ <NewFilesWidget>            — files updated in last 7 days
       ├─ <CourseProgressWidget>      — one card per course: "Week N of M"
       └─ <RecentGradesWidget>        — last 5 graded submissions
```

Widget clicks: assignments/files open preview dialog; announcements/modules/pages deep-link to per-course page.

### Per-course page `/courses/[id]`

```
app/courses/[id]/page.tsx (server component)
  └─ loadCourseData(courseId)     ──► single Postgres round-trip
  └─ <CoursePage data>
       ├─ <CourseHeader>
       └─ <CourseTabs> default=Modules
            ├─ <ModulesTab>        — Canvas learning path, ordered
            ├─ <FilesTab>          — folder/flat toggle, preview on click
            ├─ <AnnouncementsTab>
            ├─ <PagesTab>          — list + body rendering (sanitized HTML)
            ├─ <AssignmentsTab>
            └─ <GradesTab>
```

### File preview

`app/ui/file-preview-dialog.tsx` is the canonical preview surface:

| Content-type | Handler |
|---|---|
| `application/pdf` | iframe of Canvas temp URL |
| `.docx` / `.pptx` / `.xlsx` | `https://docs.google.com/viewer?url={encoded}&embedded=true` |
| Image | native `<img>` |
| Video/audio | native `<video>` / `<audio>` |
| Other | "Open in Canvas" button |

Canvas temp URL obtained via existing `getFileDownloadUrl(fileId)`.

### Mock data & typing cleanup

- Delete hardcoded mock blocks in `app/dashboard-client.tsx` (BRANCH_REVIEW #5). Widgets read real Supabase data.
- Empty-state UI per widget when pre-first-sync.
- Replace remaining `any` types with concrete interfaces in `lib/contracts.ts` — one per widget.
- Split the monolithic client component into ~12 focused files.

### Page body sanitization

`<PagesTab>` renders `body_html` through a sanitizer (`rehype-sanitize` or `dompurify`). `<script>` and event-handler attributes stripped. Test covers this.

## 9. Removal list (Phase A)

### Delete in full

```
app/api/chat/route.ts
app/ui/chat-panel.tsx
lib/embed.ts
lib/ai.ts
supabase/schema_local.sql
supabase/schema_v7.sql
supabase/schema_voyage.sql
supabase/add_live_sync_metadata.sql   (content migrated into numbered migrations)
```

### package.json — remove

- `@anthropic-ai/sdk`
- `@huggingface/transformers`
- `openai`
- `pdf-parse`
- `crypto-js` (re-add in Phase-2)

### Env vars to drop

`ANTHROPIC_API_KEY`, `AI_MODEL`, `EMBED_MODEL`, `OPENAI_API_KEY`, `ENCRYPTION_SECRET`. Remove from `.env.local`, `lib/env.ts`, `README.md`.

### In-file strip-outs

- `lib/sync.ts` — remove summary/classification/embedding calls.
- `app/api/sync/route.ts` — remove `extract → chunk → embed` flow.
- `app/dashboard-client.tsx` — remove chat panel mount + state.

### Untouched

- `lib/canvas.ts` (extended, not rewritten)
- `lib/supabase.ts`, `lib/supabase-admin.ts`
- `lib/nusmods.ts` (out of scope)
- Existing sync button, sync modal, error boundary

## 10. Testing & verification

### Automated (Vitest, mocked fetch, mocked Supabase)

- **Phase A:** delete tests referencing removed AI code; existing Canvas + sync tests stay green.
- **Phase B:** unit tests for `getModules`, `getModuleItems`, `getPages`, `getPage`, `getAssignmentsWithSubmissions` covering pagination, retries on 429, inline-vs-per-module branching, lazy body logic. Sync idempotency test: run twice, assert zero duplicates.
- **Phase C:** one render test per widget covering data + empty states (~5 tests).
- **Phase D:** `file-preview-dialog` MIME-branch test. Per-course tab-switch test. HTML sanitization test (`<script>` stripped from page body).

### Not automated (by choice)

- End-to-end Playwright runs for the full user flow — save for Phase-2.
- Live Canvas calls in CI — all Canvas tests mock `fetch`.

### Manual verification per phase

- **A:** `npm run dev` loads home; Sync now still works; no Anthropic/OpenAI/transformers references remain; bundle size drops visibly.
- **B:** after fresh sync, query Supabase and confirm rows in `course_modules`, `course_module_items`, `canvas_pages`, `grades`; counts match Canvas for one representative course.
- **C:** home loads in <500ms against cached data; widgets show real content; empty states render when no data.
- **D:** PDF, DOCX, PPTX each preview correctly; one course's Modules tab matches Canvas's order exactly.

## 11. Phase breakdown (shippable PRs)

### Phase A — Strip AI
Net result: smaller, faster, same Canvas coverage as today.

- Delete the files in §9.
- Remove deps and env vars.
- Strip in-file AI paths from sync.
- Consolidate schema files; write `0001_init.sql` as post-AI baseline.
- Run existing tests green.

### Phase B — Extend Canvas coverage
Net result: DB contains Canvas Modules, Pages, Grades. No UI yet.

- `0002` rename + `0003`, `0004`, `0005` migrations.
- Extend `lib/canvas.ts` with five new fetchers.
- Extend `lib/sync.ts` and `app/api/sync/route.ts` to upsert the new resources.
- Unit tests + idempotency test.
- Verify via Supabase queries against real Canvas data.

### Phase C — Widget dashboard
Net result: new home page, all data real.

- Build the five widgets + `loadDashboardData()`.
- Split `app/dashboard-client.tsx` into focused files.
- Delete mock data.
- Concrete types in `lib/contracts.ts`.
- Empty states.

### Phase D — Per-course pages + preview
Net result: full per-course drill-in, preview wired throughout.

- `app/courses/[id]/page.tsx` + `loadCourseData()`.
- Six tab components.
- Wire `file-preview-dialog` from widgets and tabs.
- HTML sanitizer for page body rendering.
- Manual walkthrough of one course end-to-end.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| `modules → courses` rename breaks more than expected | Do it as a single PR with a migration + find-and-replace; rely on TypeScript to surface every reference |
| Page body fetches explode sync time for courses with many pages | `updated_at` diff + concurrency cap of 5; first sync is slow but subsequent syncs fetch only changes |
| Sanitizing page HTML strips too much and pages render empty | Conservative allow-list (headings, lists, links, images, code, tables); test with real NUS page samples |
| Canvas "Modules" items reference assignments/files that haven't synced yet | Items store `content_ref` as an opaque Canvas id; UI resolves it from `canvas_files` / `tasks` if present, else falls back to "Open in Canvas" link |
| Removing `crypto-js` breaks existing DB rows with encrypted tokens | Phase-1 has no encrypted user rows; `users` table is the single hardcoded Phase-1 row with a null token field |

## 13. Out of scope (deferred to future phases)

- Supabase Auth, per-user token encryption, RLS, multi-user sync loop (Phase-2).
- AI re-introduction as an additive feature (any later phase).
- Stale-while-revalidate client caching (Phase-2 if dashboard load ever regresses).
- Full E2E Playwright suite.
- Panopto embed sophistication, ICS calendar export, quizzes tab.
