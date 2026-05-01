"use client";

import { useCallback, useSyncExternalStore } from "react";

type Density = "compact" | "comfortable" | "spacious";
const VALUES: Density[] = ["compact", "comfortable", "spacious"];
const LABELS: Record<Density, string> = {
  compact: "Compact",
  comfortable: "Comfortable",
  spacious: "Spacious",
};
const STORAGE_KEY = "studex.density";

function parseDensity(v: string | null): Density {
  return v === "compact" || v === "comfortable" || v === "spacious" ? v : "comfortable";
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getSnapshot(): Density {
  return parseDensity(window.localStorage.getItem(STORAGE_KEY));
}

function getServerSnapshot(): Density {
  return "comfortable";
}

export function DensitySelector() {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const select = useCallback((next: Density) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.setAttribute("data-density", next);
    // Dispatch a storage event so useSyncExternalStore re-reads the snapshot
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: next }));
  }, []);

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
