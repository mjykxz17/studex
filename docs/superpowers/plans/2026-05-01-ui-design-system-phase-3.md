# UI Design System — Phase 3 Implementation Plan (home dashboard)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the Apple-style design language to the home dashboard surface — wrap content in `Container`, migrate every widget to consume `Card` / `ProgressBar` / `Pill` (semantic tones, not legacy aliases) / token-based typography and spacing.

**Architecture:** Phase 1 + 2 primitives are unchanged. Each widget gets a focused refactor: replace inline `<section>`/`<div>` chrome with `<Card>`, replace inline progress bars with `<ProgressBar>`, rewrite `tone="blue|rose|slate|emerald"` to `tone="accent|danger|neutral|success"`, swap `text-stone-*` / `bg-stone-*` for `text-[var(--color-fg-*)]` / `bg-[var(--color-bg-*)]`. The home view itself gets wrapped in `<Container>` and uses `--space-section-gap` for vertical rhythm.

**Tech Stack:** unchanged from Phase 2.

**Estimated effort:** 7–8 hours focused.

---

## Out of scope (deferred to Phase 4+)

- Module view (needs `Tabs` primitive first)
- Manage view (separate small surface)
- NUSMods Current sem tab (the timetable + exam list)
- Cheatsheet generation modal + SSE timeline
- module-tree.tsx (only used by module view)
- dashboard-client.tsx top nav / brand area (full chrome redesign — separate work)
- `Tabs` and `Menu` primitive extractions
- Native `<dialog>` element upgrade

---

## File Map

**MODIFIED (each retains existing API; internals migrated):**
- `app/ui/dashboard/home-view.tsx` — wrap in `Container`, use `space-y-[var(--space-section-gap)]`, drop hand-rolled chrome
- `app/ui/dashboard/widgets/stats-header.tsx` — 4 metric cards → `Card` x4 with token colors
- `app/ui/dashboard/widgets/course-list-widget.tsx` — module cards → `Card` with `hoverLift`, Pill alias migration
- `app/ui/dashboard/widgets/course-progress-widget.tsx` — uses ProgressBar
- `app/ui/dashboard/widgets/new-files-widget.tsx` — wrap each file in `FileCard` (already shared); spacing tokens
- `app/ui/dashboard/widgets/file-card.tsx` — `Card` + Pill alias migration
- `app/ui/dashboard/widgets/recent-announcements-widget.tsx` — `Card` + Pill alias migration + token colors
- `app/ui/dashboard/widgets/recent-grades-widget.tsx` — `Card` + token colors
- `app/ui/dashboard/widgets/due-this-week-widget.tsx` — `Card` + token colors
- `app/ui/dashboard/widgets/schedule-board.tsx` — token colors only (preserve grid layout — too complex to restructure here)

---

## Task 1: home-view shell + section rhythm

**File:** `app/ui/dashboard/home-view.tsx`

Read the current file first. It likely has a hand-rolled top "metadata" hero card + a stack of widget sections. Wrap the whole content in `<Container>`, use token-based vertical spacing.

- [ ] **Step 1:** Read `app/ui/dashboard/home-view.tsx` to map the current structure (sections, widget instantiations).

- [ ] **Step 2:** Replace the top-level wrapping `<div className="space-y-...">` with:

```tsx
import { Container } from "@/app/ui/primitives/container";

// inside the component:
return (
  <Container>
    <div className="space-y-[var(--space-section-gap)]">
      {/* existing sections, in same order */}
    </div>
  </Container>
);
```

If the file has a top "hero" or "metadata" section using bespoke chrome (e.g., `bg-white shadow-[...]` directly), wrap it in `<Card>` instead. Inside that Card, replace `text-stone-950` / `text-stone-500` with `text-[var(--color-fg-primary)]` / `text-[var(--color-fg-tertiary)]` and any `font-[var(--font-lora)]` heading is fine to keep (it's a brand element).

- [ ] **Step 3:** Run tests + lint + build:

```
npx vitest run --reporter=basic
npm run lint
npm run build
```

Expected: 219 tests pass, 0 lint, build succeeds. Existing widget tests don't assert on home-view layout.

- [ ] **Step 4:** Commit:

```bash
git add app/ui/dashboard/home-view.tsx
git commit -m "refactor(home): wrap home view in Container, use section gap token"
```

---

## Task 2: stats-header migration

**File:** `app/ui/dashboard/widgets/stats-header.tsx`

The 4-metric header bar at the top of the home dashboard.

- [ ] **Step 1:** Read the current file. Note the structure (likely 4 cards in a grid).

- [ ] **Step 2:** Rewrite the file using `Card` primitive:

Add the import:
```tsx
import { Card } from "@/app/ui/primitives/card";
```

Replace each metric card's outer `<div>` chrome with `<Card>`. Each card structure becomes:

```tsx
<Card>
  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">
    {label}
  </p>
  <p className="mt-2 text-[28px] font-semibold tracking-[-0.025em] text-[var(--color-fg-primary)]">
    {value}
  </p>
  <p className="mt-1 text-[11px] text-[var(--color-fg-tertiary)]">
    {sublabel}
  </p>
</Card>
```

Keep the outer grid layout (`grid gap-3 md:grid-cols-2 xl:grid-cols-4` or similar — match what's there).

Replace any remaining `text-stone-*` / `bg-stone-*` colors with the corresponding tokens.

- [ ] **Step 3:** Run tests + lint + build (expect existing stats-header test to pass):

```
npx vitest run tests/app/ui/widgets/stats-header.test.tsx --reporter=basic
npx vitest run --reporter=basic
npm run lint
npm run build
```

If the existing test asserts on specific class strings that changed, update the test assertion to match.

- [ ] **Step 4:** Commit:

```bash
git add app/ui/dashboard/widgets/stats-header.tsx tests/app/ui/widgets/stats-header.test.tsx
git commit -m "refactor(home): stats-header uses Card primitive"
```

---

## Task 3: course-list + course-progress widgets

**Files:**
- `app/ui/dashboard/widgets/course-list-widget.tsx`
- `app/ui/dashboard/widgets/course-progress-widget.tsx`

Course list is the per-module card list. Course progress is a per-module progress bar widget.

- [ ] **Step 1:** Read both files.

- [ ] **Step 2: Migrate `course-list-widget.tsx`**

Add imports:
```tsx
import { Card } from "@/app/ui/primitives/card";
```

Replace each module card's outer `<div>` chrome with `<Card hoverLift>` (the module card is clickable → hoverLift signals it).

Replace `<Pill tone="blue">` with `<Pill tone="accent">`, `<Pill tone="rose">` with `<Pill tone="danger">`, `<Pill tone="slate">` with `<Pill tone="neutral">`, `<Pill tone="emerald">` with `<Pill tone="success">` everywhere in the file.

Replace `text-stone-950` → `text-[var(--color-fg-primary)]`, `text-stone-500`/`text-stone-400` → `text-[var(--color-fg-tertiary)]`, `text-stone-600` → `text-[var(--color-fg-secondary)]`, `bg-stone-100`/`bg-stone-50` → `bg-[var(--color-bg-secondary)]`, `bg-[#fcfbf9]` → `bg-[var(--color-bg-secondary)]`.

Preserve the `onOpenModule` callback signature (consumers depend on it).

- [ ] **Step 3: Migrate `course-progress-widget.tsx`**

Add imports:
```tsx
import { Card } from "@/app/ui/primitives/card";
import { ProgressBar } from "@/app/ui/primitives/progress-bar";
```

Replace each course-progress card's outer chrome with `<Card>`. Replace any inline progress-bar markup (`<div className="h-2 bg-stone-... overflow-hidden rounded-full"><div style={{width: ...}} /></div>`) with:

```tsx
<ProgressBar value={pct} tone="accent" />
```

Wait — `ProgressBar` only supports `success | warn | tertiary` per Phase 2. Course progress is informational, not status — `tertiary` (gray) is the right tone. So:

```tsx
<ProgressBar value={pct} tone="tertiary" />
```

If the existing widget visually uses an accent color (blue/purple), and `tertiary` looks too washed out, EXTEND `ProgressBar` to add an `accent` tone:

```tsx
// In app/ui/primitives/progress-bar.tsx, extend the Tone type:
type Tone = "success" | "warn" | "tertiary" | "accent";

// Add to TONE_CLASSES:
accent: "bg-[var(--color-accent)]",
```

Then add a test row in `tests/app/ui/primitives/progress-bar.test.tsx`:

```tsx
it("accent tone applies accent token", () => {
  const { container } = render(<ProgressBar value={50} tone="accent" />);
  const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
  expect(fill.className).toMatch(/bg-\[var\(--color-accent\)\]/);
});
```

Then use `tone="accent"` in `course-progress-widget.tsx`.

Same Pill alias + stone-color migrations as course-list.

- [ ] **Step 4:** Run tests + lint + build:

```
npx vitest run --reporter=basic
npm run lint
npm run build
```

Update any test assertions that break due to className changes.

- [ ] **Step 5:** Commit:

```bash
git add app/ui/dashboard/widgets/course-list-widget.tsx app/ui/dashboard/widgets/course-progress-widget.tsx app/ui/primitives/progress-bar.tsx tests/app/ui/primitives/progress-bar.test.tsx tests/app/ui/widgets/course-list-widget.test.tsx
git commit -m "refactor(home): course-list + course-progress use Card + ProgressBar"
```

---

## Task 4: new-files-widget + file-card

**Files:**
- `app/ui/dashboard/widgets/new-files-widget.tsx`
- `app/ui/dashboard/widgets/file-card.tsx`

`new-files-widget` is a section that lists recent files. `file-card` is the per-file card used both here and in module view.

- [ ] **Step 1:** Read both files.

- [ ] **Step 2: Migrate `file-card.tsx`**

Add the Card import. Wrap the existing outer `<div>` chrome with `<Card>` (no hoverLift — file cards have buttons, not the whole card click).

Replace `<Pill tone="blue">` → `<Pill tone="accent">`, etc. (full alias migration as in Task 3).

Replace stone colors with tokens.

The existing `<a href={file.canvasUrl}>Source</a>` link from Phase 1 cleanup stays as-is.

- [ ] **Step 3: Migrate `new-files-widget.tsx`**

Replace the wrapping section's outer chrome with `<Card>` if it's currently a hand-rolled card. Keep the `<EmptyState>` for the no-files case (that's already a shared primitive).

Replace stone colors with tokens.

- [ ] **Step 4:** Run tests + lint + build (the existing `new-files-widget.test.tsx` may need updating if its fixture asserts class strings — read first, update only if necessary).

- [ ] **Step 5:** Commit:

```bash
git add app/ui/dashboard/widgets/new-files-widget.tsx app/ui/dashboard/widgets/file-card.tsx tests/app/ui/widgets/new-files-widget.test.tsx
git commit -m "refactor(home): new-files-widget + file-card use Card + semantic Pill tones"
```

---

## Task 5: recent-announcements + recent-grades + due-this-week

**Files:**
- `app/ui/dashboard/widgets/recent-announcements-widget.tsx`
- `app/ui/dashboard/widgets/recent-grades-widget.tsx`
- `app/ui/dashboard/widgets/due-this-week-widget.tsx`

Three small list-style widgets. All follow the same migration pattern.

- [ ] **Step 1:** Read all three files.

- [ ] **Step 2: Migrate `recent-announcements-widget.tsx`**

Wrap the section in `<Card>`. Each announcement row stays inline (not a Card per-row — too heavy). Replace per-row `bg-[#fcfbf9]` with `bg-[var(--color-bg-secondary)]`. Replace Pill aliases as before.

Important: This widget already has `<AnnouncementDetailDialog>` from Phase 1 — leave that as-is.

- [ ] **Step 3: Migrate `recent-grades-widget.tsx`**

Wrap section in `<Card>`. Replace stone colors. Pill aliases (`tone="emerald"` for passing grades → `tone="success"`).

- [ ] **Step 4: Migrate `due-this-week-widget.tsx`**

Wrap section in `<Card>`. Each task row stays inline. Replace stone colors. Pill aliases.

- [ ] **Step 5:** Run tests + lint + build. Update any test assertions that break.

- [ ] **Step 6:** Commit:

```bash
git add app/ui/dashboard/widgets/recent-announcements-widget.tsx app/ui/dashboard/widgets/recent-grades-widget.tsx app/ui/dashboard/widgets/due-this-week-widget.tsx tests/app/ui/widgets/recent-announcements-widget.test.tsx tests/app/ui/widgets/recent-grades-widget.test.tsx tests/app/ui/widgets/due-this-week-widget.test.tsx
git commit -m "refactor(home): announcements + grades + due-this-week use Card + tokens"
```

---

## Task 6: schedule-board (token colors only — preserve grid layout)

**File:** `app/ui/dashboard/widgets/schedule-board.tsx`

207 lines. The grid layout (week-of-day x time-of-day) is complex — DON'T restructure. Just migrate colors and chrome to tokens.

- [ ] **Step 1:** Read the file. Note the grid structure (it's likely a CSS grid with hour-row × day-column cells, lesson cards positioned via inline styles).

- [ ] **Step 2:** Replace the wrapping container's `bg-white` / `border` chrome with `<Card>` if it's a clean wrap. If the chrome is intertwined with the grid layout, leave the wrapping container and ONLY swap stone colors for tokens:

- `text-stone-950` → `text-[var(--color-fg-primary)]`
- `text-stone-500` → `text-[var(--color-fg-tertiary)]`
- `text-stone-600` → `text-[var(--color-fg-secondary)]`
- `text-stone-400` → `text-[var(--color-fg-tertiary)]`
- `bg-stone-100` / `bg-stone-50` → `bg-[var(--color-bg-secondary)]`
- `bg-white` (where it's chrome, not a lesson card) → `bg-[var(--color-bg-primary)]`
- `border-stone-200` → `border-[color:var(--color-border)]`

If the file has a `LESSON_TONES` map or similar that picks colors per-lesson-type, leave it (those are domain-specific identity colors, not design-system semantic colors).

- [ ] **Step 3:** Run tests + lint + build.

- [ ] **Step 4:** Commit:

```bash
git add app/ui/dashboard/widgets/schedule-board.tsx
git commit -m "refactor(home): schedule-board uses token colors"
```

---

## Task 7: Final integration check

- [ ] **Step 1:** Full test suite

```
npx vitest run --reporter=basic
```

Expected: ≥220 passing (219 baseline + 1 new ProgressBar accent tone test). If existing widget tests broke due to class-string assertions, they should already be updated in their respective tasks.

- [ ] **Step 2:** Lint

```
npm run lint
```

Expected: 0 errors.

- [ ] **Step 3:** Build

```
npm run build
```

Expected: succeeds.

- [ ] **Step 4:** Manual smoke checklist

With dev server running, on the home dashboard (`/`):

1. Stats header shows 4 cards with token colors (no stone-* tints)
2. Course list shows module cards with `hoverLift` (subtle shadow on hover)
3. Course progress bars are accent-colored (blue) and animate
4. Recent files section uses Card chrome; file cards have semantic Pill tones (not stone)
5. Recent announcements section uses Card; "Read full" still opens the dialog with Apple shell
6. Recent grades section uses Card; passing grades have green (success) Pill tone
7. Due this week section uses Card
8. Schedule board renders with token colors
9. Compact / Comfortable / Spacious density toggle (from Progress tab) doesn't break the home dashboard
10. Resize to mobile (320 px) — single column, density auto-locks to compact
11. Toggle OS reduce-motion — hover lifts become instant; no progress-bar width animations

- [ ] **Step 5:** Commit any integration fixes

```bash
git add <fixed files>
git commit -m "fix: integration regressions from UI design system phase 3"
```

---

## Self-Review Notes

**Spec coverage:**
- Home view shell: Task 1
- Stats header: Task 2
- Course list + course progress (with ProgressBar accent tone extension): Task 3
- New files + file card: Task 4
- Announcements + grades + due-this-week: Task 5
- Schedule board (color-only migration): Task 6
- Verification: Task 7

**Pill alias migration scope (from `tone="blue|rose|slate|emerald"` to `tone="accent|danger|neutral|success"`):**
- `app/ui/dashboard/widgets/course-list-widget.tsx` — Task 3
- `app/ui/dashboard/widgets/file-card.tsx` — Task 4
- `app/ui/dashboard/widgets/recent-announcements-widget.tsx` — Task 5
- `app/ui/dashboard/widgets/recent-grades-widget.tsx` — Task 5
- `app/ui/dashboard/widgets/due-this-week-widget.tsx` — Task 5
- (Note: `module-tree.tsx`, `module-view.tsx`, `manage-view.tsx`, `modules-view.tsx`, `nusmods-view.tsx` are NOT migrated this phase — they belong to module-view / manage / NUSMods surfaces and stay on legacy aliases until those surfaces migrate.)

**Out of scope (deferred to Phase 4):**
- modules-view.tsx (Modules tab)
- module-view.tsx (per-module workspace)
- manage-view.tsx
- nusmods-view.tsx Current sem tab content
- module-tree widget (only used by module view)
- cheatsheet generation modal + SSE timeline + cheatsheet panel
- `Tabs` and `Menu` primitive extractions
- Native `<dialog>` element upgrade
- `--color-overlay` token (replace hardcoded backdrop)
- Final removal of legacy Pill aliases (defer until ALL surfaces migrate)

**Manual visual smoke testing required:** the test suite verifies behavior, not visuals. The 11-step smoke checklist in Task 7 is the only way to catch a Pill / Card / token regression.
