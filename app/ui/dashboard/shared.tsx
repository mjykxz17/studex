import type { PropsWithChildren, ReactNode } from "react";

const MODULE_COLORS: Record<string, string> = {
  CS3235: "#e8480c",
  IS4233: "#d97706",
  IS4231: "#059669",
  TRA3203: "#7c3aed",
  GEX1015: "#0891b2",
};

const COLOR_PALETTE = ["#2563eb", "#0f766e", "#9333ea", "#ea580c", "#db2777", "#16a34a", "#0ea5e9"];

export function colorForModule(code: string) {
  if (MODULE_COLORS[code]) {
    return MODULE_COLORS[code];
  }

  let hash = 0;
  for (let index = 0; index < code.length; index += 1) {
    hash = (hash * 31 + code.charCodeAt(index)) & 0xffff;
  }

  return COLOR_PALETTE[hash % COLOR_PALETTE.length];
}

export function getDaysLeft(dueDate?: string | null) {
  if (!dueDate) {
    return null;
  }

  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) {
    return null;
  }

  return Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

export function SectionCard({
  title,
  eyebrow,
  action,
  children,
}: PropsWithChildren<{ title: string; eyebrow?: string; action?: ReactNode }>) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
      <div className="flex items-center justify-between gap-4 border-b border-[color:var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3">
        <div>
          {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--color-fg-tertiary)]">{eyebrow}</p> : null}
          <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-[var(--color-fg-primary)]">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-[color:var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-8 text-center">
      <p className="text-sm font-semibold text-[var(--color-fg-primary)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--color-fg-tertiary)]">{copy}</p>
    </div>
  );
}

type PillTone =
  | "neutral"
  | "accent"
  | "success"
  | "warn"
  | "danger"
  // Legacy aliases — preserve old visuals EXACTLY for non-migrated call sites
  | "blue"
  | "rose"
  | "slate"
  | "emerald";

const PILL_TONE_CLASSES: Record<PillTone, string> = {
  // New tokenised tones (compact Apple style)
  neutral: "bg-[var(--color-bg-secondary)] text-[var(--color-fg-primary)] px-2 py-0.5 text-[10px] font-medium",
  accent: "bg-[var(--color-bg-secondary)] text-[var(--color-accent)] px-2 py-0.5 text-[10px] font-medium",
  success: "bg-[var(--color-bg-secondary)] text-[var(--color-success)] px-2 py-0.5 text-[10px] font-medium",
  warn: "bg-[var(--color-bg-secondary)] text-[var(--color-warn)] px-2 py-0.5 text-[10px] font-medium",
  danger: "bg-[var(--color-bg-secondary)] text-[var(--color-danger)] px-2 py-0.5 text-[10px] font-medium",
  // Legacy tones — keep the OLD look so non-migrated surfaces don't shift
  blue: "bg-blue-50 text-blue-800 border border-blue-100 px-2.5 py-1 text-[10px] font-semibold",
  rose: "bg-rose-50 text-rose-800 border border-rose-100 px-2.5 py-1 text-[10px] font-semibold",
  slate: "bg-stone-100 text-stone-700 border border-stone-200 px-2.5 py-1 text-[10px] font-semibold",
  emerald: "bg-emerald-50 text-emerald-800 border border-emerald-100 px-2.5 py-1 text-[10px] font-semibold",
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
      className={`inline-flex items-center gap-1 rounded-full ${PILL_TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}
