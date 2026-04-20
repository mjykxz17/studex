# Studex — Phase C Widget Dashboard Design

**Date:** 2026-04-20
**Status:** Approved design, ready for implementation planning
**Author:** Aiden Ma (with Claude)

## 1. Context & motivation

Phase B landed on `main` on 2026-04-19 and extended the sync pipeline to write four new resource types to Supabase: `grades`, `canvas_pages`, `course_modules`, and `course_module_items`. The data is being populated correctly against real Canvas data (verified against CS3235), but **no UI reads from these tables yet**.

Phase C adds the home widget dashboard that surfaces this data — the "speed + unification" hero from the pivot spec. The home page stays one fast round-trip against Supabase and presents cross-course widgets: deadlines, recent announcements, new files, Canvas learning-module progress, and recent grades.

Per-course drill-in (tabbed per-course page with Files / Announcements / Pages / Modules / Grades) is deferred to Phase D.

## 2. Hero value & non-goals

**Hero:** Extend the existing home widget dashboard to surface the Phase B resource types, then split the now-monolithic `home-view.tsx` into per-widget files. Each widget gets empty states, concrete types, and coverage in Vitest.

**Non-goals for Phase C:**

- Per-course page with tabs (Phase D).
- New API routes — all reads flow through the server component.
- Redesigning the visual language — widgets inherit the existing design tokens.
- Inline editing of grades, tasks, or completion status.
- File preview changes — the existing `<FilePreviewDialog>` is reused as-is.
- Live re-fetch / stale-while-revalidate. The page loads fresh on navigation; a manual sync + page refresh is the refresh mechanism.

## 3. Finalised decisions

| Decision | Choice |
|---|---|
| Layout strategy | **Hybrid** — keep the existing Stats header + ScheduleBoard + ModuleBoard, add two new widgets (Recent Grades, Course Progress), split the combined ChangesPanel into separate Announcements + NewFiles widgets |
| Click-through (course-level) | Opens existing `ModuleView` (app/ui/dashboard/module-view.tsx) — drop-in replaced by the Phase D per-course page later |
| Click-through (announcement) | Expands inline inside the widget — no navigation |
| Click-through (file) | Opens `<FilePreviewDialog>` — existing behavior, unchanged |
| Click-through (grade) | Opens the Canvas assignment URL in a new tab (the only sensible destination before Phase D) |
| Data fetching | Single `loadDashboardData()` round-trip per page load; five Supabase queries fanned out via `Promise.all` |
| Type organisation | All widget data types live in `lib/contracts.ts`. Widget components import their slice type from there. Widgets never import `DashboardData`. |
| File decomposition | One widget per file under `app/ui/dashboard/widgets/`. `home-view.tsx` shrinks from 316 → ~80 lines of pure layout glue |
| "Current Canvas Module" heuristic | First `course_module` in position order with `state != 'completed'`; fall back to the last module if every module reports completed |

## 4. Architecture

### Data flow

```
app/page.tsx (server component)
  └─ loadDashboardData()                 ──► one Postgres round-trip (5 queries in parallel)
  └─ <DashboardClient data>              (top-level layout + view routing; unchanged)
       └─ <HomeView data>                (thin layout orchestrator; ~80 lines)
            ├─ <StatsHeader>             — existing, keep
            ├─ <ScheduleBoard>           — existing, keep (weekly timetable)
            ├─ <DueThisWeekWidget>       — refactored from UpcomingPanel (7-day window)
            ├─ <RecentAnnouncementsWidget> — split from ChangesPanel (inline expand)
            ├─ <NewFilesWidget>          — absorbs RecentFilesBoard, split from ChangesPanel
            ├─ <CourseProgressWidget>    — NEW: reads course_modules + course_module_items
            ├─ <RecentGradesWidget>      — NEW: reads grades
            └─ <CourseListWidget>        — moved from ModuleBoard (same behavior, new home)
```

### Invariants

- **Reads are one-hop from Postgres.** No page fetches Canvas directly. Data that isn't in Supabase simply doesn't render.
- **Widgets are isolated.** Each widget file imports its slice type from `lib/contracts.ts` and receives data via prop. No widget imports `DashboardData` or peer widgets.
- **No side-effects in render.** Widgets are pure functions of their props. Expansions (announcements) are local component state only.
- **Empty states colocated with widgets.** Each widget renders its own empty state inline; no shared dispatcher.
- **Deep-link fallback for grades only.** For now, clicking a grade row opens `https://canvas.nus.edu.sg/courses/<canvas_course_id>/assignments/<source_ref_id>` in a new tab. Every other cross-resource click either stays inline (announcements), opens the preview dialog (files), or routes to the existing `ModuleView` (courses). No new URL patterns introduced.

## 5. Widget inventory

Layout is a two-column xl grid; stacks single-column on smaller breakpoints. Order (desktop):

**Left column (wider):**
1. `<StatsHeader>` — dueSoon / open tasks / unread announcements stats
2. `<ScheduleBoard>` — weekly timetable with tasks overlaid (unchanged)
3. `<DueThisWeekWidget>` — assignments/quizzes next 7 days, max 6 rows
4. `<RecentAnnouncementsWidget>` — top 10 across all courses, inline-expandable
5. `<NewFilesWidget>` — files updated in last 7 days, max 8 rows, click opens `<FilePreviewDialog>`

**Right column (narrower):**
6. `<CourseProgressWidget>` — per-course cards showing current Canvas Module + next item title
7. `<RecentGradesWidget>` — last 5 graded submissions, click opens Canvas assignment URL
8. `<CourseListWidget>` — course list with per-course quick stats (unchanged from existing ModuleBoard)

### Widget details

| Widget | Data source | Max rows | Empty state copy |
|---|---|---|---|
| `<StatsHeader>` | computed from tasks + announcements | — | always renders zeros |
| `<DueThisWeekWidget>` | `tasks.filter(t => dueAt within 7 days)` sorted by dueAt ASC | 6 | "Nothing due this week." |
| `<RecentAnnouncementsWidget>` | `announcements` top 10 by posted_at DESC | 10 | "No recent announcements." |
| `<NewFilesWidget>` | `recentFiles` updated in last 7 days | 8 | "No new files this week." |
| `<CourseProgressWidget>` | one entry per sync-enabled course | one card per course | "Canvas Modules not synced yet." |
| `<RecentGradesWidget>` | `grades` top 5 by graded_at DESC | 5 | "No grades yet." |

### "Current module" heuristic (CourseProgressWidget)

For each sync-enabled course:

1. Query `course_modules` rows for that course, ordered by `position` ASC.
2. Pick the first row where `state != 'completed'`. If Canvas didn't report a state, treat it as not-completed.
3. If every row has `state = 'completed'`, fall back to the last row (user is at the end of the course — show the final module).
4. From the picked module's `course_module_items`, take the first non-`SubHeader` item in position order as `nextItemTitle`.
5. If the course has zero `course_modules` rows, render the empty state for that card.

## 6. Data flow & types

### Extended `DashboardData` shape (in `lib/contracts.ts`)

```ts
export type DashboardData = {
  overview: {
    dueSoonCount: number;
    openTaskCount: number;
    unreadAnnouncementCount: number;
    lastSyncedLabel: string;
  };

  modules: ModuleSummary[];
  tasks: WeeklyTask[];
  announcements: AnnouncementSummary[];
  recentFiles: Array<CanvasFileSummary & { moduleCode: string; moduleTitle: string }>;

  // NEW in Phase C
  recentGrades: GradeSummary[];
  courseProgress: CourseProgressSummary[];

  source: "live" | "fallback";
  status: "ready" | "needs-setup" | "error";
  setupMessage: string;
  userId: string | null;
  lastSyncedAt: string | null;
};

export type GradeSummary = {
  id: string;
  moduleCode: string;
  assignmentTitle: string;
  score: number | null;
  gradeText: string | null;
  pointsPossible: number | null;
  state: "submitted" | "graded" | "missing" | "unsubmitted" | null;
  gradedAt: string | null;
  gradedLabel: string;        // e.g. "2 days ago"
  canvasUrl: string | null;   // derived; deep-link to the Canvas assignment page
};

export type CourseProgressSummary = {
  courseId: string;
  moduleCode: string;
  courseTitle: string;
  totalModules: number;
  currentModulePosition: number | null;   // 1-indexed; null if no modules synced
  currentModuleName: string | null;
  nextItemTitle: string | null;
};
```

The existing types `ModuleSummary`, `WeeklyTask`, `AnnouncementSummary`, `CanvasFileSummary` (and their related `FilePreviewKind`, `DashboardChange`) are moved from `lib/dashboard.ts` → `lib/contracts.ts` so every widget imports from one location.

### Two new Supabase queries added to `lib/dashboard.ts`

```ts
// grades → GradeSummary[]
supabase
  .from("grades")
  .select(`
    id, score, grade_text, points_possible, graded_at, state,
    tasks (
      id, title, source_ref_id,
      courses (code, canvas_course_id)
    )
  `)
  .eq("user_id", userId)
  .order("graded_at", { ascending: false, nullsFirst: false })
  .limit(5);

// course_modules + items → CourseProgressSummary[]
supabase
  .from("course_modules")
  .select(`
    id, course_id, name, position, state, items_count,
    courses (code, title),
    course_module_items (id, title, item_type, position)
  `)
  .eq("user_id", userId)
  .order("position", { ascending: true });
```

The `course_modules` query pulls every module for every course. `loadDashboardData` groups by `course_id`, applies the current-module heuristic per course, and returns one `CourseProgressSummary` per sync-enabled course. Courses with zero module rows are still returned but with `currentModulePosition: null` so the widget can render its per-card empty state.

### Canvas URL derivation for grades

```ts
function deriveCanvasAssignmentUrl(
  canvasBaseUrl: string,
  canvasCourseId: string | null,
  sourceRefId: string | null,
): string | null {
  if (!canvasCourseId || !sourceRefId) return null;
  return `${canvasBaseUrl.replace(/\/+$/, "")}/courses/${canvasCourseId}/assignments/${sourceRefId}`;
}
```

`canvasBaseUrl` reads `process.env.CANVAS_BASE_URL` on the server (with default `https://canvas.nus.edu.sg`). Since `loadDashboardData` runs server-side, this is accessed directly — not passed to the client.

## 7. File structure

### Created

```
app/ui/dashboard/widgets/
  stats-header.tsx                 (~40 lines — extracted from home-view)
  due-this-week-widget.tsx         (~70 lines — refactored from UpcomingPanel)
  recent-announcements-widget.tsx  (~120 lines — split from ChangesPanel; inline expand)
  new-files-widget.tsx             (~60 lines — absorbs RecentFilesBoard, split from ChangesPanel)
  course-progress-widget.tsx       (~90 lines — NEW)
  recent-grades-widget.tsx         (~80 lines — NEW)
  course-list-widget.tsx           (~50 lines — moved from inline ModuleBoard)

tests/app/ui/widgets/
  stats-header.test.tsx
  due-this-week-widget.test.tsx
  recent-announcements-widget.test.tsx
  new-files-widget.test.tsx
  course-progress-widget.test.tsx
  recent-grades-widget.test.tsx
  course-list-widget.test.tsx

tests/lib/dashboard.test.ts        (new — integration test for loadDashboardData assembly)
```

### Modified

```
lib/contracts.ts                   — grows by ~100 lines: adds widget types; absorbs existing shared types
lib/dashboard.ts                   — grows by ~120 lines: two new queries + two new mapping helpers + extended DashboardData
app/ui/dashboard/home-view.tsx     — shrinks from 316 → ~80 lines; becomes pure layout glue
tests/app/dashboard-client.test.tsx — fixture updates (add `recentGrades: []` and `courseProgress: []` to existing DashboardData literals)
```

### Moved (path-only)

```
app/ui/dashboard/schedule-board.tsx  →  app/ui/dashboard/widgets/schedule-board.tsx
app/ui/dashboard/file-card.tsx       →  app/ui/dashboard/widgets/file-card.tsx
```

`app/ui/dashboard/shared.tsx` (SectionCard, Pill, EmptyState, colorForModule) stays at its current path — it's a cross-widget helper, not a widget.

### Unchanged

- `app/page.tsx`
- `app/dashboard-client.tsx` (still routes between home / modules / nusmods / manage)
- `app/ui/dashboard/manage-view.tsx`
- `app/ui/dashboard/module-view.tsx` (Phase D replaces this later)
- `app/ui/dashboard/modules-view.tsx`
- `app/ui/dashboard/nusmods-view.tsx`
- `app/ui/file-preview-dialog.tsx`
- `lib/sync.ts`, `lib/canvas.ts`, `lib/supabase*.ts`

## 8. Error handling & empty states

- **Per-widget empty state:** each widget renders its own empty state inline. No shared dispatcher. Empty-state copy is the widget's responsibility. Keeps the widget fully self-describing.
- **Whole-page `FALLBACK_DASHBOARD`:** preserved from Phase A. Triggers when `hasSupabaseConfig()` is false OR the top-level query chain throws. UI falls back to a "needs setup" message with the existing Sync button. `recentGrades` and `courseProgress` in the fallback are empty arrays.
- **Partial failures during data load:** if one of the 5 Supabase queries fails but others succeed, the whole `loadDashboardData` throws and lands on `FALLBACK_DASHBOARD`. Phase C does not implement per-query degradation — if that becomes a real problem later, each query's error boundary becomes a per-widget decision, not a dashboard-level one. YAGNI for now.
- **Per-course progress missing modules:** courses with zero `course_modules` rows are still returned in `courseProgress[]` with `currentModulePosition: null`. The `<CourseProgressWidget>` renders a compact "Canvas Modules not synced yet" state for those cards.

## 9. Testing

### Automated (Vitest)

- **Per-widget render tests** — one file per widget, two tests each (data renders correctly + empty state renders). 7 widget files × 2 = 14 tests.
- **`loadDashboardData` integration test** — new `tests/lib/dashboard.test.ts`. Mocks the Supabase client (existing pattern) and feeds fake rows for the 5 queries. Asserts:
  - The returned `DashboardData` has the expected shape.
  - `GradeSummary.canvasUrl` is correctly derived from `source_ref_id` + `canvas_course_id`.
  - The current-module heuristic picks the first non-completed module, and falls back to the last module when everything is completed.
  - Courses with zero module rows still yield a `CourseProgressSummary` entry with `currentModulePosition: null`.
- **Fixture updates** — `tests/app/dashboard-client.test.tsx` adds `recentGrades: []` and `courseProgress: []` to existing `DashboardData` literals. Two existing tests carry over unchanged.

### Not automated

- Server-component fetch against a real Supabase — uses mocks.
- Visual regression — not in scope.
- The existing `ScheduleBoard` and `CourseListWidget` bodies — already covered indirectly by `dashboard-client.test.tsx`.

### Expected test count after Phase C

- Phase B baseline: 22 tests across 8 files.
- Phase C adds: 14 widget tests + 3 dashboard integration tests = 17.
- Total: **~39 tests across ~16 files**.

### Manual verification checklist (per Phase C acceptance)

- Open `http://localhost:3001` → home page loads in under 500ms against cached Supabase.
- All widgets render with real CS3235 data. Other courses show empty states for the widgets they have no data for (CourseProgress especially).
- Click an announcement → expands inline. Clicking again collapses.
- Click a file → opens preview dialog. PDF renders in iframe.
- Click a Course Progress card → opens the existing `ModuleView` (Overview / Files / NUSMods tabs).
- Click a grade row → opens the Canvas assignment URL in a new tab.
- Trigger a manual sync → progress events stream into the Sync modal (unchanged from Phase B).
- Refresh the page → fresh data appears in all widgets.

## 10. Phase breakdown

Single Phase C sprint (no sub-phases). Implementation plan will decompose into ~5 tasks by the nature of the split:

- Task 1: Move types to `lib/contracts.ts` + extend `DashboardData` type (no-op semantically; sets the type foundation).
- Task 2: Extend `loadDashboardData` with the two new queries + type assembly; add the integration test.
- Task 3: Extract existing widgets (StatsHeader, DueThisWeek, Announcements, NewFiles, CourseList) out of `home-view.tsx` into the widgets folder. Add per-widget tests.
- Task 4: Build the two new widgets (CourseProgress, RecentGrades) with tests. Wire into home layout.
- Task 5: Final verification + manual spot check.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| CourseProgress heuristic picks the wrong module when Canvas's `state` field is inconsistent | Accept the imperfect first-pass heuristic; the widget shows "Module N of M" + next item title so even a wrong pick is informative, not broken. Revisit if students report confusion. |
| `home-view.tsx` refactor breaks existing dashboard-client tests | Fixture update (Task 1 adds the two new fields) + the rendered DOM shape is preserved (widgets show the same content in the same order). Tests continue to pass because they assert on rendered text, not component structure. |
| Adding two new Supabase queries makes `loadDashboardData` slower | Negligible for single-user Phase-1 (both queries are indexed by `user_id`, tiny data volume). Parallel via `Promise.all`. Measured total should remain under 300ms. If it regresses, the two new queries can be made optional/lazy later. |
| Widgets accidentally import `DashboardData` or peer widgets | Enforced by code review (and subagent-driven dev pattern). Each widget file declares its slice type as its prop type, imported from `lib/contracts.ts`. |
| Canvas URL derivation leaks `CANVAS_BASE_URL` to client | It shouldn't — derivation happens in `loadDashboardData` (server side) and is baked into `GradeSummary.canvasUrl` before shipping to the client. The URL string that reaches the browser is already complete. |

## 12. Out of scope (deferred to Phase D or later)

- Dedicated per-course page with tabs (Files / Announcements / Modules / Pages / Grades).
- HTML sanitisation layer for page bodies (`canvas_pages.body_html`) — needed only when the Pages tab on the per-course page renders them.
- Extending `SyncStage` with a `"page"` variant (flagged by Phase B reviewers as a deferred cleanup).
- Tightening `canvas_pages` unique constraint to include `user_id` (Phase-2 multi-user readiness).
- Renaming the `counts.modules` summary label if the sync summary message becomes ambiguous once the UI displays both NUS "modules" (courses) and Canvas "modules" (learning units).
- Full E2E browser tests via Playwright.
