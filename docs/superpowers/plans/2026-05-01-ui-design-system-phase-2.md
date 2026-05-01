# UI Design System — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the deferred Phase-1 primitives (`Dialog`, `ProgressBar`, `cn()` helper) and migrate all 5 existing dialogs (page-viewer, announcement-detail, assignment-detail, file-preview, panopto) to the new `Dialog` shell so the app feels visually consistent everywhere a modal opens.

**Architecture:** A single `<Dialog>` primitive replaces ~280 lines of duplicated portal + body-scroll-lock + escape-to-close + backdrop-click chrome currently scattered across 5 dialog files. Each dialog component keeps its trigger-button + body shape but delegates the shell to `<Dialog>`. A `cn()` helper standardises className composition. A `<ProgressBar>` primitive consolidates the 2 inline-styled bars in the Progress tab.

**Tech Stack:** Next.js 16 (App Router) · TypeScript · Tailwind v4 · vitest + RTL · existing `useBodyScrollLock` / `useEscapeToClose` hooks · existing tokens from Phase 1

**Estimated effort:** 5–6 hours focused.

---

## File Map

**NEW:**
- `app/ui/primitives/cn.ts` — `cn(...args: ClassValue[]): string` className composition helper
- `app/ui/primitives/dialog.tsx` — portal-mounted modal shell with backdrop, scroll lock, escape, and motion
- `app/ui/primitives/progress-bar.tsx` — token-driven progress bar with tone (success/warn/tertiary) and width transition
- `tests/app/ui/primitives/cn.test.ts`
- `tests/app/ui/primitives/dialog.test.tsx`
- `tests/app/ui/primitives/progress-bar.test.tsx`

**MODIFIED:**
- `app/ui/page-viewer-dialog.tsx` — internal refactor to use `<Dialog>`; external API (trigger + props) unchanged
- `app/ui/announcement-detail-dialog.tsx` — same
- `app/ui/assignment-detail-dialog.tsx` — same
- `app/ui/file-preview-dialog.tsx` — same (largest body switch preserved)
- `app/ui/panopto-dialog.tsx` — same
- `app/ui/progress/progress-view.tsx` — replace inline progress-bar markup with `<ProgressBar>`
- `app/ui/progress/bucket-card.tsx` — replace inline progress-bar markup with `<ProgressBar>`

**UNTOUCHED:** Token system, Container/Card/Button/Input/Select/DensitySelector primitives, Pill, FOUC script, all sync/audit/canvas backend code, all other UI surfaces (home dashboard, module view tabs, NUSMods Current sem, cheatsheet panel — those are Phase 3+).

**Out of scope:** Tabs primitive (defer until home dashboard / module view migration), Menu primitive (defer until we add real menus), dark mode, Pill consumer migration off legacy aliases.

---

## Task 1: `cn()` helper

**Files:**
- Create: `app/ui/primitives/cn.ts`
- Create: `tests/app/ui/primitives/cn.test.ts`

5-line helper that joins classNames, filtering falsy values. Replaces the ad-hoc template-literal composition in primitives.

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/cn.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { cn } from "@/app/ui/primitives/cn";

describe("cn", () => {
  it("joins truthy strings with single spaces", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });
  it("filters out falsy values", () => {
    expect(cn("a", false, "b", null, "c", undefined, 0, "")).toBe("a b c");
  });
  it("returns empty string for no truthy args", () => {
    expect(cn(false, null, undefined, "")).toBe("");
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

`npx vitest run tests/app/ui/primitives/cn.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/cn.ts`:

```ts
type ClassValue = string | number | false | null | undefined;

export function cn(...args: ClassValue[]): string {
  return args.filter((a): a is string => typeof a === "string" && a.length > 0).join(" ");
}
```

- [ ] **Step 4: Run test (expect pass)**

`npx vitest run tests/app/ui/primitives/cn.test.ts`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/cn.ts tests/app/ui/primitives/cn.test.ts
git commit -m "feat(ui): add cn() className helper"
```

---

## Task 2: `ProgressBar` primitive

**Files:**
- Create: `app/ui/primitives/progress-bar.tsx`
- Create: `tests/app/ui/primitives/progress-bar.test.tsx`

Token-driven horizontal progress bar. Tones map to bucket statuses. Width transition uses `--ease-out` and is honored by `prefers-reduced-motion` via the global rule already in `globals.css`.

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/progress-bar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";

import { ProgressBar } from "@/app/ui/primitives/progress-bar";

describe("ProgressBar", () => {
  it("renders with success tone applying success token", () => {
    const { container } = render(<ProgressBar value={50} tone="success" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill).toBeTruthy();
    expect(fill.className).toMatch(/bg-\[var\(--color-success\)\]/);
    expect(fill.style.width).toBe("50%");
  });

  it("clamps value above 100 to 100", () => {
    const { container } = render(<ProgressBar value={150} tone="warn" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.style.width).toBe("100%");
  });

  it("clamps value below 0 to 0", () => {
    const { container } = render(<ProgressBar value={-10} tone="tertiary" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.style.width).toBe("0%");
  });

  it("warn tone applies warn token", () => {
    const { container } = render(<ProgressBar value={50} tone="warn" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-\[var\(--color-warn\)\]/);
  });

  it("tertiary tone applies fg-tertiary token (for not-started)", () => {
    const { container } = render(<ProgressBar value={50} tone="tertiary" />);
    const fill = container.querySelector('[data-testid="progress-fill"]') as HTMLElement;
    expect(fill.className).toMatch(/bg-\[var\(--color-fg-tertiary\)\]/);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

`npx vitest run tests/app/ui/primitives/progress-bar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/progress-bar.tsx`:

```tsx
import { cn } from "@/app/ui/primitives/cn";

type Tone = "success" | "warn" | "tertiary";

const TONE_CLASSES: Record<Tone, string> = {
  success: "bg-[var(--color-success)]",
  warn: "bg-[var(--color-warn)]",
  tertiary: "bg-[var(--color-fg-tertiary)]",
};

export function ProgressBar({
  value,
  tone,
  className,
}: {
  value: number;
  tone: Tone;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cn(
        "h-1.5 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]",
        className,
      )}
    >
      <div
        data-testid="progress-fill"
        className={cn("h-full", TONE_CLASSES[tone])}
        style={{ width: `${pct}%`, transition: "width 600ms var(--ease-out)" }}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run test (expect pass)**

`npx vitest run tests/app/ui/primitives/progress-bar.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/progress-bar.tsx tests/app/ui/primitives/progress-bar.test.tsx
git commit -m "feat(ui): add ProgressBar primitive"
```

---

## Task 3: `Dialog` primitive

**Files:**
- Create: `app/ui/primitives/dialog.tsx`
- Create: `tests/app/ui/primitives/dialog.test.tsx`

The big extraction. Replaces ~280 lines of duplicated shell code across 5 dialog files. Existing `useBodyScrollLock` and `useEscapeToClose` hooks at `app/ui/use-modal-behavior.ts` are reused.

### Dialog API

```tsx
<Dialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  eyebrow="CS3235 · Page"
  title="Week 1 Notes"
  size="lg"          // sm (max-w-sm) | md (max-w-2xl) | lg (max-w-4xl) | xl (max-w-5xl)
  bodyClassName="..." // optional override for the body element
>
  {bodyContent}
</Dialog>
```

The trigger button stays OUTSIDE the Dialog component (parent renders its own trigger). This separates "what makes the dialog visible" from "what the dialog renders".

- [ ] **Step 1: Write failing test**

Create `tests/app/ui/primitives/dialog.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Dialog } from "@/app/ui/primitives/dialog";

describe("Dialog", () => {
  it("renders nothing when open is false", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="X">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders title, eyebrow, body when open", () => {
    render(
      <Dialog open onClose={() => {}} title="Hello" eyebrow="EYE">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("EYE")).toBeInTheDocument();
    expect(screen.getByText("body")).toBeInTheDocument();
  });

  it("close button fires onClose", async () => {
    const fn = vi.fn();
    render(
      <Dialog open onClose={fn} title="X">
        <p>body</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(fn).toHaveBeenCalled();
  });

  it("backdrop mousedown fires onClose", async () => {
    const fn = vi.fn();
    render(
      <Dialog open onClose={fn} title="X">
        <p>body</p>
      </Dialog>,
    );
    const backdrop = document.querySelector('[data-testid="dialog-backdrop"]') as HTMLElement;
    backdrop.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(fn).toHaveBeenCalled();
  });

  it("size prop maps to max-w class", () => {
    const { rerender } = render(
      <Dialog open onClose={() => {}} title="X" size="sm">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog").className).toMatch(/max-w-sm/);
    rerender(
      <Dialog open onClose={() => {}} title="X" size="xl">
        <p>body</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog").className).toMatch(/max-w-5xl/);
  });
});
```

- [ ] **Step 2: Run test (expect fail)**

`npx vitest run tests/app/ui/primitives/dialog.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `app/ui/primitives/dialog.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

import { cn } from "@/app/ui/primitives/cn";
import { useBodyScrollLock, useEscapeToClose } from "@/app/ui/use-modal-behavior";

type Size = "sm" | "md" | "lg" | "xl";

const SIZE_CLASSES: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
};

type Props = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  size?: Size;
  bodyClassName?: string;
  // For dialogs that need full-bleed bodies (e.g., Panopto iframe)
  bareBody?: boolean;
  children: ReactNode;
};

export function Dialog({
  open,
  onClose,
  title,
  eyebrow,
  size = "lg",
  bodyClassName,
  bareBody = false,
  children,
}: Props) {
  useBodyScrollLock(open);
  useEscapeToClose(open, onClose);

  // Mount-fade animation: opacity + scale on mount
  useEffect(() => {
    if (!open) return;
    // No-op; the framework handles re-render on prop change
  }, [open]);

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      data-testid="dialog-backdrop"
      className="fixed inset-0 z-[700] bg-stone-950/45 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          className={cn(
            "flex h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] shadow-[var(--shadow-lift)] sm:h-[calc(100vh-3rem)]",
            SIZE_CLASSES[size],
          )}
          style={{
            animation: "studex-dialog-in 250ms var(--ease-out)",
          }}
        >
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[color:var(--color-border)] px-5 py-4 sm:px-6">
            <div>
              {eyebrow ? (
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">
                  {eyebrow}
                </p>
              ) : null}
              <h2 className="mt-2 text-lg font-semibold tracking-tight text-[var(--color-fg-primary)]">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-secondary)] motion-hover hover:text-[var(--color-fg-primary)]"
            >
              Close
            </button>
          </div>
          <div className={cn(bareBody ? "min-h-0 flex-1" : "min-h-0 flex-1 overflow-auto p-6", bodyClassName)}>
            {children}
          </div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes studex-dialog-in {
          from { opacity: 0; transform: scale(0.96); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 4: Run test (expect pass)**

`npx vitest run tests/app/ui/primitives/dialog.test.tsx`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add app/ui/primitives/dialog.tsx tests/app/ui/primitives/dialog.test.tsx
git commit -m "feat(ui): add Dialog primitive (portal + scroll lock + escape + backdrop)"
```

---

## Task 4: Migrate all 5 dialog files to use `Dialog` primitive

**Files (modified):**
- `app/ui/page-viewer-dialog.tsx`
- `app/ui/announcement-detail-dialog.tsx`
- `app/ui/assignment-detail-dialog.tsx`
- `app/ui/file-preview-dialog.tsx`
- `app/ui/panopto-dialog.tsx`

Each existing dialog component keeps its **trigger button + body** but replaces the inline portal/scroll-lock/escape/backdrop/header/close-button shell with `<Dialog>`. External API (props consumed by parents) stays the same.

### Migration pattern (use this template for each)

Old structure (every dialog):

```tsx
const [isOpen, setIsOpen] = useState(false);
useBodyScrollLock(isOpen);
useEscapeToClose(isOpen, () => setIsOpen(false));
return (
  <>
    <button onClick={() => setIsOpen(true)}>{trigger label}</button>
    {typeof document !== "undefined" && isOpen
      ? createPortal(
          <div /* backdrop */>
            <div role="dialog">
              <div /* header */>...</div>
              <div /* body */>{specific content}</div>
            </div>
          </div>,
          document.body,
        )
      : null}
  </>
);
```

New structure:

```tsx
const [isOpen, setIsOpen] = useState(false);
return (
  <>
    <button onClick={() => setIsOpen(true)}>{trigger label}</button>
    <Dialog
      open={isOpen}
      onClose={() => setIsOpen(false)}
      title={...}
      eyebrow={...}
      size="lg"
    >
      {specific content}
    </Dialog>
  </>
);
```

Drop the `useBodyScrollLock` / `useEscapeToClose` calls AND the imports of `useEffect`, `createPortal`, `useBodyScrollLock`, `useEscapeToClose` — `<Dialog>` handles all of that.

### Per-dialog notes

**`page-viewer-dialog.tsx`:**
- `eyebrow={`${moduleCode} · Page`}`, `title={state.kind === "ready" ? state.title : page.title}`, `size="lg"`
- Body keeps its `state.kind === "loading" / "error" / "ready"` switch
- Keep the `useEffect` that fetches `/api/pages/{id}` on open (gate on `isOpen` and `state.kind`)

**`announcement-detail-dialog.tsx`:**
- `eyebrow={`${announcement.moduleCode} · Announcement · ${announcement.postedLabel}`}`, `title={announcement.title}`, `size="md"` (smaller — text-only body)
- Body is the existing `dangerouslySetInnerHTML` block

**`assignment-detail-dialog.tsx`:**
- `eyebrow={`${moduleCode} · Assignment ${dueLabel ? `· Due ${dueLabel}` : ""}`}`, `title={state.kind === "ready" ? state.title : title}`, `size="md"`
- Body keeps the load-state switch

**`file-preview-dialog.tsx`:**
- `eyebrow={`${moduleCode} preview`}`, `title={file.name}`, `size="xl"`
- Body keeps the LARGE conditional ladder (video / image / pdf / text / docx / office / fallback)
- **Important:** the description paragraph and "View source on Canvas" + "Open raw preview" links currently live in the body but were styled like meta-chrome. Move them into a small `<div className="px-6 py-3 border-b">` strip BETWEEN the Dialog's built-in header and the body switch. Dialog's `bodyClassName` can be set to `"min-h-0 flex-1 flex flex-col"` and the meta-strip + body container become children.
- Use `bareBody` if you want full-bleed (e.g., for the iframe), but for file-preview keep the standard padded body (the iframe takes 100% of the body area regardless).

**`panopto-dialog.tsx`:**
- `eyebrow={`${moduleCode} · Recording`}`, `title={title}`, `size="xl"`, `bareBody` true (iframe takes full body, no padding)
- Body is just `<iframe src={embedUrl} ... allowFullScreen />`

### Steps

- [ ] **Step 1: Migrate `panopto-dialog.tsx` (smallest, simplest)**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";

import { Dialog } from "@/app/ui/primitives/dialog";

type Props = {
  title: string;
  embedUrl: string;
  moduleCode: string;
  buttonLabel?: string;
  buttonClassName?: string;
};

export function PanoptoDialog({
  title,
  embedUrl,
  moduleCode,
  buttonLabel = "Watch",
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={title}
        eyebrow={`${moduleCode} · Recording`}
        size="xl"
        bareBody
      >
        <iframe
          src={embedUrl}
          title={title}
          className="h-full w-full"
          allow="autoplay; fullscreen"
          allowFullScreen
        />
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Migrate `announcement-detail-dialog.tsx` (no fetch, simplest body)**

Replace the entire file with:

```tsx
"use client";

import { useState } from "react";

import type { AnnouncementSummary } from "@/lib/contracts";

import { Dialog } from "@/app/ui/primitives/dialog";

type Props = {
  announcement: AnnouncementSummary;
  buttonClassName?: string;
};

export function AnnouncementDetailDialog({
  announcement,
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-1.5 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        Read full
      </button>
      <Dialog
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={announcement.title}
        eyebrow={`${announcement.moduleCode} · Announcement · ${announcement.postedLabel}`}
        size="md"
      >
        {announcement.bodyHtml ? (
          <div
            className="prose prose-stone max-w-none"
            dangerouslySetInnerHTML={{ __html: announcement.bodyHtml }}
          />
        ) : (
          <p className="text-sm text-[var(--color-fg-tertiary)]">No body content.</p>
        )}
      </Dialog>
    </>
  );
}
```

- [ ] **Step 3: Migrate `page-viewer-dialog.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useEffect, useState } from "react";

import type { CanvasPageSummary } from "@/lib/contracts";

import { Dialog } from "@/app/ui/primitives/dialog";

type Props = {
  page: CanvasPageSummary;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "ready"; html: string; title: string }
  | { kind: "error"; message: string };

export function PageViewerDialog({
  page,
  moduleCode,
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
  buttonLabel = "Open",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!isOpen || state.kind !== "idle") return;
    let cancelled = false;
    fetch(`/api/pages/${page.id}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: json.error ?? "Failed to load page" });
          return;
        }
        setState({ kind: "ready", html: json.bodyHtml, title: json.title });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "Failed to load" });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, page.id, state.kind]);

  const closeDialog = () => {
    setIsOpen(false);
    setState({ kind: "idle" });
  };

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      <Dialog
        open={isOpen}
        onClose={closeDialog}
        title={state.kind === "ready" ? state.title : page.title}
        eyebrow={`${moduleCode} · Page`}
        size="lg"
      >
        {state.kind === "error" ? (
          <p className="text-sm text-[var(--color-danger)]">Failed to load page: {state.message}</p>
        ) : state.kind === "ready" ? (
          <div
            className="prose prose-stone max-w-none"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        ) : (
          <p className="text-sm text-[var(--color-fg-tertiary)]">Loading…</p>
        )}
      </Dialog>
    </>
  );
}
```

- [ ] **Step 4: Migrate `assignment-detail-dialog.tsx`**

Replace the entire file with:

```tsx
"use client";

import { useEffect, useState } from "react";

import { Dialog } from "@/app/ui/primitives/dialog";

type Props = {
  taskId: string;
  title: string;
  moduleCode: string;
  buttonClassName?: string;
  buttonLabel?: string;
};

type LoadState =
  | { kind: "idle" }
  | { kind: "ready"; descriptionHtml: string; dueAt: string | null; title: string }
  | { kind: "error"; message: string };

export function AssignmentDetailDialog({
  taskId,
  title,
  moduleCode,
  buttonClassName = "rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-[11px] font-medium text-[var(--color-fg-primary)] motion-hover",
  buttonLabel = "Details",
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });

  useEffect(() => {
    if (!isOpen || state.kind !== "idle") return;
    let cancelled = false;
    fetch(`/api/tasks/${taskId}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
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
        if (cancelled) return;
        setState({ kind: "error", message: err instanceof Error ? err.message : "Failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, taskId, state.kind]);

  const closeDialog = () => {
    setIsOpen(false);
    setState({ kind: "idle" });
  };

  const dueLabel =
    state.kind === "ready" && state.dueAt
      ? new Date(state.dueAt).toLocaleString("en-SG", { dateStyle: "medium", timeStyle: "short" })
      : null;

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} className={buttonClassName}>
        {buttonLabel}
      </button>
      <Dialog
        open={isOpen}
        onClose={closeDialog}
        title={state.kind === "ready" ? state.title : title}
        eyebrow={`${moduleCode} · Assignment${dueLabel ? ` · Due ${dueLabel}` : ""}`}
        size="md"
      >
        {state.kind === "error" ? (
          <p className="text-sm text-[var(--color-danger)]">Failed to load: {state.message}</p>
        ) : state.kind === "ready" ? (
          state.descriptionHtml ? (
            <div
              className="prose prose-stone max-w-none"
              dangerouslySetInnerHTML={{ __html: state.descriptionHtml }}
            />
          ) : (
            <p className="text-sm text-[var(--color-fg-tertiary)]">No description provided.</p>
          )
        ) : (
          <p className="text-sm text-[var(--color-fg-tertiary)]">Loading…</p>
        )}
      </Dialog>
    </>
  );
}
```

- [ ] **Step 5: Migrate `file-preview-dialog.tsx` (largest, has more chrome)**

Read `app/ui/file-preview-dialog.tsx` first to understand the full body switch (video / image / pdf / text / docx / office / fallback). Then replace the file with the new structure: trigger button + `<Dialog>` containing a meta-chrome strip (preview-kind pills + secondary "View source" + "Open raw" links) followed by the body switch. The `bodyClassName` should stack vertically:

```tsx
<Dialog
  open={isOpen}
  onClose={() => setIsOpen(false)}
  title={file.name}
  eyebrow={`${moduleCode} preview`}
  size="xl"
  bodyClassName="min-h-0 flex-1 flex flex-col"
>
  {/* Meta strip: pills + source link + open raw */}
  <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--color-border)] px-6 py-3 text-[11px]">
    <span className="rounded-full bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-fg-primary)]">
      {file.category}
    </span>
    <span className="rounded-full bg-[var(--color-bg-secondary)] px-2.5 py-1 text-[10px] font-medium text-[var(--color-fg-primary)]">
      {file.uploadedLabel}
    </span>
    {file.canvasUrl ? (
      <a
        href={file.canvasUrl}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] font-medium text-[var(--color-fg-tertiary)] underline-offset-2 hover:text-[var(--color-fg-primary)] hover:underline"
      >
        View source on Canvas
      </a>
    ) : null}
    {file.previewKind === "pdf" || file.previewKind === "image" ? (
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] font-medium text-[var(--color-fg-tertiary)] underline-offset-2 hover:text-[var(--color-fg-primary)] hover:underline"
      >
        Open raw preview
      </a>
    ) : null}
  </div>
  {/* Body */}
  <div className="min-h-0 flex-1 overflow-hidden bg-[var(--color-bg-primary)]">
    {/* PRESERVE the existing body switch verbatim — video / image / pdf / text / docx / office / fallback. Do NOT change behavior. */}
    {/* Read the current file to copy this block exactly. */}
  </div>
</Dialog>
```

The description-paragraph block in the OLD file (around line 64-69) is removed — it was redundant with the new Dialog title/eyebrow.

- [ ] **Step 6: Run all tests + lint + build**

```
npx vitest run --reporter=basic
npm run lint
npm run build
```
Expected: all 207 (202 + 5 new dialog) tests pass, 0 lint errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add app/ui/page-viewer-dialog.tsx app/ui/announcement-detail-dialog.tsx app/ui/assignment-detail-dialog.tsx app/ui/file-preview-dialog.tsx app/ui/panopto-dialog.tsx
git commit -m "refactor(ui): migrate 5 dialogs to use Dialog primitive"
```

---

## Task 5: Use `ProgressBar` in Progress tab

**Files:**
- Modify: `app/ui/progress/progress-view.tsx`
- Modify: `app/ui/progress/bucket-card.tsx`

Replace the inline progress-bar markup (`<div className="h-1.5 ..."><div style={{width...}} /></div>`) with `<ProgressBar value={pct} tone={...} />`.

- [ ] **Step 1: Modify `bucket-card.tsx`**

Replace the inline progress-bar block with:

```tsx
import { ProgressBar } from "@/app/ui/primitives/progress-bar";

// inside the component, replace the inline <div className="mt-3 h-1.5 ..."> ... </div> block with:
<div className="mt-3">
  <ProgressBar
    value={pct}
    tone={
      bucket.status === "complete"
        ? "success"
        : bucket.status === "in_progress"
          ? "warn"
          : "tertiary"
    }
  />
</div>
```

The local `barClass` variable is no longer needed — delete it.

- [ ] **Step 2: Modify `progress-view.tsx`**

Replace the inline progress-bar block in the audit summary card with:

```tsx
import { ProgressBar } from "@/app/ui/primitives/progress-bar";

// inside the component, replace the inline <div className="mt-3 h-1.5 ..."> ... </div> block with:
<div className="mt-3">
  <ProgressBar value={pct} tone={audit.willGraduate ? "success" : "warn"} />
</div>
```

- [ ] **Step 3: Run tests + lint + build**

```
npx vitest run --reporter=basic
npm run lint
npm run build
```
Expected: all tests pass, 0 lint, build succeeds. The existing `progress-view.test.tsx` doesn't assert on the inline-bar markup specifically, so it should still pass.

- [ ] **Step 4: Commit**

```bash
git add app/ui/progress/progress-view.tsx app/ui/progress/bucket-card.tsx
git commit -m "refactor(progress): use ProgressBar primitive"
```

---

## Task 6: Final integration check

- [ ] **Step 1: Full suite**

```
npx vitest run --reporter=basic
```
Expected: 215 passed (202 baseline + 3 new cn + 5 new dialog + 5 new progress-bar = 215).

- [ ] **Step 2: Type-check**

```
npx tsc --noEmit
```
Expected: 0 new errors.

- [ ] **Step 3: Lint**

```
npm run lint
```
Expected: 0 errors.

- [ ] **Step 4: Build**

```
npm run build
```
Expected: builds successfully.

- [ ] **Step 5: Manual smoke checklist**

With dev server running:

1. Open any module → click any **Page** item in the module tree → page viewer dialog opens with Apple shell, smooth fade-in/scale, escape works, click-outside works
2. Open any **Assignment** item with a description → assignment dialog same shell, loads description, error path shows error
3. Click **Read full** on any announcement → announcement dialog opens, body renders sanitized HTML
4. Click any **PDF File** → file preview opens with Apple shell, meta-strip with category + uploaded-label pills + "View source on Canvas" small link, PDF iframe in body
5. Click any **DOCX File** → DOCX renders inline as styled HTML
6. Click any **Video** file → video plays inline
7. If a course has Panopto → click **Watch** → embedded iframe with Apple shell + bare body
8. Open Progress tab → progress bars on the audit summary + each bucket card render via ProgressBar primitive (visually identical)
9. Toggle OS reduce-motion → dialog fade-in becomes instant; progress bar width transitions are 0ms

- [ ] **Step 6: Commit any integration fixes**

```bash
git add <fixed files>
git commit -m "fix: integration regressions from UI design system phase 2"
```

---

## Self-Review Notes

**Spec coverage:**
- `cn()` helper: Task 1
- `ProgressBar` primitive: Task 2
- `Dialog` primitive: Task 3
- 5 dialog migrations: Task 4
- `ProgressBar` consumers in Progress tab: Task 5
- Final verification: Task 6

**Deferred (not in this plan):**
- `Tabs` primitive (defer until home / module-view migration)
- `Menu` primitive (defer until we add a real menu — the current `•••` popover stays inline)
- Pill consumer migration off legacy aliases
- Dark mode
- Home dashboard / module-view / NUSMods Current sem / cheatsheet panel migrations
