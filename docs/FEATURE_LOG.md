# Studex Feature Log

> Append-only chronicle of feature work on this project. Newest first.
> Scope changes get their own entry under the original feature.
>
> **Format per entry:**
> - **Date** — ISO date the entry was written
> - **Status** — `planned` / `in-progress` / `shipped` / `scope-changed` / `deferred` / `abandoned`
> - **Commits** — short SHAs
> - **Files** — primary new/modified paths
> - **Why** — the motivating constraint or pain point
> - **Decisions / Scope notes** — any judgment calls or scope deviations

---

## 2026-05-01 · UI overhaul — Phase 2 (extend design system to remaining surfaces)
**Status:** Planned (scoping question pending user)
**Why:** Phase 1 proved the token + primitive system on the Progress tab. Phase 2 extends it to the remaining surfaces (home dashboard, module view, dialogs, NUSMods Current sem tab, cheatsheet flow) and adds the deferred primitive extractions (`Dialog`, `Tabs`, `Menu`, `ProgressBar`, `cn()` helper) that the Phase 1 reviewer flagged.
**Scope decisions pending:**
- Approach: foundations + one surface (recommended) / dialogs-only / surface-by-surface
- Which surface first if doing one at a time (home / module-view / dialogs / cheatsheet)
- Whether to extract all 4 deferred primitives at once or only the ones the chosen surface needs
- Whether to also migrate existing Pill call sites off legacy aliases now (would let us delete OLD class strings) or defer
**No commits yet — need user direction before plan.**

---

## 2026-05-01 · UI overhaul — Apple-style polish + interaction redesign (Phase 1)
**Status:** Shipped (awaiting browser smoke test)
**Spec:** `docs/superpowers/specs/2026-05-01-ui-design-system-phase-1-design.md`
**Plan:** `docs/superpowers/plans/2026-05-01-ui-design-system-phase-1.md`
**Commits:** `3f49d51` → `9628fa0` (12 implementation commits, subagent-driven execution)
**Tests:** 175 → 201 (26 new primitive + Pill tests)
**Files shipped:**
- New tokens: `app/tokens.css` (3-layer: primitives → semantic → density, with `motion-hover` / `motion-press` utilities + `prefers-reduced-motion` honour)
- New primitives: `app/ui/primitives/{container,card,button,input,density-selector}.tsx`
- Extended: `app/ui/dashboard/shared.tsx` `Pill` (5 new tones + 3 legacy aliases)
- FOUC blocker: `app/layout.tsx` reads localStorage + sets `<html data-density>` synchronously before paint
- Migrated to primitives: `app/ui/progress/{progress-view,bucket-card,program-selector,module-takings-editor}.tsx`
- Interaction refinements applied:
  - Tracked-module rows show only status + grade inline; bucket override + Remove behind hover-revealed `•••` menu (popover with click-outside-to-close)
  - Primary `Add to plan` button paired with NUSMods search input
  - Density selector + Program selector both right-aligned in Progress header
- Bucket grid responsive: `md:grid-cols-2 xl:grid-cols-3`
**Open thread:** Manual browser smoke confirmed by user

### 2026-05-01 · Post-review fixes (sub-entry)
**Status:** Shipped
**Commit:** `e5fc0a7`
**Why:** Final cross-cutting review (Opus reviewer) found 2 blocking + 3 important issues. Fixes:
- (Critical) `npm run build` was failing — `manage-view.tsx` used `tone="emerald"` which the new Pill union dropped. Added `emerald` to legacy aliases.
- (Critical) Pill visual regression on every non-migrated Pill consumer (module-view, module-tree, nusmods-view, file-card, etc.) — the new compact tokenized look had been forced onto legacy aliases too. Restructured so per-tone classes carry their own padding/font/size; legacy aliases (`blue`, `rose`, `slate`, `emerald`) preserve OLD colored-bg/border/`py-1`/`font-semibold` look exactly. New tones (`neutral`/`accent`/`success`/`warn`/`danger`) keep the compact tokenized look.
- (Important) DensitySelector hydration mismatch — switched to `useSyncExternalStore` (canonical React pattern for external storage) eliminating SSR/CSR mismatch.
- (Important) `•••` popover keyboard a11y — added `aria-expanded`, `aria-haspopup="menu"`, `role="menu"` / `role="menuitem"`, `focus-within:opacity-100` (so keyboard users can reach the trigger), Escape key handler.
- (Important) Removed dead `@theme inline` self-references in `app/globals.css` that were tautologies relying on import order.

**Verification gate fix:** Future plans must include `npm run build` (not just lint + vitest) since `tsc` strict checks on un-touched files are only caught at build time.

**Deferred (in followup tickets):**
- Add unit tests for `module-takings-editor` `•••` flow (popover state, click-outside, bucket override calls)
- Phase 2: extract `Menu` primitive; migrate Pill consumers off legacy aliases; extract `ProgressBar` primitive; add `clsx`/`cn()` helper; Playwright visual snapshots
**Why:** User feedback: "I want the UI to be more flexible for user, it should be optimized for what I want to show, buttons should be at intuitive places. I want the transition or anything to follow the apple.com style."

**Scope decisions made (brainstormed 2026-05-01):**
- **Surface first:** Approach E → Approach 1 — design-system foundation + prove on **Progress tab only**; other surfaces migrate in follow-up plans
- **Apple style depth:** Calmly polished (option B) — iCloud / Reminders / Notes web app aesthetic, not theatrical apple.com marketing-page motion
- **Typography + colour:** Option A — Full Apple SF (system-font, true cool grays #1d1d1f / #6e6e73 / #86868b / #f5f5f7, blue accent #0071e3, drop Lora for this surface)
- **"Flexible" definition:** B + D — global Density toggle (compact/comfortable/spacious) + smart responsiveness; A (drag-rearrange) and C (per-section collapse) deferred
- **Motion:** Hand-rolled CSS only this phase; no `motion` npm dep; honour `prefers-reduced-motion`
- **Token system:** 3-layer CSS variables in `app/tokens.css` (primitives → semantic → density); Tailwind extends to expose semantic tokens as utilities

**Scope (Phase 1 only):**
- New: `app/tokens.css`, primitives `Button` / `Card` / `Input` / `DensitySelector` / `Container`
- Modified: `Pill` extended in place; `progress-view.tsx`, `bucket-card.tsx`, `module-takings-editor.tsx`, `program-selector.tsx`
- Interaction refinements on Progress tab: hover-revealed `•••` menu for bucket-override + Remove; primary `Add to plan` button paired with search; density + program selectors right-aligned in header
- ~12 new primitive unit tests; 13-step manual smoke checklist
- ~10–12 hours

**Deferred to follow-up phases:** dialog primitive, tabs primitive, dark mode, motion library, all other surfaces (home / module view / cheatsheet / dialogs / NUSMods Current sem), drag-rearrange, per-section collapse

---

## 2026-05-01 · Bucket override dropdown in takings editor
**Status:** Shipped
**Commits:** `cf4c390`
**Files:** `app/ui/progress/module-takings-editor.tsx`, `app/ui/progress/progress-view.tsx`
**Why:** The greedy auto-bucket-assignment in the audit engine sometimes places modules in the "wrong" bucket when their pools overlap (e.g., CS3235 could go to IS Electives or Computing Breadth). User needs an explicit override.
**Decisions:** New per-row `<select>` showing "Auto-assign / → bucket name". Writes to `module_takings.bucket_override` via the existing POST endpoint.

## 2026-05-01 · BComp CS curriculum + program selector
**Status:** Shipped
**Commits:** `57c98ec`
**Files:** `data/curricula/bcomp-cs-2024.yaml`, `app/api/user-program/route.ts`, `app/ui/progress/program-selector.tsx`, `app/ui/progress/progress-view.tsx`
**Why:** Phase A audit was hardcoded to InfoSec. Adding a second program proved the spec format generalises and unlocks ~10× the audience.
**Decisions:** Hand-curated YAML from `comp.nus.edu.sg/programmes/ug/cs/curr/`. CS differs from InfoSec in: `CS1101S` not `CS1010`, `ES2660` not `GEX%` for Critique, `CS2030S/CS2040S` (functional track), Foundation = 36 MC (adds `CS2109S` + `CS3230`), Breadth & Depth = 32 open MC. Program list in the API is hardcoded to `["bcomp-isc-2024", "bcomp-cs-2024"]` for now — will need a discovery API once we add ≥5 programs.

## 2026-05-01 · Module-takings editor with NUSMods search
**Status:** Shipped
**Commits:** `44bea1a`
**Files:** `app/api/nusmods/search/route.ts`, `app/ui/progress/module-takings-editor.tsx`, `app/ui/progress/progress-view.tsx`
**Why:** Phase A only auto-populated `module_takings` rows when Canvas synced (status: `in_progress`). To mark `CS1010` completed, change `CS3235` to planning, etc., the user had to write SQL by hand — dead-end for daily use.
**Decisions:** Search hits NUSMods' `moduleList.json` server-side with Next.js `revalidate: 3600` cache (~250KB, 10K modules). Editor uses counter-based refetch trigger to avoid `set-state-in-effect` lint. Audit refreshes after every mutation.

## 2026-05-01 · Degree Audit Phase A — Information Security
**Status:** Shipped
**Plan:** `docs/superpowers/plans/2026-05-01-degree-audit-phase-a.md`
**Commits:** `111b046` → `59e05aa` (15 task commits)
**Files:**
- Schema: `supabase/migrations/0010_add_curriculum_tables.sql`
- Engine: `lib/curriculum/{types,match,loader,audit,suggest}.ts`
- Catalog: `lib/nus-catalog.ts`
- Sync hook: `lib/sync.ts` (`ensureModuleTaking`)
- API: `app/api/{module-takings,audit}/route.ts`
- UI: `app/ui/progress/{progress-view,bucket-card}.tsx`, `app/ui/dashboard/nusmods-view.tsx` (3-tab structure)
- Curriculum: `data/curricula/bcomp-isc-2024.yaml`
**Why:** User said "I want this project to be their project buddy" and "the planner cannot make sure that I will graduate." NUSMods' Planner doesn't verify graduation requirements; commercial degree-audit systems cost schools $100K–$1M/year. Studex builds a contained kernel: one audit engine + one curriculum (InfoSec).
**Decisions:** Curriculum specs as YAML in version control (not DB) for easy human curation + diff. Audit engine is a pure function with greedy bucket assignment in spec order. Honors `bucket_override` first, OR rules atomically, then greedy. Wildcards (`GEX%`), `choose_n`, `all_of`, `or`, `open` rule kinds. NUSMods catalog is lazy: only fetches modules referenced by spec or taken by user. Tests: 32 curriculum unit tests + 4 takings API tests + 2 progress-view component tests.
**Deferred to Phase B:** crawlers for NUS faculty pages, multi-major coverage, Planning tab implementation, prereq enforcement, level-cap constraints (≥80% major MC at L1000–4000), ID/CD validation, honours dissertation rule, year-of-matriculation versioning, crowdsourced spec contributions.

## 2026-05-01 · Zoom passcode quick-copy + Panopto-as-course-tab
**Status:** Shipped
**Commits:** `3cf3e0e`, `27e0384`, `1cafb0d`
**Files:** `lib/canvas-url.ts` (`isZoomUrl`, `parseZoomPasscode`, `detectPanoptoTab`), `lib/sync.ts` (Panopto tab detection during sync), `app/ui/dashboard/widgets/module-tree.tsx` (Copy passcode button), `app/ui/panopto-dialog.tsx` (extracted from module-tree), `app/ui/dashboard/module-view.tsx` (Lecture recordings header button)
**Why:** User reported "where is panopto" → diagnosed: 12/12 of their lecture recordings were Zoom (not Panopto); also NUS lecturers often add Panopto via course nav tab (LTI tool) rather than as Module Items, so the original Panopto support missed those.
**Decisions:** Zoom passcode parser uses `/Passcode\s*[:\-]?\s*(\S+)/i`. Panopto tab detection looks at label (`/panopto|lecture\s*record/i`) or URL containing "panopto". Schema migration 0009 adds `courses.panopto_tab_url`. Panopto LTI launcher URLs (canvas-internal) get rendered as a plain link (Canvas does the redirect); direct Panopto URLs use the embedded modal.

## 2026-04-30 · In-app content viewers (Pages, announcements, assignments, DOCX, video, Panopto)
**Status:** Shipped (review-approved with deferred follow-ups)
**Plan:** `docs/superpowers/plans/2026-04-30-in-app-content-viewers.md`
**Commits:** `fcab2df` → `33192cb` (~20 commits)
**Files:**
- Sanitizer: `lib/sanitize.ts` (DOMPurify wrapper, module-level hook for `target=_blank`)
- DOCX: `lib/file-render.ts` (mammoth wrapper)
- URLs: `lib/canvas-url.ts` (`panoptoEmbedUrl`, `isVideoFilename`)
- API: `app/api/{pages,tasks}/[id]/route.ts`, `app/api/files/[fileId]/docx/route.ts`
- UI: `app/ui/{page,announcement-detail,assignment-detail}-dialog.tsx`, `app/ui/dashboard/widgets/module-tree.tsx`
- Sync: `lib/sync.ts` (assignment description persistence)
- Schema: `supabase/migrations/0008_add_task_description.sql`
**Why:** Goal: render every Canvas course item directly in Studex without redirecting users to canvas.nus.edu.sg. Studex's value over NUSMods/Canvas is the unified course view; that promise was broken by "Open in Canvas" CTAs.
**Decisions:** HTML sanitized server-side at every boundary (sync writer, dashboard loader, API routes). Module tree (Canvas Modules tab) became the primary in-module navigation, dispatching by `itemType` to the right viewer. DOCX uses mammoth → sanitized HTML. Video files use native `<video>` via existing file-proxy. Panopto Viewer.aspx → Embed.aspx swap with NUS SSO requirement noted. "Open in Canvas" demoted to a small "View source" link.
**Review findings (deferred):** No DOCX size cap on `/api/files/[fileId]/docx` (DoS risk for public deploy). No project-wide CSP. Panopto regex has no hostname allowlist. Test coverage on dialog error paths is light. API-route auth assertions are best-effort because of single-user demo.

---

## Open threads / not yet shipped

### Migrations pending application by user (live DB)
- **0009** (`alter table courses add column panopto_tab_url text`) — required for dashboard
- **0010** (`nus_modules`, `module_takings`, `user_programs`) — required for degree audit
Both committed in repo. Apply via Supabase SQL Editor.

### Browser smoke tests pending
- Phase A degree audit: never confirmed end-to-end after migration apply
- Module-takings editor: never confirmed
- Program selector: never confirmed
- Bucket override: never confirmed

### Menu of next-up features (from 2026-05-01 conversation)
1. ~~Module-takings editor UX~~ — DONE
2. ~~Add a second curriculum (BComp CS)~~ — DONE
3. ~~Bucket override UI~~ — DONE
4. **Planning tab MVP** (~4 hrs) — module shortlist + prereq display + exam-clash check + total-MC budget. Requires no schema changes; reuses NUSMods search.
5. **NUS Bulletin scraper** (~3 hrs) — Phase B foundation; populates `nus_modules.faculty/department/prereqs/level` for modules not yet seeded.

### Phase B vision (from degree audit plan)
- Crawlers for ≥5 faculty curriculum pages → YAML scaffolds for human review
- Crowdsourced spec corrections via UI
- Year-of-matriculation versioning of program specs
- Real Planning tab with prereq-aware shortlister
- Industrial-experience sub-rule auto-validation inside Breadth
- Level-cap constraint (≥80% major MC at L1000-4000)
- Multi-program audit (e.g., DDP / minors)

---

## Conventions

- Append at the top, newest first
- One section per feature; scope changes are sub-sections under the original
- Always include commit SHA(s) so you can `git show <sha>` to see exactly what landed
- "Why" is the deciding constraint, not a commit message restatement
- Defer items live in "Open threads" — promote to a real entry when work starts
