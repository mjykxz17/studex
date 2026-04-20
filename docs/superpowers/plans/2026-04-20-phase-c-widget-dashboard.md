# Phase C — Widget Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the home dashboard to surface Phase B's new tables (grades, course_modules) via two new widgets, then split `home-view.tsx` into per-widget files so each is independently understandable and testable.

**Architecture:** One server-side `loadDashboardData()` round-trip fans out five Supabase queries via `Promise.all` and returns a fully-typed `DashboardData`. The home view becomes thin layout glue; each widget is a self-contained file under `app/ui/dashboard/widgets/` that takes its slice type as a prop and renders its own empty state.

**Tech Stack:** Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS v4, Supabase JS client, Vitest + Testing Library.

**Reference spec:** [docs/superpowers/specs/2026-04-20-phase-c-widget-dashboard-design.md](../specs/2026-04-20-phase-c-widget-dashboard-design.md).

---

## File Structure

**Created:**
```
app/ui/dashboard/widgets/
  stats-header.tsx
  due-this-week-widget.tsx
  recent-announcements-widget.tsx
  new-files-widget.tsx
  course-progress-widget.tsx     (NEW resource)
  recent-grades-widget.tsx       (NEW resource)
  course-list-widget.tsx
  schedule-board.tsx             (moved from app/ui/dashboard/schedule-board.tsx)
  file-card.tsx                  (moved from app/ui/dashboard/file-card.tsx)

tests/app/ui/widgets/
  stats-header.test.tsx
  due-this-week-widget.test.tsx
  recent-announcements-widget.test.tsx
  new-files-widget.test.tsx
  course-progress-widget.test.tsx
  recent-grades-widget.test.tsx
  course-list-widget.test.tsx

tests/lib/dashboard.test.ts
```

**Modified:**
```
lib/contracts.ts                   — absorbs all widget types from lib/dashboard.ts; gains GradeSummary + CourseProgressSummary
lib/dashboard.ts                   — drops type definitions (now in contracts); adds two new queries + assembly; grows ~120 lines
app/ui/dashboard/home-view.tsx     — reduces from 316 → ~90 lines of layout glue
app/page.tsx                       — no change expected; double-check import path
app/dashboard-client.tsx           — one-line import path update
app/ui/file-preview-dialog.tsx     — one-line import path update
app/ui/dashboard/manage-view.tsx   — one-line import path update
app/ui/dashboard/module-view.tsx   — one-line import path update
app/ui/dashboard/modules-view.tsx  — one-line import path update
app/ui/dashboard/nusmods-view.tsx  — one-line import path update
tests/app/dashboard-client.test.tsx — one-line import path update + fixture fields for recentGrades + courseProgress
```

**Moved (path-only, no content change):**
```
app/ui/dashboard/schedule-board.tsx  →  app/ui/dashboard/widgets/schedule-board.tsx
app/ui/dashboard/file-card.tsx       →  app/ui/dashboard/widgets/file-card.tsx
```

**Unchanged:**
```
app/ui/dashboard/shared.tsx          (SectionCard, Pill, EmptyState, colorForModule — used by everyone)
app/ui/dashboard/manage-view.tsx     (import path only)
app/ui/dashboard/module-view.tsx     (import path only)
app/ui/dashboard/modules-view.tsx    (import path only)
app/ui/dashboard/nusmods-view.tsx    (import path only)
lib/sync.ts, lib/canvas.ts, lib/supabase.ts, lib/supabase-admin.ts, lib/config.ts, lib/demo-user.ts, lib/nusmods.ts
```

---

## TDD framing for this phase

- **Task 1** is a pure type-move refactor — no behavior change. Existing tests must stay green. No new tests.
- **Task 2** adds new data-loading behavior. Write the three integration tests first, confirm they fail, then implement.
- **Tasks 3-4** are widget tests — write each widget's render + empty-state test first, confirm failure, then build the widget.
- **Task 5** is verification only.

Total expected tests after Phase C: **22 (Phase B) + 14 widget + 3 dashboard integration = 39** across 16 files.

---

## Task 1: Consolidate shared types into `lib/contracts.ts`

**Files:**
- Modify: `lib/contracts.ts` (absorbs types from `lib/dashboard.ts`)
- Modify: `lib/dashboard.ts` (drops type definitions, re-imports from contracts)
- Modify: 9 consumer files (one-line import path swap each)

**Rationale:** Phase C's widget decomposition requires every widget to import its slice type from one central place. Doing the type move as its own commit means no widget work mixes with a schema-level refactor, and the spec-compliance check for subsequent tasks can focus on feature code.

- [ ] **Step 1: Confirm baseline is green**

Run: `cd /Users/aiden/Desktop/studex && npm test`
Expected: `Test Files  8 passed (8)  Tests  22 passed (22)`.

- [ ] **Step 2: Rewrite `lib/contracts.ts` with the absorbed types**

Replace the entire file with:

```typescript
import type { NUSModsData, NUSModsExam } from "@/lib/nusmods";

// Sync pipeline contracts (unchanged from Phase B)
export type SyncStage = "discovery" | "module" | "announcement" | "task" | "file" | "finalizing";
export type SyncStatus = "started" | "progress" | "complete" | "error";

export type SyncCounts = {
  modules: number;
  announcements: number;
  tasks: number;
  files: number;
};

export type SyncEvent = {
  status: SyncStatus;
  stage: SyncStage;
  message: string;
  counts?: Partial<SyncCounts>;
  moduleCode?: string;
};

// Dashboard data contracts (absorbed from lib/dashboard.ts)
export type FilePreviewKind = "pdf" | "image" | "text" | "office" | "binary";

export type CanvasFileSummary = {
  id: string;
  name: string;
  type: string;
  category: string;
  uploadedLabel: string;
  uploadedAt: string | null;
  summary: string;
  canvasUrl: string | null;
  extractedText: string | null;
  previewKind: FilePreviewKind;
  contentType: string | null;
};

export type WeeklyTask = {
  id: string;
  title: string;
  moduleCode: string;
  dueLabel: string;
  dueDate?: string | null;
  status: "due-soon" | "upcoming" | "no-date";
  source: string;
};

export type AnnouncementSummary = {
  id: string;
  title: string;
  moduleCode: string;
  summary: string;
  postedLabel: string;
  postedAt: string | null;
  importance: "high" | "normal" | "low";
};

export type DashboardChange = {
  id: string;
  kind: "announcement" | "file";
  moduleCode: string;
  title: string;
  summary: string;
  happenedAt: string | null;
  happenedLabel: string;
  importance: "high" | "normal" | "low";
  file: CanvasFileSummary | null;
};

export type DashboardOverview = {
  syncedModuleCount: number;
  openTaskCount: number;
  recentChangeCount: number;
  fileCount: number;
  dueSoonCount: number;
  lastSyncedLabel: string;
};

export type ModuleSummary = {
  id: string;
  code: string;
  title: string;
  taskCount: number;
  announcementCount: number;
  lastSyncLabel: string;
  sync_enabled: boolean;
  files: CanvasFileSummary[];
  nextTask: WeeklyTask | null;
  latestAnnouncement: AnnouncementSummary | null;
  recentFile: CanvasFileSummary | null;
  examSummary: NUSModsExam | null;
  nusmods?: NUSModsData | null;
};

export type DashboardData = {
  overview: DashboardOverview;
  modules: ModuleSummary[];
  tasks: WeeklyTask[];
  announcements: AnnouncementSummary[];
  recentFiles: Array<CanvasFileSummary & { moduleCode: string; moduleTitle: string }>;
  latestChanges: DashboardChange[];
  source: "live" | "fallback";
  status: "ready" | "needs-setup" | "error";
  setupMessage: string;
  userId: string | null;
  lastSyncedAt: string | null;
};
```

Note: no `GradeSummary` or `CourseProgressSummary` yet — those arrive in Task 2.

- [ ] **Step 3: Remove the type definitions from `lib/dashboard.ts`**

In `lib/dashboard.ts`, delete the 8 local type-definition blocks (currently lines ~8-93 in the file): `FilePreviewKind`, `CanvasFileSummary`, `WeeklyTask`, `AnnouncementSummary`, `DashboardChange`, `DashboardOverview`, `ModuleSummary`, `DashboardData`.

Add this line to the imports at the top of the file (after the existing `import { hasSupabaseConfig } from "@/lib/config";` line):

```typescript
import type {
  AnnouncementSummary,
  CanvasFileSummary,
  DashboardChange,
  DashboardData,
  ModuleSummary,
  WeeklyTask,
} from "@/lib/contracts";
```

The local private types (`ModuleQueryRow`, `ModuleFileRow`, `TaskQueryRow`, `AnnouncementQueryRow`, `RelationRecord`) stay in `lib/dashboard.ts` — they're query-row shapes, not exposed to consumers.

- [ ] **Step 4: Update the 9 consumer files' imports**

Each file has a single `import type { ... } from "@/lib/dashboard";` line that needs to change to `"@/lib/contracts"`. Apply each one:

**`app/dashboard-client.tsx:11`**
```typescript
// Before
import type { DashboardData } from "@/lib/dashboard";
// After
import type { DashboardData } from "@/lib/contracts";
```

**`app/ui/file-preview-dialog.tsx:6`**
```typescript
// Before
import type { CanvasFileSummary } from "@/lib/dashboard";
// After
import type { CanvasFileSummary } from "@/lib/contracts";
```

**`app/ui/dashboard/file-card.tsx:2`**
```typescript
// Before
import type { CanvasFileSummary } from "@/lib/dashboard";
// After
import type { CanvasFileSummary } from "@/lib/contracts";
```

**`app/ui/dashboard/home-view.tsx:6`**
```typescript
// Before
import type { DashboardChange, DashboardData, ModuleSummary } from "@/lib/dashboard";
// After
import type { DashboardChange, DashboardData, ModuleSummary } from "@/lib/contracts";
```

**`app/ui/dashboard/manage-view.tsx:1`**
```typescript
// Before
import type { ModuleSummary } from "@/lib/dashboard";
// After
import type { ModuleSummary } from "@/lib/contracts";
```

**`app/ui/dashboard/module-view.tsx:5`**
```typescript
// Before
import type { AnnouncementSummary, ModuleSummary, WeeklyTask } from "@/lib/dashboard";
// After
import type { AnnouncementSummary, ModuleSummary, WeeklyTask } from "@/lib/contracts";
```

**`app/ui/dashboard/modules-view.tsx:2`**
```typescript
// Before
import type { ModuleSummary } from "@/lib/dashboard";
// After
import type { ModuleSummary } from "@/lib/contracts";
```

**`app/ui/dashboard/nusmods-view.tsx:5`**
```typescript
// Before
import type { ModuleSummary, WeeklyTask } from "@/lib/dashboard";
// After
import type { ModuleSummary, WeeklyTask } from "@/lib/contracts";
```

**`app/ui/dashboard/schedule-board.tsx:1`**
```typescript
// Before
import type { ModuleSummary, WeeklyTask } from "@/lib/dashboard";
// After
import type { ModuleSummary, WeeklyTask } from "@/lib/contracts";
```

**`tests/app/dashboard-client.test.tsx:4`**
```typescript
// Before
import type { DashboardData } from "@/lib/dashboard";
// After
import type { DashboardData } from "@/lib/contracts";
```

Note: `app/page.tsx` only imports `loadDashboardData` (the function), not types — no change needed there. Confirm with `grep -n "from \"@/lib/dashboard\"" app/page.tsx` (expected: the line imports `loadDashboardData`, not types).

- [ ] **Step 5: Type-check**

Run: `cd /Users/aiden/Desktop/studex && npx tsc --noEmit`
Expected: no errors in `app/**` or `lib/**`. Pre-existing vitest-globals noise in `tests/**` is OK (same as Phase B).

- [ ] **Step 6: Run tests**

Run: `cd /Users/aiden/Desktop/studex && npm test`
Expected: `Test Files  8 passed (8)  Tests  22 passed (22)` (unchanged).

- [ ] **Step 7: Grep sweep**

Run: `grep -rn "from \"@/lib/dashboard\"" app lib tests --include="*.ts" --include="*.tsx"`
Expected: only `app/page.tsx` (which imports the function `loadDashboardData`, not types) should still reference `@/lib/dashboard`.

- [ ] **Step 8: Commit**

```bash
git add lib/contracts.ts lib/dashboard.ts app/dashboard-client.tsx app/ui/file-preview-dialog.tsx app/ui/dashboard/file-card.tsx app/ui/dashboard/home-view.tsx app/ui/dashboard/manage-view.tsx app/ui/dashboard/module-view.tsx app/ui/dashboard/modules-view.tsx app/ui/dashboard/nusmods-view.tsx app/ui/dashboard/schedule-board.tsx tests/app/dashboard-client.test.tsx
git commit -m "$(cat <<'EOF'
refactor(types): move dashboard data types to lib/contracts

Consolidates FilePreviewKind, CanvasFileSummary, WeeklyTask,
AnnouncementSummary, DashboardChange, DashboardOverview, ModuleSummary,
and DashboardData out of lib/dashboard.ts and into lib/contracts.ts so
every widget can import its slice type from one central place. All
nine consumer files are updated to import from @/lib/contracts; no
behavior changes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Extend `loadDashboardData` with grades and course_modules queries

**Files:**
- Modify: `lib/contracts.ts` (add `GradeSummary`, `CourseProgressSummary`, extend `DashboardData`)
- Modify: `lib/dashboard.ts` (extend `loadDashboardData` with two new queries + mapping helpers; extend `FALLBACK_DASHBOARD`)
- Modify: `tests/app/dashboard-client.test.tsx` (fixture updates for the two new required fields)
- Create: `tests/lib/dashboard.test.ts` (three integration tests)

**Rationale:** Each widget in Task 4 needs its slice type available on `DashboardData`. Task 2 establishes the data contract so Task 4's widget work is a pure UI job with no data plumbing. Integration tests for the new field derivations land here (before the UI uses them).

- [ ] **Step 1: Extend `lib/contracts.ts` with the two new widget types and update `DashboardData`**

Append to `lib/contracts.ts` after the `ModuleSummary` definition but before `DashboardData`:

```typescript
export type GradeSummary = {
  id: string;
  moduleCode: string;
  assignmentTitle: string;
  score: number | null;
  gradeText: string | null;
  pointsPossible: number | null;
  state: "submitted" | "graded" | "missing" | "unsubmitted" | null;
  gradedAt: string | null;
  gradedLabel: string;
  canvasUrl: string | null;
};

export type CourseProgressSummary = {
  courseId: string;
  moduleCode: string;
  courseTitle: string;
  totalModules: number;
  currentModulePosition: number | null;
  currentModuleName: string | null;
  nextItemTitle: string | null;
};
```

Then update the `DashboardData` type in the same file to include the two new fields:

```typescript
export type DashboardData = {
  overview: DashboardOverview;
  modules: ModuleSummary[];
  tasks: WeeklyTask[];
  announcements: AnnouncementSummary[];
  recentFiles: Array<CanvasFileSummary & { moduleCode: string; moduleTitle: string }>;
  latestChanges: DashboardChange[];
  recentGrades: GradeSummary[];
  courseProgress: CourseProgressSummary[];
  source: "live" | "fallback";
  status: "ready" | "needs-setup" | "error";
  setupMessage: string;
  userId: string | null;
  lastSyncedAt: string | null;
};
```

- [ ] **Step 2: Write the three integration tests for `lib/dashboard.ts`**

Create `tests/lib/dashboard.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const hasSupabaseConfigMock = vi.fn(() => true);
const fetchNUSModsModuleMock = vi.fn(async () => null);

vi.mock("@/lib/config", () => ({
  hasSupabaseConfig: () => hasSupabaseConfigMock(),
}));

vi.mock("@/lib/nusmods", () => ({
  fetchNUSModsModule: (...args: unknown[]) => fetchNUSModsModuleMock(...args),
}));

type QueryResult = { data: unknown; error: null | { message: string } };

const queryResponses = new Map<string, QueryResult>();

function setQueryResponse(key: string, response: QueryResult) {
  queryResponses.set(key, response);
}

function buildQueryBuilder(table: string) {
  const state = { table };
  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: async () => queryResponses.get(`${state.table}:maybeSingle`) ?? { data: null, error: null },
    then: (onFulfilled: (value: QueryResult) => unknown) =>
      Promise.resolve(queryResponses.get(state.table) ?? { data: [], error: null }).then(onFulfilled),
  };
  return builder;
}

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => buildQueryBuilder(table),
  }),
}));

beforeEach(() => {
  queryResponses.clear();
  hasSupabaseConfigMock.mockReturnValue(true);
  process.env.CANVAS_BASE_URL = "https://canvas.nus.edu.sg";
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_KEY = "service-key";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("loadDashboardData — GradeSummary derivation", () => {
  it("derives canvasUrl from CANVAS_BASE_URL + canvas_course_id + source_ref_id", async () => {
    setQueryResponse("users:maybeSingle", { data: { id: "user-1", last_synced_at: null }, error: null });
    setQueryResponse("courses", { data: [], error: null });
    setQueryResponse("tasks", { data: [], error: null });
    setQueryResponse("announcements", { data: [], error: null });
    setQueryResponse("course_modules", { data: [], error: null });
    setQueryResponse("grades", {
      data: [
        {
          id: "g1",
          score: 85,
          grade_text: "85",
          points_possible: 100,
          graded_at: "2026-04-19T00:00:00Z",
          state: "graded",
          tasks: {
            id: "t1",
            title: "Homework 1",
            source_ref_id: "42",
            courses: { code: "CS3235", canvas_course_id: "9876" },
          },
        },
      ],
      error: null,
    });

    const { loadDashboardData } = await import("@/lib/dashboard");
    const data = await loadDashboardData();
    expect(data.recentGrades).toHaveLength(1);
    expect(data.recentGrades[0].canvasUrl).toBe("https://canvas.nus.edu.sg/courses/9876/assignments/42");
    expect(data.recentGrades[0].assignmentTitle).toBe("Homework 1");
    expect(data.recentGrades[0].score).toBe(85);
  });
});

describe("loadDashboardData — CourseProgressSummary heuristic", () => {
  it("picks the first non-completed module as current", async () => {
    setQueryResponse("users:maybeSingle", { data: { id: "user-1", last_synced_at: null }, error: null });
    setQueryResponse("courses", { data: [], error: null });
    setQueryResponse("tasks", { data: [], error: null });
    setQueryResponse("announcements", { data: [], error: null });
    setQueryResponse("grades", { data: [], error: null });
    setQueryResponse("course_modules", {
      data: [
        {
          id: "cm1",
          course_id: "c1",
          name: "Week 1",
          position: 1,
          state: "completed",
          items_count: 3,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i1", title: "Intro", item_type: "File", position: 1 }],
        },
        {
          id: "cm2",
          course_id: "c1",
          name: "Week 2",
          position: 2,
          state: "unlocked",
          items_count: 2,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i2", title: "Read Chapter 2", item_type: "Page", position: 1 }],
        },
      ],
      error: null,
    });

    const { loadDashboardData } = await import("@/lib/dashboard");
    const data = await loadDashboardData();
    expect(data.courseProgress).toHaveLength(1);
    expect(data.courseProgress[0].currentModulePosition).toBe(2);
    expect(data.courseProgress[0].currentModuleName).toBe("Week 2");
    expect(data.courseProgress[0].nextItemTitle).toBe("Read Chapter 2");
    expect(data.courseProgress[0].totalModules).toBe(2);
  });

  it("falls back to the last module when every module is completed", async () => {
    setQueryResponse("users:maybeSingle", { data: { id: "user-1", last_synced_at: null }, error: null });
    setQueryResponse("courses", { data: [], error: null });
    setQueryResponse("tasks", { data: [], error: null });
    setQueryResponse("announcements", { data: [], error: null });
    setQueryResponse("grades", { data: [], error: null });
    setQueryResponse("course_modules", {
      data: [
        {
          id: "cm1",
          course_id: "c1",
          name: "Week 1",
          position: 1,
          state: "completed",
          items_count: 1,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i1", title: "Intro", item_type: "File", position: 1 }],
        },
        {
          id: "cm2",
          course_id: "c1",
          name: "Week 2",
          position: 2,
          state: "completed",
          items_count: 1,
          courses: { code: "CS3235", title: "Computer Security" },
          course_module_items: [{ id: "i2", title: "Quiz 2", item_type: "Quiz", position: 1 }],
        },
      ],
      error: null,
    });

    const { loadDashboardData } = await import("@/lib/dashboard");
    const data = await loadDashboardData();
    expect(data.courseProgress[0].currentModulePosition).toBe(2);
    expect(data.courseProgress[0].currentModuleName).toBe("Week 2");
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npx vitest run tests/lib/dashboard.test.ts`
Expected: FAIL — `recentGrades` is undefined, `courseProgress` is undefined.

- [ ] **Step 4: Extend `FALLBACK_DASHBOARD` in `lib/dashboard.ts`**

Locate `FALLBACK_DASHBOARD` (around line 133) and extend it to include the two new required fields:

```typescript
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
```

- [ ] **Step 5: Add the import for the two new types in `lib/dashboard.ts`**

Locate the existing `import type { ... } from "@/lib/contracts";` line added in Task 1 Step 3. Extend it to include the two new types:

```typescript
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
```

- [ ] **Step 6: Add the two new query-row types and query helpers to `lib/dashboard.ts`**

Add these private types near the existing private query types (around line 115 after `AnnouncementQueryRow`):

```typescript
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
```

Then add the two new query helper functions near `loadAnnouncementRows` (around line 387):

```typescript
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
```

- [ ] **Step 7: Add the mapping helpers + heuristic**

Add these functions to `lib/dashboard.ts` above `loadDashboardData` (around line 440):

```typescript
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
```

- [ ] **Step 8: Wire the new queries into `loadDashboardData`**

Locate the `Promise.all([...])` block inside `loadDashboardData` (around line 470-483). Extend it to five queries:

```typescript
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
```

- [ ] **Step 9: Assemble the two new fields and include them in the return value**

Just before the existing `return { overview: ... }` block at the end of `loadDashboardData` (around line 568), insert the assembly:

```typescript
    const canvasBaseUrl = process.env.CANVAS_BASE_URL?.trim() || "https://canvas.nus.edu.sg";
    const recentGrades: GradeSummary[] = ((gradesData ?? []) as GradeQueryRow[]).map((row) =>
      buildGradeSummary(row, canvasBaseUrl),
    );
    const courseProgress = buildCourseProgressSummaries((courseModulesData ?? []) as CourseModuleQueryRow[]);
```

Then update the return value to include `recentGrades` and `courseProgress`:

```typescript
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
```

- [ ] **Step 10: Update `tests/app/dashboard-client.test.tsx` fixtures**

Locate each `DashboardData` fixture literal in the file (there are two: `beforeSync` at the top and `afterSync` around line 140). Add `recentGrades: []` and `courseProgress: []` to each:

```typescript
const beforeSync: DashboardData = {
  overview: baseOverview,
  modules: [],
  tasks: [],
  announcements: [],
  recentFiles: [],
  latestChanges: [],
  recentGrades: [],         // NEW
  courseProgress: [],       // NEW
  source: "fallback",
  status: "needs-setup",
  setupMessage: "Run sync first.",
  userId: "user-1",
  lastSyncedAt: null,
};
```

Apply the same two fields to `afterSync` (keep its existing values intact).

- [ ] **Step 11: Run the integration tests**

Run: `npx vitest run tests/lib/dashboard.test.ts`
Expected: PASS — all 3 tests pass.

- [ ] **Step 12: Run the full test suite**

Run: `npm test`
Expected: `Test Files  9 passed (9)  Tests  25 passed (25)` (22 from Phase B + 3 new integration tests).

- [ ] **Step 13: Type check**

Run: `npx tsc --noEmit`
Expected: no errors in `app/**` or `lib/**`.

- [ ] **Step 14: Commit**

```bash
git add lib/contracts.ts lib/dashboard.ts tests/lib/dashboard.test.ts tests/app/dashboard-client.test.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): surface grades and course progress in DashboardData

Extends loadDashboardData with two new parallel Supabase queries
(grades + course_modules) and derives GradeSummary[] + 
CourseProgressSummary[] for the home widgets. Canvas assignment URLs
are derived server-side from source_ref_id + canvas_course_id; the
current-module heuristic picks the first non-completed course_module
and falls back to the last module when everything is completed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Extract existing widgets from `home-view.tsx` into `app/ui/dashboard/widgets/`

**Files:**
- Move: `app/ui/dashboard/schedule-board.tsx` → `app/ui/dashboard/widgets/schedule-board.tsx`
- Move: `app/ui/dashboard/file-card.tsx` → `app/ui/dashboard/widgets/file-card.tsx`
- Create: `app/ui/dashboard/widgets/stats-header.tsx`
- Create: `app/ui/dashboard/widgets/due-this-week-widget.tsx`
- Create: `app/ui/dashboard/widgets/recent-announcements-widget.tsx`
- Create: `app/ui/dashboard/widgets/new-files-widget.tsx`
- Create: `app/ui/dashboard/widgets/course-list-widget.tsx`
- Create: `tests/app/ui/widgets/stats-header.test.tsx`
- Create: `tests/app/ui/widgets/due-this-week-widget.test.tsx`
- Create: `tests/app/ui/widgets/recent-announcements-widget.test.tsx`
- Create: `tests/app/ui/widgets/new-files-widget.test.tsx`
- Create: `tests/app/ui/widgets/course-list-widget.test.tsx`
- Modify: `app/ui/dashboard/home-view.tsx` (becomes ~90 lines of layout glue)
- Modify: `app/ui/dashboard/module-view.tsx` (import path for `FileCard` changes)

**Rationale:** Once each widget is its own file with its own test, Task 4 can add the two brand-new widgets in isolation. Each widget follows the pattern: typed props, self-contained empty state, single purpose.

- [ ] **Step 1: Move `schedule-board.tsx` and `file-card.tsx` into `widgets/`**

```bash
mkdir -p app/ui/dashboard/widgets
git mv app/ui/dashboard/schedule-board.tsx app/ui/dashboard/widgets/schedule-board.tsx
git mv app/ui/dashboard/file-card.tsx app/ui/dashboard/widgets/file-card.tsx
```

Update the import in `app/ui/dashboard/module-view.tsx` (around line 8):

```typescript
// Before
import { FileCard } from "./file-card";
// After
import { FileCard } from "./widgets/file-card";
```

- [ ] **Step 2: Write the failing test for `StatsHeader`**

Create `tests/app/ui/widgets/stats-header.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { StatsHeader } from "@/app/ui/dashboard/widgets/stats-header";

describe("StatsHeader", () => {
  it("renders the three numeric stats and accent colors", () => {
    render(<StatsHeader dueSoonCount={3} openTaskCount={12} unreadAnnouncementCount={5} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText(/Due soon/i)).toBeInTheDocument();
    expect(screen.getByText(/Open tasks/i)).toBeInTheDocument();
    expect(screen.getByText(/Changes/i)).toBeInTheDocument();
  });

  it("renders a zero state when counts are 0", () => {
    render(<StatsHeader dueSoonCount={0} openTaskCount={0} unreadAnnouncementCount={0} />);
    const zeros = screen.getAllByText("0");
    expect(zeros.length).toBe(3);
  });
});
```

Run: `npx vitest run tests/app/ui/widgets/stats-header.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `StatsHeader` widget**

Create `app/ui/dashboard/widgets/stats-header.tsx`:

```tsx
"use client";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

function formatTodayLabel() {
  return new Intl.DateTimeFormat("en-SG", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
}

export function StatsHeader({
  dueSoonCount,
  openTaskCount,
  unreadAnnouncementCount,
}: {
  dueSoonCount: number;
  openTaskCount: number;
  unreadAnnouncementCount: number;
}) {
  return (
    <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5 shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">Home</p>
          <h1 className="mt-2 font-[var(--font-lora)] text-[28px] font-medium tracking-[-0.03em] text-stone-950">
            {getGreeting()}
          </h1>
          <p className="mt-1 text-sm text-stone-500">{formatTodayLabel()} · live Canvas workspace</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[320px]">
          <StatCard value={dueSoonCount} label="Due soon" accent={dueSoonCount > 0 ? "#dc2626" : "#a8a29e"} />
          <StatCard value={openTaskCount} label="Open tasks" accent="#d97706" />
          <StatCard value={unreadAnnouncementCount} label="Changes" accent="#2563eb" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ value, label, accent }: { value: number; label: string; accent: string }) {
  return (
    <div className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-4 py-3 text-center">
      <p className="font-[var(--font-lora)] text-2xl font-semibold leading-none" style={{ color: accent }}>
        {value}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-stone-400">{label}</p>
    </div>
  );
}
```

Run: `npx vitest run tests/app/ui/widgets/stats-header.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 4: Write the failing test for `DueThisWeekWidget`**

Create `tests/app/ui/widgets/due-this-week-widget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import type { WeeklyTask } from "@/lib/contracts";
import { DueThisWeekWidget } from "@/app/ui/dashboard/widgets/due-this-week-widget";

const sampleTasks: WeeklyTask[] = [
  {
    id: "t1",
    title: "Assignment 1",
    moduleCode: "CS3235",
    dueLabel: "in 3 days",
    dueDate: "2026-04-25T00:00:00Z",
    status: "due-soon",
    source: "canvas",
  },
  {
    id: "t2",
    title: "Read Chapter 5",
    moduleCode: "CS2103",
    dueLabel: "in 5 days",
    dueDate: "2026-04-27T00:00:00Z",
    status: "upcoming",
    source: "canvas",
  },
];

describe("DueThisWeekWidget", () => {
  it("renders the task rows with module code and title", () => {
    render(<DueThisWeekWidget tasks={sampleTasks} />);
    expect(screen.getByText("Assignment 1")).toBeInTheDocument();
    expect(screen.getByText("CS3235")).toBeInTheDocument();
    expect(screen.getByText("Read Chapter 5")).toBeInTheDocument();
    expect(screen.getByText("CS2103")).toBeInTheDocument();
  });

  it("renders empty state when no tasks", () => {
    render(<DueThisWeekWidget tasks={[]} />);
    expect(screen.getByText(/Nothing due this week/i)).toBeInTheDocument();
  });
});
```

Run: `npx vitest run tests/app/ui/widgets/due-this-week-widget.test.tsx`
Expected: FAIL.

- [ ] **Step 5: Create `DueThisWeekWidget`**

Create `app/ui/dashboard/widgets/due-this-week-widget.tsx`:

```tsx
"use client";

import type { WeeklyTask } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

export function DueThisWeekWidget({ tasks }: { tasks: WeeklyTask[] }) {
  return (
    <SectionCard title="Due this week" eyebrow="Next 7 days">
      {tasks.length === 0 ? (
        <EmptyState title="Nothing due this week." copy="You are clear for the next 7 days based on synced assignments." />
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.id} className="flex items-start gap-3 rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
              <span className="mt-1 h-2 w-2 rounded-full" style={{ backgroundColor: colorForModule(task.moduleCode) }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-stone-900">{task.title}</p>
                <p className="mt-1 text-[11px] text-stone-500">
                  <span className="font-semibold" style={{ color: colorForModule(task.moduleCode) }}>
                    {task.moduleCode}
                  </span>{" "}
                  · {task.dueLabel}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
```

Run: `npx vitest run tests/app/ui/widgets/due-this-week-widget.test.tsx`
Expected: PASS — 2 tests.

- [ ] **Step 6: Write the failing test for `RecentAnnouncementsWidget`**

Create `tests/app/ui/widgets/recent-announcements-widget.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import type { AnnouncementSummary } from "@/lib/contracts";
import { RecentAnnouncementsWidget } from "@/app/ui/dashboard/widgets/recent-announcements-widget";

const sample: AnnouncementSummary[] = [
  {
    id: "a1",
    title: "Mid-semester exam",
    moduleCode: "CS3235",
    summary: "Remember to bring your student ID on the day of the exam.",
    postedLabel: "2 days ago",
    postedAt: "2026-04-18T00:00:00Z",
    importance: "normal",
  },
];

describe("RecentAnnouncementsWidget", () => {
  it("renders the announcement row with summary preview", () => {
    render(
      <RecentAnnouncementsWidget
        announcements={sample}
        seenAnnouncements={{}}
        onMarkAnnouncementSeen={() => {}}
      />,
    );
    expect(screen.getByText("Mid-semester exam")).toBeInTheDocument();
    expect(screen.getByText(/Remember to bring/)).toBeInTheDocument();
    expect(screen.getByText("CS3235")).toBeInTheDocument();
  });

  it("renders empty state when no announcements", () => {
    render(
      <RecentAnnouncementsWidget
        announcements={[]}
        seenAnnouncements={{}}
        onMarkAnnouncementSeen={() => {}}
      />,
    );
    expect(screen.getByText(/No recent announcements/i)).toBeInTheDocument();
  });

  it("toggles expansion when an announcement row is clicked", () => {
    render(
      <RecentAnnouncementsWidget
        announcements={sample}
        seenAnnouncements={{}}
        onMarkAnnouncementSeen={() => {}}
      />,
    );
    const row = screen.getByRole("button", { name: /Mid-semester exam/i });
    fireEvent.click(row);
    // The widget marks itself as expanded — summary stays; no hidden content to reveal yet, just toggle state.
    expect(row.getAttribute("aria-expanded")).toBe("true");
  });
});
```

Run: `npx vitest run tests/app/ui/widgets/recent-announcements-widget.test.tsx`
Expected: FAIL.

- [ ] **Step 7: Create `RecentAnnouncementsWidget`**

Create `app/ui/dashboard/widgets/recent-announcements-widget.tsx`:

```tsx
"use client";

import { useState } from "react";

import type { AnnouncementSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

export function RecentAnnouncementsWidget({
  announcements,
  seenAnnouncements,
  onMarkAnnouncementSeen,
}: {
  announcements: AnnouncementSummary[];
  seenAnnouncements: Record<string, boolean>;
  onMarkAnnouncementSeen: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggle = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <SectionCard title="Recent announcements" eyebrow="Latest updates across all modules">
      {announcements.length === 0 ? (
        <EmptyState title="No recent announcements." copy="Announcements will appear here once Canvas publishes them." />
      ) : (
        <div className="space-y-2">
          {announcements.map((announcement) => {
            const unseen = !seenAnnouncements[announcement.id];
            const isExpanded = !!expanded[announcement.id];
            return (
              <button
                key={announcement.id}
                type="button"
                onClick={() => toggle(announcement.id)}
                aria-expanded={isExpanded}
                className={`w-full rounded-[10px] border px-3 py-3 text-left ${unseen ? "border-blue-200 bg-blue-50/40" : "border-stone-200 bg-[#fcfbf9]"}`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[0.08em]" style={{ color: colorForModule(announcement.moduleCode) }}>
                    {announcement.moduleCode}
                  </span>
                  <span className="text-[10px] text-stone-400">{announcement.postedLabel}</span>
                </div>
                <p className="mt-2 text-[13px] font-medium leading-5 text-stone-900">{announcement.title}</p>
                <p className={`mt-1 text-[12px] leading-5 text-stone-600 ${isExpanded ? "" : "line-clamp-3"}`}>
                  {announcement.summary}
                </p>
                {isExpanded ? (
                  <div className="mt-3 flex items-center gap-2">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(event) => {
                        event.stopPropagation();
                        onMarkAnnouncementSeen(announcement.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.stopPropagation();
                          onMarkAnnouncementSeen(announcement.id);
                        }
                      }}
                      className="rounded-[7px] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600"
                    >
                      {seenAnnouncements[announcement.id] ? "Seen" : "Mark seen"}
                    </span>
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
```

Run: `npx vitest run tests/app/ui/widgets/recent-announcements-widget.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 8: Write the failing test for `NewFilesWidget`**

Create `tests/app/ui/widgets/new-files-widget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import type { CanvasFileSummary } from "@/lib/contracts";
import { NewFilesWidget } from "@/app/ui/dashboard/widgets/new-files-widget";

type NewFile = CanvasFileSummary & { moduleCode: string; moduleTitle: string };

const sample: NewFile[] = [
  {
    id: "f1",
    name: "lecture-01.pdf",
    type: "lecture",
    category: "lecture",
    uploadedLabel: "today",
    uploadedAt: "2026-04-20T00:00:00Z",
    summary: "Week 1 introduction",
    canvasUrl: "https://canvas.nus.edu.sg/...",
    extractedText: null,
    previewKind: "pdf",
    contentType: "application/pdf",
    moduleCode: "CS3235",
    moduleTitle: "Computer Security",
  },
];

describe("NewFilesWidget", () => {
  it("renders the file card with filename + module code", () => {
    render(<NewFilesWidget files={sample} onOpenModule={() => {}} />);
    expect(screen.getByText("lecture-01.pdf")).toBeInTheDocument();
    expect(screen.getByText("CS3235")).toBeInTheDocument();
  });

  it("renders empty state when no files", () => {
    render(<NewFilesWidget files={[]} onOpenModule={() => {}} />);
    expect(screen.getByText(/No new files this week/i)).toBeInTheDocument();
  });
});
```

Run: expected FAIL.

- [ ] **Step 9: Create `NewFilesWidget`**

Create `app/ui/dashboard/widgets/new-files-widget.tsx`:

```tsx
"use client";

import type { CanvasFileSummary } from "@/lib/contracts";
import { EmptyState, SectionCard } from "@/app/ui/dashboard/shared";
import { FileCard } from "./file-card";

export function NewFilesWidget({
  files,
  onOpenModule,
}: {
  files: Array<CanvasFileSummary & { moduleCode: string; moduleTitle: string }>;
  onOpenModule?: (code: string) => void;
}) {
  return (
    <SectionCard title="New files" eyebrow="Updated in the last 7 days">
      {files.length === 0 ? (
        <EmptyState title="No new files this week." copy="Files synced from Canvas in the last 7 days will appear here." />
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <FileCard key={file.id} file={file} moduleCode={file.moduleCode} onOpenModule={onOpenModule} showModuleCode={true} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
```

Run test: expected PASS (2 tests).

- [ ] **Step 10: Write the failing test for `CourseListWidget`**

Create `tests/app/ui/widgets/course-list-widget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import type { ModuleSummary } from "@/lib/contracts";
import { CourseListWidget } from "@/app/ui/dashboard/widgets/course-list-widget";

const sample: ModuleSummary[] = [
  {
    id: "m1",
    code: "CS3235",
    title: "Computer Security",
    taskCount: 2,
    announcementCount: 3,
    lastSyncLabel: "today",
    sync_enabled: true,
    files: [],
    nextTask: null,
    latestAnnouncement: null,
    recentFile: null,
    examSummary: null,
    nusmods: null,
  },
];

describe("CourseListWidget", () => {
  it("renders each module card", () => {
    render(<CourseListWidget modules={sample} onOpenModule={() => {}} />);
    expect(screen.getByText("CS3235")).toBeInTheDocument();
    expect(screen.getByText("Computer Security")).toBeInTheDocument();
    expect(screen.getByText("2 tasks")).toBeInTheDocument();
  });

  it("renders empty state when no modules", () => {
    render(<CourseListWidget modules={[]} onOpenModule={() => {}} />);
    expect(screen.getByText(/No courses yet/i)).toBeInTheDocument();
  });
});
```

Run: FAIL.

- [ ] **Step 11: Create `CourseListWidget`**

Create `app/ui/dashboard/widgets/course-list-widget.tsx`:

```tsx
"use client";

import type { ModuleSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, Pill, SectionCard } from "@/app/ui/dashboard/shared";

export function CourseListWidget({
  modules,
  onOpenModule,
}: {
  modules: ModuleSummary[];
  onOpenModule: (code: string) => void;
}) {
  return (
    <SectionCard title="Modules" eyebrow="Course workspaces">
      {modules.length === 0 ? (
        <EmptyState title="No courses yet." copy="Run Sync Canvas to discover your courses." />
      ) : (
        <div className="space-y-2">
          {modules.map((module) => (
            <button
              key={module.id}
              type="button"
              onClick={() => onOpenModule(module.code)}
              className="w-full rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3 text-left transition hover:border-stone-300 hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorForModule(module.code) }} />
                    <p className="text-[11px] font-bold tracking-[0.08em]" style={{ color: colorForModule(module.code) }}>
                      {module.code}
                    </p>
                  </div>
                  <p className="mt-2 text-[13px] font-medium text-stone-900">{module.title}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Pill>{module.taskCount} tasks</Pill>
                    <Pill>{module.files.length} files</Pill>
                  </div>
                </div>
                <span className="text-[11px] text-stone-400">{module.lastSyncLabel}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionCard>
  );
}
```

Run test: PASS (2 tests).

- [ ] **Step 12: Rewrite `home-view.tsx` as layout glue**

Replace the entire file with:

```tsx
"use client";

import { useMemo, useState } from "react";

import type { DashboardData } from "@/lib/contracts";
import { EmptyState } from "@/app/ui/dashboard/shared";
import { CourseListWidget } from "./widgets/course-list-widget";
import { DueThisWeekWidget } from "./widgets/due-this-week-widget";
import { NewFilesWidget } from "./widgets/new-files-widget";
import { RecentAnnouncementsWidget } from "./widgets/recent-announcements-widget";
import { ScheduleBoard } from "./widgets/schedule-board";
import { StatsHeader } from "./widgets/stats-header";

export function HomeView({
  data,
  onOpenModule,
  seenAnnouncements,
  onMarkAnnouncementSeen,
}: {
  data: DashboardData;
  onOpenModule: (code: string) => void;
  seenAnnouncements: Record<string, boolean>;
  onMarkAnnouncementSeen: (id: string) => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);

  const activeModules = useMemo(() => data.modules.filter((module) => module.sync_enabled), [data.modules]);
  const activeModuleCodes = useMemo(() => new Set(activeModules.map((module) => module.code)), [activeModules]);

  const filteredTasks = useMemo(
    () => data.tasks.filter((task) => activeModuleCodes.has(task.moduleCode)),
    [activeModuleCodes, data.tasks],
  );
  const filteredAnnouncements = useMemo(
    () => data.announcements.filter((announcement) => activeModuleCodes.has(announcement.moduleCode)).slice(0, 10),
    [activeModuleCodes, data.announcements],
  );
  const filteredRecentFiles = useMemo(
    () => data.recentFiles.filter((file) => activeModuleCodes.has(file.moduleCode)).slice(0, 8),
    [activeModuleCodes, data.recentFiles],
  );
  const dueThisWeek = useMemo(() => {
    const horizon = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return [...filteredTasks]
      .filter((task) => {
        if (!task.dueDate) return false;
        const time = new Date(task.dueDate).getTime();
        return Number.isFinite(time) && time <= horizon;
      })
      .sort((left, right) => new Date(left.dueDate!).getTime() - new Date(right.dueDate!).getTime())
      .slice(0, 6);
  }, [filteredTasks]);

  const unreadAnnouncementCount = filteredAnnouncements.filter(
    (announcement) => !seenAnnouncements[announcement.id],
  ).length;
  const dueSoonCount = filteredTasks.filter((task) => task.status === "due-soon").length;

  return (
    <div className="space-y-4">
      <StatsHeader
        dueSoonCount={dueSoonCount}
        openTaskCount={filteredTasks.length}
        unreadAnnouncementCount={unreadAnnouncementCount}
      />

      {activeModules.length === 0 ? (
        <EmptyState
          title="No modules synced yet"
          copy="Use Sync Canvas to discover modules from Canvas, then enable the ones that should power your command board."
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="space-y-4">
            <ScheduleBoard modules={activeModules} tasks={filteredTasks} weekOffset={weekOffset} onWeekOffsetChange={setWeekOffset} />
            <DueThisWeekWidget tasks={dueThisWeek} />
            <RecentAnnouncementsWidget
              announcements={filteredAnnouncements}
              seenAnnouncements={seenAnnouncements}
              onMarkAnnouncementSeen={onMarkAnnouncementSeen}
            />
            <NewFilesWidget files={filteredRecentFiles} onOpenModule={onOpenModule} />
          </div>

          <div className="space-y-4">
            {/* CourseProgressWidget and RecentGradesWidget added in Task 4 */}
            <CourseListWidget modules={activeModules} onOpenModule={onOpenModule} />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 13: Run the full test suite**

Run: `npm test`
Expected: `Test Files  14 passed (14)  Tests  35 passed (35)` (25 from before + 10 new widget tests across 5 widget files, counting `StatsHeader 2 + DueThisWeek 2 + Announcements 3 + NewFiles 2 + CourseList 2 = 11`; total = 25 + 11 = 36 — if you see 36, that's fine; the +11 vs the +10 I said reflects the extra announcement-expand test. Either 35 or 36 is acceptable).

Run: `npx tsc --noEmit` → no new errors.

- [ ] **Step 14: Commit**

```bash
git add app/ui/dashboard/widgets app/ui/dashboard/home-view.tsx app/ui/dashboard/module-view.tsx tests/app/ui/widgets
git commit -m "$(cat <<'EOF'
refactor(ui): extract widgets from home-view into dedicated files

home-view.tsx shrinks from 316 to ~90 lines of layout glue. Each
widget lives in its own file under app/ui/dashboard/widgets/ with a
matching render + empty-state test: StatsHeader, DueThisWeekWidget,
RecentAnnouncementsWidget (with inline expand), NewFilesWidget,
CourseListWidget. ScheduleBoard and FileCard move to the same folder
for consistency.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Build the two new widgets (`CourseProgressWidget`, `RecentGradesWidget`)

**Files:**
- Create: `app/ui/dashboard/widgets/course-progress-widget.tsx`
- Create: `app/ui/dashboard/widgets/recent-grades-widget.tsx`
- Create: `tests/app/ui/widgets/course-progress-widget.test.tsx`
- Create: `tests/app/ui/widgets/recent-grades-widget.test.tsx`
- Modify: `app/ui/dashboard/home-view.tsx` (wire the two new widgets into the right column)

- [ ] **Step 1: Write the failing test for `CourseProgressWidget`**

Create `tests/app/ui/widgets/course-progress-widget.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import type { CourseProgressSummary } from "@/lib/contracts";
import { CourseProgressWidget } from "@/app/ui/dashboard/widgets/course-progress-widget";

const sample: CourseProgressSummary[] = [
  {
    courseId: "c1",
    moduleCode: "CS3235",
    courseTitle: "Computer Security",
    totalModules: 3,
    currentModulePosition: 2,
    currentModuleName: "Part I: System Security",
    nextItemTitle: "1-1 Special Memory Errors",
  },
];

describe("CourseProgressWidget", () => {
  it("renders per-course progress card", () => {
    render(<CourseProgressWidget courses={sample} onOpenModule={() => {}} />);
    expect(screen.getByText("CS3235")).toBeInTheDocument();
    expect(screen.getByText(/Module 2 of 3/i)).toBeInTheDocument();
    expect(screen.getByText("Part I: System Security")).toBeInTheDocument();
    expect(screen.getByText("1-1 Special Memory Errors")).toBeInTheDocument();
  });

  it("renders empty-state card when a course has no modules synced", () => {
    render(
      <CourseProgressWidget
        courses={[
          {
            courseId: "c2",
            moduleCode: "CS2103",
            courseTitle: "Software Engineering",
            totalModules: 0,
            currentModulePosition: null,
            currentModuleName: null,
            nextItemTitle: null,
          },
        ]}
        onOpenModule={() => {}}
      />,
    );
    expect(screen.getByText("CS2103")).toBeInTheDocument();
    expect(screen.getByText(/Canvas Modules not synced yet/i)).toBeInTheDocument();
  });

  it("renders widget-level empty state when no courses", () => {
    render(<CourseProgressWidget courses={[]} onOpenModule={() => {}} />);
    expect(screen.getByText(/Canvas Modules not synced yet/i)).toBeInTheDocument();
  });

  it("calls onOpenModule when a course card is clicked", () => {
    const onOpen = vi.fn();
    render(<CourseProgressWidget courses={sample} onOpenModule={onOpen} />);
    const card = screen.getByRole("button", { name: /CS3235/i });
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith("CS3235");
  });
});
```

Run: FAIL.

- [ ] **Step 2: Create `CourseProgressWidget`**

Create `app/ui/dashboard/widgets/course-progress-widget.tsx`:

```tsx
"use client";

import type { CourseProgressSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

export function CourseProgressWidget({
  courses,
  onOpenModule,
}: {
  courses: CourseProgressSummary[];
  onOpenModule: (code: string) => void;
}) {
  return (
    <SectionCard title="Course progress" eyebrow="Where you are in each course">
      {courses.length === 0 ? (
        <EmptyState title="Canvas Modules not synced yet." copy="Trigger a sync for a course to see its progress here." />
      ) : (
        <div className="space-y-2">
          {courses.map((course) => {
            const isEmpty = course.totalModules === 0 || course.currentModulePosition == null;
            return (
              <button
                key={course.courseId}
                type="button"
                onClick={() => onOpenModule(course.moduleCode)}
                className="w-full rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3 text-left transition hover:border-stone-300 hover:bg-white"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[11px] font-bold tracking-[0.08em]"
                    style={{ color: colorForModule(course.moduleCode) }}
                  >
                    {course.moduleCode}
                  </span>
                  {!isEmpty ? (
                    <span className="text-[10px] text-stone-400">
                      Module {course.currentModulePosition} of {course.totalModules}
                    </span>
                  ) : null}
                </div>
                {isEmpty ? (
                  <p className="mt-2 text-[12px] leading-5 text-stone-500">Canvas Modules not synced yet.</p>
                ) : (
                  <>
                    <p className="mt-2 text-[13px] font-medium leading-5 text-stone-900">{course.currentModuleName}</p>
                    {course.nextItemTitle ? (
                      <p className="mt-1 text-[12px] leading-5 text-stone-600">Next: {course.nextItemTitle}</p>
                    ) : null}
                  </>
                )}
              </button>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
```

Run test: PASS (4 tests).

- [ ] **Step 3: Write the failing test for `RecentGradesWidget`**

Create `tests/app/ui/widgets/recent-grades-widget.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import type { GradeSummary } from "@/lib/contracts";
import { RecentGradesWidget } from "@/app/ui/dashboard/widgets/recent-grades-widget";

const sample: GradeSummary[] = [
  {
    id: "g1",
    moduleCode: "CS3235",
    assignmentTitle: "Homework 1",
    score: 20,
    gradeText: "20",
    pointsPossible: 25,
    state: "graded",
    gradedAt: "2026-04-19T00:00:00Z",
    gradedLabel: "yesterday",
    canvasUrl: "https://canvas.nus.edu.sg/courses/9876/assignments/42",
  },
  {
    id: "g2",
    moduleCode: "CS3235",
    assignmentTitle: "Homework 2",
    score: null,
    gradeText: null,
    pointsPossible: null,
    state: "unsubmitted",
    gradedAt: null,
    gradedLabel: "",
    canvasUrl: null,
  },
];

describe("RecentGradesWidget", () => {
  it("renders grade rows with module code, title, and score", () => {
    render(<RecentGradesWidget grades={sample} />);
    expect(screen.getByText("Homework 1")).toBeInTheDocument();
    expect(screen.getByText(/20 \/ 25/)).toBeInTheDocument();
    expect(screen.getByText(/graded/i)).toBeInTheDocument();
  });

  it("shows a state badge for unsubmitted grades without a score", () => {
    render(<RecentGradesWidget grades={sample} />);
    expect(screen.getByText("Homework 2")).toBeInTheDocument();
    expect(screen.getByText(/unsubmitted/i)).toBeInTheDocument();
  });

  it("links rows with a canvasUrl to Canvas in a new tab", () => {
    render(<RecentGradesWidget grades={sample} />);
    const link = screen.getByRole("link", { name: /Homework 1/i });
    expect(link).toHaveAttribute("href", sample[0].canvasUrl);
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("renders empty state when no grades", () => {
    render(<RecentGradesWidget grades={[]} />);
    expect(screen.getByText(/No grades yet/i)).toBeInTheDocument();
  });
});
```

Run: FAIL.

- [ ] **Step 4: Create `RecentGradesWidget`**

Create `app/ui/dashboard/widgets/recent-grades-widget.tsx`:

```tsx
"use client";

import type { GradeSummary } from "@/lib/contracts";
import { colorForModule, EmptyState, SectionCard } from "@/app/ui/dashboard/shared";

function formatScore(grade: GradeSummary): string | null {
  if (grade.score == null) return null;
  if (grade.pointsPossible != null) return `${grade.score} / ${grade.pointsPossible}`;
  return `${grade.score}`;
}

export function RecentGradesWidget({ grades }: { grades: GradeSummary[] }) {
  return (
    <SectionCard title="Recent grades" eyebrow="Your last 5 graded items">
      {grades.length === 0 ? (
        <EmptyState title="No grades yet." copy="Once Canvas posts a grade, it will appear here." />
      ) : (
        <div className="space-y-2">
          {grades.map((grade) => {
            const scoreLabel = formatScore(grade);
            const content = (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold tracking-[0.08em]" style={{ color: colorForModule(grade.moduleCode) }}>
                    {grade.moduleCode}
                  </span>
                  {grade.state ? <span className="text-[10px] text-stone-500">{grade.state}</span> : null}
                  {grade.gradedLabel ? <span className="text-[10px] text-stone-400">{grade.gradedLabel}</span> : null}
                </div>
                <p className="mt-2 text-[13px] font-medium leading-5 text-stone-900">{grade.assignmentTitle}</p>
                {scoreLabel ? <p className="mt-1 text-[12px] leading-5 text-stone-700">{scoreLabel}</p> : null}
              </>
            );

            return grade.canvasUrl ? (
              <a
                key={grade.id}
                href={grade.canvasUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3 transition hover:border-stone-300 hover:bg-white"
              >
                {content}
              </a>
            ) : (
              <div
                key={grade.id}
                className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3"
              >
                {content}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
```

Run test: PASS (4 tests).

- [ ] **Step 5: Wire the two new widgets into `home-view.tsx`**

Edit `app/ui/dashboard/home-view.tsx` — add the two imports:

```tsx
import { CourseProgressWidget } from "./widgets/course-progress-widget";
import { RecentGradesWidget } from "./widgets/recent-grades-widget";
```

Replace the right-column content in the JSX:

```tsx
          <div className="space-y-4">
            {/* CourseProgressWidget and RecentGradesWidget added in Task 4 */}
            <CourseListWidget modules={activeModules} onOpenModule={onOpenModule} />
          </div>
```

with:

```tsx
          <div className="space-y-4">
            <CourseProgressWidget
              courses={data.courseProgress.filter((course) => activeModuleCodes.has(course.moduleCode))}
              onOpenModule={onOpenModule}
            />
            <RecentGradesWidget grades={data.recentGrades.filter((grade) => activeModuleCodes.has(grade.moduleCode))} />
            <CourseListWidget modules={activeModules} onOpenModule={onOpenModule} />
          </div>
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: `Test Files  16 passed (16)  Tests  44 passed (44)` (35–36 from Task 3 + 8 new widget tests).

Run: `npx tsc --noEmit` → no new errors.

- [ ] **Step 7: Commit**

```bash
git add app/ui/dashboard/widgets/course-progress-widget.tsx app/ui/dashboard/widgets/recent-grades-widget.tsx app/ui/dashboard/home-view.tsx tests/app/ui/widgets/course-progress-widget.test.tsx tests/app/ui/widgets/recent-grades-widget.test.tsx
git commit -m "$(cat <<'EOF'
feat(ui): surface Phase B resources via two new home widgets

CourseProgressWidget renders a per-course card showing "Module N of M"
plus the next uncompleted item title (derived by the current-module
heuristic in lib/dashboard). RecentGradesWidget lists the last 5
graded submissions with score / points / state, linking each row to
the Canvas assignment page in a new tab. Both widgets are wired into
the home view's right column, filtered by active module code.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: `Test Files  16 passed (16)  Tests  44 passed (44)` (Phase B 22 + dashboard integration 3 + widget 19 = 44).

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/**` or `lib/**`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: success.

- [ ] **Step 5: Grep sweep — no widget imports `DashboardData`**

Run: `grep -rn "DashboardData" app/ui/dashboard/widgets --include="*.tsx"`
Expected: zero matches — each widget imports only its slice type.

Run: `grep -rn "from \"@/lib/dashboard\"" app/ui/dashboard/widgets --include="*.tsx"`
Expected: zero matches — widgets import types from `@/lib/contracts` only.

- [ ] **Step 6: Dev server smoke test**

Start `npm run dev`. Visit `http://localhost:3001/` (or 3000 if available). Check:

- Home page renders all 8 widgets (StatsHeader, ScheduleBoard, DueThisWeek, RecentAnnouncements, NewFiles, CourseProgress, RecentGrades, CourseList).
- CourseProgress card for CS3235 shows the correct current module (should be "Part I: System Security" since Canvas likely has Week 1 completed).
- RecentGrades shows 5 most recent grades with state badges.
- Clicking a CourseProgress card opens the `ModuleView`.
- Clicking a RecentGrades row opens the Canvas assignment URL in a new tab.
- Clicking a RecentAnnouncements row expands it inline.
- Clicking a NewFiles row opens the preview dialog.
- Courses without `course_modules` rows show the per-card empty state inside CourseProgress.

- [ ] **Step 7: Announce completion**

Phase C is complete. Next up: Phase D (per-course tabbed drill-in with Files / Announcements / Modules / Pages / Grades tabs).

---

## Summary of commits produced by this plan

1. `refactor(types): move dashboard data types to lib/contracts` (Task 1)
2. `feat(dashboard): surface grades and course progress in DashboardData` (Task 2)
3. `refactor(ui): extract widgets from home-view into dedicated files` (Task 3)
4. `feat(ui): surface Phase B resources via two new home widgets` (Task 4)

Task 5 produces no commit — it's verification-only.

---

## Known gotchas / risks

| Risk | Mitigation |
|---|---|
| Task 1 breaks an import I didn't enumerate | Grep-sweep in Step 7 catches any stragglers. Task 1 commit is purely a type-move so any breakage surfaces on `tsc --noEmit` in Step 5. |
| `loadDashboardData` test mock doesn't match how the real Supabase client returns data | Integration test mocks the specific `.from(...)` shape used in production. If a later query adds a method call not in the mock's builder, that test will throw and flag the gap. |
| Current-module heuristic picks the wrong module when Canvas's `state` field is missing | Widget still renders "Module N of M" + next item title, so even a suboptimal pick is informative, not broken. See spec §11 risks. |
| Widgets accidentally share state via peer imports | File-structure discipline (Step 14 grep sweep) enforces: widgets import only from `@/lib/contracts` and `@/app/ui/dashboard/shared`. |
| `home-view.tsx` refactor breaks the existing `dashboard-client.test.tsx` rendered-DOM assertions | Task 3 preserves the rendered text (module codes, greeting, stats). Section titles change ("Upcoming" → "Due this week", "What changed" → "Recent announcements" + "New files") — any test asserting the old labels needs updating. The plan's Task 3 commit covers the one existing test file's fixture update in Task 2. |
