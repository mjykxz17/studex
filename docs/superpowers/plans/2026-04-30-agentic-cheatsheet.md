# Agentic Cheatsheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the cheatsheet pipeline described in [`docs/superpowers/specs/2026-04-30-agentic-cheatsheet-design.md`](../specs/2026-04-30-agentic-cheatsheet-design.md): user picks Canvas files → multi-stage agent (Haiku gap-detect → Tavily search → Sonnet synthesize) → live-streamed markdown cheatsheet with citations.

**Architecture:** Four-stage pipeline (ingest → detect-gaps → web-search → synthesize) running in one streaming Next.js route handler. SSE events stream live progress to the client. Each stage is a separate testable lib. New `cheatsheets` / `cheatsheet_runs` / `web_search_usage` tables; existing `canvas_files.extracted_text` reused for parsed-PDF cache. Anthropic SDK reads `ANTHROPIC_API_KEY` from env (v1 single-user demo via `lib/demo-user.ts`); Foundation spec will swap that for per-user encrypted keys.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Vitest + jsdom, Supabase (Postgres), `@anthropic-ai/sdk`, `pdf-parse`, Tavily REST API, `react-markdown`.

**Spec:** [2026-04-30-agentic-cheatsheet-design.md](../specs/2026-04-30-agentic-cheatsheet-design.md)
**Foundation prerequisite:** Not yet specced. This plan uses `demo-user.ts` as a temporary auth shim. When Foundation lands, swap demo-user usage for real auth and replace env-key Anthropic with per-user keys (see Task 17).

---

## File map

**New files:**

```
lib/llm/anthropic.ts                          — Anthropic SDK factory
lib/search/tavily.ts                          — Tavily REST wrapper
lib/cheatsheet/types.ts                       — shared types
lib/cheatsheet/ingest.ts                      — stage 1
lib/cheatsheet/detect-gaps.ts                 — stage 2
lib/cheatsheet/search.ts                      — stage 3
lib/cheatsheet/synthesize.ts                  — stage 4
lib/cheatsheet/orchestrate.ts                 — pipeline runner + SSE
lib/cheatsheet/sse.ts                         — SSE encode/decode utilities

app/api/cheatsheets/route.ts                  — GET list
app/api/cheatsheets/generate/route.ts         — POST SSE
app/api/cheatsheets/[id]/route.ts             — GET single

app/cheatsheets/[id]/page.tsx                 — viewer page
app/cheatsheets/[id]/generating/page.tsx      — streaming page

app/ui/cheatsheet/cheatsheet-panel.tsx        — list panel for module-view
app/ui/cheatsheet/generate-modal.tsx          — file picker
app/ui/cheatsheet/streaming-timeline.tsx      — progress UI
app/ui/cheatsheet/cheatsheet-viewer.tsx       — markdown + citations

scripts/cheatsheet-eval.ts                    — manual prompt-quality eval

supabase/migrations/0007_add_cheatsheets.sql  — new tables

tests/fixtures/pdfs/lecture-sample.pdf        — fixture for ingest tests
tests/lib/llm/anthropic.test.ts
tests/lib/search/tavily.test.ts
tests/lib/cheatsheet/ingest.test.ts
tests/lib/cheatsheet/detect-gaps.test.ts
tests/lib/cheatsheet/search.test.ts
tests/lib/cheatsheet/synthesize.test.ts
tests/lib/cheatsheet/orchestrate.test.ts
tests/lib/cheatsheet/sse.test.ts
tests/app/api/cheatsheets/list-route.test.ts
tests/app/api/cheatsheets/get-route.test.ts
tests/app/api/cheatsheets/generate-route.test.ts
tests/app/ui/cheatsheet/generate-modal.test.tsx
tests/app/ui/cheatsheet/streaming-timeline.test.tsx
tests/app/ui/cheatsheet/cheatsheet-viewer.test.tsx
tests/app/ui/cheatsheet/cheatsheet-panel.test.tsx
```

**Modified files:**

```
package.json                                   — add @anthropic-ai/sdk, pdf-parse, react-markdown
supabase/schema.sql                            — append new tables (canonical schema)
app/ui/dashboard/module-view.tsx               — embed CheatsheetPanel
.env.example (or README)                       — document ANTHROPIC_API_KEY, TAVILY_API_KEY
lib/env.ts                                     — surface new env vars
```

---

## Phase 1 — Schema + types + dependencies

### Task 1: Install dependencies

**Files:**
- Modify: `package.json` (and `package-lock.json`)

- [ ] **Step 1: Install runtime dependencies**

```bash
npm install @anthropic-ai/sdk pdf-parse react-markdown
```

- [ ] **Step 2: Install dev type packages**

```bash
npm install --save-dev @types/pdf-parse
```

- [ ] **Step 3: Verify install and type-check**

```bash
npm run lint
npx tsc --noEmit
```

Expected: both succeed with no new errors.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): add anthropic sdk, pdf-parse, react-markdown for cheatsheet pipeline"
```

---

### Task 2: Surface new env vars in `lib/env.ts`

**Files:**
- Modify: `lib/env.ts`
- Modify: `README.md` (env section)

- [ ] **Step 1: Read existing `lib/env.ts` to match style**

```bash
cat lib/env.ts
```

- [ ] **Step 2: Add Anthropic and Tavily env exports**

Add to `lib/env.ts` (preserve existing exports; replicate the Canvas pattern):

```typescript
export const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
export const TAVILY_API_KEY = process.env.TAVILY_API_KEY ?? "";

export function requireAnthropicKey(): string {
  if (!ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  return ANTHROPIC_API_KEY;
}

export function requireTavilyKey(): string {
  if (!TAVILY_API_KEY) {
    throw new Error("TAVILY_API_KEY is not configured");
  }
  return TAVILY_API_KEY;
}
```

- [ ] **Step 3: Update README env block**

In `README.md` section "Environment Setup", append:

```bash
ANTHROPIC_API_KEY=your_anthropic_key   # Bring-your-own; powers cheatsheet generation
TAVILY_API_KEY=your_tavily_key         # App-paid; powers gap-fill web search
```

- [ ] **Step 4: Commit**

```bash
git add lib/env.ts README.md
git commit -m "chore(env): surface ANTHROPIC_API_KEY and TAVILY_API_KEY"
```

---

### Task 3: Add `lib/cheatsheet/types.ts` shared types

**Files:**
- Create: `lib/cheatsheet/types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// lib/cheatsheet/types.ts
export type CheatsheetStage = "ingest" | "detect-gaps" | "web-search" | "synthesize";

export type CheatsheetStatus = "streaming" | "complete" | "failed";

export type IngestedFile = {
  id: string;
  name: string;
  markdown: string;
  skipped?: { reason: string };
};

export type GapConcept = {
  concept: string;
  why_unclear: string;
};

export type SearchResult = {
  gap: GapConcept;
  snippets: Array<{ url: string; title: string; snippet: string }>;
  failed: boolean;
};

export type Citation = {
  n: number;
  url: string;
  title: string;
  snippet: string;
  gap_concept: string;
};

export type Cheatsheet = {
  id: string;
  user_id: string;
  course_id: string;
  title: string;
  source_file_ids: string[];
  markdown: string | null;
  citations: Citation[] | null;
  status: CheatsheetStatus;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
};

export type StreamEvent =
  | { type: "stage-start"; stage: CheatsheetStage; message: string }
  | { type: "stage-progress"; stage: CheatsheetStage; message: string; data?: unknown }
  | { type: "stage-complete"; stage: CheatsheetStage; data?: unknown }
  | { type: "markdown-chunk"; chunk: string }
  | { type: "warning"; message: string }
  | { type: "complete"; cheatsheet_id: string }
  | { type: "failed"; reason: string };
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add lib/cheatsheet/types.ts
git commit -m "feat(cheatsheet): add shared type contracts"
```

---

### Task 4: Add migration `0007_add_cheatsheets.sql`

**Files:**
- Create: `supabase/migrations/0007_add_cheatsheets.sql`
- Modify: `supabase/schema.sql` (canonical mirror)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/0007_add_cheatsheets.sql
-- Adds tables for the agentic cheatsheet pipeline.

create table cheatsheets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references users(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  title text not null,
  source_file_ids uuid[] not null,
  markdown text,
  citations jsonb,
  status text not null check (status in ('streaming','complete','failed')),
  failure_reason text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index cheatsheets_user_course_idx on cheatsheets (user_id, course_id, created_at desc);

create table cheatsheet_runs (
  id uuid default gen_random_uuid() primary key,
  cheatsheet_id uuid not null references cheatsheets(id) on delete cascade,
  stage text not null check (stage in ('ingest','detect-gaps','web-search','synthesize')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  tokens_in int,
  tokens_out int,
  metadata jsonb,
  error text
);

create index cheatsheet_runs_cheatsheet_idx on cheatsheet_runs (cheatsheet_id, started_at);

create table web_search_usage (
  user_id uuid not null references users(id) on delete cascade,
  date date not null,
  count int not null default 0,
  primary key (user_id, date)
);
```

- [ ] **Step 2: Append the same DDL to `supabase/schema.sql`**

Append the three `create table` blocks above to the end of `supabase/schema.sql`. Preserve existing content.

- [ ] **Step 3: Apply migration to local Supabase**

Run the SQL in your Supabase SQL Editor (or via your existing tooling). Then verify:

```bash
npm run db:audit
```

Expected: audit shows the three new tables. (If `db:audit` doesn't enumerate them, that's fine — manual SQL `\dt cheatsheets cheatsheet_runs web_search_usage` confirms.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0007_add_cheatsheets.sql supabase/schema.sql
git commit -m "feat(db): add cheatsheets, cheatsheet_runs, web_search_usage tables"
```

---

## Phase 2 — External clients

### Task 5: `lib/llm/anthropic.ts` — Anthropic SDK factory

**Files:**
- Create: `lib/llm/anthropic.ts`
- Test: `tests/lib/llm/anthropic.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/llm/anthropic.test.ts
import { describe, expect, it, beforeEach, vi } from "vitest";

describe("lib/llm/anthropic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns a configured client when ANTHROPIC_API_KEY is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-123");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic");
    const client = getAnthropicClient();
    expect(client).toBeDefined();
    expect(typeof (client as { messages?: unknown }).messages).toBe("object");
  });

  it("throws a clear error when ANTHROPIC_API_KEY is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic");
    expect(() => getAnthropicClient()).toThrow(/ANTHROPIC_API_KEY/);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/lib/llm/anthropic.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```typescript
// lib/llm/anthropic.ts
import "server-only";
import Anthropic from "@anthropic-ai/sdk";

import { requireAnthropicKey } from "@/lib/env";

export const HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const SONNET_MODEL = "claude-sonnet-4-6";

export function getAnthropicClient(): Anthropic {
  const apiKey = requireAnthropicKey();
  return new Anthropic({ apiKey });
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/lib/llm/anthropic.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/llm/anthropic.ts tests/lib/llm/anthropic.test.ts
git commit -m "feat(llm): add Anthropic SDK factory with env-key (v1 demo)"
```

---

### Task 6: `lib/search/tavily.ts` — Tavily REST wrapper

**Files:**
- Create: `lib/search/tavily.ts`
- Test: `tests/lib/search/tavily.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/search/tavily.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { tavilySearch } from "@/lib/search/tavily";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lib/search/tavily", () => {
  it("posts to Tavily and returns mapped snippets", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { url: "https://a.com", title: "A", content: "snippet a" },
            { url: "https://b.com", title: "B", content: "snippet b" },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await tavilySearch("what is dijkstra", { maxResults: 2 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      query: "what is dijkstra",
      max_results: 2,
      api_key: "tvly-test",
    });
    expect(out).toEqual([
      { url: "https://a.com", title: "A", snippet: "snippet a" },
      { url: "https://b.com", title: "B", snippet: "snippet b" },
    ]);
  });

  it("throws on non-2xx response", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 500 })));
    await expect(tavilySearch("q")).rejects.toThrow(/Tavily/);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/lib/search/tavily.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the module**

```typescript
// lib/search/tavily.ts
import "server-only";

import { requireTavilyKey } from "@/lib/env";

const TAVILY_ENDPOINT = "https://api.tavily.com/search";

export type TavilySnippet = {
  url: string;
  title: string;
  snippet: string;
};

type TavilyResponse = {
  results?: Array<{ url: string; title: string; content: string }>;
};

export async function tavilySearch(
  query: string,
  options: { maxResults?: number } = {},
): Promise<TavilySnippet[]> {
  const apiKey = requireTavilyKey();
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: options.maxResults ?? 3,
      search_depth: "basic",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Tavily search failed: ${res.status} ${body}`);
  }
  const data = (await res.json()) as TavilyResponse;
  return (data.results ?? []).map((r) => ({
    url: r.url,
    title: r.title,
    snippet: r.content,
  }));
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/lib/search/tavily.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/search/tavily.ts tests/lib/search/tavily.test.ts
git commit -m "feat(search): add Tavily REST wrapper"
```

---

### Task 7: `lib/cheatsheet/sse.ts` — SSE encode + parse utilities

**Files:**
- Create: `lib/cheatsheet/sse.ts`
- Test: `tests/lib/cheatsheet/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/cheatsheet/sse.test.ts
import { describe, expect, it } from "vitest";

import { encodeSseEvent, parseSseChunks } from "@/lib/cheatsheet/sse";
import type { StreamEvent } from "@/lib/cheatsheet/types";

describe("encodeSseEvent", () => {
  it("formats an event as data: <json>\\n\\n", () => {
    const ev: StreamEvent = { type: "stage-start", stage: "ingest", message: "Parsing 2 files" };
    expect(encodeSseEvent(ev)).toBe(`data: ${JSON.stringify(ev)}\n\n`);
  });
});

describe("parseSseChunks", () => {
  it("decodes a sequence of events from concatenated chunks", () => {
    const ev1: StreamEvent = { type: "stage-start", stage: "ingest", message: "A" };
    const ev2: StreamEvent = { type: "complete", cheatsheet_id: "cs-1" };
    const buffer = `data: ${JSON.stringify(ev1)}\n\ndata: ${JSON.stringify(ev2)}\n\n`;
    expect(parseSseChunks(buffer)).toEqual([ev1, ev2]);
  });

  it("ignores partial trailing fragments without a terminator", () => {
    const buffer = `data: {"type":"stage-start","stage":"ingest","message":"x"}\n\ndata: {"type":"stage-`;
    expect(parseSseChunks(buffer)).toEqual([
      { type: "stage-start", stage: "ingest", message: "x" },
    ]);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/lib/cheatsheet/sse.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/cheatsheet/sse.ts
import type { StreamEvent } from "@/lib/cheatsheet/types";

export function encodeSseEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSseChunks(buffer: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  const parts = buffer.split("\n\n");
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i].trim();
    if (!part.startsWith("data:")) continue;
    const json = part.slice("data:".length).trim();
    if (!json) continue;
    try {
      events.push(JSON.parse(json) as StreamEvent);
    } catch {
      // ignore malformed; pipeline never emits these
    }
  }
  return events;
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/lib/cheatsheet/sse.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cheatsheet/sse.ts tests/lib/cheatsheet/sse.test.ts
git commit -m "feat(cheatsheet): add SSE encode/decode utilities"
```

---

## Phase 3 — Pipeline stages

### Task 8: Stage 1 — `lib/cheatsheet/ingest.ts`

**Files:**
- Create: `lib/cheatsheet/ingest.ts`
- Create: `tests/fixtures/pdfs/lecture-sample.pdf` (small text-based PDF, ≤ 50KB)
- Test: `tests/lib/cheatsheet/ingest.test.ts`

> Note: For the fixture PDF, generate a 1-2 page PDF locally that contains plain text (e.g. "CS2030 Streams Lecture — A Stream is a sequence..."). Any tool works (Pages → Export, LibreOffice, even `pdfkit`). Commit the binary.

- [ ] **Step 1: Add the PDF fixture**

Create a small PDF with extractable text at `tests/fixtures/pdfs/lecture-sample.pdf` (any 1-page document with the literal words "Streams" and "Dijkstra" so we can assert on extraction).

- [ ] **Step 2: Write the failing test**

```typescript
// tests/lib/cheatsheet/ingest.test.ts
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { extractPdfMarkdown } from "@/lib/cheatsheet/ingest";

describe("extractPdfMarkdown", () => {
  it("returns markdown text from a real PDF buffer", async () => {
    const buf = readFileSync(resolve("tests/fixtures/pdfs/lecture-sample.pdf"));
    const md = await extractPdfMarkdown(buf);
    expect(md).toMatch(/Streams/i);
  });

  it("throws a typed error for non-PDF input", async () => {
    await expect(extractPdfMarkdown(Buffer.from("not a pdf"))).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test (expect fail)**

```bash
npm test -- tests/lib/cheatsheet/ingest.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `extractPdfMarkdown`**

```typescript
// lib/cheatsheet/ingest.ts
import "server-only";

import pdfParse from "pdf-parse";

import { getFileDownloadUrl } from "@/lib/canvas";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type { IngestedFile } from "@/lib/cheatsheet/types";

export async function extractPdfMarkdown(buf: Buffer): Promise<string> {
  const result = await pdfParse(buf);
  if (!result.text || !result.text.trim()) {
    throw new Error("PDF contained no extractable text (likely scanned)");
  }
  // Light normalization: collapse triple-newlines, trim, preserve paragraph breaks.
  return result.text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export type IngestParams = {
  fileIds: string[];
  canvasToken: string;
};

export async function ingestFiles(params: IngestParams): Promise<IngestedFile[]> {
  const supabase = getSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("canvas_files")
    .select("id, filename, canvas_file_id, canvas_url, extracted_text, processed")
    .in("id", params.fileIds);
  if (error) throw new Error(`Failed to load files: ${error.message}`);

  const out: IngestedFile[] = [];
  for (const row of rows ?? []) {
    const id = row.id as string;
    const name = (row.filename as string) ?? "unnamed";
    if (row.processed && typeof row.extracted_text === "string" && row.extracted_text.length > 0) {
      out.push({ id, name, markdown: row.extracted_text });
      continue;
    }
    try {
      const url = await getFileDownloadUrl(row.canvas_file_id as string, params.canvasToken);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download failed: ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const markdown = await extractPdfMarkdown(buf);
      await supabase
        .from("canvas_files")
        .update({ extracted_text: markdown, processed: true })
        .eq("id", id);
      out.push({ id, name, markdown });
    } catch (err) {
      out.push({
        id,
        name,
        markdown: "",
        skipped: { reason: err instanceof Error ? err.message : "unknown error" },
      });
    }
  }
  return out;
}
```

> Note: `getFileDownloadUrl` is the existing export from `lib/canvas.ts`. If its signature differs from `(canvasFileId, token) => Promise<string>`, adjust the call site to match (do NOT change the existing function).

- [ ] **Step 5: Run test (expect pass)**

```bash
npm test -- tests/lib/cheatsheet/ingest.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/cheatsheet/ingest.ts tests/lib/cheatsheet/ingest.test.ts tests/fixtures/pdfs/lecture-sample.pdf
git commit -m "feat(cheatsheet): stage 1 — PDF ingest with extracted_text cache"
```

---

### Task 9: Stage 2 — `lib/cheatsheet/detect-gaps.ts`

**Files:**
- Create: `lib/cheatsheet/detect-gaps.ts`
- Test: `tests/lib/cheatsheet/detect-gaps.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/cheatsheet/detect-gaps.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { detectGaps } from "@/lib/cheatsheet/detect-gaps";

afterEach(() => vi.restoreAllMocks());

describe("detectGaps", () => {
  it("returns parsed gaps from Haiku JSON output", async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                gaps: [
                  { concept: "Dijkstra", why_unclear: "name dropped without definition" },
                ],
              }),
            },
          ],
          usage: { input_tokens: 100, output_tokens: 30 },
        }),
      },
    };
    const out = await detectGaps({
      sourceMarkdown: "use dijkstra here",
      client: fakeClient as never,
    });
    expect(out.gaps).toHaveLength(1);
    expect(out.gaps[0].concept).toBe("Dijkstra");
    expect(out.tokensIn).toBe(100);
    expect(out.tokensOut).toBe(30);
  });

  it("falls back to empty gaps on malformed JSON after one retry", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not json" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "still not json" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const fakeClient = { messages: { create } };
    const out = await detectGaps({
      sourceMarkdown: "x",
      client: fakeClient as never,
    });
    expect(out.gaps).toEqual([]);
    expect(out.degraded).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/lib/cheatsheet/detect-gaps.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/cheatsheet/detect-gaps.ts
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { HAIKU_MODEL } from "@/lib/llm/anthropic";
import type { GapConcept } from "@/lib/cheatsheet/types";

const SYSTEM = `You are an academic gap detector. You read course material and identify specific terms or concepts that are mentioned but not adequately explained — definitions a student would need to look up to understand the lecture.

Output ONLY valid JSON matching this schema:
{ "gaps": [ { "concept": string, "why_unclear": string } ] }

Rules:
- Maximum 8 gaps. Pick the highest-value ones.
- Skip terms that ARE adequately defined in the source.
- "concept" should be a precise search term (e.g. "Dijkstra's algorithm", not "the algorithm").
- "why_unclear" is one sentence explaining what's missing from the source.`;

export type DetectGapsParams = {
  sourceMarkdown: string;
  client: Anthropic;
};

export type DetectGapsResult = {
  gaps: GapConcept[];
  tokensIn: number;
  tokensOut: number;
  degraded: boolean;
};

async function callOnce(params: DetectGapsParams): Promise<{
  text: string;
  tokensIn: number;
  tokensOut: number;
}> {
  const res = await params.client.messages.create({
    model: HAIKU_MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `<source>\n${params.sourceMarkdown}\n</source>\n\nReturn only the JSON object.`,
      },
    ],
  });
  const text =
    res.content
      .filter((c): c is { type: "text"; text: string } => c.type === "text")
      .map((c) => c.text)
      .join("") ?? "";
  return {
    text,
    tokensIn: res.usage?.input_tokens ?? 0,
    tokensOut: res.usage?.output_tokens ?? 0,
  };
}

function tryParse(text: string): GapConcept[] | null {
  // Strip Markdown code fences if Haiku adds them.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(cleaned) as { gaps?: GapConcept[] };
    if (!parsed?.gaps || !Array.isArray(parsed.gaps)) return null;
    return parsed.gaps
      .filter((g) => typeof g?.concept === "string" && typeof g?.why_unclear === "string")
      .slice(0, 8);
  } catch {
    return null;
  }
}

export async function detectGaps(params: DetectGapsParams): Promise<DetectGapsResult> {
  let totalIn = 0;
  let totalOut = 0;

  const first = await callOnce(params);
  totalIn += first.tokensIn;
  totalOut += first.tokensOut;
  const firstParsed = tryParse(first.text);
  if (firstParsed) {
    return { gaps: firstParsed, tokensIn: totalIn, tokensOut: totalOut, degraded: false };
  }

  const second = await callOnce(params);
  totalIn += second.tokensIn;
  totalOut += second.tokensOut;
  const secondParsed = tryParse(second.text);
  if (secondParsed) {
    return { gaps: secondParsed, tokensIn: totalIn, tokensOut: totalOut, degraded: false };
  }

  return { gaps: [], tokensIn: totalIn, tokensOut: totalOut, degraded: true };
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/lib/cheatsheet/detect-gaps.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cheatsheet/detect-gaps.ts tests/lib/cheatsheet/detect-gaps.test.ts
git commit -m "feat(cheatsheet): stage 2 — Haiku gap detection with JSON-fallback"
```

---

### Task 10: Stage 3 — `lib/cheatsheet/search.ts`

**Files:**
- Create: `lib/cheatsheet/search.ts`
- Test: `tests/lib/cheatsheet/search.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/cheatsheet/search.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { searchGaps } from "@/lib/cheatsheet/search";
import type { GapConcept } from "@/lib/cheatsheet/types";

afterEach(() => vi.restoreAllMocks());

const gaps: GapConcept[] = [
  { concept: "Dijkstra's algorithm", why_unclear: "x" },
  { concept: "O(log n)", why_unclear: "y" },
];

describe("searchGaps", () => {
  it("runs searches in parallel and maps results", async () => {
    const search = vi.fn(async (q: string) => [
      { url: `https://${q}.com`, title: q, snippet: `about ${q}` },
    ]);
    const incrementUsage = vi.fn(async () => ({ allowed: true, remaining: 49 }));

    const out = await searchGaps({ gaps, userId: "u1", search, incrementUsage });
    expect(search).toHaveBeenCalledTimes(2);
    expect(out.results).toHaveLength(2);
    expect(out.results[0].failed).toBe(false);
    expect(out.results[0].snippets[0].url).toMatch(/dijkstra|algorithm/i);
    expect(out.degraded).toBe(false);
  });

  it("skips all searches when daily cap is exceeded", async () => {
    const search = vi.fn();
    const incrementUsage = vi.fn(async () => ({ allowed: false, remaining: 0 }));

    const out = await searchGaps({ gaps, userId: "u1", search, incrementUsage });
    expect(search).not.toHaveBeenCalled();
    expect(out.results).toEqual([]);
    expect(out.degraded).toBe(true);
    expect(out.reason).toMatch(/cap|quota/i);
  });

  it("marks individual failures without aborting others", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream 500"))
      .mockResolvedValueOnce([{ url: "https://b.com", title: "B", snippet: "ok" }]);
    const incrementUsage = vi.fn(async () => ({ allowed: true, remaining: 50 }));

    const out = await searchGaps({ gaps, userId: "u1", search, incrementUsage });
    expect(out.results).toHaveLength(2);
    expect(out.results[0].failed).toBe(true);
    expect(out.results[1].failed).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/lib/cheatsheet/search.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/cheatsheet/search.ts
import "server-only";

import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { tavilySearch } from "@/lib/search/tavily";
import type { GapConcept, SearchResult } from "@/lib/cheatsheet/types";

const DAILY_CAP = 50;

export type SearchFn = (query: string) => Promise<
  Array<{ url: string; title: string; snippet: string }>
>;

export type IncrementUsageFn = (
  userId: string,
  amount: number,
) => Promise<{ allowed: boolean; remaining: number }>;

export type SearchGapsParams = {
  gaps: GapConcept[];
  userId: string;
  search?: SearchFn;
  incrementUsage?: IncrementUsageFn;
};

export type SearchGapsResult = {
  results: SearchResult[];
  degraded: boolean;
  reason?: string;
};

export async function defaultIncrementUsage(
  userId: string,
  amount: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const supabase = getSupabaseAdminClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("web_search_usage")
    .select("count")
    .eq("user_id", userId)
    .eq("date", today)
    .maybeSingle();
  const current = existing?.count ?? 0;
  if (current + amount > DAILY_CAP) {
    return { allowed: false, remaining: Math.max(DAILY_CAP - current, 0) };
  }
  await supabase
    .from("web_search_usage")
    .upsert({ user_id: userId, date: today, count: current + amount }, { onConflict: "user_id,date" });
  return { allowed: true, remaining: DAILY_CAP - (current + amount) };
}

export async function searchGaps(params: SearchGapsParams): Promise<SearchGapsResult> {
  const search: SearchFn = params.search ?? ((q) => tavilySearch(q, { maxResults: 3 }));
  const incrementUsage: IncrementUsageFn = params.incrementUsage ?? defaultIncrementUsage;

  if (params.gaps.length === 0) {
    return { results: [], degraded: false };
  }

  const usage = await incrementUsage(params.userId, params.gaps.length);
  if (!usage.allowed) {
    return {
      results: [],
      degraded: true,
      reason: "Daily search quota reached",
    };
  }

  const settled = await Promise.allSettled(params.gaps.map((g) => search(g.concept)));
  const results: SearchResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") {
      return { gap: params.gaps[i], snippets: s.value, failed: false };
    }
    return { gap: params.gaps[i], snippets: [], failed: true };
  });

  return { results, degraded: false };
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/lib/cheatsheet/search.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cheatsheet/search.ts tests/lib/cheatsheet/search.test.ts
git commit -m "feat(cheatsheet): stage 3 — Tavily parallel search with daily cap"
```

---

### Task 11: Stage 4 — `lib/cheatsheet/synthesize.ts`

**Files:**
- Create: `lib/cheatsheet/synthesize.ts`
- Test: `tests/lib/cheatsheet/synthesize.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/cheatsheet/synthesize.test.ts
import { describe, expect, it, vi } from "vitest";

import { synthesizeCheatsheet } from "@/lib/cheatsheet/synthesize";
import type { IngestedFile, SearchResult } from "@/lib/cheatsheet/types";

describe("synthesizeCheatsheet", () => {
  it("streams chunks and returns final markdown + citations", async () => {
    const stream = (async function* () {
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "# Streams\n" } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "See [1]." } };
      yield {
        type: "message_delta",
        usage: { input_tokens: 200, output_tokens: 50 },
      };
    })();
    const fakeClient = {
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: () => stream,
        }),
      },
    };

    const files: IngestedFile[] = [{ id: "f1", name: "lecture.pdf", markdown: "Streams are..." }];
    const search: SearchResult[] = [
      {
        gap: { concept: "Stream", why_unclear: "" },
        snippets: [{ url: "https://oracle.com/streams", title: "Streams", snippet: "..." }],
        failed: false,
      },
    ];

    const chunks: string[] = [];
    const out = await synthesizeCheatsheet({
      files,
      searchResults: search,
      client: fakeClient as never,
      onChunk: (c) => chunks.push(c),
    });

    expect(chunks.join("")).toContain("# Streams");
    expect(out.markdown).toContain("See [1].");
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0]).toMatchObject({
      n: 1,
      url: "https://oracle.com/streams",
      title: "Streams",
      gap_concept: "Stream",
    });
    expect(out.tokensIn).toBe(200);
    expect(out.tokensOut).toBe(50);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/lib/cheatsheet/synthesize.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/cheatsheet/synthesize.ts
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { SONNET_MODEL } from "@/lib/llm/anthropic";
import type { Citation, IngestedFile, SearchResult } from "@/lib/cheatsheet/types";

const SYSTEM = `You are an academic cheatsheet author. Produce a concise, dense, exam-ready cheatsheet in Markdown from the provided source materials and supporting external snippets.

Format requirements:
- Use \`#\` and \`##\` headings to structure topics.
- Use bullet points and tight prose. Aim for 1–2 printed pages worth of content.
- When you state a fact that came from one of the SUPPORTING SNIPPETS, append a citation marker like [1], [2], etc., matching the order of snippets given.
- Facts that came from the source materials need NO citation.
- Do NOT include a sources list at the bottom — that is appended programmatically.`;

function buildUserPrompt(files: IngestedFile[], searchResults: SearchResult[]): string {
  const sources = files
    .filter((f) => !f.skipped)
    .map((f, i) => `## SOURCE ${i + 1}: ${f.name}\n${f.markdown}`)
    .join("\n\n");
  const numbered: Array<{ n: number; url: string; title: string; snippet: string; concept: string }> = [];
  let n = 1;
  for (const r of searchResults) {
    if (r.failed) continue;
    for (const s of r.snippets) {
      numbered.push({ n, url: s.url, title: s.title, snippet: s.snippet, concept: r.gap.concept });
      n++;
    }
  }
  const supporting = numbered.length
    ? numbered.map((x) => `[${x.n}] ${x.title} (${x.url})\n${x.snippet}`).join("\n\n")
    : "(none)";
  return [
    `=== SOURCE MATERIALS ===\n${sources}`,
    `=== SUPPORTING SNIPPETS (cite by number) ===\n${supporting}`,
    `\nWrite the cheatsheet now.`,
  ].join("\n\n");
}

export type SynthesizeParams = {
  files: IngestedFile[];
  searchResults: SearchResult[];
  client: Anthropic;
  onChunk?: (chunk: string) => void;
};

export type SynthesizeResult = {
  markdown: string;
  citations: Citation[];
  tokensIn: number;
  tokensOut: number;
};

export async function synthesizeCheatsheet(
  params: SynthesizeParams,
): Promise<SynthesizeResult> {
  // Build the citation index up-front so we can return it.
  const citations: Citation[] = [];
  let n = 1;
  for (const r of params.searchResults) {
    if (r.failed) continue;
    for (const s of r.snippets) {
      citations.push({
        n,
        url: s.url,
        title: s.title,
        snippet: s.snippet,
        gap_concept: r.gap.concept,
      });
      n++;
    }
  }

  const stream = params.client.messages.stream({
    model: SONNET_MODEL,
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: buildUserPrompt(params.files, params.searchResults) }],
  });

  let markdown = "";
  let tokensIn = 0;
  let tokensOut = 0;

  for await (const event of stream as unknown as AsyncIterable<{
    type: string;
    delta?: { type?: string; text?: string };
    usage?: { input_tokens?: number; output_tokens?: number };
  }>) {
    if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) {
      markdown += event.delta.text;
      params.onChunk?.(event.delta.text);
    } else if (event.type === "message_delta" && event.usage) {
      tokensIn = event.usage.input_tokens ?? tokensIn;
      tokensOut = event.usage.output_tokens ?? tokensOut;
    }
  }

  return { markdown, citations, tokensIn, tokensOut };
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/lib/cheatsheet/synthesize.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cheatsheet/synthesize.ts tests/lib/cheatsheet/synthesize.test.ts
git commit -m "feat(cheatsheet): stage 4 — Sonnet streaming synthesis with citations"
```

---

### Task 12: Orchestrator — `lib/cheatsheet/orchestrate.ts`

**Files:**
- Create: `lib/cheatsheet/orchestrate.ts`
- Test: `tests/lib/cheatsheet/orchestrate.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/lib/cheatsheet/orchestrate.test.ts
import { describe, expect, it, vi } from "vitest";

import { runOrchestrator } from "@/lib/cheatsheet/orchestrate";
import type { StreamEvent } from "@/lib/cheatsheet/types";

describe("runOrchestrator (happy path)", () => {
  it("emits stage events in order and resolves with status complete", async () => {
    const events: StreamEvent[] = [];
    const result = await runOrchestrator({
      cheatsheetId: "cs-1",
      userId: "u1",
      sourceFileIds: ["f1"],
      canvasToken: "tok",
      anthropic: { /* unused, pipeline funcs are injected */ } as never,
      emit: (e) => events.push(e),
      pipeline: {
        ingest: async () => [{ id: "f1", name: "a.pdf", markdown: "alpha" }],
        detectGaps: async () => ({ gaps: [{ concept: "alpha", why_unclear: "x" }], tokensIn: 1, tokensOut: 1, degraded: false }),
        searchGaps: async () => ({
          results: [{
            gap: { concept: "alpha", why_unclear: "x" },
            snippets: [{ url: "https://a.com", title: "A", snippet: "s" }],
            failed: false,
          }],
          degraded: false,
        }),
        synthesize: async ({ onChunk }) => {
          onChunk?.("# Result\n");
          return {
            markdown: "# Result\n",
            citations: [{ n: 1, url: "https://a.com", title: "A", snippet: "s", gap_concept: "alpha" }],
            tokensIn: 5,
            tokensOut: 2,
          };
        },
        persist: vi.fn().mockResolvedValue(undefined),
        recordRun: vi.fn().mockResolvedValue(undefined),
      },
    });

    expect(result.status).toBe("complete");
    const stages = events.filter((e) => e.type === "stage-start").map((e) => (e as { stage: string }).stage);
    expect(stages).toEqual(["ingest", "detect-gaps", "web-search", "synthesize"]);
    expect(events.some((e) => e.type === "complete")).toBe(true);
    expect(events.some((e) => e.type === "markdown-chunk")).toBe(true);
  });
});

describe("runOrchestrator (degraded paths)", () => {
  it("emits a warning and synthesizes source-only when search is capped", async () => {
    const events: StreamEvent[] = [];
    const synthesize = vi.fn().mockResolvedValue({
      markdown: "ok", citations: [], tokensIn: 1, tokensOut: 1,
    });
    const result = await runOrchestrator({
      cheatsheetId: "cs-2",
      userId: "u1",
      sourceFileIds: ["f1"],
      canvasToken: "tok",
      anthropic: {} as never,
      emit: (e) => events.push(e),
      pipeline: {
        ingest: async () => [{ id: "f1", name: "a.pdf", markdown: "x" }],
        detectGaps: async () => ({ gaps: [{ concept: "z", why_unclear: "" }], tokensIn: 1, tokensOut: 1, degraded: false }),
        searchGaps: async () => ({ results: [], degraded: true, reason: "Daily search quota reached" }),
        synthesize,
        persist: vi.fn().mockResolvedValue(undefined),
        recordRun: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(result.status).toBe("complete");
    expect(events.some((e) => e.type === "warning")).toBe(true);
    expect(synthesize).toHaveBeenCalled();
  });

  it("fails the run when synthesis throws", async () => {
    const events: StreamEvent[] = [];
    const result = await runOrchestrator({
      cheatsheetId: "cs-3",
      userId: "u1",
      sourceFileIds: ["f1"],
      canvasToken: "tok",
      anthropic: {} as never,
      emit: (e) => events.push(e),
      pipeline: {
        ingest: async () => [{ id: "f1", name: "a.pdf", markdown: "x" }],
        detectGaps: async () => ({ gaps: [], tokensIn: 0, tokensOut: 0, degraded: false }),
        searchGaps: async () => ({ results: [], degraded: false }),
        synthesize: async () => {
          throw new Error("rate-limited");
        },
        persist: vi.fn().mockResolvedValue(undefined),
        recordRun: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(result.status).toBe("failed");
    expect(events.some((e) => e.type === "failed")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/lib/cheatsheet/orchestrate.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// lib/cheatsheet/orchestrate.ts
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { ingestFiles } from "@/lib/cheatsheet/ingest";
import { detectGaps, type DetectGapsResult } from "@/lib/cheatsheet/detect-gaps";
import { searchGaps, type SearchGapsResult } from "@/lib/cheatsheet/search";
import { synthesizeCheatsheet, type SynthesizeResult } from "@/lib/cheatsheet/synthesize";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import type {
  Citation,
  CheatsheetStage,
  IngestedFile,
  StreamEvent,
} from "@/lib/cheatsheet/types";

export type Pipeline = {
  ingest: (params: { fileIds: string[]; canvasToken: string }) => Promise<IngestedFile[]>;
  detectGaps: (params: { sourceMarkdown: string; client: Anthropic }) => Promise<DetectGapsResult>;
  searchGaps: (params: {
    gaps: DetectGapsResult["gaps"];
    userId: string;
  }) => Promise<SearchGapsResult>;
  synthesize: (params: {
    files: IngestedFile[];
    searchResults: SearchGapsResult["results"];
    client: Anthropic;
    onChunk?: (chunk: string) => void;
  }) => Promise<SynthesizeResult>;
  persist: (params: {
    cheatsheetId: string;
    markdown: string;
    citations: Citation[];
    status: "complete" | "failed";
    failureReason?: string;
  }) => Promise<void>;
  recordRun: (params: {
    cheatsheetId: string;
    stage: CheatsheetStage;
    startedAt: string;
    completedAt: string;
    tokensIn?: number;
    tokensOut?: number;
    metadata?: Record<string, unknown>;
    error?: string;
  }) => Promise<void>;
};

export type OrchestratorParams = {
  cheatsheetId: string;
  userId: string;
  sourceFileIds: string[];
  canvasToken: string;
  anthropic: Anthropic;
  emit: (ev: StreamEvent) => void;
  pipeline?: Partial<Pipeline>;
};

const defaultPipeline: Pipeline = {
  ingest: ({ fileIds, canvasToken }) => ingestFiles({ fileIds, canvasToken }),
  detectGaps: ({ sourceMarkdown, client }) => detectGaps({ sourceMarkdown, client }),
  searchGaps: ({ gaps, userId }) => searchGaps({ gaps, userId }),
  synthesize: (p) => synthesizeCheatsheet(p),
  persist: async ({ cheatsheetId, markdown, citations, status, failureReason }) => {
    const supabase = getSupabaseAdminClient();
    await supabase
      .from("cheatsheets")
      .update({
        markdown,
        citations,
        status,
        failure_reason: failureReason ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", cheatsheetId);
  },
  recordRun: async (params) => {
    const supabase = getSupabaseAdminClient();
    await supabase.from("cheatsheet_runs").insert({
      cheatsheet_id: params.cheatsheetId,
      stage: params.stage,
      started_at: params.startedAt,
      completed_at: params.completedAt,
      tokens_in: params.tokensIn,
      tokens_out: params.tokensOut,
      metadata: params.metadata,
      error: params.error,
    });
  },
};

export async function runOrchestrator(
  params: OrchestratorParams,
): Promise<{ status: "complete" | "failed"; reason?: string }> {
  const pipeline: Pipeline = { ...defaultPipeline, ...params.pipeline } as Pipeline;
  const { emit } = params;

  try {
    // Stage 1: Ingest
    const ingestStart = new Date().toISOString();
    emit({ type: "stage-start", stage: "ingest", message: `Parsing ${params.sourceFileIds.length} files…` });
    const files = await pipeline.ingest({
      fileIds: params.sourceFileIds,
      canvasToken: params.canvasToken,
    });
    const usable = files.filter((f) => !f.skipped && f.markdown.length > 0);
    if (usable.length === 0) {
      const reason = "No files could be parsed (all skipped or empty)";
      emit({ type: "failed", reason });
      await pipeline.persist({
        cheatsheetId: params.cheatsheetId,
        markdown: "",
        citations: [],
        status: "failed",
        failureReason: reason,
      });
      await pipeline.recordRun({
        cheatsheetId: params.cheatsheetId,
        stage: "ingest",
        startedAt: ingestStart,
        completedAt: new Date().toISOString(),
        error: reason,
      });
      return { status: "failed", reason };
    }
    for (const f of files) {
      if (f.skipped) {
        emit({ type: "warning", message: `Skipped ${f.name}: ${f.skipped.reason}` });
      }
    }
    emit({
      type: "stage-complete",
      stage: "ingest",
      data: { parsed: usable.length, skipped: files.length - usable.length },
    });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "ingest",
      startedAt: ingestStart,
      completedAt: new Date().toISOString(),
      metadata: { parsed: usable.length, skipped: files.length - usable.length },
    });

    // Stage 2: Detect gaps
    const gapsStart = new Date().toISOString();
    emit({ type: "stage-start", stage: "detect-gaps", message: "Identifying gap concepts…" });
    const sourceMarkdown = usable.map((f) => `## ${f.name}\n${f.markdown}`).join("\n\n");
    const gaps = await pipeline.detectGaps({ sourceMarkdown, client: params.anthropic });
    if (gaps.degraded) {
      emit({ type: "warning", message: "Gap detection failed; proceeding without enrichment" });
    }
    emit({
      type: "stage-complete",
      stage: "detect-gaps",
      data: { gaps: gaps.gaps.map((g) => g.concept) },
    });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "detect-gaps",
      startedAt: gapsStart,
      completedAt: new Date().toISOString(),
      tokensIn: gaps.tokensIn,
      tokensOut: gaps.tokensOut,
      metadata: { degraded: gaps.degraded, gap_count: gaps.gaps.length },
    });

    // Stage 3: Web search
    const searchStart = new Date().toISOString();
    emit({ type: "stage-start", stage: "web-search", message: `Searching for ${gaps.gaps.length} concept(s)…` });
    const search = await pipeline.searchGaps({ gaps: gaps.gaps, userId: params.userId });
    if (search.degraded) {
      emit({ type: "warning", message: search.reason ?? "Web search unavailable" });
    }
    emit({
      type: "stage-complete",
      stage: "web-search",
      data: {
        successful: search.results.filter((r) => !r.failed).length,
        failed: search.results.filter((r) => r.failed).length,
      },
    });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "web-search",
      startedAt: searchStart,
      completedAt: new Date().toISOString(),
      metadata: {
        degraded: search.degraded,
        reason: search.reason,
        failed_searches: search.results.filter((r) => r.failed).map((r) => r.gap.concept),
      },
    });

    // Stage 4: Synthesize
    const synthStart = new Date().toISOString();
    emit({ type: "stage-start", stage: "synthesize", message: "Writing cheatsheet…" });
    const synth = await pipeline.synthesize({
      files: usable,
      searchResults: search.results,
      client: params.anthropic,
      onChunk: (c) => emit({ type: "markdown-chunk", chunk: c }),
    });
    emit({ type: "stage-complete", stage: "synthesize" });
    await pipeline.recordRun({
      cheatsheetId: params.cheatsheetId,
      stage: "synthesize",
      startedAt: synthStart,
      completedAt: new Date().toISOString(),
      tokensIn: synth.tokensIn,
      tokensOut: synth.tokensOut,
    });

    // Persist final cheatsheet
    await pipeline.persist({
      cheatsheetId: params.cheatsheetId,
      markdown: synth.markdown,
      citations: synth.citations,
      status: "complete",
    });
    emit({ type: "complete", cheatsheet_id: params.cheatsheetId });
    return { status: "complete" };
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown error";
    emit({ type: "failed", reason });
    await pipeline.persist({
      cheatsheetId: params.cheatsheetId,
      markdown: "",
      citations: [],
      status: "failed",
      failureReason: reason,
    });
    return { status: "failed", reason };
  }
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/lib/cheatsheet/orchestrate.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/cheatsheet/orchestrate.ts tests/lib/cheatsheet/orchestrate.test.ts
git commit -m "feat(cheatsheet): pipeline orchestrator with SSE event emission"
```

---

## Phase 4 — API routes

### Task 13: `app/api/cheatsheets/route.ts` — list

**Files:**
- Create: `app/api/cheatsheets/route.ts`
- Test: `tests/app/api/cheatsheets/list-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/cheatsheets/list-route.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (col: string, val: string) => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [{ id: "cs1", title: "A", status: "complete", course_id: val, created_at: "x" }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/demo-user", () => ({ ensureDemoUser: async () => ({ id: "u1" }) }));

import { GET } from "@/app/api/cheatsheets/route";

describe("GET /api/cheatsheets", () => {
  it("requires course_id query param", async () => {
    const req = new Request("http://localhost/api/cheatsheets");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns cheatsheets for the user + course", async () => {
    const req = new Request("http://localhost/api/cheatsheets?course_id=c1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cheatsheets[0].id).toBe("cs1");
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/app/api/cheatsheets/list-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// app/api/cheatsheets/route.ts
import "server-only";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const courseId = url.searchParams.get("course_id");
  if (!courseId) {
    return Response.json({ error: "course_id is required" }, { status: 400 });
  }
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("cheatsheets")
    .select("id, title, status, course_id, created_at, completed_at")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ cheatsheets: data ?? [] });
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/app/api/cheatsheets/list-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/cheatsheets/route.ts tests/app/api/cheatsheets/list-route.test.ts
git commit -m "feat(api): GET /api/cheatsheets list route"
```

---

### Task 14: `app/api/cheatsheets/[id]/route.ts` — get one

**Files:**
- Create: `app/api/cheatsheets/[id]/route.ts`
- Test: `tests/app/api/cheatsheets/get-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/cheatsheets/get-route.test.ts
import { describe, expect, it, vi } from "vitest";

const fakeRow = (userId: string) => ({
  id: "cs1",
  user_id: userId,
  course_id: "c1",
  title: "T",
  source_file_ids: ["f1"],
  markdown: "# Hello",
  citations: [],
  status: "complete",
  failure_reason: null,
  created_at: "x",
  completed_at: "y",
});

vi.mock("@/lib/demo-user", () => ({ ensureDemoUser: async () => ({ id: "u1" }) }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: fakeRow("u1"), error: null }),
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/cheatsheets/[id]/route";

describe("GET /api/cheatsheets/[id]", () => {
  it("returns the cheatsheet when user owns it", async () => {
    const res = await GET(new Request("http://localhost/api/cheatsheets/cs1"), {
      params: Promise.resolve({ id: "cs1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cheatsheet.id).toBe("cs1");
  });
});

vi.doMock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: fakeRow("OTHER"), error: null }),
        }),
      }),
    }),
  }),
}));

describe("GET /api/cheatsheets/[id] (cross-user)", () => {
  it("returns 404 when user does not own the cheatsheet", async () => {
    vi.resetModules();
    const { GET: GET2 } = await import("@/app/api/cheatsheets/[id]/route");
    const res = await GET2(new Request("http://localhost/api/cheatsheets/cs1"), {
      params: Promise.resolve({ id: "cs1" }),
    });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/app/api/cheatsheets/get-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// app/api/cheatsheets/[id]/route.ts
import "server-only";

import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("cheatsheets")
    .select(
      "id, user_id, course_id, title, source_file_ids, markdown, citations, status, failure_reason, created_at, completed_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json({ cheatsheet: data });
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/app/api/cheatsheets/get-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/cheatsheets/[id]/route.ts tests/app/api/cheatsheets/get-route.test.ts
git commit -m "feat(api): GET /api/cheatsheets/[id] with ownership check"
```

---

### Task 15: `app/api/cheatsheets/generate/route.ts` — POST SSE

**Files:**
- Create: `app/api/cheatsheets/generate/route.ts`
- Test: `tests/app/api/cheatsheets/generate-route.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/app/api/cheatsheets/generate-route.test.ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo-user", () => ({ ensureDemoUser: async () => ({ id: "u1" }) }));

vi.mock("@/lib/llm/anthropic", async () => ({
  getAnthropicClient: () => ({}) as never,
  HAIKU_MODEL: "h",
  SONNET_MODEL: "s",
}));

const insertedRows: unknown[] = [];
vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: (table: string) => ({
      insert: (row: unknown) => {
        insertedRows.push({ table, row });
        return {
          select: () => ({
            single: async () => ({ data: { id: "cs-new" }, error: null }),
          }),
        };
      },
      update: () => ({ eq: async () => ({ data: null, error: null }) }),
    }),
  }),
}));

vi.mock("@/lib/cheatsheet/orchestrate", () => ({
  runOrchestrator: vi.fn(async ({ emit }: { emit: (e: unknown) => void }) => {
    emit({ type: "stage-start", stage: "ingest", message: "x" });
    emit({ type: "complete", cheatsheet_id: "cs-new" });
    return { status: "complete" };
  }),
}));

vi.mock("@/lib/canvas", () => ({ getFileDownloadUrl: async () => "u" }));

import { POST } from "@/app/api/cheatsheets/generate/route";

describe("POST /api/cheatsheets/generate", () => {
  it("400s when source_file_ids is empty", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ course_id: "c1", source_file_ids: [] }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns SSE stream with stage events on happy path", async () => {
    const req = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ course_id: "c1", source_file_ids: ["f1"], title: "T" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/event-stream/);
    const text = await res.text();
    expect(text).toContain("stage-start");
    expect(text).toContain("complete");
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/app/api/cheatsheets/generate-route.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// app/api/cheatsheets/generate/route.ts
import "server-only";

import { ensureDemoUser } from "@/lib/demo-user";
import { getAnthropicClient } from "@/lib/llm/anthropic";
import { encodeSseEvent } from "@/lib/cheatsheet/sse";
import { runOrchestrator } from "@/lib/cheatsheet/orchestrate";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { CANVAS_TOKEN } from "@/lib/env";
import type { StreamEvent } from "@/lib/cheatsheet/types";

export async function POST(req: Request): Promise<Response> {
  let body: { course_id?: string; source_file_ids?: string[]; title?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.course_id || !Array.isArray(body.source_file_ids) || body.source_file_ids.length === 0) {
    return Response.json(
      { error: "course_id and non-empty source_file_ids required" },
      { status: 400 },
    );
  }
  const user = await ensureDemoUser();

  // Auto-title default: "<course code> — <weekday>, <date>"
  const supabase = getSupabaseAdminClient();
  let title = body.title?.trim();
  if (!title) {
    const { data: course } = await supabase
      .from("courses")
      .select("code")
      .eq("id", body.course_id)
      .maybeSingle();
    const code = (course?.code as string | undefined) ?? "Cheatsheet";
    const d = new Date();
    title = `${code} — ${d.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}`;
  }

  const { data: created, error } = await supabase
    .from("cheatsheets")
    .insert({
      user_id: user.id,
      course_id: body.course_id,
      title,
      source_file_ids: body.source_file_ids,
      status: "streaming",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !created) {
    return Response.json(
      { error: error?.message ?? "Failed to create cheatsheet row" },
      { status: 500 },
    );
  }

  const anthropic = getAnthropicClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (ev: StreamEvent) => {
        controller.enqueue(encoder.encode(encodeSseEvent(ev)));
      };
      // Send the new cheatsheet id immediately so the client can navigate.
      emit({ type: "stage-start", stage: "ingest", message: `Cheatsheet ${created.id} starting…` });
      try {
        await runOrchestrator({
          cheatsheetId: created.id,
          userId: user.id,
          sourceFileIds: body.source_file_ids ?? [],
          canvasToken: CANVAS_TOKEN,
          anthropic,
          emit,
        });
      } catch (err) {
        emit({
          type: "failed",
          reason: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "x-cheatsheet-id": created.id,
    },
  });
}
```

> Note: `CANVAS_TOKEN` already exists in `lib/env.ts`. The Foundation spec replaces this with a per-user lookup.

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/app/api/cheatsheets/generate-route.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/cheatsheets/generate/route.ts tests/app/api/cheatsheets/generate-route.test.ts
git commit -m "feat(api): POST /api/cheatsheets/generate with SSE pipeline streaming"
```

---

## Phase 5 — UI

### Task 16: Cheatsheet viewer (component + page)

**Files:**
- Create: `app/ui/cheatsheet/cheatsheet-viewer.tsx`
- Create: `app/cheatsheets/[id]/page.tsx`
- Test: `tests/app/ui/cheatsheet/cheatsheet-viewer.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/ui/cheatsheet/cheatsheet-viewer.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { CheatsheetViewer } from "@/app/ui/cheatsheet/cheatsheet-viewer";

describe("CheatsheetViewer", () => {
  it("renders markdown body", () => {
    render(
      <CheatsheetViewer
        cheatsheet={{
          id: "cs1",
          title: "CS2030 — Streams",
          markdown: "# Streams\n\nLazy vs eager [1].",
          citations: [
            { n: 1, url: "https://oracle.com", title: "Oracle Java", snippet: "...", gap_concept: "Stream" },
          ],
          status: "complete",
        }}
      />,
    );
    expect(screen.getByRole("heading", { name: /streams/i })).toBeInTheDocument();
  });

  it("renders citation chips with links", () => {
    render(
      <CheatsheetViewer
        cheatsheet={{
          id: "cs1",
          title: "T",
          markdown: "x [1].",
          citations: [
            { n: 1, url: "https://a.com", title: "A", snippet: "s", gap_concept: "x" },
          ],
          status: "complete",
        }}
      />,
    );
    const link = screen.getByRole("link", { name: /A/ });
    expect(link).toHaveAttribute("href", "https://a.com");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("shows the failure reason when status is failed", () => {
    render(
      <CheatsheetViewer
        cheatsheet={{
          id: "cs1",
          title: "T",
          markdown: "",
          citations: [],
          status: "failed",
          failure_reason: "rate-limited",
        }}
      />,
    );
    expect(screen.getByText(/rate-limited/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/app/ui/cheatsheet/cheatsheet-viewer.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```tsx
// app/ui/cheatsheet/cheatsheet-viewer.tsx
"use client";

import ReactMarkdown from "react-markdown";

import type { Citation } from "@/lib/cheatsheet/types";

export type ViewerCheatsheet = {
  id: string;
  title: string;
  markdown: string | null;
  citations: Citation[] | null;
  status: "streaming" | "complete" | "failed";
  failure_reason?: string | null;
};

export function CheatsheetViewer({ cheatsheet }: { cheatsheet: ViewerCheatsheet }) {
  if (cheatsheet.status === "failed") {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900">
        <p className="font-semibold">Generation failed</p>
        <p className="mt-1">{cheatsheet.failure_reason ?? "Unknown error"}</p>
      </div>
    );
  }
  return (
    <article className="prose max-w-3xl">
      <h1>{cheatsheet.title}</h1>
      <ReactMarkdown>{cheatsheet.markdown ?? ""}</ReactMarkdown>
      {cheatsheet.citations && cheatsheet.citations.length > 0 ? (
        <section className="mt-8 border-t pt-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide">Sources</h2>
          <ol className="mt-2 space-y-2 text-sm">
            {cheatsheet.citations.map((c) => (
              <li key={c.n}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline"
                >
                  [{c.n}] {c.title}
                </a>
                <span className="ml-2 text-gray-500">— {c.gap_concept}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
```

- [ ] **Step 4: Implement the page**

```tsx
// app/cheatsheets/[id]/page.tsx
import { notFound } from "next/navigation";

import { CheatsheetViewer } from "@/app/ui/cheatsheet/cheatsheet-viewer";
import { ensureDemoUser } from "@/lib/demo-user";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export default async function CheatsheetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await ensureDemoUser();
  const supabase = getSupabaseAdminClient();
  const { data } = await supabase
    .from("cheatsheets")
    .select("id, user_id, title, markdown, citations, status, failure_reason")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.user_id !== user.id) notFound();
  return (
    <main className="p-6">
      <CheatsheetViewer cheatsheet={data} />
    </main>
  );
}
```

- [ ] **Step 5: Run test (expect pass)**

```bash
npm test -- tests/app/ui/cheatsheet/cheatsheet-viewer.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/ui/cheatsheet/cheatsheet-viewer.tsx app/cheatsheets/[id]/page.tsx tests/app/ui/cheatsheet/cheatsheet-viewer.test.tsx
git commit -m "feat(ui): cheatsheet viewer page with citations"
```

---

### Task 17: Streaming timeline + generating page

**Files:**
- Create: `app/ui/cheatsheet/streaming-timeline.tsx`
- Create: `app/cheatsheets/[id]/generating/page.tsx`
- Test: `tests/app/ui/cheatsheet/streaming-timeline.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/ui/cheatsheet/streaming-timeline.test.tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { StreamingTimeline } from "@/app/ui/cheatsheet/streaming-timeline";

describe("StreamingTimeline", () => {
  it("renders each stage event as a row", () => {
    render(
      <StreamingTimeline
        events={[
          { type: "stage-start", stage: "ingest", message: "Parsing 2 files…" },
          { type: "stage-complete", stage: "ingest", data: { parsed: 2, skipped: 0 } },
          { type: "stage-start", stage: "detect-gaps", message: "Identifying gap concepts…" },
          { type: "warning", message: "Skipped scan.pdf: no text layer" },
        ]}
        finished={false}
      />,
    );
    expect(screen.getByText(/parsing 2 files/i)).toBeInTheDocument();
    expect(screen.getByText(/identifying gap concepts/i)).toBeInTheDocument();
    expect(screen.getByText(/scan.pdf/i)).toBeInTheDocument();
  });

  it("shows a 'completed' indicator when finished is true", () => {
    render(
      <StreamingTimeline
        events={[{ type: "complete", cheatsheet_id: "cs1" }]}
        finished
      />,
    );
    expect(screen.getByText(/done|complete/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/app/ui/cheatsheet/streaming-timeline.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// app/ui/cheatsheet/streaming-timeline.tsx
"use client";

import type { StreamEvent } from "@/lib/cheatsheet/types";

const stageLabel: Record<string, string> = {
  ingest: "Parsing files",
  "detect-gaps": "Identifying gaps",
  "web-search": "Searching the web",
  synthesize: "Writing cheatsheet",
};

export function StreamingTimeline({
  events,
  finished,
}: {
  events: StreamEvent[];
  finished: boolean;
}) {
  return (
    <ol className="space-y-2 font-mono text-sm">
      {events.map((ev, i) => {
        if (ev.type === "stage-start") {
          return (
            <li key={i} className="text-gray-800">
              ▶ <span className="font-semibold">{stageLabel[ev.stage] ?? ev.stage}</span> — {ev.message}
            </li>
          );
        }
        if (ev.type === "stage-complete") {
          return (
            <li key={i} className="text-green-700">
              ✓ {stageLabel[ev.stage] ?? ev.stage} done{ev.data ? ` (${JSON.stringify(ev.data)})` : ""}
            </li>
          );
        }
        if (ev.type === "stage-progress") {
          return (
            <li key={i} className="text-gray-600 pl-4">
              · {ev.message}
            </li>
          );
        }
        if (ev.type === "warning") {
          return (
            <li key={i} className="text-amber-700">
              ⚠ {ev.message}
            </li>
          );
        }
        if (ev.type === "failed") {
          return (
            <li key={i} className="text-red-700 font-semibold">
              ✗ Failed: {ev.reason}
            </li>
          );
        }
        if (ev.type === "complete") {
          return (
            <li key={i} className="text-green-700 font-semibold">
              ✓ Complete
            </li>
          );
        }
        return null;
      })}
      {finished ? <li className="pt-2 text-gray-500">— done —</li> : null}
    </ol>
  );
}
```

- [ ] **Step 4: Implement the generating page (client wrapper that consumes the SSE)**

```tsx
// app/cheatsheets/[id]/generating/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { use } from "react";

import { StreamingTimeline } from "@/app/ui/cheatsheet/streaming-timeline";
import { parseSseChunks } from "@/lib/cheatsheet/sse";
import type { StreamEvent } from "@/lib/cheatsheet/types";

export default function GeneratingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [finished, setFinished] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    async function consume() {
      // The streaming response was returned to whoever clicked Generate.
      // On a hard reload of this page, we have no live stream — fall back to
      // polling the cheatsheet row until status != streaming.
      pollTimer = setInterval(async () => {
        const res = await fetch(`/api/cheatsheets/${id}`);
        if (!res.ok) return;
        const body = await res.json();
        const status = body?.cheatsheet?.status;
        if (status === "complete") {
          if (pollTimer) clearInterval(pollTimer);
          if (!cancelled) router.replace(`/cheatsheets/${id}`);
        } else if (status === "failed") {
          if (pollTimer) clearInterval(pollTimer);
          if (!cancelled) {
            setEvents((es) => [
              ...es,
              { type: "failed", reason: body?.cheatsheet?.failure_reason ?? "Unknown error" },
            ]);
            setFinished(true);
          }
        }
      }, 1500);
    }

    consume();
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [id, router]);

  // Subscribe to a window-level event that GenerateModal posts when it
  // already has a live SSE stream from the same click.
  useEffect(() => {
    function onChunk(e: Event) {
      const ev = (e as CustomEvent<{ id: string; raw: string }>).detail;
      if (ev.id !== id) return;
      const parsed = parseSseChunks(ev.raw);
      if (parsed.length === 0) return;
      setEvents((es) => [...es, ...parsed]);
      const last = parsed[parsed.length - 1];
      if (last.type === "complete") {
        setFinished(true);
        setTimeout(() => router.replace(`/cheatsheets/${id}`), 800);
      } else if (last.type === "failed") {
        setFinished(true);
      }
    }
    window.addEventListener("cheatsheet-sse-chunk", onChunk as EventListener);
    return () => window.removeEventListener("cheatsheet-sse-chunk", onChunk as EventListener);
  }, [id, router]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Generating cheatsheet…</h1>
      <p className="mt-1 text-sm text-gray-500">id: {id}</p>
      <div className="mt-6">
        <StreamingTimeline events={events} finished={finished} />
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Run test (expect pass)**

```bash
npm test -- tests/app/ui/cheatsheet/streaming-timeline.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/ui/cheatsheet/streaming-timeline.tsx app/cheatsheets/[id]/generating/page.tsx tests/app/ui/cheatsheet/streaming-timeline.test.tsx
git commit -m "feat(ui): streaming generation page with live SSE timeline"
```

---

### Task 18: Generate modal (file picker + submit)

**Files:**
- Create: `app/ui/cheatsheet/generate-modal.tsx`
- Test: `tests/app/ui/cheatsheet/generate-modal.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/ui/cheatsheet/generate-modal.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { GenerateModal } from "@/app/ui/cheatsheet/generate-modal";

const files = [
  { id: "f1", filename: "lecture-1.pdf", week_number: 1, uploaded_at: "2026-04-10" },
  { id: "f2", filename: "lecture-2.pdf", week_number: 2, uploaded_at: "2026-04-17" },
];

describe("GenerateModal", () => {
  it("disables submit when no files are selected", () => {
    render(<GenerateModal open onClose={() => {}} courseId="c1" files={files} />);
    expect(screen.getByRole("button", { name: /generate/i })).toBeDisabled();
  });

  it("enables submit when at least one file is selected", () => {
    render(<GenerateModal open onClose={() => {}} courseId="c1" files={files} />);
    fireEvent.click(screen.getByLabelText(/lecture-1\.pdf/i));
    expect(screen.getByRole("button", { name: /generate/i })).toBeEnabled();
  });

  it("posts to /api/cheatsheets/generate with selected ids on submit", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(`data: ${JSON.stringify({ type: "complete", cheatsheet_id: "cs9" })}\n\n`, {
        status: 200,
        headers: { "x-cheatsheet-id": "cs9", "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<GenerateModal open onClose={() => {}} courseId="c1" files={files} />);
    fireEvent.click(screen.getByLabelText(/lecture-1\.pdf/i));
    fireEvent.click(screen.getByRole("button", { name: /generate/i }));
    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/cheatsheets/generate",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ course_id: "c1", source_file_ids: ["f1"] });
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/app/ui/cheatsheet/generate-modal.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
// app/ui/cheatsheet/generate-modal.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export type ModalFile = {
  id: string;
  filename: string;
  week_number: number | null;
  uploaded_at: string | null;
};

export function GenerateModal({
  open,
  onClose,
  courseId,
  files,
}: {
  open: boolean;
  onClose: () => void;
  courseId: string;
  files: ModalFile[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (selected.size === 0) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/cheatsheets/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          source_file_ids: [...selected],
          title: title.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        alert(`Failed to start: ${body?.error ?? res.status}`);
        setSubmitting(false);
        return;
      }
      const id = res.headers.get("x-cheatsheet-id");
      if (!id) {
        alert("Server did not return cheatsheet id");
        setSubmitting(false);
        return;
      }
      onClose();
      router.push(`/cheatsheets/${id}/generating`);
      // Pump remaining SSE chunks to the generating page via a window event.
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const last = buffer.lastIndexOf("\n\n");
        if (last < 0) continue;
        const ready = buffer.slice(0, last + 2);
        buffer = buffer.slice(last + 2);
        window.dispatchEvent(
          new CustomEvent("cheatsheet-sse-chunk", { detail: { id, raw: ready } }),
        );
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div role="dialog" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-lg rounded bg-white p-6 shadow-lg">
        <h2 className="text-lg font-semibold">Generate cheatsheet</h2>
        <p className="text-sm text-gray-500">Pick the files to include.</p>
        <div className="mt-4 max-h-72 overflow-auto border rounded">
          {files.map((f) => (
            <label key={f.id} className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 text-sm">
              <input
                type="checkbox"
                checked={selected.has(f.id)}
                onChange={() => toggle(f.id)}
                aria-label={f.filename}
              />
              <span>{f.filename}</span>
              {f.week_number ? (
                <span className="ml-auto text-xs text-gray-500">Week {f.week_number}</span>
              ) : null}
            </label>
          ))}
        </div>
        <input
          type="text"
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-4 w-full rounded border px-3 py-2 text-sm"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={selected.size === 0 || submitting}
            className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {submitting ? "Generating…" : "Generate"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
npm test -- tests/app/ui/cheatsheet/generate-modal.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/ui/cheatsheet/generate-modal.tsx tests/app/ui/cheatsheet/generate-modal.test.tsx
git commit -m "feat(ui): generate modal with file picker + SSE pump"
```

---

### Task 19: Cheatsheet panel + integration into module-view

**Files:**
- Create: `app/ui/cheatsheet/cheatsheet-panel.tsx`
- Modify: `app/ui/dashboard/module-view.tsx`
- Test: `tests/app/ui/cheatsheet/cheatsheet-panel.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/app/ui/cheatsheet/cheatsheet-panel.test.tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { CheatsheetPanel } from "@/app/ui/cheatsheet/cheatsheet-panel";

describe("CheatsheetPanel", () => {
  it("lists existing cheatsheets and links to viewer", () => {
    render(
      <CheatsheetPanel
        courseId="c1"
        files={[]}
        cheatsheets={[
          { id: "cs1", title: "Streams Cheatsheet", status: "complete", created_at: "2026-04-30T00:00:00Z" },
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /streams cheatsheet/i });
    expect(link).toHaveAttribute("href", "/cheatsheets/cs1");
  });

  it("opens the generate modal when the button is clicked", () => {
    render(<CheatsheetPanel courseId="c1" files={[]} cheatsheets={[]} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /generate cheatsheet/i }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

```bash
npm test -- tests/app/ui/cheatsheet/cheatsheet-panel.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement the panel**

```tsx
// app/ui/cheatsheet/cheatsheet-panel.tsx
"use client";

import Link from "next/link";
import { useState } from "react";

import { GenerateModal, type ModalFile } from "@/app/ui/cheatsheet/generate-modal";

export type CheatsheetSummary = {
  id: string;
  title: string;
  status: "streaming" | "complete" | "failed";
  created_at: string;
};

export function CheatsheetPanel({
  courseId,
  files,
  cheatsheets,
}: {
  courseId: string;
  files: ModalFile[];
  cheatsheets: CheatsheetSummary[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Cheatsheets</h2>
        <button
          onClick={() => setOpen(true)}
          className="rounded bg-black px-3 py-1.5 text-sm text-white"
        >
          + Generate cheatsheet
        </button>
      </div>
      <ul className="mt-3 divide-y">
        {cheatsheets.length === 0 ? (
          <li className="py-3 text-sm text-gray-500">No cheatsheets yet.</li>
        ) : (
          cheatsheets.map((c) => (
            <li key={c.id} className="py-2">
              <Link
                href={c.status === "complete" ? `/cheatsheets/${c.id}` : `/cheatsheets/${c.id}/generating`}
                className="text-sm text-blue-700 hover:underline"
              >
                {c.title}
              </Link>
              <span className="ml-2 text-xs text-gray-500">
                {new Date(c.created_at).toLocaleString()} · {c.status}
              </span>
            </li>
          ))
        )}
      </ul>
      <GenerateModal open={open} onClose={() => setOpen(false)} courseId={courseId} files={files} />
    </section>
  );
}
```

- [ ] **Step 4: Wire CheatsheetPanel into `module-view.tsx`**

Read `app/ui/dashboard/module-view.tsx`. At the appropriate point in the JSX (after the existing files/announcements panels), add:

```tsx
import { CheatsheetPanel, type CheatsheetSummary } from "@/app/ui/cheatsheet/cheatsheet-panel";
```

And in the props/data flow:
1. Add a `cheatsheets: CheatsheetSummary[]` prop (or fetch in the page that wraps `ModuleView`).
2. Render at the bottom of the module body:

```tsx
<CheatsheetPanel
  courseId={module.id}
  files={module.files.map((f) => ({
    id: f.id,
    filename: f.filename ?? f.name ?? "Untitled",
    week_number: f.week_number ?? null,
    uploaded_at: f.uploadedAt ?? null,
  }))}
  cheatsheets={cheatsheets}
/>
```

If `module-view.tsx` is a server component that already loads `module.files`, fetch cheatsheets in the same query path:

```ts
const { data: cheatsheets } = await supabase
  .from("cheatsheets")
  .select("id, title, status, created_at")
  .eq("user_id", user.id)
  .eq("course_id", module.id)
  .order("created_at", { ascending: false })
  .limit(20);
```

Pass that array down. (If `module-view.tsx` already has user/supabase plumbing, follow its existing pattern — do NOT introduce a new pattern.)

- [ ] **Step 5: Run test (expect pass)**

```bash
npm test -- tests/app/ui/cheatsheet/cheatsheet-panel.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run full test suite + lint**

```bash
npm test
npm run lint
```

Expected: all tests pass, no new lint errors.

- [ ] **Step 7: Manual smoke test in dev**

```bash
npm run dev
```

Open the app, navigate to a module that has at least one synced PDF, click "+ Generate cheatsheet", select a file, click Generate. Verify the streaming page renders progress events and eventually redirects to a viewer with rendered markdown + citations.

If `ANTHROPIC_API_KEY` and `TAVILY_API_KEY` are set, this exercises the real pipeline end-to-end.

- [ ] **Step 8: Commit**

```bash
git add app/ui/cheatsheet/cheatsheet-panel.tsx app/ui/dashboard/module-view.tsx tests/app/ui/cheatsheet/cheatsheet-panel.test.tsx
git commit -m "feat(ui): cheatsheet panel + module-view integration"
```

---

## Phase 6 — Polish

### Task 20: Manual prompt-quality eval script

**Files:**
- Create: `scripts/cheatsheet-eval.ts`
- Modify: `package.json` (add npm script)

- [ ] **Step 1: Implement the eval script**

```typescript
// scripts/cheatsheet-eval.ts
// Usage:
//   npx tsx scripts/cheatsheet-eval.ts --files tests/fixtures/pdfs/lecture-sample.pdf
// Runs the real pipeline against fixture PDFs (no DB writes) and prints the
// detected gaps + final markdown for human review during prompt iteration.

import "dotenv/config";
import { readFileSync } from "node:fs";

import { extractPdfMarkdown } from "@/lib/cheatsheet/ingest";
import { detectGaps } from "@/lib/cheatsheet/detect-gaps";
import { searchGaps } from "@/lib/cheatsheet/search";
import { synthesizeCheatsheet } from "@/lib/cheatsheet/synthesize";
import { getAnthropicClient } from "@/lib/llm/anthropic";

async function main() {
  const fileArgIdx = process.argv.indexOf("--files");
  const filePaths =
    fileArgIdx >= 0 ? process.argv.slice(fileArgIdx + 1) : ["tests/fixtures/pdfs/lecture-sample.pdf"];

  const files = await Promise.all(
    filePaths.map(async (p) => ({
      id: p,
      name: p,
      markdown: await extractPdfMarkdown(readFileSync(p)),
    })),
  );
  const sourceMd = files.map((f) => `## ${f.name}\n${f.markdown}`).join("\n\n");
  const client = getAnthropicClient();

  console.log("--- Detected gaps ---");
  const gaps = await detectGaps({ sourceMarkdown: sourceMd, client });
  for (const g of gaps.gaps) console.log(`• ${g.concept} — ${g.why_unclear}`);
  console.log(`(degraded=${gaps.degraded}, tokensIn=${gaps.tokensIn}, tokensOut=${gaps.tokensOut})`);

  console.log("\n--- Search results ---");
  const search = await searchGaps({
    gaps: gaps.gaps,
    userId: "eval-script",
    incrementUsage: async () => ({ allowed: true, remaining: 999 }),
  });
  for (const r of search.results) {
    console.log(`• ${r.gap.concept}: ${r.failed ? "FAILED" : `${r.snippets.length} snippets`}`);
  }

  console.log("\n--- Synthesized cheatsheet ---");
  const synth = await synthesizeCheatsheet({
    files,
    searchResults: search.results,
    client,
    onChunk: (c) => process.stdout.write(c),
  });
  console.log("\n\n--- Citations ---");
  for (const c of synth.citations) console.log(`[${c.n}] ${c.title} — ${c.url}`);
  console.log(`\n(tokensIn=${synth.tokensIn}, tokensOut=${synth.tokensOut})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

In `package.json` `scripts`, add:

```json
"cheatsheet:eval": "tsx scripts/cheatsheet-eval.ts"
```

- [ ] **Step 3: Verify it runs**

```bash
npm run cheatsheet:eval -- --files tests/fixtures/pdfs/lecture-sample.pdf
```

Expected: prints gaps, search summaries, streamed cheatsheet, and citation list. (Costs real Anthropic + Tavily tokens.)

- [ ] **Step 4: Commit**

```bash
git add scripts/cheatsheet-eval.ts package.json
git commit -m "chore(cheatsheet): add manual prompt-quality eval script"
```

---

## Self-review checklist

Run before declaring the plan complete:

- [ ] Spec coverage: every section in [the design spec](../specs/2026-04-30-agentic-cheatsheet-design.md) — architecture, data model, components, error handling, testing — has at least one corresponding task above.
- [ ] No placeholders: scan plan for "TBD", "TODO", "implement later", "similar to Task N" — none present.
- [ ] Type consistency: `IngestedFile`, `GapConcept`, `SearchResult`, `Citation`, `StreamEvent`, `CheatsheetStage`, `CheatsheetStatus` are defined in Task 3 and referenced consistently in Tasks 8–17.
- [ ] Function names: `extractPdfMarkdown`, `ingestFiles`, `detectGaps`, `searchGaps`, `synthesizeCheatsheet`, `runOrchestrator`, `getAnthropicClient`, `tavilySearch`, `encodeSseEvent`, `parseSseChunks` — used consistently across tasks and tests.
- [ ] All commits use conventional commit prefixes matching the repo (`feat`, `fix`, `chore`, `docs`).
- [ ] Foundation prerequisite acknowledged: env-key Anthropic + `ensureDemoUser` are clearly the swap points for when the Foundation spec lands.

## Foundation swap-back points (for when Foundation spec lands)

When the Foundation spec is implemented:

1. Replace `getAnthropicClient()` env-key body with a per-user lookup against `user_secrets`.
2. Replace `ensureDemoUser()` with the real auth context in:
   - `app/api/cheatsheets/route.ts`
   - `app/api/cheatsheets/[id]/route.ts`
   - `app/api/cheatsheets/generate/route.ts`
   - `app/cheatsheets/[id]/page.tsx`
3. Replace `CANVAS_TOKEN` env constant in `app/api/cheatsheets/generate/route.ts` with per-user token lookup.
4. Add RLS policies to `cheatsheets`, `cheatsheet_runs`, `web_search_usage` (the Foundation spec covers RLS migrations).

These four changes are bounded edits — no logic changes in the pipeline itself.
