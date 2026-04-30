# UI Design System — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the calmly-polished Apple-style design language on the NUSMods → Progress tab via a token-driven system + 5 new primitives + extended `Pill`. Other surfaces stay current.

**Architecture:** A 3-layer CSS-variable token system (primitives → semantic → density) lives in a new `app/tokens.css` imported into `app/globals.css`. Tailwind v4's `@theme inline` block exposes the semantic tokens as utility classes. Five new presentational components (`Container`, `Card`, `Button`, `Input`, `DensitySelector`) consume the tokens. The Progress-tab files are migrated to use the primitives. A small inline script in `app/layout.tsx` reads `localStorage["studex.density"]` synchronously before first paint to set `<html data-density>` and prevent FOUC.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 (no JS config; `@theme inline` in CSS) · vitest + RTL · hand-rolled CSS for motion (no `motion` lib) · `localStorage` for density persistence

**Estimated effort:** 10–12 hours focused.

---

## File Map

**NEW:**
- `app/tokens.css` — 3-layer CSS variables (primitives → semantic → density media queries)
- `app/ui/primitives/container.tsx` — max-width 1200 px centred wrapper
- `app/ui/primitives/card.tsx` — Card with `hoverLift` and `inset` modifier props
- `app/ui/primitives/button.tsx` — `Button` with `variant` (primary/secondary/ghost) and `size` (sm/md/lg)
- `app/ui/primitives/input.tsx` — `Input` (`as="text" | "select"`) with shared focus ring
- `app/ui/primitives/density-selector.tsx` — three-pill density toggle, persists to localStorage
- `tests/app/ui/primitives/container.test.tsx`
- `tests/app/ui/primitives/card.test.tsx`
- `tests/app/ui/primitives/button.test.tsx`
- `tests/app/ui/primitives/input.test.tsx`
- `tests/app/ui/primitives/density-selector.test.tsx`
- `tests/app/ui/dashboard/pill.test.tsx`

**MODIFIED:**
- `app/globals.css` — `@import "./tokens.css"`; extend `@theme inline` to expose semantic tokens; keep existing pastel gradient bg untouched (other surfaces still use it)
- `app/layout.tsx` — add inline FOUC-blocking density script in `<head>`
- `app/ui/dashboard/shared.tsx` — extend `Pill` tones from `blue | rose | slate` to `neutral | accent | success | warn | danger | blue | rose | slate` (legacy tones preserved as aliases for non-migrated call sites)
- `app/ui/progress/program-selector.tsx` — wrap `<select>` in new `Input` primitive
- `app/ui/progress/bucket-card.tsx` — replace inline `<section>` chrome with `Card`; replace inline pill markup with `Pill` primitive; add motion classes
- `app/ui/progress/progress-view.tsx` — wrap content in `Container`; replace audit-summary `<section>` chrome with `Card`; add `DensitySelector` next to `ProgramSelector` in header
- `app/ui/progress/module-takings-editor.tsx` — replace card/inputs/buttons with primitives; add hover-revealed `•••` row menu (bucket override + Remove); pair search with primary `Add to plan` button

**UNTOUCHED:** all dialogs (`page-viewer-dialog`, `announcement-detail-dialog`, `assignment-detail-dialog`, `file-preview-dialog`, `panopto-dialog`); `module-tree.tsx`; home dashboard widgets; cheatsheet flow; NUSMods Current sem tab.

---

## Task 1: Add token system (`app/tokens.css` + globals import)

**Files:**
- Create: `app/tokens.css`
- Modify: `app/globals.css`

The 3-layer token system. Layer 1 is raw values (only place hex appears), Layer 2 is semantic aliases, Layer 3 is density-overridable spacing/typography.

- [ ] **Step 1: Create `app/tokens.css`**

```css
/* =============================================================
   Studex token system — Phase 1 (Apple-style, light mode only)
   3 layers: primitives → semantic → density
   ============================================================= */

:root {
  /* ---------- Layer 1: PRIMITIVES (raw values) ---------- */
  --gray-50: #f5f5f7;
  --gray-100: #ececef;
  --gray-200: #d2d2d7;
  --gray-300: #b6b6bc;
  --gray-500: #86868b;
  --gray-600: #6e6e73;
  --gray-800: #1d1d1f;
  --gray-900: #0a0a0a;

  --blue-500: #2997ff;
  --blue-600: #0071e3;
  --blue-700: #0058b9;

  --emerald-500: #34c759;
  --amber-500: #ff9f0a;
  --rose-500: #ff3b30;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --space-16: 64px;

  /* ---------- Layer 2: SEMANTIC ---------- */
  --color-fg-primary: var(--gray-800);
  --color-fg-secondary: var(--gray-600);
  --color-fg-tertiary: var(--gray-500);
  --color-bg-primary: #ffffff;
  --color-bg-secondary: var(--gray-50);
  --color-border: rgba(0, 0, 0, 0.08);
  --color-border-strong: rgba(0, 0, 0, 0.16);
  --color-accent: var(--blue-600);
  --color-accent-hover: var(--blue-700);
  --color-accent-fg: #ffffff;
  --color-success: var(--emerald-500);
  --color-warn: var(--amber-500);
  --color-danger: var(--rose-500);

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;

  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04);
  --shadow-lift: 0 8px 24px rgba(0, 0, 0, 0.08);
  --shadow-focus: 0 0 0 2px var(--color-accent) inset;

  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 400ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* ---------- Layer 3: DENSITY (default = comfortable) ---------- */
  --space-row-y: var(--space-3);          /* 12 */
  --space-card-x: 18px;
  --space-card-y: 18px;
  --space-section-gap: var(--space-4);    /* 16 */
  --font-size-body: 13px;
  --font-size-heading: 28px;
  --font-size-mc-display: 36px;
}

[data-density="compact"] {
  --space-row-y: var(--space-2);          /* 8 */
  --space-card-x: 14px;
  --space-card-y: 14px;
  --space-section-gap: var(--space-3);    /* 12 */
  --font-size-body: 12px;
  --font-size-heading: 22px;
  --font-size-mc-display: 28px;
}

[data-density="spacious"] {
  --space-row-y: var(--space-4);          /* 16 */
  --space-card-x: var(--space-6);         /* 24 */
  --space-card-y: var(--space-6);         /* 24 */
  --space-section-gap: var(--space-6);    /* 24 */
  --font-size-body: 14px;
  --font-size-heading: 34px;
  --font-size-mc-display: 44px;
}

/* Mobile auto-locks density to compact regardless of user setting. */
@media (max-width: 639px) {
  :root, [data-density] {
    --space-row-y: var(--space-2);
    --space-card-x: 14px;
    --space-card-y: 14px;
    --space-section-gap: var(--space-3);
    --font-size-body: 12px;
    --font-size-heading: 22px;
    --font-size-mc-display: 28px;
  }
}

/* ---------- Motion utilities (used by primitives) ---------- */
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
  .motion-hover, .motion-press {
    transition-duration: 0ms !important;
  }
}
```

- [ ] **Step 2: Import tokens in `app/globals.css` and expose semantic tokens to Tailwind**

Edit `app/globals.css`. After the existing `@import "tailwindcss";` line, add `@import "./tokens.css";`. Inside the existing `@theme inline { ... }` block, append the semantic-token mappings so Tailwind utilities like `bg-fg-primary` and `text-fg-tertiary` work:

```css
@import "tailwindcss";
@import "./tokens.css";

:root {
  --background: #f7f6f3;
  --foreground: #1c1917;
  color-scheme: light;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
  --font-display: var(--font-lora);

  /* === Phase 1 semantic tokens — exposed as Tailwind utilities === */
  --color-fg-primary: var(--color-fg-primary);
  --color-fg-secondary: var(--color-fg-secondary);
  --color-fg-tertiary: var(--color-fg-tertiary);
  --color-bg-primary: var(--color-bg-primary);
  --color-bg-secondary: var(--color-bg-secondary);
  --color-accent: var(--color-accent);
  --color-accent-hover: var(--color-accent-hover);
  --color-accent-fg: var(--color-accent-fg);
  --color-border-soft: var(--color-border);
  --color-border-strong: var(--color-border-strong);
}
```

Leave the rest of `globals.css` (body gradient, etc.) untouched.

- [ ] **Step 3: Run dev server and verify no build errors**

```
npm run dev
```

Hit `http://localhost:3000/api/health` — should return 200. The pages should render unchanged (we haven't migrated any surface yet).

- [ ] **Step 4: Commit**

```bash
git add app/tokens.css app/globals.css
git commit -m "feat(ui): add token system — primitives, semantic, density layers"
```

---

## Task 2: Density FOUC-blocking script in layout

**Files:**
- Modify: `app/layout.tsx`

A tiny inline script that runs synchronously in `<head>` before first paint, reads localStorage, and sets `<html data-density>`. Without this, the page first renders at default density then snaps to user's setting on JS hydration — a flash.

- [ ] **Step 1: Read `app/layout.tsx` to confirm structure**

Read the file. Note where the `<html>` element is rendered and where `<head>` content goes (Next 16 App Router uses `metadata` export + JSX returned from RootLayout).

- [ ] **Step 2: Add the inline script**

Modify `app/layout.tsx`. Inside the `<html>` element returned by `RootLayout`, in `<head>`, add a `<script>` with this content:

```tsx
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var d=localStorage.getItem('studex.density');if(d==='compact'||d==='comfortable'||d==='spacious'){document.documentElement.setAttribute('data-density',d);}}catch(e){}})();`,
  }}
/>
```

If `app/layout.tsx` doesn't currently return JSX with explicit `<html>`/`<head>` tags (Next App Router default has them implicit), wrap them explicitly. Read the current state and adapt.

- [ ] **Step 3: Verify no FOUC manually**

Restart dev server. In browser console: `localStorage.setItem('studex.density', 'spacious'); location.reload();`. Should render at spacious density with no flash.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx
git commit -m "feat(ui): inline FOUC-blocking density script"
```

---

## Task 3: Container primitive

**Files:**
- Create: `app/ui/primitives/container.tsx`
- Create: `tests/app/ui/primitives/container.test.tsx`

A simple max-width 1200 px centred wrapper with responsive padding. Used to wrap the entire Progress-tab content.

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/container.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Container } from "@/app/ui/primitives/container";

describe("Container", () => {
  it("renders children", () => {
    render(<Container><div data-testid="child">hi</div></Container>);
    expect(screen.getByTestId("child")).toBeInTheDocument();
  });

  it("applies max-width and mx-auto classes", () => {
    const { container } = render(<Container><span>x</span></Container>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/max-w-\[1200px\]/);
    expect(root.className).toMatch(/mx-auto/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/app/ui/primitives/container.test.tsx
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/container.tsx`:

```tsx
import type { ReactNode } from "react";

export function Container({ children }: { children: ReactNode }) {
  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run tests/app/ui/primitives/container.test.tsx
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/container.tsx tests/app/ui/primitives/container.test.tsx
git commit -m "feat(ui): add Container primitive"
```

---

## Task 4: Card primitive

**Files:**
- Create: `app/ui/primitives/card.tsx`
- Create: `tests/app/ui/primitives/card.test.tsx`

Card with optional `hoverLift` (adds shadow-lift transition + translate-y on hover) and `inset` (tighter padding).

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/card.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Card } from "@/app/ui/primitives/card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card><span>content</span></Card>);
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("applies hover-lift class when hoverLift is true", () => {
    const { container } = render(<Card hoverLift><span>x</span></Card>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/motion-hover/);
    expect(root.className).toMatch(/hover:shadow-\[var\(--shadow-lift\)\]/);
  });

  it("applies inset (tighter padding) when inset is true", () => {
    const { container } = render(<Card inset><span>x</span></Card>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toMatch(/px-3/);
  });

  it("uses default padding when neither prop is set", () => {
    const { container } = render(<Card><span>x</span></Card>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/motion-hover/);
    expect(root.className).toMatch(/px-\[var\(--space-card-x\)\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/app/ui/primitives/card.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/card.tsx`:

```tsx
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  hoverLift?: boolean;
  inset?: boolean;
  className?: string;
};

export function Card({ children, hoverLift = false, inset = false, className = "" }: Props) {
  const padding = inset
    ? "px-3 py-3"
    : "px-[var(--space-card-x)] py-[var(--space-card-y)]";
  const hoverClasses = hoverLift
    ? "motion-hover hover:shadow-[var(--shadow-lift)] hover:-translate-y-px"
    : "";
  return (
    <div
      className={`rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-card)] ${padding} ${hoverClasses} ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run tests/app/ui/primitives/card.test.tsx
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/card.tsx tests/app/ui/primitives/card.test.tsx
git commit -m "feat(ui): add Card primitive (hoverLift, inset)"
```

---

## Task 5: Button primitive

**Files:**
- Create: `app/ui/primitives/button.tsx`
- Create: `tests/app/ui/primitives/button.test.tsx`

Three variants (primary/secondary/ghost), three sizes (sm/md/lg), optional leading icon, disabled state.

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/button.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Button } from "@/app/ui/primitives/button";

describe("Button", () => {
  it("renders text and fires onClick", async () => {
    const fn = vi.fn();
    render(<Button onClick={fn}>Click me</Button>);
    await userEvent.click(screen.getByRole("button", { name: /click me/i }));
    expect(fn).toHaveBeenCalled();
  });

  it("does not fire onClick when disabled", async () => {
    const fn = vi.fn();
    render(<Button disabled onClick={fn}>Click me</Button>);
    await userEvent.click(screen.getByRole("button", { name: /click me/i }));
    expect(fn).not.toHaveBeenCalled();
  });

  it("primary variant applies accent background", () => {
    render(<Button variant="primary">Go</Button>);
    const btn = screen.getByRole("button", { name: /go/i });
    expect(btn.className).toMatch(/bg-\[var\(--color-accent\)\]/);
  });

  it("secondary variant applies bordered white background", () => {
    render(<Button variant="secondary">Go</Button>);
    const btn = screen.getByRole("button", { name: /go/i });
    expect(btn.className).toMatch(/bg-\[var\(--color-bg-primary\)\]/);
    expect(btn.className).toMatch(/border/);
  });

  it("ghost variant has no background or border", () => {
    render(<Button variant="ghost">Go</Button>);
    const btn = screen.getByRole("button", { name: /go/i });
    expect(btn.className).not.toMatch(/bg-\[/);
    expect(btn.className).not.toMatch(/border\b/);
  });

  it("renders leadingIcon", () => {
    render(<Button leadingIcon={<svg data-testid="icon" />}>Go</Button>);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });

  it("applies size sm padding", () => {
    render(<Button size="sm">x</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/text-\[11px\]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/app/ui/primitives/button.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
};

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    "bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] motion-hover motion-press",
  secondary:
    "bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] border border-[color:var(--color-border)] hover:shadow-[var(--shadow-lift)] hover:-translate-y-px motion-hover motion-press",
  ghost:
    "text-[var(--color-fg-secondary)] hover:text-[var(--color-fg-primary)] motion-hover motion-press",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "px-3 py-1.5 text-[11px] font-medium rounded-[var(--radius-sm)]",
  md: "px-4 py-2 text-[13px] font-medium rounded-[var(--radius-md)]",
  lg: "px-5 py-3 text-[14px] font-semibold rounded-[var(--radius-md)]",
};

export function Button({
  variant = "secondary",
  size = "md",
  leadingIcon,
  trailingIcon,
  children,
  className = "",
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      className={`inline-flex items-center gap-1.5 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} disabled:opacity-50 disabled:pointer-events-none ${className}`}
    >
      {leadingIcon ? <span className="-ml-0.5">{leadingIcon}</span> : null}
      {children}
      {trailingIcon ? <span className="-mr-0.5">{trailingIcon}</span> : null}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run tests/app/ui/primitives/button.test.tsx
```
Expected: 7 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/button.tsx tests/app/ui/primitives/button.test.tsx
git commit -m "feat(ui): add Button primitive (3 variants, 3 sizes)"
```

---

## Task 6: Input primitive

**Files:**
- Create: `app/ui/primitives/input.tsx`
- Create: `tests/app/ui/primitives/input.test.tsx`

Wraps `<input>` and `<select>` with Apple-style focus ring and density-aware padding.

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/input.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Input, Select } from "@/app/ui/primitives/input";

describe("Input", () => {
  it("fires onChange when typed into", async () => {
    const fn = vi.fn();
    render(<Input value="" onChange={(e) => fn(e.target.value)} placeholder="search" />);
    await userEvent.type(screen.getByPlaceholderText("search"), "hi");
    expect(fn).toHaveBeenCalled();
  });

  it("respects disabled", async () => {
    const fn = vi.fn();
    render(<Input value="" disabled onChange={(e) => fn(e.target.value)} placeholder="x" />);
    const el = screen.getByPlaceholderText("x") as HTMLInputElement;
    expect(el.disabled).toBe(true);
  });

  it("applies focus-ring class", () => {
    render(<Input value="" onChange={() => {}} placeholder="x" />);
    const el = screen.getByPlaceholderText("x") as HTMLInputElement;
    expect(el.className).toMatch(/focus:shadow-\[var\(--shadow-focus\)\]/);
  });
});

describe("Select", () => {
  it("fires onChange when option picked", async () => {
    const fn = vi.fn();
    render(
      <Select value="a" onChange={(e) => fn(e.target.value)}>
        <option value="a">A</option>
        <option value="b">B</option>
      </Select>,
    );
    await userEvent.selectOptions(screen.getByRole("combobox"), "b");
    expect(fn).toHaveBeenCalledWith("b");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/app/ui/primitives/input.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/input.tsx`. Both components use `forwardRef` so consumers can attach refs (Task 12's editor needs this for `inputRef`):

```tsx
import { forwardRef } from "react";
import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const SHARED =
  "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] text-[var(--color-fg-primary)] text-[var(--font-size-body)] px-3 py-[var(--space-row-y)] focus:outline-none focus:shadow-[var(--shadow-focus)] motion-hover disabled:opacity-50";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input(props, ref) {
    const { className = "", ...rest } = props;
    return <input ref={ref} {...rest} className={`${SHARED} ${className}`} />;
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select(props, ref) {
    const { className = "", children, ...rest } = props;
    return (
      <select ref={ref} {...rest} className={`${SHARED} ${className}`}>
        {children}
      </select>
    );
  },
);
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run tests/app/ui/primitives/input.test.tsx
```
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/input.tsx tests/app/ui/primitives/input.test.tsx
git commit -m "feat(ui): add Input + Select primitives with Apple focus ring"
```

---

## Task 7: DensitySelector primitive

**Files:**
- Create: `app/ui/primitives/density-selector.tsx`
- Create: `tests/app/ui/primitives/density-selector.test.tsx`

Three pill buttons (Compact / Comfortable / Spacious). On mount reads `localStorage["studex.density"]` and sets `<html data-density>`. On click updates both.

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/density-selector.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DensitySelector } from "@/app/ui/primitives/density-selector";

describe("DensitySelector", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-density");
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-density");
  });

  it("defaults to comfortable when localStorage empty", () => {
    render(<DensitySelector />);
    const btn = screen.getByRole("button", { name: /comfortable/i });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("reads localStorage value on mount", () => {
    localStorage.setItem("studex.density", "spacious");
    render(<DensitySelector />);
    const btn = screen.getByRole("button", { name: /spacious/i });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
  });

  it("clicking a pill updates localStorage AND <html data-density>", async () => {
    render(<DensitySelector />);
    await userEvent.click(screen.getByRole("button", { name: /compact/i }));
    expect(localStorage.getItem("studex.density")).toBe("compact");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```
npx vitest run tests/app/ui/primitives/density-selector.test.tsx
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/density-selector.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

type Density = "compact" | "comfortable" | "spacious";
const VALUES: Density[] = ["compact", "comfortable", "spacious"];
const LABELS: Record<Density, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  spacious: "Spacious",
};
const STORAGE_KEY = "studex.density";

function readStored(): Density {
  if (typeof window === "undefined") return "comfortable";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "compact" || v === "comfortable" || v === "spacious" ? v : "comfortable";
}

export function DensitySelector() {
  const [density, setDensity] = useState<Density>("comfortable");

  useEffect(() => {
    const initial = readStored();
    setDensity(initial);
    document.documentElement.setAttribute("data-density", initial);
  }, []);

  const select = (next: Density) => {
    setDensity(next);
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-density", next);
  };

  return (
    <div
      role="group"
      aria-label="Density"
      className="inline-flex items-center rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] p-0.5 text-[11px] font-medium"
    >
      {VALUES.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={density === v}
          onClick={() => select(v)}
          className={`px-2.5 py-1 rounded-[var(--radius-sm)] motion-hover ${
            density === v
              ? "bg-[var(--color-bg-secondary)] text-[var(--color-fg-primary)]"
              : "text-[var(--color-fg-tertiary)] hover:text-[var(--color-fg-primary)]"
          }`}
        >
          {LABELS[v]}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```
npx vitest run tests/app/ui/primitives/density-selector.test.tsx
```
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/density-selector.tsx tests/app/ui/primitives/density-selector.test.tsx
git commit -m "feat(ui): add DensitySelector primitive with localStorage persistence"
```

---

## Task 8: Extend `Pill` tones in `shared.tsx`

**Files:**
- Modify: `app/ui/dashboard/shared.tsx`
- Create: `tests/app/ui/dashboard/pill.test.tsx`

Widen `Pill` to accept `neutral | accent | success | warn | danger` while keeping legacy tones (`blue | rose | slate`) as aliases so non-migrated call sites keep working.

- [ ] **Step 1: Read current Pill implementation**

```bash
grep -n "Pill" c:/Users/Flow/Desktop/studex/app/ui/dashboard/shared.tsx
```

Read the `Pill` function and note its current `tone` prop type and the class mappings.

- [ ] **Step 2: Write failing test**

Create `tests/app/ui/dashboard/pill.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";

import { Pill } from "@/app/ui/dashboard/shared";

describe("Pill", () => {
  it("default (neutral) tone applies neutral class", () => {
    render(<Pill>x</Pill>);
    expect(screen.getByText("x").className).toMatch(/bg-\[var\(--color-bg-secondary\)\]/);
  });

  it("accent tone applies accent class", () => {
    render(<Pill tone="accent">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-accent\)\]/);
  });

  it("success tone uses success token color", () => {
    render(<Pill tone="success">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-success\)\]/);
  });

  it("legacy 'blue' alias keeps working", () => {
    render(<Pill tone="blue">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-accent\)\]/);
  });

  it("legacy 'rose' alias keeps working", () => {
    render(<Pill tone="rose">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/text-\[var\(--color-danger\)\]/);
  });

  it("legacy 'slate' alias keeps working", () => {
    render(<Pill tone="slate">x</Pill>);
    expect(screen.getByText("x").className).toMatch(/bg-\[var\(--color-bg-secondary\)\]/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```
npx vitest run tests/app/ui/dashboard/pill.test.tsx
```
Expected: FAIL — current Pill doesn't use these tokens.

- [ ] **Step 4: Modify `app/ui/dashboard/shared.tsx`**

Replace the existing `Pill` function entirely with:

```tsx
type PillTone =
  | "neutral"
  | "accent"
  | "success"
  | "warn"
  | "danger"
  // legacy aliases (kept for non-migrated call sites)
  | "blue"
  | "rose"
  | "slate";

const PILL_TONE_CLASSES: Record<PillTone, string> = {
  neutral: "bg-[var(--color-bg-secondary)] text-[var(--color-fg-primary)]",
  accent: "bg-[var(--color-bg-secondary)] text-[var(--color-accent)]",
  success: "bg-[var(--color-bg-secondary)] text-[var(--color-success)]",
  warn: "bg-[var(--color-bg-secondary)] text-[var(--color-warn)]",
  danger: "bg-[var(--color-bg-secondary)] text-[var(--color-danger)]",
  // legacy aliases
  blue: "bg-[var(--color-bg-secondary)] text-[var(--color-accent)]",
  rose: "bg-[var(--color-bg-secondary)] text-[var(--color-danger)]",
  slate: "bg-[var(--color-bg-secondary)] text-[var(--color-fg-primary)]",
};

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: PillTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${PILL_TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
```

(Leave other exports in `shared.tsx` — `EmptyState`, `SectionCard`, `colorForModule`, etc. — exactly as they were.)

- [ ] **Step 5: Run test to verify it passes**

```
npx vitest run tests/app/ui/dashboard/pill.test.tsx
```
Expected: 6 passed.

- [ ] **Step 6: Run full suite to confirm no regressions in existing call sites**

```
npx vitest run --reporter=basic
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/ui/dashboard/shared.tsx tests/app/ui/dashboard/pill.test.tsx
git commit -m "feat(ui): extend Pill tones with legacy aliases"
```

---

## Task 9: Migrate `program-selector.tsx`

**Files:**
- Modify: `app/ui/progress/program-selector.tsx`

Replace the inline `<select>` with the `Select` primitive. Smallest of the four migration files.

- [ ] **Step 1: Read current file**

```bash
cat c:/Users/Flow/Desktop/studex/app/ui/progress/program-selector.tsx
```

Note where the `<select>` and `<option>` are.

- [ ] **Step 2: Apply edit**

Modify `app/ui/progress/program-selector.tsx`. At the top of the imports add:

```tsx
import { Select } from "@/app/ui/primitives/input";
```

Replace the entire `<select>...</select>` block with:

```tsx
<Select value={current ?? ""} onChange={(e) => select(e.target.value)}>
  {current === null ? <option value="">— default —</option> : null}
  {available.map((p) => (
    <option key={p} value={p}>
      {PROGRAM_LABELS[p] ?? p}
    </option>
  ))}
</Select>
```

The `<label>` and surrounding flex container stay as-is.

- [ ] **Step 3: Run tests to confirm no regression**

```
npx vitest run --reporter=basic
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/ui/progress/program-selector.tsx
git commit -m "refactor(progress): use Select primitive in program selector"
```

---

## Task 10: Migrate `bucket-card.tsx`

**Files:**
- Modify: `app/ui/progress/bucket-card.tsx`

Replace the inline `<section>` chrome with `Card hoverLift`. Replace inline pill markup with `Pill` primitive (using `success` / `warn` / `neutral` tones to convey status). Add motion class to the progress bar.

- [ ] **Step 1: Read current file**

Read `app/ui/progress/bucket-card.tsx` to confirm the markup.

- [ ] **Step 2: Apply edit**

Replace the entire body of `app/ui/progress/bucket-card.tsx`:

```tsx
"use client";

import type { BucketResult } from "@/lib/curriculum/types";

import { Pill } from "@/app/ui/dashboard/shared";
import { Card } from "@/app/ui/primitives/card";

export function BucketCard({ bucket }: { bucket: BucketResult }) {
  const pct = Math.min(100, Math.round((bucket.current / bucket.required) * 100));
  const barClass =
    bucket.status === "complete"
      ? "bg-[var(--color-success)]"
      : bucket.status === "in_progress"
        ? "bg-[var(--color-warn)]"
        : "bg-[var(--color-fg-tertiary)]";

  return (
    <Card hoverLift>
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[var(--font-size-body)] font-semibold text-[var(--color-fg-primary)]">
          {bucket.name}
        </h3>
        <span className="text-[11px] text-[var(--color-fg-tertiary)]">
          {bucket.current} / {bucket.required} MC
        </span>
      </header>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
        <div
          className={`h-full ${barClass}`}
          style={{ width: `${pct}%`, transition: "width 600ms var(--ease-out)" }}
        />
      </div>
      {bucket.fulfilling.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {bucket.fulfilling.map((t) => (
            <li key={t.code}>
              <Pill tone={t.status === "completed" ? "success" : "warn"}>{t.code}</Pill>
            </li>
          ))}
        </ul>
      ) : null}
      {bucket.suggestions.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-tertiary)]">
            Suggestions
          </p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {bucket.suggestions.map((s) => (
              <li key={s.code} title={s.title}>
                <Pill tone="neutral">{s.code}</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
```

- [ ] **Step 3: Run tests to confirm no regression**

```
npx vitest run --reporter=basic
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/ui/progress/bucket-card.tsx
git commit -m "refactor(progress): bucket card uses Card + Pill primitives"
```

---

## Task 11: Migrate `progress-view.tsx`

**Files:**
- Modify: `app/ui/progress/progress-view.tsx`

Wrap content in `Container`. Replace the audit-summary `<section>` with `Card`. Add `DensitySelector` next to `ProgramSelector` in the header row.

- [ ] **Step 1: Read current file** to confirm structure (it has the eyebrow, ProgramSelector at top-right, the summary card, the bucket grid, the editor below).

- [ ] **Step 2: Apply edit**

Replace the entire body of `app/ui/progress/progress-view.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";

import type { AuditResult } from "@/lib/curriculum/types";

import { BucketCard } from "./bucket-card";
import { ModuleTakingsEditor } from "./module-takings-editor";
import { ProgramSelector } from "./program-selector";
import { Card } from "@/app/ui/primitives/card";
import { Container } from "@/app/ui/primitives/container";
import { DensitySelector } from "@/app/ui/primitives/density-selector";

type LoadState =
  | { kind: "idle" }
  | { kind: "ready"; audit: AuditResult }
  | { kind: "error"; message: string };

export function ProgressView() {
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const [refetchTrigger, setRefetchTrigger] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/audit")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load audit" });
          return;
        }
        setState({ kind: "ready", audit: json as AuditResult });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : "Failed to load",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refetchTrigger]);

  const refetchAudit = () => setRefetchTrigger((n) => n + 1);

  if (state.kind === "idle") {
    return (
      <Container>
        <p className="text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">Loading audit…</p>
      </Container>
    );
  }
  if (state.kind === "error") {
    return (
      <Container>
        <p className="text-[var(--font-size-body)] text-[var(--color-danger)]">
          Failed to load audit: {state.message}
        </p>
      </Container>
    );
  }

  const { audit } = state;
  const pct = Math.round((audit.totalMc.current / audit.totalMc.required) * 100);

  return (
    <Container>
      <div className="space-y-[var(--space-section-gap)]">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">
              Progress
            </p>
            <div className="flex items-center gap-2">
              <DensitySelector />
              <ProgramSelector onChange={refetchAudit} />
            </div>
          </div>
          <h2
            className="mt-2 font-semibold tracking-[-0.02em] text-[var(--color-fg-primary)]"
            style={{ fontSize: "var(--font-size-heading)", lineHeight: 1.15 }}
          >
            {audit.programName}
          </h2>
          <div className="mt-4 flex items-baseline gap-3">
            <span
              className="font-semibold text-[var(--color-fg-primary)]"
              style={{ fontSize: "var(--font-size-mc-display)", letterSpacing: "-0.025em" }}
            >
              {audit.totalMc.current} / {audit.totalMc.required} MC
            </span>
            <span className="text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">
              {pct}% to graduation
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
            <div
              className={`h-full ${audit.willGraduate ? "bg-[var(--color-success)]" : "bg-[var(--color-warn)]"}`}
              style={{ width: `${pct}%`, transition: "width 600ms var(--ease-out)" }}
            />
          </div>
          {audit.willGraduate ? (
            <p className="mt-3 text-[var(--font-size-body)] font-medium text-[var(--color-success)]">
              On track to graduate.
            </p>
          ) : (
            <p className="mt-3 text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">
              {audit.blockers.length} bucket(s) remaining.
            </p>
          )}
        </Card>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {audit.buckets.map((b) => (
            <BucketCard key={b.id} bucket={b} />
          ))}
        </div>

        <ModuleTakingsEditor
          onChange={refetchAudit}
          buckets={audit.buckets.map((b) => ({ id: b.id, name: b.name }))}
        />
      </div>
    </Container>
  );
}
```

- [ ] **Step 3: Run tests to confirm progress-view test still passes**

```
npx vitest run tests/app/ui/progress/progress-view.test.tsx
```
Expected: 2 passed.

- [ ] **Step 4: Run full suite**

```
npx vitest run --reporter=basic
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/ui/progress/progress-view.tsx
git commit -m "refactor(progress): wrap progress view in Container, add DensitySelector"
```

---

## Task 12: Migrate `module-takings-editor.tsx` with row-menu refinement

**Files:**
- Modify: `app/ui/progress/module-takings-editor.tsx`

Three concrete UX improvements bundled with the primitive migration:
1. Each tracked-module row shows only `status` + `grade` inline; bucket-override + Remove move behind a `•••` button revealed on row hover, opening a small popover.
2. Search input paired with a primary `Add to plan` button. Clicking results commits with the current selected status.
3. Use `Card` / `Input` / `Button` primitives throughout.

- [ ] **Step 1: Replace the entire file**

Replace `app/ui/progress/module-takings-editor.tsx` with:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/app/ui/primitives/button";
import { Card } from "@/app/ui/primitives/card";
import { Input, Select } from "@/app/ui/primitives/input";

type Taking = {
  id: string;
  module_code: string;
  status: "completed" | "in_progress" | "planning" | "dropped";
  semester: string | null;
  grade: string | null;
  bucket_override: string | null;
};

type SearchResult = {
  code: string;
  title: string;
  semesters: number[];
};

type Props = {
  onChange: () => void;
  buckets: Array<{ id: string; name: string }>;
};

const STATUSES: Array<{ value: Taking["status"]; label: string }> = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "planning", label: "Planning" },
  { value: "dropped", label: "Dropped" },
];

export function ModuleTakingsEditor({ onChange, buckets }: Props) {
  const [takings, setTakings] = useState<Taking[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refresh = () => setRefreshTrigger((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/module-takings")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Failed to load");
          return;
        }
        setTakings(json.takings as Taking[]);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  const updateTaking = async (taking: Taking, patch: Partial<Taking>) => {
    const merged = { ...taking, ...patch };
    const res = await fetch("/api/module-takings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        module_code: merged.module_code,
        status: merged.status,
        semester: merged.semester,
        grade: merged.grade,
        bucket_override: merged.bucket_override,
      }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to update");
      return;
    }
    refresh();
    onChange();
  };

  const removeTaking = async (taking: Taking) => {
    const res = await fetch("/api/module-takings", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module_code: taking.module_code }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to delete");
      return;
    }
    refresh();
    onChange();
  };

  const addModule = async (code: string, status: Taking["status"]) => {
    const res = await fetch("/api/module-takings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ module_code: code, status }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to add");
      return;
    }
    refresh();
    onChange();
  };

  return (
    <Card>
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">
            My modules
          </p>
          <h2 className="mt-1 text-[16px] font-semibold tracking-tight text-[var(--color-fg-primary)]">
            Track what you&apos;ve taken
          </h2>
        </div>
        <p className="text-[11px] text-[var(--color-fg-tertiary)]">{takings?.length ?? 0} tracked</p>
      </div>

      <AddModuleForm onAdd={addModule} />

      {error ? (
        <p className="mt-3 text-[11px] text-[var(--color-danger)]">{error}</p>
      ) : null}

      {takings === null ? (
        <p className="mt-4 text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">Loading…</p>
      ) : takings.length === 0 ? (
        <p className="mt-4 text-[var(--font-size-body)] text-[var(--color-fg-tertiary)]">
          No modules tracked yet. Add one above, or sync a Canvas course to auto-populate in-progress modules.
        </p>
      ) : (
        <ul className="mt-4 space-y-1.5">
          {takings.map((t) => (
            <TakingRow
              key={t.id}
              taking={t}
              buckets={buckets}
              onUpdate={updateTaking}
              onRemove={removeTaking}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function TakingRow({
  taking,
  buckets,
  onUpdate,
  onRemove,
}: {
  taking: Taking;
  buckets: Array<{ id: string; name: string }>;
  onUpdate: (t: Taking, patch: Partial<Taking>) => Promise<void>;
  onRemove: (t: Taking) => Promise<void>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  return (
    <li
      ref={wrapRef}
      className="group relative flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-[var(--space-row-y)] hover:bg-[var(--color-bg-secondary)] motion-hover"
    >
      <span className="w-20 text-[12px] font-semibold text-[var(--color-fg-primary)]">
        {taking.module_code}
      </span>
      <Select
        value={taking.status}
        onChange={(e) => onUpdate(taking, { status: e.target.value as Taking["status"] })}
        className="text-[11px]"
      >
        {STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </Select>
      <Input
        type="text"
        placeholder="Grade"
        value={taking.grade ?? ""}
        onChange={(e) => onUpdate(taking, { grade: e.target.value || null })}
        className="w-16 text-[11px]"
      />
      <div className="flex-1" />
      <Button
        variant="ghost"
        size="sm"
        aria-label="More actions"
        onClick={() => setMenuOpen((v) => !v)}
        className="opacity-0 group-hover:opacity-100 motion-hover"
      >
        •••
      </Button>
      {menuOpen ? (
        <div className="absolute right-2 top-full z-10 mt-1 w-56 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-lift)]">
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-tertiary)]">
            Move to bucket
          </p>
          <button
            type="button"
            onClick={() => {
              onUpdate(taking, { bucket_override: null });
              setMenuOpen(false);
            }}
            className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-secondary)]"
          >
            Auto-assign
          </button>
          {buckets.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                onUpdate(taking, { bucket_override: b.id });
                setMenuOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--color-bg-secondary)] ${
                taking.bucket_override === b.id
                  ? "text-[var(--color-accent)] font-medium"
                  : "text-[var(--color-fg-primary)]"
              }`}
            >
              → {b.name}
            </button>
          ))}
          <div className="my-1 border-t border-[color:var(--color-border)]" />
          <button
            type="button"
            onClick={() => {
              onRemove(taking);
              setMenuOpen(false);
            }}
            className="w-full px-3 py-1.5 text-left text-[11px] text-[var(--color-danger)] hover:bg-[var(--color-bg-secondary)]"
          >
            Remove
          </button>
        </div>
      ) : null}
    </li>
  );
}

function AddModuleForm({ onAdd }: { onAdd: (code: string, status: Taking["status"]) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<Taking["status"]>("planning");
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/nusmods/search?q=${encodeURIComponent(query.trim())}`);
        const json = await res.json();
        setResults((json.results as SearchResult[]) ?? []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const pick = async (result: SearchResult) => {
    await onAdd(result.code, status);
    setQuery("");
    setResults([]);
  };

  const focusInput = () => inputRef.current?.focus();

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search NUSMods (e.g. CS3235, security…)"
          className="flex-1 min-w-[220px]"
        />
        <Select value={status} onChange={(e) => setStatus(e.target.value as Taking["status"])}>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Button variant="primary" size="md" onClick={focusInput}>
          Add to plan
        </Button>
      </div>
      {results.length > 0 ? (
        <ul className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-card)]">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 text-[12px] text-[var(--color-fg-primary)] hover:bg-[var(--color-bg-secondary)] motion-hover"
              >
                <span className="font-semibold">{r.code}</span>{" "}
                <span className="text-[var(--color-fg-tertiary)]">— {r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !searching ? (
        <p className="text-[11px] text-[var(--color-fg-tertiary)]">No matches.</p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Run all tests**

```
npx vitest run --reporter=basic
```
Expected: all tests pass (existing module-takings tests don't depend on internal markup, so they should still pass).

- [ ] **Step 3: Run lint**

```
npm run lint
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add app/ui/progress/module-takings-editor.tsx
git commit -m "refactor(progress): row ••• menu + primary Add button + primitive migration"
```

---

## Task 13: Final integration check

**Files:**
- None (verification only)

- [ ] **Step 1: Full test suite**

```
npx vitest run --reporter=basic
```
Expected: all tests pass (existing 175 + ~22 new primitive/pill tests).

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 new errors (pre-existing test-globals noise unchanged).

- [ ] **Step 3: Lint**

```
npm run lint
```
Expected: 0 errors.

- [ ] **Step 4: Manual smoke checklist**

With dev server running:

1. Open `/` → NUSMods → **Progress** tab
2. Density selector visible top-right next to Program selector
3. Click **Compact** pill → font sizes shrink, row spacing tightens; reload → still compact
4. Click **Spacious** → opposite
5. Resize browser to 320 px → single column, density auto-locks to compact regardless of selector
6. Resize to 1280 px → 3-column bucket grid
7. Hover a bucket card → subtle shadow lift over 150 ms; translate-y(-1 px)
8. Hover any tracked-module row → `•••` button reveals at row end
9. Click `•••` → small popover with "Move to bucket" list + Auto-assign + Remove; click outside closes
10. Click "Move to bucket → Mathematics" → audit refetches, that module migrates buckets
11. Type in search → results dropdown styled in apple grays; click a result → adds with current status
12. Click `Add to plan` button when search empty → focuses search input
13. Toggle OS-level reduce-motion → page transitions become instant; no animations fire
14. Reload at any density → no FOUC

- [ ] **Step 5: Commit any integration fixes**

If any test or lint fix needed:

```bash
git add <fixed files>
git commit -m "fix: integration regressions from UI design system phase 1"
```

---

## Self-Review Notes

**Spec coverage:**
- Token system: Task 1
- Density toggle (storage + UI + FOUC): Tasks 1, 2, 7
- Container primitive: Task 3
- Card primitive: Task 4
- Button primitive: Task 5
- Input + Select primitives: Task 6
- Pill extension: Task 8
- Progress-tab migration: Tasks 9, 10, 11, 12
- Interaction refinement (••• menu): Task 12
- Interaction refinement (Add to plan button): Task 12
- Interaction refinement (header controls right-aligned): Task 11
- Acceptance criteria + smoke checklist: Task 13
- Reduced-motion respect: Task 1 (CSS), Task 13 step 4 item 13

**Deferred per spec (not addressed in this plan):**
- `Dialog` and `Tabs` primitives
- Migration of any other surface (home, module view, dialogs, cheatsheet, NUSMods Current sem)
- Drag-rearrange, per-section collapse
- Dark mode
- Motion library
