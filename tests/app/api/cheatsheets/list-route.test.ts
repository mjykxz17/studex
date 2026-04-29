import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/demo-user", () => ({ ensureDemoUser: async () => ({ id: "u1" }) }));

vi.mock("@/lib/supabase-admin", () => ({
  getSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({
                data: [{ id: "cs1", title: "A", status: "complete", course_id: "c1", created_at: "2026-04-30T00:00:00Z", completed_at: null }],
                error: null,
              }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/cheatsheets/route";

describe("GET /api/cheatsheets", () => {
  it("requires course_id query param", async () => {
    const req = new Request("http://localhost/api/cheatsheets");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns cheatsheets for the user + course", async () => {
    const req = new Request("http://localhost/api/cheatsheets?course_id=c1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cheatsheets[0].id).toBe("cs1");
    expect(body.cheatsheets[0].title).toBe("A");
  });
});
