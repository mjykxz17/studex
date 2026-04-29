import { describe, expect, it, vi } from "vitest";

import { synthesizeCheatsheet } from "@/lib/cheatsheet/synthesize";
import type { IngestedFile, SearchResult } from "@/lib/cheatsheet/types";

describe("synthesizeCheatsheet", () => {
  it("streams chunks and returns final markdown + citations", async () => {
    async function* fakeStream() {
      yield { type: "message_start", message: { usage: { input_tokens: 200, output_tokens: 0 } } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "# Streams\n" } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "See [1]." } };
      yield {
        type: "message_delta",
        usage: { output_tokens: 50 },
      };
    }
    const fakeClient = {
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: () => fakeStream(),
        }),
      },
    };

    const files: IngestedFile[] = [{ id: "f1", name: "lecture.pdf", markdown: "Streams are..." }];
    const search: SearchResult[] = [
      {
        gap: { concept: "Stream", why_unclear: "" },
        snippets: [{ url: "https://oracle.com/streams", title: "Streams", snippet: "..." }],
        failed: false,
      },
    ];

    const chunks: string[] = [];
    const out = await synthesizeCheatsheet({
      files,
      searchResults: search,
      client: fakeClient as never,
      onChunk: (c) => chunks.push(c),
    });

    expect(chunks.join("")).toContain("# Streams");
    expect(out.markdown).toContain("See [1].");
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0]).toMatchObject({
      n: 1,
      url: "https://oracle.com/streams",
      title: "Streams",
      gap_concept: "Stream",
    });
    expect(out.tokensIn).toBe(200);
    expect(out.tokensOut).toBe(50);
  });

  it("excludes failed search results from citations", async () => {
    async function* fakeStream() {
      yield { type: "message_start", message: { usage: { input_tokens: 1, output_tokens: 0 } } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "ok" } };
      yield { type: "message_delta", usage: { output_tokens: 1 } };
    }
    const fakeClient = {
      messages: {
        stream: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: () => fakeStream(),
        }),
      },
    };

    const files: IngestedFile[] = [{ id: "f1", name: "x.pdf", markdown: "x" }];
    const search: SearchResult[] = [
      {
        gap: { concept: "A", why_unclear: "" },
        snippets: [{ url: "https://a.com", title: "A", snippet: "s" }],
        failed: false,
      },
      {
        gap: { concept: "B", why_unclear: "" },
        snippets: [{ url: "https://b.com", title: "B", snippet: "s" }],
        failed: true,
      },
    ];

    const out = await synthesizeCheatsheet({
      files,
      searchResults: search,
      client: fakeClient as never,
    });
    expect(out.citations).toHaveLength(1);
    expect(out.citations[0].n).toBe(1);
    expect(out.citations[0].url).toBe("https://a.com");
  });

  it("skips ingested files marked as skipped", async () => {
    async function* fakeStream() {
      yield { type: "message_start", message: { usage: { input_tokens: 1, output_tokens: 0 } } };
      yield { type: "content_block_delta", delta: { type: "text_delta", text: "x" } };
      yield { type: "message_delta", usage: { output_tokens: 1 } };
    }
    const stream = vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: () => fakeStream(),
    });
    const fakeClient = { messages: { stream } };

    const files: IngestedFile[] = [
      { id: "f1", name: "good.pdf", markdown: "USABLE_TEXT" },
      { id: "f2", name: "bad.pdf", markdown: "", skipped: { reason: "scanned" } },
    ];

    await synthesizeCheatsheet({
      files,
      searchResults: [],
      client: fakeClient as never,
    });
    expect(stream).toHaveBeenCalledTimes(1);
    const callArgs = stream.mock.calls[0][0];
    const userMsg = callArgs.messages[0].content as string;
    expect(userMsg).toContain("USABLE_TEXT");
    expect(userMsg).not.toContain("scanned");
  });
});
