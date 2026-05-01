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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
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
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        onClick={() => setMenuOpen((v) => !v)}
        className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 motion-hover"
      >
        •••
      </Button>
      {menuOpen ? (
        <div
          role="menu"
          className="absolute right-2 top-full z-10 mt-1 w-56 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[var(--color-bg-primary)] py-1 shadow-[var(--shadow-lift)]"
        >
          <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-fg-tertiary)]">
            Move to bucket
          </p>
          <button
            type="button"
            role="menuitem"
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
              role="menuitem"
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
            role="menuitem"
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
