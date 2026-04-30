"use client";

import type { BucketResult } from "@/lib/curriculum/types";

export function BucketCard({ bucket }: { bucket: BucketResult }) {
  const pct = Math.min(100, Math.round((bucket.current / bucket.required) * 100));
  const statusColor =
    bucket.status === "complete"
      ? "bg-emerald-500"
      : bucket.status === "in_progress"
        ? "bg-amber-500"
        : "bg-stone-300";

  return (
    <section className="rounded-[10px] border border-stone-200 bg-white px-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-stone-900">{bucket.name}</h3>
        <span className="text-[11px] text-stone-500">
          {bucket.current} / {bucket.required} MC
        </span>
      </header>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={`h-full ${statusColor}`} style={{ width: `${pct}%` }} />
      </div>
      {bucket.fulfilling.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {bucket.fulfilling.map((t) => (
            <li
              key={t.code}
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                t.status === "completed"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              {t.code}
            </li>
          ))}
        </ul>
      ) : null}
      {bucket.suggestions.length > 0 ? (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Suggestions</p>
          <ul className="mt-1 flex flex-wrap gap-1.5">
            {bucket.suggestions.map((s) => (
              <li
                key={s.code}
                title={s.title}
                className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-700"
              >
                {s.code}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
