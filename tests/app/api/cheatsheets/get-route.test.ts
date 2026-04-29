import { afterEach, describe, expect, it, vi } from "vitest";

let mockRow: { id: string; user_id: string; title: string; markdown: string; citations: unknown[]; status: string; failure_reason: string | null } | null = {
  id: "cs1",
  user_id: "u1",
  title: "T",
  markdown: "# Hello",
  citations: [],
  status: "complete",
  failure_reason: null,
};

vi.mock("@/lib/demo-user", () => ({
  ensureDemoUser: async () => ({ id: "u1" }),
}));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mockRow, error: null }),
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/cheatsheets/[id]/route";

afterEach(() => {
  // reset to a default owned row for each test
  mockRow = {
    id: "cs1",
    user_id: "u1",
    title: "T",
    markdown: "# Hello",
    citations: [],
    status: "complete",
    failure_reason: null,
  };
});

describe("GET /api/cheatsheets/[id]", () => {
  it("returns the cheatsheet when user owns it", async () => {
    const res = await GET(new Request("http://localhost/api/cheatsheets/cs1"), {
      params: Promise.resolve({ id: "cs1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cheatsheet.id).toBe("cs1");
    expect(body.cheatsheet.markdown).toBe("# Hello");
  });

  it("returns 404 when user does not own the cheatsheet", async () => {
    mockRow = { ...(mockRow as NonNullable<typeof mockRow>), user_id: "OTHER_USER" };
    const res = await GET(new Request("http://localhost/api/cheatsheets/cs1"), {
      params: Promise.resolve({ id: "cs1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the cheatsheet is missing", async () => {
    mockRow = null;
    const res = await GET(new Request("http://localhost/api/cheatsheets/cs1"), {
      params: Promise.resolve({ id: "cs1" }),
    });
    expect(res.status).toBe(404);
  });
});
