import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { getAssignmentsWithSubmissions } from "@/lib/canvas";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.stubEnv("CANVAS_TOKEN", "test-token");
  vi.stubEnv("CANVAS_BASE_URL", "https://canvas.test");
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
});

function jsonResponse(body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

describe("getAssignmentsWithSubmissions", () => {
  it("fetches /courses/:id/assignments with include[]=submission and returns the parsed array", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        {
          id: 42,
          name: "Assignment 1",
          due_at: "2026-05-01T00:00:00Z",
          submission: {
            id: 999,
            score: 85,
            grade: "85",
            submitted_at: "2026-04-30T22:00:00Z",
            graded_at: "2026-05-02T09:00:00Z",
            workflow_state: "graded",
          },
        },
      ]);
    }) as unknown as typeof fetch;

    const result = await getAssignmentsWithSubmissions(7);

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("/api/v1/courses/7/assignments");
    expect(capturedCalls[0]).toContain("include%5B%5D=submission");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(42);
    expect(result[0].submission?.score).toBe(85);
    expect(result[0].submission?.workflow_state).toBe("graded");
  });
});
