"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import type { SyncEvent } from "@/lib/contracts";

import { SyncModal, type SyncConfig } from "./sync-modal";
import { readSyncStream } from "./sync-stream";

function formatLastSynced(value: string | null) {
  if (!value) {
    return "Never synced";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Last sync unavailable";
  }

  return `Last sync ${new Intl.DateTimeFormat("en-SG", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date)}`;
}

export function SyncButton({ initialLastSyncedAt }: { initialLastSyncedAt: string | null }) {
  const router = useRouter();
  const [isSyncing, setIsSyncing] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const lastSyncedAtRef = useRef(initialLastSyncedAt);

  useEffect(() => {
    if (!isSyncing && lastSyncedAtRef.current !== initialLastSyncedAt) {
      setStatusText(null);
      setError(null);
    }

    lastSyncedAtRef.current = initialLastSyncedAt;
  }, [initialLastSyncedAt, isSyncing]);

  const helperText = useMemo(
    () => statusText ?? formatLastSynced(initialLastSyncedAt),
    [initialLastSyncedAt, statusText],
  );

  async function handleConfirmSync(config: SyncConfig) {
    setIsModalOpen(false);
    setIsSyncing(true);
    setError(null);
    setStatusText("Preparing sync…");

    try {
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      await readSyncStream(response, (event: SyncEvent) => {
        setStatusText(event.message);

        if (event.status === "complete") {
          setStatusText("Sync complete. Refreshing workspace…");
          router.refresh();
        }

        if (event.status === "error") {
          throw new Error(event.message);
        }
      });
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          disabled={isSyncing}
          className="w-full rounded-2xl border border-blue-600 bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-100 transition hover:bg-blue-700 disabled:opacity-70 sm:w-auto"
        >
          {isSyncing ? "Syncing…" : "Sync Canvas"}
        </button>
        <p className={`text-left text-[11px] font-medium sm:text-right ${error ? "text-rose-600" : "text-slate-500"}`}>
          {error ?? helperText}
        </p>
      </div>

      <SyncModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onConfirm={handleConfirmSync} />
    </>
  );
}
