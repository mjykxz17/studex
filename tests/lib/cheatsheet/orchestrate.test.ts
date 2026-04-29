import { describe, expect, it, vi } from "vitest";

import { runOrchestrator } from "@/lib/cheatsheet/orchestrate";
import type { StreamEvent } from "@/lib/cheatsheet/types";

describe("runOrchestrator (happy path)", () => {
  it("emits stage events in order and resolves with status complete", async () => {
    const events: StreamEvent[] = [];
    const result = await runOrchestrator({
      cheatsheetId: "cs-1",
      userId: "u1",
      sourceFileIds: ["f1"],
      anthropic: {} as never,
      emit: (e) => events.push(e),
      pipeline: {
        ingest: async () => [{ id: "f1", name: "a.pdf", markdown: "alpha" }],
        detectGaps: async () => ({
          gaps: [{ concept: "alpha", why_unclear: "x" }],
          tokensIn: 1,
          tokensOut: 1,
          degraded: false,
        }),
        searchGaps: async () => ({
          results: [
            {
              gap: { concept: "alpha", why_unclear: "x" },
              snippets: [{ url: "https://a.com", title: "A", snippet: "s" }],
              failed: false,
            },
          ],
          degraded: false,
        }),
        synthesize: async ({ onChunk }) => {
          onChunk?.("# Result\n");
          return {
            markdown: "# Result\n",
            citations: [{ n: 1, url: "https://a.com", title: "A", snippet: "s", gap_concept: "alpha" }],
            tokensIn: 5,
            tokensOut: 2,
          };
        },
        persist: vi.fn().mockResolvedValue(undefined),
        recordRun: vi.fn().mockResolvedValue(undefined),
      },
    });

    expect(result.status).toBe("complete");
    const stages = events
      .filter((e) => e.type === "stage-start")
      .map((e) => (e as { stage: string }).stage);
    expect(stages).toEqual(["ingest", "detect-gaps", "web-search", "synthesize"]);
    expect(events.some((e) => e.type === "complete")).toBe(true);
    expect(events.some((e) => e.type === "markdown-chunk")).toBe(true);
  });
});

describe("runOrchestrator (degraded paths)", () => {
  it("emits a warning and synthesizes source-only when search is capped", async () => {
    const events: StreamEvent[] = [];
    const synthesize = vi.fn().mockResolvedValue({
      markdown: "ok",
      citations: [],
      tokensIn: 1,
      tokensOut: 1,
    });
    const result = await runOrchestrator({
      cheatsheetId: "cs-2",
      userId: "u1",
      sourceFileIds: ["f1"],
      anthropic: {} as never,
      emit: (e) => events.push(e),
      pipeline: {
        ingest: async () => [{ id: "f1", name: "a.pdf", markdown: "x" }],
        detectGaps: async () => ({
          gaps: [{ concept: "z", why_unclear: "" }],
          tokensIn: 1,
          tokensOut: 1,
          degraded: false,
        }),
        searchGaps: async () => ({
          results: [],
          degraded: true,
          reason: "Daily search quota reached",
        }),
        synthesize,
        persist: vi.fn().mockResolvedValue(undefined),
        recordRun: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(result.status).toBe("complete");
    expect(events.some((e) => e.type === "warning")).toBe(true);
    expect(synthesize).toHaveBeenCalled();
  });

  it("fails the run when synthesis throws", async () => {
    const events: StreamEvent[] = [];
    const persist = vi.fn().mockResolvedValue(undefined);
    const recordRun = vi.fn().mockResolvedValue(undefined);
    const result = await runOrchestrator({
      cheatsheetId: "cs-3",
      userId: "u1",
      sourceFileIds: ["f1"],
      anthropic: {} as never,
      emit: (e) => events.push(e),
      pipeline: {
        ingest: async () => [{ id: "f1", name: "a.pdf", markdown: "x" }],
        detectGaps: async () => ({ gaps: [], tokensIn: 0, tokensOut: 0, degraded: false }),
        searchGaps: async () => ({ results: [], degraded: false }),
        synthesize: async () => {
          throw new Error("rate-limited");
        },
        persist,
        recordRun,
      },
    });
    expect(result.status).toBe("failed");
    expect(events.some((e) => e.type === "failed")).toBe(true);
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed", failureReason: "rate-limited" }),
    );
    expect(recordRun).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "synthesize", error: "rate-limited" }),
    );
  });

  it("fails fast when ingest produces no usable files", async () => {
    const events: StreamEvent[] = [];
    const result = await runOrchestrator({
      cheatsheetId: "cs-4",
      userId: "u1",
      sourceFileIds: ["f1", "f2"],
      anthropic: {} as never,
      emit: (e) => events.push(e),
      pipeline: {
        ingest: async () => [
          { id: "f1", name: "a.pdf", markdown: "", skipped: { reason: "scanned" } },
          { id: "f2", name: "b.pdf", markdown: "", skipped: { reason: "no canvas_file_id" } },
        ],
        detectGaps: vi.fn(),
        searchGaps: vi.fn(),
        synthesize: vi.fn(),
        persist: vi.fn().mockResolvedValue(undefined),
        recordRun: vi.fn().mockResolvedValue(undefined),
      },
    });
    expect(result.status).toBe("failed");
    expect(events.some((e) => e.type === "failed")).toBe(true);
  });
});
