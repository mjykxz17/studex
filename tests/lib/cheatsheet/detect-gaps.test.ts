import { afterEach, describe, expect, it, vi } from "vitest";

import { detectGaps } from "@/lib/cheatsheet/detect-gaps";

afterEach(() => vi.restoreAllMocks());

describe("detectGaps", () => {
  it("returns parsed gaps from Haiku JSON output", async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                gaps: [
                  { concept: "Dijkstra", why_unclear: "name dropped without definition" },
                ],
              }),
            },
          ],
          usage: { input_tokens: 100, output_tokens: 30 },
        }),
      },
    };
    const out = await detectGaps({
      sourceMarkdown: "use dijkstra here",
      client: fakeClient as never,
    });
    expect(out.gaps).toHaveLength(1);
    expect(out.gaps[0].concept).toBe("Dijkstra");
    expect(out.tokensIn).toBe(100);
    expect(out.tokensOut).toBe(30);
    expect(out.degraded).toBe(false);
  });

  it("strips markdown code fences if Haiku adds them", async () => {
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: "```json\n" + JSON.stringify({ gaps: [{ concept: "X", why_unclear: "y" }] }) + "\n```",
            },
          ],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    };
    const out = await detectGaps({ sourceMarkdown: "x", client: fakeClient as never });
    expect(out.gaps).toEqual([{ concept: "X", why_unclear: "y" }]);
  });

  it("falls back to empty gaps with degraded=true on malformed JSON after one retry", async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "not json" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      })
      .mockResolvedValueOnce({
        content: [{ type: "text", text: "still not json" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    const fakeClient = { messages: { create } };
    const out = await detectGaps({ sourceMarkdown: "x", client: fakeClient as never });
    expect(out.gaps).toEqual([]);
    expect(out.degraded).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("caps gaps at 8 even if model returns more", async () => {
    const lots = Array.from({ length: 20 }, (_, i) => ({
      concept: `c${i}`,
      why_unclear: `w${i}`,
    }));
    const fakeClient = {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: JSON.stringify({ gaps: lots }) }],
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      },
    };
    const out = await detectGaps({ sourceMarkdown: "x", client: fakeClient as never });
    expect(out.gaps).toHaveLength(8);
    expect(out.gaps[0].concept).toBe("c0");
  });
});
