// app/cheatsheets/[id]/generating/page.tsx
"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { StreamingTimeline } from "@/app/ui/cheatsheet/streaming-timeline";
import { parseSseChunks } from "@/lib/cheatsheet/sse";
import type { StreamEvent } from "@/lib/cheatsheet/types";

export default function GeneratingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [finished, setFinished] = useState(false);
  const router = useRouter();

  // Poll the cheatsheet row as a fallback (e.g. on hard reload, the in-flight
  // SSE stream from GenerateModal is gone — only the row state remains).
  useEffect(() => {
    let cancelled = false;
    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/cheatsheets/${id}`);
        if (!res.ok) return;
        const body = await res.json();
        const status = body?.cheatsheet?.status as string | undefined;
        if (status === "complete") {
          clearInterval(pollTimer);
          if (!cancelled) router.replace(`/cheatsheets/${id}`);
        } else if (status === "failed") {
          clearInterval(pollTimer);
          if (!cancelled) {
            setEvents((es) => [
              ...es,
              { type: "failed", reason: body?.cheatsheet?.failure_reason ?? "Unknown error" },
            ]);
            setFinished(true);
          }
        }
      } catch {
        // network blip; the next tick will retry
      }
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(pollTimer);
    };
  }, [id, router]);

  // Subscribe to a window-level event that GenerateModal posts when it
  // already has a live SSE stream from the same click.
  useEffect(() => {
    function onChunk(e: Event) {
      const detail = (e as CustomEvent<{ id: string; raw: string }>).detail;
      if (detail.id !== id) return;
      const parsed = parseSseChunks(detail.raw);
      if (parsed.length === 0) return;
      setEvents((es) => [...es, ...parsed]);
      const last = parsed[parsed.length - 1];
      if (last.type === "complete") {
        setFinished(true);
        setTimeout(() => router.replace(`/cheatsheets/${id}`), 800);
      } else if (last.type === "failed") {
        setFinished(true);
      }
    }
    window.addEventListener("cheatsheet-sse-chunk", onChunk as EventListener);
    return () => window.removeEventListener("cheatsheet-sse-chunk", onChunk as EventListener);
  }, [id, router]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Generating cheatsheet…</h1>
      <p className="mt-1 text-sm text-gray-500">id: {id}</p>
      <div className="mt-6">
        <StreamingTimeline events={events} finished={finished} />
      </div>
    </main>
  );
}
