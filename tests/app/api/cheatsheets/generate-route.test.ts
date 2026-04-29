import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: async () => ({ id: "u1" }),
}));

const getAnthropicClientMock = vi.fn(() => ({}) as never);
vi.mock("@/lib/llm/anthropic", () => ({
  getAnthropicClient: () => getAnthropicClientMock(),
  HAIKU_MODEL: "h",
  SONNET_MODEL: "s",
}));

const supabaseMock = {
  from: vi.fn(() => ({
    insert: vi.fn(() => ({
      select: vi.fn(() => ({
        single: async () => ({ data: { id: "cs-new" }, error: null }),
      })),
    })),
    update: vi.fn(() => ({
      eq: async () => ({ data: null, error: null }),
    })),
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        maybeSingle: async () => ({ data: { code: "CS2030" }, error: null }),
      })),
    })),
  })),
};

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => supabaseMock,
}));

vi.mock("@/lib/cheatsheet/orchestrate", () => ({
  runOrchestrator: vi.fn(async ({ emit }: { emit: (e: unknown) => void }) => {
    emit({ type: "stage-start", stage: "ingest", message: "x" });
    emit({ type: "complete", cheatsheet_id: "cs-new" });
    return { status: "complete" };
  }),
}));

import { POST } from "@/app/api/cheatsheets/generate/route";

describe("POST /api/cheatsheets/generate", () => {
  it("400s when source_file_ids is empty", async () => {
    const req = new Request("http://localhost/api/cheatsheets/generate", {
      method: "POST",
      body: JSON.stringify({ course_id: "c1", source_file_ids: [] }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400s when course_id is missing", async () => {
    const req = new Request("http://localhost/api/cheatsheets/generate", {
      method: "POST",
      body: JSON.stringify({ source_file_ids: ["f1"] }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("400s when body is not JSON", async () => {
    const req = new Request("http://localhost/api/cheatsheets/generate", {
      method: "POST",
      body: "not json",
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns SSE stream with stage events on happy path", async () => {
    const req = new Request("http://localhost/api/cheatsheets/generate", {
      method: "POST",
      body: JSON.stringify({ course_id: "c1", source_file_ids: ["f1"], title: "T" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/event-stream/);
    expect(res.headers.get("x-cheatsheet-id")).toBe("cs-new");
    const text = await res.text();
    expect(text).toContain("stage-start");
    expect(text).toContain("complete");
  });

  it("400s when Anthropic key is missing (no orphaned row)", async () => {
    getAnthropicClientMock.mockImplementationOnce(() => {
      throw new Error("Missing required environment variable: ANTHROPIC_API_KEY");
    });
    const req = new Request("http://localhost/api/cheatsheets/generate", {
      method: "POST",
      body: JSON.stringify({ course_id: "c1", source_file_ids: ["f1"] }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/ANTHROPIC_API_KEY/);
  });
});
