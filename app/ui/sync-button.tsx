"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

type SyncResponse = {
  ok: boolean;
  error?: string;
  syncedAt?: string;
  itemsProcessed?: number;
};

function formatLastSynced(value: string | null) {
  if (!value) {
    return "Never synced";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Last sync time unavailable";
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
  const [error, setError] = useState<string | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const helperText = useMemo(
    () => statusText ?? formatLastSynced(initialLastSyncedAt),
    [initialLastSyncedAt, statusText],
  );

  async function handleSync() {
    setIsSyncing(true);
    setError(null);
    setStatusText("Syncing Canvas data…");

    try {
      const response = await fetch("/api/sync", {
        method: "GET",
        cache: "no-store",
      });

      const payload = (await response.json()) as SyncResponse;

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Sync failed.");
      }

      setStatusText(
        payload.itemsProcessed
          ? `Sync finished · ${payload.itemsProcessed} items processed`
          : "Sync finished",
      );
      router.refresh();
    } catch (syncError) {
      const message = syncError instanceof Error ? syncError.message : "Sync failed.";
      setError(message);
      setStatusText(null);
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleSync}
        disabled={isSyncing}
        className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 disabled:cursor-wait disabled:opacity-70"
      >
        {isSyncing ? "Syncing…" : "Sync now"}
      </button>
      <p className={`text-right text-xs ${error ? "text-rose-600" : "text-slate-500"}`}>
        {error ?? helperText}
      </p>
    </div>
  );
}
