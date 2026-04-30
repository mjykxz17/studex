# In-App Content Viewers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render every Canvas course item — pages, announcements, assignments, files, and the Modules tree — directly inside Studex without redirecting users to canvas.nus.edu.sg.

**Architecture:** Canvas content (HTML pages, announcement bodies, assignment descriptions) is sanitized server-side using `isomorphic-dompurify` and rendered in modal dialogs. Page bodies and assignment descriptions load lazily via dedicated API routes; announcement bodies ship with the dashboard payload (already loaded). The Canvas Modules tree (`course_modules` + `course_module_items`) becomes the primary in-module navigation, dispatching each item type to its appropriate inline viewer. DOCX files render inline via `mammoth`; videos render via the existing file-proxy route as `<video>` elements; Panopto links transform `/Viewer.aspx` → `/Embed.aspx` and embed in iframes.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Supabase (Postgres) · Tailwind v4 · vitest + React Testing Library · `isomorphic-dompurify` (new) · `mammoth` (new)

**Estimated effort:** ~13 hours of focused work for one developer.

---

## File Map

**New files:**
- `lib/sanitize.ts` — `sanitizeHtml(html)` wrapper around DOMPurify with Canvas-friendly allowlist
- `lib/file-render.ts` — `renderDocxToHtml(buf)` wrapper around mammoth
- `lib/canvas-url.ts` — `panoptoEmbedUrl(viewerUrl)` and helpers for external URL transforms
- `app/api/pages/[pageId]/route.ts` — GET sanitized page body
- `app/api/tasks/[taskId]/route.ts` — GET sanitized assignment description
- `app/ui/page-viewer-dialog.tsx` — Modal that renders a Canvas Page
- `app/ui/announcement-detail-dialog.tsx` — Modal that renders an announcement body
- `app/ui/assignment-detail-dialog.tsx` — Modal that renders an assignment description
- `app/ui/dashboard/widgets/module-tree.tsx` — Renders Canvas Modules tree with item-type-aware viewer dispatch
- `supabase/migrations/0008_add_task_description.sql` — Migration adding `description_html`, `description_text`

**Modified files:**
- `lib/sync.ts:250-315` — Persist assignment description (currently only hashed)
- `lib/dashboard.ts` — Load `canvas_pages` per module; expose `bodyHtml` on announcements; add `descriptionHtml` to tasks; load full module tree
- `lib/contracts.ts` — Add `CanvasPageSummary`, `CourseModuleSummary`, `CourseModuleItemSummary`; extend `AnnouncementSummary` with `bodyHtml`; extend `WeeklyTask` with `descriptionHtml`
- `lib/cheatsheet/ingest.ts` — Reuse `renderDocxToHtml` so DOCX cheatsheets get richer markdown extraction (optional, see Task 10)
- `app/ui/file-preview-dialog.tsx` — Wire DOCX rendering, video tag for video MIME types, demote "Open in Canvas" to secondary
- `app/ui/dashboard/module-view.tsx` — Replace summary-only announcement list with click-to-expand; add Pages section; add module-tree widget; wire task → assignment dialog
- `app/ui/dashboard/widgets/file-card.tsx` — Demote "Open in Canvas" link
- `supabase/schema.sql` — Mirror migration 0008 in canonical schema
- `package.json` — Add `isomorphic-dompurify`, `mammoth`

---

## Task 1: Add HTML sanitizer foundation

**Files:**
- Create: `lib/sanitize.ts`
- Create: `tests/lib/sanitize.test.ts`
- Modify: `package.json`

Canvas content (pages, announcements, assignment descriptions) is HTML written by lecturers — generally trusted but it can include `<script>`, `on*` event attributes, and external iframes. Every viewer in this plan funnels HTML through this single helper. Server-side sanitization means the client only ever renders trusted strings; the API never returns raw Canvas HTML to the browser.

- [ ] **Step 1: Add the dependency**

```bash
npm install isomorphic-dompurify@^2.27.0
```

Expected: package added; lockfile updated.

- [ ] **Step 2: Write the failing test**

Create `tests/lib/sanitize.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { sanitizeHtml } from "@/lib/sanitize";

describe("sanitizeHtml", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeHtml("<p>safe</p><script>alert(1)</script>");
    expect(out).toContain("<p>safe</p>");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
  });

  it("strips on* event handlers", () => {
    const out = sanitizeHtml('<a href="/x" onclick="bad()">link</a>');
    expect(out).toContain("href=\"/x\"");
    expect(out).not.toContain("onclick");
  });

  it("retains formatting tags Canvas commonly emits", () => {
    const html =
      '<p><strong>Title</strong></p><ul><li>one</li></ul><pre><code>x</code></pre><table><tr><td>cell</td></tr></table>';
    const out = sanitizeHtml(html);
    expect(out).toContain("<strong>");
    expect(out).toContain("<ul>");
    expect(out).toContain("<li>");
    expect(out).toContain("<pre>");
    expect(out).toContain("<code>");
    expect(out).toContain("<table>");
    expect(out).toContain("<td>");
  });

  it("forces target=_blank rel=noopener on outbound links", () => {
    const out = sanitizeHtml('<a href="https://example.com">x</a>');
    expect(out).toContain("target=\"_blank\"");
    expect(out).toContain("rel=\"noopener noreferrer\"");
  });

  it("strips javascript: URLs", () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });

  it("returns empty string for null/undefined input", () => {
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(undefined)).toBe("");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/sanitize.test.ts`
Expected: FAIL — module `@/lib/sanitize` does not exist.

- [ ] **Step 4: Implement the sanitizer**

Create `lib/sanitize.ts`:

```typescript
import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "a", "p", "br", "hr", "div", "span", "strong", "em", "b", "i", "u",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "td", "th",
  "img",
  "sub", "sup",
];

const ALLOWED_ATTR = ["href", "src", "alt", "title", "target", "rel", "colspan", "rowspan"];

export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return "";

  // Force outbound links to open in a new tab with safe rel.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A" && node.getAttribute("href")) {
      node.setAttribute("target", "_blank");
      node.setAttribute("rel", "noopener noreferrer");
    }
  });

  const clean = DOMPurify.sanitize(input, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });

  DOMPurify.removeAllHooks();
  return clean;
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run tests/lib/sanitize.test.ts`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add lib/sanitize.ts tests/lib/sanitize.test.ts package.json package-lock.json
git commit -m "feat(sanitize): add HTML sanitizer for Canvas content"
```

---

## Task 2: Migrate schema to persist assignment descriptions

**Files:**
- Create: `supabase/migrations/0008_add_task_description.sql`
- Modify: `supabase/schema.sql` (canonical schema mirror)

The `tasks` table currently stores `description_hash` for change detection but discards the description text — assignments cannot be read in-app. We need two new columns: `description_html` (sanitized HTML for rendering) and `description_text` (plain text for AI / search / cheatsheet context).

- [ ] **Step 1: Create the migration**

Create `supabase/migrations/0008_add_task_description.sql`:

```sql
-- 0008: persist assignment descriptions so they can be rendered in-app.
-- Previously only description_hash was stored (for change detection).
-- description_html is sanitized server-side before storage; description_text
-- is the stripped plain-text version used by AI / cheatsheet pipelines.

alter table tasks add column if not exists description_html text;
alter table tasks add column if not exists description_text text;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase SQL Editor (Dashboard → SQL Editor → paste contents of `supabase/migrations/0008_add_task_description.sql` → Run).

Verify with:
```sql
select column_name from information_schema.columns
  where table_name = 'tasks' and column_name in ('description_html', 'description_text');
```
Expected: 2 rows.

- [ ] **Step 3: Mirror the change in canonical schema**

Modify `supabase/schema.sql`. Find the `create table tasks (` block and update it to include the new columns alongside `description_hash`:

```sql
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
  description_html text,
  description_text text,
  weight float,
  unique (user_id, source, source_ref_id)
);
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0008_add_task_description.sql supabase/schema.sql
git commit -m "feat(schema): add tasks.description_html and description_text"
```

---

## Task 3: Persist assignment descriptions during sync

**Files:**
- Modify: `lib/sync.ts:250-315` (`syncAssignment` function)
- Create: `tests/lib/sync-assignment.test.ts`

The sync currently strips and hashes assignment descriptions for change detection but does not persist them. Update the upsert to write `description_html` (sanitized via Task 1's helper) and `description_text` (already computed via `stripHtml` + `sanitizeSyncText`).

- [ ] **Step 1: Write the failing test**

Create `tests/lib/sync-assignment.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { sanitizeHtml } from "@/lib/sanitize";

describe("assignment description persistence (contract)", () => {
  it("sanitizeHtml is wired the way syncAssignment will use it", () => {
    // Sanity: the helper sync uses produces safe HTML.
    const dirty = '<p>Assignment intro</p><script>x</script>';
    const clean = sanitizeHtml(dirty);
    expect(clean).toContain("<p>");
    expect(clean).not.toContain("<script");
  });
});
```

This is a contract sanity test; the real assertion is exercised end-to-end through the dev server.

- [ ] **Step 2: Run test to verify pass (depends on Task 1)**

Run: `npx vitest run tests/lib/sync-assignment.test.ts`
Expected: 1 passed.

- [ ] **Step 3: Update `syncAssignment` to store description**

Modify `lib/sync.ts`. Find the function `syncAssignment` (starts around line 250). At the top of the function, import `sanitizeHtml`. At the file's existing import block, add:

```typescript
import { sanitizeHtml } from "@/lib/sanitize";
```

Then replace the `taskPayload` object inside `syncAssignment` so it writes the new columns:

```typescript
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
```

(The previous `descriptionText` computation from line ~257 is replaced; remove the now-redundant earlier line.)

- [ ] **Step 4: Update the unchanged-check to include description**

Within the same function, the `taskUnchanged` short-circuit relies on hash + due_at. Leave as is — hash equality already guarantees identical sanitized text. No change needed.

- [ ] **Step 5: Manually verify via dev server**

Restart dev server (`npm run dev`), trigger a fresh sync of one course in the UI, then in the Supabase SQL editor run:
```sql
select id, title, length(description_html), length(description_text)
  from tasks where description_html is not null limit 5;
```
Expected: rows with non-null `description_html` and `description_text` lengths > 0 (for assignments that actually have descriptions in Canvas).

- [ ] **Step 6: Commit**

```bash
git add lib/sync.ts tests/lib/sync-assignment.test.ts
git commit -m "feat(sync): persist sanitized assignment description"
```

---

## Task 4: Add pages API route

**Files:**
- Create: `app/api/pages/[pageId]/route.ts`
- Create: `tests/app/api/pages-route.test.ts`

Pages are stored in `canvas_pages.body_html` but never exposed to the browser. Add an authenticated route that returns the sanitized body for a single page, scoped to the current (demo) user.

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/pages-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMaybeSingle = vi.fn();
const mockEq2 = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: mockFrom }),
}));

vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: async () => ({ id: "user-1", email: "test@x", last_synced_at: null }),
}));

import { GET } from "@/app/api/pages/[pageId]/route";

describe("GET /api/pages/[pageId]", () => {
  beforeEach(() => {
    mockMaybeSingle.mockReset();
  });

  it("returns sanitized body when page is found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: { id: "p1", title: "Week 1", body_html: "<p>hi</p><script>x</script>" },
      error: null,
    });

    const res = await GET(new Request("http://x/api/pages/p1"), { params: Promise.resolve({ pageId: "p1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.title).toBe("Week 1");
    expect(json.bodyHtml).toContain("<p>hi</p>");
    expect(json.bodyHtml).not.toContain("<script");
  });

  it("returns 404 when page not found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(new Request("http://x/api/pages/p1"), { params: Promise.resolve({ pageId: "p1" }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/pages-route.test.ts`
Expected: FAIL — route module does not exist.

- [ ] **Step 3: Implement the route**

Create `app/api/pages/[pageId]/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { ensureDemoUser } from "@/lib/demo-user";
import { sanitizeHtml } from "@/lib/sanitize";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ pageId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { pageId } = await context.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("canvas_pages")
    .select("id, title, body_html")
    .eq("id", pageId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; title: string | null; body_html: string | null }>();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "Page not found" }, { status: 404 });
  }

  return Response.json({
    id: data.id,
    title: data.title ?? "Untitled page",
    bodyHtml: sanitizeHtml(data.body_html),
  });
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/app/api/pages-route.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/pages/\[pageId\]/route.ts tests/app/api/pages-route.test.ts
git commit -m "feat(api): add GET /api/pages/[pageId] returning sanitized body"
```

---

## Task 5: Add tasks API route for assignment descriptions

**Files:**
- Create: `app/api/tasks/[taskId]/route.ts`
- Create: `tests/app/api/tasks-route.test.ts`

Same pattern as Task 4, but for assignment descriptions. Lazy-load on click rather than ship every description in the dashboard payload.

- [ ] **Step 1: Write the failing test**

Create `tests/app/api/tasks-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMaybeSingle = vi.fn();
const mockEq2 = vi.fn(() => ({ maybeSingle: mockMaybeSingle }));
const mockEq1 = vi.fn(() => ({ eq: mockEq2 }));
const mockSelect = vi.fn(() => ({ eq: mockEq1 }));
const mockFrom = vi.fn(() => ({ select: mockSelect }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({ from: mockFrom }),
}));
vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: async () => ({ id: "user-1", email: "x", last_synced_at: null }),
}));

import { GET } from "@/app/api/tasks/[taskId]/route";

describe("GET /api/tasks/[taskId]", () => {
  beforeEach(() => mockMaybeSingle.mockReset());

  it("returns sanitized description and metadata", async () => {
    mockMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "t1",
        title: "Lab 1",
        due_at: "2026-05-01T23:59:00Z",
        description_html: "<p>do it</p><script>x</script>",
      },
      error: null,
    });
    const res = await GET(new Request("http://x/api/tasks/t1"), { params: Promise.resolve({ taskId: "t1" }) });
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.title).toBe("Lab 1");
    expect(json.descriptionHtml).toContain("<p>do it</p>");
    expect(json.descriptionHtml).not.toContain("<script");
  });

  it("returns 404 when task not found", async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const res = await GET(new Request("http://x/api/tasks/t1"), { params: Promise.resolve({ taskId: "t1" }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/api/tasks-route.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route**

Create `app/api/tasks/[taskId]/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { ensureDemoUser } from "@/lib/demo-user";
import { sanitizeHtml } from "@/lib/sanitize";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { taskId } = await context.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, due_at, description_html")
    .eq("id", taskId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; title: string | null; due_at: string | null; description_html: string | null }>();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: "Task not found" }, { status: 404 });

  return Response.json({
    id: data.id,
    title: data.title ?? "Untitled task",
    dueAt: data.due_at,
    descriptionHtml: sanitizeHtml(data.description_html),
  });
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/app/api/tasks-route.test.ts`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/api/tasks/\[taskId\]/route.ts tests/app/api/tasks-route.test.ts
git commit -m "feat(api): add GET /api/tasks/[taskId] returning description"
```

---

## Task 6: Extend dashboard contracts and loader

**Files:**
- Modify: `lib/contracts.ts`
- Modify: `lib/dashboard.ts`

Expose page summaries (id + title only — bodies load on demand) and full announcement bodies (already loaded server-side) so the UI dialogs have the data they need without extra round-trips for announcements.

- [ ] **Step 1: Add new types to contracts**

Modify `lib/contracts.ts`. After the `AnnouncementSummary` type, add:

```typescript
export type CanvasPageSummary = {
  id: string;
  title: string;
  updatedAt: string | null;
  updatedLabel: string;
};

export type CourseModuleItemSummary = {
  id: string;
  title: string;
  itemType: string;        // 'Page' | 'File' | 'Assignment' | 'ExternalUrl' | 'SubHeader' | 'Discussion' | ...
  position: number | null;
  contentRef: string | null;   // canvas_file_id, page_url, or assignment_id depending on itemType
  externalUrl: string | null;
  indent: number | null;
};

export type CourseModuleSummary = {
  id: string;
  name: string;
  position: number | null;
  state: string | null;
  itemsCount: number | null;
  items: CourseModuleItemSummary[];
};
```

Then extend the existing `AnnouncementSummary`:

```typescript
export type AnnouncementSummary = {
  id: string;
  title: string;
  moduleCode: string;
  summary: string;
  bodyHtml: string;            // ADDED
  postedLabel: string;
  postedAt: string | null;
  importance: "high" | "normal" | "low";
};
```

Extend the `WeeklyTask` type:

```typescript
export type WeeklyTask = {
  id: string;
  title: string;
  moduleCode: string;
  dueLabel: string;
  dueDate?: string | null;
  status: "due-soon" | "upcoming" | "no-date";
  source: string;
  sourceRefId: string | null;  // ADDED — Canvas assignment id; module tree uses it to dispatch Assignment items
  hasDescription: boolean;     // ADDED — UI uses this to decide whether to show the "details" button
};
```

In `lib/dashboard.ts`, the `tasks` Supabase select must include `source_ref_id` (it likely already does for change detection); when mapping `TaskQueryRow → WeeklyTask`, expose:
```typescript
sourceRefId: row.source_ref_id ?? null,
```

Extend the `ModuleSummary` type:

```typescript
export type ModuleSummary = {
  // ...existing fields...
  pages: CanvasPageSummary[];          // ADDED
  courseModules: CourseModuleSummary[]; // ADDED
};
```

- [ ] **Step 2: Load pages and module tree in dashboard**

Modify `lib/dashboard.ts`. In the function that builds `ModuleSummary` (search for where `ModuleSummary` is composed from `ModuleQueryRow`), extend the Supabase query for the module to include pages and course modules.

The Supabase select for the module query currently looks like:
```
"id, code, title, last_canvas_sync, sync_enabled, canvas_files(...)"
```

Replace it with:
```
"id, code, title, last_canvas_sync, sync_enabled, canvas_files(id, filename, file_type, uploaded_at, extracted_text, canvas_url), canvas_pages(id, title, updated_at), course_modules(id, name, position, state, items_count, course_module_items(id, title, item_type, position, content_ref, external_url, indent))"
```

And update the `ModuleQueryRow` type to include the matching fields:

```typescript
type ModuleQueryRow = {
  id: string;
  code: string | null;
  title: string | null;
  last_canvas_sync: string | null;
  sync_enabled: boolean | null;
  canvas_files: Array<{ /* unchanged */ }> | null;
  canvas_pages: Array<{ id: string; title: string | null; updated_at: string | null }> | null;
  course_modules: Array<{
    id: string;
    name: string | null;
    position: number | null;
    state: string | null;
    items_count: number | null;
    course_module_items: Array<{
      id: string;
      title: string | null;
      item_type: string | null;
      position: number | null;
      content_ref: string | null;
      external_url: string | null;
      indent: number | null;
    }> | null;
  }> | null;
};
```

When mapping `ModuleQueryRow` → `ModuleSummary`, add:

```typescript
pages: (row.canvas_pages ?? [])
  .map((p) => ({
    id: p.id,
    title: p.title ?? "Untitled page",
    updatedAt: p.updated_at,
    updatedLabel: p.updated_at ? formatRelativeLabel(p.updated_at) : "—",
  }))
  .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")),

courseModules: (row.course_modules ?? [])
  .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  .map((m) => ({
    id: m.id,
    name: m.name ?? "Untitled module",
    position: m.position,
    state: m.state,
    itemsCount: m.items_count,
    items: (m.course_module_items ?? [])
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .map((it) => ({
        id: it.id,
        title: it.title ?? "Untitled item",
        itemType: it.item_type ?? "Unknown",
        position: it.position,
        contentRef: it.content_ref,
        externalUrl: it.external_url,
        indent: it.indent,
      })),
  })),
```

(`formatRelativeLabel` already exists in `lib/dashboard.ts` as `weekdayFormatter` / similar — reuse the local helper that produces strings like "today" / "2d ago". If no such helper exists, format as `new Date(updatedAt).toLocaleDateString("en-SG", { day: "numeric", month: "short" })`.)

- [ ] **Step 3: Expose announcement body and task description flag**

Still in `lib/dashboard.ts`, find the `AnnouncementQueryRow` type and confirm `body_raw` is selected. The existing code reads `body_raw` already (line 49) but discards it. In the announcement-mapping code, add:

```typescript
bodyHtml: sanitizeHtml(row.body_raw),
```

Add the import at the top: `import { sanitizeHtml } from "@/lib/sanitize";`.

For tasks, extend the `tasks` Supabase select to include `description_html` (and `description_text` if used elsewhere), then in the mapper:

```typescript
hasDescription: Boolean(row.description_html && row.description_html.length > 0),
```

- [ ] **Step 4: Verify the dev server still type-checks**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add lib/contracts.ts lib/dashboard.ts
git commit -m "feat(dashboard): load pages, module tree, announcement bodies"
```

---

## Task 7: Build the Page viewer dialog

**Files:**
- Create: `app/ui/page-viewer-dialog.tsx`
- Create: `tests/app/ui/page-viewer-dialog.test.tsx`

A modal that fetches `/api/pages/{id}` on open and renders the sanitized HTML inside a scrollable card. Mirrors the modal pattern in `file-preview-dialog.tsx` (portal + escape-to-close + body-scroll lock).

- [ ] **Step 1: Write the failing test**

Create `tests/app/ui/page-viewer-dialog.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PageViewerDialog } from "@/app/ui/page-viewer-dialog";

describe("PageViewerDialog", () => {
  it("fetches and renders the page body when opened", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ id: "p1", title: "Week 1 Notes", bodyHtml: "<p>Hello world</p>" }),
          { status: 200 },
        ),
      ),
    );

    render(<PageViewerDialog page={{ id: "p1", title: "Week 1 Notes", updatedAt: null, updatedLabel: "—" }} moduleCode="CS3235" />);
    await userEvent.click(screen.getByRole("button", { name: /open/i }));

    await waitFor(() => {
      expect(screen.getByText("Hello world")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "boom" }), { status: 500 })),
    );

    render(<PageViewerDialog page={{ id: "p1", title: "Week 1", updatedAt: null, updatedLabel: "—" }} moduleCode="CS3235" />);
    await userEvent.click(screen.getByRole("button", { name: /open/i }));

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/ui/page-viewer-dialog.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the component**

Create `app/ui/page-viewer-dialog.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import type { CanvasPageSummary } from "@/lib/contracts";

import { useBodyScrollLock, useEscapeToClose } from "./use-modal-behavior";

type Props = {
  page: CanvasPageSummary;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; html: string; title: string }
  | { kind: "error"; message: string };

export function PageViewerDialog({
  page,
  moduleCode,
  buttonClassName = "rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700",
  buttonLabel = "Open",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen || state.kind !== "idle") return;
    setState({ kind: "loading" });
    fetch(`/api/pages/${page.id}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load page" });
          return;
        }
        setState({ kind: "ready", html: json.bodyHtml, title: json.title });
      })
      .catch((err) => {
        setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to load" });
      });
  }, [isOpen, page.id, state.kind]);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      {typeof document !== "undefined" && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
              }}
            >
              <div className="flex h-full items-center justify-center">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="flex h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white shadow-2xl"
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                        {moduleCode} · Page
                      </p>
                      <h2 className="mt-2 text-lg font-semibold tracking-tight text-stone-950">
                        {state.kind === "ready" ? state.title : page.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-6">
                    {state.kind === "loading" ? (
                      <p className="text-sm text-stone-500">Loading…</p>
                    ) : state.kind === "error" ? (
                      <p className="text-sm text-rose-700">Failed to load page: {state.message}</p>
                    ) : state.kind === "ready" ? (
                      <div
                        className="prose prose-stone max-w-none"
                        dangerouslySetInnerHTML={{ __html: state.html }}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/app/ui/page-viewer-dialog.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/page-viewer-dialog.tsx tests/app/ui/page-viewer-dialog.test.tsx
git commit -m "feat(ui): add Canvas Page viewer dialog"
```

---

## Task 8: Build the Announcement detail dialog

**Files:**
- Create: `app/ui/announcement-detail-dialog.tsx`
- Create: `tests/app/ui/announcement-detail-dialog.test.tsx`

Same modal pattern, but the body is already in the dashboard payload (from Task 6) so no fetch needed — render directly.

- [ ] **Step 1: Write the failing test**

Create `tests/app/ui/announcement-detail-dialog.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AnnouncementDetailDialog } from "@/app/ui/announcement-detail-dialog";

const a = {
  id: "a1",
  title: "Tutorial 5 rescheduled",
  moduleCode: "CS3235",
  summary: "Moved to Friday",
  bodyHtml: "<p>Tutorial 5 has been moved to <strong>Friday</strong>.</p>",
  postedLabel: "today",
  postedAt: "2026-04-30T00:00:00Z",
  importance: "normal" as const,
};

describe("AnnouncementDetailDialog", () => {
  it("renders the sanitized body when opened", async () => {
    render(<AnnouncementDetailDialog announcement={a} />);
    await userEvent.click(screen.getByRole("button", { name: /read full/i }));
    expect(screen.getByText("Friday")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/ui/announcement-detail-dialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

Create `app/ui/announcement-detail-dialog.tsx`:

```typescript
"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

import type { AnnouncementSummary } from "@/lib/contracts";

import { useBodyScrollLock, useEscapeToClose } from "./use-modal-behavior";

type Props = {
  announcement: AnnouncementSummary;
  buttonClassName?: string;
};

export function AnnouncementDetailDialog({
  announcement,
  buttonClassName = "rounded-[8px] border border-stone-200 bg-white px-3 py-1.5 text-[11px] font-medium text-stone-700",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        Read full
      </button>
      {typeof document !== "undefined" && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
              }}
            >
              <div className="flex h-full items-center justify-center">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="flex h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white shadow-2xl"
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                        {announcement.moduleCode} · Announcement · {announcement.postedLabel}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold tracking-tight text-stone-950">
                        {announcement.title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-6">
                    {announcement.bodyHtml ? (
                      <div
                        className="prose prose-stone max-w-none"
                        dangerouslySetInnerHTML={{ __html: announcement.bodyHtml }}
                      />
                    ) : (
                      <p className="text-sm text-stone-500">No body content.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/app/ui/announcement-detail-dialog.test.tsx`
Expected: 1 passed.

- [ ] **Step 5: Wire into module-view**

Modify `app/ui/dashboard/module-view.tsx`. Find the announcements rendering block (around line 157-170) and add the dialog as a trigger:

```tsx
{announcements.map((announcement) => (
  <div key={announcement.id} className="rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
    <div className="flex items-center justify-between gap-2">
      <Pill tone={announcement.importance === "high" ? "rose" : "slate"}>{announcement.postedLabel}</Pill>
      <AnnouncementDetailDialog announcement={announcement} />
    </div>
    <p className="mt-2 text-[13px] font-medium text-stone-900">{announcement.title}</p>
    <p className="mt-2 whitespace-pre-line text-[12px] leading-5 text-stone-600">{announcement.summary}</p>
  </div>
))}
```

Add the import at the top of `module-view.tsx`:
```typescript
import { AnnouncementDetailDialog } from "@/app/ui/announcement-detail-dialog";
```

- [ ] **Step 6: Commit**

```bash
git add app/ui/announcement-detail-dialog.tsx tests/app/ui/announcement-detail-dialog.test.tsx app/ui/dashboard/module-view.tsx
git commit -m "feat(ui): add announcement detail dialog with full body"
```

---

## Task 9: Build the Assignment detail dialog

**Files:**
- Create: `app/ui/assignment-detail-dialog.tsx`
- Create: `tests/app/ui/assignment-detail-dialog.test.tsx`

Lazy-load `/api/tasks/{id}` on open. Same modal shell as Task 7.

- [ ] **Step 1: Write the failing test**

Create `tests/app/ui/assignment-detail-dialog.test.tsx`:

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AssignmentDetailDialog } from "@/app/ui/assignment-detail-dialog";

describe("AssignmentDetailDialog", () => {
  it("fetches and renders description on open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            id: "t1",
            title: "Lab 1: Buffer overflow",
            dueAt: "2026-05-01T23:59:00Z",
            descriptionHtml: "<p>Submit by Friday</p>",
          }),
          { status: 200 },
        ),
      ),
    );

    render(<AssignmentDetailDialog taskId="t1" title="Lab 1" moduleCode="CS3235" />);
    await userEvent.click(screen.getByRole("button", { name: /details/i }));
    await waitFor(() => {
      expect(screen.getByText("Submit by Friday")).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/ui/assignment-detail-dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the component**

Create `app/ui/assignment-detail-dialog.tsx`:

```typescript
"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useBodyScrollLock, useEscapeToClose } from "./use-modal-behavior";

type Props = {
  taskId: string;
  title: string;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; descriptionHtml: string; dueAt: string | null; title: string }
  | { kind: "error"; message: string };

export function AssignmentDetailDialog({
  taskId,
  title,
  moduleCode,
  buttonClassName = "rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700",
  buttonLabel = "Details",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));

  useEffect(() => {
    if (!isOpen || state.kind !== "idle") return;
    setState({ kind: "loading" });
    fetch(`/api/tasks/${taskId}`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load assignment" });
          return;
        }
        setState({
          kind: "ready",
          descriptionHtml: json.descriptionHtml,
          dueAt: json.dueAt,
          title: json.title,
        });
      })
      .catch((err) => {
        setState({ kind: "error", message: err instanceof Error ? err.message : "Failed" });
      });
  }, [isOpen, taskId, state.kind]);

  const dueLabel =
    state.kind === "ready" && state.dueAt
      ? new Date(state.dueAt).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })
      : null;

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      {typeof document !== "undefined" && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
              }}
            >
              <div className="flex h-full items-center justify-center">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="flex h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-white shadow-2xl"
                >
                  <div className="flex shrink-0 items-start justify-between gap-4 border-b border-stone-200 px-5 py-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                        {moduleCode} · Assignment {dueLabel ? `· Due ${dueLabel}` : ""}
                      </p>
                      <h2 className="mt-2 text-lg font-semibold tracking-tight text-stone-950">
                        {state.kind === "ready" ? state.title : title}
                      </h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>
                  <div className="min-h-0 flex-1 overflow-auto p-6">
                    {state.kind === "loading" ? (
                      <p className="text-sm text-stone-500">Loading…</p>
                    ) : state.kind === "error" ? (
                      <p className="text-sm text-rose-700">Failed to load: {state.message}</p>
                    ) : state.kind === "ready" ? (
                      state.descriptionHtml ? (
                        <div
                          className="prose prose-stone max-w-none"
                          dangerouslySetInnerHTML={{ __html: state.descriptionHtml }}
                        />
                      ) : (
                        <p className="text-sm text-stone-500">No description provided.</p>
                      )
                    ) : null}
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/app/ui/assignment-detail-dialog.test.tsx`
Expected: 1 passed.

- [ ] **Step 5: Wire into module-view tasks list**

Modify `app/ui/dashboard/module-view.tsx`. Find the tasks rendering block (search for `EmptyState title="No open tasks"`) and add the dialog button next to each task item. The pattern (using existing `tasks` prop):

```tsx
{tasks.map((task) => (
  <div key={task.id} className="flex items-center justify-between rounded-[10px] border border-stone-200 bg-[#fcfbf9] px-3 py-3">
    <div className="min-w-0">
      <p className="text-[13px] font-medium text-stone-900">{task.title}</p>
      <p className="mt-1 text-[11px] text-stone-500">{task.dueLabel}</p>
    </div>
    {task.hasDescription ? (
      <AssignmentDetailDialog taskId={task.id} title={task.title} moduleCode={module.code} />
    ) : null}
  </div>
))}
```

Add the import:
```typescript
import { AssignmentDetailDialog } from "@/app/ui/assignment-detail-dialog";
```

- [ ] **Step 6: Commit**

```bash
git add app/ui/assignment-detail-dialog.tsx tests/app/ui/assignment-detail-dialog.test.tsx app/ui/dashboard/module-view.tsx
git commit -m "feat(ui): add assignment detail dialog with description"
```

---

## Task 10: Build the Module-tree widget

**Files:**
- Create: `app/ui/dashboard/widgets/module-tree.tsx`
- Create: `tests/app/ui/widgets/module-tree.test.tsx`
- Modify: `app/ui/dashboard/module-view.tsx`

Renders the Canvas Modules tree (Week 1 → items) with each item dispatching to the right viewer based on `itemType`. Items map to viewers as follows:

- `Page` → `PageViewerDialog` keyed by `contentRef` (page_url) — needs to look up the page's `id` from the module's `pages` array
- `File` → `FilePreviewDialog` keyed by `contentRef` (canvas_file_id) — needs to look up the file's local `id`
- `Assignment` → `AssignmentDetailDialog` keyed by `contentRef` (assignment_id → tasks.source_ref_id)
- `ExternalUrl` → opens `externalUrl` (Panopto handled by Task 12)
- `SubHeader` → renders as a section divider, no click target

- [ ] **Step 1: Write the failing test**

Create `tests/app/ui/widgets/module-tree.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { ModuleTree } from "@/app/ui/dashboard/widgets/module-tree";

describe("ModuleTree", () => {
  const sample = {
    moduleCode: "CS3235",
    courseModules: [
      {
        id: "m1",
        name: "Week 1",
        position: 1,
        state: "active",
        itemsCount: 2,
        items: [
          { id: "i1", title: "Welcome", itemType: "SubHeader", position: 1, contentRef: null, externalUrl: null, indent: 0 },
          { id: "i2", title: "Lecture 1 slides", itemType: "File", position: 2, contentRef: "canvas-file-1", externalUrl: null, indent: 0 },
        ],
      },
    ],
    pages: [],
    files: [
      { id: "local-f1", name: "lecture-1.pdf", type: "lecture", category: "lecture", uploadedLabel: "today", uploadedAt: null, summary: "", canvasUrl: null, extractedText: null, previewKind: "pdf" as const, contentType: null },
    ],
    tasks: [],
  };

  it("renders module names and items", () => {
    render(<ModuleTree {...sample} />);
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("Welcome")).toBeInTheDocument();
    expect(screen.getByText("Lecture 1 slides")).toBeInTheDocument();
  });

  it("renders empty state when no modules", () => {
    render(<ModuleTree moduleCode="CS3235" courseModules={[]} pages={[]} files={[]} tasks={[]} />);
    expect(screen.getByText(/no canvas modules/i)).toBeInTheDocument();
  });
});
```

The `canvas-file-1` content_ref refers to Canvas's own file id; the local DB id `local-f1` is what we wire to FilePreviewDialog. The widget needs a lookup map between them — see Step 3.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/ui/widgets/module-tree.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement the widget**

Create `app/ui/dashboard/widgets/module-tree.tsx`:

```typescript
"use client";

import type {
  CanvasFileSummary,
  CanvasPageSummary,
  CourseModuleSummary,
  WeeklyTask,
} from "@/lib/contracts";

import { AssignmentDetailDialog } from "@/app/ui/assignment-detail-dialog";
import { FilePreviewDialog } from "@/app/ui/file-preview-dialog";
import { PageViewerDialog } from "@/app/ui/page-viewer-dialog";

import { Pill } from "../shared";

type Props = {
  moduleCode: string;
  courseModules: CourseModuleSummary[];
  pages: CanvasPageSummary[];
  files: CanvasFileSummary[];
  tasks: WeeklyTask[];
};

export function ModuleTree({ moduleCode, courseModules, pages, files, tasks }: Props) {
  if (courseModules.length === 0) {
    return (
      <div className="rounded-[10px] border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center">
        <p className="text-[12px] text-stone-500">No Canvas modules yet — sync to populate the lecturer's structure.</p>
      </div>
    );
  }

  // Build lookup maps so module items can dispatch to the right local entity.
  // content_ref on a File item is the Canvas file ID; we have to resolve it to our local id.
  // Tasks (assignments) are keyed by source_ref_id which equals content_ref for Assignment items.
  // Pages don't actually need a lookup if the API can accept page_url, but we built /api/pages/[pageId]
  // taking the local id — so we map page_url → local page id here.
  const pagesByUrl = new Map<string, CanvasPageSummary>();
  for (const p of pages) {
    // CanvasPageSummary doesn't carry page_url; module-tree resolves by title fallback.
    pagesByUrl.set(p.title, p);
  }
  const fileByCanvasId = new Map<string, CanvasFileSummary>();
  for (const f of files) {
    // CanvasFileSummary doesn't carry canvas_file_id either; same caveat — see Step 5 for follow-up.
    fileByCanvasId.set(f.id, f);
  }
  // Module-tree Assignment items reference the Canvas assignment id (content_ref),
  // which equals tasks.source_ref_id, NOT the local task UUID.
  const taskBySourceRef = new Map<string, WeeklyTask>();
  for (const t of tasks) {
    if (t.sourceRefId) taskBySourceRef.set(t.sourceRefId, t);
  }

  return (
    <div className="flex flex-col gap-4">
      {courseModules.map((m) => (
        <section key={m.id} className="rounded-[10px] border border-stone-200 bg-white">
          <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <div className="flex items-center gap-2">
              <Pill tone="blue">#{m.position ?? "?"}</Pill>
              <h4 className="text-[13px] font-semibold text-stone-900">{m.name}</h4>
            </div>
            <span className="text-[11px] text-stone-500">{m.itemsCount ?? m.items.length} items</span>
          </header>
          <ul className="flex flex-col">
            {m.items.map((it) => {
              const indentPx = 16 + (it.indent ?? 0) * 16;
              const baseClass = "flex items-center justify-between gap-3 border-b border-stone-100 px-4 py-2 last:border-b-0";
              const titleClass = "text-[12px] text-stone-800";

              if (it.itemType === "SubHeader") {
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-500">{it.title}</span>
                  </li>
                );
              }

              if (it.itemType === "Page" && it.contentRef) {
                const page = pagesByUrl.get(it.title);
                if (!page) {
                  return (
                    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                      <span className={titleClass}>{it.title}</span>
                      <span className="text-[10px] text-stone-400">page not synced</span>
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <PageViewerDialog page={page} moduleCode={moduleCode} buttonLabel="Open" />
                  </li>
                );
              }

              if (it.itemType === "File" && it.contentRef) {
                const file = fileByCanvasId.get(it.contentRef);
                if (!file) {
                  return (
                    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                      <span className={titleClass}>{it.title}</span>
                      <span className="text-[10px] text-stone-400">file not synced</span>
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <FilePreviewDialog file={file} moduleCode={moduleCode} buttonLabel="Open" />
                  </li>
                );
              }

              if (it.itemType === "Assignment" && it.contentRef) {
                const task = taskBySourceRef.get(it.contentRef);
                if (!task) {
                  return (
                    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                      <span className={titleClass}>{it.title}</span>
                      <span className="text-[10px] text-stone-400">assignment not synced</span>
                    </li>
                  );
                }
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <AssignmentDetailDialog taskId={task.id} title={task.title} moduleCode={moduleCode} buttonLabel="Open" />
                  </li>
                );
              }

              if (it.itemType === "ExternalUrl" && it.externalUrl) {
                return (
                  <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                    <span className={titleClass}>{it.title}</span>
                    <a
                      href={it.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
                    >
                      Open link
                    </a>
                  </li>
                );
              }

              return (
                <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
                  <span className={titleClass}>{it.title}</span>
                  <span className="text-[10px] text-stone-400">{it.itemType}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/app/ui/widgets/module-tree.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Improve File / Page lookup keys**

The lookup-by-title-or-id in Step 3 is fragile (collisions on identical filenames). Strengthen it by extending `CanvasPageSummary` with `pageUrl: string` and `CanvasFileSummary` with `canvasFileId: string`, then map by those.

In `lib/contracts.ts`:
```typescript
export type CanvasPageSummary = {
  id: string;
  pageUrl: string;       // ADDED
  title: string;
  updatedAt: string | null;
  updatedLabel: string;
};

export type CanvasFileSummary = {
  // ...existing fields...
  canvasFileId: string | null;   // ADDED
};
```

In `lib/dashboard.ts` page mapping (added in Task 6 Step 2), include `page_url`:
```sql
canvas_pages(id, page_url, title, updated_at)
```
and
```typescript
.map((p) => ({
  id: p.id,
  pageUrl: p.page_url ?? "",
  title: p.title ?? "Untitled page",
  updatedAt: p.updated_at,
  updatedLabel: ...,
}))
```

Same for `canvas_files` — extend the select to `canvas_file_id` and pass it through to `CanvasFileSummary`.

Then in `module-tree.tsx`, replace the lookup maps:
```typescript
const pagesByUrl = new Map(pages.map((p) => [p.pageUrl, p]));
const fileByCanvasId = new Map(
  files.filter((f): f is CanvasFileSummary & { canvasFileId: string } => Boolean(f.canvasFileId))
    .map((f) => [f.canvasFileId, f])
);
```

Run the existing module-tree test — adjust the test fixture `files[0]` to include `canvasFileId: "canvas-file-1"`. Re-run:

Run: `npx vitest run tests/app/ui/widgets/module-tree.test.tsx`
Expected: 2 passed.

- [ ] **Step 6: Wire into module-view**

Modify `app/ui/dashboard/module-view.tsx`. Add a "Module structure" section above the existing Files section:

```tsx
import { ModuleTree } from "./widgets/module-tree";

// ...inside the component, in the main content area:
<section className="space-y-3">
  <div className="flex items-center justify-between">
    <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-stone-500">Module structure</h3>
    <Pill>{module.courseModules.length} modules</Pill>
  </div>
  <ModuleTree
    moduleCode={module.code}
    courseModules={module.courseModules}
    pages={module.pages}
    files={module.files}
    tasks={tasks}
  />
</section>
```

- [ ] **Step 7: Commit**

```bash
git add app/ui/dashboard/widgets/module-tree.tsx tests/app/ui/widgets/module-tree.test.tsx app/ui/dashboard/module-view.tsx lib/contracts.ts lib/dashboard.ts
git commit -m "feat(ui): add module tree widget with item viewer dispatch"
```

---

## Task 11: DOCX inline rendering with mammoth

**Files:**
- Modify: `package.json`
- Create: `lib/file-render.ts`
- Create: `tests/lib/file-render.test.ts`
- Create: `app/api/files/[fileId]/docx/route.ts`
- Modify: `app/ui/file-preview-dialog.tsx`

DOCX files currently fall back to extracted text. With `mammoth` we render them as styled HTML inline. PPTX still uses extracted text — there's no JS-only PPTX renderer worth shipping; if a user explicitly wants a visual preview of a deck, a future task will convert it to PDF server-side.

- [ ] **Step 1: Add the dependency**

```bash
npm install mammoth@^1.11.0
```

- [ ] **Step 2: Write the failing test**

Create `tests/lib/file-render.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

vi.mock("mammoth", () => ({
  default: {
    convertToHtml: vi.fn(async () => ({ value: "<p>From mammoth</p>", messages: [] })),
  },
}));

import { renderDocxToHtml } from "@/lib/file-render";

describe("renderDocxToHtml", () => {
  it("returns sanitized HTML from a buffer", async () => {
    const html = await renderDocxToHtml(Buffer.from("fake-docx-bytes"));
    expect(html).toContain("<p>From mammoth</p>");
    // Sanitizer pass: ensure no <script> would survive even if mammoth somehow produced it
    expect(html).not.toContain("<script");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/lib/file-render.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the renderer**

Create `lib/file-render.ts`:

```typescript
import "server-only";

import mammoth from "mammoth";

import { sanitizeHtml } from "@/lib/sanitize";

export async function renderDocxToHtml(buf: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer: buf });
  return sanitizeHtml(result.value);
}
```

- [ ] **Step 5: Run test to verify pass**

Run: `npx vitest run tests/lib/file-render.test.ts`
Expected: 1 passed.

- [ ] **Step 6: Add the docx-rendering API route**

Create `app/api/files/[fileId]/docx/route.ts`:

```typescript
export const dynamic = "force-dynamic";

import { downloadCanvasFile } from "@/lib/canvas";
import { ensureDemoUser } from "@/lib/demo-user";
import { renderDocxToHtml } from "@/lib/file-render";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

type RouteContext = { params: Promise<{ fileId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const { fileId } = await context.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from("canvas_files")
    .select("id, canvas_file_id, filename")
    .eq("id", fileId)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; canvas_file_id: string | null; filename: string | null }>();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data?.canvas_file_id) return Response.json({ error: "Not found" }, { status: 404 });

  const download = await downloadCanvasFile(data.canvas_file_id);
  if (!download) return Response.json({ error: "Canvas unavailable" }, { status: 404 });

  const buf = Buffer.from(await download.response.arrayBuffer());
  const html = await renderDocxToHtml(buf);
  return Response.json({ filename: data.filename, html });
}
```

- [ ] **Step 7: Wire DOCX into the file preview dialog**

Modify `app/ui/file-preview-dialog.tsx`. Add a new branch for DOCX rendering. Detect DOCX by file extension or content type. The simplest hook: in the existing `previewKind === "office"` branch, check if the filename ends with `.docx`, and if so, fetch from the new endpoint and render.

Add inside the component (above the return):

```typescript
const [docxState, setDocxState] = useState<
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; html: string }
  | { kind: "error"; message: string }
>({ kind: "idle" });

const isDocx = file.name.toLowerCase().endsWith(".docx");

useEffect(() => {
  if (!isOpen || !isDocx || docxState.kind !== "idle") return;
  setDocxState({ kind: "loading" });
  fetch(`/api/files/${file.id}/docx`)
    .then(async (res) => {
      const json = await res.json();
      if (!res.ok) {
        setDocxState({ kind: "error", message: json.error ?? "Failed to render DOCX" });
        return;
      }
      setDocxState({ kind: "ready", html: json.html });
    })
    .catch((err) => setDocxState({ kind: "error", message: err instanceof Error ? err.message : "Failed" }));
}, [isOpen, isDocx, file.id, docxState.kind]);
```

Then within the body switch (where `previewKind === "office"` is handled), add a DOCX case before the existing office fallback:

```tsx
{isDocx ? (
  docxState.kind === "loading" ? (
    <div className="p-5 text-sm text-stone-500">Rendering DOCX…</div>
  ) : docxState.kind === "ready" ? (
    <div className="h-full overflow-auto p-6">
      <div className="prose prose-stone max-w-none" dangerouslySetInnerHTML={{ __html: docxState.html }} />
    </div>
  ) : docxState.kind === "error" ? (
    <div className="p-5 text-sm text-rose-700">DOCX render failed: {docxState.message}</div>
  ) : null
) : file.previewKind === "office" && extractedPreview ? (
  // existing office fallback
  ...
) : ...}
```

(The exact placement merges with the existing conditional ladder in `file-preview-dialog.tsx:106-138`.)

- [ ] **Step 8: Manual verification**

Restart dev server, sync a course that contains a `.docx` file, open the file preview, confirm rich rendering instead of plain text.

- [ ] **Step 9: Commit**

```bash
git add lib/file-render.ts tests/lib/file-render.test.ts app/api/files/\[fileId\]/docx/route.ts app/ui/file-preview-dialog.tsx package.json package-lock.json
git commit -m "feat(files): render DOCX inline via mammoth"
```

---

## Task 12: Video and Panopto support

**Files:**
- Create: `lib/canvas-url.ts`
- Create: `tests/lib/canvas-url.test.ts`
- Modify: `app/ui/file-preview-dialog.tsx`
- Modify: `app/ui/dashboard/widgets/module-tree.tsx`

Two distinct cases:
1. **Video files** uploaded directly to Canvas (mp4/mov/webm) — serve via the existing `/api/files/[fileId]/preview` proxy as a `<video>` source
2. **Panopto links** in module items — Canvas exposes them as `ExternalUrl` items pointing at `/Sessions/Player/.../Viewer.aspx`. Swap to `/Embed.aspx` and iframe.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/canvas-url.test.ts`:

```typescript
import { describe, it, expect } from "vitest";

import { panoptoEmbedUrl, isVideoFilename } from "@/lib/canvas-url";

describe("panoptoEmbedUrl", () => {
  it("swaps Viewer.aspx → Embed.aspx", () => {
    const v = "https://nus-panopto.example/Panopto/Pages/Viewer.aspx?id=abc";
    expect(panoptoEmbedUrl(v)).toBe("https://nus-panopto.example/Panopto/Pages/Embed.aspx?id=abc");
  });

  it("returns null for non-Panopto URLs", () => {
    expect(panoptoEmbedUrl("https://youtube.com/watch?v=x")).toBeNull();
    expect(panoptoEmbedUrl("https://canvas.nus.edu.sg/courses/1")).toBeNull();
  });

  it("handles already-Embed URLs idempotently", () => {
    const e = "https://nus-panopto.example/Panopto/Pages/Embed.aspx?id=abc";
    expect(panoptoEmbedUrl(e)).toBe(e);
  });
});

describe("isVideoFilename", () => {
  it("detects video extensions case-insensitively", () => {
    expect(isVideoFilename("lecture.mp4")).toBe(true);
    expect(isVideoFilename("LECTURE.MOV")).toBe(true);
    expect(isVideoFilename("clip.webm")).toBe(true);
    expect(isVideoFilename("notes.pdf")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/canvas-url.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helpers**

Create `lib/canvas-url.ts`:

```typescript
const PANOPTO_VIEWER_RE = /\/Pages\/Viewer\.aspx/i;
const PANOPTO_EMBED_RE = /\/Pages\/Embed\.aspx/i;
const VIDEO_EXTS = [".mp4", ".mov", ".webm", ".m4v"];

export function panoptoEmbedUrl(url: string): string | null {
  if (PANOPTO_EMBED_RE.test(url)) return url;
  if (PANOPTO_VIEWER_RE.test(url)) {
    return url.replace(PANOPTO_VIEWER_RE, "/Pages/Embed.aspx");
  }
  return null;
}

export function isVideoFilename(name: string): boolean {
  const lower = name.toLowerCase();
  return VIDEO_EXTS.some((ext) => lower.endsWith(ext));
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npx vitest run tests/lib/canvas-url.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Wire video into the file-preview dialog**

Modify `app/ui/file-preview-dialog.tsx`. Import the helper and add a video branch in the body switch (placed before the existing PDF branch so video files render with `<video>` instead of falling through to "Open in Canvas"):

```typescript
import { isVideoFilename } from "@/lib/canvas-url";

// ...inside body switch, BEFORE the previewKind === "pdf" branch:
{isVideoFilename(file.name) ? (
  <video
    controls
    src={previewUrl}
    className="h-full w-full bg-black"
    preload="metadata"
  >
    <p className="p-4 text-sm">Your browser doesn't support inline video playback.</p>
  </video>
) : ...}
```

- [ ] **Step 6: Wire Panopto into the module tree**

Modify `app/ui/dashboard/widgets/module-tree.tsx`. In the `ExternalUrl` branch, check for Panopto URLs and render an embedded iframe in a dialog instead of an "Open link" button.

Replace the existing `ExternalUrl` branch with:

```tsx
if (it.itemType === "ExternalUrl" && it.externalUrl) {
  const embed = panoptoEmbedUrl(it.externalUrl);
  if (embed) {
    return (
      <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
        <span className={titleClass}>{it.title}</span>
        <PanoptoDialog title={it.title} embedUrl={embed} moduleCode={moduleCode} />
      </li>
    );
  }
  return (
    <li key={it.id} className={baseClass} style={{ paddingLeft: indentPx }}>
      <span className={titleClass}>{it.title}</span>
      <a
        href={it.externalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
      >
        Open link
      </a>
    </li>
  );
}
```

Add at the top of `module-tree.tsx`:
```typescript
import { panoptoEmbedUrl } from "@/lib/canvas-url";
import { useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock, useEscapeToClose } from "@/app/ui/use-modal-behavior";
```

And add a small inline `PanoptoDialog` component within the same file (since it's only used here):

```typescript
function PanoptoDialog({ title, embedUrl, moduleCode }: { title: string; embedUrl: string; moduleCode: string }) {
  const [isOpen, setIsOpen] = useState(false);
  useBodyScrollLock(isOpen);
  useEscapeToClose(isOpen, () => setIsOpen(false));
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[11px] font-medium text-stone-700"
      >
        Watch
      </button>
      {typeof document !== "undefined" && isOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setIsOpen(false);
              }}
            >
              <div className="flex h-full items-center justify-center">
                <div className="flex h-[calc(100vh-2rem)] w-full max-w-5xl flex-col overflow-hidden rounded-[14px] border border-stone-200 bg-black shadow-2xl">
                  <div className="flex items-center justify-between gap-4 border-b border-stone-200 bg-white px-5 py-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">
                      {moduleCode} · Recording
                    </p>
                    <h2 className="text-lg font-semibold tracking-tight text-stone-950 truncate">{title}</h2>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="rounded-[8px] border border-stone-200 px-3 py-2 text-[11px] font-medium text-stone-500"
                    >
                      Close
                    </button>
                  </div>
                  <iframe
                    src={embedUrl}
                    title={title}
                    className="h-full w-full"
                    allow="autoplay; fullscreen"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
```

- [ ] **Step 7: Manual verification**

Restart dev server. In a synced course that has Panopto recordings or video files, open the module tree and verify:
- Video files play inline via `<video>` controls
- Panopto links open in a Watch modal that embeds the player (requires being logged into NUS SSO in the same browser tab)

- [ ] **Step 8: Commit**

```bash
git add lib/canvas-url.ts tests/lib/canvas-url.test.ts app/ui/file-preview-dialog.tsx app/ui/dashboard/widgets/module-tree.tsx
git commit -m "feat(ui): inline video + Panopto embed support"
```

---

## Task 13: Demote "Open in Canvas" CTAs

**Files:**
- Modify: `app/ui/file-preview-dialog.tsx`
- Modify: `app/ui/dashboard/widgets/file-card.tsx`

Studex now renders every kind of content in-app. The "Open in Canvas" / "Canvas" buttons should still exist (as a fallback / source-of-truth link) but should be visually demoted from primary actions to small secondary links.

- [ ] **Step 1: Demote in file-preview-dialog**

Modify `app/ui/file-preview-dialog.tsx`. Find the "Open in Canvas" anchor (around line 84-93). Replace its className with a smaller, less-prominent style:

```tsx
{file.canvasUrl ? (
  <a
    href={file.canvasUrl}
    target="_blank"
    rel="noreferrer"
    className="text-[10px] font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
  >
    View source on Canvas
  </a>
) : null}
```

- [ ] **Step 2: Demote in file-card**

Modify `app/ui/dashboard/widgets/file-card.tsx`. Find the "Canvas" anchor (around line 40-49). Replace with the same demoted style:

```tsx
{file.canvasUrl ? (
  <a
    href={file.canvasUrl}
    target="_blank"
    rel="noreferrer"
    className="text-[10px] font-medium text-stone-400 underline-offset-2 hover:text-stone-600 hover:underline"
  >
    Source
  </a>
) : null}
```

- [ ] **Step 3: Update the dialog description copy**

In `file-preview-dialog.tsx`, find the `description` const (around line 27-29) and update so it reflects the new in-app default:

```typescript
const description =
  file.summary ||
  "View synced Canvas content directly in Studex — PDFs, images, DOCX, and videos render inline. Use the source link only as a fallback.";
```

Also remove the trailing copy in the empty-fallback branch (line 132-134) that still pushes users to Canvas as the primary action:

```tsx
<div className="flex h-full items-center justify-center px-6 text-center">
  <div>
    <p className="text-sm font-semibold text-stone-900">Inline preview is not available for this format yet.</p>
    <p className="mt-2 text-sm leading-6 text-stone-500">
      Studex hasn't added a renderer for this format. The extracted text (when available) will appear in the cheatsheet pipeline.
    </p>
  </div>
</div>
```

- [ ] **Step 4: Commit**

```bash
git add app/ui/file-preview-dialog.tsx app/ui/dashboard/widgets/file-card.tsx
git commit -m "polish(ui): demote 'Open in Canvas' from primary CTA to source link"
```

---

## Task 14: Final integration check

**Files:**
- None (verification only)

A sanity pass to make sure every viewer integrates cleanly and no test regressed.

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass (existing + new). If any pre-existing test breaks because of contract additions in Task 6 (e.g., widget tests that don't supply `bodyHtml` or `hasDescription`), fix the test fixtures by adding the new fields with sensible defaults (`bodyHtml: ""`, `hasDescription: false`).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors. Fix any new issues introduced by the dialogs (typically: missing keys in lists, unused vars).

- [ ] **Step 4: End-to-end smoke test in the browser**

Restart `npm run dev`. With a synced NUS Canvas course:

1. Open the dashboard
2. Click into a module
3. Verify the **Module structure** section shows the lecturer's Canvas Modules tree, sorted by week
4. Click a Page item → opens in the Page viewer dialog
5. Click a File item (PDF) → opens in iframe
6. Click a File item (DOCX) → renders as styled HTML
7. Click an Assignment item → opens with full description
8. Click an announcement's "Read full" → opens detail dialog with sanitized HTML body
9. If the course has a Panopto recording, click "Watch" → opens embedded player
10. Verify "Source" / "View source on Canvas" links exist but are visually subordinate

Document any rendering issues or content types that aren't yet covered.

- [ ] **Step 5: Commit final integration fixes (if any)**

```bash
git add <fixed files>
git commit -m "fix: integration regressions from in-app viewers rollout"
```

---

## Self-Review Notes

**Spec coverage:**
- Pages render in-app: Tasks 4, 6, 7
- Announcements full body: Tasks 6, 8
- Assignments full description: Tasks 2, 3, 5, 6, 9
- Module structure tree: Tasks 6, 10
- DOCX inline: Task 11
- Video / Panopto: Task 12
- "Open in Canvas" demotion: Task 13
- Sanitizer foundation: Task 1
- Final integration: Task 14

**Deferred (not in this plan, document the gap):**
- PPTX / XLSX visual rendering — kept as extracted-text fallback. A future task can add server-side LibreOffice → PDF conversion if real demand emerges.
- Office Online viewer (`view.officeapps.live.com`) — needs the file URL to be publicly reachable from Microsoft's servers, which conflicts with the per-user auth model. Skipped.
- Canvas Discussion threads — not yet synced (no `discussions` table), out of scope.
- Multi-LMS adapter pattern — Phase 4 work in `STUDEX_PROJECT.md`. This plan keeps everything Canvas-coupled; the dialogs will be reused unchanged when the adapter pattern lands.
