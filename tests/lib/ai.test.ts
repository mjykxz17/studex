import { buildFallbackBulletSummary, getProvider, parseJsonResponse } from "@/lib/ai";

describe("lib/ai", () => {
  it("parses plain JSON and fenced JSON", () => {
    expect(parseJsonResponse<{ ok: boolean }>('{"ok":true}')).toEqual({ ok: true });
    expect(parseJsonResponse<{ ok: boolean }>("```json\n{\"ok\":true}\n```")).toEqual({ ok: true });
  });

  it("resolves providers from model names", () => {
    expect(getProvider("gpt-4o-mini")).toBe("openai");
    expect(getProvider("claude-haiku-4-5")).toBe("anthropic");
  });

  it("builds deterministic fallback bullet summaries", () => {
    const summary = buildFallbackBulletSummary("First sentence. Second sentence! Third sentence?");
    expect(summary).toContain("- First sentence.");
    expect(summary?.split("\n")).toHaveLength(3);
  });
});
