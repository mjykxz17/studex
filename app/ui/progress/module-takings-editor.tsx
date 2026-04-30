"use client";

import { useEffect, useRef, useState } from "react";

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
};

const STATUSES: Array<{ value: Taking["status"]; label: string }> = [
  { value: "completed", label: "Completed" },
  { value: "in_progress", label: "In progress" },
  { value: "planning", label: "Planning" },
  { value: "dropped", label: "Dropped" },
];

export function ModuleTakingsEditor({ onChange }: Props) {
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
    await refresh();
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
    await refresh();
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
    await refresh();
    onChange();
  };

  return (
    <section className="rounded-[12px] border border-stone-200 bg-white px-5 py-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-stone-400">My modules</p>
          <h2 className="mt-1 text-[16px] font-semibold tracking-tight text-stone-950">
            Track what you&apos;ve taken
          </h2>
        </div>
        <p className="text-[11px] text-stone-500">{takings?.length ?? 0} tracked</p>
      </div>

      <AddModuleForm onAdd={addModule} />

      {error ? <p className="mt-3 text-[12px] text-rose-700">{error}</p> : null}

      {takings === null ? (
        <p className="mt-4 text-sm text-stone-500">Loading…</p>
      ) : takings.length === 0 ? (
        <p className="mt-4 text-sm text-stone-500">
          No modules tracked yet. Add one above, or sync a Canvas course to auto-populate in-progress modules.
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {takings.map((t) => (
            <li
              key={t.id}
              className="flex flex-col gap-2 rounded-[8px] border border-stone-200 bg-[#fcfbf9] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-[12px] font-semibold text-stone-900">{t.module_code}</span>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={t.status}
                  onChange={(e) => updateTaking(t, { status: e.target.value as Taking["status"] })}
                  className="rounded-[6px] border border-stone-200 bg-white px-2 py-1 text-[11px]"
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Grade"
                  value={t.grade ?? ""}
                  onChange={(e) => updateTaking(t, { grade: e.target.value || null })}
                  className="w-16 rounded-[6px] border border-stone-200 bg-white px-2 py-1 text-[11px]"
                />
                <button
                  type="button"
                  onClick={() => removeTaking(t)}
                  className="rounded-[6px] border border-stone-200 bg-white px-2 py-1 text-[11px] font-medium text-stone-500 hover:text-rose-700"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AddModuleForm({ onAdd }: { onAdd: (code: string, status: Taking["status"]) => Promise<void> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<Taking["status"]>("planning");
  const [searching, setSearching] = useState(false);
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

  return (
    <div className="mt-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search NUSMods (e.g. CS3235, security…)"
          className="flex-1 min-w-[200px] rounded-[8px] border border-stone-200 bg-white px-3 py-2 text-[12px]"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as Taking["status"])}
          className="rounded-[8px] border border-stone-200 bg-white px-2 py-2 text-[11px]"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {results.length > 0 ? (
        <ul className="rounded-[8px] border border-stone-200 bg-white">
          {results.map((r) => (
            <li key={r.code}>
              <button
                type="button"
                onClick={() => pick(r)}
                className="w-full text-left px-3 py-2 text-[12px] text-stone-800 hover:bg-stone-50"
              >
                <span className="font-semibold">{r.code}</span>{" "}
                <span className="text-stone-500">— {r.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : query.trim().length >= 2 && !searching ? (
        <p className="text-[11px] text-stone-500">No matches.</p>
      ) : null}
    </div>
  );
}
