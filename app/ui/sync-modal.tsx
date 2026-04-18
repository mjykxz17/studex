"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { SyncEvent } from "@/lib/contracts";

import { readSyncStream } from "./sync-stream";
import { useBodyScrollLock, useEscapeToClose } from "./use-modal-behavior";

type ModuleSelection = {
  id: string;
  code: string;
  title: string;
  selected: boolean;
};

export type SyncConfig = {
  selectedModuleIds: string[];
  syncFiles: boolean;
};

type SyncModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config: SyncConfig) => void;
};

export function SyncModal({ isOpen, onClose, onConfirm }: SyncModalProps) {
  const [modules, setModules] = useState<ModuleSelection[]>([]);
  const [syncFiles, setSyncFiles] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready to scan Canvas modules.");
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const requestIdRef = useRef(0);
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const selectedCount = useMemo(() => modules.filter((module) => module.selected).length, [modules]);
  const visibleModules = useMemo(() => {
    const matchingModules = deferredSearchQuery
      ? modules.filter((module) => {
          const haystack = `${module.code} ${module.title}`.toLowerCase();
          return haystack.includes(deferredSearchQuery);
        })
      : modules;

    return [...matchingModules].sort((left, right) => {
      if (left.selected !== right.selected) {
        return left.selected ? -1 : 1;
      }

      return left.code.localeCompare(right.code, "en");
    });
  }, [deferredSearchQuery, modules]);
  const visibleModuleIds = useMemo(() => new Set(visibleModules.map((module) => module.id)), [visibleModules]);

  useBodyScrollLock(isOpen && mounted);
  useEscapeToClose(isOpen, onClose);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchModules = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setLoading(true);
    setError(null);
    setStatus("Discovering modules from Canvas…");

    try {
      const discoveryResponse = await fetch("/api/sync", {
        method: "GET",
        cache: "no-store",
      });

      await readSyncStream(discoveryResponse, (event: SyncEvent) => {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setStatus(event.message);
        if (event.status === "error") {
          throw new Error(event.message);
        }
      });

      const moduleResponse = await fetch("/api/modules/list", { cache: "no-store" });
      const payload = (await moduleResponse.json()) as {
        modules?: Array<{ id: string; code: string; title: string; sync_enabled?: boolean }>;
        error?: string;
      };

      if (!moduleResponse.ok) {
        throw new Error(payload.error || "Failed to load modules.");
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      setModules(
        (payload.modules ?? []).map((module) => ({
          id: module.id,
          code: module.code,
          title: module.title,
          selected: module.sync_enabled ?? true,
        })),
      );
      setStatus(`Discovery complete. Found ${(payload.modules ?? []).length} modules.`);
    } catch (fetchError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      setError(fetchError instanceof Error ? fetchError.message : "Failed to discover modules.");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      requestIdRef.current += 1;
      setSearchQuery("");
      return;
    }

    setSearchQuery("");
    void fetchModules();
  }, [fetchModules, isOpen]);

  if (!isOpen || !mounted) {
    return null;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[600] bg-slate-900/50 p-4 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex h-full items-center justify-center">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sync-modal-title"
          aria-describedby="sync-modal-description"
          className="flex h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-2xl sm:h-[calc(100vh-3rem)] sm:max-h-[48rem]"
        >
          <div className="shrink-0 border-b border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="sync-modal-title" className="font-serif text-2xl font-semibold text-slate-900">
                  Sync Canvas
                </h3>
                <p id="sync-modal-description" className="mt-2 text-sm text-slate-500">
                  Choose which modules to sync and whether to parse files for AI search.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-500"
              >
                Close
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {error ? <span className="text-rose-600">{error}</span> : status}
            </div>

            <div className="mt-5 flex flex-col gap-3">
              <label className="block">
                <span className="sr-only">Filter modules</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Filter by module code or title"
                  className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm text-slate-700 outline-none transition focus:border-blue-400"
                />
              </label>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-slate-500">
                  {selectedCount} selected of {modules.length}
                  {deferredSearchQuery ? ` · ${visibleModules.length} visible` : ""}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setModules((current) =>
                        current.map((module) => (visibleModuleIds.has(module.id) ? { ...module, selected: true } : module)),
                      )
                    }
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                  >
                    {deferredSearchQuery ? "Select visible" : "Select all"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setModules((current) =>
                        current.map((module) => (visibleModuleIds.has(module.id) ? { ...module, selected: false } : module)),
                      )
                    }
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
                  >
                    {deferredSearchQuery ? "Clear visible" : "Select none"}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 px-5 py-5 sm:px-6">
            <div className="h-full min-h-[240px] space-y-2 overflow-y-auto pr-2" aria-busy={loading ? "true" : undefined}>
              {loading ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-400">
                  Discovering modules…
                </div>
              ) : modules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-400">
                  No modules found yet.
                </div>
              ) : visibleModules.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-slate-400">
                  No modules match that filter.
                </div>
              ) : (
                visibleModules.map((module) => (
                  <button
                    key={module.id}
                    type="button"
                    aria-pressed={module.selected}
                    onClick={() =>
                      setModules((current) =>
                        current.map((entry) => (entry.id === module.id ? { ...entry, selected: !entry.selected } : entry)),
                      )
                    }
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      module.selected
                        ? "border-blue-200 bg-blue-50"
                        : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    <div className="pr-4">
                      <div className="text-xs font-bold tracking-[0.18em] text-blue-700">{module.code}</div>
                      <div className="mt-1 text-sm font-medium text-slate-800">{module.title}</div>
                    </div>
                    <div
                      className={`h-5 w-5 shrink-0 rounded-full border ${
                        module.selected ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"
                      }`}
                    />
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-100 px-5 py-5 sm:px-6">
            <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div>
                <div className="text-sm font-semibold text-slate-900">Parse file contents</div>
                <div className="text-xs text-slate-500">
                  Enable PDF/text extraction for summaries, retrieval, and citations.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSyncFiles((current) => !current)}
                aria-pressed={syncFiles}
                className={`relative h-7 w-14 shrink-0 rounded-full transition-colors ${syncFiles ? "bg-blue-600" : "bg-slate-300"}`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${syncFiles ? "left-8" : "left-1"}`}
                />
              </button>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || selectedCount === 0}
                onClick={() =>
                  onConfirm({
                    selectedModuleIds: modules.filter((module) => module.selected).map((module) => module.id),
                    syncFiles,
                  })
                }
                className="flex-[2] rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-200 disabled:opacity-50"
              >
                Start sync
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
