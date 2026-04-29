// lib/cheatsheet/sse.ts
import type { StreamEvent } from "@/lib/cheatsheet/types";

export function encodeSseEvent(event: StreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function parseSseChunks(buffer: string): StreamEvent[] {
  const events: StreamEvent[] = [];
  const parts = buffer.split("\n\n");
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i].trim();
    if (!part.startsWith("data:")) continue;
    const json = part.slice("data:".length).trim();
    if (!json) continue;
    try {
      events.push(JSON.parse(json) as StreamEvent);
    } catch {
      // ignore malformed; pipeline never emits these
    }
  }
  return events;
}
