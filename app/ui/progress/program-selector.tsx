"use client";

import { useEffect, useState } from "react";
import { Select } from "@/app/ui/primitives/input";

const PROGRAM_LABELS: Record<string, string> = {
  "bcomp-isc-2024": "BComp Information Security (AY24/25)",
  "bcomp-cs-2024": "BComp Computer Science (AY24/25)",
};

type Props = {
  onChange: () => void;
};

export function ProgramSelector({ onChange }: Props) {
  const [available, setAvailable] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/user-program")
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Failed to load programs");
          return;
        }
        setAvailable(json.available as string[]);
        setCurrent(json.current as string | null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [refreshTrigger]);

  const select = async (programId: string) => {
    const res = await fetch("/api/user-program", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ program_id: programId }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error ?? "Failed to switch program");
      return;
    }
    setRefreshTrigger((n) => n + 1);
    onChange();
  };

  if (available.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Program</label>
      <Select value={current ?? ""} onChange={(e) => select(e.target.value)}>
        {current === null ? <option value="">— default —</option> : null}
        {available.map((p) => (
          <option key={p} value={p}>
            {PROGRAM_LABELS[p] ?? p}
          </option>
        ))}
      </Select>
      {error ? <span className="text-[10px] text-rose-700">{error}</span> : null}
    </div>
  );
}
