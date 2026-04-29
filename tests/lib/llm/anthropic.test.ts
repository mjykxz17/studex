import { describe, expect, it, beforeEach, vi } from "vitest";

// The Anthropic SDK throws when instantiated in a browser-like environment (jsdom).
// Mock the SDK so unit tests can verify factory behaviour without a real HTTP client.
vi.mock("@anthropic-ai/sdk", () => {
  const FakeAnthropic = vi.fn().mockImplementation(({ apiKey }: { apiKey: string }) => ({
    apiKey,
    messages: {},
  }));
  return { default: FakeAnthropic };
});

describe("lib/llm/anthropic", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns a configured client when ANTHROPIC_API_KEY is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-123");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic");
    const client = getAnthropicClient();
    expect(client).toBeDefined();
    expect(typeof (client as { messages?: unknown }).messages).toBe("object");
  });

  it("throws a clear error when ANTHROPIC_API_KEY is missing", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    const { getAnthropicClient } = await import("@/lib/llm/anthropic");
    expect(() => getAnthropicClient()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("exports HAIKU_MODEL and SONNET_MODEL constants", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test-123");
    const mod = await import("@/lib/llm/anthropic");
    expect(typeof mod.HAIKU_MODEL).toBe("string");
    expect(typeof mod.SONNET_MODEL).toBe("string");
    expect(mod.HAIKU_MODEL).toMatch(/haiku/i);
    expect(mod.SONNET_MODEL).toMatch(/sonnet/i);
  });
});
