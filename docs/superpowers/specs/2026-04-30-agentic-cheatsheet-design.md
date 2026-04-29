# Agentic Cheatsheet — Design

**Status:** Draft (pending user review)
**Date:** 2026-04-30
**Author:** Aiden Ma

## Context

Studex today is a single-user dashboard mirroring NUS Canvas data into Supabase. This spec adds the first agentic feature: generating exam-prep cheatsheets from user-selected Canvas files, enriched with web-search gap-filling.

This is the headline feature in a larger product vision (chat, planner, holistic homepage), and it's the first one that justifies the "agentic layer between Canvas and students" framing.

## Prerequisites

This spec **depends on a separate Foundation spec** that ships first:

- Supabase Auth (Google OAuth, gated to `@u.nus.edu`)
- `user_secrets` table with encrypted Canvas tokens **and** Anthropic API keys
- RLS migration of all existing tables to scope by `user_id`
- Replacement of `lib/demo-user.ts` with real auth context

The Foundation spec is its own design cycle and is not detailed here. The cheatsheet implementation assumes those primitives exist.

## Goals

- Student multi-selects Canvas files for a course → receives a cheatsheet within ~60s
- Web-search fills gaps the lecture material doesn't fully explain (e.g. "Dijkstra" mentioned but not defined), with inline citations
- The pipeline streams progress events live so the agentic loop is visible
- Costs are bounded: LLM is BYOK (user pays Anthropic directly); web-search is app-paid with a per-user daily cap

## Non-goals (v1)

- Editing the cheatsheet after generation (read-only; regenerate to change)
- PDF export
- Other artifact types (expanded notes, flashcards) — separate specs
- Sharing cheatsheets between users (subsystem 3 = anonymous module chat handles sharing)
- PPT, Word, scanned PDFs (no OCR)
- Stripe / paid tiers / quota upgrades

## Decisions locked in during brainstorming

| Decision | Choice | Why |
|---|---|---|
| Architecture | Evolve current Studex (Next.js 16 + Supabase + Tailwind) | Stack covers every requirement natively; expensive Canvas integration already works |
| Subsystem priority | Cheatsheet pipeline first | Highest-leverage demo, cleanest evaluation criteria |
| Input unit | User-selected files | Maps to how students study; no new schema concepts; foundation for "smart presets" later |
| Web-search role | Targeted gap-fill with inline citations | Bounded cost, clear evaluation, academic trust |
| Multi-user | From day one (foundation prerequisite) | Avoids interleaving auth refactor with prompt iteration |
| Billing | BYOK Anthropic + app-paid Tavily with daily cap | Zero LLM cost to app; bounded search cost |
| Pipeline shape | Multi-stage explicit, sync with streamed progress | The streaming agent loop is the demo; debuggable per stage |

## Architecture

Four explicit stages, all running in one streaming server action:

```
[1] Ingest          [2] Detect gaps        [3] Web-search          [4] Synthesize
─────────────────   ───────────────────    ───────────────────     ──────────────────
canvas_files row    Claude Haiku           Tavily search           Claude Sonnet 4.6
   │                structured output      (parallel, 1 per gap)   markdown + citations
   ▼                JSON: { gaps:[…] }     │                       │
download via                                ▼                       ▼
user's Canvas       ▶ "Dijkstra not       ▶ snippets + URLs       ▶ cheatsheet.md
token + parse PDF     fully defined"        per gap term            with [n] markers
   │                ▶ "what is O(log n)?"                          + sources list
   ▼                                                                │
markdown (cached                                                    ▼
in canvas_files                                                  saved to
.processed_text)                                                 cheatsheets table

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━ each stage emits SSE events ━━━━━━━━━━━━━━━━━━━━━
                          { stage, message, progress, data }
                                       │
                                       ▼
                    client renders progress timeline live
```

**Provider choices:**
- LLM: Anthropic. Haiku 4.5 for gap-detection, Sonnet 4.6 for synthesis. Both billed to user's BYOK key.
- Web search: Tavily (purpose-built for LLM agent retrieval). App-paid with `~50/day per user` cap.
- PDF parsing: text-extraction only (e.g. `pdf-parse` or `unpdf`). PDFs without a text layer fail gracefully.

**Format:** PDF only for v1. PPT/Word are listed as v1.1 follow-ups.

**Markdown caching:** parsed markdown stored in `canvas_files.processed_text`. The second cheatsheet that includes the same lecture skips the parse step.

**Hosting / timeout assumption:** Vercel Pro (300s function timeout) is the target deployment. On Hobby (60s) the pipeline is borderline for 5+ file inputs and the spec acknowledges this in the error-handling section (graceful timeout failure with re-attempt suggestion). Migration of synthesis to a background job is the planned escape hatch if real-world generations exceed the Pro limit.

## Data model

### New tables

```sql
-- The artifact itself
CREATE TABLE cheatsheets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id),
  course_id       uuid NOT NULL REFERENCES courses(id),
  title           text NOT NULL,
  source_file_ids uuid[] NOT NULL,
  markdown        text,                            -- null until status='complete'
  citations       jsonb,                           -- [{n, url, title, snippet, gap_concept}]
  status          text NOT NULL CHECK (status IN ('streaming','complete','failed')),
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

-- Per-stage audit / debugging / cost tracking
CREATE TABLE cheatsheet_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cheatsheet_id   uuid NOT NULL REFERENCES cheatsheets(id) ON DELETE CASCADE,
  stage           text NOT NULL CHECK (stage IN ('ingest','detect-gaps','web-search','synthesize')),
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  tokens_in       int,
  tokens_out      int,
  metadata        jsonb,                           -- gaps detected, queries, model, etc.
  error           text
);

-- Per-user daily web-search cap
CREATE TABLE web_search_usage (
  user_id         uuid NOT NULL REFERENCES users(id),
  date            date NOT NULL,
  count           int NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- RLS policies are added by the Foundation spec when it migrates
-- the app-level users table to Supabase auth.users.
-- For v1 (this spec), data is scoped at the application layer via demo-user.
```

### Existing-table reuse (no migration needed)

`canvas_files` already has `extracted_text text` and `processed bool default false` columns. The ingest stage reuses them: when `processed=false` (or `extracted_text IS NULL`), parse the PDF and write back; otherwise use the cached value. No schema change to `canvas_files`.

### Why JSONB for citations (not a separate table)

V1 never queries across citations. Storing them as a JSONB array on the `cheatsheets` row is simpler and faster to read. If future features need cross-cheatsheet citation analytics, that's a migration.

## Components

### Backend libs (server-only)

```
lib/cheatsheet/
  ingest.ts          — for each source_file_id: read processed_text;
                       if null, fetch download URL via user's Canvas token,
                       parse PDF, write back. Returns { files: [{id,name,markdown}] }.
  detect-gaps.ts     — Claude Haiku call with structured JSON output.
                       Input: concatenated source markdown.
                       Output: { gaps: [{ concept, why_unclear }] }.
  search.ts          — Tavily client. searchGaps(gaps[]) runs Promise.allSettled.
                       Increments web_search_usage; throws cap-exceeded before
                       calling if over limit.
  synthesize.ts      — Claude Sonnet streaming call. Input: source markdown +
                       search results. Streams markdown chunks; final pass
                       returns citations array.
  orchestrate.ts     — runs the four stages, emits SSE events, writes to
                       cheatsheets and cheatsheet_runs as it goes.

lib/llm/
  anthropic.ts       — getAnthropicClient(): returns configured SDK client.
                       v1 reads ANTHROPIC_API_KEY from env (single-user demo).
                       Foundation spec replaces with per-user lookup.

lib/search/
  tavily.ts          — thin wrapper over Tavily REST API.
```

### API routes

| Route | Method | Behavior |
|---|---|---|
| `/api/cheatsheets/generate` | POST | Body: `{ course_id, source_file_ids[], title? }`. Returns SSE stream. Creates `cheatsheets` row with `status='streaming'`, drives orchestrator, finalizes status. |
| `/api/cheatsheets/[id]` | GET | Fetch single cheatsheet (with citations). RLS-scoped. |
| `/api/cheatsheets` | GET | Query: `?course_id=...`. List user's cheatsheets for a course. |

### UI surfaces

- **Per-module Cheatsheets section** — extend `app/ui/dashboard/module-view.tsx` with a panel listing existing cheatsheets + "+ Generate" button.
- **Generate modal** — file multi-picker (synced PDFs for that course, sortable by recency), optional title field. On submit, modal closes and the browser navigates to the streaming progress page (`/cheatsheets/[id]/generating`).
- **Auto-title** — if user leaves the title blank, default to `"<course code> — <weekday>, <date>"` (e.g. `CS2030 — Thu, 30 Apr 2026`). Editable later from the viewer.
- **Streaming progress page** — `/cheatsheets/[id]/generating`. Consumes SSE, renders live timeline (`Parsing 4 files... ✓`, `Identified 6 gap concepts: [chips]`, `Searching: "Dijkstra's algorithm"...`). On `complete`, redirects to `/cheatsheets/[id]` (viewer). On reload mid-generation, page resumes from last-known state via the polling fallback.
- **Cheatsheet viewer** — `app/cheatsheets/[id]/page.tsx`. Rendered markdown with `[n]`-style citation chips (click → open source URL in new tab). Sources list at bottom. "Regenerate" button.

### Existing code touched

- `lib/canvas.ts` — no changes (uses existing `getFileDownloadUrl`)
- `lib/sync.ts` — no changes (parsing happens lazily during ingest, not during sync)
- `app/ui/dashboard/module-view.tsx` — add Cheatsheets panel
- `supabase/schema.sql` — new tables + `processed_text` column
- (Foundation spec replaces `lib/demo-user.ts` independently; this spec uses whatever auth context the foundation provides.)

## Error handling

The pipeline degrades gracefully. Only synthesis itself failing is fatal. Every other stage failure has a fallback path that still produces a useful artifact.

### Pre-flight (before stage 1)

| Condition | Behavior |
|---|---|
| Anthropic key missing | 400 — "Add your API key in Settings" |
| Canvas token missing | 400 — "Reconnect Canvas in Settings" |
| 3+ concurrent generations for same user | 429 — "wait for current generations to finish" |

### Per-stage policy

| Failure | Behavior |
|---|---|
| **Stage 1: Canvas file inaccessible / permissions / deleted** | Mark file skipped, continue with rest. If all fail → run fails: "Couldn't access any selected files" |
| **Stage 1: PDF parse fails (scanned, corrupted)** | Skip file with reason ("scanned PDF — no text layer"); shown in streaming timeline |
| **Stage 1: Network error downloading** | Retry once with backoff, then skip |
| **Stage 2: Anthropic invalid key / rejected** | Run fails immediately. UI: "Anthropic rejected your API key — check Settings" |
| **Stage 2: Anthropic rate-limit / 5xx** | Retry once with 2s backoff, then fail |
| **Stage 2: Malformed JSON output from Haiku** | Retry once, then fall back to "no gaps detected"; synthesis proceeds source-only (degraded but functional) |
| **Stage 2: Token limit exceeded** | Fail: "Selected files exceed model context — pick fewer files" |
| **Stage 3: Tavily daily cap hit** | Skip web-search entirely. Synthesis proceeds source-only. Cheatsheet stamped with banner "Daily search quota reached" |
| **Stage 3: Individual search fails** | That gap loses its enrichment. Concept still appears in cheatsheet without external context. Logged in `cheatsheet_runs.metadata.failed_searches[]` |
| **Stage 3: Tavily entirely down** | Skip web-search, synthesize source-only, banner "Search unavailable" |
| **Stage 4: Synthesis 5xx / rate-limit** | Retry once, then fail |
| **Stage 4: Streaming connection drops** | Cheatsheet stays `status='streaming'`. Client falls back to polling `GET /api/cheatsheets/[id]` to recover state |
| **Whole pipeline: Vercel timeout** | Orchestrator sets internal deadline 5s under Vercel limit, finalizes as `failed` with reason "generation timed out — try fewer files" |

### Guarantees

- Every failure writes a `cheatsheet_runs` row with `error` populated
- User-facing messages are actionable (key / file / search / scope), never generic
- Failed cheatsheets are kept (not deleted) — user can read what went wrong, re-attempt
- Partial success preferred over hard fail (skip one file vs abort run)

## Testing strategy

| Layer | What gets tested | Approach |
|---|---|---|
| Per-stage unit (`tests/lib/cheatsheet/*.test.ts`) | Each stage in isolation | Mock dependencies. Real PDF fixtures for ingest. |
| Orchestrator | Stage sequencing, SSE event emission, state transitions, fallback ladder | Mock all four stages. Verify event sequence on happy path + every error branch. |
| API routes (`tests/app/api/cheatsheets/*.test.ts`) | SSE format, pre-flight checks, RLS scoping | Mock orchestrator. Assert "user A cannot fetch user B's cheatsheet." |
| UI components (`tests/app/ui/cheatsheet/*.test.tsx`) | Generate modal validation, streaming-page event rendering, viewer citation links | Existing Vitest + jsdom + testing-library pattern. |
| Integration (single end-to-end test, externals mocked) | Happy path + key failure paths produce expected final state | Confirms wiring. |

### Specific notes

- **Ingest fixtures** — commit 2-3 small representative NUS-style lecture PDFs (anonymized) to `tests/fixtures/pdfs/`. Tests parse them and assert markdown extraction.
- **Anthropic SDK mocking** — wrap the SDK behind `lib/llm/anthropic.ts`. Tests inject a fake client.
- **Tavily mocking** — wrap behind `lib/search/tavily.ts`. Tests use a stub returning canned snippets.
- **SSE parser** — tested separately as a pure function; lets the client-side timeline renderer be tested without spinning up a server.
- **RLS smoke test** — one test per new table confirms a different `auth.uid()` cannot read or write rows.

### Explicitly NOT in CI

- **LLM output quality** (gap-detection precision, synthesis usefulness, citation relevance) — subjective and prompt-dependent. Lives in `tests/manual/cheatsheet-eval.ts`, run on demand against a small fixture set when iterating prompts.
- **End-to-end with real LLM + real Tavily** — costs real tokens. Manual smoke before each release.

### Migration testing

- Schema changes ship with a migration script
- A `scripts/test-migration.ts` runs migrations against a clean Supabase, confirms tables / columns / RLS policies exist as designed (extends the existing `scripts/audit-db.ts` pattern)

## Open questions / future work

These are intentionally deferred and should not block v1.

- **PPT / Word / scanned PDF support** (OCR) — v1.1 if needed
- **Edit / refine loop** — "expand this section" follow-up prompts; currently regenerate-only
- **PDF export** of cheatsheets for printing
- **Smart presets** layered on file-selection UI — "all files since last cheatsheet", "files for week N", "everything before midterm" (requires exam-date concept)
- **Cross-provider LLM** — currently Anthropic-only; OpenAI BYOK could be added later
- **Cheatsheet quality eval framework** — beyond the manual fixture script, build an evaluator that scores cheatsheets against a rubric (would help when iterating prompts seriously)

## Implementation milestone ordering

1. Foundation spec lands (separate spec, separate plan)
2. Schema migration: new tables + `processed_text` column
3. Backend libs: ingest → detect-gaps → search → synthesize → orchestrate
4. API routes: generate (SSE), get, list
5. UI: cheatsheet viewer first (so generated content has somewhere to land), then generate modal + streaming page, then per-module panel
6. Manual prompt-iteration loop against real NUS PDFs before declaring v1 done
