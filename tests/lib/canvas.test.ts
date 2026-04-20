import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { getAssignmentsWithSubmissions, getPages, getPage, getModules, getModuleItems } from "@/lib/canvas";

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

describe("getPages", () => {
  it("fetches /courses/:id/pages (list only, no body)", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        { page_id: 1, url: "syllabus", title: "Syllabus", updated_at: "2026-03-01T00:00:00Z", published: true, front_page: true },
        { page_id: 2, url: "project-brief", title: "Project Brief", updated_at: "2026-04-10T00:00:00Z", published: true, front_page: false },
      ]);
    }) as unknown as typeof fetch;

    const result = await getPages(11);

    expect(capturedCalls).toHaveLength(1);
    expect(capturedCalls[0]).toContain("/api/v1/courses/11/pages");
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe("syllabus");
    expect(result[0].front_page).toBe(true);
  });
});

describe("getPage", () => {
  it("fetches /courses/:id/pages/:url and returns the full page including body", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        page_id: 1,
        url: "syllabus",
        title: "Syllabus",
        body: "<p>Welcome to CS3235.</p>",
        updated_at: "2026-03-01T00:00:00Z",
        published: true,
        front_page: true,
      }),
    ) as unknown as typeof fetch;

    const result = await getPage(11, "syllabus");

    expect(result).not.toBeNull();
    expect(result?.body).toContain("CS3235");
    expect(result?.url).toBe("syllabus");
  });
});

describe("getModules", () => {
  it("requests /courses/:id/modules with include=items and include=content_details", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        {
          id: 101,
          name: "Week 1",
          position: 1,
          unlock_at: null,
          state: "unlocked",
          items_count: 3,
          items: [
            { id: 201, title: "Lecture 1 Slides", type: "File", position: 1, indent: 0, content_id: 301 },
            { id: 202, title: "Week 1 Reading", type: "Page", position: 2, indent: 0, page_url: "week-1-reading" },
            { id: 203, title: "External link", type: "ExternalUrl", position: 3, indent: 0, external_url: "https://example.com" },
          ],
        },
      ]);
    }) as unknown as typeof fetch;

    const result = await getModules(12);

    expect(capturedCalls[0]).toContain("/api/v1/courses/12/modules");
    expect(capturedCalls[0]).toContain("include%5B%5D=items");
    expect(capturedCalls[0]).toContain("include%5B%5D=content_details");
    expect(result).toHaveLength(1);
    expect(result[0].items).toHaveLength(3);
    expect(result[0].items?.[0].type).toBe("File");
  });
});

describe("getModuleItems", () => {
  it("fetches items for a single module when the inline list was truncated", async () => {
    const capturedCalls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      capturedCalls.push(url);
      return jsonResponse([
        { id: 210, title: "Item A", type: "File", position: 1, indent: 0, content_id: 301 },
        { id: 211, title: "Item B", type: "Assignment", position: 2, indent: 0, content_id: 401 },
      ]);
    }) as unknown as typeof fetch;

    const result = await getModuleItems(12, 101);

    expect(capturedCalls[0]).toContain("/api/v1/courses/12/modules/101/items");
    expect(capturedCalls[0]).toContain("include%5B%5D=content_details");
    expect(result).toHaveLength(2);
  });
});
