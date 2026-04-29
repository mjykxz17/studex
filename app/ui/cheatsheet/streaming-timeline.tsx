// app/ui/cheatsheet/streaming-timeline.tsx
"use client";

import type { StreamEvent } from "@/lib/cheatsheet/types";

const stageLabel: Record<string, string> = {
  ingest: "Parsing files",
  "detect-gaps": "Identifying gaps",
  "web-search": "Searching the web",
  synthesize: "Writing cheatsheet",
};

export function StreamingTimeline({
  events,
  finished,
}: {
  events: StreamEvent[];
  finished: boolean;
}) {
  return (
    <ol className="space-y-2 font-mono text-sm">
      {events.map((ev, i) => {
        if (ev.type === "stage-start") {
          return (
            <li key={i} className="text-gray-800">
              ▶ <span className="font-semibold">{stageLabel[ev.stage] ?? ev.stage}</span> — {ev.message}
            </li>
          );
        }
        if (ev.type === "stage-complete") {
          return (
            <li key={i} className="text-green-700">
              ✓ {stageLabel[ev.stage] ?? ev.stage} done{ev.data ? ` (${JSON.stringify(ev.data)})` : ""}
            </li>
          );
        }
        if (ev.type === "stage-progress") {
          return (
            <li key={i} className="text-gray-600 pl-4">
              · {ev.message}
            </li>
          );
        }
        if (ev.type === "warning") {
          return (
            <li key={i} className="text-amber-700">
              ⚠ {ev.message}
            </li>
          );
        }
        if (ev.type === "failed") {
          return (
            <li key={i} className="text-red-700 font-semibold">
              ✗ Failed: {ev.reason}
            </li>
          );
        }
        if (ev.type === "complete") {
          return (
            <li key={i} className="text-green-700 font-semibold">
              ✓ Complete
            </li>
          );
        }
        return null;
      })}
      {finished && !events.some((ev) => ev.type === "complete") ? (
        <li className="pt-2 text-gray-500">— done —</li>
      ) : null}
    </ol>
  );
}
