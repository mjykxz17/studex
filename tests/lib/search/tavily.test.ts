import { afterEach, describe, expect, it, vi } from "vitest";

import { tavilySearch } from "@/lib/search/tavily";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("lib/search/tavily", () => {
  it("posts to Tavily and returns mapped snippets", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            { url: "https://a.com", title: "A", content: "snippet a" },
            { url: "https://b.com", title: "B", content: "snippet b" },
          ],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const out = await tavilySearch("what is dijkstra", { maxResults: 2 });

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string)).toMatchObject({
      query: "what is dijkstra",
      max_results: 2,
      api_key: "tvly-test",
    });
    expect(out).toEqual([
      { url: "https://a.com", title: "A", snippet: "snippet a" },
      { url: "https://b.com", title: "B", snippet: "snippet b" },
    ]);
  });

  it("throws on non-2xx response", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("err", { status: 500 })));
    await expect(tavilySearch("q")).rejects.toThrow(/Tavily/);
  });

  it("returns empty array when Tavily returns no results field", async () => {
    vi.stubEnv("TAVILY_API_KEY", "tvly-test");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    ));
    expect(await tavilySearch("q")).toEqual([]);
  });
});
