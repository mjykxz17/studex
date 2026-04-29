import { afterEach, describe, expect, it, vi } from "vitest";

import { searchGaps } from "@/lib/cheatsheet/search";
import type { GapConcept } from "@/lib/cheatsheet/types";

afterEach(() => vi.restoreAllMocks());

const gaps: GapConcept[] = [
  { concept: "Dijkstra's algorithm", why_unclear: "x" },
  { concept: "O(log n)", why_unclear: "y" },
];

describe("searchGaps", () => {
  it("runs searches in parallel and maps results", async () => {
    const search = vi.fn(async (q: string) => [
      { url: `https://${q}.com`, title: q, snippet: `about ${q}` },
    ]);
    const incrementUsage = vi.fn(async () => ({ allowed: true, remaining: 49 }));

    const out = await searchGaps({ gaps, userId: "u1", search, incrementUsage });
    expect(search).toHaveBeenCalledTimes(2);
    expect(out.results).toHaveLength(2);
    expect(out.results[0].failed).toBe(false);
    expect(out.results[0].snippets[0].url).toMatch(/dijkstra|algorithm/i);
    expect(out.degraded).toBe(false);
  });

  it("skips all searches when daily cap is exceeded", async () => {
    const search = vi.fn();
    const incrementUsage = vi.fn(async () => ({ allowed: false, remaining: 0 }));

    const out = await searchGaps({ gaps, userId: "u1", search, incrementUsage });
    expect(search).not.toHaveBeenCalled();
    expect(out.results).toEqual([]);
    expect(out.degraded).toBe(true);
    expect(out.reason).toMatch(/cap|quota/i);
  });

  it("marks individual failures without aborting others", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("upstream 500"))
      .mockResolvedValueOnce([{ url: "https://b.com", title: "B", snippet: "ok" }]);
    const incrementUsage = vi.fn(async () => ({ allowed: true, remaining: 50 }));

    const out = await searchGaps({ gaps, userId: "u1", search, incrementUsage });
    expect(out.results).toHaveLength(2);
    expect(out.results[0].failed).toBe(true);
    expect(out.results[1].failed).toBe(false);
    expect(out.degraded).toBe(false);
  });

  it("returns empty results without calling search when gaps is empty", async () => {
    const search = vi.fn();
    const incrementUsage = vi.fn();
    const out = await searchGaps({ gaps: [], userId: "u1", search, incrementUsage });
    expect(out.results).toEqual([]);
    expect(out.degraded).toBe(false);
    expect(search).not.toHaveBeenCalled();
    expect(incrementUsage).not.toHaveBeenCalled();
  });
});
