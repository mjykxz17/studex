# Branch Improvement Review

This document captures high-impact improvements identified after reviewing the current branch.

## 1) Add authentication + per-user authorization on API routes

**Why:** Multiple API endpoints currently use the admin Supabase client directly and accept user/module IDs from request payloads without validating session ownership. This creates a risk that one caller could read or mutate another user's data.

**Where:**
- `app/api/chat/route.ts`
- `app/api/modules/list/route.ts`
- `app/api/modules/toggle-sync/route.ts`
- `app/api/sync/route.ts`

**Improvement:**
- Introduce authenticated user resolution (Supabase Auth or trusted session middleware).
- Restrict every query/update with `.eq("user_id", sessionUserId)`.
- Avoid accepting arbitrary `userId` in request bodies for privileged operations.

## 2) Replace the Phase-1 default user fallback with explicit onboarding

**Why:** The sync route auto-creates/auto-selects a default user row (`phase1-local@studex.local`). This is convenient for demos but unsafe for multi-user deployments and can hide setup errors.

**Where:**
- `app/api/sync/route.ts` (`ensurePhase1User` and callers)

**Improvement:**
- Fail fast when no authenticated user exists.
- Move one-time bootstrap behavior into a setup script or protected admin endpoint.

## 3) Make sync idempotent at the database layer (not only app-layer filtering)

**Why:** Sync currently checks existing IDs in memory and filters “new” records. Under concurrent sync calls, duplicates can still race in before inserts complete.

**Where:**
- `app/api/sync/route.ts` (announcement/task/file insertion paths)
- Supabase schema files (`supabase/schema*.sql`)

**Improvement:**
- Add unique constraints/indexes for keys such as:
  - `(module_id, canvas_announcement_id)` on `announcements`
  - `(module_id, source, source_ref_id)` on `tasks`
  - `(module_id, canvas_file_id)` on `canvas_files`
- Switch inserts to `upsert` or handle unique violations gracefully.

## 4) Reduce sync latency and AI cost with bounded queues + caching

**Why:** Sync performs multiple AI calls per artifact (classification, summary, deadlines, embeddings). For larger modules this can be slow/costly.

**Where:**
- `app/api/sync/route.ts`
- `lib/ai.ts`
- `lib/embed.ts`

**Improvement:**
- Introduce a shared concurrency limiter for AI calls across files/announcements.
- Cache expensive operations by content hash (`sha256(extracted_text)`), reusing summaries/embeddings when unchanged.
- Consider batching embedding generation in `generateEmbeddings` callsites where feasible.

## 5) Improve frontend maintainability by removing large static mock blocks

**Why:** `dashboard-client.tsx` contains very large hardcoded datasets and many `any`-typed props. This increases bundle size and makes refactors risky.

**Where:**
- `app/dashboard-client.tsx`

**Improvement:**
- Move mock fixtures into separate JSON/TS fixture files (loaded only in dev/fallback mode).
- Replace `any` with concrete interfaces for module details, quiz items, and component props.
- Split the giant client component into smaller composable sections.

## 6) Harden runtime configuration and startup diagnostics

**Why:** Environment variable checks are split across modules and fail in different ways (`env.ts` hard-throws; `dashboard.ts` does permissive checks). This can lead to confusing runtime behavior.

**Where:**
- `lib/env.ts`
- `lib/dashboard.ts`
- `README.md`

**Improvement:**
- Centralize config validation (single source of truth).
- Expose a health endpoint (`/api/health`) showing missing non-secret configuration keys.
- Keep README and `.env.example` fully aligned with runtime requirements.

## 7) Add baseline automated quality gates

**Why:** The repository currently has lint configured but environments can fail when dependencies are missing. There are no visible tests for core data shaping logic.

**Where:**
- `package.json`
- `lib/dashboard.ts`
- `lib/ai.ts` (pure helpers)

**Improvement:**
- Add CI workflow for `npm ci`, `npm run lint`, and tests.
- Add unit tests for deterministic helpers (`formatRelativeDayLabel`, `getTaskStatus`, JSON parsing fallbacks).
- Add API contract tests for key routes using mocked Supabase/AI clients.

## 8) Add structured observability for long-running sync flows

**Why:** Sync uses SSE status messages and `console.error`, but lacks request correlation IDs and durable metrics.

**Where:**
- `app/api/sync/route.ts`
- `app/api/chat/route.ts`

**Improvement:**
- Emit structured logs with `requestId`, `userId`, `moduleId`, and stage timings.
- Track success/failure counters for ingestion and embedding stages.
- Record partial-failure outcomes (e.g., metadata inserted but embeddings failed).

---

## Suggested implementation order

1. Authentication + authorization (items 1 & 2)
2. DB-level idempotency (item 3)
3. Observability and test baseline (items 7 & 8)
4. Performance/cost optimizations (item 4)
5. Frontend maintainability cleanup (item 5)
6. Config consistency polish (item 6)
