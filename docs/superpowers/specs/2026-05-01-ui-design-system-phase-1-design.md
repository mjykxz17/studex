# UI Design System — Phase 1 Spec (Apple-style polish, Progress tab proof)

> **Status:** Brainstorming complete; awaiting plan.
> **Author:** Aiden + Studex Claude
> **Date:** 2026-05-01

## Goal

Establish a token-driven design system in calmly-polished Apple style ("iCloud / Reminders / Notes web app" aesthetic), prove the language on the NUSMods → Progress tab, and lay a foundation that subsequent phases can extend to every other surface.

## Non-goals (deferred)

- Reskinning the home dashboard, Module view, dialogs, cheatsheet flow, NUSMods Current sem tab
- `Dialog` and `Tabs` primitives — current implementations stay until later phases
- Drag-to-rearrange widgets, per-section collapse/expand
- Dark mode (token system is dark-mode-ready; no UI built this phase)
- Motion library (`motion` npm package) — not needed; hand-rolled CSS suffices

## Architecture

### Three-layer token system (`app/tokens.css`)

```
1. PRIMITIVES   — raw values, never used directly in components
   --gray-50 ... --gray-900
   --blue-500 / --blue-600 / --blue-700
   --space-1 (4px) ... --space-16 (64px)

2. SEMANTIC     — what components consume
   --color-fg-primary    → var(--gray-900)        /* #1d1d1f */
   --color-fg-secondary  → var(--gray-600)        /* #6e6e73 */
   --color-fg-tertiary   → var(--gray-500)        /* #86868b */
   --color-bg-primary    → #fff
   --color-bg-secondary  → var(--gray-50)         /* #f5f5f7 */
   --color-border        → rgba(0,0,0,0.08)
   --color-accent        → var(--blue-600)        /* #0071e3 */
   --color-accent-hover  → var(--blue-700)
   --radius-sm/md/lg/xl  → 6/10/14/20 px
   --shadow-card         → 0 1px 2px rgba(0,0,0,0.04)
   --shadow-lift         → 0 8px 24px rgba(0,0,0,0.08)
   --duration-fast       → 150ms
   --duration-base       → 250ms
   --duration-slow       → 400ms
   --ease-out            → cubic-bezier(0.16, 1, 0.3, 1)   /* Apple ease-out-quint */

3. DENSITY      — overridden by [data-density] selector on <html>
   --space-row-y          /* 8 / 12 / 16 px (compact / comfortable / spacious) */
   --space-card-x         /* 14 / 18 / 24 px */
   --space-card-y         /* 14 / 18 / 24 px */
   --space-section-gap    /* 12 / 16 / 24 px */
   --font-size-body       /* 12 / 13 / 14 px */
   --font-size-heading    /* 22 / 28 / 34 px */
   --font-size-mc-display /* 28 / 36 / 44 px */
```

Tailwind keeps working as today; semantic tokens are exposed via `tailwind.config.ts` `theme.extend.colors` and `extend.spacing`. New utilities (`bg-fg-primary`, `text-fg-tertiary`, etc.) become available alongside existing classes — no rewrite of utility usage forced.

### Density toggle

- Stored in `localStorage["studex.density"]` (values: `compact` / `comfortable` / `spacious`; default `comfortable`)
- Applied via `<html data-density="...">`
- An inline blocking script in `app/layout.tsx` reads localStorage and sets the attribute before first paint, preventing FOUC
- A `<DensitySelector>` UI component (3 pill buttons) in the Progress tab header writes the value
- Mobile breakpoint (< 640 px) auto-locks to `compact` regardless of user setting

### Responsive behavior

| Breakpoint | Min width | Progress-tab layout |
|---|---|---|
| default | 0 | Single column. Density locked to `compact`. |
| `sm` | 640 px | Single column, wider gutters. Density unlocks. |
| `md` | 768 px | Bucket cards in 2 columns. |
| `lg` | 1024 px | Audit summary + density + program selectors aligned in one top row. 2-col bucket grid. |
| `xl` | 1280 px | 3-col bucket grid. Content max-width capped at 1200 px (`<Container>` centred). |
| `2xl` | 1536 px | Same as xl — content stays centred. |

Container max-width 1200 px is an Apple-site convention — line lengths stay readable on 4K displays.

## Component primitives (Phase 1 scope)

```
app/ui/primitives/
  button.tsx            Variants: primary | secondary | ghost  Sizes: sm | md | lg
  card.tsx              Props: hover-lift?: boolean; inset?: boolean
  input.tsx             Wraps <input> and <select> with shared focus ring + density spacing
  density-selector.tsx  Three-pill compact/comfortable/spacious toggle
  container.tsx         max-w-[1200px] mx-auto with responsive padding
```

`app/ui/dashboard/shared.tsx` `Pill` is extended in place — tones widened to `neutral | accent | success | warn | danger`, routed through tokens, existing call sites untouched.

### Primitive interfaces (informal — exact types in implementation plan)

**Button**
- `<Button variant="primary" size="md" leadingIcon? trailingIcon? loading? disabled?>{children}</Button>`
- `primary`: filled accent, white text, `:active` scale(0.97)
- `secondary`: white bg, 1px border; `:hover` lifts shadow + translate-y(-1px) over 150 ms
- `ghost`: text-only color shift on hover; used for hover-revealed Remove icons

**Card**
- `<Card hover-lift={false} inset={false}>{children}</Card>`
- Default: padding/border/radius/shadow from tokens
- `hover-lift`: shadow transitions to `--shadow-lift` on hover
- `inset`: tighter padding for nested usage

**Input**
- `<Input as="text" | "select">...</Input>`
- `:focus` → 2 px inset blue ring, no outer outline (Apple style)
- Density-aware padding (`var(--space-row-y) var(--space-3)`)

## Motion language

Hand-rolled CSS only — no library this phase.

```css
.motion-hover {
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out);
}

.motion-press { transition: transform 80ms var(--ease-out); }
.motion-press:active { transform: scale(0.97); }

@media (prefers-reduced-motion: reduce) {
  .motion-hover, .motion-press, * {
    transition-duration: 0ms !important;
    animation-duration: 0ms !important;
  }
}
```

| Element | Effect | Duration | Trigger |
|---|---|---|---|
| `Button` (any variant) | scale(0.97) on press | 80 ms | `:active` |
| `Button.secondary` / `Card.hover-lift` | shadow lift + translate-y(-1 px) | 150 ms | `:hover` |
| Modal entry / exit | opacity + scale 0.96→1 | 250 / 200 ms | mount / unmount (uses existing dialog wrappers; primitive shell deferred) |
| Pill | bg-color shift | 150 ms | `:hover` |
| Input | inset ring expand 0→2 px | 150 ms | `:focus` |
| Bucket-card progress bar | width 0→current% | 600 ms | first mount only |
| Bucket-card grid | fade-in + translate-y(8 px→0), staggered 30 ms each | 250 ms each | first mount |

`prefers-reduced-motion` collapses all to 0 ms.

## Migration scope (this phase)

```
NEW:
  app/tokens.css
  app/ui/primitives/{button,card,input,density-selector,container}.tsx
  tests/app/ui/primitives/{button,card,input,density-selector,container}.test.tsx

MODIFIED:
  app/globals.css                                      import tokens.css
  app/layout.tsx                                       inline FOUC-blocking density script
  tailwind.config.ts                                   extend theme with semantic tokens
  app/ui/dashboard/shared.tsx                          extend Pill tones; route through tokens
  app/ui/progress/progress-view.tsx                    use Container, Card, density selector
  app/ui/progress/bucket-card.tsx                      use Card + Pill primitives, motion classes
  app/ui/progress/module-takings-editor.tsx            use Card + Input + Button primitives, hover-revealed Remove behind ••• menu
  app/ui/progress/program-selector.tsx                 use Input wrapper for the <select>

UNTOUCHED (this phase):
  Home dashboard / Module view / dialogs (page-viewer, announcement-detail, assignment-detail,
  file-preview, panopto, cheatsheet) / cheatsheet flow / NUSMods Current sem tab /
  module-tree widget — all keep existing primitives.
```

## Interaction refinements ("buttons at intuitive places")

Three concrete improvements scoped to the Progress tab:

1. **Tracked-module row controls demoted.** Currently every row shows status + bucket-override + grade + Remove. New layout:
   - Inline visible: status select + grade input
   - Bucket override + Remove behind a `•••` menu button (revealed on row hover, click opens small popover with "Move to bucket → ..." and "Remove")
   - Apple Mail / Notes pattern

2. **Add module → primary button affordance.** Currently the search input + status select form an ambiguous row. New: keep the input but pair it with a primary `<Button variant="primary">Add to plan</Button>`. Click opens a focused search popover; click a result to commit.

3. **Top-row controls grouped right.** Header gets `[ PROGRESS eyebrow ]` (left) · `[ Density toggle ] [ Program selector ]` (right). Both right-aligned controls.

## Testing & acceptance

### Unit tests (vitest + RTL) under `tests/app/ui/primitives/`

- `button.test.tsx` — text renders, onClick fires, disabled prevents click, leadingIcon renders, variants apply distinct classes
- `card.test.tsx` — renders children, `hover-lift` applies lift class, `inset` applies tighter padding
- `input.test.tsx` — text input fires onChange; select fires onChange; disabled respected
- `density-selector.test.tsx` — clicking a pill writes localStorage AND sets `<html data-density>`; on mount, reads localStorage; defaults to `comfortable`
- `container.test.tsx` — wraps children, applies max-width
- `tests/app/ui/dashboard/pill.test.tsx` (new) — each new tone applies a distinct class; existing `tone="blue" | "rose" | "slate"` still resolves correctly so call sites that haven't migrated keep working

### Manual smoke checklist (13 items)

After migration, walk through in the dev server:

1. Open `/` → NUSMods → Progress
2. Density selector visible top-right next to Program selector
3. Click `Compact` → font sizes shrink, row spacing tightens; reload → still compact
4. Click `Spacious` → opposite
5. Resize browser to 320 px → single column, density auto-locks to compact
6. Resize back to 1280 px → 3-column bucket grid
7. Hover a bucket card → subtle shadow lift over 150 ms
8. Hover any tracked-module row → `•••` menu button reveals at row end
9. Click `•••` → small popover with "Move to bucket →" and "Remove"; click outside closes
10. Type in search → results dropdown styled in apple grays; click a result → adds with current status
11. Click `Add to plan` button when search empty → focuses search input
12. Toggle OS-level reduce-motion → page transitions become instant; no animations fire
13. Reload at any density → no FOUC

### Acceptance criteria

Done = all of:
- `npx vitest run` green (existing 175 + ~12 new primitive tests ≈ 187)
- `npm run lint` clean
- `npx tsc --noEmit` no new errors
- Manual smoke checklist 13/13 pass
- Existing surfaces (home dashboard, module view, dialogs) visually unchanged from before this PR
- Browser smoke confirmed by user
