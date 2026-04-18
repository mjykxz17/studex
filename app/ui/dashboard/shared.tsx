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
    <section className="overflow-hidden rounded-[12px] border border-stone-200 bg-[#ffffff] shadow-[0_10px_28px_rgba(28,25,23,0.05)]">
      <div className="flex items-center justify-between gap-4 border-b border-stone-200 bg-[#fcfbf9] px-4 py-3">
        <div>
          {eyebrow ? <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">{eyebrow}</p> : null}
          <h2 className="mt-1 text-[15px] font-semibold tracking-tight text-stone-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function EmptyState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="rounded-[10px] border border-dashed border-stone-200 bg-[#fafaf9] px-5 py-8 text-center">
      <p className="text-sm font-semibold text-stone-900">{title}</p>
      <p className="mt-2 text-sm leading-6 text-stone-500">{copy}</p>
    </div>
  );
}

export function Pill({ children, tone = "slate" }: PropsWithChildren<{ tone?: "slate" | "blue" | "emerald" | "rose" }>) {
  const tones = {
    slate: "bg-stone-100 text-stone-700 border border-stone-200",
    blue: "bg-blue-50 text-blue-800 border border-blue-100",
    emerald: "bg-emerald-50 text-emerald-800 border border-emerald-100",
    rose: "bg-rose-50 text-rose-800 border border-rose-100",
  } as const;

  return <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${tones[tone]}`}>{children}</span>;
}
