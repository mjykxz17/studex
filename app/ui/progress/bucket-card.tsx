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
