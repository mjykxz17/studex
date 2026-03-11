"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { SyncModal, type SyncConfig } from "./sync-modal";

type SyncProgress = {
  status: string;
  message: string;
  count?: number;
  syncedAt?: string;
};

function formatLastSynced(value: string | null) {
  if (!value) return "Never synced";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Last sync time unavailable";
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

  const helperText = useMemo(
    () => statusText ?? formatLastSynced(initialLastSyncedAt),
    [initialLastSyncedAt, statusText],
  );

  async function handleConfirmSync(config: SyncConfig) {
    setIsModalOpen(false);
    setIsSyncing(true);
    setError(null);
    setStatusText("Preparing ingestion pipeline...");

    try {
      // We'll pass the config via POST now to the sync API
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const textDecoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = textDecoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6)) as SyncProgress;
              setStatusText(data.message);
              if (data.status === "complete") {
                router.refresh();
              }
            } catch {
                // Ignore partial JSON chunks
              }
          }
        }
      }
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
          {isSyncing ? "Syncing..." : "Sync Canvas"}
        </button>
        <p className={`text-left text-[10px] font-medium sm:text-right ${error ? "text-rose-600" : "text-slate-500"}`}>
          {error ?? helperText}
        </p>
      </div>

      <SyncModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onConfirm={handleConfirmSync}
      />
    </>
  );
}
