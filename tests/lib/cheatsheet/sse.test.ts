import { describe, expect, it } from "vitest";

import { encodeSseEvent, parseSseChunks } from "@/lib/cheatsheet/sse";
import type { StreamEvent } from "@/lib/cheatsheet/types";

describe("encodeSseEvent", () => {
  it("formats an event as data: <json>\\n\\n", () => {
    const ev: StreamEvent = { type: "stage-start", stage: "ingest", message: "Parsing 2 files" };
    expect(encodeSseEvent(ev)).toBe(`data: ${JSON.stringify(ev)}\n\n`);
  });
});

describe("parseSseChunks", () => {
  it("decodes a sequence of events from concatenated chunks", () => {
    const ev1: StreamEvent = { type: "stage-start", stage: "ingest", message: "A" };
    const ev2: StreamEvent = { type: "complete", cheatsheet_id: "cs-1" };
    const buffer = `data: ${JSON.stringify(ev1)}\n\ndata: ${JSON.stringify(ev2)}\n\n`;
    expect(parseSseChunks(buffer)).toEqual([ev1, ev2]);
  });

  it("ignores partial trailing fragments without a terminator", () => {
    const buffer = `data: {"type":"stage-start","stage":"ingest","message":"x"}\n\ndata: {"type":"stage-`;
    expect(parseSseChunks(buffer)).toEqual([
      { type: "stage-start", stage: "ingest", message: "x" },
    ]);
  });

  it("returns empty array for an empty buffer", () => {
    expect(parseSseChunks("")).toEqual([]);
  });

  it("ignores malformed JSON without throwing", () => {
    const buffer = `data: not json\n\ndata: ${JSON.stringify({ type: "complete", cheatsheet_id: "cs-9" } satisfies StreamEvent)}\n\n`;
    expect(parseSseChunks(buffer)).toEqual([{ type: "complete", cheatsheet_id: "cs-9" }]);
  });
});
