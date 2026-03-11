# STUDEX — Project Memory & Build Plan
> This file is the single source of truth for the Studex project.
> OpenClaw: Read this entire file at the start of every session before writing any code or giving any advice.

---

## FOR OPENCLAW: HOW TO USE THIS FILE

1. **Read the CURRENT STATE section first.** It tells you exactly where the project is right now, what phase is active, and what the last completed task was.
2. **Never assume context from previous chat sessions.** Always derive state from this file.
3. **After completing any task, remind Aiden to update the CURRENT STATE section** so the next session starts correctly.
4. **When in doubt about architecture, refer to the DECISIONS section.** These are finalised choices — do not suggest alternatives unless Aiden explicitly asks.
5. **The PHASE sections are sequential.** Do not work on Phase 2 tasks while Phase 1 is incomplete.

---

## CURRENT STATE
> Aiden: Update this block after every working session.

```
Phase active : 1 (Personal Use)
Last completed : Project planning and architecture design
Currently working : Nothing yet — starting from scaffold
Next task : Phase 1 Step 1 — scaffold Next.js project
Blockers : None
Notes : -
```

---

## PROJECT OVERVIEW

**What is Studex?**
Studex is an AI-powered student dashboard for NUS students. It connects to Canvas LMS, automatically syncs all course content (files, announcements, assignments), processes everything with AI, and presents it as a clean unified dashboard. The AI has persistent memory of all processed content and can answer questions about any course material.

**The core problem it solves:**
Every NUS lecturer organises Canvas differently. Some put everything in PDFs, others leave Canvas blank. Studex normalises this — regardless of how a lecturer organises their content, students always see the same clean interface.

**Core loop:**
Canvas API → extract text from files → chunk + embed → store in Supabase (pgvector) → AI queries vectors to answer student questions → dashboard auto-updates every 15 minutes via cron.

**Who pays for AI:**
The student brings their own API key (OpenAI or Anthropic). Aiden pays nothing for AI costs.

---

## FINALISED DECISIONS
> These are locked. Do not re-open unless Aiden explicitly asks.

| Decision | Choice | Reason |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | Server components, API routes, Vercel-native |
| Styling | Tailwind CSS | Already used in prototype |
| Backend | Vercel Serverless Functions (Next.js API routes) | No separate server needed |
| Database | Supabase (Postgres) | pgvector built-in, auth built-in, free tier |
| Vector store | Supabase pgvector | Avoids separate vector DB service until 500+ users |
| Auth | Supabase Auth (Phase 2+) | Phase 1 has no auth |
| AI | Student's own API key | Zero AI cost to Aiden at any scale |
| Token storage | AES encryption via crypto-js | Tokens stored encrypted, never plaintext |
| File storage | None — Canvas remains file host | Only store extracted text + embeddings |
| Sync mechanism | Vercel Cron (pull-based polling) | Canvas has no webhooks |
| Cron frequency | Every 15 min, 8am–11pm | Balances freshness vs Canvas rate limits |
| Monetisation | Freemium SaaS (future) — NOT ads | Ads generate <$30/month at NUS scale |
| File preview | PDF: native iframe. PPTX/DOCX: Google Docs viewer. Panopto: swap Viewer→Embed in URL | No file storage needed |

---

## TECH STACK

```
Frontend Next.js 14 (App Router) + Tailwind CSS
Hosting Vercel (free tier → Pro at scale)
Database Supabase — Postgres + pgvector + Auth
AI processing Student's OpenAI or Anthropic API key
Embeddings text-embedding-3-small (OpenAI), 1536 dimensions
PDF parsing pdf-parse (npm)
Encryption crypto-js (AES)
Source ctrl GitHub (Vercel auto-deploys on push to main)
```

---

## PROJECT FILE STRUCTURE

```
studex/
 app/
 page.tsx # dashboard (home)
 onboard/page.tsx # onboarding flow (Phase 2)
 modules/[id]/page.tsx # per-module view
 api/
 canvas/route.ts # proxy all Canvas API calls
 process/route.ts # trigger AI processing on content
 chat/route.ts # RAG chat endpoint
 sync/route.ts # full sync (manual Phase 1, cron Phase 2)

 lib/
 supabase.ts # Supabase client (anon + service)
 canvas.ts # Canvas API wrapper
 ai.ts # AI wrapper (Claude / OpenAI, model-agnostic)
 embed.ts # text chunking + vector generation
 encrypt.ts # AES encrypt/decrypt for tokens

 vercel.json # cron job config (added in Phase 2)
 .env.local # secrets — never commit to git
```

---

## ENVIRONMENT VARIABLES

```bash
# .env.local (Phase 1 — hardcoded to Aiden's accounts)
CANVAS_TOKEN= # Aiden's Canvas API token
CANVAS_BASE_URL=https://canvas.nus.edu.sg

ANTHROPIC_API_KEY= # Aiden's Anthropic key
OPENAI_API_KEY= # Aiden's OpenAI key (for embeddings)
AI_MODEL=claude-haiku-4-5 # default model
EMBED_MODEL=text-embedding-3-small

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY= # service key — server-side only, never expose to browser
ENCRYPTION_SECRET= # 32-char random string — never change after Phase 2 launch
```

> Phase 2 addition: ENCRYPTION_SECRET is used to AES-encrypt each user's Canvas token and AI key before storing in DB.

---

## DATABASE SCHEMA

Run this once in the Supabase SQL editor before starting Phase 1.

```sql
-- Enable vector support
create extension if not exists vector;

-- Users table (Phase 1: single row for Aiden. Phase 2: one row per student)
create table users (
 id uuid default gen_random_uuid() primary key,
 email text unique,
 canvas_token_enc text, -- AES encrypted
 ai_provider text, -- 'openai' or 'anthropic'
 ai_key_enc text, -- AES encrypted
 ai_model text,
 created_at timestamptz default now(),
 last_synced_at timestamptz
);

-- One row per Canvas course per user
create table modules (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id),
 canvas_course_id text,
 code text, -- e.g. CS3235
 title text,
 last_canvas_sync timestamptz
);

-- One row per Canvas file
create table canvas_files (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id),
 user_id uuid references users(id),
 canvas_file_id text unique, -- used for delta sync
 filename text,
 file_type text, -- 'lecture' | 'tutorial' | 'assignment' | 'other'
 canvas_url text,
 extracted_text text,
 processed bool default false,
 week_number int, -- AI-inferred
 uploaded_at timestamptz
);

-- One row per Canvas announcement
create table announcements (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id),
 user_id uuid references users(id),
 canvas_announcement_id text unique,
 title text,
 body_raw text,
 ai_summary text,
 importance text, -- 'high' | 'normal' | 'low'
 detected_deadlines jsonb,
 posted_at timestamptz
);

-- One row per assignment
create table tasks (
 id uuid default gen_random_uuid() primary key,
 module_id uuid references modules(id),
 user_id uuid references users(id),
 title text,
 due_at timestamptz,
 source text, -- 'canvas' | 'ai_extracted' | 'manual'
 source_ref_id text,
 completed bool default false,
 weight float
);

-- One row per text chunk from any processed content
create table embeddings (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id),
 module_id uuid references modules(id),
 source_type text, -- 'file' | 'announcement' | 'task'
 source_id uuid,
 chunk_index int,
 chunk_text text,
 embedding vector(1536),
 created_at timestamptz default now()
);

-- Sync history
create table sync_log (
 id uuid default gen_random_uuid() primary key,
 user_id uuid references users(id),
 sync_type text, -- 'files' | 'announcements' | 'full'
 status text, -- 'success' | 'error' | 'partial'
 items_processed int,
 error_message text,
 ran_at timestamptz default now()
);

-- Vector similarity search function
create function match_chunks(
 query_embedding vector(1536),
 match_user_id uuid,
 match_module_id uuid, -- pass null to search across all modules
 match_count int
)
returns table(id uuid, chunk_text text, source_type text, similarity float)
language sql as $$
 select id, chunk_text, source_type,
 1 - (embedding <=> query_embedding) as similarity
 from embeddings
 where user_id = match_user_id
 and (match_module_id is null or module_id = match_module_id)
 order by embedding <=> query_embedding
 limit match_count;
$$;
```

---

## CANVAS API — KEY FACTS FOR OPENCLAW

- Base URL: `https://canvas.nus.edu.sg/api/v1`
- Auth header: `Authorization: Bearer <token>`
- All responses are JSON. All list endpoints are paginated — follow the `Link: <url>; rel="next"` header until it is absent.
- Canvas is **pull-only**. There are no webhooks. All syncing must be done by polling.
- Rate limiting is **per token**. Since each student has their own token, they each have their own rate limit bucket.
- To get a temporary authenticated download URL for a file: `GET /api/v1/files/:id` returns a `url` field that works for a short window.

**Endpoints used by Studex:**
```
GET /api/v1/courses # list enrolled courses
GET /api/v1/courses/:id/files # list files in a course
GET /api/v1/courses/:id/discussion_topics?only_announcements=true # announcements
GET /api/v1/courses/:id/assignments # assignments + due dates
GET /api/v1/files/:id # get temp download URL for a file
```

---

## AI PROCESSING PIPELINE

When new content is detected during sync, run this pipeline in order:

1. **Extract text**
 - PDFs: use `pdf-parse`. Pass the file buffer, get back `.text`.
 - HTML (announcements): strip tags, decode HTML entities.

2. **Chunk text**
 - Split into segments of ~500 tokens.
 - Keep 50-token overlap between adjacent chunks.
 - Prepend metadata to each chunk: `[Module: CS3235 | Week: 3 | Source: lecture_notes.pdf]`

3. **Embed each chunk**
 - Call OpenAI `text-embedding-3-small` on each chunk text.
 - Store the chunk text + vector in the `embeddings` table.

4. **Structured extraction** (run on announcements and assignment descriptions)
 - Use a cheap model (Haiku or gpt-4o-mini).
 - Enforce strict JSON output. Example prompt:
 ```
 Extract all deadlines from the text below.
 Return ONLY valid JSON, no explanation:
 {"deadlines": [{"title": string, "due_date": "YYYY-MM-DD", "weight": string}]}
 If none found: {"deadlines": []}

 Text: <content>
 ```
 - Store result in `detected_deadlines` (jsonb) on the announcement row.

5. **Mark processed**
 - Set `processed = true` on the source record so it is skipped on future syncs.

**Model routing (Phase 3):**
- Deadline/date extraction, file classification, short summaries → Haiku / gpt-4o-mini
- Study note generation, multi-document reasoning, complex Q&A → Sonnet / gpt-4o
- Never use Opus. Cost does not justify quality gain for this use case.

---

## RAG CHAT FLOW

When a student sends a message:

1. Embed the user's message using `text-embedding-3-small`.
2. Call `match_chunks()` with the query embedding, the user's ID, and the active module ID (or null for cross-module search). Retrieve top 5 chunks.
3. Build the prompt:
 ```
 You are an AI assistant helping an NUS student with their coursework.
 Use ONLY the context below to answer. If the answer is not in the context, say so.
 Always cite which file or announcement your answer comes from.

 Context:
 [chunk 1 with source metadata]
 [chunk 2 with source metadata]
 ...

 Student question: <message>
 ```
4. Call the student's configured AI model with this prompt.
5. Return the response with source citations.

---

## PHASE 1 — PERSONAL USE
**Status: NOT STARTED**
**Estimated time: 1–3 weeks**
**Done when:** Aiden can open the app locally, see his real Canvas modules, and ask "what is due this week?" and get an accurate answer sourced from his actual Canvas data.

### Steps (do these in order)

**Step 1 — Scaffold**
```bash
npx create-next-app@latest studex --typescript --tailwind --app
cd studex
npm install @supabase/supabase-js pdf-parse openai @anthropic-ai/sdk crypto-js axios
```
Create `.env.local` with all variables from the ENVIRONMENT VARIABLES section above. Add `.env.local` to `.gitignore` before the first commit.

**Step 2 — Supabase setup**
Run the full SQL from the DATABASE SCHEMA section in the Supabase SQL editor. Verify tables and the `match_chunks` function are created with no errors.

**Step 3 — lib/supabase.ts**
Create two clients: one using the anon key (for browser/user-facing requests) and one using the service key (for server-side admin operations). The service key must never be used in client components.

**Step 4 — lib/canvas.ts**
Implement the Canvas API wrapper with these functions: `getCourses`, `getFiles`, `getAnnouncements`, `getAssignments`, `getFileDownloadUrl`. Handle pagination in all list functions. Read the token from `process.env.CANVAS_TOKEN` for now (Phase 1 only).

**Step 5 — lib/embed.ts**
Implement `chunkText(text, chunkSize=500, overlap=50)` and `generateEmbedding(text)`. The embedding function calls OpenAI `text-embedding-3-small` and returns a 1536-element float array.

**Step 6 — lib/ai.ts**
Implement a model-agnostic `callAI(prompt, model)` function that routes to Anthropic or OpenAI based on the model string prefix. Implement `extractDeadlines(text)` and `classifyFile(filename, text)` using structured JSON prompts with a cheap model.

**Step 7 — app/api/sync/route.ts**
Implement the full sync: fetch courses → fetch files + announcements per course → for each new item (not in DB yet), extract text → chunk → embed → structured extraction → save to DB. Log results to `sync_log`.

**Step 8 — app/api/chat/route.ts**
Implement the RAG chat endpoint as described in the RAG CHAT FLOW section above.

**Step 9 — Dashboard UI**
Build `app/page.tsx` with: module list sidebar, weekly task view, recent announcements, AI chat panel. Read data from Supabase directly in server components where possible.

**Step 10 — Test end to end**
Trigger sync via `GET /api/sync` from the browser. Verify modules appear. Ask the chat a question about a real lecture. Confirm the answer cites a real file.

---

## PHASE 2 — FRIENDS (SMALL GROUP)
**Status: NOT STARTED — do not begin until Phase 1 is stable**
**Estimated time: 3–4 weeks**
**Done when:** A friend visits the Vercel URL, signs up, connects their Canvas, and sees their own modules — without Aiden touching any code.

### Steps (do these in order)

**Step 1 — Add Supabase Auth**
```bash
npm install @supabase/ssr
```
Enable Email/Password in Supabase dashboard → Authentication → Providers. Follow the official Supabase Next.js App Router auth guide. Create `app/login/page.tsx` and `app/signup/page.tsx`. Protect all API routes by verifying the session before any processing.

**Step 2 — Row-level security**
Run these migrations:
```sql
alter table modules enable row level security;
alter table canvas_files enable row level security;
alter table announcements enable row level security;
alter table tasks enable row level security;
alter table embeddings enable row level security;

create policy "own data" on modules for all using (auth.uid() = user_id);
create policy "own data" on canvas_files for all using (auth.uid() = user_id);
create policy "own data" on announcements for all using (auth.uid() = user_id);
create policy "own data" on tasks for all using (auth.uid() = user_id);
create policy "own data" on embeddings for all using (auth.uid() = user_id);
```

**Step 3 — lib/encrypt.ts**
```typescript
import CryptoJS from 'crypto-js';
const SECRET = process.env.ENCRYPTION_SECRET!;
export const encrypt = (text: string) => CryptoJS.AES.encrypt(text, SECRET).toString();
export const decrypt = (cipher: string) => CryptoJS.AES.decrypt(cipher, SECRET).toString(CryptoJS.enc.Utf8);
```

**Step 4 — Onboarding page**
Build `app/onboard/page.tsx`. Collect: Canvas token (with a screenshot guide), AI provider choice, AI API key, model preference. On submit: encrypt both keys, save to `users` table, immediately trigger sync in background, redirect to dashboard with a loading state.

**Step 5 — Update sync to be per-user**
Remove the hardcoded `CANVAS_TOKEN` from sync. Instead, read the user's encrypted token from DB, decrypt it, use it for that user's Canvas calls. All DB writes must include the `user_id`.

**Step 6 — Cron job**
Create `vercel.json`:
```json
{
 "crons": [
 {
 "path": "/api/sync",
 "schedule": "*/15 8-23 * * *"
 }
 ]
}
```
Update `app/api/sync/route.ts` to iterate all users sequentially with a 500ms delay between each. Process users ordered by `last_synced_at` ascending (oldest sync first).

**Step 7 — Manual sync button + rate limiting**
Add a sync button to the dashboard header. Track last manual sync time in localStorage. Block re-trigger if less than 5 minutes since last manual sync. Show "Last synced X minutes ago" timestamp.

**Step 8 — Deploy**
Push to GitHub. Import repo in Vercel. Set all environment variables in Vercel dashboard. Verify cron job appears in Vercel → Project → Cron Jobs.

---

## PHASE 3 — PUBLIC LAUNCH
**Status: NOT STARTED — do not begin until Phase 2 has been stable with real users for 2–3 weeks**
**Estimated time: 4–8 weeks**
**Done when:** Any NUS student can sign up and use Studex with no help from Aiden.

### Steps (do in order)

**Step 1 — Google OAuth**
Enable Google in Supabase Auth → Providers. Add a "Continue with Google" button to the login page. Reduces signup friction significantly.

**Step 2 — Canvas OAuth (apply early)**
Apply for a Developer Key from NUS IT. This enables one-click "Connect Canvas" instead of manual token copy-paste. Approval timeline is unpredictable — apply as soon as Phase 2 is live. Details at: canvas.nus.edu.sg/doc/api/file.oauth.html

**Step 3 — AI model tier selector**
Add a setting in user preferences:
- Standard: Haiku / gpt-4o-mini for everything
- Enhanced (default): smart routing — cheap model for extraction, flagship for reasoning
- Max: Sonnet / gpt-4o for everything

**Step 4 — File preview**
- PDF: fetch Canvas temp URL → load in `<iframe>`
- PPTX/DOCX: pass Canvas temp URL to `https://docs.google.com/viewer?url=ENCODED_URL&embedded=true` → load in `<iframe>`
- Panopto: replace `/Viewer.aspx` with `/Embed.aspx` in the URL → load in `<iframe>`
- Fallback if iframe blocked by CSP: stream file bytes through `/api/canvas/file-proxy` and serve from your domain

**Step 5 — Observability**
```bash
npm install @sentry/nextjs
```
- Sentry: error tracking. Run `npx @sentry/wizard@latest -i nextjs`.
- PostHog: product analytics. Track signup rate, sync success rate, chat usage.
- Uptime Robot: free URL monitoring with email alerts.

**Step 6 — Staggered sync at scale**
When user count exceeds ~100, the single-loop cron will timeout. Switch to batch processing: process 20 users per cron invocation, ordered by `last_synced_at`. At 100 users and 15-min cron, all users are covered within ~75 minutes — acceptable.

**Step 7 — Legal requirements (mandatory before public launch)**
- Write a Privacy Policy disclosing: data collected, Supabase storage, Canvas content sent to OpenAI/Anthropic for processing, user rights.
- Add a "Delete my account" button in settings. It must wipe all rows referencing `user_id` across all tables plus the Supabase Auth record.
- Add an AI transparency notice during onboarding: "Your Canvas content will be processed by [provider] to generate summaries and answer your questions."

---

## COST AT EACH PHASE

| Phase | Aiden's cost | AI cost |
|---|---|---|
| Phase 1 | ~$0 (all free tiers) | Aiden pays his own key, ~$1/semester |
| Phase 2 | ~$0 (all free tiers) | Each friend pays their own key |
| Phase 3 <200 users | ~$25–50/month (Supabase Pro) | Each user pays their own key |
| Phase 3 500+ users | ~$50–80/month + Pinecone | Each user pays their own key |

---

## KNOWN CONSTRAINTS

- Canvas has no webhooks. All syncing is polling. Minimum practical sync interval is 10–15 minutes.
- Canvas file downloads require authentication. Always fetch a temporary URL via `/api/v1/files/:id` before redirecting or iframing. Do not use raw Canvas file URLs as they may expire or require session cookies.
- Panopto and lecture recording URLs are external to Canvas. The Canvas API only returns a link. In-app embed works by swapping Viewer→Embed in the URL, but requires the student to be logged into NUS SSO.
- Canvas API rate limit is per user token. Sequential processing per token avoids hitting it. Never fire parallel Canvas requests on the same token.
- ENCRYPTION_SECRET must never change after Phase 2 launches. If it changes, all stored encrypted tokens become unreadable.
- Supabase pgvector is sufficient up to ~500 users. Beyond that, migrate the embeddings table to Pinecone.

---
*Last updated: March 2026*
*Maintained by: Aiden*
*OpenClaw: do not modify this file directly. Ask Aiden to update the CURRENT STATE block after each session.*
