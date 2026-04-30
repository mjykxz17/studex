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
  const [density, setDensity] = useState<Density>(readStored);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

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
